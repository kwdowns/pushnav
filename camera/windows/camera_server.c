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
 * camera_server.c — Windows DirectShow camera server
 *
 * Self-contained C implementation that captures MJPEG frames from a
 * supported USB camera (see the allowlist below; extendable at runtime via
 * the PUSHNAV_CAMERA_IDS env var) over DirectShow and serves them over
 * TCP using the same binary protocol as the macOS Swift and Linux V4L2
 * camera servers (see specs/start/SPEC_PROTOCOL_CAMERA.md).
 *
 * Build (from VS Developer Command Prompt):
 *   cl.exe /W4 /O2 /Fe:camera_server.exe camera_server.c ^
 *       ws2_32.lib ole32.lib oleaut32.lib strmiids.lib uuid.lib
 *
 * For YUYV fallback with libjpeg-turbo, also link jpeg.lib and add
 * the include/lib paths for your libjpeg-turbo installation.
 */

#define _CRT_SECURE_NO_WARNINGS
#define COBJMACROS
#define WIN32_LEAN_AND_MEAN

#include <winsock2.h>
#include <ws2tcpip.h>
#include <windows.h>
#include <dshow.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/* Link libraries via pragmas so a simple cl.exe invocation works */
#pragma comment(lib, "ws2_32.lib")
#pragma comment(lib, "ole32.lib")
#pragma comment(lib, "oleaut32.lib")
#pragma comment(lib, "strmiids.lib")
#pragma comment(lib, "uuid.lib")

/* ------------------------------------------------------------------ */
/* ISampleGrabber definitions                                          */
/* ISampleGrabber was removed from modern Windows SDKs (qedit.h) but  */
/* the COM interface is still present in qedit.dll on all Windows     */
/* versions.  We define the minimal interface here.                    */
/* ------------------------------------------------------------------ */

/* {6B652FFF-11FE-4fce-92AD-0266B5D7C78F} */
static const GUID CLSID_SampleGrabber =
    {0xC1F400A0, 0x3F08, 0x11D3,
     {0x9F, 0x0B, 0x00, 0x60, 0x08, 0x03, 0x9E, 0x37}};

/* {6B652FFF-11FE-4fce-92AD-0266B5D7C78F} */
static const GUID IID_ISampleGrabber =
    {0x6B652FFF, 0x11FE, 0x4FCE,
     {0x92, 0xAD, 0x02, 0x66, 0xB5, 0xD7, 0xC7, 0x8F}};

/* {C1F400A4-3F08-11D3-9F0B-006008039E37} */
static const GUID CLSID_NullRenderer =
    {0xC1F400A4, 0x3F08, 0x11D3,
     {0x9F, 0x0B, 0x00, 0x60, 0x08, 0x03, 0x9E, 0x37}};

#undef INTERFACE
#define INTERFACE ISampleGrabber

DECLARE_INTERFACE_(ISampleGrabber, IUnknown) {
    /* IUnknown */
    STDMETHOD(QueryInterface)(THIS_ REFIID riid, void **ppv) PURE;
    STDMETHOD_(ULONG, AddRef)(THIS) PURE;
    STDMETHOD_(ULONG, Release)(THIS) PURE;
    /* ISampleGrabber */
    STDMETHOD(SetOneShot)(THIS_ BOOL oneShot) PURE;
    STDMETHOD(SetMediaType)(THIS_ const AM_MEDIA_TYPE *pType) PURE;
    STDMETHOD(GetConnectedMediaType)(THIS_ AM_MEDIA_TYPE *pType) PURE;
    STDMETHOD(SetBufferSamples)(THIS_ BOOL bufferThem) PURE;
    STDMETHOD(GetCurrentBuffer)(THIS_ long *pBufferSize, long *pBuffer) PURE;
    STDMETHOD(GetCurrentSample)(THIS_ void **ppSample) PURE;
    STDMETHOD(SetCallback)(THIS_ void *pCallback, long whichMethod) PURE;
};

/* ------------------------------------------------------------------ */
/* ISampleGrabberCB — frame delivery                                   */
/*                                                                     */
/* The grabber calls BufferCB on the DirectShow streaming thread once  */
/* per frame.  We copy the frame into latest_frame and bump frame_seq, */
/* so the TCP loop sends each frame exactly once.  Frames whose bytes  */
/* equal the previous frame's (all-black frames at a very short        */
/* exposure or with the lens capped) still count as new frames; the    */
/* old GetCurrentBuffer polling had to guess by content and dropped    */
/* them, which starved the command loop and hung the server.           */
/* ------------------------------------------------------------------ */

/* {0579154A-2B53-4994-B0D0-E773148EFF85} */
static const GUID IID_ISampleGrabberCB =
    {0x0579154A, 0x2B53, 0x4994,
     {0xB0, 0xD0, 0xE7, 0x73, 0x14, 0x8E, 0xFF, 0x85}};

typedef struct GrabberCB GrabberCB;
typedef struct {
    HRESULT (STDMETHODCALLTYPE *QueryInterface)(GrabberCB *This, REFIID riid, void **ppv);
    ULONG   (STDMETHODCALLTYPE *AddRef)(GrabberCB *This);
    ULONG   (STDMETHODCALLTYPE *Release)(GrabberCB *This);
    HRESULT (STDMETHODCALLTYPE *SampleCB)(GrabberCB *This, double t, IMediaSample *pSample);
    HRESULT (STDMETHODCALLTYPE *BufferCB)(GrabberCB *This, double t, BYTE *pBuffer, long len);
} GrabberCBVtbl;
struct GrabberCB { const GrabberCBVtbl *lpVtbl; };

static CRITICAL_SECTION frame_lock;
static HANDLE           frame_event  = NULL;  /* auto-reset, set per new frame */
static unsigned char   *latest_frame = NULL;
static long             latest_len   = 0;
static long             latest_cap   = 0;
static LONG             frame_seq    = 0;     /* bumped per delivered frame */

static HRESULT STDMETHODCALLTYPE cb_QueryInterface(GrabberCB *This, REFIID riid,
                                                   void **ppv)
{
    if (IsEqualGUID(riid, &IID_IUnknown) ||
        IsEqualGUID(riid, &IID_ISampleGrabberCB)) {
        *ppv = This;
        return S_OK;
    }
    *ppv = NULL;
    return E_NOINTERFACE;
}

/* Static object: reference counting is a no-op. */
static ULONG STDMETHODCALLTYPE cb_AddRef(GrabberCB *This)  { (void)This; return 2; }
static ULONG STDMETHODCALLTYPE cb_Release(GrabberCB *This) { (void)This; return 1; }

static HRESULT STDMETHODCALLTYPE cb_SampleCB(GrabberCB *This, double t,
                                             IMediaSample *pSample)
{
    (void)This; (void)t; (void)pSample;
    return E_NOTIMPL;  /* we register for BufferCB only */
}

static HRESULT STDMETHODCALLTYPE cb_BufferCB(GrabberCB *This, double t,
                                             BYTE *pBuffer, long len)
{
    (void)This; (void)t;
    if (!pBuffer || len <= 0)
        return S_OK;
    EnterCriticalSection(&frame_lock);
    if (len > latest_cap) {
        unsigned char *p = (unsigned char *)realloc(latest_frame, (size_t)len);
        if (!p) {
            LeaveCriticalSection(&frame_lock);
            return S_OK;
        }
        latest_frame = p;
        latest_cap = len;
    }
    memcpy(latest_frame, pBuffer, (size_t)len);
    latest_len = len;
    frame_seq++;
    LeaveCriticalSection(&frame_lock);
    SetEvent(frame_event);
    return S_OK;
}

static const GrabberCBVtbl grabber_cb_vtbl = {
    cb_QueryInterface, cb_AddRef, cb_Release, cb_SampleCB, cb_BufferCB,
};
static GrabberCB grabber_cb = { &grabber_cb_vtbl };

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

