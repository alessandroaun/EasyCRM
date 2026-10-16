# Especificação Técnica: Aba de Conversa WhatsApp no Modal do Lead e Abertura Rápida via Card

- **Data:** 2026-10-06
- **Status:** Aprovado para Planejamento
- **Autor:** Antigravity & Pair Programming

---

## 1. Visão Geral & Objetivos

Integrar a experiência completa de chat do WhatsApp e os recursos de Inteligência Artificial do **MentorIA** diretamente no modal de detalhes do cliente (`ClientDetailsModal`), acessível pelo **Painel de Leads** (`A11_CRM`).

### Principais Objetivos:
1. **Aba "Conversa WhatsApp" no Modal:** Incluir uma aba lateral esquerda no `ClientDetailsModal` que exibe a conversa do WhatsApp exclusivamente vinculada ao lead em questão.
2. **Funcionalidades Completas de Chat:** Fornecer envio e recebimento de mensagens de texto, áudios de voz gravados via microfone, envio de mídias (fotos, vídeos, documentos), visualização de status de entrega (`pending`, `sent`, `delivered`, `read`) e players de áudio com transcrição integrada.
3. **MentorIA Integrado:** Disponibilizar os recursos de IA cognitiva já ativos na Central de Conversas:
   - *Sugerir Resposta ao Lead* (`REPLY`)
   - *Quebra de Objeção* (`OBJECTION`)
   - *Abordagem com Oferta* (`OFFER`)
   - *Análise da Conversa* (`ANALYZE`)
4. **Atalho Direto no Card do Lead (`ClientCard`):** Alterar o comportamento do botão de WhatsApp no card do Kanban. Em vez de abrir uma aba externa no navegador (`wa.me/...`), o clique acionará a abertura imediata do `ClientDetailsModal` já posicionado na aba `"whatsapp"`.
5. **Layout Otimizado (Abordagem A):** Quando a aba "Conversa WhatsApp" estiver ativa, a coluna de histórico/atividades e o rodapé de formulário ("Salvar Alterações") serão recolhidos para conceder 100% de área útil ao chat e suas interações em tempo real.

---

## 2. Arquitetura de Componentes

### 2.1 Novo Componente: `LeadWhatsAppChatTab.jsx`
- **Caminho:** `A11_CRM/src/components/chat/LeadWhatsAppChatTab.jsx`
- **Props:**
  - `lead`: Objeto completo com dados do cliente (`id`, `name`, `phone`, `desiredCredit`, `phaseTitle`, etc.).
  - `onCloseModal`: Callback opcional para fechar o modal.
- **Responsabilidades:**
  - Identificar ou inicializar o registro da conversa no Supabase (`whatsapp_chats`) baseado nas variantes do telefone brasileiro (`arePhonesEquivalent`, `getPhoneVariants`).
  - Filtrar mensagens estritamente pelo lead atual e pelo usuário autenticado (`user_id`).
  - Escutar atualizações e novas mensagens em tempo real via Supabase Realtime (`postgres_changes` em `whatsapp_messages`).
  - Integrar chamadas à Evolution API (`evolutionApi.sendTextMessage`, `evolutionApi.sendWhatsAppAudio`, `evolutionApi.sendMediaMessage`).
  - Implementar gravação de voz com `MediaRecorder` nativo, compressão de imagens via `canvas`, e player de áudio com transcrição Whisper via `AudioTranscriptionService`.
  - Integrar menu suspenso do MentorIA conectado a `${BACKEND_URL}/api/ai/mentoria`.

### 2.2 Modificações em `ClientDetailsModal.jsx`
- Adicionar `'whatsapp'` à lista de abas (`activeTab`).
- Incluir item na navegação lateral esquerda:
  ```javascript
  { id: 'whatsapp', label: 'Conversa WhatsApp', icon: MessageSquare }
  ```
- Suportar prop `initialTab` (padrão `'informacoes'`). Quando fornecido `'whatsapp'`, inicializar `activeTab` diretamente em `'whatsapp'`.
- Na área central:
  ```jsx
  {activeTab === 'whatsapp' && (
    <LeadWhatsAppChatTab lead={formData} onCloseModal={onClose} />
  )}
  ```
- Condicionar a coluna direita de atividades e o rodapé:
  ```jsx
  {activeTab !== 'proposta' && activeTab !== 'whatsapp' && (
    /* Coluna Direita & Rodapé */
  )}
  ```

### 2.3 Modificações em `ClientCard.jsx`
- Substituir o `window.open('https://wa.me/...')` em `handleOpenWhatsApp`:
  ```javascript
  const handleOpenWhatsApp = (e) => {
    e.stopPropagation();
    crmActivityTracker.recordInteraction('WHATSAPP_CLICK', { clientId: client.id, name: client.name });
    if (onOpenDetails) {
      onOpenDetails(client, phaseId, 'whatsapp');
    }
  };
  ```

### 2.4 Propagação de Prop `initialTab`
- `KanbanColumn.jsx`: repassar argumentos de `onOpenDetails(client, phaseId, initialTab)`.
- `KanbanBoard.jsx`: repassar argumentos de `onOpenDetails(client, phaseId, initialTab)`.
- `App.jsx`:
  - Criar estado `const [detailsInitialTab, setDetailsInitialTab] = useState('informacoes');`.
  - No handler do Kanban:
    ```javascript
    onOpenDetails={(client, phaseId, initialTab = 'informacoes') => {
      setSelectedClientDetails(client);
      setDetailsPhaseId(phaseId);
      setDetailsInitialTab(initialTab);
    }}
    ```
  - Repassar `initialTab={detailsInitialTab}` para `<ClientDetailsModal ... />`.

---

## 3. Fluxo de Dados e Segurança

1. **Blindagem de Privacidade Multi-Usuário:**
   - As consultas e inserções filtram explicitamente por `user_id` e variantes de telefone do lead.
   - Mensagens de outros clientes ou outros corretores nunca são misturadas ou exibidas.
2. **Detecção de Conexão com a Evolution API:**
   - O componente verifica o status da instância ativa do WhatsApp.
   - Caso esteja desconectada, exibe banner informativo claro no topo do chat orientando o vendedor a reconectar.
3. **Resiliência a Números Ausentes ou Inválidos:**
   - Se o lead não tiver telefone cadastrado no CRM, a aba exibe estado informativo com atalho direto para preenchimento na aba "Dados Pessoais".
4. **Respostas da IA (Anti-Eco e Inserção Otimizada):**
   - Respostas geradas pelo MentorIA são inseridas diretamente no campo de texto para que o vendedor revise e edite antes de enviar.
   - Filtro anti-eco impede que a resposta repita a última fala do cliente.

---

## 4. Plano de Validação & Testes

1. **Verificação de Build:** Executar `npm run build` na pasta `A11_CRM` garantindo zero erros de compilação ou tipagem.
2. **Teste do Fluxo de Navegação:**
   - Clicar no botão verde de WhatsApp no card de um lead no Kanban.
   - Verificar se o modal abre imediatamente na aba "Conversa WhatsApp".
   - Abrir o card pelo clique comum e verificar se a aba padrão continua sendo "Informações", com a aba "Conversa WhatsApp" acessível no menu lateral.
3. **Teste de Interação de Chat:**
   - Enviar mensagem de texto e validar inserção imediata e status.
   - Testar o acionamento de ações do MentorIA (*Resposta ao lead*, *Quebra de Objeção*, *Abordagem com Oferta*).
   - Validar responsividade no tema escuro e claro.
