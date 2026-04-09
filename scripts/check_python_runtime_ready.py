#!/usr/bin/env python3
"""End-to-end readiness checks for running FAKDU on a computer via Python."""

from __future__ import annotations

import json
import sys
import threading
import time
from dataclasses import dataclass
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from server import FakduHandler


@dataclass
class CheckResult:
    name: str
    ok: bool
    detail: str = ""


def request(port: int, path: str):
    conn = HTTPConnection("127.0.0.1", port, timeout=8)
    conn.request("GET", path)
    res = conn.getresponse()
    body = res.read()
    headers = dict(res.getheaders())
    status = res.status
    conn.close()
    return status, headers, body


def main() -> int:
    results: list[CheckResult] = []

    httpd = ThreadingHTTPServer(("127.0.0.1", 0), FakduHandler)
    port = httpd.server_port
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    time.sleep(0.05)

    try:
        # 1) Core pages/assets
        for path in ["/", "/index.html", "/manifest.json", "/sw.js", "/js/core.js", "/js/db.js", "/js/vault.js"]:
            status, _, _ = request(port, path)
            results.append(CheckResult(f"GET {path}", status == 200, f"status={status}"))

        # 2) Staff flow endpoints
        status, headers, _ = request(port, "/employee")
        results.append(CheckResult("/employee redirect", status == 302 and headers.get("Location") == "/?mode=staff", f"status={status}, location={headers.get('Location')}"))

        status, headers, body = request(port, "/api/employee-link")
        api_ok = status == 200 and "application/json" in headers.get("Content-Type", "")
        employee_url_ok = False
        try:
            payload = json.loads(body.decode("utf-8"))
            employee_url_ok = bool(payload.get("ok")) and "mode=staff" in str(payload.get("employee_url", ""))
        except Exception:
            employee_url_ok = False
        results.append(CheckResult("/api/employee-link payload", api_ok and employee_url_ok, f"status={status}"))

        status, _, body = request(port, "/employee-qr")
        html = body.decode("utf-8", errors="ignore")
        qr_ok = status == 200 and "QR สำหรับเครื่องพนักงาน" in html and "mode%3Dstaff" in html
        results.append(CheckResult("/employee-qr content", qr_ok, f"status={status}"))

        # 3) Ensure exactly 2 staff access modes in UI
        index_text = (ROOT / "index.html").read_text(encoding="utf-8")
        customer_count = index_text.count('option value="customer"')
        shop_count = index_text.count('option value="shop"')
        no_extra_mode = 'option value="admin"' not in index_text and 'option value="kitchen"' not in index_text
        mode_ok = customer_count >= 1 and shop_count >= 1 and no_extra_mode
        results.append(CheckResult("staff access modes (customer/shop)", mode_ok, f"customer={customer_count}, shop={shop_count}"))

        # 4) PWA hooks are present
        pwa_ok = ('<link rel="manifest" href="manifest.json">' in index_text and
                  "navigator.serviceWorker.register('./sw.js')" in index_text)
        results.append(CheckResult("PWA manifest + service worker hooks", pwa_ok))

    finally:
        httpd.shutdown()
        httpd.server_close()
        thread.join(timeout=2)

    failed = [r for r in results if not r.ok]
    for r in results:
        icon = "✅" if r.ok else "❌"
        suffix = f" ({r.detail})" if r.detail else ""
        print(f"{icon} {r.name}{suffix}")

    if failed:
        print(f"\nFAILED: {len(failed)} check(s) did not pass.")
        return 1

    print(f"\nALL GOOD: {len(results)} checks passed. Ready for Python runtime on computer.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