#define SERVER_PORT  8764

/* Capture sizes, in order of preference.  The OV9281 sensor is 1280x800;
 * 1280x720 is a centre crop of it (same pixel scale, so the solver's FOV
 * estimate holds for both), kept for modules that don't offer the full
 * frame.  open_camera() sets capture_w / capture_h to the size it got. */
static const struct { int w, h; } CAPTURE_SIZES[] = {
    {1280, 800},
    {1280, 720},
};
#define NUM_CAPTURE_SIZES (sizeof(CAPTURE_SIZES) / sizeof(CAPTURE_SIZES[0]))

static int capture_w = 1280;
static int capture_h = 800;

/* ------------------------------------------------------------------ */
/* DirectShow state                                                    */
/* ------------------------------------------------------------------ */

static IGraphBuilder         *pGraph       = NULL;
static ICaptureGraphBuilder2 *pCapture     = NULL;
static IMediaControl         *pControl     = NULL;
static IMediaEventEx         *pMediaEvent  = NULL;
static IBaseFilter           *pCamFilter   = NULL;
static IBaseFilter           *pGrabFilter  = NULL;
static IBaseFilter           *pNullFilter  = NULL;
static ISampleGrabber        *pGrabber     = NULL;
static IAMCameraControl      *pCamCtrl     = NULL;
static IAMVideoProcAmp       *pProcAmp     = NULL;

static int use_mjpeg = 1;

/* Camera model name */
static char camera_model[128] = "Unknown";

/* Innomaker U20CAM-9281M: needs the runtime gain / frame-length quirk
 * (see "Innomaker U20CAM-9281M quirk" below). Set by find_device(). */
#define U20_VID 0x0C45
#define U20_PID 0x636D
static int quirk_u20 = 0;
static void u20_close(void);

/* Control ranges */
typedef struct {
    int valid;
    long min, max, step, defval, cur;
    long flags;
} ctrl_range_t;

static ctrl_range_t exposure_range;
static ctrl_range_t gain_range;

/* Shutdown flag */
static volatile LONG stop_flag = 0;

/* ------------------------------------------------------------------ */
/* Utility: wide string to narrow (UTF-8)                              */
/* ------------------------------------------------------------------ */

static void wide_to_utf8(const WCHAR *src, char *dst, int dst_len)
{
    WideCharToMultiByte(CP_UTF8, 0, src, -1, dst, dst_len, NULL, NULL);
    dst[dst_len - 1] = '\0';
}

/* ------------------------------------------------------------------ */
/* Utility: case-insensitive substring search in wide string           */
/* ------------------------------------------------------------------ */

static const WCHAR *wcsistr(const WCHAR *haystack, const WCHAR *needle)
{
    if (!*needle) return haystack;
    for (; *haystack; haystack++) {
        const WCHAR *h = haystack, *n = needle;
        while (*h && *n && (towlower(*h) == towlower(*n))) {
            h++;
            n++;
        }
        if (!*n) return haystack;
    }
    return NULL;
}

/* ------------------------------------------------------------------ */
/* Camera allowlist                                                    */
/*                                                                     */
/* Known OV9281-based USB modules, matched by USB VID/PID.  Keep this  */
/* list in sync with the Linux (camera/linux/camera_server.c) and      */
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
/* Device discovery via DirectShow enumeration                         */
/* ------------------------------------------------------------------ */

/* Parse the vid_XXXX / pid_XXXX hex fields out of a DevicePath. */
static int parse_devpath_ids(const WCHAR *path, unsigned int *vid,
                             unsigned int *pid)
{
    const WCHAR *v = wcsistr(path, L"vid_");
    const WCHAR *p = wcsistr(path, L"pid_");
    if (!v || !p)
        return 0;
    if (swscanf(v + 4, L"%4x", vid) != 1)
        return 0;
    if (swscanf(p + 4, L"%4x", pid) != 1)
        return 0;
    return 1;
}

static HRESULT find_device(IBaseFilter **ppFilter, char *seen, size_t seen_len)
{
    ICreateDevEnum *pSysDevEnum = NULL;
    IEnumMoniker *pEnumMoniker = NULL;
    IMoniker *pMoniker = NULL;
    HRESULT hr;

    if (seen && seen_len)
        seen[0] = '\0';

    hr = CoCreateInstance(&CLSID_SystemDeviceEnum, NULL, CLSCTX_INPROC_SERVER,
                          &IID_ICreateDevEnum, (void **)&pSysDevEnum);
    if (FAILED(hr)) return hr;

    hr = ICreateDevEnum_CreateClassEnumerator(pSysDevEnum,
             &CLSID_VideoInputDeviceCategory, &pEnumMoniker, 0);
    if (hr != S_OK) {
        ICreateDevEnum_Release(pSysDevEnum);
        return E_FAIL;
    }

    while (IEnumMoniker_Next(pEnumMoniker, 1, &pMoniker, NULL) == S_OK) {
        IPropertyBag *pPropBag = NULL;
        hr = IMoniker_BindToStorage(pMoniker, NULL, NULL,
                                    &IID_IPropertyBag, (void **)&pPropBag);
        if (SUCCEEDED(hr)) {
            VARIANT varPath;
            VariantInit(&varPath);

            /* DevicePath looks like: \\?\usb#vid_32e6&pid_9251#... */
            hr = IPropertyBag_Read(pPropBag, L"DevicePath", &varPath, NULL);
            if (SUCCEEDED(hr) && varPath.vt == VT_BSTR) {
                unsigned int vid = 0, pid = 0;
                int have_ids = parse_devpath_ids(varPath.bstrVal, &vid, &pid);

                if (have_ids && camera_id_match(vid, pid)) {
                    /* Match found — get friendly name */
                    VARIANT varName;
                    VariantInit(&varName);
                    hr = IPropertyBag_Read(pPropBag, L"FriendlyName",
                                           &varName, NULL);
                    if (SUCCEEDED(hr) && varName.vt == VT_BSTR) {
                        wide_to_utf8(varName.bstrVal, camera_model,
                                     sizeof(camera_model));
                    }
                    VariantClear(&varName);

                    /* Bind to filter */
                    hr = IMoniker_BindToObject(pMoniker, NULL, NULL,
                                               &IID_IBaseFilter,
                                               (void **)ppFilter);
                    VariantClear(&varPath);
                    IPropertyBag_Release(pPropBag);
                    IMoniker_Release(pMoniker);
                    IEnumMoniker_Release(pEnumMoniker);
                    ICreateDevEnum_Release(pSysDevEnum);

                    if (SUCCEEDED(hr)) {
                        quirk_u20 = (vid == U20_VID && pid == U20_PID);
                        fprintf(stderr, "Found camera '%s' (%04X:%04X)\n",
                                camera_model, vid, pid);
                        return S_OK;
                    }
                    return hr;
                }

                /* Not allowlisted — record for the not-found diagnostic. */
                if (seen && seen_len && have_ids) {
                    char token[16];
                    snprintf(token, sizeof(token), "%04x:%04x", vid, pid);
                    if (!strstr(seen, token) &&
                        strlen(seen) + 256 < seen_len) {
                        char name[160] = "";
                        VARIANT varName;
                        VariantInit(&varName);
                        if (SUCCEEDED(IPropertyBag_Read(pPropBag,
                                L"FriendlyName", &varName, NULL)) &&
                            varName.vt == VT_BSTR) {
                            wide_to_utf8(varName.bstrVal, name, sizeof(name));
                        }
                        VariantClear(&varName);
                        char line[256];
                        snprintf(line, sizeof(line), "  %s  %s\n", token, name);
                        strncat(seen, line, seen_len - strlen(seen) - 1);
                    }
                }
            }
            VariantClear(&varPath);
            IPropertyBag_Release(pPropBag);
        }
        IMoniker_Release(pMoniker);
    }

    IEnumMoniker_Release(pEnumMoniker);
    ICreateDevEnum_Release(pSysDevEnum);
    return E_FAIL;
}

