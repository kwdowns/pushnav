/*
 * Copyright (C) 2026 Arun Venkataswamy
 *
 * This file is part of PushNav.
 *
 * PushNav is free software: you can redistribute it and/or modify it
 * under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * PushNav is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with PushNav. If not, see <https://www.gnu.org/licenses/>.
 */

/*
 * camera_server.c — Linux V4L2 camera server
 *
 * Self-contained C replacement for camera_server.py.  Captures MJPEG frames
 * from a supported USB camera (see the allowlist below; extendable at runtime
 * via the PUSHNAV_CAMERA_IDS env var) via V4L2 mmap and serves them over TCP
 * using the same binary protocol as the macOS Swift camera server
 * (see specs/start/SPEC_PROTOCOL_CAMERA.md).
 *
 * Build: gcc -Wall -Wextra -O2 -o camera_server camera_server.c -ljpeg
 */

#include <dirent.h>
#include <errno.h>
#include <fcntl.h>
#include <linux/videodev2.h>
#include <linux/uvcvideo.h>
#include <linux/usb/video.h>
#include <poll.h>
#include <signal.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/ioctl.h>
#include <sys/mman.h>
#include <sys/socket.h>
#include <arpa/inet.h>
#include <time.h>
#include <unistd.h>
#include <jpeglib.h>

/* ------------------------------------------------------------------ */
/* Protocol constants                                                  */
/* ------------------------------------------------------------------ */

#define MSG_HELLO         0x00
#define MSG_FRAME         0x01
#define MSG_CONTROL_INFO  0x02
#define MSG_ERROR         0x03
#define MSG_SET_CONTROL   0x11
#define MSG_GET_CONTROLS  0x12

#define HEADER_SIZE       8

/* ------------------------------------------------------------------ */
/* Configuration                                                       */
/* ------------------------------------------------------------------ */

#define NUM_BUFFERS  4
#define SERVER_PORT  8764

/* Capture sizes, in order of preference.  The OV9281 sensor is 1280x800;
 * 1280x720 is a centre crop of it (same pixel scale, so the solver's FOV
 * estimate holds for both), kept for modules that don't offer the full
 * frame.  open_camera() sets capture_w / capture_h to the size it got. */
static const struct { unsigned int w, h; } CAPTURE_SIZES[] = {
    {1280, 800},
    {1280, 720},
};
#define NUM_CAPTURE_SIZES (sizeof(CAPTURE_SIZES) / sizeof(CAPTURE_SIZES[0]))

static unsigned int capture_w = 1280;
static unsigned int capture_h = 800;

/* ------------------------------------------------------------------ */
/* Camera allowlist                                                    */
/*                                                                     */
/* Known OV9281-based USB modules, matched by USB VID/PID.  Keep this  */
/* list in sync with the Windows (camera/windows/camera_server.c) and  */
/* macOS (camera/mac/.../UVCController.swift) servers.                  */
/*                                                                     */
/* Users can register additional cameras at runtime WITHOUT            */
/* recompiling, via the PUSHNAV_CAMERA_IDS env var: a comma-separated  */
/* list of vid:pid hex pairs, e.g. PUSHNAV_CAMERA_IDS=1bcf:2cd1,abc:12 */
/* ------------------------------------------------------------------ */

typedef struct {
    unsigned int vid;
    unsigned int pid;
    const char  *label;
} cam_id_t;

static const cam_id_t BUILTIN_CAMERAS[] = {
    {0x32E6, 0x9251, "Waveshare OV9281"},
    {0x0C45, 0x6366, "Arducam OV9281"},
    {0x1BCF, 0x2CD1, "DECXIN OV9281"},
    {0x0C45, 0x636D, "Innomaker U20CAM-9281M"},
};
#define NUM_BUILTIN_CAMERAS (sizeof(BUILTIN_CAMERAS) / sizeof(BUILTIN_CAMERAS[0]))
#define MAX_EXTRA_CAMERAS   32

static cam_id_t g_allowlist[NUM_BUILTIN_CAMERAS + MAX_EXTRA_CAMERAS];
static int      g_allowlist_count = 0;

static void allowlist_add(unsigned int vid, unsigned int pid, const char *label)
{
    if (g_allowlist_count >= (int)(sizeof(g_allowlist) / sizeof(g_allowlist[0])))
        return;
    for (int i = 0; i < g_allowlist_count; i++)
        if (g_allowlist[i].vid == vid && g_allowlist[i].pid == pid)
            return;  /* skip duplicates */
    g_allowlist[g_allowlist_count].vid = vid;
    g_allowlist[g_allowlist_count].pid = pid;
    g_allowlist[g_allowlist_count].label = label;
    g_allowlist_count++;
}

/* Seed built-ins, then append any PUSHNAV_CAMERA_IDS entries. */
static void init_allowlist(void)
{
    for (size_t i = 0; i < NUM_BUILTIN_CAMERAS; i++)
        allowlist_add(BUILTIN_CAMERAS[i].vid, BUILTIN_CAMERAS[i].pid,
                      BUILTIN_CAMERAS[i].label);

    const char *env = getenv("PUSHNAV_CAMERA_IDS");
    if (env && *env) {
        const char *p = env;
        while (*p) {
            while (*p == ',' || *p == ' ' || *p == ';')
                p++;
            if (!*p)
                break;
            unsigned int vid = 0, pid = 0;
            int n = 0;
            if (sscanf(p, "%x:%x%n", &vid, &pid, &n) == 2 && vid && pid) {
                allowlist_add(vid, pid, "user-configured (PUSHNAV_CAMERA_IDS)");
                p += n;
            } else {
                fprintf(stderr,
                        "Ignoring malformed PUSHNAV_CAMERA_IDS entry near '%s'\n", p);
                while (*p && *p != ',' && *p != ' ' && *p != ';')
                    p++;
            }
        }
    }

    fprintf(stderr, "Camera allowlist (%d entries):\n", g_allowlist_count);
    for (int i = 0; i < g_allowlist_count; i++)
        fprintf(stderr, "  %04X:%04X  %s\n",
                g_allowlist[i].vid, g_allowlist[i].pid, g_allowlist[i].label);
}

static int camera_id_match(unsigned int vid, unsigned int pid)
{
    for (int i = 0; i < g_allowlist_count; i++)
        if (g_allowlist[i].vid == vid && g_allowlist[i].pid == pid)
            return 1;
    return 0;
}

/* ------------------------------------------------------------------ */
/* V4L2 state                                                          */
/* ------------------------------------------------------------------ */

static int cam_fd = -1;
static int use_mjpeg = 1;

struct mmap_buf {
    void  *start;
    size_t length;
};

