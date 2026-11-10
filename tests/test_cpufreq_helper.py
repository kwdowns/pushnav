"""CPU clock cap: evf.engine.cpufreq (runtime) and cpufreq_helper (root)."""

import json
import os
import sys
from pathlib import Path

import pytest

from evf.config.manager import ConfigManager
from evf.engine import cpufreq as cf
from evf.engine import cpufreq_helper as ch

posix_only = pytest.mark.skipif(sys.platform == "win32", reason="needs grp/chown")


def _fake_policy(root, name="policy0", lo=600_000, hi=1_500_000, cur_max=None):
    p = root / name
    p.mkdir(parents=True)
    (p / "cpuinfo_min_freq").write_text(f"{lo}\n")
    (p / "cpuinfo_max_freq").write_text(f"{hi}\n")
    (p / "scaling_max_freq").write_text(f"{cur_max or hi}\n")
    return p


def _max(p):
    return int((p / "scaling_max_freq").read_text())


def _own_group():
    import grp
    return grp.getgrgid(os.getgid()).gr_name


# -- runtime cap (evf.engine.cpufreq) ----------------------------------------

def test_cap_on_off_and_clamping(tmp_path):
    p = _fake_policy(tmp_path)
    cap = cf.CpuFreqCap(cf.find_policies(tmp_path))
    assert cap.available
    cap.apply(True, 1200)
    assert _max(p) == 1_200_000
    cap.apply(False, 1200)
    assert _max(p) == 1_500_000
    cap.apply(True, 100)
    assert _max(p) == 600_000
    cap.apply(True, 5000)
    assert _max(p) == 1_500_000


def test_every_policy_is_capped(tmp_path):
    a = _fake_policy(tmp_path, "policy0")
    b = _fake_policy(tmp_path, "policy4", hi=2_400_000)
    cf.CpuFreqCap(cf.find_policies(tmp_path)).apply(True, 1200)
    assert _max(a) == _max(b) == 1_200_000


def test_no_policies_means_unavailable(tmp_path):
    assert cf.find_policies(tmp_path / "missing") == []
    assert not cf.CpuFreqCap([]).available


def test_apply_survives_a_bad_policy(tmp_path):
    p = _fake_policy(tmp_path)
    (p / "cpuinfo_max_freq").write_text("garbage")
    cf.CpuFreqCap([p]).apply(True, 1200)  # logs, doesn't raise


def test_config_defaults_and_setter(tmp_path):
    cfg = ConfigManager(config_dir=tmp_path / "cfg")
    assert cfg.cpu_cap is True
    assert cfg.max_freq_mhz == 1200
    cfg.cpu_cap = False
    assert ConfigManager(config_dir=tmp_path / "cfg").cpu_cap is False


# -- root helper (evf.engine.cpufreq_helper) ---------------------------------

@posix_only
def test_take_then_restore_round_trip(tmp_path):
    root, state = tmp_path / "cpufreq", tmp_path / "state"
    p = _fake_policy(root)
    mode = (p / "scaling_max_freq").stat().st_mode
    ch.take(root, state, _own_group(), True, 1200)
    assert _max(p) == 1_200_000
    assert (p / "scaling_max_freq").stat().st_mode & 0o020  # group-writable
    ch.restore(root, state)
    assert _max(p) == 1_500_000
    assert (p / "scaling_max_freq").stat().st_mode == mode
    assert not list(state.glob("*.json"))


@posix_only
def test_take_with_cap_off_leaves_full_clock(tmp_path):
    root, state = tmp_path / "cpufreq", tmp_path / "state"
    p = _fake_policy(root, cur_max=1_000_000)
    ch.take(root, state, _own_group(), False, 1200)
    assert _max(p) == 1_500_000
    ch.restore(root, state)
    assert _max(p) == 1_000_000


@posix_only
def test_second_take_keeps_the_original_value(tmp_path):
    root, state = tmp_path / "cpufreq", tmp_path / "state"
    p = _fake_policy(root, cur_max=1_800_000, hi=1_800_000)
    ch.take(root, state, _own_group(), True, 1200)
    ch.take(root, state, _own_group(), True, 1000)
    ch.restore(root, state)
    assert _max(p) == 1_800_000


def test_no_cpufreq_is_a_noop(tmp_path):
    ch.take(tmp_path / "missing", tmp_path / "state", "nogroup", True, 1200)
    ch.restore(tmp_path / "missing", tmp_path / "state")
    assert not (tmp_path / "state").exists()


@pytest.mark.parametrize("config, expected", [
    (None, (True, 1200)),                               # no config file
    ({}, (True, 1200)),                                 # no power section
    ({"power": {"cpu_cap": False}}, (False, 1200)),
    ({"power": {"max_freq_mhz": 1000}}, (True, 1000)),
    ({"power": {"max_freq_mhz": 0}}, (True, 1200)),     # bad value: default
    ({"power": {"max_freq_mhz": "fast"}}, (True, 1200)),
    ({"power": {"max_freq_mhz": True}}, (True, 1200)),
    ("not json", (True, 1200)),
])
def test_power_config(tmp_path, config, expected):
    path = tmp_path / "config.json"
    if config == "not json":
        path.write_text("{")
    elif config is not None:
        path.write_text(json.dumps(config))
    assert ch.power_config(path) == expected


def test_main_never_fails(tmp_path):
    root = tmp_path / "cpufreq"
    _fake_policy(root)
    state = tmp_path / "state"
    assert ch.main(["take", "--group", "no-such-group-xyz", "--root", str(root),
                    "--state-dir", str(state),
                    "--config", str(tmp_path / "none.json")]) == 0
    state.mkdir(exist_ok=True)
    (state / "policy0.json").write_text("{")
    assert ch.main(["restore", "--root", str(root), "--state-dir", str(state)]) == 0


def test_service_unit_takes_and_restores_the_clock():
    unit = (Path(__file__).resolve().parents[1]
            / "packaging/headless/pushnav-headless.service").read_text()
    assert "-m evf.engine.cpufreq_helper take --group pushnav" in unit
    assert "ExecStopPost=+" in unit and "-m evf.engine.cpufreq_helper restore" in unit
