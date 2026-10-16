# Especificação de Design: Informações Gerais do Vendedor e Gestão de Metas Mensais

**Data:** 16 de Outubro de 2026  
**Status:** Aprovado para Planejamento  
**Autor:** Antigravity / Equipe ConsorFlux  

---

## 1. Visão Geral e Objetivos

Esta especificação define o novo subsistema de **Informações Gerais do Consultor e Parâmetros de Metas Mensais** na Gestão de Equipe do ConsorFlux.

A funcionalidade permite que a liderança comercial (**Supervisor**, **Gerente** e **Administrador**) consulte os dados cadastrais completos e tempo de casa de cada colaborador, defina formalmente os objetivos de vendas para o mês vigente (crédito, cotas, ligações diárias e critério de foco), acompanhe o histórico mês a mês desde a data de admissão e sincronize automaticamente essas diretrizes em todo o sistema (*Minha Central*, *Configurações*, *Central de Notificações* e *Push Mobile*).

### Objetivos Principais
1. **Botão de Ações na Gestão da Equipe (`AdminPanel.jsx`):**
   - Posicionado na coluna de ações ao lado de *Excluir*, *Ação de Vendas* e *Reset Senha*.
   - Disponível para **todos os usuários**, **exceto Administradores** (`role !== 'admin' && role !== 'administrador'`).
   - Respeita o isolamento hierárquico: Supervisor acessa os vendedores de sua equipe; Gerente e Administrador acessam todos.
2. **Modal Completo de Informações e Metas (`UserInfoMetaModal.jsx`):**
   - **Identificação do Colaborador:** Foto/Avatar, Nome completo, E-mail, Nível de Acesso, Equipe.
   - **Tempo de CRM:** Data e hora exata do cadastro no sistema, acompanhada da contagem temporal amigável entre parênteses (ex: `15/05/2026 às 14:30 (5 meses)` ou `(1 ano e 2 meses)`).
   - **Parâmetros do Mês Vigente:**
     - Meta em Crédito (R$) para o mês atual.
     - Meta em Quantidade de Cotas para o mês atual.
     - Ligações / Dia (métrica base de produtividade do consultor).
     - Critério de Foco da Empresa: `Crédito`, `Cotas` ou `Ambos`.
   - **Histórico Mensal de Desempenho:**
     - Linhas retroativas para cada mês em que o colaborador esteve no CRM até o mês anterior.
     - Apuração real das vendas do mês com base nos contratos fechados na aba de acompanhamento.
     - Indicador de resultado:
       - **Meta Batida:** Selo verde com a porcentagem excedente (ex: `+25% além da meta`).
       - **Meta Não Batida:** Selo vermelho/âmbar indicando a porcentagem faltante para atingir a meta (ex: `Faltou 18%`).
       - Para meses em que não havia meta manual cadastrada, adota-se a meta de referência padrão do sistema (R$ 500.000 / 5 cotas).
3. **Sincronização em Tempo Real ao Salvar:**
   - **Banco de Dados (Supabase):** Gravação no perfil do usuário (`user_profiles`) e na tabela de competências (`crm_metas_mensais`).
   - **Minha Central (`MinhaCentral.jsx`):** Atualização imediata da meta de crédito e inclusão do novo card/indicador de **Meta de Quantidade de Cotas do Mês**.
   - **Configurações (`Configuracao.jsx`):** Na seção *Consultor Responsável & Metas*, atualiza a meta mensal em R$, as ligações por dia e adiciona a nova caixinha de **Quantidade de Cotas**.
   - **Proteção de Permissão (Trava):** Os campos de metas e ligações em Configurações são estritamente **desabilitados (somente leitura)** para vendedores e supervisores.
   - **Notificações:** Gravação de notificação persistente na Central de Notificações (`NotificationModal.jsx`) com os valores estipulados e envio de **Notificação Push (FCM)** para os celulares cadastrados do vendedor via Cloud Run.

---

## 2. Modelo de Dados no Supabase

### 2.1. Tabela `public.crm_metas_mensais`
Armazena as metas definidas por competência (mês e ano) para cada colaborador:

```sql
CREATE TABLE IF NOT EXISTS public.crm_metas_mensais (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    mes INT NOT NULL CHECK (mes BETWEEN 1 AND 12),
    ano INT NOT NULL CHECK (ano >= 2020),
    meta_credito NUMERIC NOT NULL DEFAULT 500000.0 CHECK (meta_credito >= 0),
    meta_cotas INT NOT NULL DEFAULT 5 CHECK (meta_cotas >= 0),
    ligacoes_diarias INT NOT NULL DEFAULT 30 CHECK (ligacoes_diarias >= 0),
    tipo_foco TEXT NOT NULL DEFAULT 'ambos' CHECK (tipo_foco IN ('credito', 'cotas', 'ambos')),
    definido_por UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    definido_por_nome TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT crm_metas_mensais_unique_user_mes_ano UNIQUE (user_id, mes, ano)
);

CREATE INDEX IF NOT EXISTS idx_crm_metas_mensais_user_data 
ON public.crm_metas_mensais(user_id, ano DESC, mes DESC);
```

### 2.2. Atualização em `public.user_profiles`
Adicionar colunas para suporte a cotas e tipo de meta:
```sql
ALTER TABLE public.user_profiles 
ADD COLUMN IF NOT EXISTS monthly_cotas_goal INT DEFAULT 5,
ADD COLUMN IF NOT EXISTS goal_target_type TEXT DEFAULT 'ambos';
```

