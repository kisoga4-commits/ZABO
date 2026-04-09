#!/usr/bin/env python3
"""FAKDU Python server (static + staff QR entry)."""

from __future__ import annotations

import argparse
import json
import socket
from datetime import datetime, timedelta, timezone
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import quote, urlencode, urlparse

LOCAL_DB_FILE = Path(__file__).resolve().with_name("fakdu.localdb.json")
LOCAL_DB_BACKUP_DIR = Path(__file__).resolve().with_name("fakdu.localdb.backups")
LOCAL_DB_BACKUP_PREFIX = "fakdu.localdb."
LOCAL_DB_BACKUP_SUFFIX = ".json"
LOCAL_DB_RETENTION_DAYS = 30


class FakduHandler(SimpleHTTPRequestHandler):
    server_version = "FAKDUPythonServer/1.0"

    @staticmethod
    def _resolve_master_ip() -> str:
        probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            probe.connect(("8.8.8.8", 80))
            ip = probe.getsockname()[0]
            if ip and ip != "0.0.0.0":
                return ip
        except OSError:
            pass
        finally:
            probe.close()

        try:
            hostname_ip = socket.gethostbyname(socket.gethostname())
            if hostname_ip and not hostname_ip.startswith("127."):
                return hostname_ip
        except OSError:
            pass

        return "127.0.0.1"

    @staticmethod
    def _is_loopback_host(hostname: str) -> bool:
        host = (hostname or "").strip().lower()
        return host in {"localhost", "::1"} or host.startswith("127.")

    def _base_url(self) -> str:
        host_header = self.headers.get("Host") or ""
        parsed_host = urlparse(f"//{host_header}")
        host = parsed_host.hostname or "127.0.0.1"
        port = parsed_host.port or self.server.server_port
        if self._is_loopback_host(host):
            host = self._resolve_master_ip()
        return f"http://{host}:{port}"

    @staticmethod
    def _prune_old_local_db_files(retention_days: int = LOCAL_DB_RETENTION_DAYS) -> None:
        cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)
        if not LOCAL_DB_BACKUP_DIR.exists():
            return
        for file in LOCAL_DB_BACKUP_DIR.glob(f"{LOCAL_DB_BACKUP_PREFIX}*{LOCAL_DB_BACKUP_SUFFIX}"):
            try:
                if not file.is_file():
                    continue
                mtime = datetime.fromtimestamp(file.stat().st_mtime, tz=timezone.utc)
                if mtime < cutoff:
                    file.unlink(missing_ok=True)
            except Exception:
                continue

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

        if path == "/api/local-db":
            self._prune_old_local_db_files()
            payload = {"ok": True, "data": None, "exists": False}
            if LOCAL_DB_FILE.exists():
                try:
                    payload["data"] = json.loads(LOCAL_DB_FILE.read_text(encoding="utf-8"))
                    payload["exists"] = True
                except Exception:
                    payload = {"ok": False, "exists": True, "error": "INVALID_LOCAL_DB_FILE"}
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

    def do_POST(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        path = parsed.path or "/"

        if path != "/api/local-db":
            return super().do_POST()

        length = int(self.headers.get("Content-Length", "0") or 0)
        raw_body = self.rfile.read(length) if length > 0 else b"{}"
        try:
            payload = json.loads(raw_body.decode("utf-8"))
        except Exception:
            payload = {}
        data = payload.get("db", payload)
        if not isinstance(data, dict):
            body = json.dumps({"ok": False, "error": "INVALID_PAYLOAD"}, ensure_ascii=False).encode("utf-8")
            self.send_response(HTTPStatus.BAD_REQUEST)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        safe_payload = {
            "savedAt": payload.get("savedAt"),
            "appVersion": payload.get("appVersion"),
            "db": data
        }
        LOCAL_DB_FILE.write_text(json.dumps(safe_payload, ensure_ascii=False), encoding="utf-8")
        LOCAL_DB_BACKUP_DIR.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
        snapshot_file = LOCAL_DB_BACKUP_DIR / f"{LOCAL_DB_BACKUP_PREFIX}{stamp}{LOCAL_DB_BACKUP_SUFFIX}"
        snapshot_file.write_text(json.dumps(safe_payload, ensure_ascii=False), encoding="utf-8")
        self._prune_old_local_db_files()
        body = json.dumps({"ok": True, "saved": True}, ensure_ascii=False).encode("utf-8")
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


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