/* ------------------------------------------------------------------ */
/* Device discovery with retry                                         */
/* Some USB cameras take a few seconds to appear in DirectShow after   */
/* plug-in or system wake.  Retry for up to 8 seconds.                 */
/* ------------------------------------------------------------------ */

#define DEVICE_RETRY_TOTAL_MS   8000
#define DEVICE_RETRY_SLEEP_MS   500

static HRESULT find_device_with_retry(IBaseFilter **ppFilter,
                                      char *seen, size_t seen_len)
{
    DWORD elapsed = 0;
    HRESULT hr;

    hr = find_device(ppFilter, seen, seen_len);
    if (SUCCEEDED(hr))
        return hr;

    fprintf(stderr,
            "Camera not found on first attempt, retrying for %d seconds...\n",
            DEVICE_RETRY_TOTAL_MS / 1000);

    while (elapsed < DEVICE_RETRY_TOTAL_MS) {
        Sleep(DEVICE_RETRY_SLEEP_MS);
        elapsed += DEVICE_RETRY_SLEEP_MS;

        hr = find_device(ppFilter, seen, seen_len);
        if (SUCCEEDED(hr))
            return hr;

        fprintf(stderr, "  retry at %lu ms - not found yet\n",
                (unsigned long)elapsed);
    }

    return E_FAIL;
}

/* ------------------------------------------------------------------ */
/* Media event monitor                                                 */
/*                                                                     */
/* DirectShow signals device removal via the filter graph's event      */
/* queue. Without this thread a yanked USB cable is invisible — the    */
/* graph keeps "running" but never delivers another sample, the engine */
/* sees no TCP drop, and the UI sits on a frozen frame. We exit(1) on  */
/* EC_DEVICE_LOST or EC_ERRORABORT so the engine's CameraSubprocessMgr */
/* respawns us via its existing recovery loop.                         */
/* ------------------------------------------------------------------ */

static DWORD WINAPI media_event_thread(LPVOID param)
{
    (void)param;
    while (1) {
        long ev_code = 0;
        LONG_PTR p1 = 0, p2 = 0;
        HRESULT hr = IMediaEventEx_GetEvent(pMediaEvent, &ev_code, &p1, &p2,
                                             INFINITE);
        if (FAILED(hr)) {
            fprintf(stderr,
                    "ERROR: IMediaEventEx::GetEvent failed (hr=0x%08lx), exiting\n",
                    hr);
            fflush(stderr);
            exit(1);
        }

        if (ev_code == EC_DEVICE_LOST) {
            /* Param2 is 0 when the device is lost, 1 when it's regained.
             * We only ever react to the loss; the engine spawns a fresh
             * server when the camera reappears. */
            if (p2 == 0) {
                fprintf(stderr,
                        "ERROR: Camera device disconnected (EC_DEVICE_LOST), exiting\n");
                fflush(stderr);
                IMediaEventEx_FreeEventParams(pMediaEvent, ev_code, p1, p2);
                exit(1);
            }
        } else if (ev_code == EC_ERRORABORT) {
            fprintf(stderr,
                    "ERROR: Capture graph aborted (EC_ERRORABORT, hr=0x%08lx), exiting\n",
                    (long)p1);
            fflush(stderr);
            IMediaEventEx_FreeEventParams(pMediaEvent, ev_code, p1, p2);
            exit(1);
        }

        IMediaEventEx_FreeEventParams(pMediaEvent, ev_code, p1, p2);
    }
    return 0;
}

/* ------------------------------------------------------------------ */
/* Capture graph setup                                                 */
/* ------------------------------------------------------------------ */

static void free_media_type(AM_MEDIA_TYPE *pmt)
{
    if (pmt->cbFormat != 0) {
        CoTaskMemFree(pmt->pbFormat);
        pmt->cbFormat = 0;
        pmt->pbFormat = NULL;
    }
    if (pmt->pUnk != NULL) {
        IUnknown_Release(pmt->pUnk);
        pmt->pUnk = NULL;
    }
}

static int try_format(IAMStreamConfig *pConfig, const GUID *pSubtype,
                      int width, int height)
{
    int count = 0, size = 0;
    HRESULT hr = IAMStreamConfig_GetNumberOfCapabilities(pConfig, &count, &size);
    if (FAILED(hr)) return 0;

    BYTE *pSCC = (BYTE *)malloc(size);
    if (!pSCC) return 0;

    for (int i = 0; i < count; i++) {
        AM_MEDIA_TYPE *pmt = NULL;
        hr = IAMStreamConfig_GetStreamCaps(pConfig, i, &pmt, pSCC);
        if (FAILED(hr) || !pmt) continue;

        if (IsEqualGUID(&pmt->subtype, pSubtype) &&
            !IsEqualGUID(&pmt->formattype, &GUID_NULL) &&
            IsEqualGUID(&pmt->formattype, &FORMAT_VideoInfo) &&
            pmt->cbFormat >= sizeof(VIDEOINFOHEADER)) {

            VIDEOINFOHEADER *pVIH = (VIDEOINFOHEADER *)pmt->pbFormat;
            if (pVIH->bmiHeader.biWidth == width &&
                abs(pVIH->bmiHeader.biHeight) == height) {

                /* Pin the LOWEST fps (= longest frame interval) for max
                 * exposure headroom (issue #26).  Max exposure on a UVC camera
                 * is bounded by the frame interval, so faint stars need a low
                 * fps.  The caps for this index were populated into pSCC by the
                 * GetStreamCaps call above; MaxFrameInterval is in 100-ns units
                 * (longest interval = lowest fps).  Best-effort: if caps look
                 * unusable, leave AvgTimePerFrame as-is. */
                VIDEO_STREAM_CONFIG_CAPS *pCaps = (VIDEO_STREAM_CONFIG_CAPS *)pSCC;
                if (size >= (int)sizeof(VIDEO_STREAM_CONFIG_CAPS) &&
                    pCaps->MaxFrameInterval > 0) {
                    pVIH->AvgTimePerFrame = pCaps->MaxFrameInterval;
                    double fps = 1e7 / (double)pCaps->MaxFrameInterval;
                    fprintf(stderr,
                            "Frame rate pinned: AvgTimePerFrame=%.0f (100ns) = %.2f fps\n",
                            (double)pCaps->MaxFrameInterval, fps);
                }

                hr = IAMStreamConfig_SetFormat(pConfig, pmt);
                free_media_type(pmt);
                CoTaskMemFree(pmt);
                free(pSCC);
                return SUCCEEDED(hr) ? 1 : 0;
            }
        }
        free_media_type(pmt);
        CoTaskMemFree(pmt);
    }

    free(pSCC);
    return 0;
}

