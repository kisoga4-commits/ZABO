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

    def test_home_contains_two_staff_access_modes(self):
        status, _, body = self.request("GET", "/")
        self.assertEqual(status, 200)
        html = body.decode("utf-8", errors="ignore")
        self.assertIn('id="client-access-mode"', html)
        self.assertIn('option value="customer"', html)
        self.assertIn('option value="shop"', html)

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


if __name__ == "__main__":
    unittest.main()
