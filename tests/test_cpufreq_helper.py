"""evf.engine.cpufreq_helper — CPU clock cap for the headless Pi service."""

import json

import pytest

from evf.engine import cpufreq_helper as ch


def _fake_policy(root, name="policy0", lo=600_000, hi=1_500_000, cur_max=None):
    p = root / name
    p.mkdir(parents=True)
    (p / "cpuinfo_min_freq").write_text(f"{lo}\n")
    (p / "cpuinfo_max_freq").write_text(f"{hi}\n")
    (p / "scaling_max_freq").write_text(f"{cur_max or hi}\n")
    return p


def _max(p):
    return int((p / "scaling_max_freq").read_text())


def test_limit_then_restore_round_trip(tmp_path):
    root, state = tmp_path / "cpufreq", tmp_path / "state"
    p = _fake_policy(root)
    ch.limit(root, state, 1200)
    assert _max(p) == 1_200_000
    ch.restore(root, state)
    assert _max(p) == 1_500_000
    assert not list(state.glob("*.json"))


def test_cap_is_clamped_to_the_hardware_range(tmp_path):
    root, state = tmp_path / "cpufreq", tmp_path / "state"
    p = _fake_policy(root)
    ch.limit(root, state, 100)
    assert _max(p) == 600_000
    ch.limit(root, state, 5000)
    assert _max(p) == 1_500_000


def test_second_limit_keeps_the_original_value(tmp_path):
    root, state = tmp_path / "cpufreq", tmp_path / "state"
    p = _fake_policy(root, cur_max=1_800_000, hi=1_800_000)
    ch.limit(root, state, 1200)
    ch.limit(root, state, 1000)
    ch.restore(root, state)
    assert _max(p) == 1_800_000


def test_every_policy_is_capped(tmp_path):
    root, state = tmp_path / "cpufreq", tmp_path / "state"
    a = _fake_policy(root, "policy0")
    b = _fake_policy(root, "policy4", hi=2_400_000)
    ch.limit(root, state, 1200)
    assert _max(a) == _max(b) == 1_200_000


def test_no_cpufreq_is_a_noop(tmp_path):
    ch.limit(tmp_path / "missing", tmp_path / "state", 1200)
    ch.restore(tmp_path / "missing", tmp_path / "state")
    assert not (tmp_path / "state").exists()


@pytest.mark.parametrize("config, expected", [
    (None, 1200),                                  # no config file: default
    ({}, 1200),                                    # no power section: default
    ({"power": {"max_freq_mhz": 1000}}, 1000),
    ({"power": {"max_freq_mhz": None}}, None),     # off
    ({"power": {"max_freq_mhz": 0}}, None),
    ({"power": {"max_freq_mhz": False}}, None),
    ({"power": {"max_freq_mhz": "fast"}}, None),
    ({"power": {"max_freq_mhz": 1.5}}, None),
    ("not json", 1200),
])
def test_max_freq_mhz(tmp_path, config, expected):
    path = tmp_path / "config.json"
    if config == "not json":
        path.write_text("{")
    elif config is not None:
        path.write_text(json.dumps(config))
    assert ch.max_freq_mhz(path) == expected


def test_main_limit_respects_disabled_config(tmp_path):
    root, state = tmp_path / "cpufreq", tmp_path / "state"
    p = _fake_policy(root)
    cfg = tmp_path / "config.json"
    cfg.write_text(json.dumps({"power": {"max_freq_mhz": None}}))
    assert ch.main(["limit", "--root", str(root), "--state-dir", str(state),
                    "--config", str(cfg)]) == 0
    assert _max(p) == 1_500_000


def test_main_never_fails(tmp_path):
    root = tmp_path / "cpufreq"
    p = _fake_policy(root)
    (p / "cpuinfo_max_freq").write_text("garbage")
    state = tmp_path / "state"
    assert ch.main(["limit", "--root", str(root), "--state-dir", str(state),
                    "--config", str(tmp_path / "none.json")]) == 0
    (state / "policy0.json").write_text("{")
    assert ch.main(["restore", "--root", str(root), "--state-dir", str(state)]) == 0


def test_service_unit_limits_and_restores_the_clock():
    from pathlib import Path
    unit = (Path(__file__).resolve().parents[1]
            / "packaging/headless/pushnav-headless.service").read_text()
    assert "ExecStartPre=+" in unit and "-m evf.engine.cpufreq_helper limit" in unit
    assert "ExecStopPost=+" in unit and "-m evf.engine.cpufreq_helper restore" in unit
