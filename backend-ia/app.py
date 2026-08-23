import os
import time
import base64 # NOVO: Importação para ler o arquivo do frontend
from flask import Flask, request, jsonify
from flask_cors import CORS
from google import genai
from google.genai import types
from dotenv import load_dotenv

# Carrega as variáveis de ambiente do arquivo .env
load_dotenv()

app = Flask(__name__)
# Habilita o CORS para permitir que o front-end faça requisições
CORS(app) 

@app.route('/chat-mentor', methods=['POST'])
def chat_mentor():
    try:
        data = request.json
        history = data.get('history', [])

        client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

        # Formata o histórico e anexa arquivos se existirem
        contents = []
        for msg in history:
            parts = []
            
            # Adiciona o texto da mensagem
            if msg.get('text'):
                parts.append(types.Part.from_text(text=msg['text']))
                
            # NOVO: Adiciona o arquivo (PDF/Imagem) se o usuário enviou
            if msg.get('file'):
                file_info = msg['file']
                try:
                    file_bytes = base64.b64decode(file_info['base64'])
                    parts.append(types.Part.from_bytes(
                        data=file_bytes,
                        mime_type=file_info['mimeType']
                    ))
                except Exception as e:
                    print("Erro ao decodificar anexo:", e)

            # Só adiciona no histórico se tiver texto ou arquivo
            if parts:
                contents.append(
                    types.Content(
                        role=msg['role'], 
                        parts=parts
                    )
                )

        # Instrução de Sistema (Atualizada para pedir foco nas tabelas)
        instrucao_sistema = """Você é um mentor de alta performance especializado em vendas de consórcios da GT Consórcios, uma representante autorizada de grandes administradoras.
        Sua missão é treinar, tirar dúvidas e fornecer roteiros matadores para os vendedores.
        
        REGRA ESPECIAL DE ARQUIVOS: Se o usuário enviar um arquivo PDF ou Imagem com Tabelas de Grupos de Consórcio, LEIA ATENTAMENTE o arquivo. Use os valores EXATOS de créditos, prazos e parcelas contidos no arquivo para fazer simulações de vendas perfeitas e embasadas.
        
        Você domina tudo sobre lances, taxas de administração, reajustes e quebra de objeções.
        Use formatação em tópicos e emojis moderados. Seja claro e prático."""

        # Sistema de Retry
        max_tentativas = 3
        for tentativa in range(max_tentativas):
            try:
                response = client.models.generate_content(
                    model='gemini-3.6-flash', # O modelo Flash lê PDF e Imagens super rápido
                    contents=contents,
                    config=types.GenerateContentConfig(
                        system_instruction=instrucao_sistema,
                        temperature=0.4 # Temperatura um pouco menor para ele não inventar números nas simulações
                    )
                )
                return jsonify({"reply": response.text}), 200

            except Exception as e:
                erro_str = str(e).upper()
                if '503' in erro_str or 'UNAVAILABLE' in erro_str or 'HIGH DEMAND' in erro_str or '429' in erro_str:
                    if tentativa < max_tentativas - 1:
                        time.sleep(4) 
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