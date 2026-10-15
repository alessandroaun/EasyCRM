# Recuperação de Senha Assistida & Custom SMTP ConsorFlux Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o fluxo corporativo de Recuperação de Senha Assistida no ConsorFlux CRM com proteção contra concorrência entre gestores, Web Push via Firebase, aprovação com um clique na Central de Notificações / Painel de Equipe e envio de e-mail corporativo via Custom SMTP Gmail (`consorflux@gmail.com`).

**Architecture:** O vendedor solicita o reset na tela de login informando seu e-mail corporativo. O backend Cloud Run registra a solicitação atômica e dispara Web Push Firebase para administradores e gerentes. No CRM, o gestor aprova o reset via modal de notificações ou painel administrativo através da função atômica `approve_password_reset`, que bloqueia cliques duplicados e identifica quem atendeu o pedido antes de disparar o e-mail via Supabase GoTrue Auth conectado ao Gmail.

**Tech Stack:** React 18, Vite, Tailwind CSS / CRM Theme, Supabase (PostgreSQL & GoTrue Auth), Firebase Cloud Messaging (Web Push / Admin SDK Python), Flask (Cloud Run).

**Spec:** `docs/superpowers/specs/2026-10-15-recuperacao-senha-assistida-design.md`

## Global Constraints

- Manter compatibilidade com tema dark nativo do ConsorFlux (`#030712`, `#0f172a`, `#1e293b`).
- Usar a logomarca oficial: `https://app.consorflux.com/ConsorFluxWhite.png`.
- Garantir atomicidade rigorosa no PostgreSQL para evitar disparos duplicados de e-mail por cliques simultâneos de gestores.
- Não expor informações sensíveis ou permissões além de `admin` e `gerente` para aprovação de senhas.
- Suportar avatares reais com fallback para iniciais estilizadas em gradiente.

## Review Focus

- Clique concorrente de dois gestores quase simultâneos: o primeiro deve aprovar e disparar e-mail; o segundo deve receber alerta informando que o primeiro já atendeu o pedido, sem disparar um segundo e-mail.
- Usuário que não lembra o e-mail: deve receber mensagem clara orientando contato presencial com gestor/admin sem erro de sistema.
- Usuário inativo ou inexistente: não deve quebrar a tela de login nem vazar se o e-mail existe no banco (resposta genérica e segura).
- Dispositivo de gestor sem token Push ou com token desatualizado: o envio de push deve ignorar falhas de tokens individuais sem abortar o fluxo.
- Usuário que cancela ou dispensa no modal: a solicitação deve ser arquivada (`reset_requested = false`) sem envio de e-mail.

---

### Task 1: Supabase PostgreSQL - Colunas de Auditoria e Função Atômica `approve_password_reset`

**Files:**
- Modify: Supabase Database `public.user_profiles`
- Create: `backend-crm-cloudrun/migrations/2026-10-15_concurrency_password_reset.sql`

**Interfaces:**
- Consumes: `public.user_profiles` (`id`, `name`, `email`, `role`, `status`, `reset_requested`)
- Produces: `public.approve_password_reset(target_user_id uuid, approver_id uuid) -> jsonb`

- [ ] **Step 1: Escrever script SQL com as colunas de auditoria e a função atômica**
Criar `backend-crm-cloudrun/migrations/2026-10-15_concurrency_password_reset.sql` contendo:
  - `ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS reset_resolved_by_name text, ADD COLUMN IF NOT EXISTS reset_resolved_at timestamp with time zone;`
  - Definição da função `public.approve_password_reset(target_user_id uuid, approver_id uuid)` com checagem de cargo do aprovador (`admin`/`gerente`), update com trava `WHERE id = target_user_id AND reset_requested = true` e retorno com `already_resolved` caso já aprovado.
  - Permissão: `GRANT EXECUTE ON FUNCTION public.approve_password_reset(uuid, uuid) TO authenticated;`

- [ ] **Step 2: Aplicar migração no banco de dados Supabase**
Executar a query via Supabase MCP tool `execute_sql` no projeto `ygfitekotpgydiolcyry`.