static struct mmap_buf buffers[NUM_BUFFERS];
static unsigned int n_buffers = 0;

/* Camera model name from sysfs */
static char camera_model[128] = "Unknown";

/* Innomaker U20CAM-9281M: needs the runtime gain / frame-length quirk
 * (see "Innomaker U20CAM-9281M quirk" below). Set by find_device(). */
#define U20_VID 0x0C45
#define U20_PID 0x636D
static int quirk_u20 = 0;

/* Control ranges */
typedef struct {
    int valid;
    int32_t min, max, step, defval, cur;
} ctrl_range_t;

static ctrl_range_t exposure_range;
static ctrl_range_t gain_range;

/* Shutdown flag */
static volatile sig_atomic_t stop_flag = 0;

/* ------------------------------------------------------------------ */
/* Utility: xioctl (retry on EINTR)                                    */
/* ------------------------------------------------------------------ */

static int xioctl(int fd, unsigned long request, void *arg)
{
    int r;
    do {
        r = ioctl(fd, request, arg);
    } while (r == -1 && errno == EINTR);
    return r;
}

/* ------------------------------------------------------------------ */
/* Fatal disconnect: log and exit(1) so the engine respawns us         */
/* ------------------------------------------------------------------ */

static void fatal_disconnect(const char *where) __attribute__((noreturn));
static void fatal_disconnect(const char *where)
{
    fprintf(stderr,
            "Camera disconnected at %s (errno=%d %s) — exiting for engine recovery\n",
            where, errno, strerror(errno));
    exit(1);
}

/* errno values that signal "the V4L2 device is gone" mid-stream. */
static int is_disconnect_errno(int e)
{
    return e == ENODEV || e == EIO || e == ENXIO;
}

/* ------------------------------------------------------------------ */
/* Device discovery via sysfs                                          */
/* ------------------------------------------------------------------ */

static int find_device(char *dev_path, size_t dev_path_len)
{
    DIR *d = opendir("/sys/class/video4linux");
    if (!d)
        return -1;

    char seen[1024];   /* diagnostic: USB video devices we saw but skipped */
    seen[0] = '\0';

    struct dirent *ent;
    while ((ent = readdir(d)) != NULL) {
        if (strncmp(ent->d_name, "video", 5) != 0)
            continue;

        char path[512];

        /* Read idVendor */
        snprintf(path, sizeof(path),
                 "/sys/class/video4linux/%s/device/../idVendor", ent->d_name);
        FILE *f = fopen(path, "r");
        if (!f) continue;
        char vendor[16] = {0};
        if (!fgets(vendor, sizeof(vendor), f)) { fclose(f); continue; }
        fclose(f);

        /* Read idProduct */
        snprintf(path, sizeof(path),
                 "/sys/class/video4linux/%s/device/../idProduct", ent->d_name);
        f = fopen(path, "r");
        if (!f) continue;
        char product[16] = {0};
        if (!fgets(product, sizeof(product), f)) { fclose(f); continue; }
        fclose(f);

        unsigned int vid = 0, pid = 0;
        sscanf(vendor, "%x", &vid);
        sscanf(product, "%x", &pid);

        if (!camera_id_match(vid, pid)) {
            /* Record for the not-found diagnostic, de-duplicated by vid:pid. */
            char token[16];
            snprintf(token, sizeof(token), "%04x:%04x", vid, pid);
            if (!strstr(seen, token) && strlen(seen) + 200 < sizeof(seen)) {
                char name[128] = "";
                snprintf(path, sizeof(path),
                         "/sys/class/video4linux/%s/name", ent->d_name);
                FILE *nf = fopen(path, "r");
                if (nf) {
                    if (fgets(name, sizeof(name), nf)) {
                        size_t l = strlen(name);
                        if (l > 0 && name[l - 1] == '\n')
                            name[l - 1] = '\0';
                    }
                    fclose(nf);
                }
                char line[200];
                snprintf(line, sizeof(line), "  %s  %s\n", token, name);
                strncat(seen, line, sizeof(seen) - strlen(seen) - 1);
            }
            continue;
        }

        {
            char candidate[288];
            snprintf(candidate, sizeof(candidate), "/dev/%s", ent->d_name);

            /* Verify this node supports VIDEO_CAPTURE (skip metadata nodes) */
            int test_fd = open(candidate, O_RDWR);
            if (test_fd < 0)
                continue;
            struct v4l2_capability cap;
            memset(&cap, 0, sizeof(cap));
            if (xioctl(test_fd, VIDIOC_QUERYCAP, &cap) < 0 ||
                !(cap.device_caps & V4L2_CAP_VIDEO_CAPTURE)) {
                close(test_fd);
                continue;
            }
            close(test_fd);

            snprintf(dev_path, dev_path_len, "%s", candidate);
            quirk_u20 = (vid == U20_VID && pid == U20_PID);

            /* Try to read camera model name */
            snprintf(path, sizeof(path),
                     "/sys/class/video4linux/%s/name", ent->d_name);
            f = fopen(path, "r");
            if (f) {
                if (fgets(camera_model, sizeof(camera_model), f)) {
                    /* Strip trailing newline */
                    size_t len = strlen(camera_model);
                    if (len > 0 && camera_model[len - 1] == '\n')
                        camera_model[len - 1] = '\0';
                }
                fclose(f);
            }

            closedir(d);
            fprintf(stderr, "Found camera '%s' at %s\n", camera_model, dev_path);
            return 0;
        }
    }

    closedir(d);
    if (seen[0])
        fprintf(stderr,
                "No allowlisted camera found. USB video devices seen:\n%s", seen);
    else
        fprintf(stderr, "No USB video devices found at all.\n");
    return -1;
}

/* ------------------------------------------------------------------ */
/* Frame-rate pinning                                                  */
/* ------------------------------------------------------------------ */

/* Pin the camera to its LOWEST supported frame rate for the negotiated
 * pixelformat/size.  Max exposure time on a UVC camera is bounded by the
 * frame interval (~1/fps), so faint stars (tens–hundreds of ms integration)
 * need a low fps.  High-fps modules (e.g. the 120 fps Arducam OV9281) would
 * otherwise cap exposure to a few ms and show no stars.  See issue #26.
 *
 * Best-effort: any failure leaves the driver default and we keep streaming.
 * Must run AFTER VIDIOC_S_FMT (interval enumeration is per-format) and BEFORE
 * querying the exposure range (the reported max can depend on the frame rate).
 */
