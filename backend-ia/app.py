import firebase_admin
from firebase_admin import credentials, messaging
from supabase import create_client, Client
import os
import time
import threading
from datetime import datetime, timezone
from flask import Flask, request, jsonify
from flask_cors import CORS
from google import genai
from google.genai import types
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
CORS(app) 

# ==============================================================================
# 1. INICIALIZAÇÃO DO FIREBASE E SUPABASE
# ==============================================================================
if not firebase_admin._apps:
    cred = credentials.Certificate("firebase-adminsdk.json")
    firebase_admin.initialize_app(cred)

url: str = os.environ.get("SUPABASE_URL")
key: str = os.environ.get("SUPABASE_KEY")
if url and key:
    supabase: Client = create_client(url, key)
else:
    print("⚠️ AVISO: SUPABASE_URL ou SUPABASE_KEY não encontrados no .env")

# ==============================================================================
# 2. FUNÇÃO DE DISPARO DE NOTIFICAÇÃO PUSH
# ==============================================================================
def enviar_notificacao_push(user_id: str, titulo: str, mensagem: str):
    try:
        response = supabase.table('user_push_tokens').select('token').eq('user_id', user_id).execute()
        
        if not response.data:
            print(f"⚠️ Usuário {user_id} não possui token de push registrado.")
            return False

        token_destino = response.data[0]['token']

        message = messaging.Message(
            notification=messaging.Notification(
                title=titulo,
                body=mensagem,
            ),
            webpush=messaging.WebpushConfig(
                notification=messaging.WebpushNotification(
                    icon="/logo192.png",
                    vibrate=[200, 100, 200]
                )
            ),
            data={
                "click_action": "FLUTTER_NOTIFICATION_CLICK",
                "url": "https://a11crm.netlify.app"
            },
            token=token_destino
        )

        resposta_firebase = messaging.send(message)
        print(f"✅ Notificação enviada com sucesso! ID da Mensagem: {resposta_firebase}")
        return True

    except Exception as e:
        print(f"❌ Erro crítico ao enviar push notification: {e}")
        return False

# ==============================================================================
# 3. ROTAS PARA DISPARO E AGENDAMENTO DE NOTIFICAÇÕES
# ==============================================================================
@app.route('/notificar', methods=['POST'])
def notificar_usuario():
    try:
        data = request.json
        target_user_id = data.get('target_user_id')
        titulo = data.get('titulo', 'Notificação do CRM')
        mensagem = data.get('mensagem', 'Você tem uma nova atualização.')

        if not target_user_id:
            return jsonify({"error": "target_user_id obrigatório"}), 400

        sucesso = enviar_notificacao_push(target_user_id, titulo, mensagem)
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


# ==============================================================================
# 4. INTELIGÊNCIA DO MENTORIA E FUNCTION CALLING
# ==============================================================================

# A IA lerá isso como uma "Ferramenta". As descrições (docstrings) dizem para a IA quando usar.
def consultar_tabelas_consorcio() -> str:
    """
    Use esta ferramenta SEMPRE que o usuário pedir uma SIMULAÇÃO de consórcio, 
    perguntar sobre valores de parcelas, taxas de administração, lances, prazos, 
    grupos ou regras específicas de administradoras.
    Essa função vai buscar no banco de dados todas as tabelas atualizadas, informações sobre resultados de assembleias e informações extras.
    """
    caminho_arquivo = os.path.join(os.path.dirname(__file__), 'tabelas_consorcio.txt')
    if os.path.exists(caminho_arquivo):
        with open(caminho_arquivo, 'r', encoding='utf-8') as f:
            return f.read()
    return "Erro: Arquivo de tabelas não encontrado no sistema."


