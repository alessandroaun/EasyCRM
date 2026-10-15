# Guia de Ativação do Custom SMTP Gmail & Template no Supabase

Este guia documenta o passo a passo exato para aplicar o Custom SMTP corporativo com o Gmail (`consorflux@gmail.com`) e o Template Corporativo Dark do ConsorFlux no Supabase.

---

## 1. Credenciais do Servidor SMTP (Gmail)

Acesse o **Supabase Dashboard**:
👉 **URL:** [https://supabase.com/dashboard/project/ygfitekotpgydiolcyry/settings/auth](https://supabase.com/dashboard/project/ygfitekotpgydiolcyry/settings/auth)  
Navegue até a seção: **"SMTP Settings"** e ative o switch **"Enable Custom SMTP"**.

Preencha os campos com as configurações abaixo:

| Campo | Valor Exato | Observação |
|---|---|---|
| **Sender email** | `consorflux@gmail.com` | E-mail de remetente visível para os colaboradores |
| **Sender name** | `ConsorFlux CRM` | Nome de exibição na caixa de entrada |
| **Host** | `smtp.gmail.com` | Servidor SMTP do Google Workspace / Gmail |
| **Port** | `465` | Porta SSL segura (recomendada) ou `587` (TLS) |
| **Encryption** | `SSL` (ou `TLS` se porta 587) | Protocolo de segurança |
| **Username** | `consorflux@gmail.com` | Conta Google com verificação em duas etapas ativa |
| **Password** | `dxzq inal qbxd gbxn` *(sem espaços: `dxzqinalqbxdgbxn`)* | Senha de App de 16 caracteres gerada na Conta Google |

Clique em **Save**.

---

## 2. Configuração do Template de E-mail de Redefinição de Senha

No mesmo menu lateral do Supabase:
👉 **Menu:** **Authentication** > **Email Templates** > **Reset Password**

### Assunto do E-mail (Subject)
```text
Redefinição de Senha - ConsorFlux CRM
```

### Código HTML do Template
Abra o arquivo [`consorflux/templates/email-reset-password.html`](file:///c:/PCALE-rede/crm-a11/EasyCRM/consorflux/templates/email-reset-password.html), copie todo o seu conteúdo HTML e cole no campo **Body** do template.

### Principais recursos do template:
- **Logotipo Oficial:** Exibe a logo oficial em alta resolução hospedada no próprio Supabase Storage (`https://ygfitekotpgydiolcyry.supabase.co/storage/v1/object/public/public-assets/ConsorFluxWhite.png`).
- **Design Escuro (Dark Mode):** Alinhado à paleta corporativa moderna do ConsorFlux CRM (`#030712`, `#0f172a`, gradiente azul).
- **Variável Supabase Nativa:** Contém `{{ .ConfirmationURL }}` no botão principal e como link alternativo.
- **Avisos de Segurança:** Alerta de expiração de 60 minutos, uso único e canal de suporte caso o usuário não tenha feito o pedido.

---

## 3. URLs de Redirecionamento (Redirect URLs)

Para garantir que o link de redefinição abra o sistema corretamente:
👉 **Menu:** **Authentication** > **URL Configuration**

Verifique se a lista de **Redirect URLs** contém:
- `https://app.consorflux.com`
- `https://app.consorflux.com/**`
- `http://localhost:5173/**` (para desenvolvimento local)

---

## 4. Teste de Disparo

Após salvar:
1. Acesse o CRM em `https://app.consorflux.com` (ou ambiente local).
2. Na tela de login, clique em **"Precisa de ajuda para entrar?"**.
3. Digite o e-mail cadastrado e envie a solicitação.
4. Como Gestor/Admin, abra a **Central de Notificações** ou a **Gestão da Equipe** (`/admin`) e clique em **Resetar Senha**.
5. O colaborador receberá o e-mail com a identidade visual completa do ConsorFlux disparado diretamente pelo Gmail (`consorflux@gmail.com`).
