# Especificação Técnica: Sistema de Web Push (FCM) e Correção da Geração de PDF no ConsorFlux

- **Data:** 10 de Outubro de 2026
- **Status:** Em Revisão
- **Aplicações:** `consorflux` (Frontend Vite/React) & `backend-crm-cloudrun` (Backend Google Cloud Run)

---

## 1. Visão Geral e Objetivos

O objetivo deste projeto é restaurar e aprimorar duas funcionalidades essenciais do CRM ConsorFlux:
1. **Sistema Completo de Notificações Web Push via Firebase Cloud Messaging (FCM):**
   - Permitir que os usuários (vendedores e administradores) recebam notificações no celular e no computador através do navegador web, mesmo quando o CRM estiver em segundo plano ou fechado.
   - Sincronizar o token do dispositivo com a tabela existente `public.user_push_tokens` no Supabase.
   - Implementar a regra de negócio para novos leads: disparar notificação com texto *"Você acabou de receber um novo lead. Clique para ver"* quando o lead vier da **Roleta de Leads/Webhook de Tráfego** ou for cadastrado manualmente por um terceiro (gestor/admin), suprimindo o envio quando o próprio vendedor cadastrar o lead para si mesmo.
   - Ao clicar na notificação, abrir a aplicação em `https://app.consorflux.com` e abrir automaticamente o modal de detalhes do lead correspondente.
2. **Correção do Gerador de PDF no Cloud Run (`/api/gerar-pdf-html`):**
   - Eliminar o travamento infinito e lentidão no botão de "Gerar e Baixar PDF" da tela de simulação.
   - Otimizar a execução do Playwright Chromium, substituindo o bloqueio de rede e `wait_until='networkidle'` por um carregamento ágil com timeout controlado e tratamento de exceção resiliente.

---

## 2. Arquitetura do Sistema de Notificações Web Push

### 2.1. Firebase Configuration & Chaves Oficiais
- **Projeto Firebase:** `a11-crm-notification`
- **Sender ID / Project Number:** `928056231230`
- **VAPID Key Pública:** `BN1iqr6YdpSRxBet21LQ7nwT7qTjZRRdPjvqn_U6br5K3Q0D4fHEs62poBCkNcleahBu8BoKcZktCmCtdpMgAQ0`
- **Credenciais do Servidor:** `firebase-adminsdk.json` já presente no container do Cloud Run.

### 2.2. Service Worker (`consorflux/public/firebase-messaging-sw.js`)
O Service Worker é servido diretamente na raiz da aplicação pelo Cloudflare Pages e é responsável por:
1. Escutar mensagens de push em segundo plano com o Firebase Compat SDK.
2. Tratar o evento `notificationclick`:
   - Extrair a URL alvo e o `lead_id` do payload `event.notification.data`.
   - Procurar entre as janelas abertas (`clients.matchAll({ type: 'window', includeUncontrolled: true })`).
   - Se já houver uma aba aberta em `app.consorflux.com`, focar nela e enviar uma mensagem `postMessage({ type: 'OPEN_LEAD_DETAILS', leadId })`.
   - Caso contrário, abrir uma nova aba com `https://app.consorflux.com/?lead_id={leadId}`.

### 2.3. Frontend Client (`consorflux/src/services/pushNotificationService.js`)
- Inicializa o Firebase Messaging usando a configuração oficial.
- Registra o Service Worker `firebase-messaging-sw.js`.
- Solicita permissão ao usuário (`Notification.requestPermission()`).
- Obtém o token FCM via `getToken(messaging, { vapidKey })`.
- Persiste o token no Supabase:
  ```sql
  INSERT INTO public.user_push_tokens (user_id, token, updated_at)
  VALUES (user_id, token, NOW())
  ON CONFLICT (user_id) DO UPDATE SET token = EXCLUDED.token, updated_at = NOW();
  ```
- Escuta mensagens em primeiro plano (`onMessage`):
  - Exibe Toast animado no topo da tela do CRM.
  - Registra a notificação no modal interno do CRM.

### 2.4. Integração no Layout do CRM (`consorflux/src/App.jsx` ou `Sidebar.jsx`)
- Adiciona o hook de ativação automática de push logo após a autenticação bem-sucedida do usuário.
- Escuta parâmetros de busca na URL (ex: `?lead_id=...`) ou mensagens do Service Worker (`OPEN_LEAD_DETAILS`) para abrir o modal de detalhes do lead automaticamente.

