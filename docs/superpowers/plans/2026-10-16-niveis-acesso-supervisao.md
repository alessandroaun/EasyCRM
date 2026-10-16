# Níveis de Acesso, Supervisão Hierárquica e Ações em Massa Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o modelo hierárquico completo de níveis de acesso (Admin, Gerente, Supervisor, Vendedor) no ConsorFlux CRM, incluindo atribuição "Sem Equipe" para líderes, visão consolidada "Todos" no Navbar e Kanban com selo do vendedor nos cards, ações em massa de exclusão e transferência para a fase "Novo Cliente" com push Firebase, métricas agregadas em Visão Geral e modo auditoria somente leitura nas telas de WhatsApp, Disparos e Agendamentos.

**Architecture:** Abordagem Híbrida: O `BoardContext` gerencia a agregação de boards dos vendedores em memória sob demanda (`.in('user_id', scopeUserIds)`), enquanto a transferência atômica preserva 100% dos dados históricos do cliente, adiciona nota de auditoria e aciona o Cloud Run para notificação Web Push via Firebase Admin SDK. As telas de comunicação recebem trava de somente leitura quando um gestor consulta outro vendedor.

**Tech Stack:** React 19, Vite, Tailwind CSS, Supabase PostgreSQL, Firebase Admin SDK (Cloud Run Python), Cloudflare Pages.

**Spec:** `docs/superpowers/specs/2026-10-16-niveis-acesso-supervisao-design.md`

## Global Constraints
* Administradores e Gerentes pertencem estritamente a `"Sem Equipe"`.
* Supervisores são fixos em sua própria equipe e só visualizam vendedores subordinados.
* Leads transferidos são sempre inseridos na fase `"Novo Cliente"` (`phase_1`) do vendedor de destino com 100% dos dados anteriores e nota de transferência anexada.
* O vendedor que recebe leads transferidos deve receber notificação Web Push imediata via Firebase.
* As telas de WhatsApp, Disparos em Massa e Agendamentos desativam a opção "Todos" e aplicam modo somente leitura ao inspecionar outro vendedor.

## Review Focus
1. **Concorrência ao transferir múltiplos leads:** Garantir que se 2 gestores transferirem leads simultaneamente, nenhum lead seja perdido ou duplicado entre boards.
2. **Fallback quando "Todos" estiver ativo:** Ao navegar para WhatsApp, Disparos ou Agendamentos, o sistema deve cair de forma transparente na conta do próprio usuário sem erros de renderização.
3. **Preservação de notas e dados nos cards transferidos:** Nenhum comentário, tag, CPF, áudio ou valor cadastrado pode ser descartado na transferência.
4. **Isolamento de equipe do Supervisor:** Um supervisor jamais pode conseguir ver ou selecionar vendedores de equipes alheias no Topbar ou no modal de transferência.
5. **Colapso de Notificações Push:** O push de transferência deve utilizar tag determinística para colapsar no celular do vendedor caso receba várias transferências consecutivas.

---

### Task 1: Gestão de Equipes & Níveis de Acesso ("Sem Equipe")

**Files:**
- Modify: `consorflux/src/components/admin/AdminPanel.jsx`
- Modify: `backend-crm-cloudrun/supabase-admin-rpc-hardening.sql`

**Interfaces:**
- Consumes: `usersList`, `allTeams`
- Produces: Usuários Administradores e Gerentes salvos estritamente com `team = 'Sem Equipe'`, exibição da tag na tabela e opções no modal de criação.

- [ ] **Step 1: Atualizar lista de equipes e validação de "Sem Equipe" em `AdminPanel.jsx`**
  - Adicionar `'Sem Equipe'` na lista de equipes padrão.
  - No formulário de criação de colaborador (`AddUserModal`), travar `newUserTeam = 'Sem Equipe'` automaticamente se o cargo for `admin`, `administrador` ou `gerente`.
  - Desabilitar o select de equipe quando o cargo selecionado for Admin ou Gerente.
  - No `handleUpdateRole` e `handleUpdateTeam`, impedir que Administradores ou Gerentes recebam equipe comercial comum.
- [ ] **Step 2: Verificar renderização e comportamento do modal de adição**
  - Testar seleção de cargo no modal: ao escolher Gerente, a equipe deve mudar para "Sem Equipe" e ficar desabilitada.
