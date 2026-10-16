# Especificação Técnica: Agendador Inteligente de Mensagens WhatsApp no ConsorFlux (A11_CRM)

**Data:** 2026-10-03  
**Status:** Validado / Em Aprovação  
**Módulos Envolvidos:** `A11_CRM` (Frontend React/Vite), Supabase (PostgreSQL), VPS Oracle (Evolution API & Pocket-TTS Worker)

---

## 1. Visão Geral & Objetivos

O **Agendador Inteligente de WhatsApp** permite que os consultores e vendedores do ConsorFlux programem o envio automatizado de mensagens para leads diretamente pela tela de **Agendamentos** do CRM.

### Principais Capacidades:
1. **Seleção Direta de Leads:** O usuário escolhe o destinatário buscando diretamente na sua base de leads no ConsorFlux (`boardData`).
2. **Múltiplos Formatos de Conteúdo:** Suporte a **Texto** com variáveis personalizadas (`{nome}`, `{empresa}`), **Áudio IA** (sintetizado via Pocket-TTS com a voz oficial Rafael ou voz do vendedor), **Áudio Gravado na Hora** (pelo microfone do navegador) e **Imagens/Documentos**.
3. **Mecanismo Antiban Nativo:** Antes do disparo, o motor envia presença para o WhatsApp (`composing` = "digitando..." ou `recording` = "gravando áudio...") por tempo randômico, simulando comportamento estritamente humano.
4. **Execução 100% Autônoma:** Worker ultra-leve em segundo plano rodando na VPS Oracle (`146.235.55.85`), garantindo disparo pontual mesmo com todos os navegadores fechados.
5. **Histórico & Rastreabilidade:** Atualização automática do status da mensagem e inserção de comentário de confirmação na timeline do lead em `crm_boards`.

---

## 2. Arquitetura do Sistema

```mermaid
flowchart TD
    User([Consultor no ConsorFlux]) -->|Agenda mensagem| UI[AgendamentosScreen.jsx]
    UI -->|Gera áudio opcional| TTS[Pocket-TTS Service]
    UI -->|Insere registro| DB[(Supabase: whatsapp_scheduled_messages)]
    
    subgraph VPS Oracle (146.235.55.85)
        Worker[Worker Node.js Scheduler] -->|Polling a cada 30s| DB
        Worker -->|Simula presença| EVO[Evolution API]
        Worker -->|Despacha Mensagem/Áudio| EVO
        EVO -->|Baileys| WA[[WhatsApp Servers]]
    end
    
    Worker -->|Atualiza status & Comenta no lead| DB
```

---

## 3. Modelo de Dados (Supabase)

Tabela: `public.whatsapp_scheduled_messages`

```sql
CREATE TABLE IF NOT EXISTS public.whatsapp_scheduled_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id TEXT,
  lead_name TEXT NOT NULL,
  lead_phone TEXT NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'processing' | 'sent' | 'failed' | 'cancelled'
  message_type TEXT NOT NULL DEFAULT 'text', -- 'text' | 'audio_ai' | 'audio_record' | 'image' | 'document'
  content_text TEXT,
  media_url TEXT,
  media_mime TEXT,
  file_name TEXT,
  voice_reference TEXT DEFAULT 'rafael',
  human_simulation BOOLEAN DEFAULT TRUE,
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índices otimizados para o worker
CREATE INDEX IF NOT EXISTS idx_wa_scheduled_pending 
ON public.whatsapp_scheduled_messages (status, scheduled_for) 
WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_wa_scheduled_user 
ON public.whatsapp_scheduled_messages (user_id, scheduled_for DESC);

-- Políticas RLS
ALTER TABLE public.whatsapp_scheduled_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vendedores gerenciam seus próprios agendamentos" 
ON public.whatsapp_scheduled_messages 
FOR ALL USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Supervisores e Admins visualizam agendamentos gerais" 
ON public.whatsapp_scheduled_messages 
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.user_profiles 
    WHERE id = auth.uid() AND role IN ('admin', 'supervisor')
  )
);
```

---

## 4. Frontend no ConsorFlux (`A11_CRM`)

### 4.1. `AgendamentosScreen.jsx`
* Conecta a visualização do calendário aos dados reais do Supabase para o mês selecionado.
* Exibe compromissos regulares e mensagens programadas do WhatsApp com badges distintos.
* Ações em cada card:
  * **Disparar Agora (Antecipado):** Permite forçar o envio imediato.
  * **Cancelar:** Altera status para `cancelled`.
  * **Excluir:** Remove o agendamento pendente.

