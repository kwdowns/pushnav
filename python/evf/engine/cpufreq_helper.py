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

"""Root helper that caps the Pi's CPU clock while PushNav runs.

Run by the pushnav-headless service as root, outside its sandbox:

    ExecStartPre=+... -m evf.engine.cpufreq_helper limit
    ExecStopPost=+... -m evf.engine.cpufreq_helper restore

A plate solve takes tens of milliseconds and an exposure takes most of a
second, so the CPU has plenty of slack: `limit` lowers each cpufreq
policy's `scaling_max_freq` to `power.max_freq_mhz` from config.json and
leaves the governor alone, so the CPU still drops to its lowest clock
when idle. The original value is saved to /run (tmpfs, so it never
outlives a boot) and `restore` puts it back; ExecStopPost also runs after
a crash.

Both commands always exit 0: a missing or odd cpufreq interface must
never stop PushNav from starting.

For development on the Pi: `sudo uv run python -m evf.engine.cpufreq_helper
limit --config ~/.config/electronic-viewfinder/config.json`, and `restore`
when done.
"""

import argparse
import json
import logging
import sys
from pathlib import Path

from evf.config.manager import DEFAULT_CONFIG, _default_config_dir

logger = logging.getLogger("evf.cpufreq_helper")

CPUFREQ_SYSFS = Path("/sys/devices/system/cpu/cpufreq")
STATE_DIR = Path("/run/pushnav-headless-cpufreq")


def max_freq_mhz(config_path: Path) -> int | None:
    """`power.max_freq_mhz` from config.json, or None to leave the clock alone.

    A missing file or key means the default. null, 0, false or anything
    that isn't a positive whole number turns the cap off. Read-only on
    purpose: this runs as root and must never create or rewrite the
    service user's config file.
    """
    default = DEFAULT_CONFIG["power"]["max_freq_mhz"]
    try:
        with open(config_path) as f:
            power = json.load(f).get("power", {})
        value = power.get("max_freq_mhz", default)
    except (OSError, ValueError, AttributeError):
        value = default
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        return None
    return value


def _policies(root: Path) -> list[Path]:
    return sorted(p for p in root.glob("policy*")
                  if (p / "scaling_max_freq").exists())


def _read_khz(path: Path) -> int:
    return int(path.read_text().strip())


def limit(root: Path, state_dir: Path, mhz: int) -> None:
    policies = _policies(root)
    if not policies:
        logger.info("no cpufreq policies under %s; nothing to do", root)
        return
    state_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
    for policy in policies:
        try:
            _limit_one(policy, state_dir, mhz * 1000)
        except (OSError, ValueError) as exc:
            logger.warning("%s: limit failed: %s", policy.name, exc)


def _limit_one(policy: Path, state_dir: Path, cap_khz: int) -> None:
    max_file = policy / "scaling_max_freq"
    saved = state_dir / f"{policy.name}.json"
    # Keep the first saved value: a second `limit` (restart without a
    # restore in between) would otherwise record our own cap.
    if not saved.exists():
        saved.write_text(json.dumps({"scaling_max_freq": _read_khz(max_file)}))
    hw_min = _read_khz(policy / "cpuinfo_min_freq")
    hw_max = _read_khz(policy / "cpuinfo_max_freq")
    target = max(hw_min, min(cap_khz, hw_max))
    max_file.write_text(str(target))
    logger.info("%s: max clock %d MHz (hardware %d-%d MHz)", policy.name,
                target // 1000, hw_min // 1000, hw_max // 1000)


def restore(root: Path, state_dir: Path) -> None:
    if not state_dir.is_dir():
        return
    for saved in sorted(state_dir.glob("*.json")):
        policy = root / saved.stem
        try:
            khz = int(json.loads(saved.read_text())["scaling_max_freq"])
            (policy / "scaling_max_freq").write_text(str(khz))
            logger.info("%s: max clock restored to %d MHz", policy.name, khz // 1000)
        except (OSError, ValueError, KeyError, TypeError) as exc:
            logger.warning("%s: restore failed: %s", policy.name, exc)
        saved.unlink(missing_ok=True)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m evf.engine.cpufreq_helper")
    parser.add_argument("action", choices=["limit", "restore"])
    parser.add_argument("--root", type=Path, default=CPUFREQ_SYSFS)
    parser.add_argument("--state-dir", type=Path, default=STATE_DIR)
    parser.add_argument("--config", type=Path,
                        default=_default_config_dir() / "config.json")
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="cpufreq_helper: %(message)s",
                        stream=sys.stderr)
    try:
        if args.action == "limit":
            mhz = max_freq_mhz(args.config)
            if mhz is None:
                logger.info("power.max_freq_mhz is off in %s; leaving the clock alone",
                            args.config)
            else:
                limit(args.root, args.state_dir, mhz)
        else:
            restore(args.root, args.state_dir)
    except Exception as exc:  # never block the service
        logger.warning("%s failed: %s", args.action, exc)
    return 0


if __name__ == "__main__":
    sys.exit(main())
