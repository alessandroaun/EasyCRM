# Especificação de Design: Recuperação de Senha Assistida & Custom SMTP ConsorFlux

**Data:** 15 de Outubro de 2026  
**Status:** Proposto (Aguardando Revisão do Usuário)  
**Sistema:** ConsorFlux CRM (Frontend React/Vite, Backend Cloud Run Flask, Supabase Auth/PostgreSQL, Firebase Web Push)

---

## 1. Visão Geral e Objetivo

Implementar o fluxo corporativo de **Recuperação de Senha Assistida** do ConsorFlux CRM. No modelo de segurança do ConsorFlux, um usuário (vendedor/colaborador) não altera sua senha diretamente pela tela de login; em vez disso, ele solicita a recuperação informando seu e-mail corporativo. O pedido gera uma notificação push imediata (Firebase) e um alerta na Central de Notificações para os gestores e administradores da equipe, que revisam e autorizam o reset com apenas um clique.

Além disso, o envio do e-mail de redefinição de senha passa a ser operado pelo **Custom SMTP do Gmail** (`consorflux@gmail.com`) através da senha de aplicativo dedicada, utilizando um template corporativo com a logomarca oficial do ConsorFlux, conformidade com segurança/LGPD e experiência visual premium.

---

## 2. Requisitos & Regras de Negócio

1. **Tela de Login (`AuthScreens.jsx`):**
   * Ao clicar no link *"Precisa de ajuda para entrar?"*, a tela transiciona para a visualização de solicitação de recuperação.
   * Exibe campo de entrada para o **e-mail corporativo**.
   * Se o usuário não lembrar o e-mail corporativo, exibe a mensagem de apoio:  
     *"Se esqueceu seu e-mail de acesso ou precisa liberar seu cadastro, procure o gestor ou administrador da sua equipe pessoalmente."*
   * Ao submeter o formulário com o e-mail, chama a rotina de registro no banco e notifica o backend.
   * Feedback de sucesso: *"Solicitação enviada com sucesso! O gestor e administrador da sua equipe foram notificados. Assim que autorizado, você receberá um e-mail de redefinição."*
   * Opção para *"Voltar para o login"*.

2. **Notificação Push aos Gestores (Firebase Cloud Messaging):**
   * Ao ser solicitada a recuperação, o backend Cloud Run (`/api/auth/notificar-reset`) localiza todos os administradores e gerentes ativos que possuem tokens cadastrados em `user_push_tokens`.
   * Envia Web Push nativo para os dispositivos registrados (PC/Mobile) com título e corpo:
     * **Título:** `🔐 Solicitação de Reset de Senha`
     * **Mensagem:** `O usuário {Nome} ({E-mail}) solicitou recuperação de acesso. Toque para autorizar.`
     * **Ícone/Badge:** `https://app.consorflux.com/ConsorFluxWhite.png`

3. **Controle de Concorrência e Trava Atômica (Prevenção de Cliques Múltiplos):**
   * Como múltiplos gestores recebem a mesma notificação simultaneamente, **apenas o primeiro clique pode ser processado**.
   * O banco de dados executa a operação atômica via função RPC `public.approve_password_reset(target_user_id, approver_id)`.
   * O comando SQL `UPDATE public.user_profiles SET reset_requested = false, reset_resolved_by_name = ..., reset_resolved_at = now() WHERE id = target_user_id AND reset_requested = true` garante que se dois gestores clicarem ao mesmo tempo, apenas um obtém sucesso.
   * Se um segundo gestor (ex: Carlos) tentar aprovar uma solicitação já processada por outro gestor (ex: João), a função rejeita a duplicação e retorna:
     * `already_resolved: true`
     * `resolved_by: "João"`
     * `resolved_at: timestamp`
     * `message: "A solicitação de {Usuário} já foi aprovada anteriormente por João às {horário}."`
   * O frontend intercepta essa resposta e exibe uma notificação amigável, impedindo o disparo de um segundo e-mail e desabilitando o botão no card.

