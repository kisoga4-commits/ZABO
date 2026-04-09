#!/usr/bin/env python3
"""Validate Firebase sync readiness for FAKDU."""

from __future__ import annotations

import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

REQUIRED_RULE_PATHS = [
    '"syncPins"',
    '"joinRequests"',
    '"clientApprovals"',
    '"shops"',
]


@dataclass
class Check:
    name: str
    ok: bool
    detail: str = ""


def main() -> int:
    checks: list[Check] = []

    firebase_json = ROOT / "firebase.json"
    rules_json = ROOT / "firebase" / "realtime.rules.json"
    index_html = ROOT / "index.html"
    core_js = ROOT / "js" / "core.js"

    checks.append(Check("firebase.json exists", firebase_json.exists()))
    checks.append(Check("firebase/realtime.rules.json exists", rules_json.exists()))

    if firebase_json.exists():
        try:
            config = json.loads(firebase_json.read_text(encoding="utf-8"))
            path = str(config.get("database", {}).get("rules", "")).strip()
            checks.append(Check("firebase.json points database.rules", bool(path), f"rules={path or '-'}"))
        except Exception as exc:
            checks.append(Check("firebase.json parseable", False, str(exc)))

    if rules_json.exists():
        rules_text = rules_json.read_text(encoding="utf-8")
        for key in REQUIRED_RULE_PATHS:
            checks.append(Check(f"rules contain {key}", key in rules_text))

    # App-side adapter availability
    has_core = core_js.exists()
    checks.append(Check("core.js exists", has_core))
    if has_core:
        core_text = core_js.read_text(encoding="utf-8")
        if "resolveFirebaseSyncApi" in core_text and "return null;" in core_text:
            print("ℹ️ SKIP: Firebase sync is disabled by design (LAN-only mode).")
            return 0
        expects_adapter = "window.FakduSync" in core_text or "window.FakduFirebaseSync" in core_text
        checks.append(Check("core expects Firebase sync adapter", expects_adapter))

    has_index = index_html.exists()
    checks.append(Check("index.html exists", has_index))
    adapter_registered = False
    if has_index:
        html = index_html.read_text(encoding="utf-8")
        # detect explicit adapter script include
        adapter_registered = bool(re.search(r"<script[^>]+src=\"[^\"]*(sync|firebase)[^\"]*\.js\"", html, flags=re.IGNORECASE))
        checks.append(Check("index includes Firebase/sync adapter script", adapter_registered))

    # detect adapter implementation in js/*.js
    adapter_impl_found = False
    for file in (ROOT / "js").glob("*.js"):
        text = file.read_text(encoding="utf-8")
        has_assignment = (
            "window.FakduSync =" in text
            or "window.FakduFirebaseSync =" in text
            or "window.FakduSync=" in text
            or "window.FakduFirebaseSync=" in text
        )
        if has_assignment:
            adapter_impl_found = True
            break
    checks.append(Check("adapter implementation exists in js/", adapter_impl_found))

    for c in checks:
        icon = "✅" if c.ok else "❌"
        suffix = f" ({c.detail})" if c.detail else ""
        print(f"{icon} {c.name}{suffix}")

    failed = [c for c in checks if not c.ok]
    if failed:
        print(f"\nNOT READY: Firebase sync is not fully wired ({len(failed)} failed checks).")
        print("Hint: add/load a JS adapter that defines window.FakduSync or window.FakduFirebaseSync and connect it in index.html.")
        return 1

    print("\nREADY: Firebase sync wiring + rules look complete.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
