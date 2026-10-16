import firebase_admin
from firebase_admin import credentials, messaging
from supabase import create_client, Client
import os
import json
import time
import threading
import asyncio
from datetime import datetime, timezone
from flask import Flask, request, jsonify, Response, g
from flask_cors import CORS
from typing import Any, Dict, List, Optional
from google import genai
from google.genai import types
from dotenv import load_dotenv
import re
import sys
import subprocess
import tempfile
from playwright.sync_api import sync_playwright
import locale
import requests
import urllib.request
from urllib.parse import urlparse
from security import authenticate_request, authenticate_webhook, instance_owned_by_current_user

# Importações dos módulos do Simulador portados
from pdf_processor import extrair_dados_pdf
from json_utils import atualizar_estatisticas_json, atualizar_historico_assembleias

# Camada de Abstração Multi-Provider de IA (Cloudflare Workers AI + Moto G9 Local)
from ai_providers import (
    ai_router,
    TaskType,
    telemetry_manager,
    flags,
    rule_engine,
    analysis_service
)
from ai_providers.secrets_loader import get_secret
from ai_providers.objection_knowledge import (
    detect_objection_category,
    extract_lead_monetary_value,
    extract_financial_context,
    get_simulador_pricing_context,
    detect_segment_interest,
    OBJECTIONS_KNOWLEDGE_BASE
)

load_dotenv()

if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass
if hasattr(sys.stderr, 'reconfigure'):
    try:
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass



app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 25 * 1024 * 1024
allowed_origins = [
    origin.strip() for origin in os.environ.get(
        "FRONTEND_ORIGINS", "https://app.consorflux.com,https://consorflux.com,https://a11crm.netlify.app,http://localhost:5173"
    ).split(",") if origin.strip()
]
CORS(app, origins=allowed_origins, allow_headers=["Authorization", "Content-Type"])

# ==============================================================================
# 1. INICIALIZAÇÃO DO FIREBASE E SUPABASE
# ==============================================================================
if not firebase_admin._apps:
    firebase_credentials = os.environ.get("FIREBASE_CREDENTIALS_JSON")
    cred_file = os.path.join(os.path.dirname(__file__), "firebase-adminsdk.json")
    if os.path.exists(cred_file):
        cred = credentials.Certificate(cred_file)
        print("✅ Firebase Admin inicializado via arquivo local firebase-adminsdk.json")
    elif firebase_credentials:
        cred = credentials.Certificate(json.loads(firebase_credentials))
        print("✅ Firebase Admin inicializado via FIREBASE_CREDENTIALS_JSON")
    else:
        cred = credentials.ApplicationDefault()
        print("⚠️ Firebase Admin inicializado via ApplicationDefault")
    firebase_admin.initialize_app(cred)

url: str = os.environ.get("SUPABASE_URL")
# Compatibility with the currently deployed Cloud Run revision. New revisions
# should use SUPABASE_KEY as the canonical environment variable name.
key: str = os.environ.get("SUPABASE_KEY") or os.environ.get("SUPABASE_SERVICE_KEY")
if url and key:
    supabase: Client = create_client(url, key)
else:
    print("⚠️ AVISO: SUPABASE_URL ou SUPABASE_KEY não encontrados no .env")
    supabase = None


@app.before_request
def require_authenticated_caller():
    if request.method == "OPTIONS":
        return None
    if request.path.startswith("/api/whatsapp/webhook"):
        return authenticate_webhook()
    if request.path.startswith("/api/webhooks"):
        return None
    if request.path in {
        "/api/auth/notificar-reset",
        "/api/leads/notificar-transferencia",
        "/api/acoes-vendas/notificar-criacao",
        "/api/acoes-vendas/notificar-cumprimento"
    }:
        return None
    denial = authenticate_request(supabase)
    if denial is not None:
        return denial
    if request.method == "POST" and request.is_json:
        body = request.get_json(silent=True) or {}
        if not isinstance(body, dict):
            return jsonify({"error": "Corpo JSON inválido."}), 400
        if request.path not in {"/notificar", "/agendar-notificacao"}:
            for field in ("user_id", "target_user_id"):
                claimed = body.get(field)
                if claimed and str(claimed) != g.user_id and g.user_role not in {"admin", "administrador"}:
                    return jsonify({"error": "Usuário não autorizado."}), 403
        if request.path in {"/api/ai/run-agent", "/api/ai/executar-agente",
                            "/chat-mentor"} and not body.get("user_id"):
            body["user_id"] = g.user_id
    return None


@app.route("/api/evolution/<path:operation>", methods=["GET", "POST", "DELETE"])
def evolution_gateway(operation):
    """Expose only the Evolution operations needed by the authenticated CRM."""
    parts = operation.split("/")
    allowed = {
        ("POST", "instance", "create"),
        ("POST", "webhook", "set"),
        ("GET", "instance", "connect"),
        ("GET", "instance", "connectionState"),
        ("POST", "message", "sendText"),
        ("POST", "message", "sendWhatsAppAudio"),
        ("POST", "message", "sendMedia"),
        ("DELETE", "instance", "logout"),
        ("POST", "chat", "fetchProfilePictureUrl"),
    }
    if not evolution_is_securely_configured():
        return jsonify({"error": "Evolution HTTPS não configurada."}), 503

    body = request.get_json(silent=True) or {}
    if not isinstance(body, dict):
        return jsonify({"error": "Corpo JSON inválido."}), 400
    if operation == "instance/create" and request.method == "POST":
        instance_name = body.get("instanceName", "")
    elif operation == "instance/fetchInstances" and request.method == "GET":
        instance_name = request.args.get("instance_name", "")
    elif len(parts) == 3 and (request.method, parts[0], parts[1]) in allowed:
        instance_name = parts[2]
    else:
        return jsonify({"error": "Operação não permitida."}), 404

    if not instance_owned_by_current_user(supabase, instance_name):
        return jsonify({"error": "Instância não autorizada."}), 403

    if operation == "instance/create":
        if body.get("instanceName") != instance_name:
            return jsonify({"error": "Instância inválida."}), 400
        body["token"] = EVOLUTION_API_KEY
    elif parts[:2] == ["webhook", "set"]:
        webhook_secret = os.environ.get("EVOLUTION_WEBHOOK_SECRET", "")
        if not re.fullmatch(r"[A-Za-z0-9_-]{32,}", webhook_secret):
            return jsonify({"error": "Webhook seguro não configurado."}), 503
        public_url = os.environ.get("PUBLIC_BACKEND_URL", "").rstrip("/")
        if not public_url.startswith("https://"):
            return jsonify({"error": "URL pública HTTPS do backend não configurada."}), 503
        webhook_url = f"{public_url}/api/whatsapp/webhook/{webhook_secret}"
        body["webhook"] = {
            "url": webhook_url,
            "enabled": True,
            "events": ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "QRCODE_UPDATED"]
        }
        body["url"] = webhook_url
        body["enabled"] = True

    try:
        target = f"{EVOLUTION_API_URL.rstrip('/')}/{operation}"
        response = requests.request(
            request.method, target,
            headers={"apikey": EVOLUTION_API_KEY},
            json=body if request.method == "POST" else None,
            params={"instance_name": instance_name}
                   if operation == "instance/fetchInstances" else
                   {"number": request.args["number"]}
                   if operation.startswith("instance/connect/") and "number" in request.args else None,
            timeout=20,
        )
        if operation == "instance/create" and response.status_code in (400, 403):
            return jsonify(response.json()), response.status_code
        response.raise_for_status()
        result = response.json()
        def strip_evolution_secrets(value):
            if isinstance(value, list):
                return [strip_evolution_secrets(item) for item in value]
            if isinstance(value, dict):
                return {key: strip_evolution_secrets(item) for key, item in value.items()
                        if key.lower() not in {"token", "apikey", "api_key", "authorization"}}
            webhook_secret = os.environ.get("EVOLUTION_WEBHOOK_SECRET", "")
            if isinstance(value, str):
                for secret in (webhook_secret, EVOLUTION_API_KEY):
                    if secret and secret in value:
                        value = value.replace(secret, "[redacted]")
            return value

        result = strip_evolution_secrets(result)
        if operation == "instance/fetchInstances":
            instances = result if isinstance(result, list) else result.get("instances", [])
            result = [{field: item.get(field) for field in
                       ("name", "connectionStatus", "ownerJid", "profileName", "profilePicUrl")}
                      for item in instances
                      if isinstance(item, dict) and item.get("name") == instance_name]
        elif operation.startswith("webhook/set/"):
            result = {"success": True}
        return jsonify(result), response.status_code
    except requests.RequestException:
        app.logger.exception("Evolution gateway failed")
        return jsonify({"error": "Evolution indisponível ou recusou a operação."}), 502
    except ValueError:
        return jsonify({"error": "Resposta inválida da Evolution."}), 502

# ==============================================================================
# 2. FUNÇÃO DE DISPARO DE NOTIFICAÇÃO PUSH
# ==============================================================================
def enviar_notificacao_push(user_id: str, titulo: str, mensagem: str, lead_id: str = None, url: str = None):
    try:
        if not supabase:
            print("⚠️ Supabase não configurado para envio de push.")
            return False

        response = supabase.table('user_push_tokens').select('token').eq('user_id', user_id).execute()
        
        if not response.data:
            print(f"⚠️ Usuário {user_id} não possui token de push registrado.")
            return False

        url_destino = url or (f"https://app.consorflux.com/?lead_id={lead_id}" if lead_id else "https://app.consorflux.com")
        sucessos = 0

        for row in response.data:
            token_destino = row.get('token')
            if not token_destino:
                continue

            try:
                tag_colapso = f"consorflux_{lead_id or 'notif'}"
                message = messaging.Message(
                    notification=messaging.Notification(
                        title=titulo,
                        body=mensagem,
                    ),
                    webpush=messaging.WebpushConfig(
                        headers={"Urgency": "high"},
                        notification=messaging.WebpushNotification(
                            title=titulo,
                            body=mensagem,
                            icon="https://app.consorflux.com/ConsorFluxWhite.png",
                            badge="https://app.consorflux.com/ConsorFluxWhite.png",
                            vibrate=[200, 100, 200],
                            require_interaction=True,
                            tag=tag_colapso
                        ),
                        fcm_options=messaging.WebpushFCMOptions(
                            link=url_destino
                        )
                    ),
                    android=messaging.AndroidConfig(
                        priority='high',
                        collapse_key=tag_colapso,
                        notification=messaging.AndroidNotification(
                            tag=tag_colapso,
                            icon="https://app.consorflux.com/ConsorFluxWhite.png",
                            color="#2563EB"
                        )
                    ),
                    data={
                        "click_action": "FLUTTER_NOTIFICATION_CLICK",
                        "title": str(titulo),
                        "mensagem": str(mensagem),
                        "body": str(mensagem),
                        "url": str(url_destino),
                        "lead_id": str(lead_id) if lead_id else "",
                        "type": "NEW_LEAD" if lead_id else "GENERAL",
                        "tag": tag_colapso
                    },
                    token=token_destino
                )

                resposta_firebase = messaging.send(message)
                print(f"✅ Push enviado com sucesso ({token_destino[:15]}...)! ID: {resposta_firebase}")
                sucessos += 1
            except messaging.UnregisteredError:
                print(f"🧹 Token expirado/desregistrado removido do Supabase: {token_destino[:15]}...")
                supabase.table('user_push_tokens').delete().eq('token', token_destino).execute()
            except Exception as token_err:
                print(f"⚠️ Falha ao enviar para token {token_destino[:15]}...: {token_err}")

        return sucessos > 0

    except Exception as e:
        print(f"❌ Erro crítico ao enviar push notification: {e}")
        return False

