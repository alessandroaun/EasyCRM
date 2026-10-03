# Kyutai Pocket-TTS & Mensagens de Áudio IA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Instalar o modelo Kyutai Pocket-TTS na VPS da Oracle (2 núcleos, 12 GB RAM), disponibilizar endpoints HTTP em português (voz Rafael e clonagem de voz do vendedor) e criar a nova tela no ConsorFlux CRM com gravação, síntese e download de áudios.

**Architecture:** O Pocket-TTS roda em CPU na VPS Oracle em um serviço Python dedicado com modelo mantido em memória RAM. O backend do CRM atua como proxy autenticado via AI Gateway, e o frontend React fornece uma interface no menu Atendimento com gravador de microfone nativo, seleção de voz (Rafael vs Clonada) e player de áudio com download.

**Tech Stack:** Python 3.12 (VPS), PyTorch (CPU-only), pocket-tts, FastAPI/Uvicorn, React, Tailwind CSS, Lucide Icons, Vite.

**Spec:** `docs/superpowers/specs/2026-10-03-pocket-tts-crm-design.md`

## Global Constraints
- Idioma estritamente **Português (PT)**: apenas a voz pré-treinada `rafael` e clonagem com referência em português devem ser expostas.
- Semáforo de concorrência com limite de 1 inferência por vez na VPS para não sobrecarregar as 2 vCPUs da máquina.
- Amostra de voz clonada mantida em memória de sessão no navegador.
- Envio via WhatsApp (Evolution API) mantido para a fase posterior conforme solicitado pelo usuário.

## Review Focus
1. Instalação na VPS sem puxar pacotes CUDA pesados (utilizar `--extra-index-url https://download.pytorch.org/whl/cpu`).
2. Desempenho e latência de geração na CPU de 2 núcleos (garantir modelo mantido em memória, não recarregar pesos a cada requisição).
3. Conversão de áudio do microfone do navegador (WebM/Opus) para formato aceito pelo Pocket-TTS (WAV mono).
4. Tratamento de permissão de microfone negada no navegador pelo usuário.
5. Manutenção de compatibilidade de build no frontend Vite (0 erros de compilação).

---

### Task 1: Instalação e Testes do Kyutai Pocket-TTS na VPS Oracle

**Files:**
- VPS Target: `146.235.55.85` (usuário `ubuntu`, chave `id_evolution`)
- Create: `/home/ubuntu/pocket_tts_env` (venv)
- Create: `/home/ubuntu/test_pocket_tts.py`

**Interfaces:**
- Consumes: SSH na porta 22
- Produces: Ambiente Python com `pocket-tts` instalado e pesos baixados

- [ ] **Step 1: Criar venv isolado e instalar PyTorch CPU + Pocket-TTS na VPS**
  Executar via SSH:
  ```bash
  python3 -m venv /home/ubuntu/pocket_tts_env
  /home/ubuntu/pocket_tts_env/bin/pip install --upgrade pip
  /home/ubuntu/pocket_tts_env/bin/pip install pocket-tts --extra-index-url https://download.pytorch.org/whl/cpu
  /home/ubuntu/pocket_tts_env/bin/pip install soundfile scipy fastapi uvicorn pydantic python-multipart
  ```

- [ ] **Step 2: Escrever script de teste de geração (Voz Rafael) e clonagem na VPS**
  Criar `/home/ubuntu/test_pocket_tts.py`:
  Testar carregamento de `TTSModel.load_model()`, síntese do texto *"Olá, este é um teste oficial do ConsorFlux CRM utilizando o modelo Pocket TTS em português."* com a voz `rafael`, e validar exportação do arquivo `test_rafael.wav`.

- [ ] **Step 3: Executar script de teste e validar saída de áudio**
  Executar: `/home/ubuntu/pocket_tts_env/bin/python /home/ubuntu/test_pocket_tts.py`
  Verificar: Saída sem erros, tempo de inferência e arquivo WAV gerado com tamanho > 0 bytes.

- [ ] **Step 4: Commit das evidências e scripts locais**
  Salvar logs do teste.

---

### Task 2: Criação do Microsserviço HTTP Pocket-TTS na VPS e Exposição no Gateway

**Files:**
- Create: `/home/ubuntu/pocket_tts_service.py`
- Modify: `/home/ubuntu/crm_ai_gateway.py` (ou rota direta)
- Create: `/etc/systemd/system/pocket-tts.service`

**Interfaces:**
- Consumes: `TTSModel` do `pocket-tts`
- Produces: Endpoint HTTP `POST /api/tts/generate` e `POST /api/tts/clone`

