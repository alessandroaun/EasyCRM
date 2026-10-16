# Especificação de Design: Níveis de Acesso, Supervisão Hierárquica e Ações em Massa

**Data:** 16 de Outubro de 2026  
**Status:** Aprovado em Brainstorming  
**Autor:** Antigravity & Liderança ConsorFlux  
**Escopo:** ConsorFlux Web CRM (`consorflux/`) e Backend Cloud Run (`backend-crm-cloudrun/`)

---

## 1. Visão Geral e Objetivos

O ConsorFlux CRM adota uma estrutura hierárquica estrita dividida em 4 níveis de acesso:
1. **Administrador (`admin` / `administrador`):** Acesso corporativo irrestrito a todos os dados, configurações, equipes e vendedores da empresa. Não pertence a nenhuma equipe específica (`"Sem Equipe"`).
2. **Gerente (`gerente`):** Acesso executivo a todas as equipes e vendedores para acompanhamento de métricas, auditoria e distribuição de leads. Não pertence a nenhuma equipe específica (`"Sem Equipe"`).
3. **Supervisor (`supervisor`):** Liderança operacional de **uma única equipe comercial**. Possui visão consolidada e individual dos vendedores sob sua supervisão.
4. **Vendedor (`vendedor`):** Nível operacional vinculado a uma equipe comercial. Acessa estritamente sua própria carteira de leads, histórico e conversas.

### Principais Objetivos Desta Evolução
* **Atribuição "Sem Equipe":** Impedir que Administradores e Gerentes sejam associados a equipes comerciais isoladas, tornando "Sem Equipe" a opção nativa.
* **Filtros Inteligentes no Topbar (`HierarchyFilterSelectors.jsx`):** Permitir que gestores alternem com 1 clique entre sua carteira própria, visão unificada da equipe (**"Todos"**) e vendedores individuais.
* **Painel de Leads Unificado ("Todos"):** Empilhar e somar os leads de todos os vendedores do escopo com identificação visual do responsável em cada card.
* **Ações em Massa Aprimoradas:** Introduzir exclusão em massa para a lixeira e transferência em massa de leads para a fase **"Novo Cliente"** de outro vendedor, com preservação integral do histórico e envio de notificação push em tempo real.
* **Modo Auditoria Ético (Somente Leitura):** Permitir que supervisores e gerentes consultem conversas do WhatsApp, histórico de disparos e agendamentos de vendedores sem permissão de escrita ou resposta em nome do colaborador.

---

## 2. Arquitetura de Papéis e Vínculo de Equipes

### Matriz de Papéis e Equipes

| Papel (`role`) | Vínculo de Equipe (`team`) | Visualização no Navbar de Equipes | Visualização no Navbar de Vendedores |
| :--- | :--- | :--- | :--- |
| **Administrador** | Fixo em `"Sem Equipe"` | Todas as Equipes, Equipes específicas, `"Sem Equipe"` | ⭐ Minha Carteira, 👥 Todos, Vendedores da equipe filtrada |
| **Gerente** | Fixo em `"Sem Equipe"` | Todas as Equipes, Equipes específicas, `"Sem Equipe"` | ⭐ Minha Carteira, 👥 Todos, Vendedores da equipe filtrada |
| **Supervisor** | Equipe Comercial Obrigatória | Fixo na sua equipe (`👥 [Nome da Equipe]`) | ⭐ Minha Carteira, 👥 Todos (sua equipe), Vendedores da equipe |
| **Vendedor** | Equipe Comercial Obrigatória | Oculto (Navbar não exibe seletores) | Fixo em sua carteira própria |

### Atualizações no Painel Administrativo (`AdminPanel.jsx`)
* A lista de equipes para cadastro e edição de colaboradores passa a incluir formalmente a opção **"Sem Equipe"**.
* Quando o cargo selecionado for `Administrador` ou `Gerente`, o seletor de equipe é automaticamente definido e bloqueado como `"Sem Equipe"`.
* Na tabela de usuários, administradores e gerentes exibem a tag `"Sem Equipe"`.

---

## 3. Seletores no Navbar Superior (`HierarchyFilterSelectors.jsx`)

### 1. Seletor de Equipes
* **Administrador e Gerente:**
  * Dropdown contendo:
    * `ALL` $\rightarrow$ *"Todas as Equipes"*
    * Equipes cadastradas (ex: *"Equipe Principal"*, *"Equipe Alpha"*, *"Equipe Beta"*)
    * `SEM_EQUIPE` $\rightarrow$ *"Sem Equipe"*
