#!/usr/bin/env python3
"""
ConsorFlux WhatsApp Scheduler Worker
Worker em segundo plano para despacho autônomo de mensagens agendadas do WhatsApp via Evolution API.
Roda na VPS Oracle com consumo de RAM < 25 MB e 0% CPU em repouso.
"""

import os
import sys
import time
import json
import logging
import datetime
import requests

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://ygfitekotpgydiolcyry.supabase.co")
SUPABASE_KEY = os.environ.get(
    "SUPABASE_SERVICE_KEY",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlnZml0ZWtvdHBneWRpb2xjeXJ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MDI2NzkxOSwiZXhwIjoyMTA1ODQzOTE5fQ.i88mNjIu2pXEO63wuMzINWiEQ_zRsq6CXuo3613X5hM"
)
EVOLUTION_API_URL = os.environ.get("EVOLUTION_API_URL", "https://evolution.alessandrouchoa.com.br").rstrip('/')
EVOLUTION_API_KEY = os.environ.get("EVOLUTION_API_KEY", "A11_CRM_SECRET_KEY_2026")
LOCAL_TTS_URL = os.environ.get("LOCAL_TTS_URL", "http://127.0.0.1:8005")

HEADERS_SUPABASE = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation"
}

HEADERS_EVOLUTION = {
    "apikey": EVOLUTION_API_KEY,
    "Content-Type": "application/json"
}

def get_now_utc():
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

def get_connected_instance():
    """Busca a instância do WhatsApp ativa e conectada"""
    try:
        url = f"{SUPABASE_URL}/rest/v1/whatsapp_instances"
        params = {
            "status": "eq.CONNECTED",
            "order": "created_at.desc",
            "limit": "1"
        }
        res = requests.get(url, headers=HEADERS_SUPABASE, params=params, timeout=8)
        if res.status_code == 200:
            data = res.json()
            if data and len(data) > 0:
                return data[0].get("instance_name")
    except Exception as e:
        logging.error(f"Erro ao buscar instância conectada: {e}")
    return None

def simulate_presence(instance_name, phone, presence_type="composing", duration=3):
    """Mecanismo Antiban: Simula presença humana (digitando... ou gravando áudio...)"""
    try:
        url = f"{EVOLUTION_API_URL}/chat/sendPresence/{instance_name}"
        payload = {
            "number": phone,
            "presence": presence_type,
            "delay": duration * 1000
        }
        requests.post(url, headers=HEADERS_EVOLUTION, json=payload, timeout=6)
        logging.info(f"🛡️ Antiban: Simulação de presença '{presence_type}' por {duration}s para {phone}")
        time.sleep(duration)
    except Exception as e:
        logging.warning(f"Falha ao enviar simulação de presença: {e}")

def register_lead_comment(lead_id, lead_phone, comment_text):
    """Registra comentário de confirmação do envio na timeline do lead no crm_boards"""
    if not lead_id:
        return
    try:
        url = f"{SUPABASE_URL}/rest/v1/crm_boards"
        params = {"select": "id,data_payload", "limit": "5"}
        res = requests.get(url, headers=HEADERS_SUPABASE, params=params, timeout=8)
        if res.status_code != 200:
            return
        
        boards = res.json()
        for b in boards:
            payload = b.get("data_payload") or {}
            phases = payload.get("phases") or []
            modified = False

            for phase in phases:
                for client in phase.get("clients", []):
                    if str(client.get("id")) == str(lead_id) or client.get("phone") == lead_phone:
                        comments = client.get("comments") or []
                        new_comment = {
                            "id": f"sched_{int(time.time() * 1000)}",
                            "text": comment_text,
                            "date": datetime.datetime.now(datetime.timezone.utc).isoformat()
                        }
                        client["comments"] = [new_comment] + comments
                        modified = True
                        break
                if modified:
                    break

            if modified:
                board_id = b.get("id")
                patch_url = f"{SUPABASE_URL}/rest/v1/crm_boards"
                patch_params = {"id": f"eq.{board_id}"}
                requests.patch(patch_url, headers=HEADERS_SUPABASE, params=patch_params, json={"data_payload": payload}, timeout=8)
                logging.info(f"📝 Comentário registrado com sucesso no lead {lead_id}")
                return
    except Exception as e:
        logging.warning(f"Erro ao salvar comentário na ficha do lead: {e}")

