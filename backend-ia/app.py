import firebase_admin
from firebase_admin import credentials, messaging
from supabase import create_client, Client
import os
import time
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
# 3. ROTA GENÉRICA PARA DISPARO DE NOTIFICAÇÕES (CHAMADA PELO FRONT-END)
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

# ==============================================================================
# 4. INTELIGÊNCIA DO MENTORIA E LEITURA DE ARQUIVO
# ==============================================================================
def ler_tabelas_consorcio():
    caminho_arquivo = os.path.join(os.path.dirname(__file__), 'tabelas_consorcio.txt')
    if os.path.exists(caminho_arquivo):
        with open(caminho_arquivo, 'r', encoding='utf-8') as f:
            return f.read()
    return "Tabelas não encontradas."

@app.route('/chat-mentor', methods=['POST'])
def chat_mentor():
    try:
        data = request.json
        history = data.get('history', [])
        user_id = data.get('user_id')

        client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

        contents = []
        for msg in history:
            contents.append(
                types.Content(
                    role=msg['role'],
                    parts=[types.Part.from_text(text=msg['text'])]
                )
            )

        dados_tabelas = ler_tabelas_consorcio()

        instrucao_sistema = f"""Você é um mentor de alta performance especializado em vendas de consórcios da GT Consórcios, uma representante autorizada a vender consórcio pelo Consórcio Embracon, Consórcio Recon, Consórco Renault, Consórcio Nissan, Consórcio Âncora, Consórcio Yamaha, Consórcio Rodobens, Consórcio Canopus e Consórcio Itaú.
        Sua missão é treinar, tirar dúvidas, ajudar com simulações e fornecer roteiros matadores para os vendedores / consultores de vendas.
        
        Você domina tudo sobre lances (fixos, embutidos, livres, limitado, fidelidade, quitação), taxas de administração, reajustes (INCC/INPC/IPCA), contemplações, análise de grupos, resultados de assembleias e quebra de objeções.
        Seu tom é encorajador, direto, focado em resultados, com energia alta e altamente persuasivo.
        
        === SEU BANCO DE DADOS DE TABELAS ===
        Abaixo estão as tabelas oficiais e outras informações (síntese de grupos, resultados de assembleias) que você deve usar para qualquer simulação pedida pelo usuário:
        
        {dados_tabelas}
        
        REGRA DE OURO PARA SIMULAÇÕES:
        1. Baseie-se EXCLUSIVAMENTE nos dados acima. Não invente créditos ou parcelas que não estejam listados.
        2. Se o cliente pedir um valor LÍQUIDO pós-lance embutido, faça a matemática reversa para achar o Crédito Total correto na tabela.
        3. Identifique o Saldo Devedor total, subtraia os lances ofertados e calcule o novo valor da parcela com precisão.
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
                response = client.models.generate_content(
                    model='gemini-3.6-flash',
                    contents=contents,
                    config=types.GenerateContentConfig(
                        system_instruction=instrucao_sistema,
                        temperature=0.2 
                    )
                )
                
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
                        time.sleep(10)
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
    app.run(host='0.0.0.0', port=5000, debug=True)