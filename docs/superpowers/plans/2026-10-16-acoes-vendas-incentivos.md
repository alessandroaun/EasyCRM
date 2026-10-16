# Ação de Vendas (Metas Relâmpago com Bonificação) & Menu Lateral Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o subsistema de Ação de Vendas com atribuição de metas pontuais (cotas ou crédito), bonificação, prazo futuro estrito, histórico das últimas 50 ações, indicativo mensal com reset automático, notificações push Firebase e verificação automatizada de cumprimento com aviso exclusivo ao gestor, além de realocar o Buscar Leads para a seção de Vendas no menu lateral.

**Architecture:** Modelar tabela `crm_acoes_vendas` no Supabase com RLS; criar endpoints de notificação Web Push no Cloud Run (`/api/acoes-vendas/notificar-criacao` e `/api/acoes-vendas/notificar-cumprimento`); desenvolver o modal e indicativos em `AdminPanel.jsx`; integrar card de aceite na Central de Notificações (`NotificationModal.jsx`); e integrar o motor de verificação automática de produção em `BoardContext.jsx` para disparar a notificação ao gestor criador assim que a meta for batida.

**Tech Stack:** React 19, Tailwind CSS, Lucide React, Supabase PostgreSQL, Python Flask (Google Cloud Run), Firebase Admin SDK (Cloud Messaging), Cloudflare Pages.

**Spec:** `docs/superpowers/specs/2026-10-16-acoes-vendas-incentivos-design.md`

## Global Constraints
- Nenhuma data/hora passada pode ser aceita no formulário de data limite; deve exibir feedback visual vermelho e bloquear o salvamento.
- Supervisor só pode visualizar histórico das ações direcionadas a colaboradores da sua equipe; Gerente e Admin visualizam histórico geral.
- A notificação de cumprimento de meta deve ser direcionada **estritamente e exclusivamente ao gestor criador** daquela meta.
- O indicativo visual na lista de membros deve exibir status das metas do mês corrente e resetar mês a mês.
- BuscarLeads deve ser removido de "Principal" e adicionado em "Vendas" em `Sidebar.jsx`.

## Review Focus
- Tentativa de selecionar ou digitar data/hora no passado no seletor de prazo: deve exibir borda vermelha e impedir o envio.
- Gestor não autenticado ou supervisor tentando ver ações de outra equipe no histórico: deve filtrar estritamente por equipe.
- Venda fechada com valor em crédito ou cotas múltiplos no mesmo lead: o cálculo de progresso deve somar corretamente contratos e créditos sem duplicar.
- Notificação push para aparelho físico: deve usar `collapse_key` e `tag` para evitar notificações redundantes e direcionar apenas aos destinatários pretendidos.
- Virada de mês: metas de meses anteriores não devem poluir o indicativo ativo da linha de membros no `AdminPanel.jsx`.

---

### Task 1: Reorganização do Menu Lateral (`Sidebar.jsx`)

**Files:**
- Modify: `consorflux/src/components/layout/Sidebar.jsx:190-220`

**Interfaces:**
- Consumes: `Compass` icon, rotas `/prospeccao`
- Produces: Menu lateral com `Buscar Leads` alocado na seção `Vendas`

- [ ] **Step 1: Mover o item `prospeccao` da seção `Principal` para `Vendas` em `Sidebar.jsx`**
  - Remover `prospeccao` do array de `Principal`.
  - Inserir `prospeccao` no array de `Vendas` com `id: 'prospeccao'`, `path: '/prospeccao'`, `label: 'Buscar Leads'`, `icon: Compass`.

- [ ] **Step 2: Verificar navegação e renderização**
  - Executar verificação estática do código no console do Vite.

- [ ] **Step 3: Commit da Task 1**
  ```bash
  git add consorflux/src/components/layout/Sidebar.jsx
  git commit -m "refactor(sidebar): mover Buscar Leads para a secao de Vendas"
  ```

---

### Task 2: Modelo de Dados no Supabase (`crm_acoes_vendas`)

**Files:**
- Create: `consorflux/scripts/create_acoes_vendas_table.js`

**Interfaces:**
- Produces: Tabela `public.crm_acoes_vendas` com índices e permissões no Supabase

- [ ] **Step 1: Criar script de criação e migração da tabela `crm_acoes_vendas`**
  - Executar DDL via Supabase Service Role:
    - Colunas: `id`, `creator_id`, `target_user_id`, `tipo_meta`, `valor_meta`, `bonificacao`, `data_limite`, `status`, `progresso_atual`, `created_at`, `cumprido_em`, `aceito`, `aceito_em`, `notificado_cumprimento`.
    - Índices por `target_user_id`, `status` e `created_at`.

