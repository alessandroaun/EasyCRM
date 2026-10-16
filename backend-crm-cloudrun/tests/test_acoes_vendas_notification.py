"""Unit tests for the Ação de Vendas notification endpoints."""

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

class TestAcoesVendasNotification(unittest.TestCase):
    def setUp(self):
        crm_app.app.config['TESTING'] = True
        self.client = crm_app.app.test_client()

    def test_notificar_criacao_missing_fields_returns_400(self):
        # Missing target_user_id
        res = self.client.post('/api/acoes-vendas/notificar-criacao',
                               json={'tipo_meta': 'cotas', 'valor_meta': 5, 'bonificacao': 'R$ 500'},
                               content_type='application/json')
        self.assertEqual(res.status_code, 400)

        # Invalid tipo_meta
        res = self.client.post('/api/acoes-vendas/notificar-criacao',
                               json={'target_user_id': 'user-1', 'tipo_meta': 'invalido', 'valor_meta': 5, 'bonificacao': 'R$ 500'},
                               content_type='application/json')
        self.assertEqual(res.status_code, 400)

        # Non-positive valor_meta
        res = self.client.post('/api/acoes-vendas/notificar-criacao',
                               json={'target_user_id': 'user-1', 'tipo_meta': 'cotas', 'valor_meta': 0, 'bonificacao': 'R$ 500'},
                               content_type='application/json')
        self.assertEqual(res.status_code, 400)

    def test_notificar_criacao_success(self):
        res = self.client.post('/api/acoes-vendas/notificar-criacao',
                               json={
                                   'target_user_id': 'user-1',
                                   'creator_name': 'Gestor Roberto',
                                   'tipo_meta': 'cotas',
                                   'valor_meta': 3,
                                   'bonificacao': 'R$ 1.500 no Pix',
                                   'data_limite': '2026-10-31T18:00:00Z'
                               },
                               content_type='application/json')
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertTrue(data.get('success'))

    def test_notificar_cumprimento_missing_fields_returns_400(self):
        # Missing creator_id
        res = self.client.post('/api/acoes-vendas/notificar-cumprimento',
                               json={'vendedor_name': 'Ana', 'bonificacao': 'Troféu'},
                               content_type='application/json')
        self.assertEqual(res.status_code, 400)

        # Missing vendedor_name
        res = self.client.post('/api/acoes-vendas/notificar-cumprimento',
                               json={'creator_id': 'gestor-1', 'bonificacao': 'Troféu'},
                               content_type='application/json')
        self.assertEqual(res.status_code, 400)

    def test_notificar_cumprimento_success(self):
        res = self.client.post('/api/acoes-vendas/notificar-cumprimento',
                               json={
                                   'creator_id': 'gestor-1',
                                   'vendedor_name': 'Carlos Vendedor',
                                   'tipo_meta': 'credito',
                                   'valor_meta': 500000,
                                   'bonificacao': 'R$ 2.000 em dinheiro'
                               },
                               content_type='application/json')
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertTrue(data.get('success'))

if __name__ == '__main__':
    unittest.main()