- [ ] **Step 3: Commit**
  ```bash
  git add consorflux/src/components/admin/AdminPanel.jsx
  git commit -m "feat(admin): adicionar opcao Sem Equipe e travar vinculo para gerentes e admins"
  ```

---

### Task 2: Filtros Inteligentes no Navbar Superior (`HierarchyFilterSelectors.jsx`)

**Files:**
- Modify: `consorflux/src/components/layout/HierarchyFilterSelectors.jsx`
- Modify: `consorflux/src/context/BoardContext.jsx`

**Interfaces:**
- Consumes: `userProfile`, `user`, `usersList`, `selectedTeamFilter`, `currentBoardUserId`
- Produces: Estado `currentBoardUserId` podendo assumir `null` (minha carteira), `'ALL'` (todos os vendedores do escopo) ou `uuid` do vendedor/supervisor específico.

- [ ] **Step 1: Atualizar opções do seletor de equipes em `HierarchyFilterSelectors.jsx`**
  - Incluir opção `'SEM_EQUIPE'` (`"Sem Equipe"`) no dropdown para Admin e Gerente.
  - Para Supervisor: garantir que o card fixo exiba o nome da sua equipe supervisionada (`userProfile?.team || 'Equipe Principal'`).
- [ ] **Step 2: Adicionar opção "Todos" e listar supervisores no seletor de membros**
  - Adicionar `<option value="ALL">👥 Todos os Vendedores</option>` logo após `⭐ Minha Carteira`.
  - Permitir que supervisores também apareçam na lista de seleção para consulta de suas próprias carteiras.
  - Filtrar estritamente para o supervisor apenas usuários com `team === myTeam` e `role in ('vendedor', 'supervisor')`.
- [ ] **Step 3: Testar comportamento dos seletores no desktop e mobile**
  - Alternar entre "Minha Carteira", "Todos" e vendedores específicos verificando o valor emitido.
- [ ] **Step 4: Commit**
  ```bash
  git add consorflux/src/components/layout/HierarchyFilterSelectors.jsx
  git commit -m "feat(layout): adicionar opcao Todos e suporte a Sem Equipe no Topbar"
  ```

---

### Task 3: Backend Cloud Run - Rota de Notificação Push de Transferência

**Files:**
- Modify: `backend-crm-cloudrun/app.py`
- Test: `backend-crm-cloudrun/tests/test_transfer_notification.py`

**Interfaces:**
- Consumes: `POST /api/leads/notificar-transferencia` com `{ target_user_id, lead_count, sender_name }`
- Produces: Notificação Web Push disparada para os aparelhos do vendedor com deep link `/?open_lead_board=true`.

- [ ] **Step 1: Escrever teste unitário para a nova rota**
  - Criar `backend-crm-cloudrun/tests/test_transfer_notification.py` validando payload, busca de tokens no Supabase e resposta `{ success: true, delivered: N }`.
- [ ] **Step 2: Implementar endpoint no `app.py`**
  - Registrar rota pública autenticada `/api/leads/notificar-transferencia`.
  - Buscar tokens em `public.user_push_tokens` para `target_user_id`.
  - Montar mensagem com título `"🎯 Novos Leads Transferidos"`, corpo formatado com pluralização adequada e tag de agrupamento `"transfer_<target_user_id>"`.
- [ ] **Step 3: Executar testes unitários**
  ```bash
  python -m pytest backend-crm-cloudrun/tests/test_transfer_notification.py -v
  ```
- [ ] **Step 4: Commit**
  ```bash
  git add backend-crm-cloudrun/app.py backend-crm-cloudrun/tests/test_transfer_notification.py
  git commit -m "feat(backend): adicionar rota de notificacao push para transferencia de leads"
  ```

---

### Task 4: Agregação de Boards e Identificação de Vendedor no Kanban

**Files:**
- Modify: `consorflux/src/context/BoardContext.jsx`
- Modify: `consorflux/src/components/kanban/ClientCard.jsx`
- Modify: `consorflux/src/components/kanban/KanbanBoard.jsx`

**Interfaces:**
- Consumes: `currentBoardUserId === 'ALL'`, `selectedTeamFilter`, `usersList`
- Produces: `boardData` contendo cards combinados com `client.responsibleUserName` e `client.responsibleUserId`.

