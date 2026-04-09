import re
import unittest
from pathlib import Path


class SyncContractSmokeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.core = Path('js/core.js').read_text(encoding='utf-8')
        cls.index = Path('index.html').read_text(encoding='utf-8')

    def test_system_mode_has_pin_reset_controls(self):
        self.assertIn('id="display-sync-key"', self.index)
        self.assertIn('id="modal-sync-key-confirm"', self.index)
        self.assertIn('onclick="requestNewSyncKey()"', self.index)
        self.assertIn('onclick="confirmNewSyncKey()"', self.index)

    def test_reset_pin_guarded_to_system_mode(self):
        self.assertRegex(
            self.core,
            r"function requestNewSyncKey\(\)\s*\{[\s\S]*state\.activeTab !== 'system'"
        )
        self.assertRegex(
            self.core,
            r"async function confirmNewSyncKey\(\)\s*\{[\s\S]*state\.activeTab !== 'system'"
        )

    def test_staff_order_goes_to_master_via_operation_flow(self):
        self.assertIn("type: 'APPEND_ORDER'", self.core)
        self.assertIn('await enqueueClientOp(action);', self.core)
        self.assertIn('await flushClientOpQueue();', self.core)
        self.assertIn("if (action.type === 'APPEND_ORDER')", self.core)
        self.assertIn("source: 'client'", self.core)

    def test_image_optimization_is_enabled(self):
        self.assertIn('async function optimizeImageFile(file, options = {})', self.core)
        self.assertIn("temp: { maxWidth: 960, maxBytes: 320 * 1024 }", self.core)
        self.assertIn("logo: { maxWidth: 760, maxBytes: 260 * 1024 }", self.core)
        self.assertIn("qr: { maxWidth: 1100, maxBytes: 420 * 1024, outputType: 'image/png' }", self.core)


if __name__ == '__main__':
    unittest.main()
