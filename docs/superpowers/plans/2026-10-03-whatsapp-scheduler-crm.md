# Agendador Inteligente de WhatsApp no ConsorFlux Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o sistema nativo de agendamento de mensagens WhatsApp no ConsorFlux (`A11_CRM`), com seleção de leads da base, suporte a texto, áudio de IA (Pocket-TTS), áudio gravado e mídias, mecanismo antiban por simulação humana e worker autônomo na VPS Oracle.

**Architecture:** O vendedor cria e gerencia os agendamentos pela interface reativa do ConsorFlux (`AgendamentosScreen.jsx`), persistindo em `whatsapp_scheduled_messages` no Supabase. Um worker Node.js de baixo consumo (~30MB RAM) na VPS Oracle (`146.235.55.85`) verifica as mensagens vencidas a cada 30 segundos, simula presença humana (`composing`/`recording`) e realiza o disparo via Evolution API, atualizando o status e comentando na ficha do lead no CRM.

**Tech Stack:** React, Vite, Tailwind CSS, Lucide Icons, Supabase (PostgreSQL), Node.js, Evolution API, Pocket-TTS.

**Spec:** `docs/superpowers/specs/2026-10-03-whatsapp-scheduler-crm-design.md`

## Global Constraints
- Todas as modificações no frontend do CRM devem ocorrer estritamente na pasta `c:\PCALE-rede\crm-a11\EasyCRM\A11_CRM`.
- A compilação do Vite (`npm run build` em `A11_CRM`) deve concluir com 0 erros.
- A simulação de presença humana antiban (`composing` para texto/mídia e `recording` para áudio) deve estar habilitada por padrão em todos os disparos.
- O worker na VPS deve rodar com travamento atômico (`status = 'processing'`) para evitar disparos duplicados em caso de concorrência.
- O worker deve consumir menos de 50MB de RAM na VPS para não concorrer com os 1 GB totais da máquina Oracle.

## Review Focus
1. Agendamento com data/hora no passado deve ser bloqueado na validação do formulário.
2. Formatação internacional de telefone brasileiro (remover caracteres especiais e garantir DDI 55).
3. Queda ou timeout da Evolution API durante o envio não deve deixar o agendamento preso em `processing`.
4. Lead excluído ou renomeado no CRM não deve quebrar a renderização do card de agendamento.
5. Upload de mídias pesadas deve exibir estado de carregamento e tratar falha de conexão com o Supabase Storage.

---

### Task 1: Criação da Tabela `whatsapp_scheduled_messages` no Supabase

**Files:**
- Create: `A11_CRM/src/services/migrations/create_whatsapp_scheduled_messages.sql`
- Execute: Supabase MCP (`execute_sql`)

**Interfaces:**
- Produces: Tabela `public.whatsapp_scheduled_messages` com índices e políticas RLS prontas para consumo pelo frontend e worker.

- [ ] **Step 1: Criar o arquivo SQL de migração com estrutura de dados, índices e RLS**
  Salvar a DDL conforme definido na especificação técnica com campos para `id`, `user_id`, `lead_id`, `lead_name`, `lead_phone`, `scheduled_for`, `status`, `message_type`, `content_text`, `media_url`, `voice_reference`, `human_simulation`, `sent_at`, `error_message`.

- [ ] **Step 2: Executar a migração via ferramenta Supabase**
  Aplicar o script SQL no projeto `ygfitekotpgydiolcyry`.

- [ ] **Step 3: Verificar criação da tabela e colunas**
  Consultar a tabela via `list_tables` e confirmar status `rls_enabled: true` e todas as colunas criadas.

- [ ] **Step 4: Commit**
  ```bash
  git add A11_CRM/src/services/migrations/create_whatsapp_scheduled_messages.sql
  git commit -m "feat(database): add whatsapp_scheduled_messages table and rls"
  ```

---

### Task 2: Serviço de Agendamento no Frontend (`whatsappSchedulerService.js`)

**Files:**
- Create: `A11_CRM/src/services/whatsappSchedulerService.js`
- Test: `A11_CRM/src/services/__tests__/whatsappSchedulerService.test.js`

**Interfaces:**
- Consumes: `A11_CRM/src/services/supabaseClient.js`, `A11_CRM/src/services/evolutionApi.js`
- Produces: 
  - `createScheduledMessage(data)` -> `{ success, data, error }`
  - `fetchSchedules(userId, { startDate, endDate, status })` -> `Array<ScheduledMessage>`
  - `cancelSchedule(scheduleId)` -> `{ success }`
  - `deleteSchedule(scheduleId)` -> `{ success }`
  - `sendImmediately(scheduleId)` -> `{ success }`

- [ ] **Step 1: Escrever teste de unidade para validação de campos obrigatórios e formato de data**
  Validar que `createScheduledMessage` rejeita data anterior ao momento atual e exige nome/telefone válidos.

- [ ] **Step 2: Implementar `whatsappSchedulerService.js`**
  Implementar métodos para criar, buscar por período, cancelar, deletar e disparar antecipadamente.

- [ ] **Step 3: Executar testes e validar funcionamento**
  Validar funções sem erros de sintaxe ou referências inválidas.

- [ ] **Step 4: Commit**
  ```bash
  git add A11_CRM/src/services/whatsappSchedulerService.js
  git commit -m "feat(services): implement whatsappSchedulerService for ConsorFlux"
  ```

---