- [ ] **Step 1: Criar serviço FastAPI `/home/ubuntu/pocket_tts_service.py`**
  Implementar API com:
  - Inicialização com `TTSModel.load_model()` e `get_state_for_audio_prompt("rafael")` em cache.
  - Endpoint `POST /tts/generate` (recebe text, retorna áudio base64).
  - Endpoint `POST /tts/clone` (recebe text e audio_base64 da amostra, converte áudio via soundfile/scipy, gera áudio com a voz clonada e retorna base64).
  - Semáforo `asyncio.Semaphore(1)` para controle de 2 OCPUs.

- [ ] **Step 2: Configurar systemd service e iniciar na porta local 8005**
  Criar serviço systemd para reinicialização automática e iniciar o daemon.

- [ ] **Step 3: Conectar a rota no AI Gateway (`/home/ubuntu/crm_ai_gateway.py`)**
  Adicionar proxy reverso para `/api/tts/*` repassar para `http://127.0.0.1:8005/tts/*` com validação de token `X-AI-Gateway-Key`.

- [ ] **Step 4: Testar endpoints via curl**
  Executar requisições de teste em `/api/tts/generate` e `/api/tts/clone` confirmando retorno HTTP 200 com payload `audio_base64`.

---

### Task 3: Backend Proxy no CRM (`backend-crm-cloudrun`)

**Files:**
- Modify: `backend-crm-cloudrun/app.py`
- Test: Script de integração Python

**Interfaces:**
- Consumes: AI Gateway na VPS Oracle
- Produces: Endpoints autenticados no CRM: `/api/tts/generate`, `/api/tts/clone`, `/api/tts/health`

- [ ] **Step 1: Adicionar rotas de proxy no `app.py`**
  Implementar handlers com validação de token Supabase (`verify_user_token`) e repasse para a VPS via `urllib.request`.

- [ ] **Step 2: Testar sintaxe e compilação do Python**
  Executar: `python -m py_compile backend-crm-cloudrun/app.py`
  Verificar: Compilação com 0 erros.

---

### Task 4: Serviço Frontend e Rota no CRM

**Files:**
- Create: `A11_CRM/src/services/pocketTtsService.js`
- Modify: `A11_CRM/src/App.jsx`
- Modify: `A11_CRM/src/components/layout/Sidebar.jsx`

**Interfaces:**
- Consumes: `/api/tts/*`
- Produces: Rota `/audio-ia` no React Router e item de menu no Sidebar

- [ ] **Step 1: Criar `pocketTtsService.js`**
  Implementar métodos:
  - `generateAudio({ text, voice })`
  - `cloneVoiceAudio({ text, referenceAudioBlob })`
  - `checkTtsHealth()`

- [ ] **Step 2: Adicionar item de navegação no `Sidebar.jsx`**
  Na seção `Atendimento`, incluir:
  `{ id: 'audio_ia', path: '/audio-ia', label: 'Mensagens de Áudio (IA)', icon: Mic }`

- [ ] **Step 3: Adicionar rota `/audio-ia` no `App.jsx`**
  Renderizar o componente `AudioIAScreen` quando a rota estiver ativa.

---

### Task 5: Componente da Tela de Mensagens de Áudio IA (`AudioIAScreen.jsx`)

**Files:**
- Create: `A11_CRM/src/components/audio/AudioIAScreen.jsx`

**Interfaces:**
- Consumes: `pocketTtsService.js`, `useTheme`, `useBoard`
- Produces: Interface visual completa para o vendedor gerar áudios

- [ ] **Step 1: Implementar gravador de voz HTML5 nativo**
  Gravação via microfone (`navigator.mediaDevices.getUserMedia`), captura de Blob de áudio, temporizador e player de conferência da amostra.

- [ ] **Step 2: Implementar seleção de voz e modelos de texto rápidos**
  Toggle entre "Voz Padrão (Rafael - PT)" e "Minha Voz Clonada", pílulas de scripts comerciais rápidos e textarea de texto.

- [ ] **Step 3: Implementar player de áudio gerado e botão de download**
  Player com barra de progresso, botão play/pause, tempo decorrido e download do arquivo `.wav`.

- [ ] **Step 4: Executar build de produção do Vite**
  Executar: `npm run build` na pasta `A11_CRM`
  Verificar: 0 erros de compilação.

---

### Task 6: Atualização da Documentação (`A11_CRM/README.md`)

**Files:**
- Modify: `A11_CRM/README.md`

- [ ] **Step 1: Documentar o novo módulo "Mensagens de Áudio IA (Kyutai Pocket-TTS)"**
  Descrever arquitetura, modelo, vozes suportadas (foco exclusivo em PT e voz Rafael), clonagem de voz do vendedor e funcionamento da tela.

- [ ] **Step 2: Commit final de todas as alterações**
  Salvar e comitar no Git.
