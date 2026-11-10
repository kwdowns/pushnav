"""LatestFrame.wait_for_newer — consumers sleep until a new frame arrives."""

import threading
import time

from evf.engine.frame_buffer import LatestFrame


def test_returns_at_once_when_a_newer_frame_is_there():
    buf = LatestFrame()
    buf.set(b"a", 1.0, 1)
    t0 = time.monotonic()
    data, _, fid = buf.wait_for_newer(-1, timeout=5.0)
    assert (data, fid) == (b"a", 1)
    assert time.monotonic() - t0 < 0.5


def test_wakes_when_a_frame_is_set():
    buf = LatestFrame()
    buf.set(b"a", 1.0, 1)
    timer = threading.Timer(0.1, buf.set, args=(b"b", 2.0, 2))
    timer.start()
    try:
        t0 = time.monotonic()
        data, _, fid = buf.wait_for_newer(1, timeout=5.0)
        elapsed = time.monotonic() - t0
    finally:
        timer.cancel()
    assert (data, fid) == (b"b", 2)
    assert 0.05 < elapsed < 2.0


def test_times_out_with_the_same_frame():
    buf = LatestFrame()
    buf.set(b"a", 1.0, 1)
    t0 = time.monotonic()
    data, _, fid = buf.wait_for_newer(1, timeout=0.1)
    assert (data, fid) == (b"a", 1)
    assert time.monotonic() - t0 >= 0.09


def test_times_out_when_empty():
    buf = LatestFrame()
    data, _, _ = buf.wait_for_newer(-1, timeout=0.05)
    assert data is None


def test_stale_set_does_not_wake_a_waiter():
    buf = LatestFrame()
    buf.set(b"a", 1.0, 5)
    threading.Timer(0.05, buf.set, args=(b"old", 0.5, 3)).start()
    data, _, fid = buf.wait_for_newer(5, timeout=0.2)
    assert (data, fid) == (b"a", 5)