static void set_lowest_fps(uint32_t pixfmt, uint32_t width, uint32_t height)
{
    /* Find the longest frame interval (= lowest fps) the device offers.
     * 0/0 means enumeration produced nothing usable. */
    struct v4l2_fract best = {0, 0};

    struct v4l2_frmivalenum fie;
    memset(&fie, 0, sizeof(fie));
    fie.pixel_format = pixfmt;
    fie.width = width;
    fie.height = height;

    if (xioctl(cam_fd, VIDIOC_ENUM_FRAMEINTERVALS, &fie) == 0) {
        if (fie.type == V4L2_FRMIVAL_TYPE_DISCRETE) {
            do {
                /* interval a/b > c/d  <=>  a*d > c*b  (all values positive) */
                if (best.denominator == 0 ||
                    (uint64_t)fie.discrete.numerator * best.denominator >
                    (uint64_t)best.numerator * fie.discrete.denominator) {
                    best = fie.discrete;
                }
                fie.index++;
            } while (xioctl(cam_fd, VIDIOC_ENUM_FRAMEINTERVALS, &fie) == 0);
        } else {
            /* CONTINUOUS / STEPWISE: .max is the longest interval. */
            best = fie.stepwise.max;
        }
    }

    /* Check the device supports programmable frame timing. */
    struct v4l2_streamparm parm;
    memset(&parm, 0, sizeof(parm));
    parm.type = V4L2_BUF_TYPE_VIDEO_CAPTURE;
    if (xioctl(cam_fd, VIDIOC_G_PARM, &parm) < 0) {
        fprintf(stderr, "VIDIOC_G_PARM unsupported; leaving fps at driver default\n");
        return;
    }
    if (!(parm.parm.capture.capability & V4L2_CAP_TIMEPERFRAME)) {
        fprintf(stderr, "Device cannot set frame rate; leaving fps at driver default\n");
        return;
    }

    /* Fallback if enumeration found nothing: request 5 fps and let the driver
     * clamp to its nearest supported interval. */
    if (best.numerator == 0 || best.denominator == 0) {
        best.numerator = 1;
        best.denominator = 5;
    }

    parm.parm.capture.timeperframe = best;
    if (xioctl(cam_fd, VIDIOC_S_PARM, &parm) < 0) {
        perror("VIDIOC_S_PARM");
        fprintf(stderr, "Could not set frame rate; leaving fps at driver default\n");
        return;
    }

    /* Read back the interval the driver actually applied and log it. */
    memset(&parm, 0, sizeof(parm));
    parm.type = V4L2_BUF_TYPE_VIDEO_CAPTURE;
    if (xioctl(cam_fd, VIDIOC_G_PARM, &parm) == 0) {
        struct v4l2_fract tpf = parm.parm.capture.timeperframe;
        double fps = tpf.numerator ? (double)tpf.denominator / tpf.numerator : 0.0;
        fprintf(stderr, "Frame rate pinned: %u/%u s/frame = %.2f fps\n",
                tpf.numerator, tpf.denominator, fps);
    }
}

/* ------------------------------------------------------------------ */
/* V4L2 capture setup                                                  */
/* ------------------------------------------------------------------ */

/* VIDIOC_S_FMT with the given pixel format and size.  The driver may
 * substitute the nearest size it supports; with exact set, that counts as
 * failure so the caller can try its next preferred size.  Returns 1 on
 * success with the negotiated format in *fmt, 0 otherwise. */
static int set_format(uint32_t pixfmt, unsigned int w, unsigned int h,
                      int exact, struct v4l2_format *fmt)
{
    memset(fmt, 0, sizeof(*fmt));
    fmt->type = V4L2_BUF_TYPE_VIDEO_CAPTURE;
    fmt->fmt.pix.width = w;
    fmt->fmt.pix.height = h;
    fmt->fmt.pix.pixelformat = pixfmt;
    fmt->fmt.pix.field = V4L2_FIELD_NONE;

    if (xioctl(cam_fd, VIDIOC_S_FMT, fmt) < 0)
        return 0;
    if (fmt->fmt.pix.pixelformat != pixfmt)
        return 0;
    if (exact && (fmt->fmt.pix.width != w || fmt->fmt.pix.height != h))
        return 0;
    return 1;
}

static int open_camera(const char *dev_path)
{
    cam_fd = open(dev_path, O_RDWR);
    if (cam_fd < 0) {
        perror("open camera");
        return -1;
    }

    /* MJPEG at each preferred size, then YUYV at each, then whatever size
     * the driver picks nearest to the last preferred size. */
    struct v4l2_format fmt;
    int found = 0;
    use_mjpeg = 1;
    for (size_t i = 0; !found && i < NUM_CAPTURE_SIZES; i++)
        found = set_format(V4L2_PIX_FMT_MJPEG, CAPTURE_SIZES[i].w,
                           CAPTURE_SIZES[i].h, 1, &fmt);
    if (!found) {
        use_mjpeg = 0;
        for (size_t i = 0; !found && i < NUM_CAPTURE_SIZES; i++)
            found = set_format(V4L2_PIX_FMT_YUYV, CAPTURE_SIZES[i].w,
                               CAPTURE_SIZES[i].h, 1, &fmt);
    }
    if (!found) {
        const unsigned int w = CAPTURE_SIZES[NUM_CAPTURE_SIZES - 1].w;
        const unsigned int h = CAPTURE_SIZES[NUM_CAPTURE_SIZES - 1].h;
        use_mjpeg = 1;
        found = set_format(V4L2_PIX_FMT_MJPEG, w, h, 0, &fmt);
        if (!found) {
            use_mjpeg = 0;
            found = set_format(V4L2_PIX_FMT_YUYV, w, h, 0, &fmt);
        }
    }
    if (!found) {
        perror("VIDIOC_S_FMT (YUYV)");
        close(cam_fd);
        cam_fd = -1;
        return -1;
    }
    capture_w = fmt.fmt.pix.width;
    capture_h = fmt.fmt.pix.height;
    if (use_mjpeg)
        fprintf(stderr, "Using MJPEG capture %ux%u\n", capture_w, capture_h);
    else
        fprintf(stderr, "MJPEG not available, using YUYV capture %ux%u\n",
                capture_w, capture_h);

    /* Pin the lowest fps for max exposure headroom (issue #26).  Must run
     * after S_FMT (per-format enumeration) and before exposure is queried. */
    set_lowest_fps(fmt.fmt.pix.pixelformat, fmt.fmt.pix.width, fmt.fmt.pix.height);

    /* Request mmap buffers */
    struct v4l2_requestbuffers req;
    memset(&req, 0, sizeof(req));
    req.count = NUM_BUFFERS;
    req.type = V4L2_BUF_TYPE_VIDEO_CAPTURE;
    req.memory = V4L2_MEMORY_MMAP;

    if (xioctl(cam_fd, VIDIOC_REQBUFS, &req) < 0) {
        perror("VIDIOC_REQBUFS");
        close(cam_fd);
        cam_fd = -1;
        return -1;
    }
    n_buffers = req.count;
    if (n_buffers > NUM_BUFFERS)
        n_buffers = NUM_BUFFERS;

    /* mmap each buffer */
    for (unsigned int i = 0; i < n_buffers; i++) {
        struct v4l2_buffer buf;
        memset(&buf, 0, sizeof(buf));
        buf.type = V4L2_BUF_TYPE_VIDEO_CAPTURE;
        buf.memory = V4L2_MEMORY_MMAP;
        buf.index = i;

        if (xioctl(cam_fd, VIDIOC_QUERYBUF, &buf) < 0) {
            perror("VIDIOC_QUERYBUF");
            close(cam_fd);
            cam_fd = -1;
            return -1;
        }

        buffers[i].length = buf.length;
        buffers[i].start = mmap(NULL, buf.length,
                                PROT_READ | PROT_WRITE, MAP_SHARED,
                                cam_fd, buf.m.offset);
        if (buffers[i].start == MAP_FAILED) {
            perror("mmap");
            close(cam_fd);
            cam_fd = -1;
            return -1;
        }
    }

    /* Queue all buffers */
    for (unsigned int i = 0; i < n_buffers; i++) {
        struct v4l2_buffer buf;
        memset(&buf, 0, sizeof(buf));
        buf.type = V4L2_BUF_TYPE_VIDEO_CAPTURE;
        buf.memory = V4L2_MEMORY_MMAP;
        buf.index = i;

        if (xioctl(cam_fd, VIDIOC_QBUF, &buf) < 0) {
            perror("VIDIOC_QBUF");
            return -1;
        }
    }

    /* Start streaming */
    enum v4l2_buf_type type = V4L2_BUF_TYPE_VIDEO_CAPTURE;
    if (xioctl(cam_fd, VIDIOC_STREAMON, &type) < 0) {
        perror("VIDIOC_STREAMON");
        return -1;
    }

    return 0;
}

