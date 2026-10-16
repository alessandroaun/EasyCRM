# Especificação de Design: Ação de Vendas (Metas Relâmpago com Bonificação) e Reorganização do Menu Lateral

**Data:** 16 de Outubro de 2026  
**Status:** Aprovado para Planejamento  
**Autor:** Antigravity / Equipe ConsorFlux  

---

## 1. Visão Geral e Objetivos

O módulo **Ação de Vendas** permite que a liderança comercial (**Supervisor**, **Gerente** e **Administrador**) estruture desafios pontuais e metas de curto/médio prazo para colaboradores específicos da equipe comercial. Ao bater a meta estipulada (em quantidade de cotas ou valor de crédito comercializado), o colaborador conquista uma bonificação predefinida pelo gestor (valor em dinheiro, eletrônico, jantar, prêmio ou item pessoal).

Além disso, a ferramenta de prospecção **Buscar Leads** (`prospeccao`) é realocada do menu principal para a seção **Vendas** do menu lateral (`Sidebar.jsx`), organizando o fluxo de aquisição e conversão comercial.

### Objetivos Principais
1. **Reorganização de Navegação:** Transferir o acesso do `Buscar Leads` da seção *Principal* para a seção *Vendas* no menu lateral.
2. **Atribuição Flexível de Metas:** Habilitar um novo botão amarelo na coluna de ações da Gestão da Equipe (`AdminPanel.jsx`) que abre um modal para estruturar metas por cotas ou crédito.
3. **Validação Temporal Estrita:** Interface de data e hora com mini calendário que impede categoricamente a seleção ou digitação de datas passadas.
4. **Histórico de Auditoria das Últimas 50 Ações:** Exibição do histórico recente dentro do próprio modal, filtrado estritamente pelo escopo hierárquico do gestor (Supervisor vê sua equipe; Gerente/Admin veem a empresa).
5. **Indicativo Visual na Gestão com Reset Mensal:** Badge visual na linha de cada membro indicando se há meta ativa/pendente ou cumprida no mês vigente, resetando automaticamente na virada do mês.
6. **Notificações Multicanal Imediatas (Push + In-App):**
   - No lançamento: Vendedor recebe Push no celular e card na Central de Notificações com botão de aceitação ("Aceitar Desafio").
   - No cumprimento: Motor do CRM detecta vendas fechadas pelo vendedor na janela temporal, marca a meta como cumprida e notifica **exclusivamente o gestor criador** via Push e Central de Notificações para pagamento do prêmio.

---

## 2. Reorganização do Menu Lateral (`Sidebar.jsx`)

### Alteração Estrutural
No arquivo `consorflux/src/components/layout/Sidebar.jsx`:
- **Seção Principal:** Remove o item `{ id: 'prospeccao', path: '/prospeccao', label: 'Buscar Leads', icon: Compass }`.
- **Seção Vendas:** Insere o item `Buscar Leads` no início ou logo após `Simulador de Vendas`, permitindo aos consultores acessarem ferramentas de vendas e prospecção em uma única categoria coesa.

---

## 3. Modelo de Dados no Supabase (`crm_acoes_vendas`)

### Tabela `public.crm_acoes_vendas`
Armazena todas as metas atribuídas, progresso em tempo real e status de conclusão:

```sql
CREATE TABLE IF NOT EXISTS public.crm_acoes_vendas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    target_user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    tipo_meta TEXT NOT NULL CHECK (tipo_meta IN ('cotas', 'credito')),
    valor_meta NUMERIC NOT NULL CHECK (valor_meta > 0),
    bonificacao TEXT NOT NULL,
    data_limite TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'cumprido', 'expirado')),
    progresso_atual NUMERIC NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    cumprido_em TIMESTAMPTZ,
    aceito BOOLEAN NOT NULL DEFAULT false,
    aceito_em TIMESTAMPTZ,
    notificado_cumprimento BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_acoes_vendas_target_status 
ON public.crm_acoes_vendas(target_user_id, status);

CREATE INDEX IF NOT EXISTS idx_acoes_vendas_creator 
ON public.crm_acoes_vendas(creator_id);

CREATE INDEX IF NOT EXISTS idx_acoes_vendas_created_at 
ON public.crm_acoes_vendas(created_at DESC);
```

### Regras de Segurança (RLS)
- **Select:**
  - Usuários podem ler metas atribuídas a si mesmos (`target_user_id = auth.uid()`).
  - Gestores podem ler metas que criaram (`creator_id = auth.uid()`).
  - Gerentes e Administradores podem ler todas as metas.
  - Supervisores podem ler metas de vendedores de sua equipe.
