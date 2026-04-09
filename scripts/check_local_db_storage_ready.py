#!/usr/bin/env python3
"""Validate LAN local-db storage path (JSON latest + SQLite snapshot)."""

from __future__ import annotations

import json
import sqlite3
import tempfile
import threading
import time
from dataclasses import dataclass
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import server as server_mod
from server import FakduHandler


@dataclass
class Check:
    name: str
    ok: bool
    detail: str = ""


def request(port: int, method: str, path: str, payload: dict | None = None):
    conn = HTTPConnection("127.0.0.1", port, timeout=5)
    body = None
    headers = {}
    if payload is not None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        headers = {"Content-Type": "application/json"}
    conn.request(method, path, body=body, headers=headers)
    res = conn.getresponse()
    data = res.read()
    conn.close()
    return res.status, data


def sqlite_snapshot_count(path: Path) -> int:
    if not path.exists():
        return 0
    with sqlite3.connect(path) as conn:
        row = conn.execute("SELECT COUNT(*) FROM local_db_snapshots").fetchone()
    return int(row[0] if row else 0)


def main() -> int:
    checks: list[Check] = []
    with tempfile.TemporaryDirectory(prefix="fakdu-localdb-check-") as tmp_dir:
        tmp = Path(tmp_dir)
        sqlite_file = tmp / "fakdu.localdb.sqlite3"
        json_file = tmp / "fakdu.localdb.json"
        backup_dir = tmp / "fakdu.localdb.backups"

        # Isolate server storage paths for this check.
        server_mod.LOCAL_DB_SQLITE_FILE = sqlite_file
        server_mod.LOCAL_DB_FILE = json_file
        server_mod.LOCAL_DB_BACKUP_DIR = backup_dir
        FakduHandler._last_backup_digest = ""
        FakduHandler._last_backup_at = None

        httpd = ThreadingHTTPServer(("127.0.0.1", 0), FakduHandler)
        port = httpd.server_port
        thread = threading.Thread(target=httpd.serve_forever, daemon=True)
        thread.start()
        time.sleep(0.05)
        try:
            seed = {
                "savedAt": int(time.time() * 1000),
                "appVersion": "check-storage",
                "sourceDeviceId": "DB-CHECK-MASTER",
                "sourceMode": "master",
                "db": {"shopName": "DB-CHECK", "units": [{"id": 1, "status": "idle", "orders": []}]},
            }
            status, body = request(port, "POST", "/api/local-db", seed)
            payload = json.loads(body.decode("utf-8", errors="ignore")) if status == 200 else {}
            checks.append(Check("local-db POST", status == 200 and payload.get("ok") is True, f"status={status}"))
            checks.append(Check("sqlite file created", sqlite_file.exists()))
            checks.append(Check("latest JSON file created", json_file.exists()))
            checks.append(Check("sqlite has at least 1 snapshot", sqlite_snapshot_count(sqlite_file) >= 1))

            # duplicate payload should not create new snapshot (digest dedupe)
            before = sqlite_snapshot_count(sqlite_file)
            status, _ = request(port, "POST", "/api/local-db", seed)
            after = sqlite_snapshot_count(sqlite_file)
            checks.append(Check("duplicate snapshot deduped", status == 200 and after == before, f"before={before}, after={after}"))

            # remove latest JSON and ensure GET still recovers from SQLite
            if json_file.exists():
                json_file.unlink()
            status, body = request(port, "GET", "/api/local-db")
            payload = json.loads(body.decode("utf-8", errors="ignore")) if status == 200 else {}
            got_name = payload.get("data", {}).get("db", {}).get("shopName") if isinstance(payload, dict) else None
            checks.append(Check("GET /api/local-db reads from sqlite fallback", status == 200 and got_name == "DB-CHECK", f"shopName={got_name}"))
        finally:
            httpd.shutdown()
            httpd.server_close()
            thread.join(timeout=2)

    failed = [c for c in checks if not c.ok]
    for c in checks:
        icon = "✅" if c.ok else "❌"
        suffix = f" ({c.detail})" if c.detail else ""
        print(f"{icon} {c.name}{suffix}")

    if failed:
        print(f"\nNOT READY: local DB storage checks failed ({len(failed)} failed).")
        return 1

    print("\nREADY: LAN local DB storage works (JSON latest + SQLite snapshots).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