/* ------------------------------------------------------------------ */
/* V4L2 cleanup                                                        */
/* ------------------------------------------------------------------ */

static void close_camera(void)
{
    if (cam_fd < 0) return;

    enum v4l2_buf_type type = V4L2_BUF_TYPE_VIDEO_CAPTURE;
    xioctl(cam_fd, VIDIOC_STREAMOFF, &type);

    for (unsigned int i = 0; i < n_buffers; i++) {
        if (buffers[i].start && buffers[i].start != MAP_FAILED)
            munmap(buffers[i].start, buffers[i].length);
    }

    close(cam_fd);
    cam_fd = -1;
}

/* ------------------------------------------------------------------ */
/* V4L2 controls                                                       */
/* ------------------------------------------------------------------ */

static int v4l2_get_control(int ctrl_id, int32_t *value)
{
    struct v4l2_control ctrl;
    memset(&ctrl, 0, sizeof(ctrl));
    ctrl.id = ctrl_id;
    if (xioctl(cam_fd, VIDIOC_G_CTRL, &ctrl) < 0)
        return -1;
    *value = ctrl.value;
    return 0;
}

static int v4l2_set_control(int ctrl_id, int32_t value)
{
    struct v4l2_control ctrl;
    memset(&ctrl, 0, sizeof(ctrl));
    ctrl.id = ctrl_id;
    ctrl.value = value;
    if (xioctl(cam_fd, VIDIOC_S_CTRL, &ctrl) < 0)
        return -1;
    return 0;
}

/* ------------------------------------------------------------------ */
/* Innomaker U20CAM-9281M quirk (0C45:636D)                            */
/*                                                                     */
/* Same as the Windows server (camera/windows/camera_server.c has the  */
/* full explanation): the Sonix SN9C286 firmware never sends the UVC   */
/* gain to the OV9281 and caps exposure at one stock frame. Through    */
/* the vendor extension unit (unit 3, selector 1 = XDATA read/write):  */
/*  - gain: write RAM 0x08F0:0x08F1 = gain x 512 (big-endian); the     */
/*    firmware resets it on each exposure change, so u20_maintain()    */
/*    re-applies it;                                                   */
/*  - exposure: raise the sensor frame length (VTS, 0x380E/0x380F) to  */
/*    the firmware's exposure lines (RAM 0x0C41:0x0C42) via the        */
/*    bridge's I2C controller (0x8600). Real exposure is ~2x the UVC   */
/*    value, reported as display_scale 2.                              */
/* Volatile: unplugging restores stock. NEVER write 0x8E00-0x8EFF (SPI */
/* flash controller) or use the flash selector (3).                    */
/* ------------------------------------------------------------------ */

#define U20_XU_UNIT     3
#define U20_XU_SEL      1
#define U20_GAIN_MIN    10      /* gain control unit: tenths of x (1.0x)  */
#define U20_GAIN_MAX    155     /* 15.5x                                  */
#define U20_GAIN_STOCK  20      /* firmware default, 2.0x                 */
#define U20_VTS_STOCK   910
#define U20_VTS_MARGIN  32
#define U20_VTS_MAX     9200    /* ~1.0 s frames, under the 2 s watchdog  */
#define U20_TICK_MS     500
#define U20_VTS_REFRESH 20      /* re-send VTS every 10 s (no read-back)  */

static int      u20_gain = U20_GAIN_STOCK;
static unsigned u20_vts = 0;           /* last frame length written; 0 = none */
static int      u20_vts_repeat = 0;    /* write once more: no read-back */
static int      u20_vts_ticks = 0;     /* ticks since VTS was last written */
static long     u20_last_tick = 0;

static long now_ms(void)
{
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return ts.tv_sec * 1000L + ts.tv_nsec / 1000000L;
}

/* One 4-byte transfer on extension-unit selector 1. */
static int u20_xu(int set, unsigned char d[4])
{
    struct uvc_xu_control_query q;
    memset(&q, 0, sizeof(q));
    q.unit = U20_XU_UNIT;
    q.selector = U20_XU_SEL;
    q.query = set ? UVC_SET_CUR : UVC_GET_CUR;
    q.size = 4;
    q.data = d;
    return xioctl(cam_fd, UVCIOC_CTRL_QUERY, &q) < 0 ? -1 : 0;
}

/* XDATA read: SET [lo, hi, 0, 0xFF] latches the address, GET returns
 * [lo, hi, value, 0]. Returns 0..255, or -1 on error. */
