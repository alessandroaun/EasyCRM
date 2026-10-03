# Correções Críticas do Agendador de WhatsApp & Histórico de Atividades do CRM

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Este plano endereça diretamente todos os pontos apontados pelo usuário na captura de tela e na mensagem de solicitação:
1. **Erro `permission denied for table whatsapp_scheduled_messages`**: Ajustar as políticas RLS do Supabase para que usuários autenticados (ou anon conforme a sessão ativa do CRM) consigam criar e gerenciar seus agendamentos sem restrição indevida.
2. **Blindagem de Segurança do Destinatário**: Travar a seleção exclusivamente para contatos/leads internos do CRM (campos Nome e Telefone em modo leitura / `readOnly` bloqueados contra digitação avulsa, permitindo selecionar unicamente via busca dos leads da carteira do vendedor/gestor).
3. **Registro Automático de Atividades/Notas no Lead ao Agendar**: Gravar nota no histórico do lead (`client.comments`) no `crm_boards` no momento da criação do agendamento, preservando isolamento por vendedor.
4. **Registro Automático no Histórico ao Disparar a Mensagem**: Atualizar o worker autônomo na VPS Oracle e o script local para buscar todos os boards relevantes e gravar a confirmação de disparo no histórico do lead correto.
5. **Diagnóstico e Resolução do Histórico de Comentários dos Leads**: Garantir que o histórico (`client.comments`) permaneça íntegro em todas as alterações e no modal de detalhes.

---

### File Structure & Responsabilidades

- **Supabase Migration / DDL (MCP `apply_migration` / `execute_sql`)**:
  - Políticas RLS em `whatsapp_scheduled_messages` para permitir INSERT/SELECT/UPDATE/DELETE para usuários autenticados e anon com fallback seguro.
- **Frontend: `A11_CRM/src/components/agendamentos/NovoAgendamentoModal.jsx`**:
  - Bloquear campos Nome e Telefone (`readOnly={true}` ou estilizados como badge/chip travado).
  - Obrigar seleção a partir da lista de leads internos do CRM. Se nenhum lead for selecionado, o botão de confirmação permanece desabilitado com aviso explicativo.
  - Ao agendar com sucesso, invocar o salvamento da nota de histórico no lead via `saveBoard`.
- **Frontend: `A11_CRM/src/context/BoardContext.jsx`**:
  - Fornecer helper atômico `addLeadComment(leadId, commentText)` garantindo persistência sem risco de sobrescrita.
- **Backend Worker: `/home/ubuntu/consorflux_scheduler_worker.py` (VPS) e `A11_CRM/server/consorflux_scheduler_worker.py`**:
  - Garantir busca abrangente de boards no Supabase (não limitada a 5) ao gravar confirmação de disparo na timeline do lead.

---

### Tasks

#### Task 1: Corrigir RLS no Supabase para `whatsapp_scheduled_messages`
- [ ] Criar/atualizar políticas RLS para permitir INSERT, SELECT, UPDATE, DELETE para `authenticated` e `anon`.
- [ ] Testar inserção via SQL e verificar que `permission denied` não ocorre mais.

#### Task 2: Blindar o Modal contra contatos externos (Campos Travados / Seleção Apenas Interna)
- [ ] No `NovoAgendamentoModal.jsx`, tornar os campos Nome e Telefone estritamente de leitura (`readOnly`) com visual bloqueado (ícone de cadeado).
- [ ] Exigir que `selectedLead` seja obrigatório para submeter o agendamento.
- [ ] Limpar o formulário com um botão "Trocar Lead" caso queira escolher outro lead interno.

#### Task 3: Gravar Atividade/Nota Automática na Criação do Agendamento
- [ ] No `NovoAgendamentoModal.jsx`, após criar com sucesso no Supabase, adicionar uma nota automática em `client.comments` do lead selecionado via `BoardContext`.
- [ ] Texto da nota: `📅 Agendamento WhatsApp programado para DD/MM/AAAA às HH:mm ([tipo]): "[preview]"`.
- [ ] Salvar o board atualizado garantindo sincronização no Supabase.

#### Task 4: Atualizar Worker na VPS para Registrar Atividade no Disparo com Precisão
- [ ] Ajustar `consorflux_scheduler_worker.py` para consultar todos os boards do CRM (`select=id,data_payload`) sem limite de 5, localizando o lead por ID ou telefone.
- [ ] Atualizar o script na VPS Oracle (`146.235.55.85`) e reiniciar o serviço systemd `consorflux-wa-scheduler.service`.

#### Task 5: Verificação e Testes
- [ ] Testar agendamento pela interface no navegador.
- [ ] Verificar inserção no Supabase sem erros de permissão.
- [ ] Verificar se a nota apareceu na aba "Atividades e Histórico" do lead no modal de detalhes.
