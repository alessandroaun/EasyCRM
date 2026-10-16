# Especificação de Design: Sistema de Gamificação e Placar de Líderes (ConsorFlux)

Data: 15 de Outubro de 2026  
Status: Aprovado  
Autor: Antigravity & Equipe ConsorFlux  

---

## 1. Visão Geral e Objetivos

O **Sistema de Gamificação e Placar de Líderes** tem como missão estimular o alto desempenho comercial, a disciplina operacional no CRM e o uso proativo das ferramentas de Inteligência Artificial do ConsorFlux.

### Objetivos Centrais:
- **Exposição Pública & Transparência:** Permitir que todos os colaboradores (Vendedores, Supervisores e Gerentes) visualizem quem são os líderes da empresa e de suas respectivas equipes.
- **Competição Saudável & Dinâmica:** Renovação mensal da disputa (Mês Vigente como padrão), com histórico do mês anterior e consolidado anual.
- **Equilíbrio Entre Vendas e Processos:** Pontuar fortemente o fechamento de cotas e volume financeiro (R$), mas também bonificar a adesão às diretrizes da IA e penalizar leads estagnados ou alertas ignorados.
- **Experiência Visual Imersiva:** Pódio 3D para os Top 1, 2 e 3 em Ouro, Prata e Bronze, avatares reais, selos de conquista (*Badges*) e extrato transparente de pontos.

---

## 2. Arquitetura de Dados (Supabase PostgreSQL)

### 2.1. Tabela `gamificacao_eventos`
Registra eventos pontuáveis individuais para auditoria e composição do extrato.

```sql
CREATE TABLE IF NOT EXISTS public.gamificacao_eventos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  team TEXT,
  tipo_evento TEXT NOT NULL, -- 'VENDA_COTA', 'VOLUME_CREDITO', 'TICKET_MEDIO_BONUS', 'SUGESTAO_IA_ACEITA', 'LEAD_ESTAGNADO', 'ALERTA_IGNORADO', 'ATENDIMENTO_RAPIDO'
  pontos INTEGER NOT NULL,   -- Positivo para bônus, negativo para penalidades
  descricao TEXT NOT NULL,
  lead_id TEXT,
  mes_referencia INTEGER NOT NULL, -- 1 a 12
  ano_referencia INTEGER NOT NULL, -- Ex: 2026
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_gamificacao_user_period 
  ON public.gamificacao_eventos (user_id, ano_referencia, mes_referencia);
```

### 2.2. Políticas de Segurança (Row Level Security - RLS)
- **Leitura (`SELECT`):** Concedida a todos os usuários autenticados (`authenticated`) para alimentar o placar público.
- **Escrita (`INSERT`, `UPDATE`, `DELETE`):** Restrita aos administradores e funções internas do sistema.

```sql
ALTER TABLE public.gamificacao_eventos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gamificacao_read_all"
  ON public.gamificacao_eventos
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "gamificacao_write_admin"
  ON public.gamificacao_eventos
  FOR ALL
  TO authenticated
  USING (crm_private.actor_role() = ANY (ARRAY['admin'::text, 'administrador'::text, 'gerente'::text]))
  WITH CHECK (crm_private.actor_role() = ANY (ARRAY['admin'::text, 'administrador'::text, 'gerente'::text]));
```

---

## 3. Motor de Gamificação & Critérios de Pontuação (`gamificationService.js`)

A pontuação total de cada consultor no período é dada por:

`Pontos Líquidos = Pontos Vendas + Pontos Processo/IA - Penalidades`

### 3.1. Vendas & Resultados Comerciais (Alto Peso - ~70%)
1. **Quantidade de Cotas Fechadas:**
   - `+100 pontos` por cota com contrato fechado (`dealClosed === true`).
2. **Volume Financeiro de Crédito (R$):**
   - `+10 pontos` a cada R$ 10.000,00 de crédito vendido.  
   *(Exemplo: Carta de R$ 350.000 = +350 pontos).*
3. **Bônus de Ticket Médio:**
   - `Ticket Médio = Volume Total / Cotas`
   - Se Ticket Médio >= R$ 200.000: `+50 pontos bônus`
   - Se Ticket Médio >= R$ 400.000: `+100 pontos bônus`

### 3.2. Usabilidade, Engajamento e Inteligência Artificial (~30%)
1. **Acatar Sugestões de IA:**
   - `+15 pontos` sempre que o consultor aceitar uma recomendação de avanço de fase ou ação sugerida pelo MentorIA / Organizador de Pipeline.
2. **Qualificação Ativa & Anotações no CRM:**
   - `+5 pontos` por anotações comerciais e atualizações de dados cadastrais no lead.
3. **Agilidade no Primeiro Contato:**
   - `+10 pontos` ao registrar contato com lead novo da roleta em menos de 15 minutos.

### 3.3. Penalidades & Disciplina Operacional (Deduções)
1. **Lead Estagnado:**
   - `-15 pontos` por cada lead em atendimento sem qualquer interação por mais de 5 dias úteis.
2. **Notificação de Alerta Ignorada:**
   - `-10 pontos` quando alertas automáticos de cobrança/estagnação são disparados sem atuação do vendedor.
3. **Regra de Elegibilidade:**
   - Consultores com saldo líquido de pontuação <= 0 **não são exibidos** no pódio ou no ranking ativo de líderes.

### 3.4. Badges & Títulos de Conquista
- 🏆 **Fechador Implacável:** Mais de 3 cotas fechadas no período.
- ⚡ **Lobo do Crédito:** Volume de crédito superior a R$ 500.000.
- 🤖 **Aliado da IA:** Mais de 5 recomendações da IA executadas com sucesso.
- 🛡️ **Guardião do CRM:** Zero leads estagnados na carteira do mês.

---

## 4. Estrutura Visual e Componentes (UI/UX)

### 4.1. `PlacarLideresScreen.jsx`
- **Cabeçalho:**
  - Título com ícone `Trophy` dourado.
  - Seletor de Período: `[ Mês Atual ]` | `[ Mês Anterior ]` | `[ Acumulado do Ano ]`.
  - Abas: `Geral (Empresa Toda)` | `Minha Equipe` | `Ranking de Equipes`.
- **Pódio 3D dos Campeões:**
  - Posições 2º (Prata), 1º (Ouro Central Elevado) e 3º (Bronze).
  - Degraus com efeito de profundidade, coroas metálicas correspondentes e avatares com anéis de luz pulsantes.
  - Exibição de Pontos, Cotas, Crédito Total e Badges.
- **Lista da 4ª Colocação em Diante:**
  - Cards detalhados com posição (#4, #5...), avatar, nome, equipe, métricas e botão interativo "Ver Extrato de Pontos".
- **Aba de Ranking de Equipes:**
  - Se houver mais de uma equipe: pódio comparativo de equipes (soma de cotas, volume total e pontuação média por vendedor).
  - Se houver apenas 1 equipe: card de progresso coletivo da equipe.

### 4.2. `ExtratoPontosModal.jsx`
- Modal aberto ao clicar no card de qualquer consultor.
- Exibe o extrato transacional detalhado:
  - Cards verdes para bônus de vendas e ações positivas com a IA.
  - Cards vermelhos para penalidades e estagnações.
  - Balanço geral de pontuação do período.

---

## 5. Roteamento & Navegação
- **`Sidebar.jsx`:** Adicionado menu `"Placar de Líderes"` com ícone `Trophy` na seção de Vendas/Gestão, visível para todos os perfis (`vendedor`, `supervisor`, `gerente`, `admin`).
- **`App.jsx`:** Rota `/placar` mapeada para `<PlacarLideresScreen />`.