---

## 3. Regras de Negócio de Notificação de Novo Lead

### 3.1. Condições de Disparo
| Origem da Criação do Lead | Condição de Envio | Notificação Enviada? |
|---|---|---|
| **Roleta de Distribuição** | Lead atribuído ao vendedor selecionado | **SIM** (para o vendedor) |
| **Webhook de Tráfego / Meta** | Lead criado e associado ao vendedor | **SIM** (para o vendedor) |
| **Gestor / Admin** | `assigned_to != current_user.id` | **SIM** (para o vendedor atribuído) |
| **Vendedor (Próprio)** | `assigned_to == current_user.id` | **NÃO** (suprimido propositalmente) |

### 3.2. Formato da Notificação
- **Título:** `🎯 Novo Lead Recebido!`
- **Corpo:** `Você acabou de receber um novo lead. Clique para ver.`
- **Dados Extras (Data Payload):**
  ```json
  {
    "type": "NEW_LEAD",
    "lead_id": "<uuid-do-lead>",
    "url": "https://app.consorflux.com/?lead_id=<uuid-do-lead>"
  }
  ```

---

## 4. Backend Cloud Run (`backend-crm-cloudrun/app.py`)

### 4.1. Atualização da Função `enviar_notificacao_push`
- **Consulta ao Supabase:** Busca todos os tokens associados ao `user_id` na tabela `user_push_tokens`.
- **Destino Atualizado:** Substituir referências legadas a `https://a11crm.netlify.app` por `https://app.consorflux.com`.
- **Payload Completo:**
  ```python
  message = messaging.Message(
      notification=messaging.Notification(
          title=titulo,
          body=mensagem,
      ),
      webpush=messaging.WebpushConfig(
          notification=messaging.WebpushNotification(
              icon="/ConsorFlux_logoBlack.png",
              badge="/ConsorFlux_logoBlack.png",
              vibrate=[200, 100, 200]
          ),
          fcm_options=messaging.WebpushFCMOptions(
              link=url_destino
          )
      ),
      data={
          "click_action": "FLUTTER_NOTIFICATION_CLICK",
          "url": url_destino,
          "lead_id": str(lead_id) if lead_id else ""
      },
      token=token_destino
  )
  ```
- **Limpeza de Tokens Inválidos:** Se o Firebase retornar `messaging.UnregisteredError`, remover automaticamente o token expirado do Supabase para manter a base limpa.

---

## 5. Correção do Gerador de PDF no Cloud Run (`/api/gerar-pdf-html`)

### 5.1. Diagnóstico do Problema Atual
1. `page.route` aborta indiscriminadamente fontes e scripts (`route.abort()`).
2. O HTML gerado contém `@import url('https://fonts.googleapis.com...')` e links de CDN.
3. `page.set_content(html_content, wait_until='networkidle')` espera que a rede fique inativa, mas as conexões abortadas causam loops de retry interno no Chromium, estourando o timeout de 30s.

### 5.2. Correção Implementada
1. Alterar `wait_until` para `'load'`.
2. Liberar no `page.route` requisições legítimas para fontes do Google (`fonts.googleapis.com`, `fonts.gstatic.com`) e imagens do `ik.imagekit.io`.
3. Definir um timeout de segurança de 8 segundos no `set_content`.
4. Envolver a chamada em `try...except` com log detalhado e fallback claro.

---

## 6. Plano de Testes e Validação

1. **Validação do Endpoint de PDF:**
   - Realizar teste de ponta a ponta simulando uma proposta real com a conta administradora (`alessandroaun@gmail.com`).
   - Confirmar geração de PDF em menos de 2 segundos sem timeout.
2. **Validação do Push Notification:**
   - Testar o envio de notificação push pelo endpoint `/notificar` do Cloud Run para o `user_id` da conta administradora.
   - Confirmar recebimento do push no dispositivo/navegador.
   - Testar a regra de supressão: criar lead atribuído a si mesmo (sem push) vs. atribuído a outro vendedor (com push).
   - Validar abertura direta do modal de detalhes do lead ao clicar na notificação.