static int open_camera(void)
{
    HRESULT hr;

    /* Create filter graph */
    hr = CoCreateInstance(&CLSID_FilterGraph, NULL, CLSCTX_INPROC_SERVER,
                          &IID_IGraphBuilder, (void **)&pGraph);
    if (FAILED(hr)) { fprintf(stderr, "Failed to create FilterGraph\n"); return -1; }

    /* Create capture graph builder */
    hr = CoCreateInstance(&CLSID_CaptureGraphBuilder2, NULL, CLSCTX_INPROC_SERVER,
                          &IID_ICaptureGraphBuilder2, (void **)&pCapture);
    if (FAILED(hr)) { fprintf(stderr, "Failed to create CaptureGraphBuilder2\n"); return -1; }

    ICaptureGraphBuilder2_SetFiltergraph(pCapture, pGraph);

    /* Add camera filter to graph */
    hr = IGraphBuilder_AddFilter(pGraph, pCamFilter, L"Camera");
    if (FAILED(hr)) { fprintf(stderr, "Failed to add camera filter\n"); return -1; }

    /* Create sample grabber */
    hr = CoCreateInstance(&CLSID_SampleGrabber, NULL, CLSCTX_INPROC_SERVER,
                          &IID_IBaseFilter, (void **)&pGrabFilter);
    if (FAILED(hr)) { fprintf(stderr, "Failed to create SampleGrabber\n"); return -1; }

    hr = IBaseFilter_QueryInterface(pGrabFilter, &IID_ISampleGrabber,
                                    (void **)&pGrabber);
    if (FAILED(hr)) { fprintf(stderr, "Failed to get ISampleGrabber\n"); return -1; }

    /* Get stream config from capture pin */
    IAMStreamConfig *pConfig = NULL;
    hr = ICaptureGraphBuilder2_FindInterface(pCapture, &PIN_CATEGORY_CAPTURE,
             &MEDIATYPE_Video, pCamFilter, &IID_IAMStreamConfig,
             (void **)&pConfig);

    /* Try MJPEG at each preferred size, then YUYV */
    use_mjpeg = 1;
    if (pConfig) {
        int found = 0;
        for (size_t i = 0; !found && i < NUM_CAPTURE_SIZES; i++) {
            if (try_format(pConfig, &MEDIASUBTYPE_MJPG,
                           CAPTURE_SIZES[i].w, CAPTURE_SIZES[i].h)) {
                capture_w = CAPTURE_SIZES[i].w;
                capture_h = CAPTURE_SIZES[i].h;
                found = 1;
                fprintf(stderr, "Using MJPEG capture %dx%d\n", capture_w, capture_h);
            }
        }
        for (size_t i = 0; !found && i < NUM_CAPTURE_SIZES; i++) {
            if (try_format(pConfig, &MEDIASUBTYPE_YUY2,
                           CAPTURE_SIZES[i].w, CAPTURE_SIZES[i].h)) {
                capture_w = CAPTURE_SIZES[i].w;
                capture_h = CAPTURE_SIZES[i].h;
                use_mjpeg = 0;
                found = 1;
                fprintf(stderr, "MJPEG not available, using YUY2 capture %dx%d\n",
                        capture_w, capture_h);
            }
        }
        if (!found)
            fprintf(stderr, "Warning: Could not set preferred format, using default\n");
        IAMStreamConfig_Release(pConfig);
    }

    /* Configure grabber media type */
    AM_MEDIA_TYPE mt;
    ZeroMemory(&mt, sizeof(mt));
    mt.majortype = MEDIATYPE_Video;
    mt.subtype = use_mjpeg ? MEDIASUBTYPE_MJPG : MEDIASUBTYPE_YUY2;
    pGrabber->lpVtbl->SetMediaType(pGrabber, &mt);
    pGrabber->lpVtbl->SetBufferSamples(pGrabber, FALSE);
    pGrabber->lpVtbl->SetOneShot(pGrabber, FALSE);

    /* Deliver frames through BufferCB (see grabber_cb above) */
    if (frame_event == NULL) {
        InitializeCriticalSection(&frame_lock);
        frame_event = CreateEventW(NULL, FALSE, FALSE, NULL);
        if (frame_event == NULL) { fprintf(stderr, "Failed to create frame event\n"); return -1; }
    }
    hr = pGrabber->lpVtbl->SetCallback(pGrabber, &grabber_cb, 1 /* BufferCB */);
    if (FAILED(hr)) {
        fprintf(stderr, "Failed to set grabber callback (hr=0x%08lx)\n", hr);
        return -1;
    }

    /* Add grabber to graph */
    hr = IGraphBuilder_AddFilter(pGraph, pGrabFilter, L"Grabber");
    if (FAILED(hr)) { fprintf(stderr, "Failed to add grabber filter\n"); return -1; }

    /* Create and add null renderer (sink) */
    hr = CoCreateInstance(&CLSID_NullRenderer, NULL, CLSCTX_INPROC_SERVER,
                          &IID_IBaseFilter, (void **)&pNullFilter);
    if (FAILED(hr)) { fprintf(stderr, "Failed to create NullRenderer\n"); return -1; }

    hr = IGraphBuilder_AddFilter(pGraph, pNullFilter, L"NullRenderer");
    if (FAILED(hr)) { fprintf(stderr, "Failed to add null renderer\n"); return -1; }

    /* Render the capture stream: Camera -> Grabber -> NullRenderer */
    hr = ICaptureGraphBuilder2_RenderStream(pCapture, &PIN_CATEGORY_CAPTURE,
             &MEDIATYPE_Video, (IUnknown *)pCamFilter, pGrabFilter, pNullFilter);
    if (FAILED(hr)) {
        fprintf(stderr, "Failed to render capture stream (hr=0x%08lx)\n", hr);
        return -1;
    }

    /* Get media control */
    hr = IGraphBuilder_QueryInterface(pGraph, &IID_IMediaControl,
                                      (void **)&pControl);
    if (FAILED(hr)) { fprintf(stderr, "Failed to get IMediaControl\n"); return -1; }

    /* Get camera control and video proc amp interfaces */
    hr = IBaseFilter_QueryInterface(pCamFilter, &IID_IAMCameraControl,
                                    (void **)&pCamCtrl);
    if (FAILED(hr)) {
        fprintf(stderr, "Warning: IAMCameraControl not available\n");
        pCamCtrl = NULL;
    }

    hr = IBaseFilter_QueryInterface(pCamFilter, &IID_IAMVideoProcAmp,
                                    (void **)&pProcAmp);
    if (FAILED(hr)) {
        fprintf(stderr, "Warning: IAMVideoProcAmp not available\n");
        pProcAmp = NULL;
    }

    /* Start the graph */
    hr = IMediaControl_Run(pControl);
    if (FAILED(hr)) {
        fprintf(stderr, "Failed to start capture (hr=0x%08lx)\n", hr);
        return -1;
    }

    /* Subscribe to filter graph events so we can detect device disconnect.
     * QI from the same IGraphBuilder we already have. */
    hr = IGraphBuilder_QueryInterface(pGraph, &IID_IMediaEventEx,
                                      (void **)&pMediaEvent);
    if (FAILED(hr) || !pMediaEvent) {
        fprintf(stderr,
                "Warning: IMediaEventEx not available — cannot detect device disconnect\n");
    } else {
        HANDLE th = CreateThread(NULL, 0, media_event_thread, NULL, 0, NULL);
        if (th == NULL) {
            fprintf(stderr,
                    "Warning: failed to start media event thread (err=%lu)\n",
                    (unsigned long)GetLastError());
        } else {
            CloseHandle(th);  /* fire and forget; thread runs until exit() */
        }
    }

    fprintf(stderr, "Capture graph running\n");
    return 0;
}

/* ------------------------------------------------------------------ */
/* Capture cleanup                                                     */
/* ------------------------------------------------------------------ */

static void close_camera(void)
{
    if (pControl) { IMediaControl_Stop(pControl); IMediaControl_Release(pControl); pControl = NULL; }
    if (pProcAmp) { IAMVideoProcAmp_Release(pProcAmp); pProcAmp = NULL; }
    if (pCamCtrl) { IAMCameraControl_Release(pCamCtrl); pCamCtrl = NULL; }
    u20_close();
    if (pGrabber) {
        pGrabber->lpVtbl->SetCallback(pGrabber, NULL, 1);
        pGrabber->lpVtbl->Release(pGrabber);
        pGrabber = NULL;
    }
    if (pNullFilter) { IGraphBuilder_RemoveFilter(pGraph, pNullFilter); IBaseFilter_Release(pNullFilter); pNullFilter = NULL; }
    if (pGrabFilter) { IGraphBuilder_RemoveFilter(pGraph, pGrabFilter); IBaseFilter_Release(pGrabFilter); pGrabFilter = NULL; }
    if (pCamFilter) { IGraphBuilder_RemoveFilter(pGraph, pCamFilter); IBaseFilter_Release(pCamFilter); pCamFilter = NULL; }
    if (pCapture) { ICaptureGraphBuilder2_Release(pCapture); pCapture = NULL; }
    if (pGraph) { IGraphBuilder_Release(pGraph); pGraph = NULL; }
}

