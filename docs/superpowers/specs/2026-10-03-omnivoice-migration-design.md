# Especificação de Design: Migração para OmniVoice (Text-to-Speech & Clonagem com Estilos)

**Data:** 03 de Outubro de 2026  
**Status:** Aprovado  
**Objetivo:** Substituir o modelo anterior (Kyutai Pocket-TTS) pelo **OmniVoice** (`k2-fsa/OmniVoice`), implementando síntese de fala multilíngue de alta fidelidade em português brasileiro com suporte a controle de estilos/tons de voz (Propaganda, Feliz, Surpresa, Amigável, Sério, Suave) e clonagem de voz na VPS Oracle do ConsorFlux CRM.

---

## 1. Contexto e Motivação

O modelo anterior (Pocket-TTS) apresentou limitações fonéticas e cortes em amostras clonadas. O usuário solicitou a migração para o **OmniVoice** (`https://github.com/k2-fsa/OmniVoice`), um modelo de difusão de 600M de parâmetros treinado pela equipe da `k2-fsa`, que oferece:
- Pronúncia natural em Português Brasileiro (PT-BR).
- Recurso de **Voice Design** via parâmetro `instruct`, permitindo modular gênero, idade, tom e estilo emotivo/comercial.
- Clonagem de voz zero-shot de alta semelhança tímbrica a partir de amostras de áudio.

---

## 2. Arquitetura do Sistema

```
[ Frontend: ConsorFlux CRM (/audio-ia) ]
           │
           │ HTTP POST (texto, estilo/tom, voz, amostra WAV, ref_text)
           ▼
[ Vite Dev Proxy / Cloud Run Backend ] (Timeout: 180s)
           │
           │ HTTPS com X-AI-Gateway-Key (porta 8443)
           ▼
[ AI Gateway Nginx / Caddy na VPS ]
           │
           │ HTTP reverso (127.0.0.1:8005)
           ▼
[ OmniVoice FastAPI Microservice ] (Python 3.12 / venv: omnivoice_env)
           │
           ├─► OmniVoice.from_pretrained("k2-fsa/OmniVoice", device="cpu", load_asr=False)
           ├─► Geração por Voice Design (`instruct` parametrizado por tom comercial)
           └─► Clonagem de voz via `create_voice_clone_prompt(ref_audio, ref_text)`
```

---

## 3. Especificação do Backend na VPS (`omnivoice_service.py`)

### 3.1 Configuração do Modelo e Otimização para 2 vCPUs
- **Ambiente Virtual:** `/home/ubuntu/omnivoice_env`
- **Modelo:** `k2-fsa/OmniVoice` carregado em CPU (`dtype=torch.float32`, `device_map="cpu"`).
- **Consumo de Memória:** ~1,1 GB de RAM (100% seguro nos 12 GB da máquina).
- **Otimização de Difusão:**
  - `num_step = 6` (configurável até 8): garante equilíbrio entre tempo de geração (~30s a 50s) e clareza acústica na CPU.
  - `guidance_scale = 2.0`
  - `load_asr = False`: desativa o carregamento pesado do Whisper na VPS, recebendo `ref_text` do cliente ou gerando prompt direto para evitar os 10 minutos de delay na transcrição.
- **Controle de Concorrência:** `threading.Semaphore(1)` para evitar contenção dos 2 núcleos de CPU.

### 3.2 Endpoints da API

#### `GET /health` e `GET /tts/health`
Retorna:
```json
{
  "status": "healthy",
  "engine": "omnivoice",
  "language": "portuguese",
  "sampling_rate": 24000,
  "supports_tones": true,
  "supports_cloning": true
}
```

#### `POST /tts/generate`
JSON Payload:
```json
{
  "text": "Texto a ser falado",
  "gender": "female", 
  "tone": "propaganda",
  "instruct": "female, young adult, enthusiastic, energetic"
}
```
Retorna:
```json
{
  "success": true,
  "text": "...",
  "tone": "propaganda",
  "duration": 4.5,
  "inference_time": 32.1,
  "audio_base64": "...",
  "format": "wav",
  "sample_rate": 24000
}
```

#### `POST /tts/clone`
Multipart Form Data:
- `text`: texto a ser falado
- `voice_wav`: arquivo de áudio de referência (convertido via FFmpeg para WAV PCM 24kHz)
- `ref_text`: transcrição aproximada da amostra (se disponível, acelera a clonagem)
- `tone`: estilo/tom a ser aplicado na voz clonada (opcional)

---

## 4. Especificação dos Estilos e Tons de Voz (Frontend)

Mapeamento de estilos comerciais no seletor do CRM:

| Estilo / Tom | Rótulo no CRM | Atributos `instruct` do OmniVoice |
| :--- | :--- | :--- |
| **propaganda** | 📢 Comercial / Propaganda | `enthusiastic, energetic, clear pitch` |
| **feliz** | 🎉 Empolgado / Otimista | `cheerful, expressive, high pitch` |
| **surpresa** | 😲 Surpresa / Novidade | `surprised, expressive, high pitch` |
| **amigavel** | 🤝 Consultivo / Amigável | `warm, friendly, young adult, moderate pitch` |
| **corporativo**| 💼 Executivo / Sério | `professional, calm, middle-aged, low pitch` |
| **suave** | 🤫 Suave / Exclusivo | `whisper, calm, low pitch` |

Opções de Gênero Base (para Modo de Voz por Texto):
- 👩 **Feminina** (`female, young adult`)
- 👨 **Masculina** (`male, young adult`)

---

## 5. Interface do Usuário (`AudioIAScreen.jsx`)

1. **Card de Estilo & Entonação:**
   - Grid de botões com ícones e descrições para escolher o tom comercial desejado.
2. **Seleção de Perfil Base:**
   - Alternância entre Voz Feminina e Masculina ao usar o modo de texto.
3. **Indicador de Progresso Realista:**
   - Mensagem clara: *"Sintetizando áudio em alta fidelidade neural com OmniVoice... (Previsão: 30 a 50s na CPU)"*.
   - Barra de progresso animada com contador de tempo decorrido.
4. **Player de Áudio:**
   - Mantido o player moderno com Play/Pause, barra de progresso, tempo e botão para baixar WAV.

---

## 6. Plano de Testes e Validação

1. **Testes do Backend na VPS:**
   - Validar `/tts/health` retornando `healthy` e `engine: omnivoice`.
   - Gerar áudio via `/tts/generate` com texto em português nos 6 tons comerciais.
   - Gerar áudio clonado via `/tts/clone` com amostra gravada.
2. **Testes de Integração no CRM:**
   - Acessar `http://localhost:5173/audio-ia` e testar síntese de texto com tom "Comercial / Propaganda".
   - Testar clonagem com gravação de microfone.
   - Verificar ausência de timeouts de requisição.
3. **Atualização da Documentação:**
   - Atualizar `A11_CRM/README.md` documentando o motor OmniVoice e seus novos parâmetros de tom.
