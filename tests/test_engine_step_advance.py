"""Engine.step_advance — a double tap runs the wizard step once."""

import threading
from unittest.mock import MagicMock

from evf.config.manager import ConfigManager
from evf.engine.engine import Engine
from evf.engine.state import EngineState


def _engine_at_sync_confirm(tmp_path):
    eng = Engine(dev_mode=False, config=ConfigManager(config_dir=tmp_path / "cfg"))
    sm = eng._state_machine
    for st in (EngineState.SETUP, EngineState.SYNC, EngineState.SYNC_CONFIRM):
        if sm.state != st:
            sm.transition(st)
    eng._camera_client = MagicMock()
    return eng


def test_second_press_while_first_runs_is_ignored(tmp_path, monkeypatch):
    eng = _engine_at_sync_confirm(tmp_path)
    monkeypatch.setattr(type(eng), "camera_connected", property(lambda self: True))
    entered, release = threading.Event(), threading.Event()
    calls = []

    def slow_confirm():
        calls.append(1)
        entered.set()
        release.wait(5)
        eng._state_machine.transition(EngineState.CALIBRATE)

    eng._confirm_sync = slow_confirm
    first = threading.Thread(target=eng.step_advance)
    first.start()
    assert entered.wait(5)
    eng.step_advance()  # the double tap, while the first is mid-step
    release.set()
    first.join(5)

    assert calls == [1]
    assert eng._state_machine.state == EngineState.CALIBRATE
