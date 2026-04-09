#!/usr/bin/env python3
"""FAKDU Python server (static + staff QR entry)."""

from __future__ import annotations

import argparse
import hashlib
import json
import queue
import socket
import sqlite3
import threading
from datetime import datetime, timedelta, timezone
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import quote, urlencode, urlparse

LOCAL_DB_FILE = Path(__file__).resolve().with_name("fakdu.localdb.json")
LOCAL_DB_SQLITE_FILE = Path(__file__).resolve().with_name("fakdu.localdb.sqlite3")
LOCAL_DB_BACKUP_DIR = Path(__file__).resolve().with_name("fakdu.localdb.backups")
LOCAL_DB_BACKUP_PREFIX = "fakdu.localdb."
LOCAL_DB_BACKUP_SUFFIX = ".json"
LOCAL_DB_RETENTION_DAYS = 14
LOCAL_DB_MAX_BACKUP_FILES = 24
LOCAL_DB_MIN_BACKUP_INTERVAL_SECONDS = 3 * 60


class LocalDbEventBus:
    def __init__(self) -> None:
        self._listeners: set[queue.Queue] = set()
        self._lock = threading.Lock()

    def subscribe(self) -> queue.Queue:
        inbox: queue.Queue = queue.Queue(maxsize=8)
        with self._lock:
            self._listeners.add(inbox)
        return inbox

    def unsubscribe(self, inbox: queue.Queue) -> None:
        with self._lock:
            self._listeners.discard(inbox)

    def publish(self, payload: dict) -> None:
        with self._lock:
            listeners = list(self._listeners)
        for inbox in listeners:
            try:
                inbox.put_nowait(payload)
            except queue.Full:
                try:
                    inbox.get_nowait()
                except queue.Empty:
                    pass
                try:
                    inbox.put_nowait(payload)
                except queue.Full:
                    continue


LOCAL_DB_EVENT_BUS = LocalDbEventBus()


class FakduHandler(SimpleHTTPRequestHandler):
    server_version = "FAKDUPythonServer/1.0"
    _last_backup_digest: str = ""
    _last_backup_at: datetime | None = None
    _backup_lock = threading.Lock()

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
    def _ensure_sqlite_store() -> None:
        try:
            with sqlite3.connect(LOCAL_DB_SQLITE_FILE) as conn:
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS local_db_snapshots (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        digest TEXT NOT NULL,
                        payload TEXT NOT NULL,
                        saved_at INTEGER,
                        created_at INTEGER NOT NULL
                    )
                    """
                )
                conn.execute("CREATE INDEX IF NOT EXISTS idx_local_db_snapshots_created_at ON local_db_snapshots(created_at)")
                conn.commit()
        except sqlite3.Error:
            return

    @staticmethod
    def _read_latest_sqlite_payload() -> dict | None:
        if not LOCAL_DB_SQLITE_FILE.exists():
            return None
        try:
            with sqlite3.connect(LOCAL_DB_SQLITE_FILE) as conn:
                row = conn.execute(
                    "SELECT payload FROM local_db_snapshots ORDER BY id DESC LIMIT 1"
                ).fetchone()
        except sqlite3.Error:
            return None
        if not row:
            return None
        try:
            return json.loads(str(row[0]))
        except Exception:
            return None

    @staticmethod
    def _prune_old_local_db_files(retention_days: int = LOCAL_DB_RETENTION_DAYS) -> None:
        cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)
        cutoff_ts = int(cutoff.timestamp())

        if LOCAL_DB_SQLITE_FILE.exists():
            try:
                with sqlite3.connect(LOCAL_DB_SQLITE_FILE) as conn:
                    conn.execute(
                        "DELETE FROM local_db_snapshots WHERE created_at < ?",
                        (cutoff_ts,),
                    )
                    conn.execute(
                        """
                        DELETE FROM local_db_snapshots
                        WHERE id NOT IN (
                            SELECT id FROM local_db_snapshots ORDER BY id DESC LIMIT ?
                        )
                        """,
                        (LOCAL_DB_MAX_BACKUP_FILES,),
                    )
                    conn.commit()
            except sqlite3.Error:
                pass

        if not LOCAL_DB_BACKUP_DIR.exists():
            return
        files = sorted(LOCAL_DB_BACKUP_DIR.glob(f"{LOCAL_DB_BACKUP_PREFIX}*{LOCAL_DB_BACKUP_SUFFIX}"))
        for file in files:
            try:
                if not file.is_file():
                    continue
                mtime = datetime.fromtimestamp(file.stat().st_mtime, tz=timezone.utc)
                if mtime < cutoff:
                    file.unlink(missing_ok=True)
            except Exception:
                continue
        files = sorted(LOCAL_DB_BACKUP_DIR.glob(f"{LOCAL_DB_BACKUP_PREFIX}*{LOCAL_DB_BACKUP_SUFFIX}"))
        while len(files) > LOCAL_DB_MAX_BACKUP_FILES:
            oldest = files.pop(0)
            try:
                oldest.unlink(missing_ok=True)
            except Exception:
                continue

    @staticmethod
    def _make_backup_digest(payload: dict) -> str:
        raw = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
        return hashlib.sha1(raw).hexdigest()

    @classmethod
    def _should_write_backup(cls, digest: str) -> bool:
        now = datetime.now(timezone.utc)
        with cls._backup_lock:
            if cls._last_backup_digest == digest:
                return False
            if cls._last_backup_at and (now - cls._last_backup_at).total_seconds() < LOCAL_DB_MIN_BACKUP_INTERVAL_SECONDS:
                return False
            cls._last_backup_digest = digest
            cls._last_backup_at = now
            return True

    @staticmethod
    def _write_sqlite_snapshot(payload: dict, digest: str) -> None:
        FakduHandler._ensure_sqlite_store()
        saved_at = payload.get("savedAt")
        try:
            saved_at_num = int(saved_at) if saved_at is not None else None
        except Exception:
            saved_at_num = None
        created_at_num = int(datetime.now(timezone.utc).timestamp())
        raw_payload = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        try:
            with sqlite3.connect(LOCAL_DB_SQLITE_FILE) as conn:
                conn.execute(
                    """
                    INSERT INTO local_db_snapshots (digest, payload, saved_at, created_at)
                    VALUES (?, ?, ?, ?)
                    """,
                    (digest, raw_payload, saved_at_num, created_at_num),
                )
                conn.commit()
        except sqlite3.Error:
            return

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
            sqlite_payload = self._read_latest_sqlite_payload()
            if sqlite_payload is not None:
                payload["data"] = sqlite_payload
                payload["exists"] = True
            elif LOCAL_DB_FILE.exists():
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

        if path == "/api/local-db-events":
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "text/event-stream; charset=utf-8")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Connection", "keep-alive")
            self.end_headers()
            self.wfile.flush()

            inbox = LOCAL_DB_EVENT_BUS.subscribe()
            try:
                while True:
                    try:
                        payload = inbox.get(timeout=20)
                        msg = f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"
                    except queue.Empty:
                        msg = ": keep-alive\n\n"
                    self.wfile.write(msg.encode("utf-8"))
                    self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError):
                pass
            finally:
                LOCAL_DB_EVENT_BUS.unsubscribe(inbox)
            return

        if path == "/employee-qr":
            qr_text = self._staff_url()
            qr_encoded = quote(qr_text, safe="")
            page = f"""<!doctype html>