- **Insert:**
  - Permitido para usuários com cargo `supervisor`, `gerente`, `admin` ou `administrador`.
- **Update:**
  - O vendedor pode atualizar o campo `aceito = true`.
  - O sistema (e gestores) podem atualizar `status`, `progresso_atual` e `cumprido_em`.

---

## 4. Endpoints de Notificação Web Push no Backend Cloud Run (`app.py`)

Dois novos endpoints dedicados em `backend-crm-cloudrun/app.py`:

### 1. `POST /api/acoes-vendas/notificar-criacao`
- **Autenticação:** Permite requisição do frontend do CRM.
- **Payload:**
  ```json
  {
    "target_user_id": "UUID_DO_VENDEDOR",
    "creator_name": "Nome do Gestor",
    "tipo_meta": "cotas",
    "valor_meta": 3,
    "bonificacao": "R$ 500 em dinheiro",
    "data_limite": "2026-10-20T18:00:00Z"
  }
  ```
- **Ação:** Coleta os tokens FCM físicos do vendedor em `user_push_tokens` e envia notificação multicast:
  - **Título:** `🎯 Nova Ação de Vendas Atribuída!`
  - **Corpo:** `A liderança ({creator_name}) lançou uma nova meta para você: {meta_formatada} valendo {bonificacao} até {data_formatada}!`
  - **Dados / Link:** `https://app.consorflux.com/leads` com tag `acao_venda_{target_user_id}`.

### 2. `POST /api/acoes-vendas/notificar-cumprimento`
- **Payload:**
  ```json
  {
    "creator_id": "UUID_DO_GESTOR",
    "seller_name": "Nome do Vendedor",
    "tipo_meta": "credito",
    "valor_meta": 500000,
    "bonificacao": "iPhone 15"
  }
  ```
- **Ação:** Coleta os tokens FCM físicos **exclusivamente do gestor criador** (`creator_id`) e despacha:
  - **Título:** `🎉 Meta Batida na Ação de Vendas!`
  - **Corpo:** `Parabéns! O colaborador {seller_name} bateu a meta de {meta_formatada}! Hora de liberar a bonificação: {bonificacao}.`
  - **Dados / Link:** `https://app.consorflux.com/admin` com tag `meta_batida_{creator_id}`.

---

## 5. Interface de Gestão da Equipe (`AdminPanel.jsx`)

### A. Botão Amarelo na Coluna de Ações
- Na tabela de membros da equipe:
  - Estilizado em amarelo/âmbar (`bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold px-2.5 py-1 rounded-lg shadow-sm`).
  - Ícone: `<Zap size={13} className="text-slate-950" />`.
  - Rótulo: `Ação de Vendas` (ou ícone + tooltip em telas compactas).
  - Disponível para **Supervisor, Gerente e Administrador** para todos os colaboradores.

### B. Indicativo Visual Mensal na Tabela
Ao lado do nome do colaborador:
- **Meta Ativa (Pendente):** Badge âmbar/amarelo com ícone de raio pulsante:
  - Ex: `⚡ Meta Ativa: 3 cotas (iPhone 15) - até 25/10`.
- **Meta Batida (Cumprida):** Badge verde esmeralda com troféu:
  - Ex: `🏆 Meta Batida: R$ 500k (R$ 1.500)`.
- **Regra de Reset Mensal:** Apenas exibe ações criadas no mês corrente (`new Date(acao.created_at).getMonth() === currentMonth`). Ao virar o mês, o indicativo se renova automaticamente.

### C. Modal "Estruturar Ação de Vendas"
1. **Identificação do Colaborador:**
   - Foto/avatar, nome e equipe do colaborador selecionado.
2. **Definição Estruturada da Meta:**
   - Botões seletores (Tabs/Pills):
     - `📊 Quantidade de Cotas`: Input numérico inteiro (ex: `1`, `2`, `5`).
     - `💰 Valor em Crédito (R$)`: Input numérico formatado como moeda brasileira (ex: `R$ 300.000,00`).
3. **Bonificação:**
   - Campo de texto aberto: *"Ex: R$ 1.000 em dinheiro, Vale Compras, Jantar no Coco Bambu"*.
4. **Data e Hora Limite (Mini Calendário):**
   - Input `datetime-local` com `min` setado para a data/hora atual.
   - **Validação Estrita:** Se uma data/hora no passado for selecionada ou digitada:
     - Borda vermelha de alerta imediata.
     - Mensagem explícita: *"A data e hora limite deve ser no futuro."*.
     - O botão de confirmação permanece desabilitado.
