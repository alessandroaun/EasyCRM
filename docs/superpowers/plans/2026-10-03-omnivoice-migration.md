# Migração para OmniVoice (Text-to-Speech & Clonagem com Tons de Voz) - Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o microsserviço de TTS da VPS pelo modelo OmniVoice (`k2-fsa/OmniVoice`), implementando novos endpoints com suporte a tons de voz comerciais, Voice Design e clonagem zero-shot, atualizando o frontend do CRM com seletores de estilo e feedback de progresso.

**Architecture:** O OmniVoice é instanciado em Python na VPS Oracle (`146.235.55.85`) sob FastAPI em ambiente dedicado (`omnivoice_env`), servindo endpoints na porta 8005 protegidos pelo AI Gateway (porta 8443). O frontend consome via proxy com timeout ampliado de 180s, enviando parâmetros de texto, tom/estilo e áudio de referência.

**Tech Stack:** Python 3.12, FastAPI, PyTorch (CPU aarch64), OmniVoice, SoundFile, FFmpeg, React 18, Vite, Tailwind CSS, Lucide Icons.

**Spec:** `docs/superpowers/specs/2026-10-03-omnivoice-migration-design.md`

## Global Constraints
- Manter o idioma focado em Português Brasileiro (PT-BR).
- Modelo OmniVoice carregado em CPU sem Whisper integrado (`load_asr=False`) para evitar contenção de CPU.
- Difusão configurada para `num_step=6` (balanceamento ideal entre fidelidade e tempo de resposta na CPU).
- Timeout de requisições ampliado para 180 segundos no Vite proxy e no frontend.
- Zero menções a nomes de modelos proprietários ou nomes pessoais na interface de usuário.

## Review Focus
- Requisições longas de 40 a 70 segundos não devem sofrer timeout no navegador ou no proxy Vite.
- O serviço deve retornar WAV PCM 24kHz válido compatível com o elemento `<audio>` HTML5.
- A voz clonada deve utilizar o prompt de clonagem sem travar a CPU por mais de 90 segundos.
- O seletor de tons deve mapear corretamente os 6 estilos para atributos válidos do `instruct`.
- O README.md do CRM deve documentar com precisão o novo motor OmniVoice e seus parâmetros.

---

### Task 1: Backend OmniVoice na VPS (`omnivoice_service.py` & Systemd)

**Files:**
- Create: `C:\PCALE-rede\crm-a11\EasyCRM\omnivoice_service.py`
- Modify: VPS `/home/ubuntu/omnivoice_service.py`, `/etc/systemd/system/pocket-tts.service`

**Interfaces:**
- Produz: `GET /health`, `POST /tts/generate`, `POST /tts/clone`
- Consome: `from omnivoice import OmniVoice, OmniVoiceGenerationConfig`

- [ ] **Step 1: Criar o script de serviço FastAPI `omnivoice_service.py`**
  - Implementar suporte a `load_asr=False`, `num_step=6`, `guidance_scale=2.0`.
  - Mapear dicionário de estilos de tom: `propaganda`, `feliz`, `surpresa`, `amigavel`, `corporativo`, `suave`.
  - Implementar `/tts/generate` com `instruct` dinâmico e `/tts/clone` com conversão de amostra FFmpeg.
- [ ] **Step 2: Transferir e configurar o serviço na VPS**
  - Enviar `omnivoice_service.py` para `/home/ubuntu/omnivoice_service.py`.
  - Atualizar o arquivo de serviço do systemd para executar `/home/ubuntu/omnivoice_env/bin/python /home/ubuntu/omnivoice_service.py`.
  - Recarregar systemd e reiniciar serviço: `sudo systemctl daemon-reload && sudo systemctl restart pocket-tts.service`.
- [ ] **Step 3: Testar e validar a saúde do serviço**
  - Executar: `curl -s http://127.0.0.1:8005/health` na VPS.
  - Verificar se retorna `{"status":"healthy","engine":"omnivoice",...}`.