/* ------------------------------------------------------------------ */
/* DirectShow controls                                                 */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Innomaker U20CAM-9281M quirk (0C45:636D)                            */
/*                                                                     */
/* The module is a Sonix SN9C286 bridge with an OV9281 sensor. Its     */
/* firmware accepts the UVC gain control but never sends it to the     */
/* sensor (which stays at a fixed 2x), and it lowers the frame rate by */
/* lengthening each line rather than the frame, so exposure is capped  */
/* at one stock frame (~97 ms). Both are fixed at runtime through      */
/* Sonix's vendor extension unit, whose selector 1 reads and writes    */
/* the bridge's XDATA address space:                                   */
/*  - Gain: every frame the firmware programs sensor gain (0x3509)     */
/*    from RAM 0x08F0:0x08F1 (gain x 512, big-endian), so we write     */
/*    that. The firmware resets it to 2x on each exposure change, so   */
/*    u20_maintain() re-applies it.                                    */
/*  - Exposure: the firmware's exposure in sensor lines is at RAM      */
/*    0x0C41:0x0C42; u20_maintain() raises the sensor's frame length   */
/*    (VTS, 0x380E/0x380F) to fit it, through the bridge's I2C         */
/*    controller (0x8600). At the pinned 10 fps a line takes ~110 us,  */
/*    not the 54.6 us the firmware assumes, so real exposure is ~2x    */
/*    the UVC value; the exposure control reports display_scale 2.     */
/* Everything is volatile: unplugging the camera restores stock.       */
/* NEVER write 0x8E00-0x8EFF (the SPI flash controller) or use the     */
/* flash selector (3); u20_write() only writes the addresses in        */
/* u20_write_allowed(). Background: docs/hardware.md.                  */
/* ------------------------------------------------------------------ */

static const GUID U20_XU_GUID =
    {0x28F03370, 0x6311, 0x4A2E, {0xBA, 0x2C, 0x68, 0x90, 0xEB, 0x33, 0x40, 0x16}};
static const GUID U20_IID_IKsTopologyInfo =
    {0x720D4AC0, 0x7533, 0x11D0, {0xA5, 0xD6, 0x28, 0xDB, 0x04, 0xC1, 0x00, 0x00}};
static const GUID U20_IID_IKsControl =
    {0x28F54685, 0x06FD, 0x11D2, {0xB2, 0x7A, 0x00, 0xA0, 0xC9, 0x22, 0x31, 0x96}};
static const GUID U20_KSNODETYPE_DEV_SPECIFIC =
    {0x941C7AC0, 0xC559, 0x11D0, {0x8A, 0x2B, 0x00, 0xA0, 0xC9, 0x25, 0x5A, 0xC1}};

/* Minimal KS declarations (ks.h / ksproxy.h are awkward to use from C) */
typedef struct { GUID Set; ULONG Id; ULONG Flags; } U20_KSPROPERTY;
typedef struct { U20_KSPROPERTY Property; ULONG NodeId; ULONG Reserved; } U20_KSP_NODE;
#define U20_KSPROPERTY_TYPE_GET      0x00000001
#define U20_KSPROPERTY_TYPE_SET      0x00000002
#define U20_KSPROPERTY_TYPE_TOPOLOGY 0x10000000

typedef struct U20KsControl U20KsControl;
typedef struct {
    HRESULT (STDMETHODCALLTYPE *QueryInterface)(U20KsControl *, REFIID, void **);
    ULONG   (STDMETHODCALLTYPE *AddRef)(U20KsControl *);
    ULONG   (STDMETHODCALLTYPE *Release)(U20KsControl *);
    HRESULT (STDMETHODCALLTYPE *KsProperty)(U20KsControl *, U20_KSPROPERTY *, ULONG,
                                            void *, ULONG, ULONG *);
} U20KsControlVtbl;
struct U20KsControl { const U20KsControlVtbl *lpVtbl; };

typedef struct U20KsTopology U20KsTopology;
typedef struct {
    HRESULT (STDMETHODCALLTYPE *QueryInterface)(U20KsTopology *, REFIID, void **);
    ULONG   (STDMETHODCALLTYPE *AddRef)(U20KsTopology *);
    ULONG   (STDMETHODCALLTYPE *Release)(U20KsTopology *);
    HRESULT (STDMETHODCALLTYPE *get_NumCategories)(U20KsTopology *, DWORD *);
    HRESULT (STDMETHODCALLTYPE *get_Category)(U20KsTopology *, DWORD, GUID *);
    HRESULT (STDMETHODCALLTYPE *get_NumConnections)(U20KsTopology *, DWORD *);
    HRESULT (STDMETHODCALLTYPE *get_ConnectionInfo)(U20KsTopology *, DWORD, void *);
    HRESULT (STDMETHODCALLTYPE *get_NodeName)(U20KsTopology *, DWORD, WCHAR *, DWORD, DWORD *);
    HRESULT (STDMETHODCALLTYPE *get_NumNodes)(U20KsTopology *, DWORD *);
    HRESULT (STDMETHODCALLTYPE *get_NodeType)(U20KsTopology *, DWORD, GUID *);
} U20KsTopologyVtbl;
struct U20KsTopology { const U20KsTopologyVtbl *lpVtbl; };

#define U20_GAIN_MIN    10      /* gain control unit: tenths of x (1.0x)  */
#define U20_GAIN_MAX    155     /* 15.5x (sensor register 0x3509 = 0xF8)  */
#define U20_GAIN_STOCK  20      /* firmware default, 2.0x                 */
#define U20_VTS_STOCK   910     /* frame length of the 1280x800 mode      */
#define U20_VTS_MARGIN  32      /* exposure must stay below VTS - ~25     */
#define U20_VTS_MAX     9200    /* ~1.0 s frames: keeps gaps under the    */
                                /* engine's 2 s frame-stall watchdog      */
#define U20_TICK_MS     500
#define U20_VTS_REFRESH 20      /* re-send VTS every 20 ticks (10 s): it   */
                                /* can't be read back, and a sensor re-init */
                                /* would silently restore the stock 910     */

static U20KsControl *u20_ks = NULL;
static ULONG         u20_node = 0;
static long          u20_gain = U20_GAIN_STOCK;
static unsigned      u20_vts = 0;          /* last frame length written; 0 = none */
static int           u20_vts_repeat = 0;   /* write once more: no read-back */
static int           u20_vts_ticks = 0;    /* ticks since VTS was last written */
static DWORD         u20_last_tick = 0;

/* One 4-byte transfer on extension-unit selector 1. */
static int u20_xu(int set, BYTE d[4])
{
    U20_KSP_NODE p;
    ULONG got = 0;
    memset(&p, 0, sizeof(p));
    p.Property.Set = U20_XU_GUID;
    p.Property.Id = 1;
    p.Property.Flags = (set ? U20_KSPROPERTY_TYPE_SET : U20_KSPROPERTY_TYPE_GET)
                     | U20_KSPROPERTY_TYPE_TOPOLOGY;
    p.NodeId = u20_node;
    return SUCCEEDED(u20_ks->lpVtbl->KsProperty(u20_ks, &p.Property, sizeof(p),
                                                d, 4, &got)) ? 0 : -1;
}

/* XDATA read: SET [lo, hi, 0, 0xFF] latches the address, GET returns
 * [lo, hi, value, 0]. Returns 0..255, or -1 on error. */
