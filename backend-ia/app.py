import os
import time
from flask import Flask, request, jsonify
from flask_cors import CORS
from google import genai
from google.genai import types
from dotenv import load_dotenv

# Carrega as variáveis de ambiente do arquivo .env
load_dotenv()

app = Flask(__name__)
# Habilita o CORS para permitir que o front-end (React Native Web/Expo) faça requisições
CORS(app) 

@app.route('/chat-mentor', methods=['POST'])
def chat_mentor():
    try:
        data = request.json
        history = data.get('history', [])

        # Inicializa o cliente do Gemini usando a chave do .env
        client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

        # Formata o histórico de mensagens para o padrão da SDK do Gemini
        contents = []
        for msg in history:
            contents.append(
                types.Content(
                    role=msg['role'], # Deve ser 'user' ou 'model'
                    parts=[types.Part.from_text(text=msg['text'])]
                )
            )

        # Instrução de Sistema - A Persona do Mentor
        instrucao_sistema = """Você é um mentor de alta performance especializado em vendas de consórcios da GT Consórcios, uma representante autorizada a vender consórcio pelo Consórcio Embracon, Consórcio Recon, Consórco Renault, Consórcio Nissan, Consórcio Âncora, Consórcio Yamaha, Consórcio Rodobens, Consórcio Canopus e Consórcio Itaú.
        Sua missão é treinar, tirar dúvidas e fornecer roteiros matadores para os vendedores.
        Você domina tudo sobre lances (fixos, embutidos, livres), taxas de administração, reajustes (INCC/INPC), contemplações e quebra de objeções.
        Seu tom é encorajador, direto, focado em resultados, com energia alta e altamente persuasivo.
        Quando pedirem ajuda com um cliente, dê exemplos práticos do que falar ou escrever.
        Memorize o nome do usuário e do cliente que o usuário informar para personalizar as respostas.
        Memorize todo o histórico de mensagens para manter o contexto da conversa.
        Use formatação em tópicos e emojis moderados para destacar partes importantes. Seja claro e prático."""

        # Sistema de Retry (Tentativas automáticas)
        max_tentativas = 3
        for tentativa in range(max_tentativas):
            try:
                # Faz a chamada para a API
                response = client.models.generate_content(
                    model='gemini-3.6-flash',
                    contents=contents,
                    config=types.GenerateContentConfig(
                        system_instruction=instrucao_sistema,
                        temperature=0.7 
                    )
                )
                return jsonify({"reply": response.text}), 200

            except Exception as e:
                erro_str = str(e).upper() # Padroniza para maiúsculo para não errar a leitura
                
                # Se for erro de alta demanda (503) ou limite de cota rápido (429), tenta de novo
                if '503' in erro_str or 'UNAVAILABLE' in erro_str or 'HIGH DEMAND' in erro_str or '429' in erro_str:
                    if tentativa < max_tentativas - 1:
                        time.sleep(3) # Aguarda 3 segundos silenciosamente antes da próxima tentativa
                        continue
                    else:
                        # Se falhou nas 3 tentativas, avisa o front-end corretamente
                        return jsonify({"error": "ALTA_DEMANDA"}), 503
                else:
                    print(f"Erro interno na API do Google: {erro_str}")
                    return jsonify({"error": str(e)}), 500

    except Exception as e:
        print(f"Erro geral no backend: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    # Rodando na porta 5000 para não conflitar com o backend do WhatsApp (3001)
    app.run(host='0.0.0.0', port=5000, debug=True)