- [ ] **Step 4: Executar teste de síntese via terminal na VPS**
  - Fazer chamada de teste para `/tts/generate` com texto em português e validar geração de áudio.

---

### Task 2: Configuração de Timeout no Proxy Vite

**Files:**
- Modify: `C:\PCALE-rede\crm-a11\EasyCRM\A11_CRM\vite.config.js`

- [ ] **Step 1: Verificar e ajustar o timeout do proxy `/api/tts` no `vite.config.js`**
  - Configurar `timeout: 180000` (180 segundos) no proxy `/api/tts` para acomodar a síntese neural em CPU sem desconexão antecipada.
- [ ] **Step 2: Validar sintaxe do `vite.config.js`**
  - Verificar se o Vite compila sem erros de sintaxe.

---

### Task 3: Atualização do Serviço de Áudio no Frontend (`pocketTtsService.js`)

**Files:**
- Modify: `C:\PCALE-rede\crm-a11\EasyCRM\A11_CRM\src\services\pocketTtsService.js`

- [ ] **Step 1: Adicionar suporte aos parâmetros `tone` e `gender` nos métodos `generateSpeech` e `cloneVoice`**
  - Atualizar payload de `generateSpeech({ text, tone, gender })`.
  - Atualizar payload multipart de `cloneVoice({ text, audioBlob, tone })`.
  - Aumentar timeout do `AbortController` (ou fetch) para 180 segundos.
- [ ] **Step 2: Validar tratamento de erros e extração limpa de mensagens**
  - Garantir que erros de timeout ou indisponibilidade apresentem mensagem amigável ao usuário.

---

### Task 4: Atualização da Tela de Áudio com Seletor de Tons (`AudioIAScreen.jsx`)

**Files:**
- Modify: `C:\PCALE-rede\crm-a11\EasyCRM\A11_CRM\src\components\audio\AudioIAScreen.jsx`

- [ ] **Step 1: Criar constantes e estados para Tons de Voz e Perfil**
  - Definir lista de estilos:
    - 📢 Comercial / Propaganda
    - 🎉 Empolgado / Otimista
    - 😲 Surpresa / Novidade
    - 🤝 Consultivo / Amigável
    - 💼 Executivo / Sério
    - 🤫 Suave / Exclusivo
  - Estado `selectedTone` (padrão: `propaganda`).
  - Estado `selectedGender` (padrão: `female`).
- [ ] **Step 2: Construir interface visual de seleção de estilo**
  - Renderizar grid de botões para os 6 estilos com ícones temáticos e descrição de tom.
  - No modo "Criar Voz por Texto", renderizar botões para alternar entre Voz Feminina e Voz Masculina.
- [ ] **Step 3: Aprimorar o indicador de carregamento durante a geração**
  - Exibir contador de segundos decorridos e aviso contextual sobre a geração de alta fidelidade.
- [ ] **Step 4: Integrar chamadas a `pocketTtsService` passando os novos parâmetros**
  - Passar `tone: selectedTone` e `gender: selectedGender`.

---

### Task 5: Validação Integrada e Atualização do README

**Files:**
- Test: Teste visual e funcional em `http://localhost:5173/audio-ia`
- Modify: `C:\PCALE-rede\crm-a11\EasyCRM\A11_CRM\README.md`

- [ ] **Step 1: Testar geração no modo de texto com tom Comercial / Propaganda**
  - Validar geração, reprodução no player e download do áudio WAV.
- [ ] **Step 2: Testar clonagem com amostra de voz gravada**
  - Validar processamento e reprodução de voz clonada com tom aplicado.
- [ ] **Step 3: Atualizar documentação técnica no `A11_CRM/README.md`**
  - Atualizar a Seção 11 com as especificações do motor OmniVoice, arquitetura de difusão e parâmetros de estilo.
