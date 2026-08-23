import os
import time
from flask import Flask, request, jsonify
from flask_cors import CORS
from google import genai
from google.genai import types
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

app = Flask(__name__)
CORS(app) 

# Inicializa Supabase
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

@app.route('/chat-mentor', methods=['POST'])
def chat_mentor():
    try:
        data = request.json
        history = data.get('history', [])
        user_id = data.get('user_id')

        if not user_id:
            return jsonify({"error": "user_id não fornecido"}), 400

        client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

        # ==============================================================================
        # 1. RAG (Contexto Injetado): O Python lê todo o CRM e entrega "na mão" da IA
        # ==============================================================================
        board_response = supabase.table('crm_boards').select('data_payload').eq('user_id', user_id).ilike('id', 'board_%').execute()
        
        resumo_funil = "O funil deste vendedor está vazio."
        board_data = None
        
        if board_response.data and len(board_response.data) > 0:
            board_data = board_response.data[0]['data_payload']
            fases = board_data.get('phases', [])
            linhas_resumo = []
            for fase in fases:
                nome_fase = fase.get('title', 'Sem Fase')
                leads = fase.get('clients', [])
                linhas_resumo.append(f"\n--- FASE DO FUNIL: {nome_fase} ---")
                for lead in leads:
                    # Extrai os dados valiosos do lead para a IA entender o contexto
                    linhas_resumo.append(
                        f"Lead: {lead.get('name', 'Sem nome')} | "
                        f"ID_SISTEMA: '{lead.get('id')}' | "
                        f"Crédito Atual: {lead.get('desiredCredit', 'N/A')} | "
                        f"Parcela: {lead.get('idealInstallment', 'N/A')} | "
                        f"Temperatura: {lead.get('leadTemp', 'N/A')} | "
                        f"Anotações do Vendedor: {lead.get('initialInfo', 'Vazio')}"
                    )
            resumo_funil = "\n".join(linhas_resumo)

        # ==============================================================================
        # 2. FUNCTION CALLING (Ferramenta): Ensinando a IA a apertar botões no CRM
        # ==============================================================================
        def atualizar_dados_lead(lead_id: str, novo_credito: str = "", nova_parcela: str = "", nova_temperatura: str = "") -> str:
            """
            Atualiza os dados financeiros e a temperatura de um lead no banco de dados. 
            SÓ USE ESTA FUNÇÃO se você souber o ID_SISTEMA do lead e o usuário pedir para atualizar.
            Args:
                lead_id: O ID_SISTEMA exato do lead (ex: client_12345). Obrigatório.
                novo_credito: Valor do crédito desejado (Ex: R$ 250.000,00). Opcional.
                nova_parcela: Valor da parcela (Ex: R$ 1.800,00). Opcional.
                nova_temperatura: Temperatura do cliente (Quente, Morno ou Frio). Opcional.
            """
            try:
                # Busca o board atualizado
                resp = supabase.table('crm_boards').select('id, data_payload').eq('user_id', user_id).ilike('id', 'board_%').execute()
                if not resp.data:
                    return "Erro: Quadro do usuário não encontrado."
                
                b_id = resp.data[0]['id']
                payload = resp.data[0]['data_payload']
                
                lead_encontrado = False
                for p in payload.get('phases', []):
                    for c in p.get('clients', []):
                        if c.get('id') == lead_id:
                            if novo_credito: c['desiredCredit'] = novo_credito
                            if nova_parcela: c['idealInstallment'] = nova_parcela
                            if nova_temperatura: c['leadTemp'] = nova_temperatura
                            
                            comentario = {
                                "id": f"sys_ia_{int(time.time()*1000)}",
                                "text": f"🤖 IA atualizou: Crédito p/ {novo_credito or 'Mantido'}, Parcela p/ {nova_parcela or 'Mantido'}, Temp p/ {nova_temperatura or 'Mantido'}.",
                                "date": time.strftime('%Y-%m-%dT%H:%M:%S.000Z', time.gmtime())
                            }
                            c['comments'] = [comentario] + c.get('comments', [])
                            lead_encontrado = True
                            break
                
                if not lead_encontrado:
                    return "Erro: Lead não encontrado no funil."
                    
                # Grava a alteração no banco
                supabase.table('crm_boards').update({'data_payload': payload}).eq('id', b_id).execute()
                return f"Sucesso! Os dados do lead foram atualizados no CRM e a tela do usuário já refletiu a mudança."
            
            except Exception as e:
                return f"Erro ao atualizar lead: {str(e)}"

        # ==============================================================================
        # 3. CONSTRUÇÃO DO CHAT E ENVIO PARA A IA (COM RETRY PACIENTE)
        # ==============================================================================
        contents = []
        for msg in history:
            contents.append(
                types.Content(role=msg['role'], parts=[types.Part.from_text(text=msg['text'])])
            )

        instrucao_sistema = f"""Você é o Mentor IA da GT Consórcios, uma representante autorizada a vender consórcio pelo Consórcio Embracon, Consórcio Recon, Consórco Renault, Consórcio Nissan, Consórcio Âncora, Consórcio Yamaha, Consórcio Rodobens, Consórcio Canopus e Consórcio Itaú.
        Sua missão é dar roteiros e gerenciar o funil do usuário.

        AQUI ESTÃO OS CLIENTES DELE EM TEMPO REAL:
        {resumo_funil}

        REGRAS:
        1. Baseie suas dicas nas "Anotações do Vendedor". Se um cliente está na fase final, sugira fechamento.
        2. Se o usuário mandar você alterar os dados de um cliente com base na anotação, USE A FERRAMENTA 'atualizar_dados_lead' informando o ID_SISTEMA do lead correspondente.
        3. SEMPRE avise o usuário logo após atualizar informando "Pronto, acabei de atualizar a ficha do cliente para você!".
        """
        historico_chat = contents[:-1] if len(contents) > 1 else []
        ultima_mensagem = contents[-1].parts[0].text if len(contents) > 0 else ""

        # Aumentamos para 4 tentativas com uma pausa longa entre elas
        max_tentativas = 4
        for tentativa in range(max_tentativas):
            try:
                # Inicializamos o chat aqui dentro para garantir um estado limpo a cada tentativa
                chat = client.chats.create(
                    model='gemini-3.6-flash',
                    history=historico_chat,
                    config=types.GenerateContentConfig(
                        system_instruction=instrucao_sistema,
                        temperature=0.7,
                        tools=[atualizar_dados_lead] 
                    )
                )
                
                response = chat.send_message(ultima_mensagem)
                return jsonify({"reply": response.text}), 200
            
            except Exception as e:
                erro_str = str(e).upper()
                # Verifica se é erro de limite de cota (429) ou instabilidade (503)
                if '503' in erro_str or 'UNAVAILABLE' in erro_str or '429' in erro_str or 'RESOURCE' in erro_str or 'DEMAND' in erro_str or 'TOO MANY' in erro_str:
                    print(f"[Aviso] Limite da API Google atingido (Tentativa {tentativa+1}/{max_tentativas}). Pausa de 15s...")
                    if tentativa < max_tentativas - 1:
                        time.sleep(15) # Pausa de 15s para dar tempo do Google resetar a cota por minuto
                        continue
                    else:
                        return jsonify({"error": "ALTA_DEMANDA"}), 503
                else:
                    print(f"Erro interno API: {erro_str}")
                    return jsonify({"error": str(e)}), 500

    except Exception as e:
        print(f"Erro geral no backend: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)