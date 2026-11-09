---
title: Camera & Lens
---

## Sample Frame @ Bortle 8.5

**M45 (Pleiades), invisible to the naked eye from a Bortle 8.5 sky in Chennai, India.** The camera captures it clearly in a single short exposure. Naked-eye limiting magnitude here is around 2.3 mag; the camera reaches about 6.3 mag. Four magnitudes of improvement means roughly 40× more stars in the frame, plenty for a reliable plate-solve.

![Sample Frame](assets/single_frame_bortle8.png)

- Bortle 8.5 city sky (Chennai, India), under a hazy light-pollution dome.
- Naked-eye visual limiting magnitude here: around 2.3 mag.
- Sensor + F2.4 lens captures stars down to about 6.3 mag in this sky, with good plate-solve confidence.
- More than 40 stars detected per frame, well above the threshold for a reliable solve.
- Rule of thumb: each magnitude of fainter detection adds roughly 2.5× more stars in the frame, so 4 magnitudes ≈ 40× more visible stars.

## Quick Specs

```text
QUICK SPECS

Camera:       OV9281, 1MP mono, USB UVC
Lens:         M12, 25mm, F/2.4
FOV:          8.86° × 4.98°
Pixel scale:  24.9″/px
Plate-solve mag (Bortle 8.5):  ~6.3
Cost:         $41 USD (camera + lens)
```

## Supported Hardware

These OV9281-based USB cameras are recognized automatically (matched by USB VID/PID):

| Camera | Status |
|---|---|
| [Waveshare OV9281 1MP Mono USB Camera](https://www.waveshare.com/ov9281-1mp-usb-camera-a.htm) [$26] | Supported (reference) |
| Arducam OV9281 | Beta — awaiting results |
| DECXIN OV9281 | Beta — awaiting results |
| [Innomaker U20CAM-9281M](https://www.inno-maker.com/product/u20cam-9281m/) | Beta — awaiting results. 32 × 32 mm board, so it needs its own housing (`housing_u20cam.scad`). Ships with a 2.8 mm wide-angle lens; replace it with the 25 mm lens below. Its firmware ignores the standard gain control and caps exposure near 100 ms; PushNav works around both (see below) |

**Lens**: [M12 Mount 25mm F2.4 Lens](https://www.seeedstudio.com/5MP-25mm-lens-p-5579.html) [$15]

These are reference suppliers. The **OV9281** module itself is widely sold by Arducam, Innomaker, AliExpress and others, and any M12 25mm F/2.4 lens with the correct mount works. If a link above goes dead, search the sensor name (`OV9281`) and lens specs and pick any reputable seller — the parts themselves are commodity.

### Innomaker U20CAM-9281M: gain and exposure

The U20CAM uses a Sonix SN9C286 USB bridge whose firmware accepts the standard UVC gain control but never passes it to the sensor (which stays at 2×), and which lowers the frame rate by lengthening each line rather than the frame, so exposures stop getting longer at about 100 ms. PushNav detects the camera by its USB ID and works around both through the bridge's vendor extension unit:

- **Gain** becomes a real analog gain from 1.0× to 15.5×, shown as e.g. "8.0×".
- **Exposure** runs to about 1 s: PushNav stretches the sensor's frame to fit the exposure, so the preview slows to about 1 frame per second at the longest settings. The exposure the app shows is the real one, about twice the value the camera reports.

Nothing is written to the camera's firmware; unplugging it restores its stock behaviour.

## Why This Camera and Lens

- Off the shelf, affordable, and widely available
- For use in urban light polluted skies:
    - Mono sensor provides substantially better sensitivity and contrast for star detection compared to a color sensor
    - F2.4 aperture provides good light gathering power required to detect faint stars in light polluted urban skies
    - 25mm focal length in combination with the OV9281's 1/4" sensor size provides a ~8° field of view which is a good balance between having enough stars for reliable plate-solving and speed of solving
    - In my Bortle 8 city sky with a visual limiting magnitude of around 2.5, this camera/lens combo can reliably detect and plate-solve on stars down to about magnitude 6.5
- Standard USB (UVC) interface allows for cross-platform compatibility without needing custom drivers
- Calculated image scale and field of view (Astrometry results):
    - Size:	8.86° x 4.98° 
    - Radius: 5.081°
    - Pixel scale: 24.9 arcsec/pixel

>The Waveshare OV9281 combination is the fully verified setup; the other OV9281 modules listed above are in beta, awaiting field results. Support for additional cameras and lenses may be added in the future based on demand and usability. I decided to keep it this way for now to ensure a consistent and reliable user experience. Also this combination is very affordable and widely available, so it should be accessible for most users.

## Adding Support for More Cameras

- Adding the camera's VID/PID to the camera server's supported device list and implementing any necessary quirks for frame capture (if required)
- Generating the tetra3rs star catalog for the new camera/lens's field of view and plate scale (via `scripts/build_tetra3rs_catalog.py`).