- [ ] **Step 3: Testar comportamento de concorrência com SQL**
Executar teste de simulação via SQL:
  - Setar `reset_requested = true` para um usuário de teste.
  - Chamar `approve_password_reset` com o ID de um admin -> Verificar que retorna `success: true`.
  - Chamar `approve_password_reset` novamente com o ID de outro admin -> Verificar que retorna `already_resolved: true` e `resolved_by` preenchido.
  - Resetar o usuário de teste para o estado original.

- [ ] **Step 4: Commit**
```bash
git add backend-crm-cloudrun/migrations/2026-10-15_concurrency_password_reset.sql
git commit -m "feat(db): adicionar funcao atomica approve_password_reset com protecao de concorrencia"
```

---

### Task 2: Backend Cloud Run - Rota de Notificação Push Firebase para Gestores

**Files:**
- Modify: `backend-crm-cloudrun/app.py`
- Test: `backend-crm-cloudrun/tests/test_reset_notification.py`

**Interfaces:**
- Consumes: Firebase Admin Messaging (`messaging.send`), Supabase Client (`user_profiles`, `user_push_tokens`)
- Produces: `POST /api/auth/notificar-reset` -> `{ "success": boolean, "notificados": number }`

- [ ] **Step 1: Criar teste automatizado para a rota `/api/auth/notificar-reset`**
Criar `backend-crm-cloudrun/tests/test_reset_notification.py` testando:
  - Requisição sem e-mail retorna status 400.
  - Requisição com e-mail inexistente retorna `{ success: true, not_found: true }` de forma segura.
  - Requisição com e-mail válido atualiza `reset_requested = true` e simula envio de push para administradores.

- [ ] **Step 2: Liberar rota em `require_authenticated_caller`**
No arquivo `backend-crm-cloudrun/app.py`, adicionar `/api/auth/notificar-reset` na lista de rotas públicas permitidas sem token prévio de autenticação.

- [ ] **Step 3: Implementar endpoint `@app.route('/api/auth/notificar-reset', methods=['POST'])`**
Implementar o fluxo no `app.py`:
  - Extrair e sanitizar `email`.
  - Chamar `supabase.rpc('request_password_reset', {'request_email': email}).execute()`.
  - Buscar dados do usuário solicitante (`name`, `email`, `avatar_url`) em `user_profiles`.
  - Localizar administradores e gerentes ativos (`role IN ('admin', 'administrador', 'gerente')`).
  - Buscar tokens em `user_push_tokens` associados a esses gestores.
  - Disparar `enviar_notificacao_push` para cada gestor com:
    - Título: `🔐 Solicitação de Reset de Senha`
    - Mensagem: `O usuário {Nome} ({Email}) solicitou recuperação de acesso. Toque para autorizar.`
    - URL: `https://app.consorflux.com/?open_notifications=true`
  - Retornar status 200 `{ "success": True, "notificados": total_enviados }`.

- [ ] **Step 4: Executar testes automatizados**
Executar: `python backend-crm-cloudrun/tests/test_reset_notification.py`
Verificar: PASS

- [ ] **Step 5: Commit**
```bash
git add backend-crm-cloudrun/app.py backend-crm-cloudrun/tests/test_reset_notification.py
git commit -m "feat(backend): rota de notificacao push firebase para recuperacao de senha"
```

---

### Task 3: Tela de Login - Interface de Ajuda e Solicitação de Recuperação

**Files:**
- Modify: `consorflux/src/components/common/AuthScreens.jsx`
- Modify: `consorflux/src/components/common/AuthLayout.jsx` (se necessário para título/subtítulo dinâmico)

**Interfaces:**
- Consumes: Backend API (`/api/auth/notificar-reset`), Supabase client (`rpc('request_password_reset')`)
- Produces: UI State transitions (`LOGIN` -> `RECOVERY_FORM` -> `RECOVERY_CONFIRMATION`)

- [ ] **Step 1: Adicionar estados de navegação de recuperação em `AuthScreens.jsx`**
Criar estados:
  - `authView`: `'LOGIN'` | `'RECOVERY'` | `'CONFIRMATION'`
  - `recoveryEmail`: string
  - `recoveryLoading`: boolean
  - `recoveryError`: string

