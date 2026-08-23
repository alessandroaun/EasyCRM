import os
import time
import base64
import tempfile
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
    # Listas para rastrear os arquivos e limpar o servidor e a nuvem do Google depois
    arquivos_fisicos = []
    arquivos_google = []
    
    try:
        data = request.json
        history = data.get('history', [])

        client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

        contents = []
        for msg in history:
            parts = []
            
            # 1. Processa o arquivo primeiro (anexos antes do texto dão mais contexto)
            if msg.get('file'):
                file_info = msg['file']
                try:
                    file_bytes = base64.b64decode(file_info['base64'])
                    ext = ".pdf" if "pdf" in file_info['mimeType'] else ".jpg"
                    
                    with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
                        tmp.write(file_bytes)
                        caminho_tmp = tmp.name
                        arquivos_fisicos.append(caminho_tmp)
                    
                    # Upload oficial para a API do Google
                    uploaded_file = client.files.upload(file=caminho_tmp)
                    arquivos_google.append(uploaded_file.name) # Guarda para deletar da nuvem depois
                    parts.append(uploaded_file)
                    
                except Exception as e:
                    print("Erro ao processar anexo:", e)

            # 2. Processa o texto
            if msg.get('text'):
                parts.append(msg['text'])

            # 3. Adiciona a mensagem formatada em DICIONÁRIO SIMPLES
            # Isso evita o erro de serialização Pydantic/Proto (ONEOF FIELD 'DATA')
            if parts:
                contents.append({
                    "role": msg['role'], 
                    "parts": parts
                })

        instrucao_sistema = """Você é um mentor e calculista sênior especializado em vendas de consórcios da GT Consórcios, uma representante autorizada a vender consórcio pelo Consórcio Embracon, Consórcio Recon, Consórco Renault, Consórcio Nissan, Consórcio Âncora, Consórcio Yamaha, Consórcio Rodobens, Consórcio Canopus e Consórcio Itaú.
        
        Sua missão é treinar, tirar dúvidas e fornecer roteiros matadores para os vendedores.
        Você domina tudo sobre lances (fixos, embutidos, livres), taxas de administração, reajustes (INCC/INPC), contemplações e quebra de objeções.
        
        REGRA DE OURO PARA SIMULAÇÕES COM PDF/TABELAS ANEXADAS:
        Quando o usuário enviar uma tabela e pedir uma simulação, você DEVE:
        1. Ler a tabela anexada minuciosamente (grupos, prazos, taxas, créditos).
        2. Se o cliente pedir um valor LÍQUIDO pós-lance embutido, faça a matemática reversa para achar o Crédito Total correto na tabela. (Ex: Líquido 45k + Embutido 25% = Crédito da tabela 60k).
        3. Identifique o Saldo Devedor total.
        4. Subtraia os lances ofertados (Embutido + Bolso).
        5. Calcule o novo valor da parcela ou a redução de prazo exata de acordo com as regras de consórcio.
        6. Entregue um resumo impecável, didático e motivador para o vendedor enviar ao cliente.
        
        Nunca invente dados que não estão na tabela anexada. Seja cirúrgico na matemática.
        Memorize o nome do usuário e use formatação em tópicos. Seja claro e prático."""

        # Função para limpar todo o lixo gerado no servidor e na API do Google
        def limpar_arquivos():
            for caminho in arquivos_fisicos:
                if os.path.exists(caminho):
                    os.remove(caminho)
            for nome_arquivo_google in arquivos_google:
                try:
                    client.files.delete(name=nome_arquivo_google)
                except Exception:
                    pass

        max_tentativas = 3
        for tentativa in range(max_tentativas):
            try:
                response = client.models.generate_content(
                    model='gemini-3.6-flash',
                    contents=contents,
                    config=types.GenerateContentConfig(
                        system_instruction=instrucao_sistema,
                        temperature=0.2 # Temperatura super baixa para ele ser exato nos cálculos
                    )
                )
                
                limpar_arquivos()
                return jsonify({"reply": response.text}), 200

            except Exception as e:
                erro_str = str(e).upper()
                if '503' in erro_str or 'UNAVAILABLE' in erro_str or 'HIGH DEMAND' in erro_str or '429' in erro_str or 'QUOTA' in erro_str:
                    if tentativa < max_tentativas - 1:
                        time.sleep(10)
                        continue
                    else:
                        limpar_arquivos()
                        return jsonify({"error": "ALTA_DEMANDA"}), 503
                else:
                    limpar_arquivos()
                    print(f"Erro interno API Google: {erro_str}")
                    return jsonify({"error": str(e)}), 500

    except Exception as e:
        for caminho in arquivos_fisicos:
            if os.path.exists(caminho):
                os.remove(caminho)
        print(f"Erro geral no backend: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)