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

"""Thread-safe single-frame buffer. Only stores the most recent frame."""

import threading


class LatestFrame:
    """Latest-frame buffer — no queue, no history.

    set() overwrites unconditionally.
    get() returns a snapshot (jpeg_bytes, timestamp, frame_id) or None.
    wait_for_newer() blocks until a frame other than the caller's last one
    arrives, so consumers sleep between frames instead of polling (long
    exposures deliver ~1 frame/s; polling at 100 Hz kept the Pi's CPU awake).
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._new_frame = threading.Condition(self._lock)
        self._jpeg_bytes: bytes | None = None
        self._timestamp: float = 0.0
        self._frame_id: int = 0

    def set(self, jpeg_bytes: bytes, timestamp: float, frame_id: int) -> None:
        with self._lock:
            if frame_id <= self._frame_id:
                return  # reject stale / lower-priority frames
            self._jpeg_bytes = jpeg_bytes
            self._timestamp = timestamp
            self._frame_id = frame_id
            self._new_frame.notify_all()

    def get(self) -> tuple[bytes | None, float, int]:
        """Return (jpeg_bytes, timestamp, frame_id). jpeg_bytes is None if empty."""
        with self._lock:
            return self._jpeg_bytes, self._timestamp, self._frame_id

    def wait_for_newer(
        self, last_frame_id: int, timeout: float
    ) -> tuple[bytes | None, float, int]:
        """Wait up to `timeout` s for a frame whose id isn't `last_frame_id`.

        Returns the same snapshot as get(). On timeout that snapshot may
        still be the caller's last frame (or empty), so callers compare ids
        as they did with get().
        """
        with self._lock:
            self._new_frame.wait_for(
                lambda: self._jpeg_bytes is not None
                and self._frame_id != last_frame_id,
                timeout,
            )
            return self._jpeg_bytes, self._timestamp, self._frame_id

    def clear(self) -> None:
        with self._lock:
            self._jpeg_bytes = None
            self._timestamp = 0.0
            self._frame_id = 0