- [ ] **Step 2: Implementar formulário de recuperação quando `authView === 'RECOVERY'`**
Renderizar:
  - Título: `Recuperar<br /><span>seu acesso.</span>`
  - Subtítulo: `Informe seu e-mail corporativo para solicitar a liberação de senha ao gestor ou administrador da sua equipe.`
  - Campo de entrada com ícone `Mail` para o e-mail.
  - Botão principal: `Enviar solicitação` com animação de loading (`LoaderCircle`).
  - Caixa de auxílio para quem não sabe o e-mail:
    `"Não sabe seu e-mail de acesso? Procure o gestor ou administrador da sua equipe pessoalmente."`
  - Botão/Link para voltar: `Voltar ao login` (restaura `authView = 'LOGIN'`).

- [ ] **Step 3: Implementar envio e tela de confirmação (`authView === 'CONFIRMATION'`)**
Ao submeter o formulário:
  - Validar se o e-mail possui formato válido.
  - Fazer POST para `${BACKEND_URL}/api/auth/notificar-reset`.
  - Como fallback redundante, executar `supabase.rpc('request_password_reset', { request_email: recoveryEmail })`.
  - Exibir tela de sucesso com ícone `CheckCircle2`:
    - Título: `Solicitação<br /><span>enviada!</span>`
    - Mensagem: `O gestor e administrador da sua equipe já receberam a notificação de acesso. Assim que autorizado, você receberá um e-mail com as instruções para redefinir sua senha.`
    - Botão: `Retornar ao login`

- [ ] **Step 4: Testar visualmente a interface de login e recuperação**
Testar transições de tela, validação de e-mail e envio.

- [ ] **Step 5: Commit**
```bash
git add consorflux/src/components/common/AuthScreens.jsx
git commit -m "feat(auth): interface de solicitacao de recuperacao de senha na tela de login"
```

---

### Task 4: Central de Notificações - Card com Foto, Ação Rápida e Prevenção de Duplicidade

**Files:**
- Modify: `consorflux/src/components/common/NotificationModal.jsx`
- Modify: `consorflux/src/context/BoardContext.jsx` (ou onde as notificações são sincronizadas)

**Interfaces:**
- Consumes: `user_profiles` (`reset_requested = true`), RPC `approve_password_reset`, Supabase Auth (`resetPasswordForEmail`)
- Produces: Card de Reset com Foto, Nome, Email, Ação Atômica e Tratamento de Concorrência

- [ ] **Step 1: Carregar solicitações ativas de reset para perfis Admin/Gerente**
No `NotificationModal.jsx`, carregar usuários com `reset_requested === true` da tabela `user_profiles`:
  - Campos: `id`, `name`, `email`, `avatar_url`, `created_at`
  - Mapear cada usuário para um item de notificação do tipo `RESET_REQUEST`.

- [ ] **Step 2: Construir card visual premium de solicitação de reset**
Renderizar dentro da Central de Notificações:
  - Tag de destaque: `🔐 Recuperação de Senha`
  - Avatar do usuário: foto real (`avatar_url`) com fallback para iniciais estilizadas em círculo gradiente.
  - Nome do colaborador em negrito e e-mail corporativo.
  - Botão de ação primária: `Resetar Senha` (estilo botão azul/gradiente com ícone `KeyRound`).
  - Botão de ação secundária: `Dispensar` (ícone `X` / texto discreto).

- [ ] **Step 3: Implementar aprovação atômica com feedback de concorrência**
Ao clicar em `Resetar Senha`:
  - Invocar `supabase.rpc('approve_password_reset', { target_user_id: user.id, approver_id: currentUser.id })`.
  - **Caso 1 (Sucesso):**
    - Chamar `supabase.auth.resetPasswordForEmail(user.email, { redirectTo: 'https://app.consorflux.com' })`.
    - Exibir toast de sucesso: `Reset autorizado! E-mail de redefinição enviado para {user.email}.`
    - Remover a notificação da lista ativa.
  - **Caso 2 (Já resolvido por outro gestor):**
    - **NÃO disparar novo e-mail**.
    - Exibir alerta/toast com mensagem exata: `O gestor {resolved_by} já aceitou a solicitação de reset de senha de {target_name}.`
    - Atualizar a lista de notificações local removendo a pendência.
  - **Caso 3 (Dispensar):**
    - Atualizar `user_profiles` com `reset_requested = false`.

