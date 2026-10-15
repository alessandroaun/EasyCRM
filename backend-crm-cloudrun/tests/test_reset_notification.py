"""Unit tests for the password reset notification handler."""

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
sys.modules["firebase_admin.messaging"].Message = lambda **kw: kw
sys.modules["firebase_admin.messaging"].send = lambda msg: "fake-msg-id"
sys.modules["firebase_admin.messaging"].UnregisteredError = Exception

import app as crm_app

class TestResetNotification(unittest.TestCase):
    def setUp(self):
        crm_app.app.config['TESTING'] = True
        self.client = crm_app.app.test_client()

    def test_missing_email_returns_400(self):
        response = self.client.post('/api/auth/notificar-reset',
                                   json={},
                                   content_type='application/json')
        self.assertEqual(response.status_code, 400)

    def test_invalid_email_format_returns_400(self):
        response = self.client.post('/api/auth/notificar-reset',
                                   json={'email': 'email_invalido'},
                                   content_type='application/json')
        self.assertEqual(response.status_code, 400)

    def test_valid_email_request_returns_200(self):
        response = self.client.post('/api/auth/notificar-reset',
                                   json={'email': 'vendedor@consorflux.com'},
                                   content_type='application/json')
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertTrue(data.get('success'))

if __name__ == '__main__':
    unittest.main()