static int u20_read(unsigned addr)
{
    BYTE d[4] = { (BYTE)(addr & 0xFF), (BYTE)(addr >> 8), 0x00, 0xFF };
    if (u20_xu(1, d) < 0) return -1;
    memset(d, 0, sizeof(d));
    if (u20_xu(0, d) < 0) return -1;
    if (d[0] != (BYTE)(addr & 0xFF) || d[1] != (BYTE)(addr >> 8)) return -1;
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
    BYTE d[4];
    if (!u20_write_allowed(addr)) return -1;
    d[0] = (BYTE)(addr & 0xFF);
    d[1] = (BYTE)(addr >> 8);
    d[2] = (BYTE)val;
    d[3] = 0x00;
    return u20_xu(1, d);
}

/* Write one OV9281 register through the bridge's I2C controller
 * (channel 0, slave 0x60 set by the firmware): 0x8602/03 = register,
 * 0x8604 = value, 0x860A = (3-1)<<5 | STOP 0x10 | START 0x01. The
 * firmware shares the controller, so check afterwards that the data
 * registers still hold our bytes (not its traffic) and retry if not. */
static int u20_sensor_write(unsigned reg, int val)
{
    for (int attempt = 0; attempt < 3; attempt++) {
        if (u20_write(0x8602, (int)(reg >> 8)) < 0 ||
            u20_write(0x8603, (int)(reg & 0xFF)) < 0 ||
            u20_write(0x8604, val & 0xFF) < 0 ||
            u20_write(0x860A, 0x51) < 0)
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

static unsigned u20_gain_word(long x10)
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
    DWORD now = GetTickCount();
    if (!quirk_u20 || now - u20_last_tick < U20_TICK_MS)
        return;
    u20_last_tick = now;

    /* Gain: the firmware resets it on every exposure change */
    int hi = u20_read(0x08F0), lo = u20_read(0x08F1);
    if (hi >= 0 && lo >= 0 && (unsigned)((hi << 8) | lo) != u20_gain_word(u20_gain))
        u20_apply_gain();

    /* Frame length: fit the firmware's exposure (in lines) */
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

static void u20_close(void)
{
    if (u20_ks) {
        u20_ks->lpVtbl->Release(u20_ks);
        u20_ks = NULL;
    }
}

/* After open_camera(): reach the extension unit, or fall back to stock. */
static void u20_init(void)
{
    U20KsTopology *topo = NULL;
    DWORD n = 0;
    int found = 0;

    if (!quirk_u20)
        return;
    if (SUCCEEDED(IBaseFilter_QueryInterface(pCamFilter, &U20_IID_IKsTopologyInfo,
                                             (void **)&topo))) {
        topo->lpVtbl->get_NumNodes(topo, &n);
        for (DWORD i = 0; i < n && !found; i++) {
            GUID t;
            if (SUCCEEDED(topo->lpVtbl->get_NodeType(topo, i, &t)) &&
                (IsEqualGUID(&t, &U20_KSNODETYPE_DEV_SPECIFIC) ||
                 IsEqualGUID(&t, &U20_XU_GUID))) {
                u20_node = i;
                found = 1;
            }
        }
        topo->lpVtbl->Release(topo);
    }
    if (!found || FAILED(IBaseFilter_QueryInterface(pCamFilter, &U20_IID_IKsControl,
                                                    (void **)&u20_ks))
        || u20_read(0x08F0) < 0) {
        fprintf(stderr, "U20CAM: extension unit not reachable, using stock controls\n");
        if (u20_ks) { u20_ks->lpVtbl->Release(u20_ks); u20_ks = NULL; }
        quirk_u20 = 0;
        return;
    }
    fprintf(stderr, "U20CAM quirk active: gain %ld..%ld (x0.1), frame length follows "
            "exposure (max %u lines)\n", (long)U20_GAIN_MIN, (long)U20_GAIN_MAX,
            U20_VTS_MAX);
}

static void query_exposure(ctrl_range_t *out)
{
    memset(out, 0, sizeof(*out));
    if (!pCamCtrl) return;

    HRESULT hr = IAMCameraControl_GetRange(pCamCtrl,
        CameraControl_Exposure,
        &out->min, &out->max, &out->step, &out->defval, &out->flags);
    if (FAILED(hr)) { out->valid = 0; return; }
    out->valid = 1;

    long val, flags;
    hr = IAMCameraControl_Get(pCamCtrl, CameraControl_Exposure, &val, &flags);
    out->cur = SUCCEEDED(hr) ? val : out->defval;
}

static void query_gain(ctrl_range_t *out)
{
    memset(out, 0, sizeof(*out));
    if (quirk_u20) {
        out->valid = 1;
        out->min = U20_GAIN_MIN;
        out->max = U20_GAIN_MAX;
        out->step = 1;
        out->defval = U20_GAIN_STOCK;
        out->cur = u20_gain;
        return;
    }
    if (!pProcAmp) return;

    HRESULT hr = IAMVideoProcAmp_GetRange(pProcAmp,
        VideoProcAmp_Gain,
        &out->min, &out->max, &out->step, &out->defval, &out->flags);
    if (FAILED(hr)) { out->valid = 0; return; }
    out->valid = 1;

    long val, flags;
    hr = IAMVideoProcAmp_Get(pProcAmp, VideoProcAmp_Gain, &val, &flags);
    out->cur = SUCCEEDED(hr) ? val : out->defval;
}

static void probe_controls(void)
{
    query_exposure(&exposure_range);
    query_gain(&gain_range);
    fprintf(stderr, "Exposure range: valid=%d min=%ld max=%ld step=%ld cur=%ld\n",
            exposure_range.valid, exposure_range.min, exposure_range.max,
            exposure_range.step, exposure_range.cur);
    fprintf(stderr, "Gain range: valid=%d min=%ld max=%ld step=%ld cur=%ld\n",
            gain_range.valid, gain_range.min, gain_range.max,
            gain_range.step, gain_range.cur);
}

static int set_exposure(long value)
{
    if (!pCamCtrl) return -1;
    return SUCCEEDED(IAMCameraControl_Set(pCamCtrl, CameraControl_Exposure,
                                          value, CameraControl_Flags_Manual)) ? 0 : -1;
}

static int set_gain(long value)
{
    if (quirk_u20) {
        if (value < U20_GAIN_MIN) value = U20_GAIN_MIN;
        if (value > U20_GAIN_MAX) value = U20_GAIN_MAX;
        u20_gain = value;
        return u20_apply_gain();
    }
    if (!pProcAmp) return -1;
    return SUCCEEDED(IAMVideoProcAmp_Set(pProcAmp, VideoProcAmp_Gain,
                                         value, VideoProcAmp_Flags_Manual)) ? 0 : -1;
}

static void disable_auto_exposure(void)
{
    if (!pCamCtrl) return;
    long val, flags;
    HRESULT hr = IAMCameraControl_Get(pCamCtrl, CameraControl_Exposure,
                                       &val, &flags);
    if (SUCCEEDED(hr)) {
        IAMCameraControl_Set(pCamCtrl, CameraControl_Exposure,
                             val, CameraControl_Flags_Manual);
        fprintf(stderr, "Auto-exposure disabled (manual mode)\n");
    }
}

/* ------------------------------------------------------------------ */
/* YUYV → JPEG conversion (libjpeg-turbo)                              */
/* ------------------------------------------------------------------ */

#ifdef HAVE_LIBJPEG
#include <jpeglib.h>

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

    unsigned char *row = (unsigned char *)malloc((size_t)capture_w * 3);
    if (!row) {
        jpeg_destroy_compress(&cinfo);
        return -1;
    }

    const unsigned char *src = (const unsigned char *)yuyv_data;
    while (cinfo.next_scanline < cinfo.image_height) {
        const unsigned char *line = src + cinfo.next_scanline * capture_w * 2;
        for (int x = 0; x < capture_w; x += 2) {
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
#endif /* HAVE_LIBJPEG */

/* ------------------------------------------------------------------ */
/* Frame capture                                                       */
/* ------------------------------------------------------------------ */

/* frame_seq of the last frame handed to the TCP loop */
static LONG last_sent_seq = 0;

/* Wait up to wait_ms for a frame newer than the last one returned.
 * For MJPEG: the raw JPEG data delivered by BufferCB.
 * For YUYV:  convert to JPEG (requires HAVE_LIBJPEG).
 * Returns 0 on success, -1 if no new frame arrived (or on failure).
 * Caller must free(*out_data) when done.
 */
static int capture_frame(unsigned char **out_data, long *out_len, DWORD wait_ms)
{
    if (WaitForSingleObject(frame_event, wait_ms) != WAIT_OBJECT_0) {
        /* Defense in depth: if the grabber has stopped under us in steady
         * state, EC_DEVICE_LOST may not have fired (some drivers are lax).
         * Treat a stopped grabber as a fatal disconnect. */
        FILTER_STATE st;
        if (pGrabFilter &&
            IBaseFilter_GetState(pGrabFilter, 0, &st) == S_OK &&
            st == State_Stopped) {
            fprintf(stderr, "ERROR: Capture graph stopped, exiting\n");
            fflush(stderr);
            exit(1);
        }
        return -1;
    }

    EnterCriticalSection(&frame_lock);
    if (frame_seq == last_sent_seq || latest_len <= 0) {
        LeaveCriticalSection(&frame_lock);
        return -1;
    }
    long buf_size = latest_len;
    unsigned char *buf = (unsigned char *)malloc((size_t)buf_size);
    if (!buf) {
        LeaveCriticalSection(&frame_lock);
        return -1;
    }
    memcpy(buf, latest_frame, (size_t)buf_size);
    last_sent_seq = frame_seq;
    LeaveCriticalSection(&frame_lock);

    if (use_mjpeg) {
        *out_data = buf;
        *out_len = buf_size;
        return 0;
    }

#ifdef HAVE_LIBJPEG
    /* YUYV → JPEG */
    unsigned char *jpeg_data = NULL;
    unsigned long jpeg_len = 0;
    if (yuyv_to_jpeg(buf, (size_t)buf_size, &jpeg_data, &jpeg_len) < 0) {
        free(buf);
        return -1;
    }
    free(buf);
    *out_data = jpeg_data;
    *out_len = (long)jpeg_len;
    return 0;
#else
    /* No libjpeg — cannot convert YUYV */
    fprintf(stderr, "YUYV capture but no libjpeg support compiled in\n");
    free(buf);
    return -1;
#endif
}

/* ------------------------------------------------------------------ */
/* TCP helpers (Winsock2)                                               */
/* ------------------------------------------------------------------ */

static int send_all(SOCKET fd, const void *data, int len)
{
    const char *p = (const char *)data;
    int remaining = len;
    while (remaining > 0) {
        int n = send(fd, p, remaining, 0);
        if (n == SOCKET_ERROR || n == 0)
            return -1;
        p += n;
        remaining -= n;
    }
    return 0;
}

static int recv_exact(SOCKET fd, void *buf, int len)
{
    char *p = (char *)buf;
    int remaining = len;
    while (remaining > 0) {
        int n = recv(fd, p, remaining, 0);
        if (n == SOCKET_ERROR || n == 0)
            return -1;
        p += n;
        remaining -= n;
    }
    return 0;
}

static int send_message(SOCKET client_fd, uint32_t type, const void *payload,
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
    if (length > 0 && send_all(client_fd, payload, (int)length) < 0)
        return -1;
    return 0;
}

static int send_json_message(SOCKET client_fd, uint32_t type, const char *json)
{
    return send_message(client_fd, type, json, (uint32_t)strlen(json));
}

static int read_message(SOCKET client_fd, uint32_t *type, unsigned char **payload,
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

    *payload = (unsigned char *)malloc(*length);
    if (!*payload)
        return -1;

    if (recv_exact(client_fd, *payload, (int)*length) < 0) {
        free(*payload);
        *payload = NULL;
        return -1;
    }
    return 0;
}

/* ------------------------------------------------------------------ */
/* JSON builders (no library — snprintf)                               */
/* ------------------------------------------------------------------ */

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
        "\"backend\":\"windows-directshow\","
        "\"backend_version\":\"0.1.0\","
        "\"camera_model\":\"%s\","
        "\"stream_format\":\"MJPEG\","
        "\"default_width\":%d,"
        "\"default_height\":%d,"
        "\"default_fps\":30}",
        escaped_model, capture_w, capture_h);
}

static void build_control_info_json(char *buf, size_t buflen)
{
    /* Re-read current values */
    long exp_cur = exposure_range.cur;
    long gain_cur = gain_range.cur;
    if (exposure_range.valid && pCamCtrl) {
        long val, flags;
        if (SUCCEEDED(IAMCameraControl_Get(pCamCtrl, CameraControl_Exposure,
                                           &val, &flags)))
            exp_cur = val;
    }
    if (quirk_u20) {
        gain_cur = u20_gain;
    } else if (gain_range.valid && pProcAmp) {
        long val, flags;
        if (SUCCEEDED(IAMVideoProcAmp_Get(pProcAmp, VideoProcAmp_Gain,
                                          &val, &flags)))
            gain_cur = val;
    }

    char controls[1024] = "";
    int pos = 0;
    int first = 1;

    if (exposure_range.valid) {
        /* DirectShow CameraControl_Exposure is in log2(seconds) — unlike the
         * Linux/macOS UVC servers, which use 100us units. The "unit" tag tells
         * the UI which conversion to apply (web/.../CameraControls.tsx): for
         * "log2s" it shows 2^value * 1000 ms (e.g. -5 -> 31.25 ms).
         * display_scale: the U20CAM's real exposure is ~2x the UVC value. */
        pos += snprintf(controls + pos, sizeof(controls) - (size_t)pos,
            "{\"id\":\"exposure\","
            "\"label\":\"Exposure\","
            "\"type\":\"int\","
            "\"min\":%ld,\"max\":%ld,\"step\":%ld,\"cur\":%ld,"
            "\"unit\":\"log2s\"%s}",
            exposure_range.min, exposure_range.max,
            exposure_range.step, exp_cur,
            quirk_u20 ? ",\"display_scale\":2" : "");
        first = 0;
    }
    if (gain_range.valid) {
        if (!first)
            pos += snprintf(controls + pos, sizeof(controls) - (size_t)pos, ",");
        pos += snprintf(controls + pos, sizeof(controls) - (size_t)pos,
            "{\"id\":\"gain\","
            "\"label\":\"Gain\","
            "\"type\":\"int\","
            "\"min\":%ld,\"max\":%ld,\"step\":%ld,\"cur\":%ld,"
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

static int parse_set_control(const char *json, char *id_out, size_t id_len,
                             long *value_out)
{
    const char *p = strstr(json, "\"id\"");
    if (!p) return -1;
    p = strchr(p + 4, '"');
    if (!p) return -1;
    p++;
    const char *end = strchr(p, '"');
    if (!end) return -1;
    size_t len = (size_t)(end - p);
    if (len >= id_len) len = id_len - 1;
    memcpy(id_out, p, len);
    id_out[len] = '\0';

    p = strstr(json, "\"value\"");
    if (!p) return -1;
    p = strchr(p + 7, ':');
    if (!p) return -1;
    p++;
    while (*p == ' ' || *p == '\t') p++;
    if (sscanf(p, "%ld", value_out) != 1)
        return -1;

    return 0;
}

/* ------------------------------------------------------------------ */
/* Command handling                                                    */
/* ------------------------------------------------------------------ */

static void apply_set_control(const char *id, long value)
{
    if (strcmp(id, "exposure") == 0) {
        set_exposure(value);
        fprintf(stderr, "Set exposure = %ld\n", value);
    } else if (strcmp(id, "gain") == 0) {
        set_gain(value);
        fprintf(stderr, "Set gain = %ld\n", value);
    } else {
        fprintf(stderr, "Unknown control: %s\n", id);
    }
}

/* Handle at most one pending command without blocking.
 * Returns 0 normally, -1 if the client has gone (or sent garbage). */
static int poll_commands(SOCKET client_fd)
{
    fd_set readfds;
    struct timeval tv;
    FD_ZERO(&readfds);
    FD_SET(client_fd, &readfds);
    tv.tv_sec = 0;
    tv.tv_usec = 0;

    int ret = select(0, &readfds, NULL, NULL, &tv);
    if (ret <= 0 || !FD_ISSET(client_fd, &readfds))
        return 0;

    uint32_t msg_type;
    unsigned char *payload = NULL;
    uint32_t length;

    if (read_message(client_fd, &msg_type, &payload, &length) < 0)
        return -1;

    if (msg_type == MSG_SET_CONTROL && payload) {
        char *json = (char *)malloc(length + 1);
        if (json) {
            memcpy(json, payload, length);
            json[length] = '\0';

            char id[64];
            long value;
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
    return 0;
}

/* ------------------------------------------------------------------ */
/* Client handling                                                     */
/* ------------------------------------------------------------------ */

static void handle_client(SOCKET client_fd)
{
    /* Send HELLO immediately so the client sees the handshake start before
       slow DirectShow control probing runs. */
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

    /* Probe controls now that the handshake is complete. */
    probe_controls();

    /* Send CONTROL_INFO */
    char info[1024];
    build_control_info_json(info, sizeof(info));
    if (send_json_message(client_fd, MSG_CONTROL_INFO, info) < 0) {
        fprintf(stderr, "Failed to send CONTROL_INFO\n");
        return;
    }

    /* Stream loop */
    while (!InterlockedCompareExchange(&stop_flag, 0, 0)) {
        unsigned char *frame_data = NULL;
        long frame_len = 0;

        /* Waits up to 50 ms for the next frame, so this loop never spins */
        if (capture_frame(&frame_data, &frame_len, 50) == 0) {
            if (send_message(client_fd, MSG_FRAME, frame_data,
                             (uint32_t)frame_len) < 0) {
                free(frame_data);
                fprintf(stderr, "Client disconnected (send failed)\n");
                return;
            }
            free(frame_data);
        }

        /* Poll for commands on every pass, not only after a frame is sent,
         * so the client can still change settings while the camera is
         * delivering no frames. */
        if (poll_commands(client_fd) < 0) {
            fprintf(stderr, "Client disconnected\n");
            return;
        }

        /* U20CAM: re-apply gain, fit the frame length to the exposure */
        u20_maintain();
    }
}

/* ------------------------------------------------------------------ */
/* Console control handler (replaces Unix signal handlers)             */
/* ------------------------------------------------------------------ */

static BOOL WINAPI console_handler(DWORD dwCtrlType)
{
    switch (dwCtrlType) {
    case CTRL_C_EVENT:
    case CTRL_CLOSE_EVENT:
    case CTRL_BREAK_EVENT:
        InterlockedExchange(&stop_flag, 1);
        return TRUE;
    default:
        return FALSE;
    }
}

/* ------------------------------------------------------------------ */
/* main                                                                */
/* ------------------------------------------------------------------ */

int main(void)
{
    /* Install console control handler */
    SetConsoleCtrlHandler(console_handler, TRUE);

    /* Initialize Winsock */
    WSADATA wsaData;
    if (WSAStartup(MAKEWORD(2, 2), &wsaData) != 0) {
        fprintf(stderr, "WSAStartup failed\n");
        return 1;
    }

    /* Initialize COM */
    HRESULT hr = CoInitializeEx(NULL, COINIT_MULTITHREADED);
    if (FAILED(hr)) {
        fprintf(stderr, "CoInitializeEx failed (hr=0x%08lx)\n", hr);
        WSACleanup();
        return 1;
    }

    /* Build the camera allowlist (built-ins + PUSHNAV_CAMERA_IDS) */
    init_allowlist();

    /* Find camera device (retries for up to 8s if not found immediately) */
    char seen[2048];
    seen[0] = '\0';
    hr = find_device_with_retry(&pCamFilter, seen, sizeof(seen));
    if (FAILED(hr) || pCamFilter == NULL) {
        fprintf(stderr,
                "No allowlisted camera found. Check the USB connection and that "
                "the camera is recognized by Windows. If this is a new camera "
                "model, add its vid:pid to PUSHNAV_CAMERA_IDS.\n");
        if (seen[0])
            fprintf(stderr, "USB video devices seen:\n%s", seen);
        CoUninitialize();
        WSACleanup();
        return 1;
    }

    /* Open and start capture */
    if (open_camera() < 0) {
        fprintf(stderr, "Failed to open camera\n");
        close_camera();
        CoUninitialize();
        WSACleanup();
        return 1;
    }

    /* Disable auto-exposure for manual control */
    disable_auto_exposure();

    /* Innomaker U20CAM-9281M: real gain and longer exposures */
    u20_init();

    /* Create TCP server */
    SOCKET server_fd = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
    if (server_fd == INVALID_SOCKET) {
        fprintf(stderr, "socket() failed: %d\n", WSAGetLastError());
        close_camera();
        CoUninitialize();
        WSACleanup();
        return 1;
    }

    int opt = 1;
    setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR, (const char *)&opt, sizeof(opt));

    struct sockaddr_in addr;
    memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    addr.sin_port = htons(SERVER_PORT);

    /* Bind with retry — port may be in TIME_WAIT from a previous run */
    {
        int bind_attempts = 0;
        const int MAX_BIND_ATTEMPTS = 10;
        const int BIND_RETRY_MS = 500;

        while (bind(server_fd, (struct sockaddr *)&addr, sizeof(addr)) == SOCKET_ERROR) {
            int err = WSAGetLastError();
            bind_attempts++;
            if (bind_attempts >= MAX_BIND_ATTEMPTS) {
                fprintf(stderr, "bind() failed after %d attempts: %d\n",
                        bind_attempts, err);
                closesocket(server_fd);
                close_camera();
                CoUninitialize();
                WSACleanup();
                return 1;
            }
            fprintf(stderr, "bind() failed (err=%d), retrying in %dms (%d/%d)\n",
                    err, BIND_RETRY_MS, bind_attempts, MAX_BIND_ATTEMPTS);
            Sleep(BIND_RETRY_MS);
        }
    }

    if (listen(server_fd, 1) == SOCKET_ERROR) {
        fprintf(stderr, "listen() failed: %d\n", WSAGetLastError());
        closesocket(server_fd);
        close_camera();
        CoUninitialize();
        WSACleanup();
        return 1;
    }

    printf("Listening on 127.0.0.1:%d\n", SERVER_PORT);
    fflush(stdout);

    /* Accept one client */
    while (!InterlockedCompareExchange(&stop_flag, 0, 0)) {
        fd_set readfds;
        struct timeval tv;
        FD_ZERO(&readfds);
        FD_SET(server_fd, &readfds);
        tv.tv_sec = 1;
        tv.tv_usec = 0;

        int ret = select(0, &readfds, NULL, NULL, &tv);
        if (ret <= 0)
            continue;

        struct sockaddr_in client_addr;
        int client_len = sizeof(client_addr);
        SOCKET client_fd = accept(server_fd, (struct sockaddr *)&client_addr,
                                  &client_len);
        if (client_fd == INVALID_SOCKET) {
            fprintf(stderr, "accept() failed: %d\n", WSAGetLastError());
            continue;
        }

        char client_ip[INET_ADDRSTRLEN];
        inet_ntop(AF_INET, &client_addr.sin_addr, client_ip, sizeof(client_ip));
        fprintf(stderr, "Client connected from %s:%d\n",
                client_ip, ntohs(client_addr.sin_port));

        handle_client(client_fd);
        closesocket(client_fd);
        break; /* Single client, exit after disconnect */
    }

    closesocket(server_fd);
    close_camera();
    CoUninitialize();
    WSACleanup();
    fprintf(stderr, "Camera server exiting\n");
    return 0;
}
