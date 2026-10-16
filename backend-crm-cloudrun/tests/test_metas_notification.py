"""Unit tests for the Metas Mensais push notification endpoint."""

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

class TestMetasNotification(unittest.TestCase):
    def setUp(self):
        crm_app.app.config['TESTING'] = True
        self.client = crm_app.app.test_client()

    def test_notificar_atribuicao_missing_target_returns_400(self):
        res = self.client.post('/api/metas/notificar-atribuicao',
                               json={'metaCredito': '500.000', 'metaCotas': 5},
                               content_type='application/json')
        self.assertEqual(res.status_code, 400)

    def test_notificar_atribuicao_success(self):
        res = self.client.post('/api/metas/notificar-atribuicao',
                               json={
                                   'targetUserId': 'test-seller-123',
                                   'targetUserName': 'Vendedor Teste',
                                   'createdByName': 'Diretor Comercial',
                                   'metaCredito': '800.000',
                                   'metaCotas': 8,
                                   'ligacoesDiarias': 35,
                                   'tipoFoco': 'ambos',
                                   'mes': 10,
                                   'ano': 2026
                               },
                               content_type='application/json')
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertTrue(data.get('success'))

if __name__ == '__main__':
    unittest.main()