- [ ] **Step 1: Implementar busca e unificação de múltiplos boards em `BoardContext.jsx`**
  - Quando `currentBoardUserId === 'ALL'`, determinar os `targetUserIds` com base na hierarquia:
    - Se Supervisor: todos os vendedores com `team === myTeam`.
    - Se Gerente/Admin com `selectedTeamFilter !== 'ALL'`: todos os vendedores com `team === selectedTeamFilter`.
    - Se Gerente/Admin com `selectedTeamFilter === 'ALL'`: todos os vendedores e supervisores da empresa.
  - Buscar os boards em `crm_boards` com `.in('user_id', targetUserIds)`.
  - Mesclar as fases padrão (`phase_1` a `phase_7`), etiquetando cada card com `responsibleUserId` e `responsibleUserName`.
- [ ] **Step 2: Renderizar badge do vendedor em `ClientCard.jsx`**
  - Extrair o primeiro nome de `client.responsibleUserName || client.sellerName`.
  - Exibir badge sutil `<span className="...">👤 {primeiroNome}</span>` no cabeçalho do card quando disponível.
- [ ] **Step 3: Testar visualização consolidada no Kanban**
  - Verificar se ao selecionar "Todos", os cards de múltiplos vendedores aparecem juntos com seus respectivos nomes.
- [ ] **Step 4: Commit**
  ```bash
  git add consorflux/src/context/BoardContext.jsx consorflux/src/components/kanban/ClientCard.jsx
  git commit -m "feat(kanban): unificar boards no modo Todos e exibir nome do vendedor nos cards"
  ```

---

### Task 5: Ações em Massa no Kanban - Exclusão e Transferência com Push

**Files:**
- Modify: `consorflux/src/components/kanban/KanbanBoard.jsx`
- Modify: `consorflux/src/context/BoardContext.jsx`

**Interfaces:**
- Consumes: `selectedLeadIds`, `usersList`, `BACKEND_URL/api/leads/notificar-transferencia`
- Produces: Funções `handleBulkDelete` (mover para lixeira) e `handleBulkTransfer` (mover para Novo Cliente do destinatário + push).

- [ ] **Step 1: Atualizar barra de Ações em Massa com novos botões e menus**
  - Adicionar botão/dropdown de seleção de ação em massa:
    - "Mover de Fase"
    - "Excluir Selecionados (Lixeira)"
    - "Transferir para Vendedor"
- [ ] **Step 2: Implementar Modal de Confirmação para Exclusão em Massa**
  - Exibir contagem de cards selecionados.
  - Ao confirmar, remover das fases ativas e enviar para o array `trash` dos respectivos boards.
- [ ] **Step 3: Implementar Modal de Transferência em Massa para Vendedores**
  - Para Supervisor: dropdown com os vendedores da sua equipe (Primeiro e Segundo Nome).
  - Para Gerente/Admin: seletor de Equipe + seletor de Vendedor filtrado.
  - Alerta explicativo de que os leads irão para a coluna "Novo Cliente" mantendo todo o histórico.
- [ ] **Step 4: Executar transferência atômica e disparar push**
  - Adicionar nota automática em cada lead:
    `"📌 Transferência de Carteira: Lead transferido de [Origem] para [Destino] em [Data/Hora] por [Gestor]."`
  - Inserir na `phase_1` do board do vendedor de destino.
  - Fazer chamada `fetch('${BACKEND_URL}/api/leads/notificar-transferencia')`.
  - Exibir Toast de sucesso e limpar seleções.
- [ ] **Step 5: Testar fluxo completo de exclusão e transferência**
  - Testar transferência de 2 cards e verificar chegada no board de destino e persistência das notas.
- [ ] **Step 6: Commit**
  ```bash
  git add consorflux/src/components/kanban/KanbanBoard.jsx consorflux/src/context/BoardContext.jsx
  git commit -m "feat(kanban): implementar exclusao em massa e transferencia com push Firebase"
  ```

---

### Task 6: Visão Geral e Minha Central com Suporte a "Todos"

**Files:**
- Modify: `consorflux/src/components/dashboard/InformacoesGerais.jsx`
- Modify: `consorflux/src/components/dashboard/MinhaCentral.jsx`

**Interfaces:**
- Consumes: `currentBoardUserId === 'ALL'`, `boardData`
- Produces: Métricas agregadas (Soma de volume fechado, média de ticket, média de conversão e média de perda).

