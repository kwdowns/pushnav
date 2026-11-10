#!/usr/bin/env bash
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

set -euo pipefail
cd "$(dirname "$0")/.."

# pywebview on Linux uses its Qt backend (QtPy + PyQt6 + PyQt6-WebEngine,
# pulled in by the `pywebview[qt]` extra in pyproject.toml). All Python
# deps are pip-installable, so a vanilla `uv sync` against the repo's
# pinned 3.12.13 standalone Python is enough — no system PyGObject, no
# --system-site-packages venv juggling.
uv sync

if uv run python scripts/build_catalogs.py --needs-rebuild; then
    echo "==> Rebuilding catalog JSONs"
    uv run python scripts/build_catalogs.py
fi

# evf.main auto-detects Vite on :5173 and otherwise loads the prebuilt
# bundle from :8780 — rebuild on every dev launch so source edits are
# reflected. Skipped when Vite is serving HMR on :5173 because the bundle
# isn't read in that path.
if ! (exec 3<>/dev/tcp/localhost/5173) 2>/dev/null; then
    # npm writes node_modules/.package-lock.json after install — if the
    # repo's package-lock.json is newer (e.g. after a `git pull` that
    # added deps), reinstall before building. `-nt` is also true when
    # the right-hand file is missing, which covers fresh checkouts.
    if [ ! -d web/node_modules ] \
       || [ web/package-lock.json -nt web/node_modules/.package-lock.json ]; then
        echo "==> Installing web/ npm dependencies"
        (cd web && npm install)
    fi
    echo "==> Rebuilding React bundle (no Vite on :5173)"
    (cd web && npm run build)
fi

uv run python -m evf.main
