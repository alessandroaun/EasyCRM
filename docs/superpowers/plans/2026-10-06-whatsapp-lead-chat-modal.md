# Aba de Conversa WhatsApp no Modal do Lead — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrar a Central de Conversas WhatsApp com MentorIA diretamente no modal de detalhes do cliente (`ClientDetailsModal`) e acionar a abertura direta dessa conversa através do botão de WhatsApp no card do Kanban (`ClientCard`).

**Architecture:** Criação do componente isolado e autônomo `LeadWhatsAppChatTab.jsx` encapsulando Supabase Realtime, Evolution API e rotas do MentorIA. Integração como aba `'whatsapp'` no `ClientDetailsModal` com layout dedicado (Abordagem A: espaço total para o chat). Propagação do parâmetro `initialTab` a partir do `ClientCard` através da árvore Kanban até o `App.jsx`.

**Tech Stack:** React 18, Vite, Tailwind CSS, Lucide React, Supabase Client & Realtime, Evolution API, MentorIA API (`/api/ai/mentoria`).

**Spec:** `docs/superpowers/specs/2026-10-06-whatsapp-lead-chat-modal-design.md`

## Global Constraints
- Isolamento estrito de conversas: somente mensagens associadas ao telefone do lead atual e do corretor logado (`user_id`).
- Manter compatibilidade com temas Dark/Light mode (`ThemeContext`).
- Preservar integridade dos formulários e notas existentes do lead.
- Respeitar regra anti-eco nas respostas geradas pelo MentorIA.

## Review Focus
1. Lead sem telefone cadastrado: deve renderizar aviso amigável sem quebrar o componente.
2. WhatsApp desconectado: deve exibir banner de alerta orientando a conexão via Evolution API.
3. Clique no botão de WhatsApp do card: deve abrir o modal já na aba 'whatsapp' sem abrir aba externa do navegador.
4. Clique no card fora do botão de WhatsApp: deve abrir o modal na aba padrão 'informacoes'.
5. MentorIA: as ações de resposta, quebra de objeção e oferta devem preencher o campo de texto sem sobrescrever digitação em andamento indevidamente.

---

### Task 1: Criação do Componente `LeadWhatsAppChatTab.jsx`

**Files:**
- Create: `A11_CRM/src/components/chat/LeadWhatsAppChatTab.jsx`

**Interfaces:**
- Consumes:
  - `lead`: `{ id, name, phone, desiredCredit, phaseTitle, ... }`
  - `useAuth`: `{ user, userProfile }`
  - `useTheme`: `{ isDarkMode }`
  - `useBoard`: `{ showToast }`
  - `evolutionApi`: `sendTextMessage(inst, to, text, uid)`, `sendWhatsAppAudio(inst, to, b64, uid)`, `sendMediaMessage(inst, to, payload, uid)`, `fetchInstances()`, `fetchProfilePictureUrl(...)`
  - `supabase`: queries em `whatsapp_chats`, `whatsapp_messages`, `whatsapp_conversation_analysis` e subscrição Realtime.
  - `authenticatedFetch`: `/api/ai/mentoria`, `/api/ai/transcribe-audio`
- Produces:
  - Componente React default export `<LeadWhatsAppChatTab lead={lead} onCloseModal={onCloseModal} />`

- [ ] **Step 1: Criar o arquivo `LeadWhatsAppChatTab.jsx` com a estrutura base de estado e conexão com a Evolution API**
- [ ] **Step 2: Implementar busca e escuta em tempo real (Supabase Realtime) das mensagens filtradas pelo telefone do lead**
- [ ] **Step 3: Implementar envio de mensagens de texto com inserção otimista**
- [ ] **Step 4: Implementar gravador de voz com `MediaRecorder` nativo e envio de áudio via Evolution API**
- [ ] **Step 5: Implementar menu de ações do MentorIA (`REPLY`, `OBJECTION`, `OFFER`, `ANALYZE`)**
- [ ] **Step 6: Adicionar tratamento para lead sem telefone ou instância desconectada**

---

### Task 2: Integração da Aba "Conversa WhatsApp" no `ClientDetailsModal.jsx`

**Files:**
- Modify: `A11_CRM/src/components/leads/ClientDetailsModal.jsx`

**Interfaces:**
- Consumes:
  - `initialTab`: string opcional (ex: `'whatsapp'` ou `'informacoes'`)
  - `LeadWhatsAppChatTab`: componente de chat
- Produces:
  - Aba lateral `'whatsapp'` no menu de navegação
  - Renderização de `<LeadWhatsAppChatTab lead={formData} onCloseModal={onClose} />`
  - Ocultamento da coluna de notas e rodapé quando `activeTab === 'whatsapp'`

- [ ] **Step 1: Adicionar prop `initialTab = 'informacoes'` ao componente `ClientDetailsModal`**
- [ ] **Step 2: Sincronizar `activeTab` com `initialTab` quando o modal é aberto ou quando `initialTab` muda**
- [ ] **Step 3: Adicionar a aba `{ id: 'whatsapp', label: 'Conversa WhatsApp', icon: MessageSquare }` no menu lateral**
- [ ] **Step 4: Renderizar `<LeadWhatsAppChatTab lead={formData} onCloseModal={onClose} />` quando `activeTab === 'whatsapp'`**
- [ ] **Step 5: Ajustar as condições da coluna direita de notas e do rodapé para ficarem ocultos na aba `'whatsapp'`**

---

### Task 3: Atualização do Botão de WhatsApp no `ClientCard.jsx`

**Files:**
- Modify: `A11_CRM/src/components/kanban/ClientCard.jsx`

**Interfaces:**
- Consumes:
  - `onOpenDetails(client, phaseId, initialTab)`
- Produces:
  - `handleOpenWhatsApp` chamando `onOpenDetails(client, phaseId, 'whatsapp')` com `e.stopPropagation()`

- [ ] **Step 1: Modificar `handleOpenWhatsApp` em `ClientCard.jsx` para acionar `onOpenDetails(client, phaseId, 'whatsapp')`**
- [ ] **Step 2: Garantir `e.stopPropagation()` para não disparar o clique padrão do card**

---

### Task 4: Propagação de `initialTab` no Pipeline Kanban e `App.jsx`

**Files:**
- Modify: `A11_CRM/src/components/kanban/KanbanColumn.jsx`
- Modify: `A11_CRM/src/components/kanban/KanbanBoard.jsx`
- Modify: `A11_CRM/src/App.jsx`

**Interfaces:**
- Consumes:
  - `onOpenDetails(client, phaseId, initialTab)`
- Produces:
  - Estado `detailsInitialTab` em `App.jsx` repassado para `ClientDetailsModal`

- [ ] **Step 1: Garantir que `KanbanColumn.jsx` propague `onOpenDetails(client, phaseId, initialTab)`**
- [ ] **Step 2: Garantir que `KanbanBoard.jsx` propague `onOpenDetails(client, phaseId, initialTab)`**
- [ ] **Step 3: Em `App.jsx`, adicionar estado `detailsInitialTab` e passar `initialTab={detailsInitialTab}` para `<ClientDetailsModal ... />`**

---

### Task 5: Validação, Build de Produção e Testes

**Files:**
- Check: Todo o projeto `A11_CRM`

- [ ] **Step 1: Executar `npm run build` no diretório `A11_CRM` para checar 0 erros de compilação**
- [ ] **Step 2: Validar em tempo de execução o funcionamento da aba no modal e a ação do card**
