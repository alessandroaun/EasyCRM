import os
import time
import base64
import tempfile # NOVO: Necessário para criar arquivos físicos temporários
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
    # Lista para rastrear os arquivos que o Python vai criar e precisar deletar depois
    arquivos_temporarios = []
    
    try:
        data = request.json
        history = data.get('history', [])

        # Inicializa o cliente do Gemini usando a chave do .env
        client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

        # Formata o histórico de mensagens para o padrão da SDK do Gemini
        contents = []
        for msg in history:
            parts = []
            
            if msg.get('text'):
                parts.append(types.Part.from_text(text=msg['text']))
                
            # SE TIVER ARQUIVO (PDF ou Imagem)
            if msg.get('file'):
                file_info = msg['file']
                try:
                    file_bytes = base64.b64decode(file_info['base64'])
                    ext = ".pdf" if "pdf" in file_info['mimeType'] else ".jpg"
                    
                    # Cria um arquivo físico temporário no servidor Render
                    with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
                        tmp.write(file_bytes)
                        caminho_tmp = tmp.name
                        arquivos_temporarios.append(caminho_tmp)
                    
                    # Faz o upload oficial para a API do Google (suporta PDFs pesados)
                    uploaded_file = client.files.upload(file=caminho_tmp)
                    parts.append(uploaded_file)
                    
                except Exception as e:
                    print("Erro ao processar anexo:", e)

            # Só adiciona no histórico se tiver texto ou arquivo
            if parts:
                contents.append(
                    types.Content(
                        role=msg['role'], # Deve ser 'user' ou 'model'
                        parts=parts
                    )
                )

        # Instrução de Sistema - A Persona do Mentor (Mantida a original + Novas Regras)
        instrucao_sistema = """Você é um mentor de alta performance especializado em vendas de consórcios da GT Consórcios, uma representante autorizada a vender consórcio pelo Consórcio Embracon, Consórcio Recon, Consórco Renault, Consórcio Nissan, Consórcio Âncora, Consórcio Yamaha, Consórcio Rodobens, Consórcio Canopus e Consórcio Itaú.
        Sua missão é treinar, tirar dúvidas e fornecer roteiros matadores para os vendedores.
        Você domina tudo sobre lances (fixos, embutidos, livres), taxas de administração, reajustes (INCC/INPC), contemplações e quebra de objeções.
        Seu tom é encorajador, direto, focado em resultados, com energia alta e altamente persuasivo.
        Quando pedirem ajuda com um cliente, dê exemplos práticos do que falar ou escrever.
        Memorize o nome do usuário e do cliente que o usuário informar para personalizar as respostas.
        Memorize todo o histórico de mensagens para manter o contexto da conversa.
        Use formatação em tópicos e emojis moderados para destacar partes importantes. Seja claro e prático.
        
        REGRA ESPECIAL DE ARQUIVOS (SIMULAÇÕES):
        Quando o usuário enviar um arquivo PDF ou Imagem com Tabelas de Grupos de Consórcio e pedir uma simulação, você DEVE:
        1. Ler a tabela anexada minuciosamente (grupos, prazos, taxas, créditos).
        2. Se o cliente pedir um valor LÍQUIDO pós-lance embutido, faça a matemática reversa para achar o Crédito Total correto na tabela. (Ex: Líquido 45k + Embutido 25% = Crédito da tabela 60k).
        3. Identifique o Saldo Devedor total.
        4. Subtraia os lances ofertados (Embutido + Bolso).
        5. Calcule o novo valor da parcela ou a redução de prazo exata de acordo com as regras de consórcio.
        6. Entregue um resumo impecável, didático e motivador para o vendedor enviar ao cliente.
        
        Nunca invente dados que não estão na tabela anexada. Seja cirúrgico na matemática."""

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
                        temperature=0.2 # Temperatura super baixa para focar na EXATIDÃO matemática
                    )
                )
                
                # Deleta os PDFs temporários para não lotar o disco do servidor
                for caminho in arquivos_temporarios:
                    if os.path.exists(caminho):
                        os.remove(caminho)
                        
                return jsonify({"reply": response.text}), 200

            except Exception as e:
                erro_str = str(e).upper() # Padroniza para maiúsculo para não errar a leitura
                
                # Se for erro de alta demanda (503) ou limite de cota rápido (429), tenta de novo
                if '503' in erro_str or 'UNAVAILABLE' in erro_str or 'HIGH DEMAND' in erro_str or '429' in erro_str or 'QUOTA' in erro_str:
                    if tentativa < max_tentativas - 1:
                        time.sleep(10) # Pausa maior (10s) porque processar PDF consome mais tokens
                        continue
                    else:
                        for caminho in arquivos_temporarios:
                            if os.path.exists(caminho):
                                os.remove(caminho)
                        return jsonify({"error": "ALTA_DEMANDA"}), 503
                else:
                    for caminho in arquivos_temporarios:
                        if os.path.exists(caminho):
                            os.remove(caminho)
                    print(f"Erro interno na API do Google: {erro_str}")
                    return jsonify({"error": str(e)}), 500

    except Exception as e:
        for caminho in arquivos_temporarios:
            if os.path.exists(caminho):
                os.remove(caminho)
        print(f"Erro geral no backend: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    # Rodando na porta 5000 para não conflitar com o backend do WhatsApp (3001)
    app.run(host='0.0.0.0', port=5000, debug=True)