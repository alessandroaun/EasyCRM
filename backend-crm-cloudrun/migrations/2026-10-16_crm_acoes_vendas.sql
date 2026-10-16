-- ==============================================================================
-- Migração: Ações de Vendas (Metas Relâmpago com Bonificação)
-- Data: 2026-10-16
-- Projeto: ConsorFlux CRM
-- ==============================================================================

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

ALTER TABLE public.crm_acoes_vendas ENABLE ROW LEVEL SECURITY;

CREATE POLICY acoes_vendas_all ON public.crm_acoes_vendas 
    FOR ALL USING (true) WITH CHECK (true);
