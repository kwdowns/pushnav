"""Tests for /ws JSON payload schema."""

import io
import json

from PIL import Image

from evf.config.manager import ConfigManager
from evf.engine.frame_buffer import LatestFrame
from evf.engine.goto_target import GotoTarget
from evf.engine.pointing import PointingState
from evf.engine.state import StateMachine
from evf.webserver.server import WebServer


def test_payload_contains_new_fields(tmp_path, monkeypatch):
    monkeypatch.setenv("HOME", str(tmp_path))
    ws = WebServer(
        PointingState(), StateMachine(), GotoTarget(), ConfigManager(config_dir=tmp_path / "evf-config"),
        frame_buffer=LatestFrame(),
        camera_controls=lambda: [
            {"id": "exposure", "label": "Exposure", "min": 0, "max": 100, "step": 1, "value": 50, "unit": "ms"},
        ],
        sync_state=lambda: {
            "in_progress": False, "candidates": [], "selected_idx": None, "error": None,
        },
        activity=lambda: {
            "stellarium": {"active": False, "address": "localhost:10001"},
            "lx200":      {"active": False, "address": "0.0.0.0:4030"},
            "webserver":  {"url": "http://192.168.1.42:8765"},
            "audio_enabled": True,
        },
    )
    payload = ws._build_payload()
    # Existing fields still present
    assert "state" in payload
    assert "pointing" in payload
    # New fields
    assert "controls" in payload and isinstance(payload["controls"], list)
    assert "sync" in payload and "in_progress" in payload["sync"]
    assert "stellarium" in payload and "active" in payload["stellarium"]
    assert "lx200" in payload
    assert "webserver" in payload
    assert "audio_enabled" in payload
    assert "camera" in payload  # centroid arrays
    # Roundtrip JSON-serializable
    assert json.dumps(payload)


def test_payload_contains_location_field(tmp_path, monkeypatch):
    monkeypatch.setenv("HOME", str(tmp_path))
    cfg = ConfigManager(config_dir=tmp_path / "evf-config")
    ws = WebServer(
        PointingState(), StateMachine(), GotoTarget(), cfg,
        frame_buffer=LatestFrame(),
        location=lambda: {
            "latitude": 13.0878,
            "longitude": 80.2785,
            "source": "manual",
        },
    )
    payload = ws._build_payload()
    assert "location" in payload
    assert payload["location"]["source"] == "manual"
    assert payload["location"]["latitude"] == 13.0878


def _jpeg(w: int, h: int) -> bytes:
    buf = io.BytesIO()
    Image.new("L", (w, h), 0).save(buf, format="JPEG")
    return buf.getvalue()


def test_payload_image_size_follows_frames(tmp_path, monkeypatch):
    """image_w / image_h and the uncalibrated origin come from the frames."""
    monkeypatch.setenv("HOME", str(tmp_path))
    fb = LatestFrame()
    ws = WebServer(
        PointingState(), StateMachine(), GotoTarget(),
        ConfigManager(config_dir=tmp_path / "evf-config"),
        frame_buffer=fb,
    )

    # No frame yet: the OV9281's full frame
    payload = ws._build_payload()
    assert (payload["image_w"], payload["image_h"]) == (1280, 800)

    fb.set(_jpeg(1280, 720), 0.0, 1)
    payload = ws._build_payload()
    assert (payload["image_w"], payload["image_h"]) == (1280, 720)
    assert (payload["origin_x"], payload["origin_y"]) == (640.0, 360.0)

    fb.set(_jpeg(1280, 800), 0.1, 2)
    payload = ws._build_payload()
    assert (payload["image_w"], payload["image_h"]) == (1280, 800)
    assert (payload["origin_x"], payload["origin_y"]) == (640.0, 400.0)

    # A frame that isn't a JPEG keeps the last good size
    fb.set(b"not a jpeg", 0.2, 3)
    payload = ws._build_payload()
    assert (payload["image_w"], payload["image_h"]) == (1280, 800)
