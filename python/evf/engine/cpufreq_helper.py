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

"""Root helper that lets PushNav cap the Pi's CPU clock, and undoes it.

Run by the pushnav-headless service as root, outside its sandbox:

    ExecStartPre=+... -m evf.engine.cpufreq_helper take --group pushnav
    ExecStopPost=+... -m evf.engine.cpufreq_helper restore

`take` saves each cpufreq policy's `scaling_max_freq` and its file
ownership to /run (tmpfs, so it never outlives a boot), applies the cap
from config.json (`power.cpu_cap`, `power.max_freq_mhz`) and lets the
group write the file, so the engine (evf.engine.cpufreq) can switch the
cap from the Settings panel. `restore` puts everything back; ExecStopPost
also runs after a crash.

Both commands always exit 0: a missing or odd cpufreq interface must
never stop PushNav from starting.

For development on the Pi: `sudo uv run python -m evf.engine.cpufreq_helper
take --group "$(id -gn)" --config ~/.config/electronic-viewfinder/config.json`,
and `restore` when done.
"""

import argparse
import json
import logging
import os
import stat
import sys
from pathlib import Path

from evf.config.manager import DEFAULT_CONFIG, _default_config_dir
from evf.engine.cpufreq import CPUFREQ_SYSFS, cap_policy

logger = logging.getLogger("evf.cpufreq_helper")

STATE_DIR = Path("/run/pushnav-headless-cpufreq")


def power_config(config_path: Path) -> tuple[bool, int]:
    """(`power.cpu_cap`, `power.max_freq_mhz`) from config.json.

    Missing or unreadable values mean the defaults. Read-only on purpose:
    this runs as root and must never create or rewrite the service user's
    config file.
    """
    defaults = DEFAULT_CONFIG["power"]
    try:
        with open(config_path) as f:
            power = json.load(f).get("power", {})
        enabled = power.get("cpu_cap", defaults["cpu_cap"])
        mhz = power.get("max_freq_mhz", defaults["max_freq_mhz"])
    except (OSError, ValueError, AttributeError):
        return defaults["cpu_cap"], defaults["max_freq_mhz"]
    if isinstance(mhz, bool) or not isinstance(mhz, int) or mhz <= 0:
        mhz = defaults["max_freq_mhz"]
    return enabled is not False, mhz


def _policies(root: Path) -> list[Path]:
    return sorted(p for p in root.glob("policy*")
                  if (p / "scaling_max_freq").exists())


def take(root: Path, state_dir: Path, group: str, enabled: bool, mhz: int) -> None:
    policies = _policies(root)
    if not policies:
        logger.info("no cpufreq policies under %s; nothing to do", root)
        return
    import grp  # POSIX only; imported here so the module loads anywhere

    gid = grp.getgrnam(group).gr_gid
    state_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
    for policy in policies:
        try:
            _take_one(policy, state_dir, gid, mhz if enabled else None)
        except (OSError, ValueError) as exc:
            logger.warning("%s: take failed: %s", policy.name, exc)


def _take_one(policy: Path, state_dir: Path, gid: int, mhz: int | None) -> None:
    max_file = policy / "scaling_max_freq"
    saved = state_dir / f"{policy.name}.json"
    # Keep the first saved state: a second `take` (restart without a
    # restore in between) would otherwise record our own cap.
    if not saved.exists():
        st = max_file.stat()
        saved.write_text(json.dumps({
            "scaling_max_freq": int(max_file.read_text().strip()),
            "uid": st.st_uid,
            "gid": st.st_gid,
            "mode": stat.S_IMODE(st.st_mode),
        }))
    khz = cap_policy(policy, mhz)
    os.chown(max_file, -1, gid)
    os.chmod(max_file, stat.S_IMODE(max_file.stat().st_mode) | stat.S_IWGRP)
    logger.info("%s: max clock %d MHz (cap %s), writable by gid %d",
                policy.name, khz // 1000, "on" if mhz else "off", gid)


def restore(root: Path, state_dir: Path) -> None:
    if not state_dir.is_dir():
        return
    for saved in sorted(state_dir.glob("*.json")):
        policy = root / saved.stem
        try:
            s = json.loads(saved.read_text())
            max_file = policy / "scaling_max_freq"
            os.chown(max_file, s["uid"], s["gid"])
            os.chmod(max_file, s["mode"])
            max_file.write_text(str(int(s["scaling_max_freq"])))
            logger.info("%s: max clock restored to %d MHz",
                        policy.name, int(s["scaling_max_freq"]) // 1000)
        except (OSError, ValueError, KeyError, TypeError) as exc:
            logger.warning("%s: restore failed: %s", policy.name, exc)
        saved.unlink(missing_ok=True)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m evf.engine.cpufreq_helper")
    parser.add_argument("action", choices=["take", "restore"])
    parser.add_argument("--group", default="pushnav")
    parser.add_argument("--root", type=Path, default=CPUFREQ_SYSFS)
    parser.add_argument("--state-dir", type=Path, default=STATE_DIR)
    parser.add_argument("--config", type=Path,
                        default=_default_config_dir() / "config.json")
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="cpufreq_helper: %(message)s",
                        stream=sys.stderr)
    try:
        if args.action == "take":
            enabled, mhz = power_config(args.config)
            take(args.root, args.state_dir, args.group, enabled, mhz)
        else:
            restore(args.root, args.state_dir)
    except Exception as exc:  # never block the service
        logger.warning("%s failed: %s", args.action, exc)
    return 0


if __name__ == "__main__":
    sys.exit(main())