static int u20_read(unsigned addr)
{
    unsigned char d[4] = { (unsigned char)(addr & 0xFF), (unsigned char)(addr >> 8),
                           0x00, 0xFF };
    if (u20_xu(1, d) < 0) return -1;
    memset(d, 0, sizeof(d));
    if (u20_xu(0, d) < 0) return -1;
    if (d[0] != (unsigned char)(addr & 0xFF) || d[1] != (unsigned char)(addr >> 8))
        return -1;
    return d[2];
}

static int u20_write_allowed(unsigned addr)
{
    return addr == 0x08F0 || addr == 0x08F1             /* gain (firmware RAM) */
        || (addr >= 0x8602 && addr <= 0x8604)           /* I2C data            */
        || addr == 0x860A;                              /* I2C command         */
}

/* XDATA write: SET [lo, hi, value, 0x00]. */
static int u20_write(unsigned addr, int val)
{
    if (!u20_write_allowed(addr)) return -1;
    unsigned char d[4] = { (unsigned char)(addr & 0xFF), (unsigned char)(addr >> 8),
                           (unsigned char)val, 0x00 };
    return u20_xu(1, d);
}

/* Write one OV9281 register through the bridge's I2C controller, then
 * check its data registers still hold our bytes (the firmware shares the
 * controller) and retry if not. */
static int u20_sensor_write(unsigned reg, int val)
{
    for (int attempt = 0; attempt < 3; attempt++) {
        if (u20_write(0x8602, (int)(reg >> 8)) < 0 ||
            u20_write(0x8603, (int)(reg & 0xFF)) < 0 ||
            u20_write(0x8604, val & 0xFF) < 0 ||
            u20_write(0x860A, 0x51) < 0)       /* (3-1)<<5 | STOP | START */
            return -1;
        int done = 0;
        for (int t = 0; t < 20 && !done; t++) {
            int cmd = u20_read(0x860A), st = u20_read(0x8600);
            done = cmd >= 0 && !(cmd & 0x01) && st >= 0 && (st & 0x40) && !(st & 0x80);
        }
        if (done &&
            u20_read(0x8602) == (int)(reg >> 8) &&
            u20_read(0x8603) == (int)(reg & 0xFF) &&
            u20_read(0x8604) == (val & 0xFF))
            return 0;
    }
    return -1;
}

static unsigned u20_gain_word(int x10)
{
    return (unsigned)((x10 * 512 + 5) / 10);    /* 10 -> 0x0200 (1x) */
}

static int u20_apply_gain(void)
{
    unsigned w = u20_gain_word(u20_gain);
    if (u20_write(0x08F0, (int)(w >> 8)) < 0 || u20_write(0x08F1, (int)(w & 0xFF)) < 0)
        return -1;
    return 0;
}

/* Called from the stream loop; does its work every U20_TICK_MS. */
static void u20_maintain(void)
{
    long now = now_ms();
    if (!quirk_u20 || now - u20_last_tick < U20_TICK_MS)
        return;
    u20_last_tick = now;

    int hi = u20_read(0x08F0), lo = u20_read(0x08F1);
    if (hi >= 0 && lo >= 0 && (unsigned)((hi << 8) | lo) != u20_gain_word(u20_gain))
        u20_apply_gain();

    hi = u20_read(0x0C41);
    lo = u20_read(0x0C42);
    if (hi < 0 || lo < 0)
        return;
    unsigned lines = (unsigned)((hi << 8) | lo);
    unsigned vts = lines + U20_VTS_MARGIN;
    if (vts < U20_VTS_STOCK) vts = U20_VTS_STOCK;
    if (vts > U20_VTS_MAX) vts = U20_VTS_MAX;
    u20_vts_ticks++;
    if (vts == u20_vts && !u20_vts_repeat && u20_vts_ticks < U20_VTS_REFRESH)
        return;
    if (u20_sensor_write(0x380E, (int)(vts >> 8)) == 0 &&
        u20_sensor_write(0x380F, (int)(vts & 0xFF)) == 0) {
        if (vts != u20_vts)
            fprintf(stderr, "U20CAM: frame length %u lines (exposure %u lines)\n",
                    vts, lines);
        u20_vts_repeat = (vts != u20_vts);
        u20_vts = vts;
        u20_vts_ticks = 0;
    }
}

/* After open_camera(): check the extension unit answers, or fall back. */
static void u20_init(void)
{
    if (!quirk_u20)
        return;
    if (u20_read(0x08F0) < 0) {
        fprintf(stderr, "U20CAM: extension unit not reachable (%s), using stock controls\n",
                strerror(errno));
        quirk_u20 = 0;
        return;
    }
    fprintf(stderr, "U20CAM quirk active: gain %d..%d (x0.1), frame length follows "
            "exposure (max %d lines)\n", U20_GAIN_MIN, U20_GAIN_MAX, U20_VTS_MAX);
}

static void query_control(uint32_t ctrl_id, ctrl_range_t *out)
{
    memset(out, 0, sizeof(*out));
    struct v4l2_queryctrl qctrl;
    memset(&qctrl, 0, sizeof(qctrl));
    qctrl.id = ctrl_id;

    if (xioctl(cam_fd, VIDIOC_QUERYCTRL, &qctrl) < 0) {
        out->valid = 0;
        return;
    }
    out->valid = 1;
    out->min = qctrl.minimum;
    out->max = qctrl.maximum;
    out->step = qctrl.step;
    out->defval = qctrl.default_value;

    int32_t cur;
    if (v4l2_get_control(ctrl_id, &cur) == 0)
        out->cur = cur;
    else
        out->cur = qctrl.default_value;
}

static void probe_controls(void)
{
    query_control(V4L2_CID_EXPOSURE_ABSOLUTE, &exposure_range);
    query_control(V4L2_CID_GAIN, &gain_range);
    if (quirk_u20) {
        gain_range.valid = 1;
        gain_range.min = U20_GAIN_MIN;
        gain_range.max = U20_GAIN_MAX;
        gain_range.step = 1;
        gain_range.defval = U20_GAIN_STOCK;
        gain_range.cur = u20_gain;
    }
    fprintf(stderr, "Exposure range: valid=%d min=%d max=%d step=%d cur=%d\n",
            exposure_range.valid, exposure_range.min, exposure_range.max,
            exposure_range.step, exposure_range.cur);
    fprintf(stderr, "Gain range: valid=%d min=%d max=%d step=%d cur=%d\n",
            gain_range.valid, gain_range.min, gain_range.max,
            gain_range.step, gain_range.cur);
}

/* ------------------------------------------------------------------ */
/* YUYV → JPEG conversion (libjpeg)                                    */
/* ------------------------------------------------------------------ */

static unsigned char *jpeg_buf = NULL;
static unsigned long  jpeg_buf_size = 0;