- [ ] **Step 4: Testar modal com simulação de concorrência**
Verificar renderização do card com foto/avatar e simular resposta `already_resolved`.

- [ ] **Step 5: Commit**
```bash
git add consorflux/src/components/common/NotificationModal.jsx
git commit -m "feat(notifications): card de aprovacao de reset com avatar e trava de concorrencia"
```

---

### Task 5: Painel de Equipe (`AdminPanel.jsx`) - Ação Rápida de Reset por Colaborador

**Files:**
- Modify: `consorflux/src/components/admin/AdminPanel.jsx`

**Interfaces:**
- Consumes: RPC `approve_password_reset`, `resetPasswordForEmail`, `user_profiles`
- Produces: Botão de reset na tabela de usuários e badge pulsante de solicitação pendente

- [ ] **Step 1: Adicionar badge e botão de reset na listagem de usuários**
Em `AdminPanel.jsx`:
  - Se `user.reset_requested === true`, renderizar badge visual pulsante laranja/vermelho: `🔔 Reset Solicitado`.
  - Adicionar botão de ação com ícone `KeyRound` ou `Lock` com tooltip *"Resetar senha do colaborador"*.

- [ ] **Step 2: Implementar modal/confirmação de reset**
Ao clicar no botão:
  - Abrir confirmação: *"Deseja disparar a recuperação de senha de {user.name} ({user.email})?"*
  - Ao confirmar, chamar `approve_password_reset`.
  - Se sucesso, disparar `resetPasswordForEmail` e atualizar estado local da lista (`reset_requested = false`).
  - Se já aprovado por outro gestor, exibir alerta claro: *"A solicitação já foi atendida por {resolved_by}."*

- [ ] **Step 3: Testar no painel administrativo**
Verificar listagem, badge e funcionamento do reset direto pelo painel.

- [ ] **Step 4: Commit**
```bash
git add consorflux/src/components/admin/AdminPanel.jsx
git commit -m "feat(admin): botao de reset de senha com badge de solicitacao pendente"
```

---

### Task 6: Custom SMTP Gmail & Template Corporativo de E-mail ConsorFlux

**Files:**
- Create: `consorflux/templates/email-reset-password.html`
- Create: `docs/superpowers/email-smtp-setup-guide.md`

**Interfaces:**
- Consumes: Gmail SMTP (`smtp.gmail.com`, 465, `dxzqinalqbxdgbxn`, `consorflux@gmail.com`)
- Produces: Template HTML de alta fidelidade para Supabase Auth

- [ ] **Step 1: Criar arquivo de template HTML corporativo com logotipo oficial e design escuro**
Criar `consorflux/templates/email-reset-password.html` com:
  - Logotipo oficial: `https://app.consorflux.com/ConsorFluxWhite.png`
  - Assunto: `Redefinição de Senha - ConsorFlux CRM`
  - Botão CTA apontando para `{{ .ConfirmationURL }}`
  - Cláusulas de privacidade, expiração de token e contato com o suporte corporativo.

- [ ] **Step 2: Documentar e validar a ativação do SMTP no Supabase**
Criar guia completo com a configuração exata pronta para aplicação:
  - Host: `smtp.gmail.com`
  - Porta: `465` (SSL)
  - E-mail: `consorflux@gmail.com`
  - Senha: `dxzqinalqbxdgbxn`

- [ ] **Step 3: Commit**
```bash
git add consorflux/templates/email-reset-password.html docs/superpowers/email-smtp-setup-guide.md
git commit -m "docs: template de email corporativo e guia de ativacao smtp consorflux"
```

---

### Task 7: Validação End-to-End e Verificação Final

**Files:**
- Run verification tests across all components.

- [ ] **Step 1: Teste de fluxo no login (Solicitar reset com e-mail)**
- [ ] **Step 2: Teste de entrega de Web Push Firebase para o gestor**
- [ ] **Step 3: Teste de aprovação na Central de Notificações com Trava de Concorrência**
- [ ] **Step 4: Teste de disparo pelo Painel Administrativo**
- [ ] **Step 5: Verificação do e-mail recebido na caixa postal de teste**