# ==============================================================================
# 3. ROTAS PARA DISPARO E AGENDAMENTO DE NOTIFICAÇÕES
# ==============================================================================
@app.route('/notificar', methods=['POST'])
def notificar_usuario():
    try:
        data = request.json or {}
        target_user_id = data.get('target_user_id')
        titulo = data.get('titulo', '🎯 Novo Lead Recebido!')
        mensagem = data.get('mensagem', 'Você acabou de receber um novo lead. Clique para ver.')
        lead_id = data.get('lead_id')
        url = data.get('url')

        if not target_user_id:
            return jsonify({"error": "target_user_id obrigatório"}), 400

        sucesso = enviar_notificacao_push(target_user_id, titulo, mensagem, lead_id=lead_id, url=url)
        return jsonify({"success": sucesso}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/agendar-notificacao', methods=['POST'])
def agendar_notificacao():
    try:
        data = request.json
        target_user_id = data.get('target_user_id')
        titulo = data.get('titulo')
        mensagem = data.get('mensagem')
        data_hora_iso = data.get('data_hora')

        if not target_user_id or not data_hora_iso:
            return jsonify({"error": "Parâmetros incompletos"}), 400

        dt_evento = datetime.fromisoformat(data_hora_iso.replace("Z", "+00:00"))
        dt_agora = datetime.now(timezone.utc)
        segundos_espera = (dt_evento - dt_agora).total_seconds()

        if segundos_espera > 0:
            timer = threading.Timer(segundos_espera, enviar_notificacao_push, args=[target_user_id, titulo, mensagem])
            timer.start()
            print(f"⏰ Agendamento salvo! Disparo ocorrerá em {segundos_espera} segundos.")
            return jsonify({"success": True, "message": "Push agendado com sucesso."}), 200
        else:
            enviar_notificacao_push(target_user_id, titulo, mensagem)
            return jsonify({"success": True, "message": "Push disparado imediatamente."}), 200

    except Exception as e:
        print(f"❌ Erro ao agendar push: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/auth/notificar-reset', methods=['POST'])
def notificar_solicitacao_reset():
    try:
        data = request.get_json(silent=True) or {}
        email_raw = data.get('email', '')
        if not email_raw or not isinstance(email_raw, str):
            return jsonify({"error": "E-mail obrigatório."}), 400
        
        email = email_raw.strip().lower()
        if '@' not in email or '.' not in email.split('@')[-1] or len(email) > 320:
            return jsonify({"error": "Formato de e-mail inválido."}), 400

        # 1. Aciona a RPC no Supabase para marcar reset_requested = true
        if supabase:
            try:
                supabase.rpc('request_password_reset', {'request_email': email}).execute()
            except Exception as rpc_err:
                print(f"⚠️ Aviso ao chamar request_password_reset: {rpc_err}")

            # 2. Busca informações do solicitante
            profile_res = supabase.table('user_profiles').select('id, name, email, avatar_url, role').ilike('email', email).limit(1).execute()
            solicitante = profile_res.data[0] if (profile_res and profile_res.data) else None
            
            nome_solicitante = solicitante.get('name') if solicitante else None
            nome_exibicao = nome_solicitante or email.split('@')[0]

            # 3. Localiza todos os gestores (admin, administrador, gerente)
            gestores_res = supabase.table('user_profiles').select('id, name, email, role').in_('role', ['admin', 'administrador', 'gerente']).eq('status', 'ativo').execute()
            gestores = gestores_res.data if (gestores_res and gestores_res.data) else []

            # 4. Agrupa tokens únicos de todos os gestores para evitar duplicação em aparelhos físicos
            gestor_ids = [g['id'] for g in gestores if g.get('id')]
            tokens_unicos = set()
            if gestor_ids:
                tokens_resp = supabase.table('user_push_tokens').select('token').in_('user_id', gestor_ids).execute()
                for row in (tokens_resp.data or []):
                    tok = row.get('token')
                    if tok and not tok.startswith('TEST_'):
                        tokens_unicos.add(tok)

            titulo = "🔐 Solicitação de Reset de Senha"
            mensagem = f"O colaborador {nome_exibicao} ({email}) solicitou recuperação de acesso. Toque para autorizar."
            url = "https://app.consorflux.com/?open_notifications=true"
            tag_colapso = f"consorflux_reset_{email}"

            total_notificados = 0
            for token_destino in tokens_unicos:
                try:
                    message = messaging.Message(
                        notification=messaging.Notification(
                            title=titulo,
                            body=mensagem,
                        ),
                        webpush=messaging.WebpushConfig(
                            headers={"Urgency": "high"},
                            notification=messaging.WebpushNotification(
                                title=titulo,
                                body=mensagem,
                                icon="https://app.consorflux.com/ConsorFluxWhite.png",
                                badge="https://app.consorflux.com/ConsorFluxWhite.png",
                                vibrate=[200, 100, 200],
                                require_interaction=True,
                                tag=tag_colapso
                            ),
                            fcm_options=messaging.WebpushFCMOptions(
                                link=url
                            )
                        ),
                        android=messaging.AndroidConfig(
                            priority='high',
                            collapse_key=tag_colapso,
                            notification=messaging.AndroidNotification(
                                tag=tag_colapso,
                                icon="https://app.consorflux.com/ConsorFluxWhite.png",
                                color="#2563EB"
                            )
                        ),
                        data={
                            "click_action": "FLUTTER_NOTIFICATION_CLICK",
                            "title": str(titulo),
                            "mensagem": str(mensagem),
                            "body": str(mensagem),
                            "url": str(url),
                            "email": str(email),
                            "tag": str(tag_colapso),
                            "type": "RESET_REQUEST"
                        },
                        token=token_destino
                    )

                    resposta_firebase = messaging.send(message)
                    print(f"✅ Push de reset enviado ({token_destino[:15]}...)! ID: {resposta_firebase}")
                    total_notificados += 1
                except messaging.UnregisteredError:
                    print(f"🧹 Token expirado removido do Supabase: {token_destino[:15]}...")
                    supabase.table('user_push_tokens').delete().eq('token', token_destino).execute()
                except Exception as push_err:
                    print(f"⚠️ Erro ao disparar push de reset para token {token_destino[:15]}...: {push_err}")

            return jsonify({
                "success": True,
                "message": "Solicitação registrada com sucesso.",
                "notificados": total_notificados
            }), 200
        else:
            return jsonify({"success": True, "message": "Supabase offline no teste."}), 200

    except Exception as e:
        print(f"❌ Erro ao processar solicitação de reset: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/leads/notificar-transferencia', methods=['POST'])
def notificar_transferencia_leads():
    try:
        data = request.get_json(silent=True) or {}
        target_user_id = data.get('target_user_id')
        lead_count = data.get('lead_count')
        sender_name = data.get('sender_name') or 'Gestão'

        if not target_user_id or not isinstance(target_user_id, str):
            return jsonify({"error": "Identificador do destinatário (target_user_id) é obrigatório."}), 400

        try:
            lead_count = int(lead_count)
            if lead_count <= 0:
                raise ValueError()
        except (TypeError, ValueError):
            return jsonify({"error": "A quantidade de leads (lead_count) deve ser um número inteiro positivo maior que zero."}), 400

        titulo = "🎯 Novo Lead Transferido" if lead_count == 1 else "🎯 Novos Leads Transferidos"
        corpo = (
            f"Você recebeu 1 lead transferido por {sender_name}. Toque para visualizar na coluna Novo Cliente."
            if lead_count == 1
            else f"Você recebeu {lead_count} leads transferidos por {sender_name}. Toque para visualizar na coluna Novo Cliente."
        )
        url = "https://app.consorflux.com/?open_lead_board=true"
        tag_colapso = f"consorflux_transfer_{target_user_id}"

        total_notificados = 0
        if supabase:
            tokens_unicos = set()
            try:
                tokens_resp = supabase.table('user_push_tokens').select('token').eq('user_id', target_user_id).execute()
                for row in (tokens_resp.data or []):
                    tok = row.get('token')
                    if tok and not tok.startswith('TEST_'):
                        tokens_unicos.add(tok)
            except Exception as token_err:
                print(f"⚠️ Erro ao consultar tokens de push para {target_user_id}: {token_err}")

            for token_destino in tokens_unicos:
                try:
                    message = messaging.Message(
                        notification=messaging.Notification(
                            title=titulo,
                            body=corpo,
                        ),
                        webpush=messaging.WebpushConfig(
                            headers={"Urgency": "high"},
                            notification=messaging.WebpushNotification(
                                title=titulo,
                                body=corpo,
                                icon="https://app.consorflux.com/ConsorFluxWhite.png",
                                badge="https://app.consorflux.com/ConsorFluxWhite.png",
                                vibrate=[200, 100, 200],
                                require_interaction=True,
                                tag=tag_colapso
                            ),
                            fcm_options=messaging.WebpushFCMOptions(
                                link=url
                            )
                        ),
                        android=messaging.AndroidConfig(
                            priority='high',
                            collapse_key=tag_colapso,
                            notification=messaging.AndroidNotification(
                                tag=tag_colapso,
                                icon="https://app.consorflux.com/ConsorFluxWhite.png",
                                color="#2563EB"
                            )
                        ),
                        data={
                            "click_action": "FLUTTER_NOTIFICATION_CLICK",
                            "title": str(titulo),
                            "mensagem": str(corpo),
                            "url": url,
                            "type": "lead_transfer",
                            "lead_count": str(lead_count)
                        },
                        token=token_destino
                    )
                    messaging.send(message)
                    total_notificados += 1
                except messaging.UnregisteredError:
                    print(f"🗑️ Token expirado/não registrado removido para transfer: {token_destino[:15]}...")
                    supabase.table('user_push_tokens').delete().eq('token', token_destino).execute()
                except Exception as push_err:
                    print(f"⚠️ Erro ao disparar push de transferência para token {token_destino[:15]}...: {push_err}")

        return jsonify({
            "success": True,
            "lead_count": lead_count,
            "delivered": total_notificados
        }), 200

    except Exception as e:
        print(f"❌ Erro ao notificar transferência de leads: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/acoes-vendas/notificar-criacao', methods=['POST'])
def notificar_criacao_acao_venda():
    try:
        data = request.get_json(silent=True) or {}
        target_user_id = data.get('target_user_id')
        creator_name = data.get('creator_name') or 'A Liderança'
        tipo_meta = data.get('tipo_meta')
        valor_meta = data.get('valor_meta')
        bonificacao = data.get('bonificacao')
        data_limite = data.get('data_limite')

        if not target_user_id or not isinstance(target_user_id, str):
            return jsonify({"error": "Identificador do destinatário (target_user_id) é obrigatório."}), 400

        if tipo_meta not in ('cotas', 'credito'):
            return jsonify({"error": "O campo tipo_meta deve ser 'cotas' ou 'credito'."}), 400

        try:
            valor_meta = float(valor_meta)
            if valor_meta <= 0:
                raise ValueError()
        except (TypeError, ValueError):
            return jsonify({"error": "O valor da meta (valor_meta) deve ser um número positivo."}), 400

        if not bonificacao or not str(bonificacao).strip():
            return jsonify({"error": "A descrição da bonificação é obrigatória."}), 400

        if tipo_meta == 'cotas':
            meta_str = f"{int(valor_meta)} cota(s)"
        else:
            meta_str = f"R$ {valor_meta:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")

        titulo = "🎯 Nova Meta de Vendas Atribuída!"
        prazo_str = f" até {data_limite}" if data_limite else ""
        corpo = f"{creator_name} lançou um desafio: alcance a meta de {meta_str} e conquiste: {bonificacao}{prazo_str}!"
        url = "https://app.consorflux.com/?open_notifications=true"
        tag_colapso = f"consorflux_acao_venda_{target_user_id}"

        total_notificados = 0
        if supabase:
            tokens_unicos = set()
            try:
                tokens_resp = supabase.table('user_push_tokens').select('token').eq('user_id', target_user_id).execute()
                for row in (tokens_resp.data or []):
                    tok = row.get('token')
                    if tok and not tok.startswith('TEST_'):
                        tokens_unicos.add(tok)
            except Exception as token_err:
                print(f"⚠️ Erro ao consultar tokens de push para {target_user_id}: {token_err}")

            for token_destino in tokens_unicos:
                try:
                    message = messaging.Message(
                        notification=messaging.Notification(
                            title=titulo,
                            body=corpo,
                        ),
                        webpush=messaging.WebpushConfig(
                            headers={"Urgency": "high"},
                            notification=messaging.WebpushNotification(
                                title=titulo,
                                body=corpo,
                                icon="https://app.consorflux.com/ConsorFluxWhite.png",
                                badge="https://app.consorflux.com/ConsorFluxWhite.png",
                                vibrate=[200, 100, 200],
                                require_interaction=True,
                                tag=tag_colapso
                            ),
                            fcm_options=messaging.WebpushFCMOptions(
                                link=url
                            )
                        ),
                        android=messaging.AndroidConfig(
                            priority='high',
                            collapse_key=tag_colapso,
                            notification=messaging.AndroidNotification(
                                tag=tag_colapso,
                                icon="https://app.consorflux.com/ConsorFluxWhite.png",
                                color="#EAB308"
                            )
                        ),
                        data={
                            "click_action": "FLUTTER_NOTIFICATION_CLICK",
                            "title": str(titulo),
                            "mensagem": str(corpo),
                            "url": url,
                            "type": "acao_venda_criada"
                        },
                        token=token_destino
                    )
                    messaging.send(message)
                    total_notificados += 1
                except messaging.UnregisteredError:
                    print(f"🗑️ Token expirado removido: {token_destino[:15]}...")
                    supabase.table('user_push_tokens').delete().eq('token', token_destino).execute()
                except Exception as push_err:
                    print(f"⚠️ Erro ao disparar push de ação de venda para token {token_destino[:15]}...: {push_err}")

        return jsonify({
            "success": True,
            "delivered": total_notificados
        }), 200

    except Exception as e:
        print(f"❌ Erro ao notificar criação de ação de venda: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/acoes-vendas/notificar-cumprimento', methods=['POST'])
def notificar_cumprimento_acao_venda():
    try:
        data = request.get_json(silent=True) or {}
        creator_id = data.get('creator_id')
        vendedor_name = data.get('vendedor_name')
        tipo_meta = data.get('tipo_meta')
        valor_meta = data.get('valor_meta')
        bonificacao = data.get('bonificacao')

        if not creator_id or not isinstance(creator_id, str):
            return jsonify({"error": "Identificador do gestor criador (creator_id) é obrigatório."}), 400

        if not vendedor_name or not str(vendedor_name).strip():
            return jsonify({"error": "Nome do vendedor (vendedor_name) é obrigatório."}), 400

        if not bonificacao or not str(bonificacao).strip():
            return jsonify({"error": "A descrição da bonificação é obrigatória."}), 400

        if tipo_meta == 'cotas' and valor_meta:
            meta_str = f"de {int(valor_meta)} cota(s)"
        elif tipo_meta == 'credito' and valor_meta:
            meta_str = f"de R$ {float(valor_meta):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
        else:
            meta_str = "estipulada"

        titulo = "🏆 Meta Batida! Hora da Bonificação"
        corpo = f"Parabéns! O vendedor {vendedor_name} atingiu a meta {meta_str}! Prepare a bonificação: {bonificacao}."
        url = "https://app.consorflux.com/?open_team_management=true"
        tag_colapso = f"consorflux_meta_cumprida_{creator_id}"

        total_notificados = 0
        if supabase:
            tokens_unicos = set()
            try:
                tokens_resp = supabase.table('user_push_tokens').select('token').eq('user_id', creator_id).execute()
                for row in (tokens_resp.data or []):
                    tok = row.get('token')
                    if tok and not tok.startswith('TEST_'):
                        tokens_unicos.add(tok)
            except Exception as token_err:
                print(f"⚠️ Erro ao consultar tokens de push para gestor {creator_id}: {token_err}")

            for token_destino in tokens_unicos:
                try:
                    message = messaging.Message(
                        notification=messaging.Notification(
                            title=titulo,
                            body=corpo,
                        ),
                        webpush=messaging.WebpushConfig(
                            headers={"Urgency": "high"},
                            notification=messaging.WebpushNotification(
                                title=titulo,
                                body=corpo,
                                icon="https://app.consorflux.com/ConsorFluxWhite.png",
                                badge="https://app.consorflux.com/ConsorFluxWhite.png",
                                vibrate=[200, 100, 200],
                                require_interaction=True,
                                tag=tag_colapso
                            ),
                            fcm_options=messaging.WebpushFCMOptions(
                                link=url
                            )
                        ),
                        android=messaging.AndroidConfig(
                            priority='high',
                            collapse_key=tag_colapso,
                            notification=messaging.AndroidNotification(
                                tag=tag_colapso,
                                icon="https://app.consorflux.com/ConsorFluxWhite.png",
                                color="#10B981"
                            )
                        ),
                        data={
                            "click_action": "FLUTTER_NOTIFICATION_CLICK",
                            "title": str(titulo),
                            "mensagem": str(corpo),
                            "url": url,
                            "type": "acao_venda_cumprida"
                        },
                        token=token_destino
                    )
                    messaging.send(message)
                    total_notificados += 1
                except messaging.UnregisteredError:
                    print(f"🗑️ Token expirado removido: {token_destino[:15]}...")
                    supabase.table('user_push_tokens').delete().eq('token', token_destino).execute()
                except Exception as push_err:
                    print(f"⚠️ Erro ao disparar push de meta batida para gestor {token_destino[:15]}...: {push_err}")

        return jsonify({
            "success": True,
            "delivered": total_notificados
        }), 200

    except Exception as e:
        print(f"❌ Erro ao notificar cumprimento de meta: {e}")
        return jsonify({"error": str(e)}), 500

# ==============================================================================
# 4. ROTA UNIVERSAL DE CONVERSÃO HTML -> PDF (Simulador Recon)
# ==============================================================================
@app.route('/api/gerar-pdf-html', methods=['POST'])
def gerar_pdf_generico():
    try:
        data = request.get_json(silent=True) or {}
        html_content = data.get('html')
        
        if not html_content:
            return jsonify({"error": "Nenhum HTML fornecido"}), 400
        if not isinstance(html_content, str) or len(html_content.encode('utf-8')) > 2_000_000:
            return jsonify({"error": "HTML acima do limite permitido."}), 413

        # Sanitizar para evitar tags perigosas ou scripts indesejados
        html_content = re.sub(r'<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>', '', html_content, flags=re.IGNORECASE)
        html_content = re.sub(r'<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>', '', html_content, flags=re.IGNORECASE)

        with tempfile.NamedTemporaryFile(suffix=".html", delete=False, mode="w", encoding="utf-8") as in_f:
            in_f.write(html_content)
            in_path = in_f.name

        out_path = in_path + ".pdf"

        try:
            render_script = os.path.join(os.path.dirname(__file__), "render_pdf.py")
            res = subprocess.run(
                [sys.executable, render_script, in_path, out_path],
                capture_output=True,
                text=True,
                timeout=25
            )
            if res.returncode != 0:
                print(f"❌ Erro ao renderizar PDF no subprocess: {res.stderr}")
                return jsonify({"error": f"Falha na renderização do PDF: {res.stderr[:200]}"}), 500

            if not os.path.exists(out_path) or os.path.getsize(out_path) == 0:
                return jsonify({"error": "Arquivo PDF gerado está vazio ou inválido."}), 500

            with open(out_path, "rb") as out_f:
                pdf_bytes = out_f.read()

            return Response(
                pdf_bytes,
                mimetype='application/pdf',
                headers={
                    'Content-Disposition': 'attachment; filename=proposta_consorflux.pdf',
                    'Access-Control-Allow-Origin': '*'
                }
            )
        finally:
            if os.path.exists(in_path):
                try:
                    os.remove(in_path)
                except Exception:
                    pass
            if os.path.exists(out_path):
                try:
                    os.remove(out_path)
                except Exception:
                    pass

    except subprocess.TimeoutExpired as te:
        print(f"❌ Timeout (25s) ao renderizar PDF no subprocess. Stderr: {te.stderr}, Stdout: {te.stdout}", flush=True)
        return jsonify({"error": "Tempo limite excedido na geração do PDF."}), 504
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

# ==============================================================================
# 5. PROCESSAMENTO DE PDF (Assembleias) - Via Frontend (React) Admin
# ==============================================================================
@app.route('/api/admin/process-pdf', methods=['POST'])
def processar_pdf_assembleia():
    if 'pdf' not in request.files:
        return jsonify({"error": "Nenhum arquivo enviado"}), 400
        
    file = request.files['pdf']
    import tempfile
    suffix = os.path.splitext(file.filename)[1] or ".pdf"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        temp_path = tmp.name
    file.save(temp_path)
    
    try:
        dados_extraidos = extrair_dados_pdf(temp_path)
        
        if not dados_extraidos:
            return jsonify({"error": "Nenhum dado legível encontrado no PDF."}), 400
            
        novos, atualizados = atualizar_estatisticas_json(dados_extraidos)
        add_hist, up_hist = atualizar_historico_assembleias(dados_extraidos)
        
        return jsonify({
            "status": "sucesso", 
            "resumo": f"Status: {novos} novos, {atualizados} atualizados. Histórico: {add_hist} novos, {up_hist} atualizados.",
            "novos": novos,
            "atualizados": atualizados,
            "historico_novos": add_hist,
            "historico_atualizados": up_hist,
            "total_extraidos": len(dados_extraidos),
            "dados": dados_extraidos
        }), 200
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
    finally:
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception:
                pass

# ==============================================================================
# 6. INTELIGÊNCIA DO MENTORIA
# ==============================================================================
def _parse_valor(v):
    if not v: return None
    v_str = str(v).lower().replace('r$', '').replace(' ', '').strip()
    
    multiplier = 1
    if 'k' in v_str:
        multiplier = 1000
        v_str = v_str.replace('k', '')
    if 'mil' in v_str:
        multiplier = 1000
        v_str = v_str.replace('mil', '')
        
    v_str = re.sub(r'[^\d\.,]', '', v_str)
    if not v_str: return None
    
    match = re.search(r'[\.,](\d{1,2})$', v_str)
    if match:
        decimal_part = match.group(1)
        integer_part = re.sub(r'[\.,]', '', v_str[:-len(decimal_part)-1])
        v_str = f"{integer_part}.{decimal_part}"
    else:
        v_str = re.sub(r'[\.,]', '', v_str)
        
    try:
        return float(v_str) * multiplier
    except:
        return None

def consultar_planos(valor_credito_desejado: str = None, administradora: str = None) -> str:
    if not valor_credito_desejado and not administradora:
        return "ERRO: Forneça um 'valor_credito_desejado' ou 'administradora'."
        
    try:
        query = supabase.table('planos_consorcio').select('*')
        if administradora: query = query.ilike('administradora', f"%{administradora}%")
            
        valor = _parse_valor(valor_credito_desejado)
        if valor:
            query = query.gte('valor_credito', valor * 0.6).lte('valor_credito', valor * 1.4)
            
        res = query.execute()
        dados = res.data
        
        if not dados:
            return f"Nenhum plano encontrado. Nossas parceiras são: Recon, Embracon, Renault, Nissan, Âncora, Yamaha, Rodobens, Canopus e Itaú."
            
        if valor:
            dados = sorted(dados, key=lambda x: abs(float(x.get('valor_credito', 0)) - valor))
            
        dados = dados[:15]
        
        texto = "=== PLANOS ENCONTRADOS ===\n"
        for p in dados:
            texto += f"Admin: {p.get('administradora')} | Tab: {p.get('nome_tabela')} | Créd: R$ {p.get('valor_credito')} | Parcela: R$ {p.get('valor_parcela')} | Pz: {p.get('prazo')}x | Regras: {p.get('regras_gerais')}\n"
        return texto
    except Exception as e:
        return f"Erro na base: {e}"

def consultar_resultados_assembleia(grupo: str = None, administradora: str = None) -> str:
    try:
        query = supabase.table('resultados_assembleias').select('*')
        if grupo: query = query.eq('grupo', grupo)
        if administradora: query = query.ilike('administradora', f"%{administradora}%")
            
        res = query.execute()
        dados = res.data[:5]
        
        if not dados: return "Nenhum resultado de assembleia encontrado."
            
        texto = "=== RESULTADOS DE ASSEMBLEIAS ===\n"
        for r in dados:
             texto += f"[{r.get('administradora')} - Grp {r.get('grupo')}] Livre: {r.get('lance_livre')} | Fixo: {r.get('lance_fixo')} | Quitação: {r.get('quitacao')} | Fiel: {r.get('lance_fidelidade')} | Lim: {r.get('lance_limitado')}\n"
        return texto
    except Exception as e:
        return f"Erro na base: {e}"

def consultar_estrategias(administradora: str = None) -> str:
    try:
        query = supabase.table('estrategias_vendas').select('*')
        if administradora: query = query.ilike('administradora', f"%{administradora}%")
             
        res = query.execute()
        dados = res.data[:3]
        
        if not dados: return "Nenhuma estratégia específica encontrada."
            
        texto = "=== ESTRATÉGIAS DE VENDAS ===\n"
        for e in dados:
            texto += f"Admin: {e.get('administradora')} | Oportunidade: {e.get('titulo')}\nDesc: {e.get('descricao')}\nPitch: {e.get('pitch')}\n---\n"
        return texto
    except Exception as e:
        return f"Erro na base: {e}"

def extract_conversational_text(raw_text: str) -> str:
    if not raw_text:
        return ""
    text = str(raw_text).strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        match = re.search(r'(\{.*\})', text, re.DOTALL)
        if match:
            parsed = json.loads(match.group(1))
            if isinstance(parsed, dict):
                for k in ["resposta_sugerida", "reply", "message", "text", "conteudo", "resposta"]:
                    if parsed.get(k):
                        return str(parsed[k]).strip()
    except Exception:
        pass
    return text.strip()


@app.route('/chat-mentor', methods=['POST'])
def chat_mentor():
    try:
        data = request.json
        history = data.get('history', [])
        user_id = data.get('user_id')

        if not history:
            return jsonify({"error": "Histórico vazio"}), 400

        user_message_text = history[-1]['text']
        past_history = history[:-1]

        user_name = "Consultor"
        if user_id:
            try:
                user_res = supabase.table('user_profiles').select('name').eq('id', user_id).execute()
                if user_res.data and user_res.data[0].get('name'):
                    user_name = user_res.data[0]['name'].split(' ')[0]
            except Exception as e:
                pass

        # Compressão inteligente do histórico: mantém até 2 mensagens anteriores, truncadas em 200 caracteres cada
        compact_history = []
        for msg in past_history[-2:]:
            text_clean = (msg.get('text') or '').strip()
            if len(text_clean) > 200:
                text_clean = text_clean[:197] + '...'
            if text_clean:
                compact_history.append({
                    "role": msg.get("role"),
                    "text": text_clean
                })

        system_mentor = (
            f"Você é o MentorIA, consultor executivo de vendas de consórcios da GT Consórcios. Consultor: {user_name}.\n"
            "DIRETRIZES DE RESPOSTA:\n"
            "1. Seja ultra-direto, motivador e estratégico para fechamento de vendas e quebra de objeções.\n"
            "2. Responda em no máximo 3 ou 4 tópicos curtos (bullet points), sem saudações ou despedidas prolixas.\n"
            "3. Conclua a resposta perfeitamente, sem deixar frases incompletas."
        )

        prompt_mentor = f"""{system_mentor}
Histórico recente da conversa:
"""
        for msg in compact_history:
            papel = "Consultor" if msg.get("role") in ("user", "consultor") else "Mentor"
            prompt_mentor += f"{papel}: {msg.get('text')}\n"
        prompt_mentor += f"Consultor: {user_message_text}\nMentor:"

        # ----------------------------------------------------------------------
        # 0º PROVEDOR (TOP PRIORITÁRIO): ModelRouter Gateway (DeepSeek V4.1 Flash Free)
        # ----------------------------------------------------------------------
        modelrouter_key = (
            os.getenv("MODELROUTER_API_KEY")
            or get_secret("MODELROUTER_API_KEY")
            or "5bCqAIlVEVFZFMD4aYnnpI0UKcI1591nXWfQyNU9PEe2BZSB"
        ).strip()
        if modelrouter_key:
            modelrouter_base = (os.getenv("MODELROUTER_BASE_URL") or "https://modelrouter.id/v1").rstrip("/")
            modelrouter_model = (os.getenv("MODELROUTER_CHAT_MODEL") or "deepseek-v4.1-flash:free").strip()
            try:
                mr_messages = [
                    {"role": "system", "content": system_mentor}
                ]
                for m in compact_history:
                    r_role = "assistant" if m.get("role") in ("model", "assistant", "mentor") else "user"
                    mr_messages.append({"role": r_role, "content": m.get("text", "")})
                mr_messages.append({"role": "user", "content": user_message_text})

                mr_payload = {
                    "model": modelrouter_model,
                    "messages": mr_messages,
                    "temperature": 0.2,
                    "max_tokens": 1024
                }
                r_mr = requests.post(
                    f"{modelrouter_base}/chat/completions",
                    json=mr_payload,
                    headers={
                        "Authorization": f"Bearer {modelrouter_key}",
                        "Content-Type": "application/json"
                    },
                    timeout=15
                )
                if r_mr.status_code == 200:
                    data_mr = r_mr.json()
                    mr_text = data_mr.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
                    if mr_text:
                        return jsonify({"reply": mr_text}), 200
                else:
                    app.logger.warning(f"ModelRouter retornou status {r_mr.status_code}: {r_mr.text[:100]}")
            except Exception as e_mr:
                app.logger.warning(f"ModelRouter primário falhou no chat_mentor: {e_mr}")

        # ----------------------------------------------------------------------
        # 1º PROVEDOR (ALTA DISPONIBILIDADE): Cloudflare Workers AI (Llama 3.3 70B / 3.2 3B, 10.000 neurônios/dia)
        # ----------------------------------------------------------------------
        try:
            cf_prov = getattr(ai_router, 'cloudflare_provider', None)
            cf_token = str((cf_prov.api_token if cf_prov else None) or os.getenv("CLOUDFLARE_API_TOKEN") or "").strip()
            if cf_token:
                cf_url = cf_prov.base_url if cf_prov else "https://api.cloudflare.com/client/v4/accounts/84de4bcd01082e546270cc143e94106c/ai/v1/chat/completions"
                cf_model = str((cf_prov.model if cf_prov else None) or os.getenv("CLOUDFLARE_MODEL") or "@cf/meta/llama-3.3-70b-instruct-fp8-fast").strip()
                cf_messages = [
                    {"role": "system", "content": system_mentor}
                ]
                for m in compact_history:
                    role = "assistant" if m.get("role") in ("model", "assistant", "mentor") else "user"
                    cf_messages.append({"role": role, "content": m.get("text") or ""})
                cf_messages.append({"role": "user", "content": user_message_text})

                r_cf = requests.post(
                    cf_url,
                    json={
                        "model": cf_model,
                        "messages": cf_messages,
                        "temperature": 0.3,
                        "max_tokens": 1024
                    },
                    headers={
                        "Authorization": f"Bearer {cf_token}",
                        "Content-Type": "application/json"
                    },
                    timeout=15
                )
                if r_cf.status_code == 200:
                    cf_json = r_cf.json()
                    cf_text = cf_json.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
                    if cf_text:
                        return jsonify({"reply": cf_text}), 200
                else:
                    app.logger.warning(f"Cloudflare Workers AI retornou status {r_cf.status_code}: {r_cf.text[:100]}")
        except Exception as e_cf:
            app.logger.warning(f"Cloudflare Workers AI falhou no chat_mentor: {e_cf}")

        # ----------------------------------------------------------------------
        # 2º PROVEDOR (SECUNDÁRIO): Google Gemini 3.5 Flash (timeout 8s)
        # ----------------------------------------------------------------------
        gemini_key = os.getenv("GEMINI_API_KEY")
        if gemini_key:
            modelo_gemini = os.getenv("GEMINI_MODEL", "gemini-3.5-flash").strip() or "gemini-3.5-flash"
            try:
                gemini_url = f"https://generativelanguage.googleapis.com/v1beta/models/{modelo_gemini}:generateContent?key={gemini_key}"
                contents_rest = []
                for m in compact_history:
                    r_role = "model" if m.get("role") in ("model", "assistant", "mentor") else "user"
                    contents_rest.append({"role": r_role, "parts": [{"text": m.get("text", "")}]})
                contents_rest.append({"role": "user", "parts": [{"text": user_message_text}]})

                payload_gem = {
                    "contents": contents_rest,
                    "systemInstruction": {"parts": [{"text": system_mentor}]},
                    "generationConfig": {"temperature": 0.3, "maxOutputTokens": 1024}
                }
                r_gem = requests.post(gemini_url, json=payload_gem, timeout=8)
                if r_gem.status_code == 200:
                    data_gem = r_gem.json()
                    g_text = data_gem['candidates'][0]['content']['parts'][0]['text'].strip()
                    if g_text:
                        return jsonify({"reply": g_text}), 200
                else:
                    app.logger.warning(f"Gemini REST retornou status {r_gem.status_code}: {r_gem.text[:100]}")
            except Exception as e_gem:
                app.logger.warning(f"Gemini primário falhou no chat_mentor: {e_gem}")

        # ----------------------------------------------------------------------
        # 3º PROVEDOR (TERCIÁRIO / FALLBACK VPS): Ollama Qwen 3.5 4B (Oracle Cloud)
        # ----------------------------------------------------------------------
        try:
            # Probe ultrarrápido (timeout 2s) para não travar caso a VPS esteja offline
            ollama_url = (os.getenv("OLLAMA_BASE_URL") or "https://ai.alessandrouchoa.com.br:8443").rstrip("/")
            r_probe = requests.get(f"{ollama_url}/api/version", timeout=2)
            if r_probe.status_code == 200:
                ollama_prov = ai_router.ollama_provider
                result = ollama_prov.execute_task(
                    TaskType.CUSTOMER_CHAT,
                    {"content": prompt_mentor, "enable_thinking": False}
                )
                raw = (result.raw_text or "").strip()
                clean_reply = extract_conversational_text(raw)
                if clean_reply:
                    return jsonify({"reply": clean_reply}), 200
        except Exception as e_ollama:
            app.logger.warning(f"Ollama VPS inacessível ou falhou no chat_mentor: {e_ollama}")

        # ----------------------------------------------------------------------
        # 4º RESPOSTA RESILIENTE AMIGÁVEL GARANTIDA
        # ----------------------------------------------------------------------
        return jsonify({
            "reply": f"Olá {user_name}! No momento nossos servidores analíticos estão processando uma alta demanda de assembleias. Recomendo focar na sondagem do interesse do lead (imóvel ou auto), apresentar o diferencial de até 25% de lance embutido sem tirar nada do bolso e agendar uma ligação rápida para demonstrar as faixas de crédito disponíveis!"
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ==============================================================================
# 5. MOTOR DE AGENTES DE IA (GEMINI 2.5 FLASH)
# ==============================================================================
AI_LOGS = []
MAX_AI_LOGS = 100

def registrar_log_ai(agent_id: str, message: str, level: str = "info"):
    now_str = datetime.now().strftime("%H:%M:%S")
    entry = {
        "timestamp": now_str,
        "agent": agent_id,
        "message": message,
        "level": level
    }
    AI_LOGS.append(entry)
    if len(AI_LOGS) > MAX_AI_LOGS:
        AI_LOGS.pop(0)
    print(f"[{now_str}] [{agent_id}] {message}")
    return entry

@app.route('/api/ai/logs', methods=['GET'])
def obter_logs_ai():
    return jsonify({"logs": AI_LOGS, "total": len(AI_LOGS)}), 200

@app.route('/api/ai/logs/limpar', methods=['POST'])
def limpar_logs_ai():
    global AI_LOGS
    AI_LOGS = []
    return jsonify({"success": True, "message": "Logs limpos com sucesso"}), 200

@app.route('/api/ai/health', methods=['GET'])
def ai_health():
    """Retorna a saúde dos provedores de IA e métricas de telemetria sem expor segredos."""
    try:
        health_data = ai_router.get_health_status()
        return jsonify(health_data), 200
    except Exception as e:
        return jsonify({"status": "error", "error": str(e)}), 500

@app.route('/api/ai/route', methods=['POST'])
def ai_route_task_endpoint():
    """Endpoint unificado para tarefas de IA com validação de schema e roteamento inteligente."""
    try:
        data = request.json or {}
        raw_task = data.get("task_type", "")
        context = data.get("context") or {}
        if not context:
            context = {k: v for k, v in data.items() if k not in ["task_type", "bypass_cache"]}
        
        lead_id = data.get("lead_id") or context.get("lead_id")
        bypass_cache = data.get("bypass_cache", False)

        try:
            task_type = TaskType(raw_task)
        except ValueError:
            return jsonify({
                "success": False,
                "error": f"Tipo de tarefa inválido: '{raw_task}'. Tipos suportados: {[t.value for t in TaskType]}",
                "status": "INVALID_TASK_TYPE"
            }), 400

        result = ai_router.route_task(task_type, context, bypass_cache=bypass_cache)
        
        # Em modo Shadow / Assist, se for uma tarefa analítica com lead_id, persiste automaticamente
        if result.success and lead_id:
            analysis_service.record_analysis(
                task_type=task_type,
                ai_result=result,
                lead_id=str(lead_id),
                lead_context=context,
                user_id=g.user_id
            )

        return jsonify(result.to_dict()), 200 if result.success else 503
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e), "status": "INTERNAL_ERROR"}), 500

@app.route('/api/ai/analyses', methods=['GET'])
def ai_list_analyses_endpoint():
    """Retorna a lista de análises para auditoria humana e painel interno."""
    try:
        limit = int(request.args.get('limit', 50))
        filter_review = request.args.get('review_status')
        lead_id = request.args.get('lead_id')
        analyses = analysis_service.list_analyses(limit=limit, filter_review=filter_review, lead_id=lead_id)
        return jsonify({"analyses": analyses, "total": len(analyses)}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/ai/review', methods=['POST'])
def ai_human_review_endpoint():
    """Registra a auditoria humana: correto, incorreto ou correção com valores ajustados."""
    try:
        data = request.json or {}
        analysis_id = data.get("analysis_id")
        status = data.get("status")  # 'correct' | 'incorrect' | 'pending'
        correction = data.get("correction")  # dict opcional

        if not analysis_id or not status:
            return jsonify({"error": "analysis_id e status são obrigatórios"}), 400

        success = analysis_service.update_human_review(analysis_id, status, correction)
        if success:
            return jsonify({"success": True, "message": f"Auditoria registrada como '{status}'."}), 200
        else:
            return jsonify({"success": False, "error": "Falha ao atualizar auditoria no banco."}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/ai/apply-suggestion', methods=['POST'])
def ai_apply_suggestion_endpoint():
    """
    Aplica manualmente uma sugestão da IA após aprovação humana explícita.
    Audita: user_id, lead_id, analysis_id, action, before, after, timestamp.
    """
    try:
        data = request.json or {}
        analysis_id = data.get("analysis_id")
        lead_id = data.get("lead_id")
        user_id = data.get("user_id") or "consultor_autenticado"
        action = data.get("action")  # 'UPDATE_PHASE', 'UPDATE_DATA', 'SET_PRIORITY'
        applied_values = data.get("applied_values", {})

        if not lead_id or not action:
            return jsonify({"error": "lead_id e action são obrigatórios"}), 400

        # 1. Obter estado anterior do lead no board do Supabase
        before_state = {}
        after_state = dict(applied_values)
        board_id = None

        try:
            boards_res = supabase.table('crm_boards').select('id, data_payload').execute()
            if boards_res.data:
                for b in boards_res.data:
                    payload = b.get('data_payload') or {}
                    for p in payload.get('phases', []):
                        for c in p.get('clients', []):
                            if str(c.get('id')) == str(lead_id):
                                before_state = dict(c)
                                board_id = b.get('id')
                                break
                        if board_id:
                            break
                    if board_id:
                        break
        except Exception as e_b:
            print(f"⚠️ Erro ao capturar estado anterior do lead: {e_b}")

        # 2. Registrar no ai_audit_log
        audit_entry = {
            "analysis_id": analysis_id,
            "lead_id": str(lead_id),
            "user_id": str(user_id),
            "action": action,
            "before_state": before_state,
            "after_state": after_state,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        try:
            supabase.table('ai_audit_log').insert(audit_entry).execute()
        except Exception as e_audit:
            print(f"⚠️ Erro ao gravar ai_audit_log: {e_audit}")

        # 3. Marcar a análise correspondente como aprovada/correta pelo humano
        if analysis_id:
            try:
                analysis_service.update_human_review(
                    analysis_id,
                    "correct",
                    {"applied_by": user_id, "applied_action": action, "applied_at": audit_entry["timestamp"]}
                )
            except Exception as e_rev:
                print(f"⚠️ Erro ao atualizar status da análise: {e_rev}")

        return jsonify({
            "success": True,
            "message": f"Ação '{action}' aprovada e auditada com sucesso.",
            "audit": audit_entry
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500


def _get_tts_gateway_config():
    base_url = (os.getenv("AI_GATEWAY_BASE_URL") or os.getenv("OLLAMA_BASE_URL") or "https://ai.alessandrouchoa.com.br:8443").rstrip("/")
    api_key = (os.getenv("AI_GATEWAY_KEY") or get_secret("AI_GATEWAY_KEY") or os.getenv("OLLAMA_API_KEY") or get_secret("OLLAMA_API_KEY") or "xE68UqQDy6A4sA5nB1QO-vX2cr7VJSSkpILRaEkIEtjb9Jfd").strip()
    return base_url, api_key


@app.route('/api/tts/health', methods=['GET'])
def tts_health_endpoint():
    """Retorna o status do motor Kyutai Pocket-TTS na VPS."""
    try:
        base_url, api_key = _get_tts_gateway_config()
        headers = {"X-AI-Gateway-Key": api_key}
        resp = requests.get(f"{base_url}/api/tts/health", headers=headers, timeout=10.0, verify=False)
        return jsonify(resp.json()), resp.status_code
    except requests.RequestException as e:
        app.logger.warning(f"Pocket-TTS health check falhou: {e}")
        return jsonify({
            "status": "unavailable",
            "error": "Motor Pocket-TTS na VPS indisponível no momento."
        }), 503


@app.route('/api/tts/generate', methods=['POST'])
def tts_generate_endpoint():
    """Gera síntese de voz em português (voz Rafael) a partir de texto."""
    try:
        data = request.get_json(silent=True) or {}
        text = (data.get("text") or "").strip()
        voice = (data.get("voice") or "rafael").strip()
        if not text:
            return jsonify({"error": "O texto para geração de áudio é obrigatório."}), 400

        base_url, api_key = _get_tts_gateway_config()
        headers = {
            "Content-Type": "application/json",
            "X-AI-Gateway-Key": api_key,
        }
        payload = {"text": text, "voice": voice}
        resp = requests.post(f"{base_url}/api/tts/generate", json=payload, headers=headers, timeout=60.0, verify=False)
        return jsonify(resp.json()), resp.status_code
    except requests.RequestException as e:
        app.logger.exception("Falha na geração Pocket-TTS")
        return jsonify({"error": f"Falha na comunicação com o servidor de áudio IA: {str(e)}"}), 503
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/tts/clone', methods=['POST'])
def tts_clone_endpoint():
    """Clona a voz enviada na amostra para falar o texto desejado."""
    try:
        text = request.form.get("text", "").strip()
        if not text:
            return jsonify({"error": "O texto para síntese é obrigatório."}), 400

        if "voice_wav" not in request.files:
            return jsonify({"error": "Arquivo de áudio da voz (voice_wav) não enviado."}), 400

        audio_file = request.files["voice_wav"]
        base_url, api_key = _get_tts_gateway_config()
        headers = {"X-AI-Gateway-Key": api_key}

        files = {"voice_wav": (audio_file.filename or "sample.wav", audio_file.read(), audio_file.content_type or "audio/wav")}
        data = {"text": text}

        resp = requests.post(f"{base_url}/api/tts/clone", data=data, files=files, headers=headers, timeout=90.0, verify=False)
        return jsonify(resp.json()), resp.status_code
    except requests.RequestException as e:
        app.logger.exception("Falha na clonagem Pocket-TTS")
        return jsonify({"error": f"Falha na comunicação com o servidor de clonagem: {str(e)}"}), 503
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/tts/configure-token', methods=['POST'])
def tts_configure_token_endpoint():
    """Configura o token Hugging Face na VPS para desbloquear pesos de clonagem de voz."""
    try:
        data = request.get_json(silent=True) or {}
        token = (data.get("token") or "").strip()
        if not token:
            return jsonify({"error": "O token Hugging Face é obrigatório."}), 400

        base_url, api_key = _get_tts_gateway_config()
        headers = {
            "Content-Type": "application/json",
            "X-AI-Gateway-Key": api_key,
        }
        payload = {"token": token}
        resp = requests.post(f"{base_url}/api/tts/configure-token", json=payload, headers=headers, timeout=60.0, verify=False)
        return jsonify(resp.json()), resp.status_code
    except requests.RequestException as e:
        app.logger.exception("Falha na configuração do token Hugging Face")
        return jsonify({"error": f"Falha na comunicação com o servidor: {str(e)}"}), 503
    except Exception as e:
        return jsonify({"error": str(e)}), 500



class GeminiResponseWrapper:
    def __init__(self, text):
        self.text = text



def gerar_conteudo_gemini(client, prompt, temperature=0.2, prefer_vps_first=False):
    """
    Hierarquia de Execução Multi-Tier do MentorIA / Painel de Leads:
    Top 0 (Prioritário): ModelRouter Gateway (DeepSeek V4.1 Flash Free / Nemotron)
    Top 1: Qwen 3.5 4B (VPS Oracle Cloud 2 OCPUs, think=False, ultrarrápido)
    Top 2: Cloudflare Workers AI (@cf/meta/llama-3.3-70b-instruct-fp8-fast / llama-3.1-8b)
    Top 3: Google Gemini 3.5 Flash
    4º (Resiliente): Falha segura sem alterar dados se todos falharem.
    """
    erros = []

    def tentar_modelrouter():
        try:
            mr_key = (
                os.getenv("MODELROUTER_API_KEY")
                or get_secret("MODELROUTER_API_KEY")
                or "5bCqAIlVEVFZFMD4aYnnpI0UKcI1591nXWfQyNU9PEe2BZSB"
            ).strip()
            mr_base = (os.getenv("MODELROUTER_BASE_URL") or "https://modelrouter.id/v1").rstrip("/")
            mr_model = (os.getenv("MODELROUTER_DATA_MODEL") or os.getenv("MODELROUTER_CHAT_MODEL") or "deepseek-v4.1-flash:free").strip()
            if mr_key:
                payload = {
                    "model": mr_model,
                    "messages": [
                        {"role": "system", "content": "Você é o MentorIA de elite em consórcios do ConsorFlux CRM. Responda estritamente em JSON puro e válido conforme as instruções do prompt."},
                        {"role": "user", "content": prompt}
                    ],
                    "temperature": temperature,
                    "max_tokens": 1024
                }
                headers = {
                    "Authorization": f"Bearer {mr_key}",
                    "Content-Type": "application/json"
                }
                r_mr = requests.post(f"{mr_base}/chat/completions", json=payload, headers=headers, timeout=20)
                if r_mr.status_code == 200:
                    mr_data = r_mr.json()
                    raw = mr_data.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
                    if raw:
                        return GeminiResponseWrapper(raw)
                else:
                    erros.append(f"ModelRouter {mr_model} {r_mr.status_code}: {r_mr.text[:100]}")
        except Exception as e_mr:
            erros.append(f"ModelRouter: {str(e_mr)}")
        return None

    def tentar_vps():
        try:
            ollama_prov = ai_router.ollama_provider
            result = ollama_prov.execute_task(
                TaskType.COMPLEX_SUMMARY,
                {"content": prompt, "enable_thinking": False, "format": "json"}
            )
            if result.success and result.raw_text:
                return GeminiResponseWrapper(result.raw_text)
            elif result.raw_text:
                return GeminiResponseWrapper(result.raw_text)
            elif result.error:
                erros.append(f"Ollama VPS erro: {result.error}")
        except Exception as e_ollama:
            erros.append(f"Ollama VPS indisponível: {str(e_ollama)}")
        return None

    def tentar_cloudflare():
        try:
            cf_token = str(
                get_secret("CLOUDFLARE_API_TOKEN")
                or os.getenv("CLOUDFLARE_API_TOKEN")
                or ""
            ).strip()
            account_id = str(
                get_secret("CLOUDFLARE_ACCOUNT_ID")
                or os.getenv("CLOUDFLARE_ACCOUNT_ID")
                or "84de4bcd01082e546270cc143e94106c"
            ).strip()

            if cf_token and account_id:
                cf_url = f"https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1/chat/completions"
                cf_headers = {
                    "Authorization": f"Bearer {cf_token}",
                    "Content-Type": "application/json",
                    "User-Agent": "ConsorFlux-CloudRun/1.0"
                }
                cf_models = [
                    str(os.getenv("CLOUDFLARE_MODEL") or "@cf/meta/llama-3.3-70b-instruct-fp8-fast").strip(),
                    "@cf/meta/llama-3.1-8b-instruct-fp8",
                    "@cf/meta/llama-3.2-3b-instruct"
                ]
                for m_cf in cf_models:
                    try:
                        cf_payload = {
                            "model": m_cf,
                            "messages": [
                                {"role": "system", "content": "Você é o MentorIA de elite em consórcios do ConsorFlux CRM. Responda estritamente em JSON puro e válido conforme as instruções do prompt."},
                                {"role": "user", "content": prompt}
                            ],
                            "temperature": temperature,
                            "max_tokens": 512
                        }
                        t_timeout = 20 if "70b" in m_cf else 10
                        r_cf = requests.post(cf_url, json=cf_payload, headers=cf_headers, timeout=t_timeout)
                        if r_cf.status_code == 200:
                            cf_data = r_cf.json()
                            cf_raw = cf_data.get("choices", [{}])[0].get("message", {}).get("content", "")
                            if cf_raw:
                                return GeminiResponseWrapper(cf_raw)
                        else:
                            erros.append(f"Cloudflare {m_cf} {r_cf.status_code}: {r_cf.text[:100]}")
                    except Exception as e_m:
                        erros.append(f"Cloudflare {m_cf}: {str(e_m)}")
        except Exception as e_cf:
            erros.append(f"Cloudflare Workers AI: {str(e_cf)}")
        return None

    def tentar_gemini():
        api_key = get_secret("GEMINI_API_KEY") or os.getenv("GEMINI_API_KEY")
        gemini_model = os.getenv("GEMINI_MODEL", "gemini-3.5-flash").strip() or "gemini-3.5-flash"
        modelos = [gemini_model]
        for alt in ["gemini-3.5-flash", "gemini-flash-latest"]:
            if alt not in modelos:
                modelos.append(alt)

        if api_key:
            for mod in modelos:
                try:
                    url = f"https://generativelanguage.googleapis.com/v1beta/models/{mod}:generateContent?key={api_key}"
                    payload = {
                        "contents": [{"parts": [{"text": prompt}]}],
                        "generationConfig": {
                            "response_mime_type": "application/json",
                            "temperature": temperature
                        }
                    }
                    r = requests.post(url, json=payload, timeout=6)
                    if r.status_code == 200:
                        data = r.json()
                        raw_text = data['candidates'][0]['content']['parts'][0]['text']
                        return GeminiResponseWrapper(raw_text)
                    else:
                        erros.append(f"Gemini {mod} REST {r.status_code}: {r.text[:100]}")
                except Exception as e_gem_rest:
                    erros.append(f"Gemini {mod} REST: {str(e_gem_rest)}")

            if client:
                try:
                    res = client.models.generate_content(
                        model=gemini_model,
                        contents=prompt,
                        config=types.GenerateContentConfig(response_mime_type="application/json", temperature=temperature)
                    )
                    if res and res.text:
                        return res
                except Exception as e_gem_sdk:
                    erros.append(f"Gemini {gemini_model} SDK: {str(e_gem_sdk)}")
        return None

    # ORDEM DE ROTEAMENTO (ALTA VELOCIDADE & DISPONIBILIDADE)
    # TOP 1 (PRIORITÁRIO IMEDIATO): Cloudflare Workers AI (Llama 3.3 70B / 3.2 3B - 10k neurônios/dia)
    resp = tentar_cloudflare()
    if resp: return resp

    # TOP 2: ModelRouter Gateway (DeepSeek / Nemotron)
    resp = tentar_modelrouter()
    if resp: return resp

    # TOP 3: Google Gemini
    resp = tentar_gemini()
    if resp: return resp

    # TOP 4: VPS Oracle Qwen 3.5
    resp = tentar_vps()
    if resp: return resp

    # 4º RESILIENTE GARANTIDO / FALLBACK
    print(f"⚠️ Provedores de IA esgotados ({' | '.join(erros)}).")
    if "options" in prompt and ("followup" in prompt.lower() or "reengajamento" in prompt.lower() or "roteiros" in prompt.lower()):
        is_boleto = any(w in prompt.lower() for w in ['boleto', 'contrato', 'primeira parcela', '1 parcela', 'pagamento', 'pagar'])
        if is_boleto:
            fallback_json = json.dumps({
                "options": [
                    {
                        "title": "Suporte com Boleto / Código Pix",
                        "message": "Olá! Passando só para checar se você conseguiu abrir o boleto certinho ou se prefere que eu te envie a chave Pix Copia e Cola para pagar direto no app do seu banco? Se deu qualquer erro no código de barras, me avisa que resolvo para você em 1 minuto!"
                    },
                    {
                        "title": "Segurança & Alívio de Dúvidas",
                        "message": "Tudo bem por aí? É super normal bater aquele friozinho na barriga na hora de efetivar o contrato. Queria só te tranquilizar que sua proposta está 100% segura e registrada. Ficou alguma dúvida de última hora que você queira alinhar comigo antes de compensar o pagamento?"
                    },
                    {
                        "title": "Prazo para Próxima Assembleia",
                        "message": "Oi! Estou fechando as cotas ativas para a assembleia deste mês agora. Como a administradora precisa da compensação da 1ª parcela para você concorrer ao sorteio e lance, você prefere que eu segure sua vaga até o fim do dia de hoje ou precisa que eu atualize o vencimento?"
                    }
                ],
                "summary": "Roteiros focados em suporte de pagamento e quebra de insegurança pós-contrato."
            }, ensure_ascii=False)
        else:
            fallback_json = json.dumps({
                "options": [
                    {
                        "title": "Novidade / Próxima Assembleia",
                        "message": "Olá! Passando rápido para avisar que a próxima assembleia está se aproximando e abriram vagas estratégicas com lances embutidos de até 25% no seu segmento. Você prefere que eu te mande uma simulação atualizada hoje ou amanhã cedo?"
                    },
                    {
                        "title": "Parcela Reduzida (50% Off)",
                        "message": "Tudo bem? Lembrei do seu projeto e conseguimos enquadrar uma condição com parcela reduzida em até 50% até a sua contemplação, aliviando o fluxo mensal. Faz sentido vermos como fica essa parcela reduzida para você?"
                    },
                    {
                        "title": "Quebra de Padrão Direta",
                        "message": "Oi! Sei que a correria do dia a dia é grande. Só para eu me organizar por aqui: ainda está de pé o planejamento do seu consórcio ou prefere deixar para o próximo mês?"
                    }
                ],
                "summary": "Roteiros de follow-up preparados para desbloquear a resposta do cliente."
            }, ensure_ascii=False)
        return GeminiResponseWrapper(fallback_json)
    elif "detected_objection" in prompt or "quebre essa objeção" in prompt.lower():
        fallback_json = json.dumps({
            "detected_objection": "Dúvida Geral / Negociação",
            "message": "Compreendo perfeitamente o seu ponto. No consórcio, conseguimos planejar parcelas que cabem com folga no seu orçamento sem cobrança de juros bancários. Gostaria que eu te apresentasse uma simulação rápida de parcelas reduzidas de até 50%?"
        }, ensure_ascii=False)
        return GeminiResponseWrapper(fallback_json)
    elif "DIRETRIZES DA OFERTA" in prompt:
        fallback_json = json.dumps({
            "message": "Temos uma excelente oportunidade para o seu perfil no grupo desta assembleia: você pode utilizar até 25% de lance embutido da própria carta para concorrer ao lance fixo sem descapitalizar seu caixa. Posso te enviar os detalhes agora?"
        }, ensure_ascii=False)
        return GeminiResponseWrapper(fallback_json)
        return GeminiResponseWrapper(fallback_json)
    elif "status" in prompt and "ALTA_CHANCE" in prompt:
        fallback_json = json.dumps({
            "status": "MEDIA_CHANCE",
            "temperatura": "Morno",
            "chance_percentual": 65,
            "resumo_executivo": "O lead demonstrou interesse inicial e solicitou esclarecimentos sobre valores e condições. O atendimento está em andamento receptivo.",
            "pontos_fortes": ["Lead respondeu prontamente às mensagens", "Demonstrou interesse claro no segmento de consórcio"],
            "pontos_fracos": ["Necessita de simulação formal de valores para avançar"],
            "dica_vendedor": "Apresente uma proposta com opções de lance embutido e parcela reduzida para despertar senso de urgência.",
            "proxima_acao_recomendada": "Enviar simulação comparativa das faixas de crédito e parcelas."
        }, ensure_ascii=False)
        return GeminiResponseWrapper(fallback_json)

    return GeminiResponseWrapper('{"status": "ok", "message": "Atendimento processado com sucesso."}')


def parse_ai_json(text: str) -> Any:
    cleaned = (text or "").strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    match = re.search(r'(\{.*\}|\[.*\])', cleaned, re.DOTALL)
    if match:
        cleaned = match.group(1)
    return json.loads(cleaned)


@app.route('/api/ai/run-agent', methods=['POST'])
@app.route('/api/ai/executar-agente', methods=['POST'])
def executar_agente_ai():
    agent_id = 'pipeline_organizer'
    try:
        data = request.json or {}
        agent_id = data.get('agent_id', 'pipeline_organizer')
        board_data = data.get('board_data', {})
        user_id = data.get('user_id')
        client_id = data.get('client_id')
        extra_data = data.get('extra_data', {})
        user_profile = data.get('user_profile') or extra_data.get('user_profile') or {}
        if not user_profile and user_id and supabase:
            try:
                prof_resp = supabase.table('user_profiles').select('id, name, role, email').eq('id', user_id).limit(1).execute()
                if prof_resp.data:
                    user_profile = prof_resp.data[0]
            except Exception as e_prof:
                app.logger.warning(f"Erro ao buscar user_profile para {user_id}: {e_prof}")

        client = None
        try:
            client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
        except Exception:
            pass

        registrar_log_ai(agent_id, f"Iniciando execução do agente '{agent_id}'...")

        # ----------------------------------------------------------------------
        # Extração de leads e fases do boardData para uso em todos os agentes
        # ----------------------------------------------------------------------
        phases = board_data.get('phases', []) if isinstance(board_data, dict) else []
        phases_summary = [{"id": p.get("id"), "title": p.get("title")} for p in phases if isinstance(p, dict)]
        
        all_leads = []
        for p in phases:
            if not isinstance(p, dict):
                continue
            p_id = p.get("id")
            p_title = p.get("title", "")
            for c in (p.get("clients") or []):
                if isinstance(c, dict):
                    comments = [(cm.get('text', '') if isinstance(cm, dict) else str(cm)) for cm in (c.get('comments') or [])[-4:]]
                    all_leads.append({
                        "id": c.get("id"),
                        "name": c.get("name"),
                        "phone": c.get("phone"),
                        "currentPhaseId": p_id,
                        "currentPhaseTitle": p_title,
                        "credit": c.get("desiredCredit") or c.get("valor"),
                        "category": c.get("category"),
                        "leadTemp": c.get("leadTemp"),
                        "initialInfo": c.get("initialInfo"),
                        "comments": comments,
                        "appointmentsCount": len(c.get("appointments") or []),
                        "dealClosed": c.get("dealClosed", False)
                    })

        # ----------------------------------------------------------------------
        # AGENTE 1: ORGANIZADOR DE PIPELINE
        # ----------------------------------------------------------------------
        if agent_id == 'pipeline_organizer':
            active_leads = [l for l in all_leads if l.get("currentPhaseTitle", "").lower() not in ['fechado', 'perdido', 'lixeira']]
            if not active_leads:
                registrar_log_ai(agent_id, "Nenhum lead ativo encontrado no pipeline.", "warning")
                return jsonify({
                    "suggestions": [],
                    "total": 0,
                    "summary": "Nenhum lead pendente de movimentação no momento. Todos os leads já estão em suas etapas adequadas."
                }), 200

            prompt = f"""Você é o Organizador de Pipeline Inteligente de um CRM de Consórcios.
FASES DISPONÍVEIS:
{json.dumps(phases_summary, ensure_ascii=False)}

LEADS ATIVOS E HISTÓRICO:
{json.dumps(active_leads[:30], ensure_ascii=False)}

SUA MISSÃO:
Identifique quais leads devem avançar ou mudar de fase com base no histórico de comentários, agendamentos e interações.
Retorne ESTRITAMENTE em JSON puro:
{{
  "suggestions": [
    {{
      "clientId": "id_do_cliente",
      "clientName": "nome_do_cliente",
      "fromPhaseId": "id_fase_origem",
      "fromPhaseTitle": "nome_fase_origem",
      "toPhaseId": "id_fase_destino",
      "toPhaseTitle": "nome_fase_destino",
      "reason": "Explicação sucinta do porquê o lead deve mudar de fase",
      "confidence": 90
    }}
  ],
  "summary": "Resumo geral da saúde do fluxo do pipeline e movimentações recomendadas"
}}
Se nenhum lead precisar mudar de fase, retorne "suggestions": [].
"""
            response = gerar_conteudo_gemini(client, prompt, temperature=0.2, prefer_vps_first=True)
            parsed = parse_ai_json(response.text)
            suggestions = parsed.get("suggestions", []) if isinstance(parsed, dict) else (parsed if isinstance(parsed, list) else [])
            summary_txt = parsed.get("summary", f"{len(suggestions)} sugestões de movimentação geradas.") if isinstance(parsed, dict) else f"{len(suggestions)} sugestões geradas."
            registrar_log_ai(agent_id, f"Concluído. {len(suggestions)} sugestão(ões) geradas.", "success")
            return jsonify({
                "suggestions": suggestions,
                "total": len(suggestions),
                "summary": summary_txt
            }), 200

        # ----------------------------------------------------------------------
        # AGENTE 2: QUALIFICADOR DE LEADS
        # ----------------------------------------------------------------------
        elif agent_id == 'lead_qualifier':
            target_client = extra_data.get('client') or next((l for l in all_leads if str(l.get("id")) == str(client_id)), None)
            leads_to_analyze = [target_client] if target_client else (all_leads[:8] if all_leads else [
                {"name": "Lead em Atendimento", "credit": "200.000", "comments": ["Interessado em cota imobiliária para compra de imóvel"]}
            ])

            prompt = f"""Você é o Qualificador de Leads de Consórcio.
Analise os leads abaixo e qualifique com precisão seu score, probabilidade e temperatura:
{json.dumps(leads_to_analyze, ensure_ascii=False)}

Retorne ESTRITAMENTE em JSON puro:
{{
  "leads": [
    {{
      "clientName": "Nome do cliente",
      "temperature": "Quente",
      "score": 85,
      "winProbability": "75%",
      "lanceCapacidade": "Alta / Média / Baixa",
      "summary": "Resumo analítico do potencial de compra em 2 linhas",
      "recommendedAction": "Ação comercial imediata recomendada"
    }}
  ],
  "summary": "Resumo geral da qualificação da carteira"
}}
"""
            response = gerar_conteudo_gemini(client, prompt, temperature=0.2, prefer_vps_first=True)
            parsed = parse_ai_json(response.text)
            leads_res = parsed.get("leads", []) if isinstance(parsed, dict) else []
            summary_txt = parsed.get("summary", f"Qualificação realizada para {len(leads_res)} lead(s).") if isinstance(parsed, dict) else "Qualificação concluída."
            registrar_log_ai(agent_id, f"Concluído. {len(leads_res)} leads qualificados.", "success")
            return jsonify({
                "qualification": leads_res[0] if leads_res else {},
                "leads": leads_res,
                "total": len(leads_res),
                "summary": summary_txt
            }), 200

        # ----------------------------------------------------------------------
        # AGENTE 3: GERADOR DE FOLLOW-UPS & RESGATE DE LEADS
        # ----------------------------------------------------------------------
        elif agent_id == 'followup_generator':
            target_client = extra_data.get('client') or (all_leads[0] if all_leads else None)
            client_name = (target_client.get('name', 'Cliente') if target_client else 'Cliente').split(' ')[0]
            credit = (target_client.get('credit') or target_client.get('desiredCredit') or '150.000') if target_client else '150.000'
            segment = target_client.get('segment') or target_client.get('category') or 'Consórcio Geral'
            days_silent = target_client.get('daysSilent') or target_client.get('diasSemContato') or '3'
            custom_context = target_client.get('context') or target_client.get('situacao') or ''

            # Analisar os dias sem contato
            try:
                days_int = int(re.sub(r'\D', '', str(days_silent))) if re.sub(r'\D', '', str(days_silent)) else 3
            except Exception:
                days_int = 3

            # Detectar se o contexto traz situações específicas como contrato gerado, boleto pendente, etc.
            ctx_lower = (custom_context or '').lower()
            is_boleto_contrato = any(w in ctx_lower for w in ['boleto', 'contrato', 'primeira parcela', '1 parcela', 'pagar', 'pagamento', 'gerado', 'assinado'])

            # Construir diretrizes psicológicas e comerciais baseadas na janela temporal e no contexto
            if days_int <= 3:
                perfil_tempo = f"FAIXA TEMPORAL RECENTE ({days_int} dias): O lead acabou de esfriar. Abordagem leve, natural, prestativa e focada em apoio imediato."
            elif days_int <= 10:
                perfil_tempo = f"FAIXA TEMPORAL INTERMEDIÁRIA ({days_int} dias): O lead está procrastinando, esquecendo ou priorizando outras coisas. Abordagem com quebra de objeção oculta, reativação de valor e novo gancho."
            elif days_int <= 20:
                perfil_tempo = f"FAIXA TEMPORAL CRÍTICA ({days_int} dias): Silêncio prolongado. O lead provavelmente teve vergonha, objeção familiar (cônjuge/amigo desaconselhou), imprevisto financeiro ou receio de dizer 'não'. Exige empatia profunda e quebra de tabu comercial."
            else:
                perfil_tempo = f"FAIXA TEMPORAL DE RESGATE / LONGO PRAZO ({days_int} DIAS): Lead adormecido/sumido. Abordagens de choque de realidade, sinceridade radical, desapego comercial ou descarte elegante (técnica de desqualificação reversa)."

            if is_boleto_contrato:
                if days_int <= 5:
                    diretriz_opcoes = f"""SITUAÇÃO: Contrato gerado e boleto/Pix enviado há apenas {days_int} dias.
Crie 3 abordagens ágeis e prestativas:
Opção 1: Suporte Operacional e Praticidade (Facilitar chave Pix Copia e Cola / linha digitável, perguntar se deu erro no app do banco).
Opção 2: Alívio do "Frio na Barriga" (Normalizar a dúvida pós-contrato, reafirmar segurança e perguntar o que faltou).
Opção 3: Urgência Estratégica da Assembleia (Lembrar que o prazo de compensação para a próxima assembleia deste mês está se encerrando)."""
                elif days_int <= 15:
                    diretriz_opcoes = f"""SITUAÇÃO: Contrato gerado e boleto enviado, mas o lead está em silêncio há {days_int} dias (fase intermediária).
Crie 3 abordagens que abordem as reais razões desse travamento:
Opção 1: Acolhimento e Empatia Financeira (Reconhecer que imprevistos acontecem, perguntar com delicadeza se o valor da 1ª parcela pesou no orçamento e se quer ajustar o vencimento).
Opção 2: Objeção Externa / Terceiros (Perguntar com naturalidade se alguém da família ou conhecido colocou alguma dúvida na cabeça dele sobre o consórcio e oferecer explicação transparente).
Opção 3: Ultimato Cordial de Reserva da Cota (Avisar que a administradora vai liberar a cota reservada do grupo para a fila de espera caso ele não queira mais)."""
                else:
                    diretriz_opcoes = f"""SITUAÇÃO: Contrato gerado e boleto pendente há {days_int} DIAS SEM NENHUM CONTATO (Longa ausência). O lead sumiu, visualiza ou ignora.
Crie 3 abordagens de CHOQUE DE REALIDADE, SINCERIDADE RADICAL e DESAPEGO:
Opção 1: Choque de Realidade com Sinceridade e Abertura (Falar de forma limpa: "{client_name}, vou ser bem direto e transparente com você: vi que já faz {days_int} dias que geramos seu contrato e você sumiu. Aconteceu algum imprevisto sério, alguém colocou medo em você ou eu falhei em alguma explicação? Pode me falar a verdade, zero ressentimentos").
Opção 2: Desqualificação Reversa / Cancelamento Elegante ("{client_name}, como faz {days_int} dias que não temos retorno sobre o contrato da sua cota de R$ {credit}, estou dando baixa na reserva para liberar a vaga e não ficar te incomodando. Se você já desistiu de conquistar seu {segment} agora, me dá só um 'ok' para eu arquivar sua ficha por aqui").
Opção 3: Quebra de Constrangimento / Alívio de Vergonha (Mostrar que entende que a pessoa pode ter ficado sem jeito de avisar que apertou financeiramente: "Sei que às vezes o momento aperta e ficamos sem jeito de avisar. Se o plano mudou ou apertou, não precisa ficar com vergonha. Prefere que a gente reduza a carta ou cancele por enquanto?")."""
            else:
                if days_int <= 5:
                    diretriz_opcoes = f"""SITUAÇÃO: Lead sem responder há {days_int} dias. Contexto: {custom_context or 'Visualizou simulação'}.
Opção 1: Abordagem Consultiva Direta ligada ao contexto ({custom_context}).
Opção 2: Parcela Reduzida em até 50% ou Lance Embutido de até 25% com gancho de oportunidade.
Opção 3: Pergunta Curta e Direta de WhatsApp."""
                elif days_int <= 15:
                    diretriz_opcoes = f"""SITUAÇÃO: Lead em silêncio há {days_int} dias. Contexto: {custom_context or 'Negociação parada'}.
Opção 1: Quebra da Objeção Silenciosa (Endereçar o motivo real: dúvida de lance, medo de demorar a contemplar ou parcela).
Opção 2: Nova Proposta ou Reenquadramento de Valor (Redução de crédito ou plano mais confortável para o momento).
Opção 3: Pergunta de Prioridade de Vida (Saber se a conquista do {segment} ainda é prioridade para este ano)."""
                else:
                    diretriz_opcoes = f"""SITUAÇÃO: Lead em silêncio há {days_int} DIAS (Longo abandono). Contexto: {custom_context or 'Sumido da negociação'}.
Opção 1: Choque de Realidade / Sinceridade Aberta (Perguntar abertamente se ouviu alguma crítica de conhecidos ou se o vendedor errou em algo).
Opção 2: Desapego / Permissão para Desistir (Dar o direito do cliente dizer 'não' com dignidade para quebrar a barreira do silêncio).
Opção 3: Reativação por Mudança de Cenário (Avisar sobre nova condição de mercado e perguntar se ainda sonha com esse {segment} ou se engavetou o plano)."""

            prompt = f"""Você é o Especialista Supremo em Vendas Consultivas e Fechamento de Consórcios por WhatsApp.
DADOS DO LEAD:
- Nome: {client_name}
- Crédito pretendido: R$ {credit}
- Segmento: {segment}
- Dias sem contato: {days_int} dias
- Contexto exato digitado pelo consultor: "{custom_context or 'Sem resposta recente'}"

PERFIL PSICOLÓGICO DO TEMPO:
{perfil_tempo}

DIRETRIZ DE CRIAÇÃO:
{diretriz_opcoes}

REGRAS DE OURO:
1. CONSIDERE PROFUNDAMENTE OS {days_int} DIAS SEM CONTATO. Se for muito tempo ({days_int} >= 15 ou 30 dias), NÃO envie mensagens amenas como se tivessem falado ontem! Seja impactante, use choque de realidade, desapego comercial e autorização para falar a verdade sem medo.
2. CONECTE-SE FORTEMENTE AO CONTEXTO INFORMADO: "{custom_context}". O lead e a situação devem ser citados de forma humana e personalizada.
3. Se o lead sumiu por muito tempo após receber boleto/contrato, explore as dores reais: frio na barriga, conselho negativo de parente, imprevisto financeiro, vergonha de responder, ou se o vendedor foi inconveniente.
4. Linguagem 100% brasileira de WhatsApp: direta, respeitosa, persuasiva, quebra de padrão autêntica, sem clichês corporativos vazios.
5. CADA opção deve terminar com uma pergunta curta (Call to Action) impossível de ignorar.
6. Tamanho ideal: 3 a 5 linhas.

Retorne ESTRITAMENTE em formato JSON:
{{
  "options": [
    {{"title": "Título descritivo da Opção 1", "message": "texto formatado para WhatsApp com emojis e pergunta final"}},
    {{"title": "Título descritivo da Opção 2", "message": "texto formatado para WhatsApp com emojis e pergunta final"}},
    {{"title": "Título descritivo da Opção 3", "message": "texto formatado para WhatsApp com emojis e pergunta final"}}
  ],
  "summary": "Breve justificativa estratégica sobre a dosagem de agressividade para {days_int} dias de silêncio."
}}
"""
            response = gerar_conteudo_gemini(client, prompt, temperature=0.4)
            parsed = parse_ai_json(response.text)
            
            opts = []
            if isinstance(parsed, dict):
                opts = parsed.get("options") or parsed.get("followups") or parsed.get("followUps") or []
            elif isinstance(parsed, list):
                opts = parsed

            followups = []
            for i, o in enumerate(opts):
                if isinstance(o, dict):
                    t = o.get("title") or o.get("tipo") or o.get("titulo") or f"Opção {i+1}"
                    m = o.get("message") or o.get("mensagem") or o.get("text") or ""
                    followups.append({"tipo": t, "mensagem": m})
                elif isinstance(o, str):
                    followups.append({"tipo": f"Opção {i+1}", "mensagem": o})

            if not followups:
                if is_boleto_contrato:
                    if days_int >= 20:
                        followups = [
                            {
                                "tipo": "Choque de Realidade & Sinceridade Radical",
                                "mensagem": f"{client_name}, vou ser bem sincero com você: já fazem {days_int} dias que geramos o seu contrato de R$ {credit} e você sumiu completamente. Aconteceu algum imprevisto sério, alguém colocou medo em você sobre consórcio ou eu falei alguma besteira na negociação? Pode me mandar a real, prefiro a verdade do que o silêncio!"
                            },
                            {
                                "tipo": "Desapego Comercial & Baixa na Reserva",
                                "mensagem": f"Oi {client_name}! Como já se passaram {days_int} dias sem retorno sobre o boleto da 1ª parcela, estou dando baixa na reserva da sua cota para liberar para a fila de espera e não ficar te incomodando. Se você decidiu engavetar a compra do seu {segment}, me manda só um 'ok' para eu arquivar por aqui, tá bem?"
                            },
                            {
                                "tipo": "Alívio de Vergonha & Empatia Financeira",
                                "mensagem": f"{client_name}, tudo bem? Sei que a vida às vezes dá uma reviravolta e a gente fica até sem jeito de avisar que o orçamento apertou para a 1ª parcela. Fica em paz! Você prefere que a gente reduza o valor da carta para uma parcela menor ou prefere cancelar sem estresse?"
                            }
                        ]
                    elif days_int >= 6:
                        followups = [
                            {
                                "tipo": "Empatia Financeira & Ajuste de Vencimento",
                                "mensagem": f"Oi {client_name}, tudo bem? Vi que já fazem {days_int} dias que o contrato e o boleto foram gerados. Sei que o orçamento às vezes oscila na virada de data. O valor da 1ª parcela apertou um pouco para esse momento ou você prefere que eu atualize o vencimento para uma data melhor?"
                            },
                            {
                                "tipo": "Objeção Externa & Segurança na Decisão",
                                "mensagem": f"{client_name}, você chegou a conversar com algum familiar ou amigo sobre o consórcio e te colocaram alguma pulga atrás da orelha? É muito comum pessoas sem conhecimento darem palpites errados. Quer que eu tire alguma dúvida com total transparência com você?"
                            },
                            {
                                "tipo": "Prazo Limite da Reserva da Cota",
                                "mensagem": f"Olá {client_name}! A administradora mantém a cota reservada por tempo limitado antes de cancelar o contrato gerado. Como já temos {days_int} dias de espera, você quer que eu mantenha sua condição ativa ou prefere que eu libere a vaga?"
                            }
                        ]
                    else:
                        followups = [
                            {
                                "tipo": "Suporte e Praticidade (Pix / Linha Digitável)",
                                "mensagem": f"Olá {client_name}, tudo bem? Vi aqui que geramos o seu contrato da cota de R$ {credit}. Como muitos bancos têm limite diário ou barram código de barras pelo app, passando para saber se você conseguiu abrir o boleto direitinho ou se prefere que eu te envie o Pix Copia e Cola para facilitar?"
                            },
                            {
                                "tipo": "Segurança e Esclarecimento de Dúvidas",
                                "mensagem": f"Oi {client_name}! É super normal bater aquele frio na barriga na hora de efetivar o contrato da cota, afinal é uma conquista importante para o seu {segment}. Surgiu alguma dúvida de última hora nos termos ou nas condições que você gostaria de esclarecer antes de oficializar o pagamento?"
                            },
                            {
                                "tipo": "Prazo de Compensação para Assembleia",
                                "mensagem": f"{client_name}, passando um aviso rápido e importante: para a sua cota já participar ativamente da próxima assembleia deste mês, o sistema da administradora precisa que a compensação ocorra até amanhã. Você quer que eu segure sua vaga no grupo ou prefere que a gente replaneje a data?"
                            }
                        ]
                else:
                    if days_int >= 20:
                        followups = [
                            {
                                "tipo": "Choque de Realidade & Desapego",
                                "mensagem": f"{client_name}, faz {days_int} dias que não nos falamos sobre seu {segment} de R$ {credit}. Vou assumir que você desistiu ou não é o momento, e está tudo bem! Só para eu encerrar seu atendimento no CRM: engavetou o projeto ou ainda tem interesse?"
                            },
                            {
                                "tipo": "Sinceridade Radical (Feedback)",
                                "mensagem": f"Oi {client_name}! Quando um cliente some por {days_int} dias, normalmente ou o vendedor foi chato, ou surgiu uma dúvida que não foi sanada, ou a prioridade mudou. Qual dessas 3 aconteceu no seu caso? Pode ser 100% sincero!"
                            },
                            {
                                "tipo": "Nova Oportunidade de Mercado",
                                "mensagem": f"{client_name}, sei que faz bastante tempo que não nos falamos. Abriu uma janela muito diferenciada para cartas de R$ {credit} com parcelas reduzidas este mês. Se você ainda sonha com seu {segment}, me avisa para eu te mostrar."
                            }
                        ]
                    else:
                        followups = [
                            {
                                "tipo": "Novidade / Próxima Assembleia",
                                "mensagem": f"Olá {client_name}! Passando rápido para avisar que a próxima assembleia de {segment} está se aproximando e abriram vagas estratégicas com lance embutido de até 25% para a carta de R$ {credit}. Você prefere que eu te mande uma simulação hoje ou amanhã cedo?"
                            },
                            {
                                "tipo": "Parcela Reduzida (Condição Comercial)",
                                "mensagem": f"Tudo bem, {client_name}? Lembrei do seu planejamento e conseguimos enquadrar uma condição com parcela reduzida em até 50% até a contemplação para o crédito de R$ {credit}. Faz sentido vermos como fica essa parcela reduzida para você?"
                            },
                            {
                                "tipo": "Quebra de Padrão Direta",
                                "mensagem": f"Oi {client_name}! Sei que a correria é grande ({days_int} dias passam voando). Só para eu me organizar por aqui: ainda está de pé o projeto do seu {segment} ou prefere deixar para o próximo mês?"
                            }
                        ]

            registrar_log_ai(agent_id, f"Follow-ups gerados com sucesso para '{client_name}' ({days_int} dias).", "success")
            return jsonify({
                "followups": followups,
                "options": followups,
                "summary": (parsed.get("summary") if isinstance(parsed, dict) else None) or f"3 roteiros calibrados para {days_int} dias de silêncio de {client_name}."
            }), 200

        # ----------------------------------------------------------------------
        # AGENTE 4: QUEBRADOR DE OBJEÇÕES ESTRUTURADO (3 PASSOS)
        # ----------------------------------------------------------------------
        elif agent_id == 'objection_handler':
            obj_text = (extra_data.get('objection') or '').strip()
            if not obj_text:
                obj_text = 'Consórcio demora muito para contemplar e a parcela está acima do que planejei.'

            # 1. Obter regras oficiais da Administradora
            admin_rules = {}
            company_name = "Consórcio Recon"
            company_years = "37+"
            max_lance_embutido = "25%"
            try:
                if supabase:
                    res_adm = supabase.table('administradoras_consorcio').select('*').eq('ativo', True).limit(1).execute()
                    if res_adm.data:
                        adm = res_adm.data[0]
                        admin_rules = adm.get('regras_comerciais_ia') or {}
                        company_name = adm.get('nome') or company_name
                        company_years = str(adm.get('anos_mercado') or company_years)
                        max_lance_embutido = f"{adm.get('teto_lance_embutido') or 25}%"
            except Exception as e_adm:
                app.logger.warning(f"Erro ao carregar administradora em objection_handler: {e_adm}")

            # 2. Consultar mentoria_objections_knowledge para identificar a objeção correspondente
            matched_obj = None
            try:
                if supabase:
                    res_obj = supabase.table('mentoria_objections_knowledge').select('*').execute()
                    obj_lower = obj_text.lower()
                    for row in (res_obj.data or []):
                        pats = [str(p).lower() for p in (row.get('patterns') or [])]
                        name_low = (row.get('name') or '').lower()
                        if any(p in obj_lower for p in pats) or name_low in obj_lower:
                            matched_obj = row
                            break
            except Exception as e_obj_match:
                app.logger.warning(f"Erro ao buscar padrões de objeções: {e_obj_match}")

            knowledge_context = ""
            if matched_obj:
                knowledge_context = f"""
BASE DE CONHECIMENTO ENCONTRADA:
- Nome da Objeção: {matched_obj.get('name')}
- Psicologia do Lead: {matched_obj.get('psychology')}
- Estratégia Comercial: {matched_obj.get('strategy')}
- Roteiro Modelo Validado: {matched_obj.get('ideal_template')}
- Regras Obrigatórias: {json.dumps(matched_obj.get('rules') or [], ensure_ascii=False)}
"""

            prompt = f"""Você é o Especialista Sênior em Negociação e Quebra de Objeções de Consórcios da {company_name} ({company_years} anos de mercado, autorizada e fiscalizada pelo Banco Central, lance embutido de até {max_lance_embutido}, opções de parcelas reduzidas em até 50%).

ENTRADA DO CONSULTOR / MENSAGEM DO LEAD:
"{obj_text}"
{knowledge_context}

ETAPA 1 - VERIFICAÇÃO DE VALIDADE:
Avalie se a entrada acima é de fato uma OBJEÇÃO, DÚVIDA, RESISTÊNCIA ou COMPARATIVO relacionado a consórcio, compra de imóvel, veículo, moto, parcelas, prazos, taxas, bancos, concorrência ou investimentos.
- Se a mensagem NÃO for uma objeção (por exemplo: "bom dia", "quero comprar um bolo", "quantos anos você tem?", ou um texto completamente sem sentido/sem relação com vendas ou consórcios), defina "is_objection": false e informe em "warning" que a frase digitada não parece ser uma objeção de vendas.

ETAPA 2 - SE FOR OBJEÇÃO ("is_objection": true):
Crie um roteiro persuasivo e de altíssima conversão dividido ESTRITAMENTE em 3 passos:
- Passo 1 (Empatia & Conexão): Validar o sentimento do cliente sem confronto, gerando acolhimento imediato (ex: "Entendo perfeitamente sua preocupação...", "Você tem total razão em cuidar disso...").
- Passo 2 (Argumento Irrefutável): Destruir a objeção com matemática prática, lógica de consórcio, benefícios exclusivos da {company_name} (lance embutido de até {max_lance_embutido}, parcela reduzida até 50%, zero juros bancários, segurança jurídica da Lei 11.795).
- Passo 3 (Gancho de Fechamento / Pergunta CTA): Finalizar OBRIGATORIAMENTE com uma pergunta reflexiva ou convite fechado para avançar (ex: "Faz sentido olharmos isso juntos?", "Qual horário fica melhor para alinharmos?").

Retorne ESTRITAMENTE em JSON puro:
{{
  "is_objection": true,
  "objection_name": "Nome resumido da objeção identificada",
  "warning": "",
  "script": {{
    "passo1_empatia": "Texto do Passo 1",
    "passo2_argumento": "Texto do Passo 2",
    "passo3_fechamento": "Texto do Passo 3"
  }},
  "summary": "Orientação rápida de postura e tom de voz para o consultor"
}}
"""
            response = gerar_conteudo_gemini(client, prompt, temperature=0.25)
            parsed = parse_ai_json(response.text)
            
            is_obj = parsed.get("is_objection", True) if isinstance(parsed, dict) else True
            script_data = parsed.get("script", {}) if isinstance(parsed, dict) else {}
            
            # Fallback se o JSON não estruturou script
            if is_obj and not script_data:
                script_data = {
                    "passo1_empatia": parsed.get("passo1_empatia", "Entendo perfeitamente a sua colocação!"),
                    "passo2_argumento": parsed.get("passo2_argumento", f"Com a {company_name}, você conta com lance embutido de até {max_lance_embutido} e parcela reduzida para conquistar seu bem sem juros."),
                    "passo3_fechamento": parsed.get("passo3_fechamento", "O que você acha de vermos a simulação com esses números agora?")
                }

            registrar_log_ai(agent_id, f"Quebrador de objeção executado: {'Objeção tratada' if is_obj else 'Entrada não é objeção'}.", "success")
            return jsonify({
                "is_objection": is_obj,
                "objection_name": parsed.get("objection_name", "Objeção Comercial"),
                "warning": parsed.get("warning", ""),
                "script": script_data,
                "summary": parsed.get("summary", "Roteiro estruturado pronto para aplicação.")
            }), 200

        # ----------------------------------------------------------------------
        # AGENTE 5: GERADOR DE CHAMADAS DE AÇÃO (CTA) COM CONDIÇÃO ESPECIAL
        # ----------------------------------------------------------------------
        elif agent_id == 'proposal_generator':
            prop_data = extra_data.get('proposal') or {}
            lead_ref = all_leads[0] if all_leads else {}
            credito = prop_data.get('credito') or lead_ref.get('credit') or '200.000'
            parcela = prop_data.get('parcela') or '1.180'
            segmento = prop_data.get('segmento') or lead_ref.get('category') or 'Imóvel'
            prazo = prop_data.get('prazo') or '180 meses'
            oferta_especial = prop_data.get('oferta_especial') or prop_data.get('promocao') or ''

            prompt = f"""Você é o Especialista em Abordagens de Fechamento e Chamadas de Ação (CTA) de Consórcios.
Crie uma mensagem comercial irresistível pronta para envio no WhatsApp com alta conversão.

PARÂMETROS DA PROPOSTA:
- Crédito: R$ {credito}
- Parcela Estimada: R$ {parcela}
- Segmento: {segmento}
- Prazo Médio: {prazo}
- Oferta Especial / Condição Promocional: {oferta_especial or 'Condição especial de parcela reduzida em até 50% e lance embutido'}

DIRETRIZES DE OURO:
1. Comece com energia positiva e destaque do crédito e parcela.
2. Contraste com a economia frente aos juros do banco.
3. Se houver Oferta Especial informada, destaque ela com entusiasmo e urgência ética.
4. OBRIGATÓRIO: Conclua SEMPRE a mensagem com uma PERGUNTA ATIVA DE FECHAMENTO (CTA) que convide o cliente a responder agora (ex: "Qual dos dois horários fica melhor para você?", "Podemos emitir a simulação oficial para você conferir?").
5. Formate com espaçamento agradável e emojis elegantes no WhatsApp.

Retorne ESTRITAMENTE em JSON puro:
{{
  "tituloProposta": "Chamada Comercial de Alta Conversão",
  "credito": "{credito}",
  "parcela": "{parcela}",
  "mensagemApresentacao": "Texto completo formatado com emojis para envio no WhatsApp finalizando com pergunta ativa de CTA",
  "destaques": [
    "Economia real de mais de 50% em comparação ao financiamento bancário",
    "Opção de lance embutido de até 25% para antecipar a posse",
    "Parcela reduzida até a contemplação"
  ],
  "summary": "Mensagem com forte gancho de resposta formulada com sucesso."
}}
"""
            response = gerar_conteudo_gemini(client, prompt, temperature=0.3)
            parsed = parse_ai_json(response.text)
            registrar_log_ai(agent_id, "Proposta e chamada de ação formuladas com sucesso.", "success")
            return jsonify({
                "proposal": parsed,
                "tituloProposta": parsed.get("tituloProposta", "Chamada Comercial de Alta Conversão"),
                "mensagemApresentacao": parsed.get("mensagemApresentacao"),
                "destaques": parsed.get("destaques", []),
                "summary": parsed.get("mensagemApresentacao", "Proposta comercial formulada com sucesso.")
            }), 200

        # ----------------------------------------------------------------------
        # AGENTE 6: AVALIADOR DE ATENDIMENTO (DINÂMICO, REALISTA & MULTI-TIER)
        # ----------------------------------------------------------------------
        elif agent_id == 'attendance_evaluator':
            now = datetime.now()
            cur_month = int(extra_data.get('currentMonth') or now.month)
            cur_year = int(extra_data.get('currentYear') or now.year)
            month_name = extra_data.get('monthName') or f"{cur_month:02d}/{cur_year}"

            def is_current_month(dt_val):
                if not dt_val:
                    return False
                try:
                    s = str(dt_val).replace('Z', '+00:00')
                    dt = datetime.fromisoformat(s)
                    return dt.month == cur_month and dt.year == cur_year
                except Exception:
                    return False

            total_leads = len(all_leads)
            leads_mes_atual = [l for l in all_leads if is_current_month(l.get("createdAt"))]
            leads_recuperacao = [l for l in all_leads if not is_current_month(l.get("createdAt")) and (is_current_month(l.get("updatedAt")) or any(is_current_month(c.get("date") if isinstance(c, dict) else None) for c in (l.get("comments") or [])))]
            
            hot_leads = len([l for l in all_leads if str(l.get("leadTemp", "")).lower() == 'quente'])
            warm_leads = len([l for l in all_leads if str(l.get("leadTemp", "")).lower() == 'morno'])
            cold_leads = len([l for l in all_leads if str(l.get("leadTemp", "")).lower() == 'frio'])
            
            low_score_leads = [l for l in all_leads if float(l.get("aiScore") or 50) < 50]
            high_score_leads = [l for l in all_leads if float(l.get("aiScore") or 0) >= 75]
            unannotated_leads = [l for l in all_leads if not l.get("comments") or len(l.get("comments")) == 0]
            
            leads_closed = [l for l in all_leads if l.get("dealClosed", False)]
            leads_closed_this_month = [l for l in leads_closed if is_current_month(l.get("dealClosedDate")) or is_current_month(l.get("updatedAt"))]

            # Amostra de anotações comerciais recentes
            sample_notes = []
            for l in all_leads:
                for c in (l.get("comments") or []):
                    if isinstance(c, dict) and c.get("text"):
                        sample_notes.append(f"[{l.get('name', 'Lead')}]: {c.get('text')}")
                    elif isinstance(c, str):
                        sample_notes.append(f"[{l.get('name', 'Lead')}]: {c}")
                if len(sample_notes) >= 8:
                    break

            # Mensagens recentes de WhatsApp
            wa_snippets = extra_data.get('recentWhatsApp') or []
            if not wa_snippets:
                try:
                    wa_res = supabase.table('whatsapp_messages').select('from_me, text, created_at').order('created_at', desc=True).limit(8).execute()
                    if wa_res.data:
                        wa_snippets = [f"{'Vendedor' if m.get('from_me') else 'Cliente'}: {m.get('text')}" for m in wa_res.data if m.get('text')]
                except Exception:
                    pass

            user_role = str(user_profile.get('role') or extra_data.get('role') or 'vendedor').lower()
            user_name = user_profile.get('name') or extra_data.get('userName') or 'Consultor Comercial'

            is_supervisor = user_role in ('supervisor', 'supervisora')
            is_gerente_admin = user_role in ('gerente', 'admin', 'administrador')

            if is_gerente_admin:
                context_role = f"Você é o Diretor Executivo Comercial da GT Consórcios. Audite a postura comercial macro de todas as equipes e vendedores geridos por {user_name}."
                target_hint = "Forneça diagnóstico da postura operacional global, pontos fortes consolidados, gargalos de atendimento da equipe e diretrizes executivas."
            elif is_supervisor:
                context_role = f"Você é o Mentor de Liderança e Gestão Comercial da GT Consórcios. Audite a atuação do Supervisor {user_name} na condução da sua equipe de vendedores."
                target_hint = "Forneça análise de liderança da equipe, pontos fortes coletivos, gargalos operacionais da equipe, dicas táticas de como o supervisor deve cobrar/treinar seus vendedores e meta diária do time."
            else:
                context_role = f"Você é o Treinador e Auditor Comercial de Alta Performance de Consórcios. Audite rigorosamente a postura, velocidade e disciplina de vendas do consultor {user_name}."
                target_hint = "Forneça análise individual justa, pontos fortes no atendimento, pontos de melhoria no contato/follow-up, dica tática direta de postura/venda e meta diária pessoal."

            metrics_summary = {
                "totalLeadsAtivos": total_leads,
                "leadsCriadosMesAtual": len(leads_mes_atual),
                "leadsRecuperacaoMesAtual": len(leads_recuperacao),
                "cotasFechadasTotal": len(leads_closed),
                "cotasFechadasMesAtual": len(leads_closed_this_month),
                "quentes": hot_leads,
                "mornos": warm_leads,
                "frios": cold_leads,
                "leadsComScoreAbaixo50": len(low_score_leads),
                "leadsComScoreAcima75": len(high_score_leads),
                "leadsSemAnotacoes": len(unannotated_leads),
                "periodoReferencia": month_name
            }

            prompt = f"""{context_role}
{target_hint}

MÉTRICAS DO CRM PARA O MÊS VIGENTE ({month_name}):
{json.dumps(metrics_summary, ensure_ascii=False, indent=2)}

AMOSTRA DE ANOTAÇÕES/ATIVIDADES RECENTES NOS CARDS:
{json.dumps(sample_notes[:6], ensure_ascii=False) if sample_notes else "Sem anotações detalhadas registradas recentemente."}

AMOSTRA DE CONVERSAS RECENTES NO WHATSAPP:
{json.dumps(wa_snippets[:6], ensure_ascii=False) if wa_snippets else "Sem mensagens recentes de WhatsApp registradas."}

REGRA CRÍTICA DE CALIBRAÇÃO (NOTA REALISTA E JUSTA DE 0.0 A 10.0):
1. A nota DEVE oscilar fielmente com base na qualidade e consistência dos dados acima.
2. JAMAIS retorne nota 8.8 ou valores simbólicos fixos. A nota DEVE ser dinâmica e justa.
3. Se a carteira possuir muitos leads frios, muitos leads com Score IA abaixo de 50%, ou leads sem anotações/atividades no CRM, a nota DEVE sofrer penalização real (ex: entre 4.5 e 6.8).
4. Se o atendimento demonstrar alto engajamento, anotações frequentes, velocidade no WhatsApp e cotas fechadas, a nota sobe proporcionalmente (ex: entre 7.5 e 9.2).
5. Quase impossível cravar 10.0. Retorne sempre nota formatada com uma casa decimal (ex: '5.7', '6.8', '7.4', '8.2').

Retorne ESTRITAMENTE em JSON puro:
{{
  "notaGeral": "6.8",
  "score": 68,
  "classificacao": "Em Desenvolvimento",
  "pontosFortes": "2 aspectos positivos concretos evidenciados nos dados",
  "pontosMelhoria": "1 ou 2 maiores deficiências de postura, tempo de resposta ou registro de notas a corrigir",
  "dicaPratica": "Instrução tática direta para aplicar hoje (se supervisor/gerente, dica de liderança/cobrança)",
  "metaDiaSeguinte": "Desafio específico para o próximo dia",
  "feedbackGeral": "Parecer executivo detalhado sobre o atendimento"
}}
"""
            response = gerar_conteudo_gemini(client, prompt, temperature=0.3, prefer_vps_first=True)
            parsed = parse_ai_json(response.text)
            
            raw_nota = str(parsed.get("notaGeral") or "").strip()
            # Validação para evitar qualquer fallback fixo
            if not raw_nota or raw_nota in ("8.8", "8.5"):
                # Cálculo paramétrico auxiliar caso a IA tente retornar padrão
                base_calc = 5.0
                if total_leads > 0:
                    pct_high = len(high_score_leads) / total_leads
                    pct_low = len(low_score_leads) / total_leads
                    pct_closed = len(leads_closed_this_month) / max(total_leads, 1)
                    base_calc += (pct_high * 2.5) - (pct_low * 2.0) + (pct_closed * 3.0)
                    if len(unannotated_leads) > (total_leads * 0.4):
                        base_calc -= 1.0
                calc_score = round(max(3.5, min(9.4, base_calc)), 1)
                raw_nota = f"{calc_score:.1f}"

            score_num = int(float(raw_nota) * 10)
            classif = "Alta Performance" if score_num >= 85 else ("Bom Desempenho" if score_num >= 75 else ("Em Desenvolvimento" if score_num >= 60 else "Abaixo da Média"))

            evaluation_data = {
                "notaGeral": raw_nota,
                "score": score_num,
                "classificacao": parsed.get("classificacao") or classif,
                "pontosFortes": parsed.get("pontosFortes", "Acompanhamento proativo nas etapas iniciais do funil."),
                "pontosMelhoria": parsed.get("pontosMelhoria", "Aumentar a profundidade das anotações e qualificação financeira."),
                "dicaPratica": parsed.get("dicaPratica", "Ao enviar simulação, agende imediatamente uma chamada de alinhamento."),
                "metaDiaSeguinte": parsed.get("metaDiaSeguinte", "Fazer contato com ao menos 3 leads mornos com roteiro focado em lance."),
                "feedbackGeral": parsed.get("feedbackGeral", f"Desempenho avaliado em {raw_nota}/10 para o mês de {month_name}.")
            }
            registrar_log_ai(agent_id, f"Auditoria concluída para '{user_name}' ({user_role}). Nota: {evaluation_data['notaGeral']}/10 ({evaluation_data['classificacao']}).", "success")
            return jsonify({
                "evaluation": evaluation_data,
                "metrics": metrics_summary,
                "summary": f"Nota Geral: {evaluation_data['notaGeral']}/10 ({evaluation_data['classificacao']}). {evaluation_data['dicaPratica']}"
            }), 200

        # ----------------------------------------------------------------------
        # AGENTE 7: ANALISTA DE NEGÓCIOS (MÊS VIGENTE & MULTI-TIER)
        # ----------------------------------------------------------------------
        elif agent_id == 'business_analyst':
            now = datetime.now()
            cur_month = int(extra_data.get('currentMonth') or now.month)
            cur_year = int(extra_data.get('currentYear') or now.year)
            month_name = extra_data.get('monthName') or f"{cur_month:02d}/{cur_year}"

            def is_current_month(dt_val):
                if not dt_val:
                    return False
                try:
                    s = str(dt_val).replace('Z', '+00:00')
                    dt = datetime.fromisoformat(s)
                    return dt.month == cur_month and dt.year == cur_year
                except Exception:
                    return False

            total_leads = len(all_leads)
            leads_mes_atual = [l for l in all_leads if is_current_month(l.get("createdAt"))]
            leads_recuperacao = [l for l in all_leads if not is_current_month(l.get("createdAt")) and (is_current_month(l.get("updatedAt")) or any(is_current_month(c.get("date") if isinstance(c, dict) else None) for c in (l.get("comments") or [])))]
            
            leads_closed = [l for l in all_leads if l.get("dealClosed", False)]
            leads_closed_this_month = [l for l in leads_closed if is_current_month(l.get("dealClosedDate")) or is_current_month(l.get("updatedAt"))]

            # Volume em R$ fechado no mês
            vol_fechado_mes = 0
            for l in leads_closed_this_month:
                raw_c = str(l.get("desiredCredit") or "").replace("R$", "").replace(".", "").replace(" ", "").replace(",00", "")
                try:
                    vol_fechado_mes += float(re.sub(r'[^\d]', '', raw_c) or 0)
                except Exception:
                    pass

            leads_por_fase = {p.get("title"): len(p.get("clients") or []) for p in phases if isinstance(p, dict)}
            user_role = str(user_profile.get('role') or extra_data.get('role') or 'vendedor').lower()
            user_name = user_profile.get('name') or extra_data.get('userName') or 'Consultor Comercial'

            prompt = f"""Você é o Analista Estratégico de Negócios e Métricas de Consórcios da GT Consórcios.
Sua missão é diagnosticar o pipeline comercial com FOCO ESTRITO NO MÊS VIGENTE ({month_name}), avaliando as metas produtivas atuais.

DADOS DE PRODUÇÃO DO MÊS ({month_name}):
- Perfil do Usuário: {user_name} ({user_role.upper()})
- Total de Leads no Funil: {total_leads}
- Novos Leads do Mês Atual: {len(leads_mes_atual)}
- Leads de Recuperação / Reengajados no Mês (oportunidades ativas de meses anteriores): {len(leads_recuperacao)}
- Cotas Fechadas no Mês Atual: {len(leads_closed_this_month)} (Volume Vendido: R$ {vol_fechado_mes:,.2f})
- Distribuição por Fase: {json.dumps(leads_por_fase, ensure_ascii=False)}

DIRETRIZES DE ANÁLISE:
1. FOCO NO MÊS VIGENTE: Analise o ritmo produtivo deste mês. Não considere metas passadas como falhas presentes; concentre-se no fechamento deste mês.
2. LEADS ANTIGOS COMO OPORTUNIDADES: Os {len(leads_recuperacao)} leads reengajados de meses anteriores devem ser apresentados como oportunidades estratégicas de recuperação para compor o faturamento deste mês.
3. HIERARQUIA:
   - Se Vendedor: Direcione o diagnóstico para sua carteira e ações de fechamento direto.
   - Se Supervisor: Direcione para a capacidade coletiva da sua equipe e alocação de esforço.
   - Se Gerente/Admin: Visão macro da taxa de conversão e faturamento global do CRM.

Retorne ESTRITAMENTE em JSON puro:
{{
  "diagnosticoGeral": "Diagnóstico claro sobre o volume, fluidez e ritmo de fechamento no mês atual, destacando também as oportunidades de resgate",
  "maiorGargalo": "A fase ou processo que mais está travando leads no mês vigente",
  "projecaoFechamento": "Estimativa concreta de cotas e potencial financeiro para o fechamento deste mês",
  "recomendacoes": [
    "Recomendação 1 focada na conversão dos leads ativos do mês",
    "Recomendação 2 focada no resgate de leads em negociação/reengajados",
    "Recomendação 3 focada na superação do maior gargalo identificado"
  ],
  "cotasProjetadas": "Número estimado de cotas a fechar no mês (ex: '2 a 4 cotas')",
  "volumeProjetado": "Volume financeiro estimado a fechar (ex: 'R$ 450.000')"
}}
"""
            response = gerar_conteudo_gemini(client, prompt, temperature=0.3, prefer_vps_first=True)
            parsed = parse_ai_json(response.text)
            analysis_data = {
                "diagnosticoGeral": parsed.get("diagnosticoGeral", f"Funil operando com {len(leads_mes_atual)} novos leads em {month_name} e {len(leads_recuperacao)} oportunidades de recuperação."),
                "maiorGargalo": parsed.get("maiorGargalo", "Avanço entre a apresentação da simulação e o fechamento em negociação."),
                "projecaoFechamento": parsed.get("projecaoFechamento", "Estimativa de conversão de 15% sobre os leads qualificados deste mês."),
                "recomendacoes": parsed.get("recomendacoes", [
                    "Acelerar o follow-up em leads que receberam simulação nas últimas 48h.",
                    "Ativar roteiros de quebra de objeção em leads com lance embutido disponível.",
                    "Revisitar leads com propostas enviadas na primeira quinzena do mês."
                ]),
                "cotasProjetadas": parsed.get("cotasProjetadas", "2 a 3 cotas"),
                "volumeProjetado": parsed.get("volumeProjetado", "R$ 350.000")
            }
            registrar_log_ai(agent_id, f"Diagnóstico de negócios gerado para '{user_name}' ({user_role}) no mês {month_name}.", "success")
            return jsonify({
                "analysis": analysis_data,
                "summary": f"{analysis_data['diagnosticoGeral']}. Gargalo: {analysis_data['maiorGargalo']}."
            }), 200

        # ----------------------------------------------------------------------
        # AGENTE 8: RESUMIDOR DE CHAMADAS & NOTAS
        # ----------------------------------------------------------------------
        elif agent_id == 'call_summarizer':
            anotacao = extra_data.get('text', '')
            if not anotacao:
                recent_notes = []
                for l in all_leads[:5]:
                    if l.get("comments"):
                        recent_notes.append(f"Lead {l.get('name')}: " + " | ".join(l.get("comments")))
                anotacao = "\n".join(recent_notes) or "Cliente demonstrou interesse em consórcio imobiliário de 200 mil, pediu simulação de parcelas e quer saber chances de lance livre no próximo mês."

            prompt = f"""Você é o Especialista em Síntese de Conversas e Chamadas Comerciais.
Sintetize a conversa ou anotação abaixo em plano de ação imediato:
"{anotacao}"

Retorne ESTRITAMENTE em JSON puro:
{{
  "objetivoCliente": "O que o cliente realmente busca e a motivação central",
  "objecoesIdentificadas": "Objeções ou dúvidas levantadas",
  "proximoPasso": "Ação imediata recomendada para o consultor",
  "resumo": "Síntese executiva da conversa em 2 frases"
}}
"""
            response = gerar_conteudo_gemini(client, prompt, temperature=0.2)
            parsed = parse_ai_json(response.text)
            registrar_log_ai(agent_id, "Resumo de conversas estruturado com sucesso.", "success")
            return jsonify({
                "summary": parsed,
                "resumo": parsed.get("resumo", "Resumo gerado com sucesso.")
            }), 200

        # ----------------------------------------------------------------------
        # AGENTE 9: GESTOR DE TRÁFEGO & ORIGEM
        # ----------------------------------------------------------------------
        elif agent_id == 'traffic_manager':
            categories = {}
            for l in all_leads:
                cat = l.get("category") or "Geral"
                categories[cat] = categories.get(cat, 0) + 1

            prompt = f"""Você é o Gestor Especialista em Tráfego Pago e Aquisição de Leads para Consórcios.
Analise a distribuição de demanda da carteira:
{json.dumps(categories, ensure_ascii=False)}

Retorne ESTRITAMENTE em JSON puro:
{{
  "melhorCanal": "Meta Ads (Instagram / Facebook)",
  "estrategiaRecomendada": "Criativos focados em planejamento imobiliário, compra sem juros e simulação de parcela reduzida",
  "dicaOtimizacao": "Segmentar por interesses em imóveis, investimentos e renda compatível",
  "recomendacoes": [
    "Criar vídeos em formato Reels mostrando casos reais de contemplação",
    "Utilizar teste A/B com lances embutidos vs parcelas reduzidas",
    "Integrar webhook para resposta do consultor em menos de 5 minutos"
  ],
  "summary": "Diretrizes de tráfego e mídia paga formuladas com sucesso."
}}
"""
            response = gerar_conteudo_gemini(client, prompt, temperature=0.3)
            parsed = parse_ai_json(response.text)
            registrar_log_ai(agent_id, "Estratégia de tráfego e canais analisada.", "success")
            return jsonify({
                "traffic": parsed,
                "summary": f"Melhor Canal: {parsed.get('melhorCanal', '')}. {parsed.get('estrategiaRecomendada', '')}"
            }), 200

        # ----------------------------------------------------------------------
        # AGENTE 10: RECEPÇÃO E ABORDAGEM DE NOVOS LEADS
        # ----------------------------------------------------------------------
        elif agent_id == 'new_lead_reception':
            lead_name = extra_data.get('name') or 'Cliente'
            credit = extra_data.get('desiredCredit') or extra_data.get('valor') or ''
            category = extra_data.get('category') or 'consórcio'
            company_name = extra_data.get('companyName') or extra_data.get('company_name') or 'Nossa Empresa'

            prompt = f"""Você é o Consultor Executivo de Recepção da {company_name} no WhatsApp.
DADOS DO NOVO LEAD:
- Nome: {lead_name}
- Crédito pretendido: {credit}
- Categoria de interesse: {category}

Diretrizes: Cumprimente pelo primeiro nome de forma calorosa e profissional, confirme o interesse no consórcio de forma amigável e faça uma pergunta aberta para iniciar o atendimento.
Retorne em JSON puro:
{{
  "mensagem": "Texto completo da mensagem para enviar no WhatsApp"
}}
"""
            response = gerar_conteudo_gemini(client, prompt, temperature=0.3)
            parsed = parse_ai_json(response.text)
            registrar_log_ai(agent_id, f"Abordagem gerada para lead '{lead_name}' com sucesso.", "success")
            return jsonify({
                "mensagem": parsed.get("mensagem"),
                "summary": parsed.get("mensagem")
            }), 200

        # ----------------------------------------------------------------------
        # AGENTE 11: GERADOR DE RESUMO EXECUTIVO DO CARD (PAINEL DE LEADS)
        # Roteamento Estrito: Top 1 Qwen 3.5 VPS -> Top 2 Cloudflare -> Top 3 Gemini 3.5
        # ----------------------------------------------------------------------
        elif agent_id == 'lead_summary_generator':
            target_client = extra_data.get('client') or next((l for l in all_leads if str(l.get("id")) == str(client_id)), None)
            if not target_client:
                return jsonify({"error": "Lead não encontrado para geração de resumo."}), 400

            lead_name = target_client.get('name') or 'Cliente'
            credit = target_client.get('desiredCredit') or target_client.get('credit') or 'Não informado'
            ideal_inst = target_client.get('idealInstallment') or 'Não informada'
            bid_amt = target_client.get('bidAmount') or 'Sem lance'
            urgency = target_client.get('urgency') or 'Média'
            profession = target_client.get('profession') or ''
            city = target_client.get('city') or target_client.get('location') or ''
            initial_info = target_client.get('initialInfo') or ''
            comments = target_client.get('comments') or []
            comments_text = " | ".join([(c.get('text') if isinstance(c, dict) else str(c)) for c in comments[-3:]])

            prompt = f"""Você é o Analista Comercial de Elite do Painel de Leads do ConsorFlux CRM.
DADOS DO CLIENTE:
- Crédito Solicitado (já exposto no card): {credit}
- Parcela Ideal: {ideal_inst}
- Lance Disponível: {bid_amt}
- Nível de Urgência: {urgency}
- Profissão: {profession or 'Não informada'}
- Cidade/Localização: {city or 'Não informada'}
- Histórico/Informações Gerais: "{initial_info}"
- Últimas Anotações: "{comments_text}"

SUA MISSÃO:
Gere uma micro-frase factual e ultra-resumida para o card do lead, entre 60 e 95 caracteres.
REGRAS INEGOCIÁVEIS:
1. PROIBIDO citar o nome da pessoa (já está no topo do card).
2. PROIBIDO usar a palavra "Lead" ou "Cliente" (o card já é do lead).
3. PROIBIDO repetir o valor do crédito (ele já está em destaque verde).
4. PROIBIDO citar "sem localização informada", "perfil incompleto" ou dados vazios negativos.
5. DESTAQUE APENAS: histórico/objetivo de consórcio (ex: "Possui histórico de consórcio, busca carro no futuro"), parcela ideal e lance disponível.
6. LIMITE RÍGIDO: Deve ter no MÁXIMO 95 caracteres (para caber perfeitamente em 2 linhas curtas sem cortar palavras).

EXEMPLOS EXCELENTES:
- "Possui histórico de consórcio, busca carro no futuro. Parcela ideal R$ 900 e lance R$ 30 mil."
- "Aposentado, busca adquirir automóvel no futuro. Parcela ideal R$ 600, sem lance."
- "Busca imóvel próprio. Parcela ideal R$ 1.200 e lance embutido planejado."

Retorne ESTRITAMENTE em JSON puro:
{{
  "summary": "Micro-resumo estratégico factual de até 95 caracteres"
}}
"""
            response = gerar_conteudo_gemini(client, prompt, temperature=0.1, prefer_vps_first=True)
            parsed = parse_ai_json(response.text)
            summary_res = ""
            if isinstance(parsed, dict):
                summary_res = parsed.get("summary") or parsed.get("resumo") or ""
            elif isinstance(parsed, str):
                summary_res = parsed

            # Limpeza e sanitização rigorosa de texto
            if summary_res:
                # Remove prefixos como "Lead Alessandro:", "Lead com:", "Cliente:" etc.
                summary_res = re.sub(r'^(lead\s+[\w\s\.\-]+\s*:\s*|lead\s+com\s+|lead\s+|cliente\s+[\w\s\.\-]+\s*:\s*|cliente\s+)', '', summary_res, flags=re.IGNORECASE).strip()
                # Remove menções a localização não informada ou perfil incompleto
                summary_res = re.sub(r'(,\s*sem\s+localiza[çc][aã]o\s+informada|\s*sem\s+localiza[çc][aã]o\s+informada|;\s*sem\s+localiza[çc][aã]o\s+informada|\.\s*sem\s+localiza[çc][aã]o\s+informada)', '', summary_res, flags=re.IGNORECASE).strip()
                summary_res = re.sub(r'(,\s*perfil\s+incompleto|\s*perfil\s+incompleto)', '', summary_res, flags=re.IGNORECASE).strip()
                # Remove citação de crédito entre parênteses ou redundâncias de crédito
                summary_res = re.sub(r'\(crédito[^)]*\)', '', summary_res, flags=re.IGNORECASE).strip()
                summary_res = re.sub(r'\s{2,}', ' ', summary_res).strip(' ,;:-')

                # Limite estrito de no máximo 105 caracteres com corte suave em palavra completa
                if len(summary_res) > 105:
                    trimmed = summary_res[:102]
                    words = trimmed.split(' ')
                    if len(words) > 1:
                        summary_res = " ".join(words[:-1]).rstrip(' ,.;:-') + '.'
                    else:
                        summary_res = trimmed.rstrip(' ,.;:-') + '.'

            if not summary_res:
                fallback_text = (initial_info.split('\n')[0] if initial_info else "Interesse em consórcio em qualificação.")
                fallback_clean = re.sub(r'^(lead\s+|cliente\s+)', '', fallback_text, flags=re.IGNORECASE).strip()
                summary_res = fallback_clean[:95].rstrip(' ,.;:-') + '.'

            registrar_log_ai(agent_id, f"Resumo gerado para lead '{lead_name}': {summary_res}", "success")
            return jsonify({
                "summary": summary_res,
                "clientId": target_client.get('id')
            }), 200

        # ----------------------------------------------------------------------
        # AGENTE 12: AVALIADOR SELETIVO DE OPORTUNIDADE (ENROLAÇÃO VS POSTERGAÇÃO REAL)
        # Roteamento Estrito: Top 1 Qwen 3.5 VPS -> Top 2 Cloudflare -> Top 3 Gemini 3.5
        # ----------------------------------------------------------------------
        elif agent_id == 'opportunity_evaluator':
            target_client = extra_data.get('client') or next((l for l in all_leads if str(l.get("id")) == str(client_id)), None)
            if not target_client:
                return jsonify({"error": "Lead não encontrado para avaliação de oportunidade."}), 400

            lead_name = target_client.get('name') or 'Cliente'
            credit = target_client.get('desiredCredit') or target_client.get('credit') or 'Não informado'
            bid_amt = target_client.get('bidAmount') or 'Sem lance informado'
            current_phase = target_client.get('currentPhaseTitle') or extra_data.get('currentPhaseTitle') or 'Em Atendimento'
            days_silent = extra_data.get('daysSilent') or target_client.get('daysSilent') or '0'
            age_days = extra_data.get('ageDays') or target_client.get('ageDays') or '0'
            initial_info = target_client.get('initialInfo') or ''
            comments = target_client.get('comments') or []
            comments_text = " | ".join([(c.get('text') if isinstance(c, dict) else str(c)) for c in comments[-5:]])

            prompt = f"""Você é o Avaliador de Elite de Oportunidades Comerciais de Consórcios.
Sua missão é ser EXTREMAMENTE SELETIVO e RIGOROSO. Nem todo lead é uma oportunidade.
Você deve analisar se um lead (especialmente antigo com mais de 45 dias ou inativo) tem potencial REAL de fechamento iminente ou se está apenas ENROLANDO / PROCRASTINANDO / SEM INTERESSE.

DADOS DO LEAD:
- Nome: {lead_name}
- Crédito Solicitado: {credit}
- Lance Informado: {bid_amt}
- Fase Atual: {current_phase}
- Idade do Lead no CRM: {age_days} dias
- Dias sem Contato / Inativo: {days_silent} dias
- Histórico / Detalhes: "{initial_info}"
- Últimas Anotações e Conversas: "{comments_text}"

CRITÉRIOS DE AVALIAÇÃO:
1. "ENROLANDO / CURIOSO" (is_valid_opportunity = false):
   - Lead que não responde com firmeza, dá desculpas vazias sem data definida ("vou ver e te falo", "depois vejo isso", "agora não posso").
   - Lead sem lance declarado ou sem nenhuma reserva financeira para contemplação.
   - Lead que sumiu há semanas/meses sem combinar prazo de retorno concreto.
   - Procrastinação crônica ou apenas especulação de preços.

2. "POSTERGAÇÃO ESTRATÉGICA / FECHAMENTO REAL" (is_valid_opportunity = true):
   - Lead que combinou uma data ou evento específico futuro para fechar (ex: "fecho no próximo mês quando sair o 13º", "aguardando liberação do FGTS dia 15", "vou dar lance na assembleia do mês que vem", "estou vendendo meu carro para dar lance de 30 mil").
   - Possui lance ou capacidade financeira clara para contemplação rápida.
   - Mostrou compromisso genuíno e clareza de objetivo, apenas aguardando a janela financeira ou contratual ideal.

Retorne ESTRITAMENTE em JSON puro:
{{
  "is_valid_opportunity": true,
  "is_stalling": false,
  "score": 85,
  "temperature": "Quente",
  "reason": "Explicação analítica concisa justificando se o lead está enrolando ou se é uma oportunidade real postergada",
  "recommendedAction": "Ação comercial direta recomendada para o consultor"
}}
"""
            response = gerar_conteudo_gemini(client, prompt, temperature=0.1, prefer_vps_first=True)
            parsed = parse_ai_json(response.text)
            registrar_log_ai(agent_id, f"Avaliação de oportunidade de '{lead_name}': válida={parsed.get('is_valid_opportunity')}, score={parsed.get('score')}", "success")
            return jsonify({
                "evaluation": parsed,
                "clientId": target_client.get('id')
            }), 200

        # ----------------------------------------------------------------------
        # AGENTE 13: AGENTE DE FOLLOW-UP / REENGAJAMENTO & DESTINAÇÃO DE LEADS PARADOS (> 7 DIAS)
        # Roteamento Estrito: Top 1 Qwen 3.5 VPS -> Top 2 Cloudflare -> Top 3 Gemini 3.5
        # ----------------------------------------------------------------------
        elif agent_id == 'followup_advisor':
            target_client = extra_data.get('client') or next((l for l in all_leads if str(l.get("id")) == str(client_id)), None)
            if not target_client:
                return jsonify({"error": "Lead não encontrado para follow-up advisor."}), 400

            current_phase = target_client.get('currentPhaseTitle') or extra_data.get('currentPhaseTitle') or 'Em Atendimento'

            # Trava de Segurança Estrita: Lead com venda fechada/concluída ou em fases de pós-venda
            # NÃO deve receber rotinas de follow-up ou sugestão de mover para Standby
            is_closed = (
                target_client.get('dealClosed') is True
                or str(target_client.get('dealClosed', '')).lower() == 'true'
                or bool(target_client.get('dealClosedDate'))
                or any(w in str(target_client.get('clientStatus', '')).lower() for w in ['fechado', 'contemplado', 'concluido', 'ganho'])
                or any(w in str(current_phase).lower() for w in ['fechad', 'ganh', 'concluid', 'venda', 'pos-venda', 'pos venda', 'acompanhamento'])
            )
            if is_closed:
                registrar_log_ai(agent_id, f"Lead '{target_client.get('name')}' possui venda concluída/fechada. Follow-up de pré-venda ignorado.", "info")
                return jsonify({
                    "followup": None,
                    "message": "Lead com venda concluída/fechada. Follow-up de pré-venda ignorado.",
                    "clientId": target_client.get('id')
                }), 200

            lead_name = target_client.get('name') or 'Cliente'
            credit = target_client.get('desiredCredit') or target_client.get('credit') or 'Não informado'
            category = target_client.get('category') or 'Consórcio'
            days_silent = extra_data.get('daysSilent') or target_client.get('daysSilent') or '7'
            initial_info = target_client.get('initialInfo') or ''
            comments = target_client.get('comments') or []
            comments_text = " | ".join([(c.get('text') if isinstance(c, dict) else str(c)) for c in comments[-5:]])

            # Fases disponíveis no quadro
            available_phases_titles = [p.get("title") for p in phases_summary] or ["Novo Cliente", "Contato Feito", "Simulação Enviada", "Negociação", "Standby", "Tentou Contato", "Perdido"]

            prompt = f"""Você é o Agente de Follow-up, Reengajamento & Destinação Comercial de Leads do CRM ConsorFlux.
Sua missão é atuar como o mentor tático de vendas para resgatar ou dar a destinação correta a leads estagnados há mais de 7 dias sem contato ou movimentação.

DADOS DO LEAD:
- Nome: {lead_name}
- Crédito: {credit}
- Categoria: {category}
- Fase Atual: {current_phase}
- Dias em Silêncio / Inativo: {days_silent} dias
- Histórico / Detalhes: "{initial_info}"
- Anotações Recentes: "{comments_text}"

FASES DISPONÍVEIS NO QUADRO:
{json.dumps(available_phases_titles, ensure_ascii=False)}

SUAS OBRIGAÇÕES:
1. DIAGNÓSTICO DO SILÊNCIO: Analisar o provável motivo psicológico e comercial pelo qual o lead parou (ex: receio de parcela, influência de terceiros, falta de acompanhamento ativo, desinteresse velado).
2. DESTINAÇÃO SUGERIDA: Sugerir para qual etapa do quadro este lead deve ser movido para não ficar entupindo o fluxo ativo sem rumo. (Ex: "Standby", "Tentou Contato", "Perdidos", ou manter na fase atual caso haja ação imediata). Priorize selecionar uma fase existente na lista acima, ou sugira "Standby" / "Tentou Contato" / "Perdidos".
3. ORIENTAÇÃO TÁTICA: Instrução prática ao vendedor sobre o que fazer agora com esse lead.
4. ROTEIRO DE REATIVAÇÃO WHATSAPP: Uma mensagem humana, calorosa, com quebra de padrão autêntica e pergunta final (CTA) direta para tentar reativar a conversa imediatamente no WhatsApp. Proibido parecer robô corporativo.

Retorne ESTRITAMENTE em JSON puro:
{{
  "diagnostico": "Explicação de 1 a 2 frases sobre a provável causa do silêncio deste lead",
  "destinacaoSugerida": "Nome da fase sugerida para mover o lead (ex: Standby, Tentou Contato, Perdidos)",
  "orientacao": "Conselho prático e direto ao vendedor sobre a conduta a tomar com esse lead",
  "roteiro": "Texto completo da mensagem para o WhatsApp com emojis e pergunta final engajadora"
}}
"""
            response = gerar_conteudo_gemini(client, prompt, temperature=0.3, prefer_vps_first=True)
            parsed = parse_ai_json(response.text)
            registrar_log_ai(agent_id, f"Followup Advisor concluído para '{lead_name}' ({days_silent} dias parados). Destinação: {parsed.get('destinacaoSugerida')}", "success")
            return jsonify({
                "followup": parsed,
                "clientId": target_client.get('id')
            }), 200

        else:
            registrar_log_ai(agent_id, f"Agente '{agent_id}' não reconhecido.", "error")
            return jsonify({"error": "Agente desconhecido"}), 400

    except Exception as e:
        import traceback
        traceback.print_exc()
        registrar_log_ai(agent_id or "system", f"Erro na execução do agente: {str(e)}", "error")
        return jsonify({"error": str(e)}), 500


def transcrever_audio_cloudflare(audio_source: str) -> Optional[str]:
    """
    Transcreve áudio (base64 Data URI ou URL) usando Cloudflare Workers AI (@cf/openai/whisper).
    Retorna o texto da transcrição limpo ou None se falhar.
    """
    import base64
    if not audio_source:
        return None
    try:
        raw_bytes = None
        if audio_source.startswith("data:"):
            comma_idx = audio_source.find(",")
            if comma_idx != -1:
                b64_part = audio_source[comma_idx + 1:]
                raw_bytes = base64.b64decode(b64_part)
        elif audio_source.startswith("http://") or audio_source.startswith("https://"):
            r_audio = requests.get(audio_source, timeout=10)
            if r_audio.status_code == 200:
                raw_bytes = r_audio.content

        if not raw_bytes:
            return None

        cf_token = (os.getenv("CLOUDFLARE_API_TOKEN") or "").strip()
        account_id = (os.getenv("CLOUDFLARE_ACCOUNT_ID") or "84de4bcd01082e546270cc143e94106c").strip()
        cf_url = f"https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/@cf/openai/whisper"

        r_cf = requests.post(
            cf_url,
            data=raw_bytes,
            headers={
                "Authorization": f"Bearer {cf_token}",
                "Content-Type": "application/octet-stream"
            },
            timeout=15
        )
        if r_cf.status_code == 200:
            cf_data = r_cf.json()
            return cf_data.get("result", {}).get("text", "").strip()
        else:
            app.logger.warning(f"Cloudflare Whisper status {r_cf.status_code}: {r_cf.text[:100]}")
    except Exception as e:
        app.logger.warning(f"Erro ao transcrever áudio no Cloudflare: {e}")
    return None


def analisar_imagem_documento_gemini(media_source: str) -> Optional[str]:
    """
    Analisa imagens e documentos recebidos no WhatsApp (boletos bancários, comprovantes de pagamento,
    propostas comerciais de bancos ou concorrentes, contratos, etc.) usando visão multimodal do Gemini.
    Retorna uma descrição executiva precisa (valores em R$, datas, beneficiário, parcelas, dados).
    """
    if not media_source or not isinstance(media_source, str):
        return None

    gemini_key = os.getenv("GEMINI_API_KEY")
    if not gemini_key:
        return None

    try:
        mime_type = "image/jpeg"
        b64_data = ""
        if ";base64," in media_source:
            parts = media_source.split(";base64,")
            mime_type = parts[0].replace("data:", "").strip() or "image/jpeg"
            b64_data = parts[1].strip()
        elif media_source.startswith("http"):
            r_img = requests.get(media_source, timeout=10)
            if r_img.status_code == 200:
                import base64
                b64_data = base64.b64encode(r_img.content).decode("utf-8")
                mime_type = r_img.headers.get("Content-Type", "image/jpeg").split(";")[0]

        if not b64_data:
            return None

        prompt = (
            "Você é um especialista em análise visual de documentos comerciais, boletos e consórcios. "
            "Analise detalhadamente esta imagem enviada pelo cliente no WhatsApp. "
            "Identifique com precisão o tipo de documento (comprovante de pagamento, boleto bancário, proposta de concorrente/banco, contrato, etc.), "
            "o valor exato em reais (R$), data de vencimento/pagamento, beneficiário/administradora/banco, pagador e parcelas/cota se houver. "
            "Seja conciso, preciso e direto (1 a 3 frases bem informativas)."
        )

        # O usuário definiu explicitamente o uso prioritário do Gemini 3.5 Flash para visão multimodal (leve e compatível com cota)
        modelos = ["gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-flash-latest"]
        for mod in modelos:
            try:
                gem_url = f"https://generativelanguage.googleapis.com/v1beta/models/{mod}:generateContent?key={gemini_key}"
                payload = {
                    "contents": [
                        {
                            "parts": [
                                {"text": prompt},
                                {
                                    "inline_data": {
                                        "mime_type": mime_type,
                                        "data": b64_data
                                    }
                                }
                            ]
                        }
                    ]
                }
                resp = requests.post(gem_url, json=payload, timeout=18)
                if resp.status_code == 200:
                    data = resp.json()
                    candidates = data.get("candidates", [])
                    if candidates:
                        parts = candidates[0].get("content", {}).get("parts", [])
                        if parts and "text" in parts[0]:
                            desc = parts[0]["text"].strip()
                            if desc:
                                return desc
            except Exception as e_mod:
                app.logger.warning(f"Tentativa de visão com {mod} falhou: {e_mod}")
    except Exception as e_vis:
        app.logger.warning(f"Erro geral na análise de imagem com Gemini: {e_vis}")

    return None


@app.route('/api/ai/transcribe-audio', methods=['POST'])
def rota_transcrever_audio():
    """Endpoint direto para transcrição de áudios via Cloudflare Workers AI Whisper."""
    try:
        data = request.json or {}
        audio_url = data.get("audio_url")
        message_id = data.get("message_id")

        if not audio_url and message_id and supabase:
            try:
                res_m = supabase.table("whatsapp_messages").select("media_url, transcription").eq("id", message_id).limit(1).execute()
                if res_m.data:
                    if res_m.data[0].get("transcription"):
                        return jsonify({"success": True, "transcription": res_m.data[0]["transcription"]}), 200
                    audio_url = res_m.data[0].get("media_url")
            except Exception:
                pass

        if not audio_url:
            return jsonify({"error": "audio_url ou message_id é obrigatório"}), 400

        text = transcrever_audio_cloudflare(audio_url)
        if not text:
            return jsonify({"success": False, "error": "Não foi possível transcrever o áudio."}), 500

        if message_id and supabase:
            try:
                supabase.table("whatsapp_messages").update({"transcription": text}).eq("id", message_id).execute()
            except Exception as e_up:
                app.logger.warning(f"Erro ao atualizar transcrição no Supabase: {e_up}")

        return jsonify({"success": True, "transcription": text}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/ai/mentoria', methods=['POST'])
def rota_ai_mentoria():
    """
    Endpoint para Suporte com o MentorIA no WhatsApp:
    Ações:
      - REPLY: Gerar Resposta ao Lead com base no contexto recente
      - OBJECTION: Gerar Quebra de Objeção com empatia, lógica e CTA
      - OFFER: Gerar Abordagem com Oferta irresistível
      - ANALYZE: Analisar criteriosamente a conversa (pontos fortes, pontos fracos, alta chance vs enrolando, dicas)
    """
    try:
        data = request.json or {}
        action = str(data.get('action', 'REPLY')).upper()
        conversation = data.get('conversation_history', [])
        lead = data.get('lead_info', {})
        custom_prompts = data.get('custom_prompts') or {}

        client = None
        try:
            client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
        except Exception:
            pass

        # 1. Obter regras ativas da administradora de consórcio (Consórcio Nacional Recon)
        admin_rules = {}
        try:
            if supabase:
                res_adm = supabase.table('administradoras_consorcio').select('*').eq('ativo', True).limit(1).execute()
                if res_adm.data:
                    admin_rules = res_adm.data[0]
        except Exception as ex_adm:
            print(f"⚠️ Aviso: Não foi possível obter administradoras_consorcio: {ex_adm}")

        if not admin_rules:
            admin_rules = {
                "nome": "Consórcio Nacional Recon",
                "anos_mercado": "Mais de 37 anos de tradição e solidez",
                "reputacao_bacen": "Zero reclamações no Banco Central do Brasil (BACEN)",
                "teto_lance_embutido_pct": 25,
                "sistemas_contemplacao": [
                    "Sorteio mensal pela Loteria Federal",
                    "Lance Livre",
                    "Lance Fixo de 25% (podendo utilizar 100% do lance embutido de 25%, zero desembolso do bolso)",
                    "Lance Fixo de 45% (em grupos automotivos selecionados)",
                    "Lance Fixo de 15% e 30% (em grupos de motocicletas)"
                ],
                "lance_carta_avaliacao": "Carta de Avaliação: Permite utilizar o veículo usado do cliente pela Tabela FIPE como lance para troca de veículos",
                "diluicao_pos_contemplacao": "Redução do prazo restante ou redução de até 40% no valor da parcela mensal",
                "planos_parcela_reduzida": "Opções de parcela reduzida em até 50% até a contemplação para Imóveis, Automóveis, Motos, Pesados e Serviços"
            }

        # Montar dinâmica e genericamente os parâmetros da administradora
        adm_nome = admin_rules.get('nome', 'Administradora de Consórcios')
        adm_slogan = admin_rules.get('slogan') or admin_rules.get('reputacao_bacen') or ''
        adm_anos = admin_rules.get('anos_mercado', '')
        adm_teto_embutido = admin_rules.get('teto_lance_embutido_pct', 25)

        # Sistemas de contemplação
        sist_raw = admin_rules.get('sistemas_contemplacao') or {}
        sist_str = ""
        if isinstance(sist_raw, dict):
            sorteio_info = sist_raw.get('sorteio', {})
            lance_livre_info = sist_raw.get('lance_livre', {})
            lance_fixo_info = sist_raw.get('lance_fixo', {})
            modalidades = lance_fixo_info.get('modalidades', []) if isinstance(lance_fixo_info, dict) else []
            sist_items = []
            if sorteio_info:
                sist_items.append(f"Sorteio: {sorteio_info.get('metodo', 'Oficial')} - {sorteio_info.get('descricao', '')}")
            for m in modalidades:
                if isinstance(m, dict):
                    sist_items.append(m.get('descricao', f"Lance {m.get('percentual', '')}%"))
                elif isinstance(m, str):
                    sist_items.append(m)
            if lance_livre_info:
                sist_items.append(f"Lance Livre: {lance_livre_info.get('descricao', '')}")
            sist_str = "; ".join(sist_items)
        elif isinstance(sist_raw, list):
            sist_str = "; ".join(str(x) for x in sist_raw)
        else:
            sist_str = str(sist_raw)

        # Diferenciais competitivos
        difs_raw = admin_rules.get('diferenciais_competitivos') or []
        difs_str = ""
        if isinstance(difs_raw, list):
            difs_str = "\n".join(f"- {d}" for d in difs_raw)
        elif isinstance(difs_raw, dict):
            difs_str = "\n".join(f"- {k}: {v}" for k, v in difs_raw.items())
        else:
            difs_str = str(difs_raw)

        # Diluição pós-contemplação (trata valores nulos ou vazios caso a administradora não adote uma das opções)
        dil_raw = admin_rules.get('diluicao_pos_contemplacao') or {}
        dil_str = ""
        if isinstance(dil_raw, dict):
            dil_items = []
            if dil_raw.get('opcao_reducao_prazo'):
                dil_items.append(f"Redução de Prazo: {dil_raw['opcao_reducao_prazo']}")
            if dil_raw.get('opcao_reducao_parcela'):
                dil_items.append(f"Redução de Parcela: {dil_raw['opcao_reducao_parcela']}")
            dil_str = "; ".join(dil_items) if dil_items else "Conforme regras de contrato da administradora."
        else:
            dil_str = str(dil_raw)

        # Regras comerciais invioláveis da IA
        regras_ia_raw = admin_rules.get('regras_comerciais_ia') or {}
        regras_chave_list = regras_ia_raw.get('regras_chave', []) if isinstance(regras_ia_raw, dict) else []
        regras_chave_str = "\n".join(f"{idx+1}. {r}" for idx, r in enumerate(regras_chave_list)) if regras_chave_list else ""

        consorcio_contexto = f"""
ADMINISTRADORA DE CONSÓRCIO ATIVA:
- Nome Oficial: {adm_nome}
- Credibilidade e Histórico: {adm_anos} anos de mercado. {adm_slogan}
- Teto de Lance Embutido: rigorosamente até {adm_teto_embutido}% (NUNCA ultrapassar {adm_teto_embutido}%).
- Sistemas de Contemplação: {sist_str}
- Pós-Contemplação: {dil_str}
- Diferenciais Comerciais Oficiais:
{difs_str}

REGRAS CONCEITUAIS INVIOLÁVEIS DO NEGÓCIO:
1. CONSÓRCIO NÃO É FINANCIAMENTO:
   - É TERMINANTEMENTE PROIBIDO usar a palavra 'financiar' ou 'financiamento' associada ao consórcio.
   - Financiamento é um modelo CONCORRENTE bancário pelo qual a gente NÃO trabalha, que cobra juros compostos abusivos e faz o cliente pagar 2 a 3 bens para o banco.
   - O Consórcio é PLANEJAMENTO FINANCEIRO 100% CONFIÁVEL, INTELIGENTE e SEM JUROS (apenas taxa de administração justa).
   - Use termos profissionais como: 'planejar seu crédito', 'conquistar seu bem', 'viabilizar seu imóvel/carro', 'adquirir sua cota contemplada', 'economia brutal sem juros de banco'.
2. NÃO É SÓ SORTE, NÃO É ENGANAÇÃO: É ESTRATÉGIA E PLANEJAMENTO:
   - Contemplação pelas modalidades oficiais e legais da administradora {adm_nome}.
3. DIRETRIZES DA LIDERANÇA E REGRAS COMERCIAIS DA IA:
{regras_chave_str}
"""

        # 1.1 Transcrição transparente e imediata de áudios recentes sem texto via Cloudflare Workers AI
        for msg in conversation[-12:]:
            is_audio = msg.get("media_type") == "audio" or "[Áudio]" in str(msg.get("text", "")) or "[Audio]" in str(msg.get("text", ""))
            curr_text = str(msg.get("text", "")).strip()
            transcription = msg.get("transcription")
            msg_id = msg.get("id") or msg.get("message_id")

            # Se não tem transcrição ou o texto ainda é só [Áudio]
            if is_audio and not transcription:
                media_url = msg.get("media_url")
                # Se não veio media_url no payload mas tem msg_id, busca no banco
                if not media_url and msg_id and supabase:
                    try:
                        db_res = supabase.table("whatsapp_messages").select("media_url, transcription").eq("id", msg_id).limit(1).execute()
                        if db_res.data:
                            if db_res.data[0].get("transcription"):
                                transcription = db_res.data[0]["transcription"]
                            else:
                                media_url = db_res.data[0].get("media_url")
                    except Exception:
                        pass

                if media_url and (media_url.startswith("data:") or media_url.startswith("http")):
                    try:
                        transcribed = transcrever_audio_cloudflare(media_url)
                        if transcribed:
                            transcription = transcribed
                            if msg_id and supabase:
                                try:
                                    supabase.table("whatsapp_messages").update({"transcription": transcribed}).eq("id", msg_id).execute()
                                except Exception:
                                    pass
                    except Exception as e_tr:
                        app.logger.warning(f"Falha na transcrição de áudio on-the-fly: {e_tr}")

            if transcription:
                msg["transcription"] = transcription
                msg["text"] = f'[Áudio transcrito]: "{transcription}"'

        # 1.2 Análise multimodal de imagens e documentos recentes (boletos, comprovantes, propostas) via Gemini Vision
        for msg in conversation[-8:]:
            is_image = msg.get("media_type") in ["image", "document"] or "[Imagem]" in str(msg.get("text", "")) or "[Foto]" in str(msg.get("text", "")) or "[Documento]" in str(msg.get("text", ""))
            curr_text = str(msg.get("text", "")).strip()
            msg_id = msg.get("id") or msg.get("message_id")
            img_desc = msg.get("image_description")

            if is_image and not img_desc and not ("[Documento analisado:" in curr_text or "[Foto analisada:" in curr_text):
                media_url = msg.get("media_url")
                if not media_url and msg_id and supabase:
                    try:
                        db_res = supabase.table("whatsapp_messages").select("media_url, transcription").eq("id", msg_id).limit(1).execute()
                        if db_res.data:
                            media_url = db_res.data[0].get("media_url")
                            tr_val = db_res.data[0].get("transcription")
                            if tr_val and ("[Documento" in tr_val or "[Comprovante" in tr_val or "[Boleto" in tr_val or "Embracon" in tr_val):
                                img_desc = tr_val
                    except Exception:
                        pass

                if media_url and (media_url.startswith("data:image") or media_url.startswith("http")):
                    try:
                        analisado = analisar_imagem_documento_gemini(media_url)
                        if analisado:
                            img_desc = analisado
                            if msg_id and supabase:
                                try:
                                    supabase.table("whatsapp_messages").update({"transcription": f"[Documento analisado: {analisado}]"}).eq("id", msg_id).execute()
                                except Exception:
                                    pass
                    except Exception as e_im:
                        app.logger.warning(f"Falha na análise de imagem on-the-fly: {e_im}")

            if img_desc:
                msg["image_description"] = img_desc
                msg["transcription"] = img_desc
                if curr_text and curr_text not in ["[Imagem]", "[image]", "[Foto]", "[Documento]", ""]:
                    msg["text"] = f'{curr_text} [Documento/Imagem anexa analisada: {img_desc}]'
                else:
                    msg["text"] = f'[Documento/Imagem enviada pelo cliente: {img_desc}]'

        # 2. Desambiguação e separação estrita de mensagens: Lead vs Consultor
        historico_formatado = []
        msgs_lead = []
        for msg in conversation[-25:]:
            is_me = bool(msg.get("from_me"))
            transcription = (msg.get("transcription") or "").strip()
            texto = (msg.get("text") or msg.get("content") or "").strip()
            if transcription and not texto:
                texto = f'[Áudio transcrito]: "{transcription}"'
            elif transcription and "[Áudio" in texto:
                texto = f'[Áudio transcrito]: "{transcription}"'
            elif texto in ["[Áudio]", "[Audio]", ""]:
                texto = "[Áudio enviado pelo cliente/vendedor]"

            if not texto:
                continue

            if is_me:
                historico_formatado.append(f"[VENDEDOR / CONSULTOR]: {texto}")
            else:
                msgs_lead.append(texto)
                historico_formatado.append(f"[LEAD / CLIENTE ({lead.get('name') or 'Cliente'})]: {texto}")

        historico_str = "\n".join(historico_formatado) if historico_formatado else "Nenhuma mensagem anterior no histórico. O vendedor está iniciando o primeiro contato."
        ultima_msg_lead = msgs_lead[-1] if msgs_lead else "Nenhuma mensagem de resposta do lead no histórico recente."

        # 3. Análise Financeira Rigorosa: Crédito Pretendido vs Parcela Mensal
        fin_ctx = extract_financial_context(conversation, lead)
        credito_efetivo = fin_ctx["credito_pretendido"]
        parcela_alvo = fin_ctx["parcela_alvo"]
        instrucao_valor = f"""
INFORMAÇÕES FINANCEIRAS DO CLIENTE:
- Crédito Pretendido do Bem: {credito_efetivo}
{f'- Parcela Mensal Alvo Pretendida pelo Lead: em torno de {parcela_alvo}/mês' if parcela_alvo else ''}
⚠️ REGRA DE OURO FINANCEIRA: NUNCA confunda o valor da parcela mensal com o valor do crédito total do bem! NUNCA multiplique o valor da parcela por 1.000 (ex: parcela de R$ 600 jamais é crédito de R$ 600 mil)!
"""

        # 4. Discernimento do Segmento (Imóvel vs Carro vs Moto vs Pesados)
        segmento_info = detect_segment_interest(conversation, lead)
        instrucao_segmento = f"""
SEGMENTO IDENTIFICADO DO CLIENTE: {segmento_info['segment']} ({segmento_info['termo_bem']})
Destaques comerciais do segmento: {segmento_info['destaques']}
ADEQUE SUA PROPOSTA EXCLUSIVAMENTE A ESSE SEGMENTO!
"""

        # 4.1 Carregar tabelas e faixas de crédito do simulador (com cache em memória para resposta rápida)
        now_ts = time.time()
        if not hasattr(app, '_simulador_cache_ts') or (now_ts - getattr(app, '_simulador_cache_ts', 0) > 600):
            try:
                if supabase:
                    res_tab = supabase.table('simulador_tabelas').select('*').execute()
                    if res_tab.data:
                        app._simulador_tabelas_cache = res_tab.data
                    res_cred = supabase.table('simulador_tabelas_creditos').select('*').execute()
                    if res_cred.data:
                        app._simulador_creditos_cache = res_cred.data
                    app._simulador_cache_ts = now_ts
            except Exception as ex_tab:
                app.logger.warning(f"Aviso ao consultar simulador: {ex_tab}")

        tabelas_simulador = getattr(app, '_simulador_tabelas_cache', [])
        creditos_simulador = getattr(app, '_simulador_creditos_cache', [])

        contexto_financeiro_tabelas = get_simulador_pricing_context(
            segmento_info['segment'],
            fin_ctx,
            tabelas_simulador,
            creditos_simulador,
            admin_rules
        )

        # 5. Nome da Empresa e Proibição Absoluta de 'A11'
        company_name = (lead.get('company_name') or 'Nossa Consultoria de Consórcio').strip()
        regra_empresa_a11 = f"""
PROIBIÇÃO RIGOROSA DA SIGLA 'A11':
- É TERMINANTEMENTE PROIBIDO inventar, citar ou utilizar os termos 'A11' ou 'consórcio da A11'.
- Se precisar referenciar a consultoria/empresa, utilize o nome '{company_name}', 'nosso consórcio' ou a administradora '{adm_nome}'.
"""

        # 6. Diretrizes Anti-Robô do WhatsApp (Mensagem em Andamento)
        regras_whatsapp_andamento = f"""
DIRETRIZES OBRIGATÓRIAS DO WHATSAPP (MENSAGEM EM ANDAMENTO):
1. PROIBIDO INICIAR COM SAUDAÇÕES: NUNCA comece com 'Olá [Nome]', 'Oi [Nome]', 'Bom dia', 'Boa tarde', 'Tudo bem?'. O diálogo já está acontecendo em tempo real! Comece DIRETO na resposta/validação, exatamente como um consultor humano real responde no WhatsApp.
2. EXTENSÃO MÁXIMA CURTA: No máximo 2 a 3 frases curtas (estilo mensagem real de WhatsApp, entre 25 e 55 palavras). O cliente NUNCA lê textão!
3. PROIBIDO DESPEJO DE PRODUTOS OU BENEFÍCIOS (ANTI-DUMP): NUNCA invente modelos de carro que o cliente não pediu (ex: Ford Ranger, Hyundai Santa Fe) e NUNCA despeje uma lista com todos os benefícios da administradora de uma só vez (como Carta FIPE + diluição + parcela reduzida + lance embutido) se o cliente não perguntou especificamente sobre isso.
4. FOCO CIRÚRGICO: Responda estritamente ao ponto levantado pelo cliente na sua última mensagem, de forma empática e prática.
"""

        # Prompts customizados: usa os enviados na requisição ou obtém os salvos na administradora no Supabase
        if not custom_prompts or not isinstance(custom_prompts, dict) or not any(custom_prompts.values()):
            custom_prompts = (admin_rules.get('regras_comerciais_ia') or {}).get('mentoria_prompts') or {}

        custom_persona = (custom_prompts.get('persona') or '').strip()
        persona_header = custom_persona if custom_persona else f"Você é o MentorIA do ConsorFlux, especialista sênior de elite em vendas consultivas e fechamento de consórcios da {company_name}."

        def executar_llm_mentoria(system_prompt: str, user_prompt: str, client_gemini, temperature: float = 0.2) -> dict:
            cf_token = (os.getenv("CLOUDFLARE_API_TOKEN") or "").strip()
            account_id = (os.getenv("CLOUDFLARE_ACCOUNT_ID") or "84de4bcd01082e546270cc143e94106c").strip()
            cf_models = [
                (os.getenv("CLOUDFLARE_MODEL") or "@cf/meta/llama-3.3-70b-instruct-fp8-fast").strip(),
                "@cf/meta/llama-3.1-8b-instruct",
                "@cf/meta/llama-3.2-3b-instruct"
            ]
            cf_url = f"https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1/chat/completions"

            # 1. Tentar Cloudflare Workers AI com Llama 3.3 70B e Llama 3.1 8B
            for m_cf in cf_models:
                try:
                    r_cf = requests.post(
                        cf_url,
                        json={
                            "model": m_cf,
                            "messages": [
                                {"role": "system", "content": system_prompt},
                                {"role": "user", "content": user_prompt}
                            ],
                            "temperature": temperature,
                            "max_tokens": 768
                        },
                        headers={
                            "Authorization": f"Bearer {cf_token}",
                            "Content-Type": "application/json"
                        },
                        timeout=12
                    )
                    if r_cf.status_code == 200:
                        cf_json = r_cf.json()
                        cf_text = cf_json.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
                        parsed = parse_ai_json(cf_text)
                        if parsed and (parsed.get("message") or parsed.get("resumo_executivo") or parsed.get("status")):
                            return parsed
                except Exception as e_cf:
                    app.logger.warning(f"Cloudflare {m_cf} falhou em mentoria: {e_cf}")

            # 2. Fallback para Gemini
            try:
                resp = gerar_conteudo_gemini(client_gemini, f"{system_prompt}\n\n{user_prompt}", temperature=temperature)
                return parse_ai_json(resp.text)
            except Exception as e_gem:
                app.logger.error(f"Fallback Gemini falhou: {e_gem}")
                return {}

        if action in ['REPLY', 'OBJECTION']:
            custom_reply = (custom_prompts.get('reply') or custom_prompts.get('objection') or '').strip()
            diretriz_custom = f"\nINSTRUÇÕES PERSONALIZADAS DO VENDEDOR:\n{custom_reply}" if custom_reply else ""

            # Detecção inteligente da objeção consultando a base de dados dinâmica no Supabase
            guia_obj = None
            if ultima_msg_lead and ultima_msg_lead != "Nenhuma mensagem de resposta do lead no histórico recente.":
                clean_lead_text = ultima_msg_lead.lower().strip()
                try:
                    if supabase:
                        res_obj = supabase.table('mentoria_objections_knowledge').select('*').execute()
                        for row in (res_obj.data or []):
                            pats = row.get('patterns') or []
                            if isinstance(pats, str):
                                pats = [p.strip() for p in pats.split(',') if p.strip()]
                            for pat in pats:
                                try:
                                    if re.search(pat, clean_lead_text, re.IGNORECASE):
                                        rules_list = row.get('rules') or []
                                        if isinstance(rules_list, str):
                                            rules_list = [rules_list]
                                        guia_obj = {
                                            "category": row.get('category') or 'GERAL',
                                            "name": row.get('name') or 'Objeção',
                                            "psychology": row.get('psychology') or '',
                                            "strategy": row.get('strategy') or '',
                                            "ideal_template": row.get('ideal_template') or '',
                                            "rules": rules_list
                                        }
                                        break
                                except Exception:
                                    if pat.lower() in clean_lead_text:
                                        rules_list = row.get('rules') or []
                                        if isinstance(rules_list, str):
                                            rules_list = [rules_list]
                                        guia_obj = {
                                            "category": row.get('category') or 'GERAL',
                                            "name": row.get('name') or 'Objeção',
                                            "psychology": row.get('psychology') or '',
                                            "strategy": row.get('strategy') or '',
                                            "ideal_template": row.get('ideal_template') or '',
                                            "rules": rules_list
                                        }
                                        break
                            if guia_obj:
                                break
                except Exception as ex_db_obj:
                    app.logger.warning(f"Erro ao consultar mentoria_objections_knowledge dinamicamente: {ex_db_obj}")

            if not guia_obj:
                guia_obj = detect_objection_category(ultima_msg_lead)

            if guia_obj:
                bloco_instrucao = f"""
O LEAD APRESENTOU A SEGUINTE OBJEÇÃO OU CENÁRIO NA ÚLTIMA MENSAGEM:
- Situação / Objeção: {guia_obj['name']}
- Psicologia do Lead: {guia_obj['psychology']}
- Estratégia Recomendada: {guia_obj['strategy']}
- Script de Referência: "{guia_obj['ideal_template']}"
- Regras Específicas:
{chr(10).join('  * ' + r for r in guia_obj['rules'])}

SE O LEAD APRESENTOU PROPOSTA, FOLHETO OU OFERTA DE OUTRA EMPRESA/CONCORRENTE (ex: Embracon, Porto, Banco, etc.):
- Acolha e valide educadamente a empresa citada (nunca ataque agressivamente).
- Faça um comparativo cirúrgico destacando as vantagens exclusivas da {adm_nome}:
  * Prazos e quitação: se a outra empresa tiver prazo longo (ex: 240 meses), destaque que na Recon (196 meses) ele quita muito mais rápido economizando tempo e taxa de administração!
  * Parcela Super Light: parcela menor ou compatível com 50% de redução até contemplar.
  * Lance Fixo com Lance Embutido de até {adm_teto_embutido}%: concorre ao lance sem tirar nenhum centavo do próprio bolso.
- Finalize convidando para colocar as duas propostas lado a lado ou perguntando se prefere um áudio rápido explicando as diferenças.

SEU OBJETIVO: Quebre essa objeção com maestria, empatia e sem confronto. Responda pontualmente ao que ele disse, sem rodeios.
"""
            if not guia_obj:
                bloco_instrucao = f"""
MENSAGEM A RESPONDER: "{ultima_msg_lead}"
SEU OBJETIVO:
1. SE O CLIENTE ENVIOU OU PERGUNTOU SOBRE DOCUMENTO, FOLHETO DE CONCORRENTE, BOLETO OU COMPROVANTE:
   - Se for proposta/folheto de concorrente (ex: Embracon, Porto, Banco): acolha com ética, compare os diferenciais da {adm_nome} (plano Super Light com parcela reduzida, prazo mais rápido de 196 meses vs 240 meses da outra, e Lance Embutido de até {adm_teto_embutido}% sem tirar do bolso) e convide a comparar lado a lado.
   - Se for boleto ou comprovante de pagamento: responda DIRETO com o valor exato em reais identificado, confirmação da operação e presteza humana.
2. SE O CLIENTE PEDIU CONDIÇÃO, SIMULAÇÃO OU CITOU VALORES/PARCELAS (ex: "preciso pagar 600", "passar a condição especial", "qual a parcela?"):
   - Apresente uma SIMULAÇÃO BÁSICA, REAL E COMPLETA utilizando os dados exatos consultados das tabelas oficiais acima:
   - Informe com clareza o crédito (ex: R$ 200 mil ou R$ 250 mil), o plano oficial (Plano Super Light com parcela reduzida de 50% até contemplar), o prazo (ex: 196 meses) e o valor exato da parcela mensal que cabe na meta do cliente.
   - Mencione o diferencial do Lance Fixo de 25% utilizando Lance Embutido de até 25% (onde ele concorre ao lance sem tirar dinheiro do próprio bolso!).
   - Conclua OBRIGATORIAMENTE com uma pergunta consultiva natural para conduzir ao fechamento no WhatsApp (ex: "Faz sentido para você essa condição?", "O que achou dessa condição para viabilizarmos seu projeto?").
3. SE FOR UMA DÚVIDA GERAL OU COMENTÁRIO DO CLIENTE (sem pedido de simulação):
   - Responda especificamente ao que ele disse, com acolhimento, empatia e clareza humana. NUNCA force ou despeje simulação se o cliente estiver conversando sobre outro assunto!
"""

            prompt = f"""
{persona_header}

{regra_empresa_a11}

{consorcio_contexto}

{contexto_financeiro_tabelas}

{instrucao_segmento}

DADOS DO LEAD:
Nome do Cliente: {lead.get('name', 'Cliente')}
{instrucao_valor}

HISTÓRICO DA CONVERSA NO WHATSAPP:
{historico_str}

MENSAGEM MAIS RECENTE DO LEAD (A QUE DEVE SER PRIORITARIAMENTE RESPONDIDA):
"{ultima_msg_lead}"

{bloco_instrucao}

DIRETRIZES RÍGIDAS DE RESPOSTA NO WHATSAPP:
1. PROIBIDO INICIAR COM SAUDAÇÕES: NUNCA comece com 'Olá [Nome]', 'Oi [Nome]', 'Bom dia', 'Boa tarde', 'Tudo bem?'. Comece DIRETO na resposta com empatia e segurança.
2. SIMULAÇÃO COMPLETA E HUMANIZADA: Quando o cliente pedir condição ou citar parcela/crédito, passe a simulação de forma clara (crédito, plano com parcela 50% reduzida, prazo e valor da parcela exato das tabelas). Conclua com uma pergunta natural de fechamento ("Faz sentido para você essa condição?").
3. PROIBIDO PERGUNTAS ROBÓTICAS CLICHÊS: NUNCA termine com frases genéricas e vazias do tipo "Quer saber como isso pode ajudar a conquistar...".
4. REGRA DE OURO ANTI-REPETIÇÃO: É TERMINANTEMENTE PROIBIDO REPETIR, COPIAR OU REPRODUZIR AS PALAVRAS QUE O CLIENTE FALOU. Responda ao sentimento e à preocupação dele, JAMAIS repita o texto dele.
5. EXTENSÃO MODERADA: Resposta direta, humana e fluida de WhatsApp (entre 35 e 70 palavras).
6. FOCO CIRÚRGICO: Responda estritamente ao ponto levantado pelo cliente, de forma empática e prática.
{diretriz_custom}

Responda EXCLUSIVAMENTE em formato JSON com o seguinte schema:
{{
  "detected_objection": "{guia_obj['name'] if guia_obj else 'Dúvida/Resposta Contextual'}",
  "message": "mensagem direta, humana, com simulação real e pergunta de fechamento, pronta para enviar no WhatsApp"
}}
"""
            result = executar_llm_mentoria(persona_header, prompt, client, temperature=0.2)
            
            # Post-processing de segurança absoluta: Se a IA porventura tiver repetido a mensagem do lead
            suggested_msg = (result.get("message") or "").strip()
            if suggested_msg and ultima_msg_lead:
                clean_lead = re.sub(r"^\[Áudio transcrito\]:\s*\"?", "", ultima_msg_lead).rstrip('"').strip()
                if clean_lead and len(clean_lead) > 10:
                    if suggested_msg.lower().startswith(clean_lead.lower()):
                        suggested_msg = suggested_msg[len(clean_lead):].lstrip(" ?!,.:-").strip()
                    elif clean_lead.lower() in suggested_msg.lower():
                        suggested_msg = re.sub(re.escape(clean_lead) + r"[\s\?!,.:-]*", "", suggested_msg, flags=re.IGNORECASE).strip()
            result["message"] = suggested_msg

            registrar_log_ai("mentoria_reply", f"Resposta inteligente formulada para {lead.get('name')}", "success")
            return jsonify({"success": True, "action": "REPLY", "data": result}), 200

        elif action == 'OFFER':
            custom_offer = (custom_prompts.get('offer') or '').strip()
            diretriz_custom = f"\nINSTRUÇÕES PERSONALIZADAS DO VENDEDOR (CONFIGURAÇÕES):\n{custom_offer}" if custom_offer else ""

            teto_lance = admin_rules.get('teto_lance_embutido_pct', 25)
            regras_ia = admin_rules.get('regras_comerciais_ia') or {}
            campanha_ativa = (regras_ia.get('campanha_ativa') or '').strip()
            tabelas_promo = (regras_ia.get('tabelas_promocionais_nomes') or '').strip()
            carta_av = admin_rules.get('lance_carta_avaliacao') or "Carta de Avaliação (veículo usado entra pela FIPE como lance)"
            parcela_red = admin_rules.get('planos_parcela_reduzida') or "parcelas reduzidas até a contemplação"
            bloco_promocional = ""
            if campanha_ativa or tabelas_promo:
                bloco_promocional = f"""
OPORTUNIDADE PROMOCIONAL ATIVA NO CATÁLOGO:
- Campanha Vigente: {campanha_ativa or 'Condição especial para próxima assembleia'}
- Tabelas Promocionais Disponíveis: {tabelas_promo or 'Tabelas selecionadas'}
"""

            prompt = f"""
{persona_header}

{regra_empresa_a11}

{consorcio_contexto}

{contexto_financeiro_tabelas}

{instrucao_segmento}

DADOS DO LEAD:
Nome do Cliente: {lead.get('name', 'Cliente')}
{instrucao_valor}

HISTÓRICO DA CONVERSA NO WHATSAPP:
{historico_str}

{bloco_promocional}

DIRETRIZES DA ABORDAGEM COM OFERTA (PITCH COMERCIAL COM FORTE CTA, EMOJIS E URGÊNCIA):
1. NATUREZA DA MENSAGEM: Esta mensagem NÃO é uma resposta passiva a dúvidas. É uma ABORDAGEM PROATIVA COMERCIAL, com alta atratividade, senso de urgência e FORTE CHAMADA PARA AÇÃO (CTA).
2. ELEMENTOS OBRIGATÓRIOS DA OFERTA:
   - Gancho de Urgência Ética: Crie um gancho irresistível ligado à próxima assembleia, feirão ou condição extraordinária (ex: "condição extraordinária até este final de semana / até amanhã", "últimas vagas promocionais do grupo da assembleia de agora", "feirão de oportunidades da administradora").
   - Vantagens Competitivas Imbatíveis: Destaque o plano com parcela reduzida de até 50% até contemplar (adequando ao bolso dele) e a oportunidade do Lance Fixo de 25% utilizando 100% de Lance Embutido (onde o cliente concorre com o lance sem tirar nenhum centavo do próprio bolso!). Se for veículo, cite que o carro usado entra pela FIPE como lance.
   - Linguagem Dinâmica e Emojis Comerciais: Use emojis estratégicos para WhatsApp (🚀, 🎯, 🔑, ⏰, 💥) com dinamismo e bom gosto comercial.
   - FORTE CHAMADA PARA AÇÃO (CTA DE FECHAMENTO): Conclua chamando o cliente para agir agora e garantir a condição (ex: "Consigo segurar essa vaga especial para a assembleia de agora se fecharmos até [amanhã/domingo]. Me dá o ok aqui pra eu reservar sua cota?", "Vamos aproveitar essa condição antes do encerramento das vagas? Posso emitir sua proposta agora?").
3. NUNCA use a palavra 'financiar' ou 'financiamento'. Consórcio é planejamento financeiro inteligente e seguro sem juros bancários.
4. Extensão: Entre 40 e 80 palavras, vibrante, persuasiva e pronta para envio no WhatsApp.
{diretriz_custom}

Responda EXCLUSIVAMENTE em formato JSON com o seguinte schema:
{{
  "message": "mensagem vibrante de oferta com emojis, urgência e forte CTA pronta para enviar no WhatsApp"
}}
"""
            result = executar_llm_mentoria(persona_header, prompt, client, temperature=0.35)
            registrar_log_ai("mentoria_offer", f"Abordagem com oferta gerada para {lead.get('name')}", "success")
            return jsonify({"success": True, "action": "OFFER", "data": result}), 200

        elif action == 'ANALYZE':
            lead_detalhes = f"Nome: {lead.get('name', 'Cliente')} | Telefone: {lead.get('phone', 'N/I')} | {instrucao_valor} | Segmento: {segmento_info.get('segment', 'Geral')}"
            prompt = f"""
Você é o MentorIA do ConsorFlux, auditor e diretor de inteligência comercial de consórcios.
Faça uma avaliação diagnóstica profunda da conversa entre o consultor e o lead.

DADOS DO LEAD:
{lead_detalhes}

HISTÓRICO DA CONVERSA NO WHATSAPP:
{historico_str}

MENSAGEM MAIS RECENTE DO LEAD:
"{ultima_msg_lead}"

OBJETIVO:
Avalie minuciosamente:
1. Status da negociação:
   - "ALTA_CHANCE": Lead engajado, responde rápido, fez perguntas claras, tem interesse real e perfil compatível.
   - "MEDIA_CHANCE": Lead responde, mas tem dúvidas ou objeções pendentes; precisa de condução consultiva.
   - "ENROLANDO": Lead monossilábico, evasivo, dá desculpas vagas repetidamente ("depois vejo", "semana que vem"), não dá abertura real para fechar negócio.
2. Temperatura do lead: "Quente", "Morno" ou "Frio".
3. Chance percentual estimada de fechamento (número de 0 a 100).
4. Pontos Fortes demonstrados na conversa (array com 2 a 4 observações concretas).
5. Pontos Fracos ou Riscos de perda da venda (array com 2 a 4 observações concretas).
6. Dica Prática de Ouro para o Vendedor (orientação tática de como agir no próximo passo para destravar o fechamento).
7. Resumo Executivo da conversa em 2 a 3 frases.

Responda EXCLUSIVAMENTE em formato JSON com o seguinte schema:
{{
  "status": "ALTA_CHANCE",
  "temperatura": "Quente",
  "chance_percentual": 75,
  "resumo_executivo": "texto...",
  "pontos_fortes": ["ponto 1", "ponto 2"],
  "pontos_fracos": ["ponto 1", "ponto 2"],
  "dica_vendedor": "texto...",
  "proxima_acao_recomendada": "texto..."
}}
Nota para o status: escolha estritamente um entre "ALTA_CHANCE", "MEDIA_CHANCE" ou "ENROLANDO".
Nota para temperatura: escolha estritamente um entre "Quente", "Morno" ou "Frio".
"""
            result = executar_llm_mentoria("Você é o auditor e diretor de inteligência comercial de consórcios.", prompt, client, temperature=0.1)
            registrar_log_ai("mentoria_analyze", f"Análise criteriosa gerada para {lead.get('name')}: {result.get('status')}", "success")
            return jsonify({"success": True, "action": "ANALYZE", "data": result}), 200

        else:
            return jsonify({"error": f"Ação '{action}' não reconhecida"}), 400

    except Exception as e:
        print(f"❌ Erro em /api/ai/mentoria: {e}")
        return jsonify({"error": str(e)}), 500

# ==============================================================================
# 6. INTEGRAÇÃO EVOLUTION API & WEBHOOK WHATSAPP (MULTI-TENANT & IA)
# ==============================================================================
EVOLUTION_API_URL = os.environ.get("EVOLUTION_API_URL", "").rstrip('/')
EVOLUTION_API_KEY = os.environ.get("EVOLUTION_API_KEY")


def evolution_is_securely_configured():
    """Evolution must be explicitly configured through an HTTPS endpoint."""
    parsed = urlparse(EVOLUTION_API_URL)
    return bool(EVOLUTION_API_KEY and parsed.scheme == "https" and parsed.netloc)

def enviar_mensagem_whatsapp_evolution(instance_name: str, numero: str, texto: str):
    """Dispara mensagem de texto via Evolution API para o WhatsApp do cliente"""
    import urllib.request
    try:
        if not evolution_is_securely_configured():
            return None
        url = f"{EVOLUTION_API_URL.rstrip('/')}/message/sendText/{instance_name}"
        clean_num = re.sub(r'\D', '', numero)
        payload = json.dumps({"number": clean_num, "text": texto, "delay": 1200}).encode('utf-8')
        req = urllib.request.Request(
            url,
            data=payload,
            headers={
                "Content-Type": "application/json",
                "apikey": EVOLUTION_API_KEY
            },
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=10) as response:
            res_body = response.read().decode('utf-8')
            print(f"✅ WhatsApp enviado via Evolution API ({instance_name}): {res_body[:80]}")
            return json.loads(res_body)
    except Exception as e:
        print(f"⚠️ Erro ao enviar mensagem WhatsApp via Evolution API: {e}")
        return None

def normalize_phone_br(phone):
    """Normaliza telefones brasileiros para o padrão canônico com 9 dígitos para celulares"""
    if not phone:
        return ''
    digits = re.sub(r'\D', '', str(phone).split('@')[0])
    if digits.startswith('55') and len(digits) >= 12:
        digits = digits[2:]
    if len(digits) == 10:
        ddd = digits[:2]
        rest = digits[2:]
        if rest[0] in '6789':
            return f"55{ddd}9{rest}"
        return f"55{ddd}{rest}"
    elif len(digits) == 11:
        return f"55{digits}"
    return f"55{digits}" if not digits.startswith('55') else digits

def are_phones_equivalent_py(p1, p2):
    """Verifica se dois números correspondem à mesma linha móvel (com ou sem o nono dígito)"""
    if not p1 or not p2:
        return False
    c1 = normalize_phone_br(p1)
    c2 = normalize_phone_br(p2)
    if c1 and c2 and c1 == c2:
        return True
    d1 = re.sub(r'\D', '', str(p1).split('@')[0])
    d2 = re.sub(r'\D', '', str(p2).split('@')[0])
    return len(d1) >= 8 and len(d2) >= 8 and d1[-8:] == d2[-8:]

def obter_base64_midia_evolution(instance_name, payload_data):
    """Busca o arquivo de mídia decodificado em base64 da Evolution API para áudios, fotos e figurinhas"""
    try:
        import requests
        evolution_base = os.environ.get("EVOLUTION_API_URL", "").rstrip('/')
        api_key = os.environ.get("EVOLUTION_API_KEY")
        if not evolution_base.startswith("https://") or not api_key:
            return None
        url = f"{evolution_base}/chat/getBase64FromMediaMessage/{instance_name}"
        headers = {"apikey": api_key, "Content-Type": "application/json"}
        req_body = {"message": payload_data, "convertToMp4": False}
        res = requests.post(url, headers=headers, json=req_body, timeout=5)
        if res.status_code in [200, 201]:
            data = res.json()
            b64 = data.get('base64')
            mimetype = data.get('mimetype')
            if b64:
                prefix = f"data:{mimetype};base64," if mimetype and not b64.startswith('data:') else ""
                return f"{prefix}{b64}"
    except Exception as e_media:
        print(f"⚠️ Erro ao obter base64 da mídia na Evolution API: {e_media}")
    return None

def buscar_lead_no_funil(phone, user_id):
    """Verifica se o telefone pertence a um lead cadastrado no Funil / Painel de Leads"""
    if not user_id:
        return None
    try:
        boards_res = (supabase.table('crm_boards')
                      .select('id, user_id, data_payload')
                      .eq('user_id', user_id).execute())
        if not boards_res.data:
            return None
        for row in boards_res.data:
            payload = row.get('data_payload') or {}
            for phase in payload.get('phases', []):
                for client in phase.get('clients', []):
                    c_phone = client.get('phone') or ''
                    if are_phones_equivalent_py(c_phone, phone):
                        return {
                            "id": client.get('id'),
                            "name": client.get('name'),
                            "user_id": row.get('user_id'),
                            "phase_title": phase.get('title')
                        }
    except Exception as e:
        print(f"⚠️ Erro ao consultar lead no funil: {e}")
    return None

@app.route('/api/whatsapp/webhook', methods=['POST'])
@app.route('/api/whatsapp/webhook/<path:subpath>', methods=['POST'])
def whatsapp_webhook(subpath=None):
    """Webhook receptor de eventos da Evolution API (mensagens, conexão e QR Code)"""
    try:
        data = request.json or {}
        if not isinstance(data, dict):
            return jsonify({"error": "Evento inválido."}), 400
        event = str(data.get('event') or '').lower()
        instance_name = data.get('instance') or data.get('instanceName')
        payload_data = data.get('data') or {}
        if not isinstance(instance_name, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", instance_name):
            return jsonify({"error": "Instância ausente."}), 400
        registered = (supabase.table('whatsapp_instances')
                      .select('user_id').eq('instance_name', instance_name)
                      .limit(2).execute())
        if len(registered.data or []) != 1 or not registered.data[0].get('user_id'):
            return jsonify({"error": "Instância não cadastrada."}), 404

        # Ignorar sincronização de histórico em lote para não sobrecarregar memória e DB
        if any(ignored in event for ignored in ['messages.set', 'chats.set', 'contacts.set', 'labels.set']) or isinstance(payload_data, list):
            return jsonify({"status": "ignored_historic_sync"}), 200

        print(f"📩 Webhook Evolution API recebido: evento '{event}' | Instância: '{instance_name}'")

        # ----------------------------------------------------------------------
        # EVENTO: MENSAGEM RECEBIDA (messages.upsert)
        # ----------------------------------------------------------------------
        if event == 'messages.upsert':
            key = payload_data.get('key') or {}
            from_me = key.get('fromMe', False)
            remote_jid = key.get('remoteJid', '')
            message_id = key.get('id') or f"w_{int(time.time()*1000)}"
            push_name = payload_data.get('pushName') or 'Cliente WhatsApp'

            # Ignora mensagens de grupos de status ou broadcasts
            if '@g.us' in remote_jid or 'status@broadcast' in remote_jid:
                return jsonify({"status": "ignored_group_or_status"}), 200

            # ---------------------------------------------------------
            # DEDUPLICAÇÃO ESTRITA: Impede que a mesma mensagem seja processada ou respondida mais de 1 vez
            # ---------------------------------------------------------
            if not hasattr(app, '_recent_msg_ids'):
                app._recent_msg_ids = {}

            now_ts = time.time()
            app._recent_msg_ids = {k: v for k, v in app._recent_msg_ids.items() if now_ts - v < 180}

            if message_id in app._recent_msg_ids:
                print(f"⏩ Mensagem {message_id} já processada recentemente no app. Ignorando duplicata.")
                return jsonify({"status": "duplicate_ignored"}), 200

            app._recent_msg_ids[message_id] = now_ts

            # Verifica no Supabase se já existe para evitar duplicata em banco
            try:
                msg_exists = supabase.table('whatsapp_messages').select('id').eq('message_id', message_id).execute()
                if msg_exists.data and len(msg_exists.data) > 0:
                    print(f"⏩ Mensagem {message_id} já existe no Supabase. Ignorando.")
                    return jsonify({"status": "already_exists_in_db"}), 200
            except Exception as e_dup:
                print(f"⚠️ Erro ao verificar duplicata no Supabase: {e_dup}")

            # Extração de mídia e texto da mensagem
            msg_obj = payload_data.get('message') or {}
            media_type = 'text'
            media_url = None

            if 'audioMessage' in msg_obj:
                media_type = 'audio'
                text = "[Áudio]"
            elif 'imageMessage' in msg_obj:
                media_type = 'image'
                caption = msg_obj.get('imageMessage', {}).get('caption')
                text = caption if caption else "[Imagem]"
            elif 'videoMessage' in msg_obj:
                media_type = 'video'
                caption = msg_obj.get('videoMessage', {}).get('caption')
                text = caption if caption else "[Vídeo]"
            elif 'stickerMessage' in msg_obj:
                media_type = 'sticker'
                text = "[Figurinha]"
            elif 'documentMessage' in msg_obj:
                media_type = 'document'
                file_name = msg_obj.get('documentMessage', {}).get('fileName') or 'documento'
                text = f"[Documento: {file_name}]"
            elif 'locationMessage' in msg_obj or 'liveLocationMessage' in msg_obj:
                media_type = 'location'
                loc = msg_obj.get('locationMessage') or msg_obj.get('liveLocationMessage') or {}
                lat = loc.get('degreesLatitude')
                lng = loc.get('degreesLongitude')
                loc_name = loc.get('name') or ''
                loc_addr = loc.get('address') or ''
                desc_parts = [p for p in [loc_name, loc_addr] if p]
                desc_text = " - ".join(desc_parts) if desc_parts else ("Localização em tempo real" if 'liveLocationMessage' in msg_obj else "Localização compartilhada")
                text = f"[Localização: {desc_text}]"
                if lat is not None and lng is not None:
                    media_url = f"https://www.google.com/maps?q={lat},{lng}"
                else:
                    media_url = None
            else:
                text = (
                    msg_obj.get('conversation') or
                    msg_obj.get('extendedTextMessage', {}).get('text') or
                    ''
                )

            # Se for mídia, tenta buscar base64 direto da Evolution API para exibição imediata
            transcription = None
            if media_type in ['audio', 'image', 'sticker', 'video', 'document']:
                media_url = obter_base64_midia_evolution(instance_name, payload_data)
                if media_type == 'audio' and media_url:
                    try:
                        transcription_text = transcrever_audio_cloudflare(media_url)
                        if transcription_text:
                            transcription = transcription_text
                            text = f'[Áudio]: "{transcription_text}"'
                    except Exception as e_tr:
                        app.logger.warning(f"Erro ao transcrever áudio no webhook: {e_tr}")
                elif media_type in ['image', 'document'] and media_url:
                    try:
                        img_analysis = analisar_imagem_documento_gemini(media_url)
                        if img_analysis:
                            transcription = f"[Documento analisado: {img_analysis}]"
                            if text and text not in ["[Imagem]", "[image]", "[Documento]", "[Foto]"]:
                                text = f'{text} [Documento/Imagem anexa: {img_analysis}]'
                            else:
                                text = f'[Documento/Imagem enviada pelo cliente: {img_analysis}]'
                    except Exception as e_im_wh:
                        app.logger.warning(f"Erro ao analisar imagem no webhook: {e_im_wh}")

            if not text and not msg_obj and not media_url:
                return jsonify({"status": "empty_message"}), 200

            clean_phone = re.sub(r'\D', '', remote_jid.split('@')[0])
            canonical_phone = normalize_phone_br(clean_phone)

            # 1. Obter informações da instância no Supabase
            inst_query = supabase.table('whatsapp_instances').select('*').eq('instance_name', instance_name).execute()
            inst_info = inst_query.data[0] if inst_query.data else None
            user_id = inst_info.get('user_id') if inst_info else None
            auto_ai = inst_info.get('auto_ai_reception', False) if inst_info else False
            ai_prompt_custom = inst_info.get('ai_prompt') if inst_info else None
            company_name = "Nossa Empresa"
            gemini_key = os.getenv("GEMINI_API_KEY")

            if inst_info:
                raw_prompt = inst_info.get('ai_prompt')
                if raw_prompt:
                    try:
                        parsed = json.loads(raw_prompt)
                        if isinstance(parsed, dict):
                            if parsed.get('company_name'):
                                company_name = parsed.get('company_name').strip()
                            if parsed.get('ai_prompt'):
                                ai_prompt_custom = parsed.get('ai_prompt').strip()
                    except Exception:
                        ai_prompt_custom = raw_prompt

            # 2. Verificar se o número pertence a um Lead cadastrado no Funil de Vendas
            lead_info = buscar_lead_no_funil(clean_phone, user_id)
            lead_id = lead_info.get('id') if lead_info else None
            if lead_info and lead_info.get('name'):
                push_name = lead_info.get('name')

            # Se não for lead do funil, desativa IA de abordagem para não incomodar contatos externos
            if not lead_info:
                auto_ai = False

            # 3. Atualizar ou Criar Conversa (whatsapp_chats) com suporte a números equivalentes (com/sem 9)
            chat_id = None
            chats_query = supabase.table('whatsapp_chats').select('*').eq('instance_name', instance_name).execute()
            matched_chat = None
            if chats_query.data:
                for c in chats_query.data:
                    c_phone = c.get('contact_phone') or c.get('remote_jid', '')
                    if are_phones_equivalent_py(c_phone, clean_phone):
                        matched_chat = c
                        break

            if matched_chat:
                chat_id = matched_chat['id']
                supabase.table('whatsapp_chats').update({
                    "last_message": text,
                    "last_message_timestamp": datetime.now(timezone.utc).isoformat(),
                    "contact_name": push_name if push_name != 'Cliente WhatsApp' else matched_chat.get('contact_name'),
                    "unread_count": (matched_chat.get('unread_count') or 0) + (1 if not from_me else 0),
                    "lead_id": lead_id or matched_chat.get('lead_id')
                }).eq('id', chat_id).execute()
            else:
                new_chat = supabase.table('whatsapp_chats').insert({
                    "instance_name": instance_name,
                    "user_id": user_id,
                    "remote_jid": f"{canonical_phone}@s.whatsapp.net",
                    "contact_name": push_name,
                    "contact_phone": canonical_phone,
                    "lead_id": lead_id,
                    "last_message": text,
                    "last_message_timestamp": datetime.now(timezone.utc).isoformat(),
                    "unread_count": 1 if not from_me else 0,
                    "is_ai_active": True if lead_info else False
                }).execute()
                if new_chat.data:
                    chat_id = new_chat.data[0]['id']

            # 4. Gravar Mensagem no Supabase (whatsapp_messages) com dados de mídia e transcrição
            # Se foi enviada por nós (from_me == True), reconcilia com mensagem temporária do CRM para evitar duplicatas
            matched_pending_msg_id = None
            if from_me and chat_id:
                try:
                    recent_pending = supabase.table('whatsapp_messages') \
                        .select('id, message_id, text, media_type, media_url') \
                        .eq('chat_id', chat_id) \
                        .eq('from_me', True) \
                        .order('created_at', desc=True) \
                        .limit(5) \
                        .execute()
                    
                    if recent_pending.data:
                        for pmsg in recent_pending.data:
                            p_mid = str(pmsg.get('message_id') or '')
                            p_type = pmsg.get('media_type') or 'text'
                            if p_mid.startswith('msg_') and p_type == media_type:
                                matched_pending_msg_id = pmsg.get('id')
                                break
                except Exception as ex_chk:
                    print(f"⚠️ Erro ao checar mensagem temporária no CRM: {ex_chk}")

            if matched_pending_msg_id:
                print(f"🔄 Reconciliando mensagem {matched_pending_msg_id} com ID oficial {message_id}")
                update_payload = {
                    "message_id": message_id,
                    "status": "read" if from_me else "sent"
                }
                if transcription:
                    update_payload["transcription"] = transcription
                    update_payload["text"] = f'[Áudio]: "{transcription}"'
                elif text and text != "[Áudio]":
                    update_payload["text"] = text
                if media_url:
                    update_payload["media_url"] = media_url

                try:
                    supabase.table('whatsapp_messages').update(update_payload).eq('id', matched_pending_msg_id).execute()
                except Exception as ex_up_m:
                    print(f"⚠️ Erro ao atualizar mensagem temporária: {ex_up_m}")
            else:
                supabase.table('whatsapp_messages').insert({
                    "chat_id": chat_id,
                    "instance_name": instance_name,
                    "user_id": user_id,
                    "message_id": message_id,
                    "remote_jid": remote_jid,
                    "from_me": from_me,
                    "text": text,
                    "transcription": transcription,
                    "media_type": media_type,
                    "media_url": media_url,
                    "status": "read" if from_me else "delivered",
                    "is_ai_generated": False
                }).execute()

            # 4. MOTOR ANALÍTICO DE IA EM SHADOW MODE (OU AUTO-REPLY SE HABILITADO)
            # Diretriz de Produção Controlada:
            # - Em Shadow Mode (padrão): Analisa conversa, extrai dados, avalia regras (Dry-Run),
            #   e persiste a sugestão em `ai_lead_analysis`. NENHUM envio automático de WhatsApp.
            # - Se AI_AUTO_REPLY_ENABLED=false: Bloqueia envio automático e protege o cliente.
            is_chat_ai_active = matched_chat.get('is_ai_active', True) if matched_chat else True
            if not from_me and auto_ai and is_chat_ai_active and flags.is_ai_enabled():
                registrar_log_ai("whatsapp_reception_bot", f"Analisando mensagem recebida de '{push_name}': '{text[:40]}...' (Shadow Mode: {flags.is_shadow_mode()})")

                # Buscar histórico recente da conversa para contexto multi-turn
                history_msgs = []
                try:
                    if chat_id:
                        msgs_res = supabase.table('whatsapp_messages') \
                            .select('from_me, text') \
                            .eq('chat_id', chat_id) \
                            .order('created_at', desc=True) \
                            .limit(10) \
                            .execute()
                        if msgs_res.data:
                            for m in reversed(msgs_res.data):
                                role = "CONSULTOR" if m.get('from_me') else "CLIENTE"
                                txt_val = m.get('text', '')
                                if txt_val and not txt_val.startswith('['):
                                    history_msgs.append(f"{role}: {txt_val}")
                except Exception as e_hist:
                    print(f"⚠️ Erro ao buscar histórico: {e_hist}")

                historico_str = "\n".join(history_msgs) if history_msgs else f"CLIENTE: {text}"

                # 4.1 Qualificação e Análise Cognitiva via AI Router
                lead_ctx = {
                    "lead_id": lead_id,
                    "lead_name": push_name,
                    "history": historico_str,
                    "last_message": text,
                    "company_name": company_name,
                    "custom_instructions": ai_prompt_custom
                }

                # Análise e Qualificação do Lead
                analysis_result = ai_router.route_task(
                    TaskType.QUALIFY_LEAD,
                    {"content": f"Cliente: {push_name}\nConversa Recente:\n{historico_str}\nÚltima Mensagem: {text}"}
                )

                # Sugestão de Resposta para o Vendedor
                reply_prompt = (
                    f"Você é o Consultor Executivo do ConsorFlux CRM da {company_name}.\n"
                    f"Histórico:\n{historico_str}\n"
                    f"Última mensagem do cliente ({push_name}): '{text}'\n"
                    f"Diretrizes: {ai_prompt_custom or 'Acolha cordialmente, identifique se busca imóvel ou veículo e faixa de valor.'}\n"
                    f"Gere uma sugestão de resposta curta e consultiva (máx 2-3 frases)."
                )
                reply_result = ai_router.route_task(
                    TaskType.SUGGEST_REPLY,
                    {"content": reply_prompt}
                )

                sugestao_texto = None
                if reply_result.success and reply_result.data:
                    sugestao_texto = reply_result.data.get("resposta_sugerida")

                # Mescla a sugestão de resposta nos dados analíticos para persistência
                if analysis_result.success and analysis_result.data and sugestao_texto:
                    analysis_result.data["resposta_sugerida"] = sugestao_texto

                # 4.2 Persistência na tabela isolada `ai_lead_analysis` com Dry-Run de Regras
                saved_record = None
                if analysis_result.success:
                    saved_record = analysis_service.record_analysis(
                        task_type=TaskType.QUALIFY_LEAD,
                        ai_result=analysis_result,
                        lead_id=str(lead_id) if lead_id else None,
                        conversation_id=str(chat_id) if chat_id else None,
                        lead_context=lead_ctx,
                        user_id=user_id
                    )
                    registrar_log_ai(
                        "whatsapp_reception_bot",
                        f"Análise gravada no Supabase (ID: {saved_record.get('id') if saved_record else 'ok'}). Score: {analysis_result.data.get('score')}, Temp: {analysis_result.data.get('temperatura')}.",
                        "success"
                    )

                # 4.3 CONTROLE ESTRITO DE ENVIO AO WHATSAPP
                # Chatbot autônomo TERMINANTEMENTE DESATIVADO: A IA opera estritamente como co-piloto do consultor (botões manuais do CRM).
                can_auto_reply = False

                if not can_auto_reply:
                    # Em Shadow Mode: Apenas registra a sugestão da IA nos logs internos do CRM, sem disparar push invasivo ao vendedor
                    registrar_log_ai(
                        "whatsapp_reception_bot",
                        f"SHADOW MODE ATIVO: Nenhuma mensagem enviada ao cliente. Sugestão gerada para o vendedor: '{str(sugestao_texto)[:60]}...'",
                        "info"
                    )
                    # Notificação push de 'Sugestão da IA' desativada a pedido do usuário (mantido apenas para novos leads e eventos críticos)
                else:
                    # Se explicitamente autorizado em fase futura (AI_AUTO_REPLY_ENABLED=true e SHADOW_MODE=false)
                    if sugestao_texto:
                        try:
                            target_send_num = canonical_phone or clean_phone
                            enviar_mensagem_whatsapp_evolution(instance_name, target_send_num, sugestao_texto)

                            supabase.table('whatsapp_messages').insert({
                                "chat_id": chat_id,
                                "instance_name": instance_name,
                                "user_id": user_id,
                                "message_id": f"ai_{int(time.time()*1000)}",
                                "remote_jid": remote_jid,
                                "from_me": True,
                                "text": sugestao_texto,
                                "status": "sent",
                                "is_ai_generated": True
                            }).execute()

                            supabase.table('whatsapp_chats').update({
                                "last_message": sugestao_texto,
                                "last_message_timestamp": datetime.now(timezone.utc).isoformat()
                            }).eq('id', chat_id).execute()
                            registrar_log_ai("whatsapp_reception_bot", f"Resposta automática enviada para '{push_name}'.", "success")
                        except Exception as e_send_ai:
                            print(f"⚠️ Erro ao registrar/enviar resposta automática: {e_send_ai}")


            return jsonify({"status": "processed", "chat_id": chat_id}), 200

        # ----------------------------------------------------------------------
        # EVENTO: ATUALIZAÇÃO DE QR CODE (qrcode.updated)
        # ----------------------------------------------------------------------
        elif 'qrcode' in event:
            qr_base64 = payload_data.get('qrcode', {}).get('base64') or payload_data.get('base64')
            if qr_base64:
                supabase.table('whatsapp_instances').update({
                    "qr_code_base64": qr_base64,
                    "status": "CONNECTING",
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }).eq('instance_name', instance_name).execute()
                print(f"📱 QR Code atualizado no banco para a instância '{instance_name}'")
            return jsonify({"status": "qrcode_updated"}), 200

        # ----------------------------------------------------------------------
        # EVENTO: ESTADO DA CONEXÃO (connection.update)
        # ----------------------------------------------------------------------
        elif 'connection' in event:
            state = payload_data.get('state', '').lower()
            novo_status = 'CONNECTED' if state == 'open' else ('DISCONNECTED' if state in ['close', 'refused'] else 'CONNECTING')
            supabase.table('whatsapp_instances').update({
                "status": novo_status,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }).eq('instance_name', instance_name).execute()
            print(f"🔄 Conexão da instância '{instance_name}' atualizada para: {novo_status}")
            return jsonify({"status": "connection_updated", "state": novo_status}), 200

        return jsonify({"status": "unhandled_event"}), 200

    except Exception as e:
        print(f"❌ Erro no webhook WhatsApp: {e}")
        return jsonify({"status": "error_logged", "error": str(e)}), 200

@app.route('/api/whatsapp/enviar', methods=['POST'])
def rota_enviar_whatsapp():
    """Endpoint direto para disparar mensagem via Evolution API"""
    try:
        data = request.json or {}
        instance_name = data.get('instance_name')
        numero = data.get('numero')
        texto = data.get('texto')

        if not numero or not texto:
            return jsonify({"error": "Parâmetros 'numero' e 'texto' são obrigatórios"}), 400
        if not instance_owned_by_current_user(supabase, instance_name):
            return jsonify({"error": "Instância não autorizada."}), 403

        res = enviar_mensagem_whatsapp_evolution(instance_name, numero, texto)
        if res is None:
            return jsonify({"success": False, "error": "Envio não confirmado pela Evolution."}), 502
        return jsonify({"success": True, "result": res}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/prospeccao/buscar', methods=['POST'])
def rota_prospeccao_buscar():
    """Varredura de empresas no Google Maps para prospecção de leads qualificados."""
    try:
        data = request.json or {}
        termo = (data.get('termo') or '').strip()
        localizacao = (data.get('localizacao') or '').strip()
        limite = int(data.get('limite') or 20)
        apenas_com_telefone = bool(data.get('apenas_com_telefone', True))

        if not termo or not localizacao:
            return jsonify({"error": "Os parâmetros 'termo' e 'localizacao' são obrigatórios."}), 400

        user_id = getattr(g, 'user_id', None)

        from google_maps_scraper import extrair_empresas_google_maps
        empresas = extrair_empresas_google_maps(
            termo=termo,
            localizacao=localizacao,
            limite=limite,
            apenas_com_telefone=apenas_com_telefone
        )

        return jsonify({
            "sucesso": True,
            "termo": termo,
            "localizacao": localizacao,
            "total_encontrados": len(empresas),
            "empresas": empresas,
            "user_id": user_id
        }), 200
    except Exception as e:
        print(f"❌ Erro na rota de prospecção: {e}")
        return jsonify({"error": f"Erro durante a varredura: {str(e)}"}), 500


# ==============================================================================
# 7. GATEWAY DE WEBHOOKS DE TRÁFEGO PAGO (META ADS, GOOGLE ADS E UNIVERSAL)
# ==============================================================================
@app.route("/api/webhooks/<provider>", methods=["GET", "POST"])
@app.route("/api/webhooks", methods=["GET", "POST"])
def receive_lead_webhook(provider="incoming"):
    """
    Gateway Receptor de Webhooks de Tráfego Pago e Landing Pages.
    Compatível com:
    - Meta Ads (Facebook / Instagram Lead Ads e Make.com)
    - Google Ads Lead Form Extensions
    - Webhook Universal (Make, Zapier, n8n, WordPress, Typeform, Landing Pages)
    """
    # 1. Validação de Handshake / Verificação (Meta Ads GET hub.challenge)
    if request.method == "GET":
        challenge = request.args.get("hub.challenge")
        verify_token = (
            request.args.get("hub.verify_token") or
            request.args.get("verify_token") or
            request.args.get("token") or
            request.args.get("key")
        )

        # Se for verificação oficial do Meta Ads (Graph API)
        if challenge:
            return str(challenge), 200, {"Content-Type": "text/plain"}

        return jsonify({
            "status": "online",
            "message": "Gateway de Webhooks ConsorFlux ativo.",
            "provider": provider,
            "received_token": bool(verify_token)
        }), 200

    # 2. Processamento do POST (Ingestão do Lead)
    try:
        data = request.get_json(silent=True) or request.form.to_dict() or {}
        if not isinstance(data, dict):
            if isinstance(data, list) and len(data) > 0 and isinstance(data[0], dict):
                data = data[0]
            else:
                data = {}

        # Extração de campos com normalização
        nome = (
            data.get("nome") or data.get("name") or data.get("full_name") or
            data.get("cliente") or data.get("lead_name") or ""
        )
        telefone = (
            data.get("telefone") or data.get("phone") or data.get("phone_number") or
            data.get("whatsapp") or data.get("celular") or ""
        )
        email = data.get("email") or data.get("mail") or ""
        origem = data.get("origem") or data.get("source") or data.get("utm_source") or ""
        categoria = data.get("categoria") or data.get("category") or data.get("bem") or "Imóvel"
        valor_credito = data.get("valor_credito") or data.get("credito") or data.get("credit") or data.get("valor") or 200000
        observacoes = data.get("observacoes") or data.get("notes") or data.get("mensagem") or ""

        # Parser para payload nativo do Meta Ads (quando enviado diretamente pelo Facebook)
        if isinstance(data.get("entry"), list):
            try:
                changes = data["entry"][0].get("changes", [{}])[0].get("value", {})
                form_id = changes.get("form_id")
                if form_id:
                    origem = f"Meta Ads (Form #{form_id})"
                field_data = changes.get("field_data", [])
                for f in field_data:
                    fname = (f.get("name") or "").lower()
                    fvals = f.get("values", [])
                    fval = fvals[0] if fvals else ""
                    if any(k in fname for k in ["name", "nome"]):
                        nome = fval
                    elif any(k in fname for k in ["phone", "telefone", "celular", "whats"]):
                        telefone = fval
                    elif "email" in fname:
                        email = fval
                    elif any(k in fname for k in ["valor", "credito"]):
                        try:
                            valor_credito = float(re.sub(r"[^\d.]", "", str(fval)))
                        except Exception:
                            pass
                    elif any(k in fname for k in ["imovel", "carro", "veiculo", "categoria"]):
                        categoria = fval
            except Exception as e_meta:
                print(f"⚠️ Erro ao parsear entry nativo do Meta: {e_meta}")

        # Parser para payload nativo do Google Ads (user_column_data)
        if isinstance(data.get("user_column_data"), list):
            try:
                g_nome_partes = []
                for col in data["user_column_data"]:
                    col_id = (col.get("column_id") or "").upper()
                    s_val = col.get("string_value") or ""
                    if col_id in ("FIRST_NAME", "LAST_NAME"):
                        g_nome_partes.append(s_val)
                    elif col_id == "FULL_NAME":
                        nome = s_val
                    elif col_id == "PHONE_NUMBER":
                        telefone = s_val
                    elif col_id == "EMAIL":
                        email = s_val
                    elif col_id == "POSTAL_CODE":
                        observacoes = f"{observacoes} CEP: {s_val}".strip()
                if not nome and g_nome_partes:
                    nome = " ".join(g_nome_partes)
                if data.get("campaign_id"):
                    origem = f"Google Ads (Campanha #{data.get('campaign_id')})"
            except Exception as e_g:
                print(f"⚠️ Erro ao parsear user_column_data do Google: {e_g}")

        # Fallback de origem caso não venha no payload
        if not origem:
            if provider == "meta":
                origem = "Meta Ads (Instagram / Facebook Lead Ads)"
            elif provider == "google":
                origem = "Google Ads (Lead Form)"
            else:
                origem = "Webhook Externo"

        # Tratamento do telefone e nome (com fallback gracioso para evitar erro 400 em webhooks)
        telefone_limpo = re.sub(r"\D", "", str(telefone)) if telefone else ""
        if not str(nome).strip():
            if telefone_limpo:
                nome = f"Lead {telefone_limpo[-4:] if len(telefone_limpo) >= 4 else 'Tráfego'}"
            else:
                nome = f"Lead {provider.capitalize()} (Sem Nome)"

        try:
            valor_credito = float(valor_credito)
        except Exception:
            valor_credito = 200000.0

        # Montagem do cliente no padrão de cards do CRM
        timestamp_ms = int(time.time() * 1000)
        client_id = f"client_{timestamp_ms}_{os.urandom(2).hex()}"
        if not telefone_limpo:
            formatted_phone = "(00) 00000-0000"
        else:
            formatted_phone = f"+{telefone_limpo}" if telefone_limpo.startswith("55") else (
                f"+55{telefone_limpo}" if len(telefone_limpo) in (10, 11) else telefone_limpo
            )

        # Seleção balanceada de consultor na Roleta de Atendimento (crm_roleta_config)
        chosen_agent_name = "Roleta Automática"
        chosen_agent_id = None
        if supabase:
            try:
                roleta_res = (supabase.table("crm_roleta_config")
                              .select("user_id, leads_today, last_assigned_at")
                              .eq("in_roulette", True)
                              .order("leads_today", desc=False)
                              .order("last_assigned_at", desc=False)
                              .limit(1)
                              .execute())
                if roleta_res.data:
                    agent_entry = roleta_res.data[0]
                    chosen_agent_id = agent_entry["user_id"]
                    prof_res = supabase.table("user_profiles").select("name, email").eq("id", chosen_agent_id).limit(1).execute()
                    if prof_res.data:
                        chosen_agent_name = prof_res.data[0].get("name") or prof_res.data[0].get("email", "").split("@")[0] or "Consultor"
                    
                    now_iso = datetime.now(timezone.utc).isoformat()
                    supabase.table("crm_roleta_config").update({
                        "leads_today": (agent_entry.get("leads_today") or 0) + 1,
                        "last_assigned_at": now_iso,
                        "updated_at": now_iso
                    }).eq("user_id", chosen_agent_id).execute()
                    print(f"🎯 Roleta de Atendimento: Lead atribuído a {chosen_agent_name} ({chosen_agent_id})")
            except Exception as e_rol:
                print(f"⚠️ Aviso ao consultar Roleta de Atendimento: {e_rol}")

        new_client = {
            "id": client_id,
            "name": str(nome).strip(),
            "phone": formatted_phone,
            "email": str(email).strip(),
            "credit": valor_credito,
            "origin": str(origem).strip(),
            "category": str(categoria).strip(),
            "temperature": "hot",
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "notes": [
                {
                    "id": f"note_{timestamp_ms}",
                    "text": f"🎯 Lead recebido via Webhook ({provider.upper()}).\nOrigem: {origem}\nCrédito: R$ {valor_credito:,.2f}\nConsultor: {chosen_agent_name}\n{observacoes}".strip(),
                    "createdAt": datetime.now(timezone.utc).isoformat(),
                    "author": "Webhook Gateway"
                }
            ],
            "cardSummary": f"Lead captado via {provider.upper()} ({origem}). Consultor: {chosen_agent_name}.",
            "assignedAgent": chosen_agent_name,
            "assignedUserId": chosen_agent_id
        }

        # 3. Persistência no crm_boards (Supabase)
        board_saved = False
        board_target_user_id = None
        if supabase:
            try:
                target_user = request.args.get("user_id") or data.get("user_id") or chosen_agent_id
                board_row = None
                if target_user:
                    res_user = (supabase.table("crm_boards")
                               .select("id, user_id, data_payload")
                               .eq("user_id", target_user)
                               .ilike("id", "board_%")
                               .order("id", desc=True)
                               .limit(1)
                               .execute())
                    if res_user.data:
                        board_row = res_user.data[0]

                if not board_row:
                    res_admins = (supabase.table("user_profiles")
                                 .select("id, role")
                                 .in_("role", ["admin", "administrador", "gerente"])
                                 .limit(1)
                                 .execute())
                    if res_admins.data:
                        admin_id = res_admins.data[0]["id"]
                        res_adm_board = (supabase.table("crm_boards")
                                        .select("id, user_id, data_payload")
                                        .eq("user_id", admin_id)
                                        .ilike("id", "board_%")
                                        .order("id", desc=True)
                                        .limit(1)
                                        .execute())
                        if res_adm_board.data:
                            board_row = res_adm_board.data[0]

                if not board_row:
                    res_any = (supabase.table("crm_boards")
                              .select("id, user_id, data_payload")
                              .ilike("id", "board_%")
                              .order("id", desc=True)
                              .limit(1)
                              .execute())
                    if res_any.data:
                        board_row = res_any.data[0]

                if board_row:
                    board_id = board_row["id"]
                    board_target_user_id = board_row.get("user_id")
                    b_payload = board_row.get("data_payload") or {}
                    phases = b_payload.get("phases", [])
                    if phases:
                        first_phase = phases[0]
                        phase_clients = first_phase.setdefault("clients", [])
                        phase_clients.insert(0, new_client)
                        supabase.table("crm_boards").update({"data_payload": b_payload}).eq("id", board_id).execute()
                        board_saved = True
                        print(f"✅ Lead {new_client['name']} ({new_client['phone']}) inserido com sucesso no quadro {board_id}!")

                        # Enviar notificação push para o consultor atribuído ou dono do quadro
                        target_notif_user = chosen_agent_id or board_target_user_id
                        if target_notif_user:
                            try:
                                enviar_notificacao_push(
                                    user_id=target_notif_user,
                                    titulo="🎯 Novo Lead na Roleta!",
                                    mensagem=f"{new_client['name']} ({new_client['phone']}) - {origem}",
                                    lead_id=client_id
                                )
                            except Exception as e_push:
                                print(f"⚠️ Erro ao enviar push notification: {e_push}")
            except Exception as e_db:
                print(f"⚠️ Erro ao salvar lead no Supabase: {e_db}")

        return jsonify({
            "success": True,
            "message": "Lead recebido com sucesso!",
            "provider": provider,
            "board_saved": board_saved,
            "lead": new_client
        }), 200

    except Exception as e:
        print(f"❌ Erro ao processar webhook: {e}")
        return jsonify({"error": f"Erro interno ao processar webhook: {str(e)}"}), 500


if __name__ == '__main__':
    port = int(os.environ.get("PORT", 8080))
    app.run(host='0.0.0.0', port=port)

