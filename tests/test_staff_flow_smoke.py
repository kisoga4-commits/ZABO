import json
import threading
import time
import unittest
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer

from server import FakduHandler


class StaffFlowSmokeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.httpd = ThreadingHTTPServer(("127.0.0.1", 0), FakduHandler)
        cls.port = cls.httpd.server_port
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()
        time.sleep(0.05)

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        cls.thread.join(timeout=2)

    def request(self, method: str, path: str):
        conn = HTTPConnection("127.0.0.1", self.port, timeout=5)
        conn.request(method, path)
        res = conn.getresponse()
        body = res.read()
        headers = dict(res.getheaders())
        conn.close()
        return res.status, headers, body

    def request_json(self, method: str, path: str, payload: dict):
        conn = HTTPConnection("127.0.0.1", self.port, timeout=5)
        raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        conn.request(method, path, body=raw, headers={"Content-Type": "application/json"})
        res = conn.getresponse()
        body = res.read()
        headers = dict(res.getheaders())
        conn.close()
        return res.status, headers, body

    def current_latest_saved_at(self) -> int:
        status, _, body = self.request("GET", "/api/local-db")
        if status != 200:
            return 0
        payload = json.loads(body.decode("utf-8", errors="ignore"))
        data = payload.get("data", {}) if isinstance(payload, dict) else {}
        try:
            return int(data.get("savedAt") or 0)
        except Exception:
            return 0

    def test_home_contains_dual_staff_access_mode(self):
        status, _, body = self.request("GET", "/")
        self.assertEqual(status, 200)
        html = body.decode("utf-8", errors="ignore")
        self.assertIn('id="client-access-mode"', html)
        self.assertIn('value="both"', html)

    def test_employee_endpoint_redirects_to_staff_mode(self):
        status, headers, _ = self.request("GET", "/employee")
        self.assertEqual(status, 302)
        self.assertEqual(headers.get("Location"), "/?mode=staff")

    def test_employee_link_api_returns_staff_url(self):
        status, headers, body = self.request("GET", "/api/employee-link")
        self.assertEqual(status, 200)
        self.assertIn("application/json", headers.get("Content-Type", ""))
        payload = json.loads(body.decode("utf-8"))
        self.assertTrue(payload.get("ok"))
        self.assertIn("mode=staff", payload.get("employee_url", ""))

    def test_employee_qr_page_contains_staff_link(self):
        status, _, body = self.request("GET", "/employee-qr")
        self.assertEqual(status, 200)
        html = body.decode("utf-8", errors="ignore")
        self.assertIn("QR สำหรับเครื่องพนักงาน", html)
        self.assertIn("mode%3Dstaff", html)

    def test_local_db_rejects_stale_saved_at_overwrite(self):
        base = max(int(time.time() * 1000), self.current_latest_saved_at() + 10)
        newer = {
            "savedAt": base + 20,
            "appVersion": "test",
            "sourceDeviceId": "MASTER",
            "sourceMode": "master",
            "db": {"shopName": "NEWER"},
        }
        older = {
            "savedAt": base + 10,
            "appVersion": "test",
            "sourceDeviceId": "STAFF",
            "sourceMode": "staff",
            "db": {"shopName": "OLDER"},
        }
        status, _, body = self.request_json("POST", "/api/local-db", newer)
        self.assertEqual(status, 200)
        payload = json.loads(body.decode("utf-8", errors="ignore"))
        self.assertTrue(payload.get("saved"))

        status, _, body = self.request_json("POST", "/api/local-db", older)
        self.assertEqual(status, 200)
        payload = json.loads(body.decode("utf-8", errors="ignore"))
        self.assertTrue(payload.get("ignored"))
        self.assertEqual(payload.get("reason"), "STALE_SNAPSHOT")

        status, _, body = self.request("GET", "/api/local-db")
        self.assertEqual(status, 200)
        payload = json.loads(body.decode("utf-8", errors="ignore"))
        self.assertEqual(payload.get("data", {}).get("db", {}).get("shopName"), "NEWER")

    def test_local_db_allows_newer_app_version_even_if_saved_at_lower(self):
        base = max(int(time.time() * 1000), self.current_latest_saved_at() + 10)
        latest = {
            "savedAt": base + 50,
            "appVersion": "999999999.0.0",
            "sourceDeviceId": "MASTER",
            "sourceMode": "master",
            "db": {"shopName": "OLD-VERSION"},
        }
        newer_version = {
            "savedAt": base + 10,
            "appVersion": "1000000000.0.0",
            "sourceDeviceId": "MASTER",
            "sourceMode": "master",
            "db": {"shopName": "NEW-VERSION"},
        }
        status, _, body = self.request_json("POST", "/api/local-db", latest)
        self.assertEqual(status, 200)
        payload = json.loads(body.decode("utf-8", errors="ignore"))
        self.assertTrue(payload.get("saved"))

        status, _, body = self.request_json("POST", "/api/local-db", newer_version)
        self.assertEqual(status, 200)
        payload = json.loads(body.decode("utf-8", errors="ignore"))
        self.assertTrue(payload.get("saved"))

        status, _, body = self.request("GET", "/api/local-db")
        self.assertEqual(status, 200)
        payload = json.loads(body.decode("utf-8", errors="ignore"))
        self.assertEqual(payload.get("data", {}).get("db", {}).get("shopName"), "NEW-VERSION")


if __name__ == "__main__":
    unittest.main()
