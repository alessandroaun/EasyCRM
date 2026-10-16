# Plano de Implementação: Informações Gerais do Vendedor e Parâmetros de Metas Mensais

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o botão de ações e modal de Informações Gerais do Vendedor com definição de parâmetros de metas mensais (crédito, cotas, ligações diárias e foco), histórico retroativo de desempenho, sincronização no Minha Central e Configurações (com travas de permissão), e notificações in-app e Web Push.

**Architecture:** 
1. Tabela Supabase `crm_metas_mensais` indexada por `(user_id, ano, mes)` e colunas auxiliares em `user_profiles`.
2. Endpoint Cloud Run `/api/metas/notificar-atribuicao` disparando Web Push FCM com agrupamento determinístico.
3. Novo modal `UserInfoMetaModal.jsx` com cabeçalho de perfil, tempo relativo no CRM, formulário de parâmetros e histórico retroativo baseado em contratos fechados na aba de acompanhamento.
4. Botão na tabela de `AdminPanel.jsx` condicionado a `role !== 'admin' && role !== 'administrador'`.
5. Exibição de meta de cotas no `MinhaCentral.jsx` e campos travados para vendedor/supervisor em `Configuracao.jsx`.

**Tech Stack:** React (Vite, TailwindCSS, Lucide-React), Supabase PostgreSQL, Python Flask (Google Cloud Run, Firebase Admin SDK), Cloudflare Pages.

