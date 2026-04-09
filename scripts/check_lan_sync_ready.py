#!/usr/bin/env python3
"""Validate LAN-first sync path (employee link + local-db backup/event sync)."""

from __future__ import annotations

import json
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
    out_headers = dict(res.getheaders())
    conn.close()
    return res.status, out_headers, data


def read_one_event_line(port: int, result: dict):
    conn = HTTPConnection("127.0.0.1", port, timeout=10)
    conn.request("GET", "/api/local-db-events")
    res = conn.getresponse()
    result["status"] = res.status

    deadline = time.time() + 6
    picked = ""
    while time.time() < deadline:
        line = res.fp.readline().decode("utf-8", errors="ignore").strip()
        if line.startswith("data: "):
            picked = line[len("data: ") :]
            break
    result["line"] = picked
    conn.close()


def main() -> int:
    checks: list[Check] = []

    httpd = ThreadingHTTPServer(("127.0.0.1", 0), FakduHandler)
    port = httpd.server_port
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    time.sleep(0.05)

    try:
        # 1) employee link and qr page
        status, _, body = request(port, "GET", "/api/employee-link")
        payload = json.loads(body.decode("utf-8", errors="ignore")) if status == 200 else {}
        emp_url = str(payload.get("employee_url", ""))
        checks.append(Check("employee link API", status == 200 and payload.get("ok") is True and "mode=staff" in emp_url, f"status={status}"))

        status, _, body = request(port, "GET", "/employee-qr")
        html = body.decode("utf-8", errors="ignore")
        checks.append(Check("employee QR page", status == 200 and "mode%3Dstaff" in html and "QR สำหรับเครื่องพนักงาน" in html, f"status={status}"))

        # 2) local-db write/read
        seed = {
            "savedAt": int(time.time() * 1000),
            "appVersion": "test",
            "sourceDeviceId": "LAN-CHECK-MASTER",
            "sourceMode": "master",
            "db": {"shopName": "LAN-CHECK", "units": [{"id": 1, "status": "idle", "orders": []}]},
        }
        status, _, body = request(port, "POST", "/api/local-db", seed)
        parsed = json.loads(body.decode("utf-8", errors="ignore")) if status == 200 else {}
        checks.append(Check("local-db POST", status == 200 and parsed.get("ok") is True, f"status={status}"))

        status, _, body = request(port, "GET", "/api/local-db")
        parsed = json.loads(body.decode("utf-8", errors="ignore")) if status == 200 else {}
        got = parsed.get("data", {}) if isinstance(parsed, dict) else {}
        checks.append(
            Check(
                "local-db GET mirrors snapshot",
                status == 200 and parsed.get("ok") is True and got.get("db", {}).get("shopName") == "LAN-CHECK",
                f"status={status}",
            )
        )

        # 3) SSE event broadcast after POST update
        event_result: dict = {}
        sse_thread = threading.Thread(target=read_one_event_line, args=(port, event_result), daemon=True)
        sse_thread.start()
        time.sleep(0.2)

        update = {
            "savedAt": int(time.time() * 1000),
            "appVersion": "test",
            "sourceDeviceId": "LAN-CHECK-STAFF",
            "sourceMode": "staff",
            "db": {"shopName": "LAN-CHECK", "units": [{"id": 1, "status": "occupied", "orders": [{"id": "O1"}]}]},
        }
        request(port, "POST", "/api/local-db", update)
        sse_thread.join(timeout=7)

        raw_line = event_result.get("line", "")
        evt = json.loads(raw_line) if raw_line else {}
        checks.append(
            Check(
                "local-db SSE broadcast",
                event_result.get("status") == 200 and evt.get("type") == "LOCAL_DB_UPDATED" and evt.get("sourceDeviceId") == "LAN-CHECK-STAFF",
                f"status={event_result.get('status')}",
            )
        )
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
        print(f"\nNOT READY: LAN sync checks failed ({len(failed)} failed).")
        return 1

    print("\nREADY: LAN sync flow is healthy (employee link + local-db + SSE).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
