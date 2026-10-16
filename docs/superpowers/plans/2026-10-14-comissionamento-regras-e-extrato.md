# Plano de Implementação: Sistema Enterprise de Regras e Extrato de Comissionamento

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar o sistema de comissionamento do ConsorFlux em um motor enterprise configurável por gestores com regras por tabela comercial, calendário anual e uma nova tela de comissionamento em 3 abas (Extrato Real, Previsão Futura e Simulação com Agente de IA).

**Architecture:** Modelagem relacional no Supabase (`regras_comissionamento` e `calendario_comissionamento`) consumida pelo frontend através de um serviço unificado `commissionService.js`. O pós-venda em `ClientDetailsModal.jsx` alimenta os contratos com a tabela utilizada e flag de adesão contratual, e a tela `ComissaoScreen.jsx` renderiza 3 abas com isolamento ético e estrito de perfis (Vendedor, Supervisor e Gerente).

**Tech Stack:** React 19, Vite, Tailwind CSS v4, Lucide React, Supabase JS Client, PostgreSQL / RLS.

**Spec:** `docs/superpowers/specs/2026-10-14-comissionamento-regras-e-extrato-design.md`

## Global Constraints

- Vendedor vê estritamente suas próprias comissões (vendas diretas).
- Supervisor vê seu extrato consolidado de equipe (override), sem devassar extratos individuais de vendedores e com vendas diretas desativadas por padrão.
- Gerente e Administrador possuem filtros de auditoria global e acesso exclusivo à aba de configuração de regras e calendário em `Configuracao.jsx`.
- Respeitar todas as 15 tabelas existentes em `public.simulador_tabelas`.
- Não quebrar nenhum fluxo existente do Kanban, Leads ou Pós-venda.

## Review Focus

- Contrato sem tabela selecionada: deve assumir regra padrão de comissão sem quebrar cálculo.
- Mudança de parcelas pagas no pós-venda: deve refletir instantaneamente no Extrato Real sem refresh manual.
- Usuário sem perfil ou deslogado: fallback seguro sem lançar exceções no render.
- Formatação monetária com toggle de privacidade (ocultar/exibir valores).
- Build limpo no Vite (`npm run build`).

---

### Task 1: Supabase Database Migration & Commission Service

**Files:**
- Create: `consorflux/src/services/migrations/create_commission_tables.sql`
- Create: `consorflux/src/services/commissionService.js`

- [ ] **Step 1: Criar script SQL de migração das tabelas de comissão**
  Criar `create_commission_tables.sql` contendo DDL para `regras_comissionamento` e `calendario_comissionamento`, índices e inserção de regras padrão iniciais para as 15 tabelas do simulador.

- [ ] **Step 2: Aplicar a migração no Supabase via API REST / Edge / SQL**
  Executar a criação das tabelas no Supabase através da chave de serviço e verificar se as tabelas respondem com HTTP 200.

- [ ] **Step 3: Implementar `commissionService.js`**
  Implementar métodos:
  - `getCommissionRules()`: Carrega regras de comissão.
  - `saveCommissionRule(rule)`: Cria ou atualiza regra de comissão de uma tabela.
  - `getCommissionCalendar(ano)`: Carrega o calendário anual do ano especificado.
  - `saveCalendarMonth(monthData)`: Atualiza configurações do mês no calendário.
  - `calculateContractCommission(contract, rule)`: Calcula comissão total, 1ª parcela e grade recorrente de um contrato.
  - `calculateRealExtract(contracts, rules, calendar)`: Filtra parcelas já marcadas como pagas e projeta valores e datas de liberação.
  - `calculateFutureForecast(contracts, rules, calendar)`: Projeta recebíveis mês a mês dos contratos ativos.
  - `simulateCommission(tabelaId, valorCredito, comAdesao, rules)`: Simula ganhos interativos para vendedores.

---

### Task 2: Integração de Tabelas e Adesão no Modal de Lead (`ClientDetailsModal.jsx`)

**Files:**
- Modify: `consorflux/src/components/leads/ClientDetailsModal.jsx:2070-2220`

- [ ] **Step 1: Carregar lista de tabelas comerciais do simulador no modal**
  Consultar `simulador_tabelas` no carregamento do modal para preencher o dropdown de tabelas comerciais nos contratos.