4. **Central de Notificações (`NotificationModal.jsx`):**
   * Para gestores (`admin` ou `gerente`), lista solicitações onde `reset_requested = true`.
   * Card estilizado com:
     * **Foto/Avatar:** Foto real do usuário (`avatar_url`) ou avatar com iniciais em gradiente azul/laranja.
     * **Identificação:** Nome do vendedor, e-mail corporativo e tag de status `Pendente de Aprovação`.
     * **Ações:** Botão verde/azul destacado `Resetar Senha` e botão `Dispensar`.
     * Se a solicitação foi resolvida por outro gestor, exibe o selo: `Aprovado por {NomeDoGestor}`.

5. **Painel de Gestão da Equipe (`AdminPanel.jsx`):**
   * Na tabela/cartões de membros da equipe, adiciona o botão de ação rápida `Resetar Senha` com ícone de chave (`KeyRound`).
   * Usuários com `reset_requested = true` exibem um badge destacado `🔔 Reset Solicitado`.
   * Clicar no botão aciona a mesma rotina de aprovação protegida contra concorrência.

6. **Envio de E-mail via Custom SMTP Supabase:**
   * Provedor SMTP: `smtp.gmail.com`
   * Porta: `465` (SSL)
   * Usuário: `consorflux@gmail.com`
   * Senha: Senha de aplicativo de 16 caracteres (`dxzqinalqbxdgbxn`).
   * E-mail e Nome do Remetente: `ConsorFlux <consorflux@gmail.com>`.
   * Template HTML com logotipo oficial, visual escuro corporativo, botão CTA com `{{ .ConfirmationURL }}` e texto de segurança e privacidade.

---

## 3. Arquitetura Técnica & Banco de Dados

### 3.1. Alterações no Banco de Dados (Supabase PostgreSQL)

A tabela `public.user_profiles` já possui `reset_requested` (boolean). Adicionaremos duas colunas para auditoria e controle de concorrência:

```sql
-- 1. Colunas de auditoria na user_profiles
ALTER TABLE public.user_profiles 
ADD COLUMN IF NOT EXISTS reset_resolved_by_name text,
ADD COLUMN IF NOT EXISTS reset_resolved_at timestamp with time zone;

-- 2. Atualização da função RPC atômica de aprovação de reset com trava de concorrência
CREATE OR REPLACE FUNCTION public.approve_password_reset(
  target_user_id uuid,
  approver_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_catalog
AS $$
DECLARE
  v_approver_name text;
  v_approver_role text;
  v_target_name text;
  v_target_email text;
  v_last_resolver text;
  v_resolved_at timestamptz;
BEGIN
  -- Validar permissão do aprovador (deve ser admin ou gerente ativo)
  SELECT name, role INTO v_approver_name, v_approver_role
  FROM public.user_profiles
  WHERE id = approver_id AND status = 'ativo';

  IF v_approver_role NOT IN ('admin', 'administrador', 'gerente') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'unauthorized',
      'message', 'Você não tem permissão para aprovar redefinição de senha.'
    );
  END IF;

  -- Tentativa atômica de atualização (apenas se reset_requested ainda for TRUE)
  UPDATE public.user_profiles
  SET reset_requested = false,
      reset_resolved_by_name = coalesce(v_approver_name, 'Gestor da Equipe'),
      reset_resolved_at = now()
  WHERE id = target_user_id 
    AND reset_requested = true
  RETURNING coalesce(name, email), email INTO v_target_name, v_target_email;

  -- Se nenhuma linha foi atualizada, outro gestor já processou a solicitação!
  IF NOT FOUND THEN
    SELECT reset_resolved_by_name, reset_resolved_at, coalesce(name, email)
    INTO v_last_resolver, v_resolved_at, v_target_name
    FROM public.user_profiles
    WHERE id = target_user_id;

    RETURN jsonb_build_object(
      'success', false,
      'already_resolved', true,
      'resolved_by', coalesce(v_last_resolver, 'Outro gestor'),
      'resolved_at', v_resolved_at,
      'target_name', v_target_name,
      'message', format('A solicitação de %s já foi atendida anteriormente por %s.', coalesce(v_target_name, 'este usuário'), coalesce(v_last_resolver, 'outro gestor'))
    );
  END IF;

  -- Sucesso atômico: este gestor foi o primeiro e único a aprovar
  RETURN jsonb_build_object(
    'success', true,
    'target_email', v_target_email,
    'target_name', v_target_name,
    'approved_by', v_approver_name
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_password_reset(uuid, uuid) TO authenticated;
```