### Task 3: Modal de Criação Inteligente (`NovoAgendamentoModal.jsx`)

**Files:**
- Create: `A11_CRM/src/components/agendamentos/NovoAgendamentoModal.jsx`

**Interfaces:**
- Consumes: 
  - `useBoard()` para obter lista de leads do `boardData` e disparar notificações toast
  - `useAuth()` para obter ID do usuário logado
  - `whatsappSchedulerService.js`
  - `pocketTtsService.js` para sintetizar áudio IA com vozes (Rafael / Clonada)
- Produces:
  - Componente modal `<NovoAgendamentoModal isOpen onClose onCreated />`

- [ ] **Step 1: Implementar estrutura visual com abas de tipo de conteúdo (Texto, Áudio IA, Gravação, Mídia)**
  Construir as abas interativas com suporte ao tema escuro e claro (`useTheme`).

- [ ] **Step 2: Adicionar componente de busca e auto-complete de leads do pipeline**
  Campo com filtragem em tempo real sobre os leads do `boardData`. Ao clicar em um lead, preenche automaticamente Nome e Telefone sanitizado.

- [ ] **Step 3: Integrar sintetizador Pocket-TTS e gravador de microfone nativo**
  Adicionar botão de "Ouvir Prévia" do áudio de IA sintetizado e controle de gravação local com microfone.

- [ ] **Step 4: Conectar salvamento com `whatsappSchedulerService`**
  Ao submeter, validar inputs, realizar upload de mídia se aplicável e salvar registro no Supabase.

- [ ] **Step 5: Commit**
  ```bash
  git add A11_CRM/src/components/agendamentos/NovoAgendamentoModal.jsx
  git commit -m "feat(ui): add NovoAgendamentoModal with lead search and multi-media support"
  ```

---

### Task 4: Integração Completa na Tela de Agendamentos (`AgendamentosScreen.jsx`)

**Files:**
- Modify: `A11_CRM/src/components/agendamentos/AgendamentosScreen.jsx`

**Interfaces:**
- Consumes: `NovoAgendamentoModal.jsx`, `whatsappSchedulerService.js`
- Produces: Tela principal de agendamentos reativa com dados reais do Supabase e controle de mensagens do WhatsApp.

- [ ] **Step 1: Conectar busca de agendamentos reais do Supabase com recarregamento por mês**
  Substituir mock state por busca real no Supabase filtrada pelo período do mês atual em exibição.

- [ ] **Step 2: Adicionar badges visuais no calendário mensal**
  Exibir indicador verde com ícone do WhatsApp nos dias que possuem mensagens agendadas.

- [ ] **Step 3: Adicionar filtros por tipo e status na lista de compromissos**
  Permitir filtrar por `Todos`, `WhatsApp`, `Reuniões`, `Pendentes`, `Enviados`, `Falhas`.

- [ ] **Step 4: Adicionar ações rápidas nos cards (Disparar Agora, Cancelar, Excluir)**
  Implementar botões de ação direta em cada card com confirmação e feedback visual.

- [ ] **Step 5: Validar build de produção do Vite**
  Executar `npm run build` na pasta `A11_CRM` e confirmar 0 erros.

- [ ] **Step 6: Commit**
  ```bash
  git add A11_CRM/src/components/agendamentos/AgendamentosScreen.jsx
  git commit -m "feat(ui): integrate real Supabase WhatsApp scheduled messages in AgendamentosScreen"
  ```

---

### Task 5: Worker Autônomo na VPS Oracle (`consorflux_scheduler_worker.js`)

**Files:**
- Create: `A11_CRM/server/consorflux_scheduler_worker.js` (cópia versionada no projeto)
- Deploy VPS: `/home/ubuntu/consorflux_scheduler_worker.js` na VPS Oracle (`146.235.55.85`)
- Service: `/etc/systemd/system/consorflux-wa-scheduler.service`

**Interfaces:**
- Consumes: Tabela `whatsapp_scheduled_messages` no Supabase, Evolution API (`http://127.0.0.1:8080`), Pocket-TTS local (`http://127.0.0.1:8000`)
- Produces: Disparos automáticos a cada 30 segundos com simulação humana e comentários na timeline do lead no CRM.

- [ ] **Step 1: Desenvolver o script Node.js do worker com trava atômica e baixo consumo de RAM**
  Script com polling a cada 30s, update imediato para `processing`, simulação de presença humana (`composing`/`recording`), despacho na Evolution API e atualização para `sent` ou `failed`.

- [ ] **Step 2: Configurar o worker na VPS Oracle via SSH**
  Instalar dependências mínimas (`npm install @supabase/supabase-js dotenv`), testar execução direta do script e verificar consumo de memória (< 35 MB).

- [ ] **Step 3: Criar e ativar o serviço no Systemd**
  Configurar `/etc/systemd/system/consorflux-wa-scheduler.service` com `Restart=always` e iniciar com `systemctl enable --now consorflux-wa-scheduler`.

- [ ] **Step 4: Teste ponta a ponta (End-to-End)**
  Criar um agendamento de teste para 1 minuto no futuro pelo CRM, aguardar a execução autônoma do worker na VPS e verificar status `sent` e mensagem entregue.

- [ ] **Step 5: Commit**
  ```bash
  git add A11_CRM/server/consorflux_scheduler_worker.js
  git commit -m "feat(worker): add autonomous WhatsApp scheduler background service for Oracle VPS"
  ```