- [ ] **Step 2: Adicionar campos de Tabela e Adesão Contratual nos Contratos**
  Na seção de Contratos da aba Acompanhamento:
  - Dropdown com as tabelas disponíveis (`t_auto_normal`, `t_imovel_normal`, etc.).
  - Toggle / Checkbox "Venda com Adesão Contratual".
  - Checkbox "Com Seguro de Vida / Campanha".

- [ ] **Step 3: Atualizar persistência de contratos no Board**
  Garantir que ao salvar ou alternar parcelas pagas (`handleToggleInstallment`), os dados do contrato (`tabela_id`, `tabela_nome`, `comAdesao`, `parcelasPagas`) sejam salvos no Supabase com sincronização em tempo real.

---

### Task 3: Aba de Configuração de Regras em `Configuracao.jsx`

**Files:**
- Create: `consorflux/src/components/admin/ComissionamentoConfigTab.jsx`
- Modify: `consorflux/src/components/admin/Configuracao.jsx:36-395`

- [ ] **Step 1: Criar o componente `ComissionamentoConfigTab.jsx`**
  Implementar:
  - Visualização e troca entre 2 submódulos:
    1. **Calendário Anual:** Matriz de 12 meses (Janeiro a Dezembro) com dia de corte, dia de pagamento, assembleia e regra de liberação.
    2. **Regras Comerciais por Tabela:** Seletor visual das 15 tabelas, configuração de comissão da 1ª parcela, bônus de adesão contratual, lista dinâmica de parcelas recorrentes ("+ Adicionar Parcela"), overrides de supervisão e gerência, e switch de permissão de venda direta para supervisores.

- [ ] **Step 2: Integrar a aba em `Configuracao.jsx`**
  - Adicionar botão de navegação "Comissionamento" visível exclusivamente quando `isGerente || isAdmin`.
  - Conectar salvamento com feedback de toast em tempo real.

---

### Task 4: Nova Tela de Comissionamento em 3 Abas (`ComissaoScreen.jsx`)

**Files:**
- Modify: `consorflux/src/components/dashboard/ComissaoScreen.jsx`

- [ ] **Step 1: Top Bar & Controle de Perfis e Privacidade**
  - Toggle de ocultar/exibir valores monetários (`Eye`/`EyeOff`).
  - Identificação de cargo (Vendedor, Supervisor, Gerente).
  - Filtro de auditoria por vendedor e equipe para Gerentes/Admins.
  - Travas éticas: Vendedor vê somente suas vendas; Supervisor vê o consolidado de sua equipe.

- [ ] **Step 2: Implementar Aba 1 — Extrato Real**
  - Métricas: Total Liberado para Próximo Pagamento, Data Prevista do Lote, Total Acumulado.
  - Grade detalhada de cotas: Cliente, Contrato, Cota, Tabela, Parcela Paga Confirmada, Comissão Calculada, Status da Liberação.

- [ ] **Step 3: Implementar Aba 2 — Previsão Futura**
  - Linha do tempo mensal (Outubro, Novembro, Dezembro, Janeiro...) baseada nas parcelas vincendas dos contratos ativos.
  - Indicadores de fluxo financeiro projetado e adimplência esperada.

- [ ] **Step 4: Implementar Aba 3 — Simulação & Agente de IA**
  - Simulador interativo: seletor de tabela, valor do crédito, prazo, toggle de adesão e cálculo visual mês a mês.
  - Agente MentorIA de Comissionamento: lê os leads do pipeline do vendedor que estão em fase avançada ("Negociação" / quentes), calcula o ganho potencial ao fechar e sugere estratégias para antecipar o fechamento.

---

### Task 5: Build, Validação Ponta a Ponta e Deploy

**Files:**
- Test: Verificação manual e automatizada das telas e cálculos
- Build: `consorflux/package.json`

- [ ] **Step 1: Testar compilação com `npm run build`**
  Executar `npm run build` na pasta `consorflux` e garantir zero erros de compilação ou TypeScript/Lint.

- [ ] **Step 2: Validação dos cenários de teste**
  - Testar marcação de parcelas em `ClientDetailsModal` e refletir no `Extrato Real`.
  - Testar simulação com e sem adesão contratual.
  - Testar restrições de visibilidade por perfil (Vendedor vs Gerente).

- [ ] **Step 3: Commit e versionamento das alterações**
  Commitar na branch `main` com mensagem padronizada no git.