---

### 3.2. Endpoint no Backend Cloud Run (`backend-crm-cloudrun/app.py`)

Adicionaremos a rota aberta (sem necessidade de token Bearer de sessão ativa) `/api/auth/notificar-solicitacao-reset`:

* **Método:** `POST`
* **Entrada:** `{ "email": "vendedor@consorflux.com" }`
* **Lógica:**
  1. Chama `request_password_reset(email)` no Supabase.
  2. Busca nome e foto do usuário em `user_profiles`.
  3. Busca todos os usuários com `role IN ('admin', 'gerente')` e seus respectivos tokens em `user_push_tokens`.
  4. Dispara mensagem via `firebase_admin.messaging.send_multicast` ou iteração com `messaging.send`.
  5. Retorna `{ "success": true }`.

---

### 3.3. Front-end do CRM (`consorflux/src`)

1. **`AuthScreens.jsx`:**
   * Adiciona o estado `isHelpMode: boolean`.
   * Quando `isHelpMode === true`, renderiza o formulário de solicitação de recuperação de senha.
   * Trata envios, erros, mensagem de ajuda pessoal caso não lembre o e-mail, e tela de confirmação.

2. **`NotificationModal.jsx`:**
   * Adiciona busca de usuários com `reset_requested === true` para perfis com permissão `admin` / `gerente`.
   * Renderiza card com avatar/foto do vendedor, nome, e-mail e botões de ação.
   * Ao clicar em `Resetar Senha`, chama `supabase.rpc('approve_password_reset', { target_user_id: user.id, approver_id: loggedUser.id })`.
   * Se o retorno for `success: true`:
     * Dispara `supabase.auth.resetPasswordForEmail(email, { redirectTo: 'https://app.consorflux.com' })`.
     * Exibe toast: `Reset autorizado! E-mail de redefinição enviado com sucesso para {email}.`
   * Se o retorno for `already_resolved: true`:
     * Não dispara e-mail.
     * Exibe alerta toast/banner: `Aviso: A solicitação de {nome} já foi aprovada por {resolved_by}.`
     * Atualiza a UI removendo a pendência.

3. **`AdminPanel.jsx`:**
   * Na listagem de colaboradores da equipe, insere o botão `Resetar Senha`.
   * Destaque com tag visual pulsante se `user.reset_requested` estiver ativo.
   * Utiliza a mesma função protegida contra concorrência.

---

## 4. Template de E-mail de Redefinição de Senha ConsorFlux

O template HTML corporativo foi formatado com compatibilidade universal (Gmail, Outlook, Apple Mail), logotipo oficial em alta definição, tipografia clara e links seguros:

* **Assunto:** `Redefinição de Senha - ConsorFlux CRM`
* **Logotipo:** `https://app.consorflux.com/ConsorFluxWhite.png`
* **Cores:** Fundo `#030712`, container `#0f172a`, borda `#1e293b`, CTA azul `#2563eb`, detalhes em laranja ConsorFlux.
* **Segurança:** Nota explícita de expiração de token em 1 hora, link de uso único e regras de privacidade.

---

## 5. Plano de Verificação

1. **Teste de Solicitação no Login:**
   * Acessar a tela de login deslogado, clicar em *"Precisa de ajuda para entrar?"*, digitar um e-mail válido e submeter.
   * Verificar se `user_profiles.reset_requested` mudou para `true`.
2. **Teste de Envio de Push Notification:**
   * Verificar se o dispositivo logado como administrador recebe a Web Push Notification do Firebase no Windows/Android.
3. **Teste de Concorrência e Trava Atômica:**
   * Simular aprovação simultânea de dois gestores (ou duas abas).
   * Confirmar que o primeiro aprova com sucesso e dispara o e-mail.
   * Confirmar que o segundo recebe a mensagem clara: *"A solicitação de {Usuário} já foi aprovada anteriormente por {Gestor 1}."* e nenhum e-mail duplicado é enviado.
4. **Teste de Envio do E-mail via Custom SMTP Gmail:**
   * Verificar a entrega do e-mail com remetente `ConsorFlux <consorflux@gmail.com>`.
   * Confirmar que o link `{{ .ConfirmationURL }}` abre a tela de definição de nova senha no CRM.
