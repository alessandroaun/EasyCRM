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
import re

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
# 4. INTELIGÊNCIA DO MENTORIA E FUNCTION CALLING OTIMIZADO
# ==============================================================================

def _parse_valor(v):
    """Função hiper-robusta para converter valores financeiros malucos do usuário."""
    if not v: return None
    v_str = str(v).lower().replace('r$', '').replace(' ', '').strip()
    
    multiplier = 1
    if 'k' in v_str:
        multiplier = 1000
        v_str = v_str.replace('k', '')
    if 'mil' in v_str:
        multiplier = 1000
        v_str = v_str.replace('mil', '')
        
    # Mantém apenas números, ponto e vírgula
    v_str = re.sub(r'[^\d\.,]', '', v_str)
    if not v_str: return None
    
    # Verifica se o final é decimal (termina com .XX ou ,XX com 1 ou 2 casas)
    # Se terminar com 3 dígitos (ex: .000), o regex NÃO pega, o que é ótimo (ele entende que é milhar)
    match = re.search(r'[\.,](\d{1,2})$', v_str)
    if match:
        decimal_part = match.group(1)
        # Remove o decimal e limpa todos os outros pontos/vírgulas do inteiro
        integer_part = re.sub(r'[\.,]', '', v_str[:-len(decimal_part)-1])
        v_str = f"{integer_part}.{decimal_part}"
    else:
        # Não tem decimal, apenas limpa as pontuações e converte
        v_str = re.sub(r'[\.,]', '', v_str)
        
    try:
        return float(v_str) * multiplier
    except:
        return None

def consultar_planos(valor_credito_desejado: str = None, administradora: str = None) -> str:
    """
    Consulta os planos de consórcio disponíveis no Supabase.
    Use esta ferramenta quando o usuário pedir uma simulação de crédito, simulação de parcelas ou taxas.
    Args:
        valor_credito_desejado: O valor em reais do crédito que o cliente quer (ex: 50000 ou 50k).
        administradora: O nome da administradora específica (ex: Recon, Embracon, Yamaha).
    """
    # BLINDAGEM 1: Evitar que a IA puxe a tabela inteira e gaste tokens
    if not valor_credito_desejado and not administradora:
        return "ERRO: Para economizar tokens, você DEVE obrigatoriamente fornecer um 'valor_credito_desejado' ou o nome da 'administradora'. Não faça buscas genéricas."
        
    try:
        query = supabase.table('planos_consorcio').select('*')
        
        if administradora:
            query = query.ilike('administradora', f"%{administradora}%")
            
        valor = _parse_valor(valor_credito_desejado)
        if valor:
            # Amplia a margem de busca para 40% (para cima e para baixo) para dar boas opções
            query = query.gte('valor_credito', valor * 0.6).lte('valor_credito', valor * 1.4)
            
        res = query.execute()
        dados = res.data
        
        # BLINDAGEM 2: Administradora ou valor inexistente
        if not dados:
            return f"Nenhum plano encontrado. Se o usuário pediu a administradora '{administradora or 'Desconhecida'}', informe gentilmente que não trabalhamos com ela. Nossas parceiras são: Recon, Embracon, Renault, Nissan, Âncora, Yamaha, Rodobens, Canopus e Itaú."
            
        if valor:
            # O SEGREDO ESTÁ AQUI: Ordena a lista para o valor exato (ou mais próximo) ficar no topo!
            dados = sorted(dados, key=lambda x: abs(float(x.get('valor_credito', 0)) - valor))
            
        dados = dados[:15] # Traz no máximo 15 opções exatas/próximas para a IA montar a resposta
        
        texto = "=== PLANOS ENCONTRADOS ===\n"
        for p in dados:
            texto += f"Admin: {p.get('administradora')} | Tab: {p.get('nome_tabela')} | Créd: R$ {p.get('valor_credito')} | Parcela: R$ {p.get('valor_parcela')} | Pz: {p.get('prazo')}x | Regras: {p.get('regras_gerais')}\n"
        return texto
    except Exception as e:
        return f"Erro na base: {e}"

