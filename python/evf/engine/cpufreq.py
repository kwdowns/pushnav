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

"""CPU clock cap (headless Pi power saving), switchable at runtime.

A plate solve takes tens of milliseconds and an exposure most of a
second, so the CPU has slack to run slower. The cap lowers each cpufreq
policy's `scaling_max_freq`; the governor is left alone, so the CPU
still idles at its lowest clock.

Writing `scaling_max_freq` needs root, which the engine doesn't have:
the pushnav-headless service's root helper (evf.engine.cpufreq_helper)
saves the original value and lets group pushnav write the file. Without
that (desktop builds, development) no policy is writable and the cap is
simply unavailable.
"""

import logging
import os
import threading
from pathlib import Path

logger = logging.getLogger(__name__)

CPUFREQ_SYSFS = Path("/sys/devices/system/cpu/cpufreq")


def find_policies(root: Path = CPUFREQ_SYSFS) -> list[Path]:
    """cpufreq policy directories whose scaling_max_freq this process may write."""
    try:
        candidates = sorted(root.glob("policy*"))
    except OSError:
        return []
    return [p for p in candidates
            if os.access(p / "scaling_max_freq", os.W_OK)]


def _read_khz(path: Path) -> int:
    return int(path.read_text().strip())


def cap_policy(policy: Path, mhz: int | None) -> int:
    """Set one policy's top clock to `mhz`, or its hardware max for None.

    The value is clamped to the hardware range. Returns the kHz written.
    """
    hw_min = _read_khz(policy / "cpuinfo_min_freq")
    hw_max = _read_khz(policy / "cpuinfo_max_freq")
    target = hw_max if mhz is None else max(hw_min, min(mhz * 1000, hw_max))
    (policy / "scaling_max_freq").write_text(str(target))
    return target


class CpuFreqCap:
    """Applies the configured cap to every writable policy."""

    def __init__(self, policies: list[Path]) -> None:
        self._policies = policies
        self._lock = threading.Lock()

    @property
    def available(self) -> bool:
        return bool(self._policies)

    def apply(self, enabled: bool, mhz: int) -> None:
        """Cap at `mhz` when enabled, else let the CPU reach its full clock."""
        with self._lock:
            for policy in self._policies:
                try:
                    khz = cap_policy(policy, mhz if enabled else None)
                    logger.info("CPU clock cap %s: %s max %d MHz",
                                "on" if enabled else "off", policy.name, khz // 1000)
                except (OSError, ValueError) as exc:
                    logger.warning("CPU clock cap: cannot set %s (%s)", policy.name, exc)