### 2.3. Políticas de Segurança (RLS)
- **Select:** O próprio colaborador pode ler suas metas; Gestores (`supervisor`, `gerente`, `admin`, `administrador`) podem ler as metas dentro de seu escopo hierárquico.
- **Insert / Update:** Permitido para usuários autenticados com cargos de liderança (`supervisor`, `gerente`, `admin`, `administrador`).

---

## 3. Backend Cloud Run: Rota de Notificação Web Push

### Endpoint `POST /api/metas/notificar-atribuicao`
Implementado em `backend-crm-cloudrun/app.py`:

- **Payload de Entrada:**
```json
{
  "targetUserId": "uuid-do-vendedor",
  "targetUserName": "Alessandro Vendedor",
  "createdByName": "Alessandro Gestor",
  "metaCredito": "1.000.000",
  "metaCotas": 10,
  "ligacoesDiarias": 40,
  "tipoFoco": "ambos",
  "mes": 10,
  "ano": 2026
}
```

- **Comportamento:**
  - Localiza todos os tokens FCM ativos do `targetUserId` na tabela `user_push_tokens`.
  - Constrói a mensagem Web Push formatada:
    - **Título:** `🎯 Nova Meta Definida para Outubro/2026`
    - **Corpo:** `Seu gestor ${createdByName} definiu sua meta: R$ ${metaCredito} | ${metaCotas} cotas. Acesse Minha Central para acompanhar!`
    - **Data/Tag:** `meta_mensal_${targetUserId}_${ano}_${mes}`
  - Dispara via `messaging.send_each()` com agrupamento (`collapse_key`).
  - Retorna `{ "success": true, "delivered": N }`.

---

## 4. Frontend: Componentes e Interfaces

### 4.1. Botão na Gestão da Equipe (`AdminPanel.jsx`)
- Inserido entre `[Ação de Vendas]` e `[Reset Senha]`.
- Ícone: `<UserCheck size={13} />` ou `<BarChart2 size={13} />` com estilo ciano/azul elegante (`border-cyan-500/30 bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20`).
- Renderizado apenas quando `roleNormalized !== 'admin' && roleNormalized !== 'administrador'`.
- Ao clicar, abre o modal `UserInfoMetaModal` com os dados do usuário da linha.

### 4.2. Modal de Informações & Metas (`UserInfoMetaModal.jsx`)
- **Cabeçalho:**
  - Avatar do colaborador com borda destacada e indicador de status (ativo).
  - Nome completo, e-mail, badges de cargo e equipe.
  - Bloco "Tempo no CRM":
    - Formato: `Cadastrado em 14/04/2026 às 11:20 (6 meses)` ou `(1 ano e 3 meses)`.
- **Formulário de Metas do Mês Vigente:**
  - Mês e ano vigentes em destaque (ex: `Outubro / 2026`).
  - Campo 1: **Meta de Crédito (R$)** com formatação de moeda.
  - Campo 2: **Quantidade de Cotas** com controle numérico.
  - Campo 3: **Ligações / Dia** (com nota explicativa: *"Métrica informativa de produtividade diária"*).
  - Campo 4: **Foco da Empresa:** Seletor visual de opções:
    - `Valor em Crédito (R$)`
    - `Quantidade de Cotas`
    - `Ambos (Crédito e Cotas)`
  - Botão de ação: **Salvar Parâmetros**.
- **Histórico Mensal de Desempenho:**
  - Tabela com lista dos meses anteriores desde a admissão.
  - Para cada mês:
    - Nome do mês e ano (ex: *Setembro/2026*, *Agosto/2026*...).
    - Meta do mês (Crédito e Cotas).
    - Realizado no mês (Crédito somado de contratos e Contratos fechados).
    - Status de Desempenho:
      - Se atingiu: `🏆 Meta Batida (+X% além da meta)`
      - Se não atingiu: `⚠️ Meta Não Batida (faltou X%)`

### 4.3. Telas Integradas
1. **Minha Central (`MinhaCentral.jsx`):**
   - Lê a meta de crédito e a meta de cotas estipuladas para o mês vigente.
   - Adiciona um novo card métrico: **Meta de Cotas (Mês)** exibindo as cotas fechadas vs. cotas alvo.
2. **Configurações (`Configuracao.jsx`):**
   - Na seção *Consultor Responsável & Metas*:
     - Exibe os campos *Meta Mensal (R$)*, *Ligações / Dia* e o novo campo *Meta de Cotas*.
     - Bloqueio de edição: `disabled={isVendedor || isSupervisor}`, garantindo que apenas a diretoria/gerência defina metas para vendedores e supervisores.
3. **Central de Notificações (`NotificationModal.jsx`):**
   - Exibe card persistente para o colaborador sempre que uma nova meta mensal for estipulada para ele pela liderança.

---

## 5. Estratégia de Testes e Validação
1. **Banco de Dados:** Testar inserção e atualização de metas mensais na tabela `crm_metas_mensais` e colunas de `user_profiles`.
2. **Cálculo de Desempenho Histórico:** Script automatizado verificando o percentual de meta batida (+X%) e faltante (-X%) para diferentes cenários de contratos.
3. **Notificação Push:** Teste unitário e disparo via Cloud Run para validar a entrega no dispositivo móvel.
4. **Permissões em Configurações:** Testar com conta de vendedor/supervisor para confirmar que os campos de metas permanecem desabilitados para edição.
5. **Build & Deploy:** `npm run build` sem erros e deploy no Cloudflare Pages.