- [ ] **Step 2: Executar o script contra o banco Supabase**
  - Run: `node consorflux/scripts/create_acoes_vendas_table.js`
  - Expected: Sucesso com confirmação de tabela criada e acessível.

- [ ] **Step 3: Commit da Task 2**
  ```bash
  git add consorflux/scripts/create_acoes_vendas_table.js
  git commit -m "feat(db): criar tabela crm_acoes_vendas no Supabase"
  ```

---

### Task 3: Endpoints de Notificação Web Push no Cloud Run (`app.py`)

**Files:**
- Create: `backend-crm-cloudrun/tests/test_acoes_vendas_notification.py`
- Modify: `backend-crm-cloudrun/app.py:110-130,550-650`

**Interfaces:**
- Produces: `POST /api/acoes-vendas/notificar-criacao` e `POST /api/acoes-vendas/notificar-cumprimento`

- [ ] **Step 1: Escrever testes unitários em `test_acoes_vendas_notification.py`**
  - Testar validações de payload para criação de meta (campos obrigatórios, tipo de meta válido, data limite válida).
  - Testar validações de cumprimento de meta e direcionamento exclusivo ao `creator_id`.

- [ ] **Step 2: Executar teste para verificar falha inicial**
  - Run: `pytest backend-crm-cloudrun/tests/test_acoes_vendas_notification.py -v`
  - Expected: FAIL com 404 Not Found.

- [ ] **Step 3: Implementar endpoints em `backend-crm-cloudrun/app.py`**
  - Adicionar as duas rotas ao bypass de autenticação pública com verificação de payload e envio de push multicast Firebase via `messaging.send_each_for_multicast`.

- [ ] **Step 4: Executar testes unitários**
  - Run: `pytest backend-crm-cloudrun/tests/test_acoes_vendas_notification.py -v`
  - Expected: PASS

- [ ] **Step 5: Commit da Task 3**
  ```bash
  git add backend-crm-cloudrun/app.py backend-crm-cloudrun/tests/test_acoes_vendas_notification.py
  git commit -m "feat(api): adicionar endpoints de notificacao push para acoes de vendas"
  ```

---

### Task 4: Interface de Ação de Vendas em `AdminPanel.jsx` (Botão, Modal, Histórico, Badge)

**Files:**
- Create: `consorflux/src/components/admin/AcaoVendaModal.jsx`
- Modify: `consorflux/src/components/admin/AdminPanel.jsx:500-665`

**Interfaces:**
- Consumes: `crm_acoes_vendas` do Supabase, `usersList`, `userProfile`, `user`
- Produces: Botão amarelo de ação, modal com validação futura estrita de data/hora, lista das 50 últimas ações e badge mensal na linha do colaborador

- [ ] **Step 1: Criar o componente `AcaoVendaModal.jsx`**
  - Seleção de Meta: `Quantidade de Cotas` (inteiro) vs `Valor em Crédito` (R$ monetário formatado).
  - Campo `Bonificação` (texto descritivo do prêmio).
  - Campo `Até qual dia e hora` (`datetime-local`) com validação estrita:
    - Se a data/hora selecionada for anterior a `new Date()`, destaca campo com borda vermelha, mensagem de erro e desabilita o botão de salvar.
  - Tabela com histórico das últimas 50 ações de vendas:
    - Filtro RBAC: se for Supervisor, filtra apenas colaboradores da sua equipe; se for Gerente/Admin, exibe histórico geral.
    - Badges de status: `Pendente` (amarelo), `Cumprido` (verde), `Expirado` (cinza).
  - Ao salvar: insere em `crm_acoes_vendas`, chama API de push do Cloud Run, fecha modal e atualiza lista.

- [ ] **Step 2: Integrar o botão amarelo e o badge mensal na tabela de membros em `AdminPanel.jsx`**
  - Adicionar botão amarelo na coluna de ações: `<button className="px-2.5 py-1 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold ..."><Zap size={13} /> Ação de Vendas</button>`.
  - Exibir badge discreto na linha do membro:
    - Se houver meta ativa no mês corrente: `⚡ Meta Ativa: [Meta] ([Bonificação])`.
    - Se houver meta cumprida no mês: `🏆 Meta Batida: [Meta] ([Bonificação])`.
    - Reset mensal: só exibe ações cuja data de criação esteja no mês atual.

