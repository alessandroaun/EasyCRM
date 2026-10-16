-- Migração: Criação da Tabela user_ai_evaluations
-- Data: 2026-10-16
-- Descrição: Armazena as avaliações de postura e análises de negócios por vendedor/equipe

CREATE TABLE IF NOT EXISTS public.user_ai_evaluations (
    user_id TEXT NOT NULL,
    agent_type TEXT NOT NULL,
    data JSONB NOT NULL,
    signature TEXT,
    updated_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (user_id, agent_type)
);

ALTER TABLE public.user_ai_evaluations ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.user_ai_evaluations TO authenticated, anon, service_role;

DROP POLICY IF EXISTS "user_ai_evaluations_all" ON public.user_ai_evaluations;
CREATE POLICY "user_ai_evaluations_all" ON public.user_ai_evaluations FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