<html lang=\"th\"><head>
  <meta charset=\"utf-8\" />
  <meta name=\"viewport\" content=\"width=device-width,initial-scale=1\" />
  <title>Employee QR</title>
  <style>
    body {{ font-family: system-ui, sans-serif; margin: 0; padding: 24px; background:#f8fafc; color:#0f172a; }}
    .card {{ max-width: 560px; margin: 0 auto; background:#fff; border-radius: 16px; padding: 20px; box-shadow: 0 8px 28px rgba(15,23,42,.1); }}
    .hint {{ font-size: 14px; color:#475569; line-height:1.6; background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:12px; }}
    .btn {{ display:inline-block; margin-top:14px; background:#0f766e; color:#fff; text-decoration:none; font-weight:700; padding:10px 14px; border-radius:10px; }}
    code {{ display:block; background:#f1f5f9; padding:10px; border-radius:10px; word-break:break-all; }}
  </style>
</head><body>
  <div class=\"card\">
    <h2>QR สำหรับเครื่องพนักงาน (LAN/Web)</h2>
    <p class=\"hint\">โหมด LAN จะไม่พึ่งบริการ QR ภายนอก เพื่อให้ใช้งานได้แม้เน็ตไม่เสถียร<br>ให้เปิดลิงก์ด้านล่างจากมือถือพนักงานได้ทันที</p>
    <code>{qr_text}</code>
    <small style=\"display:block;margin-top:8px;color:#64748b\">encoded: {qr_encoded}</small>
    <a class=\"btn\" href=\"{qr_text}\">เปิดลิงก์เครื่องพนักงาน</a>
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
            "sourceDeviceId": payload.get("sourceDeviceId"),
            "sourceMode": payload.get("sourceMode"),
            "db": data
        }
        LOCAL_DB_FILE.write_text(json.dumps(safe_payload, ensure_ascii=False), encoding="utf-8")
        digest = self._make_backup_digest(safe_payload)
        if self._should_write_backup(digest):
            self._write_sqlite_snapshot(safe_payload, digest)
        self._prune_old_local_db_files()
        LOCAL_DB_EVENT_BUS.publish({
            "type": "LOCAL_DB_UPDATED",
            "savedAt": safe_payload.get("savedAt"),
            "appVersion": safe_payload.get("appVersion"),
            "sourceDeviceId": safe_payload.get("sourceDeviceId"),
            "sourceMode": safe_payload.get("sourceMode"),
        })
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
