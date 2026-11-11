# Copyright (C) 2026 Arun Venkataswamy
#
# This file is part of PushNav.
#
# PushNav is free software: you can redistribute it and/or modify it
# under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# PushNav is distributed in the hope that it will be useful, but
# WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
# General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with PushNav. If not, see <https://www.gnu.org/licenses/>.

"""Generate the PWA / home-screen icons in web/public/.

The branding (marketing/logo.png) is a white glyph on a red gradient. The
UI is strictly red-on-black for night vision, so this takes the glyph's
brightness (its green channel, which the red background doesn't have) as a
mask and paints it pure red (#ff0000) on #0a0000.

Usage (from the repo root):  uv run python scripts/make_pwa_icons.py
"""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "marketing" / "logo.png"
OUT = ROOT / "web" / "public"

BACKGROUND = (10, 0, 0)  # #0a0000
FOREGROUND = (255, 0, 0)  # #ff0000


def glyph_mask() -> Image.Image:
    """Alpha mask of the logo glyph, cropped to its bounding box."""
    src = Image.open(SOURCE).convert("RGB")
    mask = src.getchannel("G").point(lambda v: 0 if v < 8 else v)
    return mask.crop(mask.getbbox())


def render(size: int, glyph_fraction: float, mask: Image.Image) -> Image.Image:
    """Square icon with the glyph `glyph_fraction` of the canvas wide."""
    # Draw at 4x and downsample for clean edges.
    big = size * 4
    gw = round(big * glyph_fraction)
    gh = round(gw * mask.height / mask.width)
    m = mask.resize((gw, gh), Image.LANCZOS)
    canvas = Image.new("RGB", (big, big), BACKGROUND)
    solid = Image.new("RGB", (gw, gh), FOREGROUND)
    canvas.paste(solid, ((big - gw) // 2, (big - gh) // 2), m)
    return canvas.resize((size, size), Image.LANCZOS)


def main() -> None:
    mask = glyph_mask()
    # Maskable: all content must sit inside the central 80% circle; a glyph
    # 52% of the width has its corners at ~31% radius, well inside 40%.
    icons = {
        "icon-192.png": (192, 0.66),
        "icon-512.png": (512, 0.66),
        "icon-maskable-512.png": (512, 0.52),
        "apple-touch-icon.png": (180, 0.66),
    }
    for name, (size, frac) in icons.items():
        render(size, frac, mask).save(OUT / name, optimize=True)
        print("wrote", OUT / name)


if __name__ == "__main__":
    main()