- [ ] **Step 3: Testar comportamento visual e validações**
  - Verificar abertura do modal, alternância cotas/crédito, bloqueio para data passada e salvamento.

- [ ] **Step 4: Commit da Task 4**
  ```bash
  git add consorflux/src/components/admin/AcaoVendaModal.jsx consorflux/src/components/admin/AdminPanel.jsx
  git commit -m "feat(admin): adicionar botao amarelo, modal de acao de vendas e badge mensal na equipe"
  ```

---

### Task 5: Central de Notificações (`NotificationModal.jsx`)

**Files:**
- Modify: `consorflux/src/components/common/NotificationModal.jsx`

**Interfaces:**
- Consumes: Ações ativas de `crm_acoes_vendas`
- Produces: Card de desafio para o vendedor com botão "Aceitar Desafio" e card de vitória para o gestor com botão de confirmação

- [ ] **Step 1: Carregar ações de vendas ativas atribuídas ao usuário logado em `NotificationModal.jsx`**
  - Buscar ações pendentes onde `target_user_id === user.id` e `now() <= data_limite`.
  - Renderizar card dourado com meta, bonificação, prazo limite e botão `Aceitar Desafio` (que atualiza `aceito = true`).

- [ ] **Step 2: Carregar ações cumpridas onde o usuário logado é o `creator_id`**
  - Buscar ações com `status === 'cumprido'` onde `creator_id === user.id`.
  - Renderizar card comemorativo esmeralda: `🎉 Meta Batida por [Vendedor]! Bonificação a liberar: [Bonificação]`.

- [ ] **Step 3: Commit da Task 5**
  ```bash
  git add consorflux/src/components/common/NotificationModal.jsx
  git commit -m "feat(notifications): adicionar cards de acao de vendas e de meta batida"
  ```

---

### Task 6: Motor de Cumprimento Automático no CRM (`acoesVendasService.js` & `BoardContext.jsx`)

**Files:**
- Create: `consorflux/src/services/acoesVendasService.js`
- Modify: `consorflux/src/context/BoardContext.jsx:640-690`

**Interfaces:**
- Consumes: Eventos de fechamento de lead (`isClosedPhase`, `moveClient`, `saveBoard`)
- Produces: Atualização automática de meta para `cumprido` e disparo de push ao gestor criador

- [ ] **Step 1: Criar o módulo `acoesVendasService.js`**
  - Função `avaliarMetasVendedor(sellerUserId, allSellerClosedLeads)`:
    - Busca metas ativas (`status = 'pendente'`, `data_limite >= now()`) para `sellerUserId`.
    - Filtra leads com `dealClosed = true` cuja `dealClosedDate` esteja entre `acao.created_at` e `acao.data_limite`.
    - Calcula cotas totais (`leads.length` ou soma de `contracts`) e crédito total.
    - Se a meta for batida:
      - Atualiza `status = 'cumprido'`, `cumprido_em = new Date().toISOString()`.
      - Dispara push no backend para o `creator_id` via `fetch('/api/acoes-vendas/notificar-cumprimento')`.

- [ ] **Step 2: Conectar o serviço ao pipeline de fechamento de vendas em `BoardContext.jsx`**
  - No método `moveClient` (ao mover para coluna fechada) ou após `saveBoard`, chamar `acoesVendasService.avaliarMetasVendedor`.

- [ ] **Step 3: Commit da Task 6**
  ```bash
  git add consorflux/src/services/acoesVendasService.js consorflux/src/context/BoardContext.jsx
  git commit -m "feat(crm): motor de verificacao automatica de metas batidas e notificacao ao gestor"
  ```

---

### Task 7: Build, Testes End-to-End, Deploy no Cloudflare Pages & Documentação

**Files:**
- Modify: `walkthrough.md`
- Modify: `task.md`

- [ ] **Step 1: Executar build de produção do frontend**
  - Run: `npm run build` em `consorflux`
  - Expected: Exit code 0 sem avisos impeditivos.

- [ ] **Step 2: Commit e push nos repositórios Git**
  - Git push em `consorflux` e no repositório raiz `EasyCRM`.

- [ ] **Step 3: Deploy no Cloudflare Pages**
  - Run: `npx wrangler pages deploy dist --project-name consorflux-app --commit-dirty=true`

- [ ] **Step 4: Atualizar `task.md` e `walkthrough.md`**
  - Documentar o novo subsistema de Ações de Vendas com captura de tela e guias de uso.