**Spec:** [`docs/superpowers/specs/2026-10-16-vendedor-info-metas-design.md`](file:///c:/PCALE-rede/crm-a11/EasyCRM/docs/superpowers/specs/2026-10-16-vendedor-info-metas-design.md)

---

## Global Constraints
- O botão de informações e metas NUNCA deve ser exibido para contas de nível administrador (`admin` ou `administrador`).
- Supervisores só podem visualizar/editar informações e metas de consultores pertencentes à sua própria equipe.
- Em `Configuracao.jsx`, os campos de metas mensais e ligações diárias devem ser estritamente desabilitados (somente leitura) para vendedores e supervisores.
- Para apuração de histórico de vendas, são considerados estritamente os contratos cadastrados na aba de acompanhamento (`contracts`).
- A notificação push deve usar `${BACKEND_URL}` do Cloud Run, nunca caminho relativo.

## Review Focus
1. Vendedor sem contratos fechados em mês anterior exibe apuração de R$ 0,00 e 0 cotas com percentual faltante correto.
2. Contas de administrador na tabela da Gestão de Equipe não renderizam o botão de informações e metas.
3. Salvamento de meta atualiza atomicamente `user_profiles` e cria/atualiza registro em `crm_metas_mensais`.
4. Campos de metas em Configurações permanecem bloqueados quando logado como supervisor ou vendedor.
5. Minha Central exibe a nova métrica de Meta de Cotas do Mês sem quebrar o layout existente.

---

### Task 1: Supabase PostgreSQL - Tabela `crm_metas_mensais` & Colunas de Perfil

**Files:**
- Create: `backend-crm-cloudrun/migrations/2026-10-16_crm_metas_mensais.sql`
- Test: `scripts/test_crm_metas_mensais_db.py`

- [ ] **Step 1: Criar arquivo de migração SQL**
Criar `crm_metas_mensais` com colunas `user_id`, `mes`, `ano`, `meta_credito`, `meta_cotas`, `ligacoes_diarias`, `tipo_foco`, `definido_por`, `definido_por_nome`, `created_at`, `updated_at`, chave única `(user_id, mes, ano)`, RLS e grants para `authenticated, anon`.

- [ ] **Step 2: Aplicar DDL e colunas em `user_profiles` no Supabase via script Python**
Executar criação de tabela e `ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS monthly_cotas_goal INT DEFAULT 5, ADD COLUMN IF NOT EXISTS goal_target_type TEXT DEFAULT 'ambos';`.

- [ ] **Step 3: Testar operações CRUD no banco de dados**
Executar `test_crm_metas_mensais_db.py` verificando upsert e select.

- [ ] **Step 4: Commit**
`git add backend-crm-cloudrun/migrations/2026-10-16_crm_metas_mensais.sql scripts/test_crm_metas_mensais_db.py && git commit -m "feat(db): add crm_metas_mensais table and user profile columns"`

---

### Task 2: Backend Cloud Run - Rota de Notificação Web Push de Metas

**Files:**
- Modify: `backend-crm-cloudrun/app.py`
- Test: `backend-crm-cloudrun/test_metas_notification.py`

- [ ] **Step 1: Escrever teste unitário para `/api/metas/notificar-atribuicao`**
Criar `test_metas_notification.py` com mocks de tokens FCM e verificar resposta 200 com `{"success": true, "delivered": N}`.

- [ ] **Step 2: Implementar endpoint no `app.py`**
Adicionar `@app.route('/api/metas/notificar-atribuicao', methods=['POST', 'OPTIONS'])` buscando tokens em `user_push_tokens` e disparando via `send_webpush_notification`.

- [ ] **Step 3: Executar teste com pytest**
Rodar `pytest backend-crm-cloudrun/test_metas_notification.py -v`.

- [ ] **Step 4: Commit**
`git add backend-crm-cloudrun/app.py backend-crm-cloudrun/test_metas_notification.py && git commit -m "feat(backend): add push notification endpoint for monthly goals"`

---

### Task 3: Serviço Frontend de Metas e Histórico Retroativo

**Files:**
- Create: `consorflux/src/services/metasMensaisService.js`
- Test: `scripts/test_metas_mensais_service.mjs`

- [ ] **Step 1: Escrever teste unitário para cálculo de histórico e metas**
Testar:
  - Formatação de tempo de CRM: `getTempoCRM(createdAt)`.
  - Apuração de vendas por competência mensal: `calcularDesempenhoMes(deals, mes, ano, metaCredito, metaCotas)`.
  - Verificação de meta batida (+X%) e meta não batida (faltou X%).

- [ ] **Step 2: Implementar `metasMensaisService.js`**
Funções:
  - `fetchMetasMensais(userId)`: busca histórico de metas no Supabase.
  - `saveMetaMensal(userId, data, definidor)`: faz upsert em `crm_metas_mensais` e atualiza `user_profiles`.
  - `notifyMetaAtribuicao(payload)`: chama `${BACKEND_URL}/api/metas/notificar-atribuicao`.
  - `getTempoCRM(createdAt)`: calcula string temporal amigável.
  - `calcularHistoricoVendedor(userId, deals, userCreatedAt, metasCadastradas)`: gera lista de meses retroativos com status.

- [ ] **Step 3: Executar testes de serviço com Node.js**
`node scripts/test_metas_mensais_service.mjs`.

- [ ] **Step 4: Commit**
`git add consorflux/src/services/metasMensaisService.js scripts/test_metas_mensais_service.mjs && git commit -m "feat(service): add metasMensaisService with history calculation"`

---

### Task 4: Componente `UserInfoMetaModal.jsx`

**Files:**
- Create: `consorflux/src/components/admin/UserInfoMetaModal.jsx`

- [ ] **Step 1: Implementar cabeçalho do vendedor e tempo de CRM**
Avatar, Nome, E-mail, Nível de Acesso, Equipe, e badge com data/hora e tempo relativo (ex: `15/05/2026 às 14:30 (5 meses)`).

- [ ] **Step 2: Implementar formulário de parâmetros do mês vigente**
Inputs para Meta de Crédito (R$), Meta de Cotas, Ligações/Dia (informativo) e seletor de foco (`Crédito`, `Cotas`, `Ambos`), com botão "Salvar Parâmetros".

- [ ] **Step 3: Implementar tabela de histórico mensal retroativo**
Lista dos meses anteriores com colunas: Mês/Ano, Meta Estipulada, Realizado (Crédito e Cotas), e Resultado com badges verdes (+X%) ou vermelhas/âmbar (faltando X%).

- [ ] **Step 4: Commit**
`git add consorflux/src/components/admin/UserInfoMetaModal.jsx && git commit -m "feat(ui): create UserInfoMetaModal component"`

---

### Task 5: Integração no `AdminPanel.jsx`

**Files:**
- Modify: `consorflux/src/components/admin/AdminPanel.jsx`

- [ ] **Step 1: Adicionar estado para o modal de informações e metas**
`const [infoMetaUser, setInfoMetaUser] = useState(null);`

- [ ] **Step 2: Renderizar novo botão na coluna de ações**
Inserir botão ciano/azul com ícone `<UserCheck size={13} />` condicionado a `roleNormalized !== 'admin' && roleNormalized !== 'administrador'`.

- [ ] **Step 3: Conectar o modal e sincronizar atualização**
Renderizar `<UserInfoMetaModal />` e recarregar dados dos usuários ao salvar.

- [ ] **Step 4: Commit**
`git add consorflux/src/components/admin/AdminPanel.jsx && git commit -m "feat(admin): integrate user info and monthly goals button and modal"`

---

### Task 6: Integração no `MinhaCentral.jsx` e `Configuracao.jsx`

**Files:**
- Modify: `consorflux/src/components/dashboard/MinhaCentral.jsx`
- Modify: `consorflux/src/components/admin/Configuracao.jsx`

- [ ] **Step 1: Adicionar Meta de Cotas em `MinhaCentral.jsx`**
Exibir card métrico de **Meta de Cotas (Mês)** e alinhar o percentual com o tipo de foco (`credito`, `cotas` ou `ambos`).

- [ ] **Step 2: Adicionar campo de Cotas e travas de segurança em `Configuracao.jsx`**
Em *Consultor Responsável & Metas*:
- Adicionar caixa de input **Meta de Cotas**.
- Desabilitar edição para vendedor e supervisor: `disabled={isVendedor || userRole === 'supervisor'}`.

- [ ] **Step 3: Commit**
`git add consorflux/src/components/dashboard/MinhaCentral.jsx consorflux/src/components/admin/Configuracao.jsx && git commit -m "feat(ui): integrate monthly cotas goal in MinhaCentral and locked settings"`

---

### Task 7: Notificação Persistente na Central de Notificações (`NotificationModal.jsx`)

**Files:**
- Modify: `consorflux/src/components/common/NotificationModal.jsx`

- [ ] **Step 1: Carregar meta mensal definida para o usuário**
Buscar meta do mês vigente em `crm_metas_mensais` para o colaborador logado.

- [ ] **Step 2: Renderizar card de Notificação de Meta Mensal**
Card com ícone de alvo, detalhes da meta (crédito, cotas, ligações, foco), nome do gestor e botão de confirmação.

- [ ] **Step 3: Commit**
`git add consorflux/src/components/common/NotificationModal.jsx && git commit -m "feat(notifications): add monthly goal assignment notification card"`

---

### Task 8: Testes Automatizados, Build, Commit, Push & Deploy

- [ ] **Step 1: Executar suítes de teste automatizado**
Validar scripts de backend, banco e serviço de metas.

- [ ] **Step 2: Executar build de produção do frontend**
`npm run build` em `consorflux`.

- [ ] **Step 3: Realizar deploy no Cloudflare Pages**
`wrangler pages deploy dist --project-name consorflux-app`.

- [ ] **Step 4: Commit e push final no Git**
`git push origin main`.
