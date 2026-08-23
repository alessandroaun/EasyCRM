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

# Função para ler o arquivo de tabelas
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

        client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

        contents = []
        for msg in history:
            contents.append(
                types.Content(
                    role=msg['role'],
                    parts=[types.Part.from_text(text=msg['text'])]
                )
            )

        # Lê os dados do TXT no momento da requisição
        dados_tabelas = ler_tabelas_consorcio()

        # Instrução de Sistema - Injetando as Tabelas na Memória da IA
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

        Sempre que possível, ao montar simulações financeiras, apresente os cenários em formato de tabela Markdown para melhor visualização. Ao fornecer dicas, direcione o vendedor a agir com gatilhos de escassez e urgência de forma ética. Valorize a empatia no atendimento, mas exija do vendedor o fechamento da venda.

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
                        temperature=0.2 # Temperatura baixa para exatidão matemática
                    )
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