### 4.2. `NovoAgendamentoModal.jsx`
* **Busca e Seleção de Lead:** Auto-complete buscando leads do `boardData`. Preenche nome e telefone formatado automaticamente.
* **Data e Horário:** Validação para impedir agendamento no passado.
* **Abas de Tipo de Mensagem:**
  1. **Texto:** TextArea com preview e inserção rápida de tags (`{nome}`, `{empresa}`).
  2. **Áudio IA (Pocket-TTS):** Texto a ser narrado + seleção de voz (`Rafael` vs `Voz do Vendedor`) + pré-escuta de áudio.
  3. **Gravar Áudio:** Gravador web nativo com visualizador de microfone e player.
  4. **Anexar Mídia:** Upload de imagens/PDFs.
* **Opção Antiban:** Switch toggle para simulação humana (ativado por padrão).

### 4.3. `whatsappSchedulerService.js`
* Encapsula operações de CRUD no Supabase (`createSchedule`, `fetchSchedulesByDateRange`, `cancelSchedule`, `deleteSchedule`, `sendImmediately`).
* Se houver gravação de áudio ou arquivo local, realiza upload para o bucket do Supabase antes de salvar o registro.

---

## 5. Worker Autônomo na VPS Oracle (`146.235.55.85`)

### 5.1. Arquivo: `/home/ubuntu/consorflux_scheduler_worker.js`
* Script Node.js de baixo consumo de recursos (~30 MB de RAM).
* Dependências: `@supabase/supabase-js`, `dotenv`.
* Executado via systemd: `/etc/systemd/system/consorflux-wa-scheduler.service`.

### 5.2. Ciclo de Execução:
1. Executa a cada 30 segundos.
2. Busca até 5 agendamentos pendentes com `scheduled_for <= NOW()`.
3. Executa trava atômica: `UPDATE whatsapp_scheduled_messages SET status = 'processing' WHERE id = ... AND status = 'pending'`.
4. Busca a instância ativa do usuário em `whatsapp_instances`.
5. Se `human_simulation = true`:
   * Se for texto/imagem: Envia presença `composing` por 3 a 5 segundos via Evolution API.
   * Se for áudio: Envia presença `recording` por 3 a 6 segundos.
6. Envia o conteúdo via Evolution API:
   * Se `audio_ai`: Verifica se `media_url` já existe. Se não existir, chama localmente o Pocket-TTS (`http://127.0.0.1:8000/synthesize`) para gerar o áudio e envia como áudio nativo (`sendWhatsAppAudio`).
   * Se `text`: Envia via `sendTextMessage`.
   * Se `image`/`document`: Envia via `sendMediaMessage`.
7. Conclusão:
   * Atualiza registro no Supabase para `status = 'sent'`, `sent_at = NOW()`.
   * Registra comentário de histórico no board do CRM para o lead.
   * Se ocorrer erro da Evolution API ou desconexão da instância, atualiza para `status = 'failed'` com o detalhe do erro.

---

## 6. Tratamento de Erros e Casos Extremos

1. **Instância Desconectada:** O worker detecta se a instância do vendedor está `DISCONNECTED`, não consome tentativas infinitas e marca `status = 'failed'` com mensagem clara: *"WhatsApp do vendedor desconectado no momento do envio"*.
2. **Queda Temporária de Conexão:** Retry único de 15 segundos antes de marcar como falha.
3. **Travamento de Processamento:** Se uma mensagem ficar em `processing` por mais de 5 minutos (ex: reinício repentino da VPS), o worker reseta automaticamente para `pending`.

---

## 7. Verificação e Critérios de Aceite

1. **Validação de Banco:** Tabela `whatsapp_scheduled_messages` criada com RLS e índices.
2. **Validação de UI:** Modal abre, permite selecionar lead existente no CRM, escolher tipo de mensagem (Texto, Áudio IA, Gravação, Mídia) e salvar com sucesso.
3. **Validação do Calendário:** Agendamentos aparecem no dia correspondente com badge visual e status atualizado.
4. **Validação do Worker:** Agendamento para daqui a 1 ou 2 minutos é processado e disparado com presença simulada na VPS, alterando status para `sent` e registrando comentário no lead.