def process_single_message(msg):
    msg_id = msg.get("id")
    lead_phone = msg.get("lead_phone")
    msg_type = msg.get("message_type", "text")
    content_text = msg.get("content_text")
    media_url = msg.get("media_url")
    human_sim = msg.get("human_simulation", True)
    lead_id = msg.get("lead_id")
    lead_name = msg.get("lead_name", "Cliente")

    logging.info(f"⏳ Processando agendamento #{msg_id} para {lead_name} ({lead_phone}) - Tipo: {msg_type}")

    instance_name = get_connected_instance()
    if not instance_name:
        raise Exception("Nenhuma instância de WhatsApp conectada no momento do envio.")

    # Simulação Humana Antiban
    if human_sim:
        presence_type = "recording" if msg_type in ["audio_ai", "audio_record"] else "composing"
        simulate_presence(instance_name, lead_phone, presence_type, duration=3)

    # Disparo via Evolution API
    send_response = None
    if msg_type == "text":
        url = f"{EVOLUTION_API_URL}/message/sendText/{instance_name}"
        payload = {
            "number": lead_phone,
            "text": content_text or "Olá!",
            "delay": 1200
        }
        res = requests.post(url, headers=HEADERS_EVOLUTION, json=payload, timeout=15)
        if res.status_code not in [200, 201]:
            raise Exception(f"Erro Evolution API: HTTP {res.status_code} - {res.text[:120]}")
        send_response = res.json()

    elif msg_type in ["audio_ai", "audio_record"]:
        url = f"{EVOLUTION_API_URL}/message/sendWhatsAppAudio/{instance_name}"
        audio_target = media_url

        # Se for audio_ai e não tiver URL prévia, sintetiza no Pocket-TTS local
        if not audio_target and content_text:
            try:
                tts_res = requests.post(
                    f"{LOCAL_TTS_URL}/generate",
                    json={"text": content_text, "gender": "male"},
                    timeout=20
                )
                if tts_res.status_code == 200:
                    b64 = tts_res.json().get("audio_base64")
                    if b64:
                        audio_target = f"data:audio/wav;base64,{b64}"
            except Exception as e_tts:
                logging.warning(f"Síntese local falhou, enviando como texto: {e_tts}")

        if audio_target:
            payload = {
                "number": lead_phone,
                "audio": audio_target,
                "delay": 1200
            }
            res = requests.post(url, headers=HEADERS_EVOLUTION, json=payload, timeout=25)
            if res.status_code not in [200, 201]:
                raise Exception(f"Erro Evolution API (Áudio): HTTP {res.status_code} - {res.text[:120]}")
            send_response = res.json()
        elif content_text:
            # Fallback para texto se áudio não pôde ser gerado
            res = requests.post(
                f"{EVOLUTION_API_URL}/message/sendText/{instance_name}",
                headers=HEADERS_EVOLUTION,
                json={"number": lead_phone, "text": content_text},
                timeout=15
            )
            send_response = res.json()

    elif msg_type in ["image", "document"]:
        url = f"{EVOLUTION_API_URL}/message/sendMedia/{instance_name}"
        payload = {
            "number": lead_phone,
            "media": media_url,
            "mediatype": "image" if msg_type == "image" else "document",
            "caption": content_text or "",
            "fileName": msg.get("file_name", "arquivo"),
            "delay": 1200
        }
        res = requests.post(url, headers=HEADERS_EVOLUTION, json=payload, timeout=25)
        if res.status_code not in [200, 201]:
            raise Exception(f"Erro Evolution API (Mídia): HTTP {res.status_code} - {res.text[:120]}")
        send_response = res.json()

    # Sucesso: Atualizar status e registrar comentário
    now_iso = get_now_utc()
    patch_url = f"{SUPABASE_URL}/rest/v1/whatsapp_scheduled_messages"
    patch_params = {"id": f"eq.{msg_id}"}
    requests.patch(
        patch_url,
        headers=HEADERS_SUPABASE,
        params=patch_params,
        json={"status": "sent", "sent_at": now_iso, "error_message": None, "updated_at": now_iso},
        timeout=8
    )

    logging.info(f"✅ Agendamento #{msg_id} enviado com sucesso para {lead_phone}!")
    comment_text = f"🤖 WhatsApp Programado: Mensagem agendada enviada com sucesso para o lead ({lead_phone}). Tipo: {msg_type}."
    register_lead_comment(lead_id, lead_phone, comment_text)