@app.route('/chat-mentor', methods=['POST'])
def chat_mentor():
    try:
        data = request.json
        history = data.get('history', [])
        user_id = data.get('user_id')

        if not history:
            return jsonify({"error": "Histórico vazio"}), 400

        # Para usar Chat Mode no GenAI, separamos a última mensagem do restante do histórico
        user_message_text = history[-1]['text']
        past_history = history[:-1]

        # Busca dinâmica do nome do usuário no banco de dados para humanizar o atendimento
        user_name = "Consultor"
        if user_id:
            try:
                user_res = supabase.table('user_profiles').select('name').eq('id', user_id).execute()
                if user_res.data and user_res.data[0].get('name'):
                    # Pega apenas o primeiro nome do vendedor para manter o tom coloquial
                    user_name = user_res.data[0]['name'].split(' ')[0]
            except Exception as e:
                print(f"Aviso ao buscar perfil do usuário: {e}")

        client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

        contents = []
        for msg in past_history:
            contents.append(
                types.Content(
                    role=msg['role'],
                    parts=[types.Part.from_text(text=msg['text'])]
                )
            )

        instrucao_sistema = f"""Você é um mentor de alta performance especializado em vendas de consórcios da GT Consórcios, uma representante autorizada a vender consórcio pelo Consórcio Embracon, Consórcio Recon, Consórco Renault, Consórcio Nissan, Consórcio Âncora, Consórcio Yamaha, Consórcio Rodobens, Consórcio Canopus e Consórcio Itaú.
        Sua missão é treinar, tirar dúvidas, ajudar com simulações e fornecer roteiros matadores para os vendedores / consultores de vendas.
        
        Você domina tudo sobre lances (fixos, embutidos, livres, limitado, fidelidade, quitação), taxas de administração, reajustes (INCC/INPC/IPCA), contemplações, análise de grupos, resultados de assembleias e quebra de objeções.
        Seu tom é encorajador, direto, focado em resultados, com energia alta e altamente persuasivo.
        
        O nome do consultor de vendas com quem você está falando agora é {user_name}. Use o nome dele para personalizar o atendimento e criar proximidade!
        
        REGRA DE OURO PARA SIMULAÇÕES:
        1. Se o usuário pedir para fazer SIMULAÇÕES ou consultar dados financeiros, OBRIGATORIAMENTE chame a ferramenta `consultar_tabelas_consorcio` para pegar os dados corretos!
        2. Se não precisar fazer simulação (ex: dicas de venda, como abordar um lead), responda IMEDIATAMENTE usando sua experiência geral de vendas.
        3. Se fizer simulação com a ferramenta, baseie-se EXCLUSIVAMENTE nela. Não invente créditos ou parcelas.
        4. Entregue um resumo impecável, didático e motivador.

        Ao fornecer dicas, direcione o vendedor a agir com gatilhos de escassez e urgência de forma ética. Valorize a empatia no atendimento, mas exija do vendedor o fechamento da venda.

        Quando pedirem ajuda com um cliente, dê exemplos práticos do que falar ou escrever.
        Memorize o nome do usuário, e do cliente que o usuário informar para personalizar as respostas.
        Memorize todo o histórico de mensagens para manter o contexto da conversa.
        Use formatação em tópicos e emojis moderados para destacar partes importantes. Seja claro e prático.
        """

        max_tentativas = 3
        for tentativa in range(max_tentativas):
            try:
                # Utilizamos o modo "Chat" que resolve o aviso do Log e lida sozinho com o Tool Call
                chat = client.chats.create(
                    model='gemini-3.6-flash',
                    history=contents,
                    config=types.GenerateContentConfig(
                        system_instruction=instrucao_sistema,
                        temperature=0.2,
                        tools=[consultar_tabelas_consorcio] # Aqui injetamos a ferramenta
                    )
                )

                response = chat.send_message(user_message_text)
                
                if user_id:
                    enviar_notificacao_push(
                        user_id=user_id,
                        titulo="🤖 MentorIA Respondeu!",
                        mensagem="Sua resposta já está pronta no chat. Confira!"
                    )

                return jsonify({"reply": response.text}), 200

            except Exception as e:
                erro_str = str(e).upper()
                if '503' in erro_str or 'UNAVAILABLE' in erro_str or 'HIGH DEMAND' in erro_str or '429' in erro_str or 'QUOTA' in erro_str:
                    if tentativa < max_tentativas - 1:
                        time.sleep(5)  # Espera 5 segundos antes de tentar novamente
                        continue
                    else:
                        return jsonify({"error": "ALTA_DEMANDA"}), 503
                else:
                    print(f"Erro interno API Google: {erro_str}")
                    return jsonify({"error": str(e)}), 500

    except Exception as e:
        print(f"Erro geral no backend: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 8080))
    app.run(host='0.0.0.0', port=port)