static int yuyv_to_jpeg(const void *yuyv_data, size_t yuyv_len,
                         unsigned char **out_jpeg, unsigned long *out_len)
{
    (void)yuyv_len;
    struct jpeg_compress_struct cinfo;
    struct jpeg_error_mgr jerr;

    cinfo.err = jpeg_std_error(&jerr);
    jpeg_create_compress(&cinfo);

    /* Output to memory */
    jpeg_buf = NULL;
    jpeg_buf_size = 0;
    jpeg_mem_dest(&cinfo, &jpeg_buf, &jpeg_buf_size);

    cinfo.image_width = capture_w;
    cinfo.image_height = capture_h;
    cinfo.input_components = 3;
    cinfo.in_color_space = JCS_YCbCr;

    jpeg_set_defaults(&cinfo);
    jpeg_set_quality(&cinfo, 85, TRUE);
    jpeg_start_compress(&cinfo, TRUE);

    /* Convert YUYV → YCbCr row by row */
    unsigned char *row = malloc((size_t)capture_w * 3);
    if (!row) {
        jpeg_destroy_compress(&cinfo);
        return -1;
    }

    const unsigned char *src = (const unsigned char *)yuyv_data;
    while (cinfo.next_scanline < cinfo.image_height) {
        const unsigned char *line = src + cinfo.next_scanline * capture_w * 2;
        for (unsigned int x = 0; x < capture_w; x += 2) {
            int idx = x * 2;
            unsigned char y0 = line[idx + 0];
            unsigned char cb = line[idx + 1];
            unsigned char y1 = line[idx + 2];
            unsigned char cr = line[idx + 3];
            row[x * 3 + 0] = y0;
            row[x * 3 + 1] = cb;
            row[x * 3 + 2] = cr;
            row[(x + 1) * 3 + 0] = y1;
            row[(x + 1) * 3 + 1] = cb;
            row[(x + 1) * 3 + 2] = cr;
        }
        unsigned char *row_ptr = row;
        jpeg_write_scanlines(&cinfo, &row_ptr, 1);
    }

    free(row);
    jpeg_finish_compress(&cinfo);
    jpeg_destroy_compress(&cinfo);

    *out_jpeg = jpeg_buf;
    *out_len = jpeg_buf_size;
    return 0;
}

/* ------------------------------------------------------------------ */
/* Frame capture                                                       */
/* ------------------------------------------------------------------ */

/* Returns JPEG data in *out_data, length in *out_len.
 * For MJPEG: points into mmap buffer (caller must QBUF after use).
 * For YUYV:  allocates via libjpeg (caller must free via free()).
 * Returns buf.index on success, -1 on failure.
 */
static int capture_frame(const unsigned char **out_data, size_t *out_len,
                         int *is_allocated)
{
    struct v4l2_buffer buf;
    memset(&buf, 0, sizeof(buf));
    buf.type = V4L2_BUF_TYPE_VIDEO_CAPTURE;
    buf.memory = V4L2_MEMORY_MMAP;

    if (xioctl(cam_fd, VIDIOC_DQBUF, &buf) < 0) {
        if (errno == EAGAIN)
            return -1;
        if (is_disconnect_errno(errno))
            fatal_disconnect("VIDIOC_DQBUF");
        perror("VIDIOC_DQBUF");
        return -1;
    }

    if (use_mjpeg) {
        *out_data = buffers[buf.index].start;
        *out_len = buf.bytesused;
        *is_allocated = 0;
    } else {
        unsigned char *jpeg_data = NULL;
        unsigned long jpeg_len = 0;
        if (yuyv_to_jpeg(buffers[buf.index].start, buf.bytesused,
                         &jpeg_data, &jpeg_len) < 0) {
            /* Re-queue and report failure */
            if (xioctl(cam_fd, VIDIOC_QBUF, &buf) < 0
                && is_disconnect_errno(errno))
                fatal_disconnect("VIDIOC_QBUF (yuyv re-queue)");
            return -1;
        }
        *out_data = jpeg_data;
        *out_len = jpeg_len;
        *is_allocated = 1;
    }

    return (int)buf.index;
}

static void requeue_buffer(int index)
{
    struct v4l2_buffer buf;
    memset(&buf, 0, sizeof(buf));
    buf.type = V4L2_BUF_TYPE_VIDEO_CAPTURE;
    buf.memory = V4L2_MEMORY_MMAP;
    buf.index = (unsigned int)index;
    if (xioctl(cam_fd, VIDIOC_QBUF, &buf) < 0 && is_disconnect_errno(errno))
        fatal_disconnect("VIDIOC_QBUF (requeue)");
}

/* ------------------------------------------------------------------ */
/* TCP helpers                                                         */
/* ------------------------------------------------------------------ */

static int send_all(int fd, const void *data, size_t len)
{
    const unsigned char *p = data;
    size_t remaining = len;
    while (remaining > 0) {
        ssize_t n = send(fd, p, remaining, MSG_NOSIGNAL);
        if (n <= 0)
            return -1;
        p += n;
        remaining -= (size_t)n;
    }
    return 0;
}

static int recv_exact(int fd, void *buf, size_t len)
{
    unsigned char *p = buf;
    size_t remaining = len;
    while (remaining > 0) {
        ssize_t n = recv(fd, p, remaining, 0);
        if (n <= 0)
            return -1;
        p += n;
        remaining -= (size_t)n;
    }
    return 0;
}

static int send_message(int client_fd, uint32_t type, const void *payload,
                        uint32_t length)
{
    uint8_t header[HEADER_SIZE];
    /* Little-endian encoding */
    header[0] = (uint8_t)(type);
    header[1] = (uint8_t)(type >> 8);
    header[2] = (uint8_t)(type >> 16);
    header[3] = (uint8_t)(type >> 24);
    header[4] = (uint8_t)(length);
    header[5] = (uint8_t)(length >> 8);
    header[6] = (uint8_t)(length >> 16);
    header[7] = (uint8_t)(length >> 24);

    if (send_all(client_fd, header, HEADER_SIZE) < 0)
        return -1;
    if (length > 0 && send_all(client_fd, payload, length) < 0)
        return -1;
    return 0;
}

static int send_json_message(int client_fd, uint32_t type, const char *json)
{
    return send_message(client_fd, type, json, (uint32_t)strlen(json));
}