def consultar_resultados_assembleia(grupo: str = None, administradora: str = None) -> str:
    """
    Consulta os resultados das últimas assembleias.
    Use quando o usuário perguntar resultados, médias de lances (livre/fixo), quitação de um grupo.
    Args:
        grupo: O número exato do grupo (ex: 5116, 2010).
        administradora: Administradora do grupo.
    """
    try:
        query = supabase.table('resultados_assembleias').select('*')
        if grupo:
            query = query.eq('grupo', grupo)
        if administradora:
            query = query.ilike('administradora', f"%{administradora}%")
            
        res = query.execute()
        dados = res.data[:5]
        
        if not dados:
            return "Nenhum resultado de assembleia encontrado."
            
        texto = "=== RESULTADOS DE ASSEMBLEIAS ===\n"
        for r in dados:
             texto += f"[{r.get('administradora')} - Grp {r.get('grupo')}] Livre: {r.get('lance_livre')} | Fixo: {r.get('lance_fixo')} | Quitação: {r.get('quitacao')} | Fiel: {r.get('lance_fidelidade')} | Lim: {r.get('lance_limitado')}\n"
        return texto
    except Exception as e:
        return f"Erro na base: {e}"

def consultar_estrategias(administradora: str = None) -> str:
    """
    Consulta táticas, pitches e campanhas de consórcio.
    Use quando precisar de abordagens de vendas, quebra de objeções ou argumentos de venda.
    Args:
        administradora: A administradora (ex: Recon) para buscar estratégias específicas.
    """
    try:
        query = supabase.table('estrategias_vendas').select('*')
        if administradora:
             query = query.ilike('administradora', f"%{administradora}%")
             
        res = query.execute()
        dados = res.data[:3]
        
        if not dados:
            return "Nenhuma estratégia específica encontrada."
            
        texto = "=== ESTRATÉGIAS DE VENDAS ===\n"
        for e in dados:
            texto += f"Admin: {e.get('administradora')} | Oportunidade: {e.get('titulo')}\nDesc: {e.get('descricao')}\nPitch: {e.get('pitch')}\n---\n"
        return texto
    except Exception as e:
        return f"Erro na base: {e}"


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

        # Busca dinâmica do nome do usuário no banco de dados para humanizar o atendimento
        user_name = "Consultor"
        if user_id:
            try:
                user_res = supabase.table('user_profiles').select('name').eq('id', user_id).execute()
                if user_res.data and user_res.data[0].get('name'):
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

        instrucao_sistema = f"""Você é um mentor de alta performance especializado em vendas de consórcios da GT Consórcios, representante autorizada Embracon, Recon, Renault, Nissan, Âncora, Yamaha, Rodobens, Canopus e Itaú.
        Sua missão é treinar, tirar dúvidas, ajudar com simulações e fornecer roteiros matadores para os consultores.
        
        Você domina lances, taxas, reajustes e quebra de objeções. Seu tom é encorajador, direto e persuasivo.
        O consultor atual é {user_name}. Personalize o atendimento!
        
        REGRA DE OURO PARA USO DE FERRAMENTAS:
        1. SIMULAÇÕES: Se pedirem para simular valores ou prazos, USE a ferramenta `consultar_planos` passando o valor ou administradora. Não invente créditos ou parcelas. Baseie-se apenas no que a ferramenta retornar.
        2. RESULTADOS: Se perguntarem de grupos ou histórico de lances, USE a ferramenta `consultar_resultados_assembleia`.
        3. ESTRATÉGIAS: Se pedirem dicas, pitches ou quebra de objeções, USE a ferramenta `consultar_estrategias`.
        4. Entregue respostas didáticas em tópicos.
        """

        max_tentativas = 3
        for tentativa in range(max_tentativas):
            try:
                chat = client.chats.create(
                    model='gemini-3.6-flash',
                    history=contents,
                    config=types.GenerateContentConfig(
                        system_instruction=instrucao_sistema,
                        temperature=0.2,
                        # Passando as novas ferramentas modulares independentes
                        tools=[consultar_planos, consultar_resultados_assembleia, consultar_estrategias] 
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
                if '503' in erro_str or 'UNAVAILABLE' in erro_str or 'HIGH DEMAND' in erro_str or '429' in erro_str or 'QUOTA' in erro_str or 'EXHAUSTED' in erro_str:
                    if tentativa < max_tentativas - 1:
                        time.sleep(5)  # Espera 5 segundos antes de tentar novamente para contornar o Erro 429
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