5. **Histórico das Últimas 50 Ações de Vendas:**
   - Tabela no rodapé do modal com rolagem interna:
     - Colunas: **Vendedor**, **Meta**, **Bonificação**, **Atribuído por**, **Prazo**, **Status**.
     - **Filtragem por Nível de Acesso (RBAC):**
       - Supervisor: filtra estritamente ações direcionadas a colaboradores da sua equipe.
       - Gerente e Administrador: exibe ações de toda a organização.
     - Badges de status:
       - `Pendente` (amarelo)
       - `Cumprido` (verde com data de conclusão)
       - `Expirado` (cinza/vermelho)

---

## 6. Central de Notificações (`NotificationModal.jsx`)

1. **Card da Ação de Vendas para o Vendedor:**
   - Destaque em gradiente dourado/âmbar.
   - Título: `🎯 Nova Ação de Vendas!`.
   - Detalhes: Meta exigida, prêmio de bonificação estipulado pelo gestor e prazo limite com contagem regressiva.
   - Botão de Ação: `Aceitar Desafio` (marca `aceito = true` na base de dados).
2. **Card de Meta Batida para o Gestor:**
   - Destaque em verde esmeralda com ícone de troféu e confetes.
   - Título: `🏆 Meta Batida na Ação de Vendas!`.
   - Detalhes: Vendedor que atingiu o objetivo, meta batida e lembrete claro: *"Bonificação a pagar: [Bonificação]"*.

---

## 7. Motor Automático de Avaliação e Cumprimento no CRM

### Lógica de Disparo
Implementado em serviço modular (`src/services/acoesVendasService.js`) e conectado ao pipeline do CRM em `BoardContext.jsx`:
1. **Gatilho de Movimentação/Fechamento:**
   - Sempre que um lead do vendedor é movido para a coluna `"Fechados"` (ou marcado como `dealClosed = true`), o serviço consulta as ações de vendas ativas (`status = 'pendente'` e `now() <= data_limite`) para o vendedor dono do lead (`responsibleUserId` ou `user.id`).
2. **Cálculo da Produtividade na Janela Válida:**
   - Itera sobre os leads fechados do vendedor cuja data de fechamento (`dealClosedDate`) esteja compreendida entre `acao.created_at` e `acao.data_limite`.
   - Se `tipo_meta === 'cotas'`:
     - Soma a quantidade de contratos/cotas dos leads fechados no intervalo.
   - Se `tipo_meta === 'credito'`:
     - Soma o volume de crédito (`desiredCredit` ou valor contratado) dos leads fechados no intervalo.
3. **Cumprimento do Objetivo:**
   - Se a soma atingir ou ultrapassar `valor_meta`:
     1. Atualiza `crm_acoes_vendas` no Supabase: `status = 'cumprido'`, `cumprido_em = now()`, `progresso_atual = valor_atingido`.
     2. Dispara requisição ao Cloud Run (`/api/acoes-vendas/notificar-cumprimento`) direcionada **exclusivamente ao `creator_id`** (o gestor que criou a meta).
     3. Registra notificação in-app para o gestor.
     4. Atualiza o estado visual na tabela de membros em tempo real.

---

## 8. Plano de Testes e Verificação

1. **Menu Lateral:**
   - Verificar que `Buscar Leads` desapareceu da seção *Principal*.
   - Verificar que `Buscar Leads` está ativo e clicável na seção *Vendas*.
2. **Criação da Meta:**
   - Acessar `Gestão da Equipe` como Gerente/Admin.
   - Clicar no botão amarelo na linha de um vendedor.
   - Testar validação de data no passado (deve exibir erro em vermelho e travar o botão).
   - Preencher meta de cotas e bonificação com data futura válida e salvar.
   - Verificar que a ação aparece na lista das últimas 50 com status `Pendente`.
   - Verificar que o badge amarelo aparece na linha do vendedor no `AdminPanel.jsx`.
3. **Recebimento pelo Vendedor:**
   - Verificar recebimento de notificação in-app com botão "Aceitar".
   - Testar disparo do push no Cloud Run.
4. **Fechamento e Cumprimento Automático:**
   - Na conta do vendedor, fechar um negócio (mover para Fechados).
   - Verificar que o motor reconhece a produção e atualiza o status para `Cumprido`.
   - Confirmar que o gestor criador recebe a notificação in-app e push com a bonificação a pagar.
5. **Build & Deploy:**
   - `npm run build` no frontend.
   - Deploy no Cloudflare Pages.
   - Deploy da rota no Cloud Run.
