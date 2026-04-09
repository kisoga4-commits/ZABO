#!/usr/bin/env python3
"""FAKDU Python server (static + staff QR entry)."""

from __future__ import annotations

import argparse
import json
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import quote, urlencode, urlparse


class FakduHandler(SimpleHTTPRequestHandler):
    server_version = "FAKDUPythonServer/1.0"

    def _base_url(self) -> str:
        host = self.headers.get("Host") or f"127.0.0.1:{self.server.server_port}"
        return f"http://{host}"

    def _staff_url(self) -> str:
        return f"{self._base_url()}/?{urlencode({'mode': 'staff'})}"

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        path = parsed.path or "/"

        if path == "/employee":
            self.send_response(HTTPStatus.FOUND)
            self.send_header("Location", "/?mode=staff")
            self.end_headers()
            return

        if path == "/api/employee-link":
            payload = {
                "ok": True,
                "employee_url": self._staff_url(),
                "hint": "เปิดลิงก์นี้บนเครื่องพนักงานเพื่อเข้าเว็บและใช้งาน 2 โหมด (ลูกค้า + เช็คบิล)",
            }
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        if path == "/employee-qr":
            qr_text = self._staff_url()
            qr_src = f"https://api.qrserver.com/v1/create-qr-code/?size=280x280&data={quote(qr_text, safe='')}"
            page = f"""<!doctype html>
<html lang=\"th\"><head>
  <meta charset=\"utf-8\" />
  <meta name=\"viewport\" content=\"width=device-width,initial-scale=1\" />
  <title>Employee QR</title>
  <style>
    body {{ font-family: system-ui, sans-serif; margin: 0; padding: 24px; background:#f8fafc; color:#0f172a; }}
    .card {{ max-width: 560px; margin: 0 auto; background:#fff; border-radius: 16px; padding: 20px; box-shadow: 0 8px 28px rgba(15,23,42,.1); }}
    .qr-wrap {{ display:flex; justify-content:center; margin: 20px 0; }}
    .qr-wrap img {{ width: 280px; height: 280px; border-radius: 12px; border: 1px solid #e2e8f0; }}
    code {{ display:block; background:#f1f5f9; padding:10px; border-radius:10px; word-break:break-all; }}
  </style>
</head><body>
  <div class=\"card\">
    <h2>QR สำหรับเครื่องพนักงาน</h2>
    <p>เปิดหน้านี้บนมือถือ แล้วให้เครื่องพนักงานสแกน QR เพื่อเข้าเว็บเครื่องพนักงาน (ใช้งานได้ทั้ง 2 โหมด: ลูกค้า + เช็คบิล)</p>
    <div class=\"qr-wrap\"><img src=\"{qr_src}\" alt=\"Employee QR\" /></div>
    <code>{qr_text}</code>
  </div>
</body></html>"""
            body = page.encode("utf-8")
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        return super().do_GET()


def main() -> None:
    parser = argparse.ArgumentParser(description="Run FAKDU with a Python static server")
    parser.add_argument("--host", default="0.0.0.0", help="bind host")
    parser.add_argument("--port", default=8000, type=int, help="bind port")
    args = parser.parse_args()

    with ThreadingHTTPServer((args.host, args.port), FakduHandler) as httpd:
        print(f"FAKDU server running at http://{args.host}:{args.port}")
        print(f"Employee QR page: http://{args.host}:{args.port}/employee-qr")
        httpd.serve_forever()


if __name__ == "__main__":
    main()