static int read_message(int client_fd, uint32_t *type, unsigned char **payload,
                        uint32_t *length)
{
    uint8_t header[HEADER_SIZE];
    if (recv_exact(client_fd, header, HEADER_SIZE) < 0)
        return -1;

    *type = (uint32_t)header[0]
          | ((uint32_t)header[1] << 8)
          | ((uint32_t)header[2] << 16)
          | ((uint32_t)header[3] << 24);
    *length = (uint32_t)header[4]
            | ((uint32_t)header[5] << 8)
            | ((uint32_t)header[6] << 16)
            | ((uint32_t)header[7] << 24);

    if (*length == 0) {
        *payload = NULL;
        return 0;
    }

    /* Sanity limit: 16 MB */
    if (*length > 16 * 1024 * 1024) {
        fprintf(stderr, "Message too large: %u bytes\n", *length);
        return -1;
    }

    *payload = malloc(*length);
    if (!*payload)
        return -1;

    if (recv_exact(client_fd, *payload, *length) < 0) {
        free(*payload);
        *payload = NULL;
        return -1;
    }
    return 0;
}

/* ------------------------------------------------------------------ */
/* JSON builders (no library — snprintf)                               */
/* ------------------------------------------------------------------ */

/* Escape a string for JSON (handles basic cases) */
static void json_escape(char *dst, size_t dst_len, const char *src)
{
    size_t di = 0;
    for (size_t si = 0; src[si] && di + 2 < dst_len; si++) {
        char c = src[si];
        if (c == '"' || c == '\\') {
            dst[di++] = '\\';
        }
        dst[di++] = c;
    }
    dst[di] = '\0';
}

static void build_hello_json(char *buf, size_t buflen)
{
    char escaped_model[256];
    json_escape(escaped_model, sizeof(escaped_model), camera_model);
    snprintf(buf, buflen,
        "{\"protocol_version\":1,"
        "\"backend\":\"linux-v4l2\","
        "\"backend_version\":\"0.1.0\","
        "\"camera_model\":\"%s\","
        "\"stream_format\":\"MJPEG\","
        "\"default_width\":%u,"
        "\"default_height\":%u,"
        "\"default_fps\":30}",
        escaped_model, capture_w, capture_h);
}

static void build_control_info_json(char *buf, size_t buflen)
{
    /* Re-read current values */
    int32_t exp_cur = exposure_range.cur;
    int32_t gain_cur = gain_range.cur;
    if (exposure_range.valid)
        v4l2_get_control(V4L2_CID_EXPOSURE_ABSOLUTE, &exp_cur);
    if (quirk_u20)
        gain_cur = u20_gain;
    else if (gain_range.valid)
        v4l2_get_control(V4L2_CID_GAIN, &gain_cur);

    /* Build controls array */
    char controls[1024] = "";
    int pos = 0;
    int first = 1;

    if (exposure_range.valid) {
        pos += snprintf(controls + pos, sizeof(controls) - (size_t)pos,
            "{\"id\":\"exposure\","
            "\"label\":\"Exposure\","
            "\"type\":\"int\","
            "\"min\":%d,\"max\":%d,\"step\":%d,\"cur\":%d,"
            "\"unit\":\"100us\"%s}",
            exposure_range.min, exposure_range.max,
            exposure_range.step, exp_cur,
            quirk_u20 ? ",\"display_scale\":2" : "");  /* U20CAM: real ~2x */
        first = 0;
    }
    if (gain_range.valid) {
        if (!first)
            pos += snprintf(controls + pos, sizeof(controls) - (size_t)pos, ",");
        pos += snprintf(controls + pos, sizeof(controls) - (size_t)pos,
            "{\"id\":\"gain\","
            "\"label\":\"Gain\","
            "\"type\":\"int\","
            "\"min\":%d,\"max\":%d,\"step\":%d,\"cur\":%d,"
            "\"unit\":\"%s\"}",
            gain_range.min, gain_range.max,
            gain_range.step, gain_cur,
            quirk_u20 ? "x10" : "raw");   /* x10: tenths of x (real gain) */
    }

    snprintf(buf, buflen, "{\"controls\":[%s]}", controls);
}

/* ------------------------------------------------------------------ */
/* JSON parsing (minimal — strstr + sscanf)                            */
/* ------------------------------------------------------------------ */

/* Parse SET_CONTROL: {"id":"exposure","value":250}
 * Writes control name into id_out and value into value_out.
 * Returns 0 on success. */
static int parse_set_control(const char *json, char *id_out, size_t id_len,
                             int32_t *value_out)
{
    /* Find "id" */
    const char *p = strstr(json, "\"id\"");
    if (!p) return -1;
    p = strchr(p + 4, '"');
    if (!p) return -1;
    p++; /* skip opening quote */
    const char *end = strchr(p, '"');
    if (!end) return -1;
    size_t len = (size_t)(end - p);
    if (len >= id_len) len = id_len - 1;
    memcpy(id_out, p, len);
    id_out[len] = '\0';

    /* Find "value" */
    p = strstr(json, "\"value\"");
    if (!p) return -1;
    p = strchr(p + 7, ':');
    if (!p) return -1;
    p++; /* skip colon */
    while (*p == ' ' || *p == '\t') p++;
    if (sscanf(p, "%d", value_out) != 1)
        return -1;

    return 0;
}

/* ------------------------------------------------------------------ */
/* Command handling                                                    */
/* ------------------------------------------------------------------ */

static void apply_set_control(const char *id, int32_t value)
{
    if (strcmp(id, "exposure") == 0) {
        v4l2_set_control(V4L2_CID_EXPOSURE_ABSOLUTE, value);
        fprintf(stderr, "Set exposure = %d\n", value);
    } else if (strcmp(id, "gain") == 0) {
        if (quirk_u20) {
            if (value < U20_GAIN_MIN) value = U20_GAIN_MIN;
            if (value > U20_GAIN_MAX) value = U20_GAIN_MAX;
            u20_gain = value;
            u20_apply_gain();
        } else {
            v4l2_set_control(V4L2_CID_GAIN, value);
        }
        fprintf(stderr, "Set gain = %d\n", value);
    } else {
        fprintf(stderr, "Unknown control: %s\n", id);
    }
}

static void poll_commands(int client_fd)
{
    struct pollfd pfd;
    pfd.fd = client_fd;
    pfd.events = POLLIN;

    int ret = poll(&pfd, 1, 0);
    if (ret <= 0 || !(pfd.revents & POLLIN))
        return;

    uint32_t msg_type;
    unsigned char *payload = NULL;
    uint32_t length;

    if (read_message(client_fd, &msg_type, &payload, &length) < 0)
        return;

    if (msg_type == MSG_SET_CONTROL && payload) {
        /* Null-terminate for parsing */
        char *json = malloc(length + 1);
        if (json) {
            memcpy(json, payload, length);
            json[length] = '\0';

            char id[64];
            int32_t value;
            if (parse_set_control(json, id, sizeof(id), &value) == 0) {
                apply_set_control(id, value);
                char info[1024];
                build_control_info_json(info, sizeof(info));
                send_json_message(client_fd, MSG_CONTROL_INFO, info);
            }
            free(json);
        }
    } else if (msg_type == MSG_GET_CONTROLS) {
        char info[1024];
        build_control_info_json(info, sizeof(info));
        send_json_message(client_fd, MSG_CONTROL_INFO, info);
    } else {
        fprintf(stderr, "Ignoring message type 0x%02x\n", msg_type);
    }

    free(payload);
}

