#!/usr/bin/env python3
"""Simple entrypoint for running FAKDU on LAN with fixed host/port."""

from http.server import ThreadingHTTPServer

from server import FakduHandler

HOST = "0.0.0.0"
PORT = 8000


def main() -> None:
    with ThreadingHTTPServer((HOST, PORT), FakduHandler) as httpd:
        print(f"FAKDU server running at http://{HOST}:{PORT}")
        print(f"Employee QR page: http://{HOST}:{PORT}/employee-qr")
        httpd.serve_forever()


if __name__ == "__main__":
    main()
