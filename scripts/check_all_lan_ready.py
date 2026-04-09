#!/usr/bin/env python3
"""Run all LAN-first readiness checks in one command."""

from __future__ import annotations

import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


@dataclass
class Check:
    name: str
    cmd: list[str]


CHECKS = [
    Check("unit/smoke tests", [sys.executable, "-m", "pytest", "-q"]),
    Check("python runtime readiness", [sys.executable, "scripts/check_python_runtime_ready.py"]),
    Check("LAN sync readiness", [sys.executable, "scripts/check_lan_sync_ready.py"]),
    Check("local DB storage readiness", [sys.executable, "scripts/check_local_db_storage_ready.py"]),
]


def main() -> int:
    failed = []
    for item in CHECKS:
        print(f"\n=== {item.name} ===")
        result = subprocess.run(item.cmd, cwd=ROOT)
        if result.returncode == 0:
            print(f"✅ {item.name}: PASS")
        else:
            print(f"❌ {item.name}: FAIL (code={result.returncode})")
            failed.append(item.name)

    if failed:
        print(f"\nNOT READY: {len(failed)} checks failed -> {', '.join(failed)}")
        return 1

    print("\nREADY: all LAN-first checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
