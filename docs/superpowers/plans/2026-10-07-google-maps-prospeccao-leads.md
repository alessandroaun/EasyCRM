# Plano de Implementação: Prospecção Inteligente de Empresas (Google Maps)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Objetivo:** Integrar uma ferramenta de prospecção ativa de empresas (baseada no motor do Google Maps) ao ConsorFlux, permitindo que os vendedores encontrem leads B2B qualificados por nicho e localização geográfica, visualizem telefones/websites/avaliações, filtrem duplicados e importem diretamente para o funil de vendas (Kanban) com tags de rastreabilidade.

---

## 1. Diretrizes Comerciais & Regras Fundamentais

1. **Vocabulário Corporativo:** Jamais exibir ao usuário termos como *scraper*, *scraping*, *scrap*, *crawling* ou *bot*. A interface e notificações utilizarão termos como:
   - *"Prospecção Inteligente"*
   - *"Localizador de Empresas"*
   - *"Varredura de Mercado"*
   - *"Buscar Leads B2B"*
2. **Isolamento de Vendedor (Multi-tenant):**
   - Cada busca e histórico é estritamente associado ao `user_id` do vendedor autenticado.
   - Os leads são injetados diretamente na conta/quadro (`crm_boards`) do vendedor atual.
3. **Deduplicação Ativa:**
   - O sistema verifica se o telefone/empresa já existe no CRM do usuário, sinalizando com badge `Já cadastrado no CRM` para evitar duplicação ou retrabalho.
4. **Etiquetagem e Origem:**
   - Leads importados entram na fase inicial (`Novo Cliente`) com a tag/origem `Prospecção Google Maps`, incluindo notas detalhadas (categoria, endereço, website, avaliação).

---

## 2. Arquitetura da Solução

```
[ Frontend: ConsorFlux (Vite/React) ]
  │  ├─ Item no Menu Lateral: "Prospecção de Empresas"
  │  ├─ Tela: Filtros (Nicho, Cidade/Região, Raio, Quantidade)
  │  ├─ Tabela de Leads Encontrados + Checkboxes de Seleção
  │  ├─ Botão: "Importar Selecionados para o Funil"
  │  └─ Aba: Histórico de Varreduras (Supabase)
  │
  ▼ (Requisição REST com JWT / Auth)
[ Backend de Varredura: Cloud Run / VPS Oracle ]
  │  ├─ Motor: `gosom/google-maps-scraper` (Docker / Go headless)
  │  ├─ Endpoint REST: `POST /api/prospeccao/buscar`
  │  ├─ Extração de dados: Nome, Telefone, Endereço, Categoria, Site, Avaliação
  │  └─ Retorno em tempo real (JSON estruturado)
  │
  ▼
[ Supabase ]
  ├─ Tabela `prospeccao_historico` (histórico por vendedor)
  └─ Tabela `crm_boards` / Leads (importação com tag e notas)
```

---

## 3. Estrutura de Arquivos e Componentes

### Frontend (`A11_CRM`)
- `A11_CRM/src/components/leads/BuscarLeadsView.jsx`: Tela principal da Prospecção Inteligente (Filtros, Tabela de Resultados, Indicadores, Importação em Massa).
- `A11_CRM/src/components/leads/ProspeccaoHistoricoModal.jsx`: Modal/Aba para consultar varreduras anteriores e reabrir resultados.
- `A11_CRM/src/components/Sidebar.jsx`: Novo item de menu "Prospecção de Leads" com ícone de radar/alvo (`Compass` ou `SearchCheck`).
- `A11_CRM/src/App.jsx`: Registro da nova rota `/prospeccao`.
- `A11_CRM/src/services/prospeccaoService.js`: Comunicação com o backend de varredura e persistência de histórico no Supabase.

### Backend (`Cloud Run` / Microserviço Docker)
- Dockerfile / Service configurado com o motor `gosom/google-maps-scraper` expondo API segura para o CRM.
- Endpoint de health check e endpoint de pesquisa com parâmetros de nicho, cidade e limite de resultados.

### Banco de Dados (`Supabase`)
- Tabela `prospeccao_historico`:
  - `id`: bigint (Primary Key)
  - `user_id`: uuid (Vendedor responsável)
  - `termo_busca`: text (ex: "Concessionárias de Carros")
  - `cidade_regiao`: text (ex: "Belo Horizonte, MG")
  - `total_encontrados`: integer
  - `leads_importados`: integer
  - `resultados_json`: jsonb (dados completos da busca)
  - `created_at`: timestamptz

---

## 4. Tarefas de Implementação

### Fase 1: Banco de Dados & Serviços
- [ ] Criar estrutura da tabela `prospeccao_historico` no Supabase com RLS isolado por `user_id`.
- [ ] Criar `A11_CRM/src/services/prospeccaoService.js` com funções de:
  - `executarVarredura(termo, localizacao, limite)`
  - `salvarHistoricoVarredura(...)`
  - `listarHistoricoVarreduras(userId)`
  - `importarLeadsParaKanban(leadsSelecionados, userId, boardId)`
  - `verificarTelefonesExistentes(telefonesList, userId)` (deduplicação)

### Fase 2: Backend de Varredura (Cloud Run / VPS)
- [ ] Configurar container do motor de busca no Cloud Run / VPS.
- [ ] Criar rota de proxy autenticada no backend existente ou direto no microserviço.
- [ ] Validar extração com dados reais (telefone limpo com DDD brasileiro, formato internacional E.164, site, endereço).

### Fase 3: Interface do Usuário (Frontend ConsorFlux)
- [ ] Criar `A11_CRM/src/components/leads/BuscarLeadsView.jsx`:
  - Formulário com campos: Nicho/Atividade (com sugestões pré-definidas), Cidade/UF, Quantidade (10, 25, 50, 100), Filtro de "Apenas com telefone comercial".
  - Loading dinâmico com barra de progresso durante a varredura ("Varrendo empresas na região...").
  - Tabela com colunas: Empresa, Categoria, Telefone (com link direto de WhatsApp), Avaliação (estrelas), Endereço, Status no CRM (Novo / Já Cadastrado).
  - Ações no topo: Checkbox Selecionar Todos, Botão "Importar (X) Leads para o Funil", Botão "Exportar Planilha (CSV)".
  - Feedback visual e modal de confirmação de importação com escolha da coluna Kanban de destino (padrão: "Novo Cliente").
- [ ] Integrar atalho na `Sidebar.jsx` e rota em `App.jsx`.

### Fase 4: Histórico & Reutilização
- [ ] Implementar visualização do histórico de prospecções passadas do vendedor.
- [ ] Permitir reabrir leads de uma busca anterior sem gastar nova requisição de varredura.

### Fase 5: Testes de Integridade & Validação
- [ ] Testar importação real no Kanban com etiquetas corretas.
- [ ] Testar deduplicação para garantir que contatos já existentes não sejam sobrescritos inadvertidamente.
- [ ] Validar build Vite (`npm run build`) sem erros.
