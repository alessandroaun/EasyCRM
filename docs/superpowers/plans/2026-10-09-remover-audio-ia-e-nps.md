# Remoção de Mensagens de Áudio (IA) e NPS Satisfação - Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) ou superpowers:executing-plans para implementar este plano passo a passo. Os passos usam a sintaxe de checkbox (`- [ ]`) para rastreamento.

**Goal:** Remover completamente a tela e funcionalidades de Mensagens de Áudio (IA) (geração de voz por texto e clonagem de voz) e a tela/menu de NPS Satisfação do ConsorFlux CRM, mantendo 100% intactas todas as demais funcionalidades de IA (Mentoria, Chat de Objeções, Transcrição de Áudio de Mensagens, Estúdio de Criativos, Roleta, etc.) e o backend.

**Architecture:** A aplicação ConsorFlux é um SPA React + Vite + Tailwind CSS (`c:\PCALE-rede\crm-a11\EasyCRM\consorflux`). A rota `/audio-ia` e o componente `AudioIAScreen.jsx` serão desativados e removidos do menu e roteador; a aba "Áudio IA" com Pocket-TTS no modal de agendamentos (`NovoAgendamentoModal.jsx`) será removida, preservando o envio de texto, gravação de microfone e mídia; o menu e rota de `/nps` (`NPSScreen.jsx`) serão removidos do Sidebar e do App. O proxy `/api/tts` do Vite continuará sem impacto em `/api/ai/flux` ou outros serviços.

**Tech Stack:** React 18, Vite 6, Tailwind CSS, React Router DOM, Lucide Icons.

---

### Task 1: Remover Rota e Menu de Mensagens de Áudio (IA) e NPS no Layout Principal

**Files:**
- Modify: `c:\PCALE-rede\crm-a11\EasyCRM\consorflux\src\App.jsx`
- Modify: `c:\PCALE-rede\crm-a11\EasyCRM\consorflux\src\components\layout\Sidebar.jsx`

**Interfaces:**
- Consumes: Navegação do React Router e Menu Lateral
- Produces: Sidebar e rotas limpas sem `/audio-ia` e `/nps`

- [ ] **Step 1: Remover imports e rotas de `/audio-ia` e `/nps` em `App.jsx`**
  - Remover `import NPSScreen from './components/nps/NPSScreen';` e `import AudioIAScreen from './components/audio/AudioIAScreen';`.
  - Remover `audio_ia: '/audio-ia'` e `nps: '/nps'` do mapeamento `VIEW_TO_PATH`.
  - Remover `<Route path="/audio-ia" element={<AudioIAScreen />} />` e `<Route path="/nps" element={<NPSScreen />} />`.

- [ ] **Step 2: Remover itens de menu em `Sidebar.jsx`**
  - Na seção `Atendimento`, remover `{ id: 'audio_ia', path: '/audio-ia', label: 'Mensagens de Áudio (IA)', icon: Mic }`.
  - Na seção `Financeiro & Gestão`, remover `{ id: 'nps', path: '/nps', label: 'NPS Satisfação', icon: HeartHandshake }`.
  - Remover import não utilizado `HeartHandshake` de `lucide-react` (se não for usado em outro lugar).

---

### Task 2: Remover Aba de Áudio IA do Modal de Agendamentos

**Files:**
- Modify: `c:\PCALE-rede\crm-a11\EasyCRM\consorflux\src\components\agendamentos\NovoAgendamentoModal.jsx`

**Interfaces:**
- Consumes: `NovoAgendamentoModal.jsx`
- Produces: Modal de agendamento focado em Texto, Gravação de Microfone autêntica e Mídia/Anexos (sem dependência de Pocket-TTS nem clonagem)

- [ ] **Step 1: Limpar imports e estados de Áudio IA em `NovoAgendamentoModal.jsx`**
  - Remover import `pocketTtsService` de `../../services/pocketTtsService`.
  - Remover estados relacionados a áudio IA (`voiceReference`, `isSynthesizing`, `handleGenerateAudioPreview`).
  - Atualizar o grid de abas de `grid-cols-4` para `grid-cols-3` contendo apenas: **Texto**, **Gravar** (microfone nativo) e **Mídia**.
  - Remover o bloco JSX renderizado sob `{activeTab === 'audio_ai' && ...}`.
  - Remover o ramo de `activeTab === 'audio_ai'` dentro de `handleSubmit`.

---

### Task 3: Remover Componentes e Serviços Obsoletos de Áudio IA e NPS

**Files:**
- Delete: `c:\PCALE-rede\crm-a11\EasyCRM\consorflux\src\components\audio\AudioIAScreen.jsx`
- Delete: `c:\PCALE-rede\crm-a11\EasyCRM\consorflux\src\components\nps\NPSScreen.jsx`
- Delete: `c:\PCALE-rede\crm-a11\EasyCRM\consorflux\src\services\pocketTtsService.js`
- Modify: `c:\PCALE-rede\crm-a11\EasyCRM\consorflux\vite.config.js` (opcional: remover proxy `/api/tts` inativo)

- [ ] **Step 1: Excluir os arquivos dos componentes e serviço que foram descontinuados**
- [ ] **Step 2: Limpar proxy `/api/tts` do `vite.config.js` sem tocar no proxy do Flux ou outras rotas**

---

### Task 4: Validação e Teste de Build de Produção

**Files:**
- Test: Build Vite completo em `consorflux`

- [ ] **Step 1: Executar `npm run build` na pasta `consorflux`**
  - Garantir 0 erros de compilação, 0 erros de sintaxe ou imports quebrados.
- [ ] **Step 2: Verificar que as demais funções de IA permanecem 100% funcionais**
  - Mentor IA (`MentorChatModal.jsx`), Transcrição de áudio recebido (`useAudioTranscription.js`), Estúdio de Criativos (`CreativeStudioScreen.jsx` / Flux AI) intocados.