* **Supervisor:**
  * Exibe um card fixo e elegante: `👥 [Equipe Supervisionada]`, sem permissão de alternar para outras equipes da empresa.

### 2. Seletor de Vendedores / Carteira
* Opções disponíveis no menu suspenso:
  1. ⭐ **Minha Carteira:** Carrega o painel pessoal do usuário autenticado (`currentBoardUserId = null`).
  2. 👥 **Todos (`currentBoardUserId = 'ALL'`):**
     * Para **Supervisor:** Agrega todos os vendedores da sua equipe.
     * Para **Gerente / Admin com "Todas as Equipes":** Agrega todos os vendedores da empresa.
     * Para **Gerente / Admin com Equipe específica:** Agrega todos os vendedores daquela equipe selecionada.
  3. **Vendedores Individuais:**
     * Exibe o nome completo do vendedor com cargo e equipe:
       `Carlos Silva - Vend [Equipe Alpha]`
     * O próprio supervisor também pode ser selecionado como vendedor para inspecionar seus leads.

---

## 4. Painel de Leads (Kanban) e Cards

### 1. Visualização Agregada ("Todos")
* Quando `currentBoardUserId === 'ALL'`, o `BoardContext` executa consulta única no Supabase:
  ```javascript
  const targetIds = scopeSellers.map(u => u.id);
  const { data: boards } = await boardDb
    .from('crm_boards')
    .select('user_id, data_payload')
    .in('user_id', targetIds)
    .ilike('id', 'board_%');
  ```
* Os cards de cada fase são concatenados em uma lista única.
* Cada card recebe os metadados:
  * `responsibleUserId: board.user_id`
  * `responsibleUserName: seller.name || seller.email`

### 2. Identificação do Vendedor no Card (`ClientCard.jsx`)
* Em cada card no Kanban, ao lado ou logo abaixo do nome do cliente, é exibido um selo compacto:
  ```jsx
  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-slate-800 text-slate-300 border border-slate-700/60">
    <User size={9} />
    <span>{firstName}</span>
  </span>
  ```

---

## 5. Ações em Massa no Kanban (`KanbanBoard.jsx`)

Ao marcar cards no modo de seleção em massa, gestores (`supervisor`, `gerente`, `admin`) têm acesso a:

### 1. Mover em Massa (Existente)
* Seleciona a fase de destino e move os cards no board ativo.

### 2. Excluir em Massa (Lixeira)
* Abre modal de confirmação:
  * Título: *"Mover [X] Leads para a Lixeira"*
  * Mensagem: *"Os cards selecionados serão removidos das colunas ativas e guardados na lixeira, podendo ser restaurados posteriormente."*
  * Ao confirmar, remove os cards das fases ativas e insere no array `trash` com `deletedAt`.

### 3. Transferir em Massa para Outro Vendedor
* Abre modal de transferência:
  * **Seletor de Destino:**
    * Para **Supervisor:** Dropdown com vendedores da sua equipe (Primeiro e Segundo Nome).
    * Para **Gerente/Admin:** Seletor de Equipe + Seletor de Vendedor filtrado.
  * **Regra de Negócio (Opção B Aprovada):**
    * Os leads transferidos são inseridos obrigatoriamente na fase **"Novo Cliente"** (`phase_1`) do vendedor de destino.
    * **Preservação de Dados:** Nome, telefone, CPF, valores, propostas, agendamentos, tags, resumo de IA e notas são 100% mantidos.
    * **Nota Automática de Auditoria:**
      ```
      📌 Transferência de Carteira: Lead transferido de [Vendedor Origem] para [Vendedor Destino] em DD/MM/AAAA às HH:mm por [Nome do Gestor].
      ```
  * **Notificação Web Push Firebase:**
    * Ao concluir a transferência, o backend dispara uma notificação push para os dispositivos registrados do vendedor destinatário:
      * **Título:** `🎯 Novos Leads Transferidos`
      * **Corpo:** `Você recebeu [X] lead(s) transferidos por [Nome do Gestor]. Acesse a coluna "Novo Cliente" no seu painel!`
      * **Deep-Link:** `https://app.consorflux.com/?open_lead_board=true`

