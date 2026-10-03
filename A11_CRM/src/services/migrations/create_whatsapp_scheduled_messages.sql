-- Migração: Criação da tabela de agendamento de mensagens WhatsApp no ConsorFlux
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

-- Índices otimizados
CREATE INDEX IF NOT EXISTS idx_wa_scheduled_pending 
ON public.whatsapp_scheduled_messages (status, scheduled_for) 
WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_wa_scheduled_user 
ON public.whatsapp_scheduled_messages (user_id, scheduled_for DESC);

-- RLS (Row Level Security)
ALTER TABLE public.whatsapp_scheduled_messages ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'whatsapp_scheduled_messages' AND policyname = 'Vendedores gerenciam seus próprios agendamentos'
  ) THEN
    CREATE POLICY "Vendedores gerenciam seus próprios agendamentos" 
    ON public.whatsapp_scheduled_messages 
    FOR ALL USING (auth.uid() = user_id) 
    WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'whatsapp_scheduled_messages' AND policyname = 'Supervisores e Admins visualizam agendamentos gerais'
  ) THEN
    CREATE POLICY "Supervisores e Admins visualizam agendamentos gerais" 
    ON public.whatsapp_scheduled_messages 
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM public.user_profiles 
        WHERE id = auth.uid() AND role IN ('admin', 'supervisor')
      )
    );
  END IF;
END $$;
