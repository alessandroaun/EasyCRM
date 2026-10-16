"""Unit tests for the lead transfer notification handler."""

import unittest
import types
import json
import sys
import os

# Add backend directory to sys.path first so local modules load
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

# Mock only third-party cloud SDKs not installed globally
for mod_name in ["firebase_admin", "firebase_admin.credentials", "firebase_admin.messaging",
                "google", "google.genai", "google.genai.types", "playwright", "playwright.sync_api", "pdfplumber"]:
    if mod_name not in sys.modules:
        m = types.ModuleType(mod_name)
        sys.modules[mod_name] = m

sys.modules["playwright.sync_api"].sync_playwright = lambda: None
sys.modules["firebase_admin"]._apps = [True]
sys.modules["firebase_admin.messaging"].Notification = lambda **kw: kw
sys.modules["firebase_admin.messaging"].WebpushConfig = lambda **kw: kw
sys.modules["firebase_admin.messaging"].WebpushNotification = lambda **kw: kw
sys.modules["firebase_admin.messaging"].WebpushFCMOptions = lambda **kw: kw
sys.modules["firebase_admin.messaging"].AndroidConfig = lambda **kw: kw
sys.modules["firebase_admin.messaging"].AndroidNotification = lambda **kw: kw
sys.modules["firebase_admin.messaging"].Message = lambda **kw: kw
sys.modules["firebase_admin.messaging"].send = lambda msg: "fake-msg-id"
sys.modules["firebase_admin.messaging"].UnregisteredError = Exception

import app as crm_app

class TestTransferNotification(unittest.TestCase):
    def setUp(self):
        crm_app.app.config['TESTING'] = True
        self.client = crm_app.app.test_client()

    def test_missing_target_user_id_returns_400(self):
        response = self.client.post('/api/leads/notificar-transferencia',
                                   json={'lead_count': 3},
                                   content_type='application/json')
        self.assertEqual(response.status_code, 400)

    def test_invalid_lead_count_returns_400(self):
        response = self.client.post('/api/leads/notificar-transferencia',
                                   json={'target_user_id': 'user-123', 'lead_count': 0},
                                   content_type='application/json')
        self.assertEqual(response.status_code, 400)

    def test_valid_transfer_notification_returns_200(self):
        response = self.client.post('/api/leads/notificar-transferencia',
                                   json={
                                       'target_user_id': 'user-123',
                                       'lead_count': 2,
                                       'sender_name': 'Carlos Gerente'
                                   },
                                   content_type='application/json')
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertTrue(data.get('success'))
        self.assertEqual(data.get('lead_count'), 2)

if __name__ == '__main__':
    unittest.main()
