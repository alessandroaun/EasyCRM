# Gamificação e Placar de Líderes (ConsorFlux) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar um subsistema completo de Gamificação e Placar de Líderes no ConsorFlux, com pódio 3D, ranking por empresa e por equipe, motor de pontuação balanceado (vendas, usabilidade no CRM, IA e penalidades), extrato de pontos transparente e badges de conquista.

**Architecture:** O sistema adota um modelo híbrido com `gamificationService.js` calculando os indicadores a partir de `crm_boards` e do histórico comercial, persistindo auditorias em `gamificacao_eventos` no Supabase com RLS público de leitura e escrita restrita. A UI em `PlacarLideresScreen.jsx` renderiza um pódio 3D (Ouro, Prata e Bronze) para o Top 3, tabela para o Top 4+, ranking de equipes e modal de extrato transacional.

**Tech Stack:** React, Tailwind CSS, Lucide-React icons, Supabase PostgreSQL, Vite.

**Spec:** `docs/superpowers/specs/2026-10-15-gamificacao-placar-lideres-design.md`

## Global Constraints
- Visão do ranking pública para todos os perfis (`vendedor`, `supervisor`, `gerente`, `admin`).
- Exclusão do ranking ativo de vendedores com pontuação <= 0 ou sem produção.
- Padrão de cores elegante compatível com Light Mode e Dark Mode do ConsorFlux.
- Não quebrar rotas ou estados existentes do CRM.

## Review Focus
1. Vendedores sem cotas fechadas não devem invadir o pódio do Top 3.
2. Vendedor sem equipe atribuída não deve quebrar o filtro de "Minha Equipe".
3. Consultor com pontuação negativa após penalidades não deve ser exibido com posições no pódio de líderes.
4. Extrato de pontos deve separar visualmente ganhos (verde) e deduções (vermelho).
5. Seletor de período deve recalcular dinamicamente entre Mês Vigente, Mês Anterior e Ano.

---

### Task 1: Supabase Migration & Gamification Table Schema
**Files:**
- Create: `consorflux/src/services/migrations/create_gamificacao_tables.sql`
- Test: `scratch/test_gamificacao_db.py`

**Interfaces:**
- Produces: Tabela `public.gamificacao_eventos` com RLS habilitado (SELECT para authenticated e anon, escrita para admin/gerente).

- [ ] **Step 1: Criar script SQL de migração `create_gamificacao_tables.sql`**
- [ ] **Step 2: Aplicar DDL no Supabase via MCP `execute_sql` / `apply_migration`**
- [ ] **Step 3: Criar script de teste `test_gamificacao_db.py` para validar leitura e integridade de schema**
- [ ] **Step 4: Executar teste e validar retorno positivo**
- [ ] **Step 5: Commit inicial da migração**

---

### Task 2: Gamification Engine Service (`gamificationService.js`)
**Files:**
- Create: `consorflux/src/services/gamificationService.js`
- Test: `consorflux/src/services/__tests__/gamificationService.test.js`

**Interfaces:**
- Produces:
  - `calculateUserScore(userClients, period, userProfile, options)`: Retorna score, cotas, volume, ticketMedio, badges, extrato.
  - `getLeaderboard(allClients, usersList, period, filterTeam, currentUser)`: Retorna podium, restOfList, teamLeaderboard, myRank.
  - `logGamificationEvent(eventData)`: Persiste na tabela `gamificacao_eventos`.

- [ ] **Step 1: Escrever teste automatizado unitário `gamificationService.test.js` cobrindo regras de cotas, volume, ticket médio, IA e penalidades**
- [ ] **Step 2: Executar teste e verificar que falha (serviço inexistente)**
- [ ] **Step 3: Implementar `gamificationService.js` com toda a lógica da spec**
- [ ] **Step 4: Executar teste automatizado e verificar que passa com 100% de cobertura das fórmulas**
- [ ] **Step 5: Commit do serviço de gamificação**

---

### Task 3: Extrato de Pontos Modal (`ExtratoPontosModal.jsx`)
**Files:**
- Create: `consorflux/src/components/gamificacao/ExtratoPontosModal.jsx`

**Interfaces:**
- Consumes: `user`, `scoreData` do `gamificationService.js`.
- Produces: Modal com resumo visual de pontos, balanço de ganhos vs deduções, lista cronológica de transações e badges.

- [ ] **Step 1: Criar componente `ExtratoPontosModal.jsx` com suporte a tema claro e escuro**
- [ ] **Step 2: Adicionar badges visuais (Fechador Implacável, Lobo do Crédito, Aliado da IA, Guardião do CRM)**
- [ ] **Step 3: Adicionar lista com tags coloridas (+pts verde, -pts vermelho) e motivo**
- [ ] **Step 4: Validar montagem do componente**
- [ ] **Step 5: Commit do componente modal**

---

### Task 4: Placar de Líderes Screen & 3D Podium Component (`PlacarLideresScreen.jsx`)
**Files:**
- Create: `consorflux/src/components/gamificacao/PlacarLideresScreen.jsx`

**Interfaces:**
- Consumes: `useBoard`, `useAuth`, `useTheme`, `gamificationService`.
- Produces: Tela principal com Seletor de Período, Abas (Geral, Minha Equipe, Ranking Equipes), Pódio 3D dos Campeões, Tabela de Posições e Integração com Extrato.

- [ ] **Step 1: Criar estrutura base de `PlacarLideresScreen.jsx` com seletor de períodos (Mês Vigente, Mês Anterior, Ano)**
- [ ] **Step 2: Construir o Pódio 3D estilizado com ouro, prata e bronze, avatares reais e coroas**
- [ ] **Step 3: Construir a lista de posições da 4ª colocação em diante com cards modernos**
- [ ] **Step 4: Construir a aba de Ranking de Equipes com agregação de cotas e pontuação média**
- [ ] **Step 5: Conectar o modal de Extrato de Pontos ao clique do usuário**
- [ ] **Step 6: Commit da tela de gamificação**

---

### Task 5: Integração no Sidebar e Rotas da Aplicação
**Files:**
- Modify: `consorflux/src/components/layout/Sidebar.jsx`
- Modify: `consorflux/src/App.jsx`

**Interfaces:**
- Consumes: `<PlacarLideresScreen />`.
- Produces: Rota `/placar` acessível para todos os perfis com link na barra lateral.

- [ ] **Step 1: Adicionar item "Placar de Líderes" (ícone Trophy) no menu de navegação em `Sidebar.jsx`**
- [ ] **Step 2: Registrar mapeamento `placar: '/placar'` e rota em `App.jsx`**
- [ ] **Step 3: Testar transição de rotas e abertura limpa da tela**
- [ ] **Step 4: Commit das integrações de rota**

---

### Task 6: Atualização de Documentação, Build, Verificação e Deploy Final
**Files:**
- Modify: `task.md`
- Modify: `walkthrough.md`
- Create: `docs/superpowers/plans/2026-10-15-gamificacao-placar-lideres.md`

- [ ] **Step 1: Executar `npm run build` e validar compilação sem erros**
- [ ] **Step 2: Atualizar documentação e walkthrough do sistema**
- [ ] **Step 3: Realizar Git Commit e Git Push para a branch `main`**
- [ ] **Step 4: Executar deploy no Cloudflare Pages (`consorflux-app`)**
- [ ] **Step 5: Apresentar validação final e links de produção ao usuário**