def reset_stuck_messages():
    """Destrava mensagens que ficaram presas em 'processing' por mais de 10 minutos"""
    try:
        ten_min_ago = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(minutes=10)).strftime("%Y-%m-%dT%H:%M:%SZ")
        patch_url = f"{SUPABASE_URL}/rest/v1/whatsapp_scheduled_messages"
        patch_params = {"status": "eq.processing", "updated_at": f"lte.{ten_min_ago}"}
        requests.patch(
            patch_url,
            headers=HEADERS_SUPABASE,
            params=patch_params,
            json={"status": "pending", "updated_at": get_now_utc()},
            timeout=8
        )
    except Exception as e:
        logging.error(f"Erro ao destravar mensagens pendentes: {e}")

def run_worker_loop():
    logging.info("🚀 ConsorFlux WhatsApp Scheduler Worker iniciado na VPS Oracle.")
    logging.info(f"Conectado ao Supabase: {SUPABASE_URL}")
    logging.info(f"Evolution API: {EVOLUTION_API_URL}")

    while True:
        try:
            now_iso = get_now_utc()
            query_url = f"{SUPABASE_URL}/rest/v1/whatsapp_scheduled_messages"
            query_params = {
                "status": "eq.pending",
                "scheduled_for": f"lte.{now_iso}",
                "order": "scheduled_for.asc",
                "limit": "5"
            }

            res = requests.get(query_url, headers=HEADERS_SUPABASE, params=query_params, timeout=8)
            if res.status_code == 200:
                messages = res.json() or []
                if len(messages) > 0:
                    logging.info(f"📬 {len(messages)} mensagem(ns) agendada(s) pronta(s) para disparo.")

                for msg in messages:
                    msg_id = msg.get("id")

                    # Trava atômica (Lock)
                    lock_url = f"{SUPABASE_URL}/rest/v1/whatsapp_scheduled_messages"
                    lock_params = {"id": f"eq.{msg_id}", "status": "eq.pending"}
                    lock_res = requests.patch(
                        lock_url,
                        headers=HEADERS_SUPABASE,
                        params=lock_params,
                        json={"status": "processing", "updated_at": now_iso},
                        timeout=8
                    )

                    if not lock_res.json():
                        # Já foi capturado por outro worker/thread
                        continue

                    try:
                        process_single_message(msg)
                    except Exception as send_err:
                        err_msg = str(send_err)
                        logging.error(f"❌ Falha ao enviar agendamento #{msg_id}: {err_msg}")
                        fail_patch = f"{SUPABASE_URL}/rest/v1/whatsapp_scheduled_messages"
                        fail_params = {"id": f"eq.{msg_id}"}
                        requests.patch(
                            fail_patch,
                            headers=HEADERS_SUPABASE,
                            params=fail_params,
                            json={
                                "status": "failed",
                                "error_message": err_msg[:250],
                                "updated_at": get_now_utc()
                            },
                            timeout=8
                        )

            reset_stuck_messages()

        except Exception as loop_err:
            logging.error(f"Erro no ciclo do worker: {loop_err}")

        time.sleep(15)

if __name__ == '__main__':
    run_worker_loop()
