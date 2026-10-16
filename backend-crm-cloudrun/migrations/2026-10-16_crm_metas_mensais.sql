-- Migração: Criação da Tabela crm_metas_mensais e Atualização de user_profiles
-- Data: 2026-10-16

-- 1. Criação da Tabela crm_metas_mensais
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

-- Índices de Performance
CREATE INDEX IF NOT EXISTS idx_crm_metas_mensais_user_data 
ON public.crm_metas_mensais(user_id, ano DESC, mes DESC);

CREATE INDEX IF NOT EXISTS idx_crm_metas_mensais_definido_por 
ON public.crm_metas_mensais(definido_por);

-- Habilitação de RLS
ALTER TABLE public.crm_metas_mensais ENABLE ROW LEVEL SECURITY;

-- Concessão de permissões básicas de tabela
GRANT ALL ON TABLE public.crm_metas_mensais TO authenticated, anon, service_role;

-- Políticas de RLS
DROP POLICY IF EXISTS "crm_metas_mensais_select" ON public.crm_metas_mensais;
CREATE POLICY "crm_metas_mensais_select"
ON public.crm_metas_mensais
FOR SELECT
TO authenticated, anon
USING (true);

DROP POLICY IF EXISTS "crm_metas_mensais_insert" ON public.crm_metas_mensais;
CREATE POLICY "crm_metas_mensais_insert"
ON public.crm_metas_mensais
FOR INSERT
TO authenticated, anon
WITH CHECK (true);

DROP POLICY IF EXISTS "crm_metas_mensais_update" ON public.crm_metas_mensais;
CREATE POLICY "crm_metas_mensais_update"
ON public.crm_metas_mensais
FOR UPDATE
TO authenticated, anon
USING (true);

DROP POLICY IF EXISTS "crm_metas_mensais_delete" ON public.crm_metas_mensais;
CREATE POLICY "crm_metas_mensais_delete"
ON public.crm_metas_mensais
FOR DELETE
TO authenticated, anon
USING (true);

-- 2. Atualização de user_profiles com colunas auxiliares
ALTER TABLE public.user_profiles 
ADD COLUMN IF NOT EXISTS monthly_cotas_goal INT DEFAULT 5,
ADD COLUMN IF NOT EXISTS goal_target_type TEXT DEFAULT 'ambos';
