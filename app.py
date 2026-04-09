#!/usr/bin/env python3
"""Simple entrypoint for running FAKDU on LAN with fixed host/port."""

from __future__ import annotations

import socket
import webbrowser
from http.server import ThreadingHTTPServer

from server import FakduHandler

HOST = "0.0.0.0"
PORT = 8000


def resolve_master_ip() -> str:
    """Best-effort LAN IP for the master machine."""
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


def main() -> None:
    master_ip = resolve_master_ip()
    with ThreadingHTTPServer((HOST, PORT), FakduHandler) as httpd:
        print(f"FAKDU server running at http://127.0.0.1:{PORT}")
        print(f"Master machine URL (LAN): http://{master_ip}:{PORT}")
        print(f"Employee QR page: http://{master_ip}:{PORT}/employee-qr")
        try:
            webbrowser.open(f"http://127.0.0.1:{PORT}")
        except Exception:
            pass
        httpd.serve_forever()


if __name__ == "__main__":
    main()