/* ------------------------------------------------------------------ */
/* Client handling                                                     */
/* ------------------------------------------------------------------ */

static void handle_client(int client_fd)
{
    /* Probe controls */
    probe_controls();

    /* Send HELLO */
    char hello[512];
    build_hello_json(hello, sizeof(hello));
    if (send_json_message(client_fd, MSG_HELLO, hello) < 0) {
        fprintf(stderr, "Failed to send HELLO\n");
        return;
    }

    /* Wait for client HELLO */
    uint32_t msg_type;
    unsigned char *payload = NULL;
    uint32_t length;
    if (read_message(client_fd, &msg_type, &payload, &length) < 0) {
        fprintf(stderr, "Failed to read client HELLO\n");
        free(payload);
        return;
    }
    if (msg_type != MSG_HELLO) {
        fprintf(stderr, "Expected HELLO from client, got 0x%02x\n", msg_type);
        free(payload);
        return;
    }
    free(payload);

    /* Send CONTROL_INFO */
    char info[1024];
    build_control_info_json(info, sizeof(info));
    if (send_json_message(client_fd, MSG_CONTROL_INFO, info) < 0) {
        fprintf(stderr, "Failed to send CONTROL_INFO\n");
        return;
    }

    /* Stream loop */
    while (!stop_flag) {
        /* Wait for camera frame readiness */
        struct pollfd cam_poll;
        cam_poll.fd = cam_fd;
        cam_poll.events = POLLIN;
        int pr = poll(&cam_poll, 1, 100);
        if (pr < 0) {
            if (errno == EINTR)
                continue;
            fatal_disconnect("camera poll()");
        }
        if (cam_poll.revents & (POLLERR | POLLHUP | POLLNVAL))
            fatal_disconnect("camera fd POLLERR/POLLHUP/POLLNVAL");
        if (pr == 0) {
            /* No frame yet (long exposures run at ~1 fps): still serve
             * commands and the U20CAM upkeep between frames. */
            poll_commands(client_fd);
            u20_maintain();
            continue;
        }

        const unsigned char *frame_data;
        size_t frame_len;
        int is_allocated;
        int buf_index = capture_frame(&frame_data, &frame_len, &is_allocated);
        if (buf_index < 0)
            continue;

        if (send_message(client_fd, MSG_FRAME, frame_data, (uint32_t)frame_len) < 0) {
            if (is_allocated)
                free((void *)frame_data);
            else
                requeue_buffer(buf_index);
            fprintf(stderr, "Client disconnected (send failed)\n");
            return;
        }

        if (is_allocated)
            free((void *)frame_data);
        else
            requeue_buffer(buf_index);

        /* Poll for incoming commands between frames */
        poll_commands(client_fd);

        /* U20CAM: re-apply gain, fit the frame length to the exposure */
        u20_maintain();
    }
}

/* ------------------------------------------------------------------ */
/* Signal handler                                                      */
/* ------------------------------------------------------------------ */

static void signal_handler(int sig)
{
    (void)sig;
    stop_flag = 1;
}

/* ------------------------------------------------------------------ */
/* main                                                                */
/* ------------------------------------------------------------------ */

int main(void)
{
    /* Install signal handlers */
    struct sigaction sa;
    memset(&sa, 0, sizeof(sa));
    sa.sa_handler = signal_handler;
    sigaction(SIGTERM, &sa, NULL);
    sigaction(SIGINT, &sa, NULL);

    /* Ignore SIGPIPE (handle send errors via return codes) */
    signal(SIGPIPE, SIG_IGN);

    /* Build the camera allowlist (built-ins + PUSHNAV_CAMERA_IDS) */
    init_allowlist();

    /* Find camera device */
    char dev_path[288];
    if (find_device(dev_path, sizeof(dev_path)) < 0) {
        fprintf(stderr,
                "No allowlisted V4L2 camera found. Check the USB connection, that "
                "the user is in the 'video' group, and — if this is a new camera "
                "model — add its vid:pid to PUSHNAV_CAMERA_IDS.\n");
        return 1;
    }

    /* Open and start capture */
    if (open_camera(dev_path) < 0) {
        fprintf(stderr, "Failed to open camera\n");
        return 1;
    }

    /* Disable auto-exposure for manual control */
    v4l2_set_control(V4L2_CID_EXPOSURE_AUTO, V4L2_EXPOSURE_MANUAL);

    /* Innomaker U20CAM-9281M: real gain and longer exposures */
    u20_init();

    /* Create TCP server */
    int server_fd = socket(AF_INET, SOCK_STREAM, 0);
    if (server_fd < 0) {
        perror("socket");
        close_camera();
        return 1;
    }

    int opt = 1;
    setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));

    struct sockaddr_in addr;
    memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    addr.sin_port = htons(SERVER_PORT);

    if (bind(server_fd, (struct sockaddr *)&addr, sizeof(addr)) < 0) {
        perror("bind");
        close(server_fd);
        close_camera();
        return 1;
    }

    if (listen(server_fd, 1) < 0) {
        perror("listen");
        close(server_fd);
        close_camera();
        return 1;
    }

    printf("Listening on 127.0.0.1:%d\n", SERVER_PORT);
    fflush(stdout);

    /* Accept one client */
    while (!stop_flag) {
        struct pollfd pfd;
        pfd.fd = server_fd;
        pfd.events = POLLIN;

        int ret = poll(&pfd, 1, 1000);
        if (ret <= 0)
            continue;

        struct sockaddr_in client_addr;
        socklen_t client_len = sizeof(client_addr);
        int client_fd = accept(server_fd, (struct sockaddr *)&client_addr,
                               &client_len);
        if (client_fd < 0) {
            if (errno == EINTR)
                continue;
            perror("accept");
            break;
        }

        fprintf(stderr, "Client connected from %s:%d\n",
                inet_ntoa(client_addr.sin_addr), ntohs(client_addr.sin_port));

        handle_client(client_fd);
        close(client_fd);
        break; /* Single client, exit after disconnect */
    }

    close(server_fd);
    close_camera();
    fprintf(stderr, "Camera server exiting\n");
    return 0;
}