- [ ] **Step 1: Ajustar cálculos de métricas em `InformacoesGerais.jsx`**
  - Volume Total Fechado: SOMA dos valores de negócios em `phase_7` (Fechados).
  - Ticket Médio: Divisão do volume total fechado pela contagem de fechamentos.
  - Taxa de Conversão e Taxa de Perda: Médias aritméticas calculadas com precisão.
- [ ] **Step 2: Ajustar visualização em `MinhaCentral.jsx`**
  - Tratar modo "Todos" para exibir a visão agregada das atividades e metas da equipe.
- [ ] **Step 3: Commit**
  ```bash
  git add consorflux/src/components/dashboard/InformacoesGerais.jsx consorflux/src/components/dashboard/MinhaCentral.jsx
  git commit -m "feat(dashboard): agregar metricas de equipe no modo Todos em Visao Geral"
  ```

---

### Task 7: Modo Auditoria Ético (Somente Leitura) em WhatsApp, Disparos e Agendamentos

**Files:**
- Modify: `consorflux/src/components/chat/ConversasChat.jsx`
- Modify: `consorflux/src/components/disparos/DisparosScreen.jsx`
- Modify: `consorflux/src/components/agendamentos/AgendamentosScreen.jsx`
- Modify: `consorflux/src/App.jsx`

**Interfaces:**
- Consumes: `currentBoardUserId`, `user.id`, `userProfile.role`
- Produces: Bloqueio estrito de escrita/envio de mensagens e disparos ao auditar outro vendedor; desativação de "Todos" nestas telas.

- [ ] **Step 1: Desativar "Todos" nas 3 telas de comunicação e agenda**
  - Se `currentBoardUserId === 'ALL'` ao navegar para WhatsApp, Disparos ou Agendamentos, redefinir para `null` (própria conta do gestor).
- [ ] **Step 2: Implementar modo somente leitura em `ConversasChat.jsx`**
  - Detectar quando `currentBoardUserId && currentBoardUserId !== user.id`.
  - Carregar conversas e mensagens vinculadas ao `currentBoardUserId`.
  - Exibir banner de auditoria no topo do chat:
    `"👀 Modo de Supervisão (Somente Leitura): Você está visualizando o histórico de mensagens de [Nome]. O envio de respostas e interações é restrito à conta do colaborador."`
  - Ocultar/desabilitar barra de digitação, microfone de áudio, botões de anexo e ações interativas de envio.
- [ ] **Step 3: Implementar modo somente leitura em `DisparosScreen.jsx`**
  - Travar abas de criação de novo disparo ou importação em lote; permitir apenas consulta à aba Histórico de Disparos.
- [ ] **Step 4: Implementar modo somente leitura em `AgendamentosScreen.jsx`**
  - Ocultar botões de novo agendamento, edição ou cancelamento ao consultar outro vendedor.
- [ ] **Step 5: Testar restrições e auditoria em todas as 3 telas**
  - Entrar como gestor, selecionar um vendedor e verificar que as telas abrem normalmente em modo de consulta com envio bloqueado.
- [ ] **Step 6: Commit**
  ```bash
  git add consorflux/src/components/chat/ConversasChat.jsx consorflux/src/components/agendamentos/AgendamentosScreen.jsx consorflux/src/App.jsx
  git commit -m "feat(security): implementar modo auditoria somente leitura para gestores no WhatsApp e rotinas"
  ```

---

### Task 8: Build, Testes End-to-End, Deploy & Documentação

**Files:**
- Modify: `walkthrough.md`
- Output: `consorflux/dist/`

- [ ] **Step 1: Executar build de produção do frontend**
  ```bash
  npm run build --prefix consorflux
  ```
- [ ] **Step 2: Deploy no Cloudflare Pages (`consorflux-app`)**
  ```bash
  npx wrangler pages deploy consorflux/dist --project-name consorflux-app --commit-dirty=true
  ```
- [ ] **Step 3: Atualizar documentação completa em `walkthrough.md`**
  - Documentar regras de acesso, "Sem Equipe", modo "Todos", transferência em massa com push e modo auditoria.
- [ ] **Step 4: Commit e push final no repositório**
  ```bash
  git add . && git commit -m "docs: atualizar walkthrough com niveis de acesso e supervisao hierarquica" && git push origin main
  ```