---

## 6. Agregação em Visão Geral e Minha Central

Quando `currentBoardUserId === 'ALL'`:

1. **Visão Geral (`InformacoesGerais.jsx`):**
   * **Volume Total Fechado (R$):** $\sum (\text{Vendas Fechadas dos Vendedores})$.
   * **Total de Leads Ativos:** $\sum (\text{Leads nas Fases Ativas})$.
   * **Ticket Médio (R$):** $\frac{\text{Volume Total Fechado}}{\text{Total de Vendas Fechadas}}$.
   * **Taxa de Conversão (%):** Média aritmética das taxas de conversão individuais dos vendedores.
   * **Taxa de Perda (%):** Média aritmética das taxas de perda individuais.

2. **Minha Central (`MinhaCentral.jsx`):**
   * Permite alternar entre o desempenho somado da equipe ou o extrato de pontuação e atividades do vendedor selecionado.

---

## 7. Modo Auditoria Ético (WhatsApp, Disparos e Agendamentos)

Nas telas de comunicação e rotinas:

1. **Regra de Inaplicabilidade de "Todos":**
   * Nas telas `Conversas WhatsApp`, `Disparo em Massa` e `Agendamentos`, a opção **"Todos"** fica inabilitada.
   * Se o gestor estiver com "Todos" ativo no Navbar e entrar nessas telas, o sistema exibe os dados da própria conta do gestor.

2. **Modo Somente Leitura ao Inspecionar Vendedor:**
   * **WhatsApp (`ConversasChat.jsx`):**
     * Carrega as conversas e mensagens vinculadas ao `user_id` do vendedor inspecionado.
     * Exibe banner no topo da conversa:
       > `👀 Modo de Supervisão (Somente Leitura): Você está consultando o histórico de conversas de [Nome]. O envio de mensagens e interação é exclusivo da conta do colaborador.`
     * Desabilita input de texto, botão de gravação de áudio, botão de envio, upload de mídia e ações do Mentor IA.
   * **Disparo em Massa (`DisparosScreen.jsx`):**
     * Permite visualizar apenas a aba **Histórico de Disparos** do vendedor.
     * Desabilita botões de criar novos disparos ou importar contatos.
   * **Agendamentos (`AgendamentosScreen.jsx`):**
     * Exibe calendário e lista de compromissos do vendedor em modo leitura (sem botões de criar ou editar agendamentos).

---

## 8. Backend Cloud Run: Rota de Notificação de Transferência

### Novo Endpoint (`backend-crm-cloudrun/app.py`):
* **Rota:** `POST /api/leads/notificar-transferencia`
* **Payload:**
  ```json
  {
    "target_user_id": "uuid-do-vendedor",
    "lead_count": 3,
    "sender_name": "Nome do Gestor"
  }
  ```
* **Comportamento:**
  * Busca os tokens em `public.user_push_tokens` para `target_user_id`.
  * Envia notificação multicast via `messaging.send_each_for_multicast`.
  * Trata tokens expirados ou duplicados com colapso por `tag = "transfer_<timestamp>"`.

---

## 9. Plano de Verificação

1. **Testes de Navegação & Filtros:**
   * Acessar como Administrador $\rightarrow$ verificar seletor de equipes com "Todas", equipes e "Sem Equipe".
   * Acessar como Supervisor $\rightarrow$ verificar seletor fixo na equipe do supervisor e lista contendo apenas seus vendedores + "Minha Carteira" + "Todos".
2. **Testes de Kanban & Ações em Massa:**
   * Selecionar "Todos" $\rightarrow$ conferir cards empilhados com badge `👤 [Nome]`.
   * Selecionar 2 leads e transferir para outro vendedor $\rightarrow$ verificar se apareceram na coluna "Novo Cliente" do destinatário com a nota de auditoria anexada e se o push foi emitido.
   * Selecionar 1 lead e excluir $\rightarrow$ verificar se foi movido para a lixeira.
3. **Testes do Modo Somente Leitura:**
   * Acessar WhatsApp selecionando um vendedor $\rightarrow$ confirmar que as conversas aparecem, mas o envio e inputs estão desabilitados.
   * Acessar Disparos $\rightarrow$ confirmar acesso apenas ao histórico.
4. **Deploy & Validação em Produção:**
   * Build e deploy no Cloudflare Pages (`consorflux-app`).
