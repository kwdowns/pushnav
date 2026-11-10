"""Web server port: default 8780, and configs on the old default 8765 move."""

import json

from evf.config.manager import ConfigManager


def test_default_port(tmp_path):
    assert ConfigManager(config_dir=tmp_path).web_port == 8780


def test_old_default_port_moves_to_the_new_one(tmp_path):
    (tmp_path / "config.json").write_text(
        json.dumps({"version": 1, "webserver": {"port": 8765}}))
    assert ConfigManager(config_dir=tmp_path).web_port == 8780
    saved = json.loads((tmp_path / "config.json").read_text())
    assert saved["webserver"]["port"] == 8780


def test_a_chosen_port_is_kept(tmp_path):
    (tmp_path / "config.json").write_text(
        json.dumps({"version": 1, "webserver": {"port": 9000}}))
    assert ConfigManager(config_dir=tmp_path).web_port == 9000
