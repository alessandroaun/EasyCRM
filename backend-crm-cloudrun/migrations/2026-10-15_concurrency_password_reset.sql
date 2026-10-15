-- ==============================================================================
-- Migração: Recuperação de Senha Assistida com Trava Atômica de Concorrência
-- Data: 2026-10-15
-- Projeto: ConsorFlux CRM
-- ==============================================================================

-- 1. Colunas de auditoria de resolução de reset na user_profiles
ALTER TABLE public.user_profiles 
ADD COLUMN IF NOT EXISTS reset_resolved_by_name text,
ADD COLUMN IF NOT EXISTS reset_resolved_at timestamp with time zone;

-- 2. Garantir que a coluna reset_requested exista
ALTER TABLE public.user_profiles 
ADD COLUMN IF NOT EXISTS reset_requested boolean DEFAULT false;

-- 3. Função Atômica de Aprovação de Reset com Trava de Concorrência
CREATE OR REPLACE FUNCTION public.approve_password_reset(
  target_user_id uuid,
  approver_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_catalog
AS $$
DECLARE
  v_approver_name text;
  v_approver_role text;
  v_target_name text;
  v_target_email text;
  v_last_resolver text;
  v_resolved_at timestamptz;
BEGIN
  -- Validar permissão do aprovador (deve ser admin ou gerente ativo)
  SELECT name, role INTO v_approver_name, v_approver_role
  FROM public.user_profiles
  WHERE id = approver_id AND status = 'ativo';

  IF v_approver_role IS NULL OR v_approver_role NOT IN ('admin', 'administrador', 'gerente') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'unauthorized',
      'message', 'Você não possui permissão de gestor para aprovar esta solicitação.'
    );
  END IF;

  -- Tentativa atômica de atualização (apenas se reset_requested ainda for TRUE)
  UPDATE public.user_profiles
  SET reset_requested = false,
      reset_resolved_by_name = coalesce(v_approver_name, 'Gestor da Equipe'),
      reset_resolved_at = now()
  WHERE id = target_user_id 
    AND reset_requested = true
  RETURNING coalesce(name, email), email INTO v_target_name, v_target_email;

  -- Se nenhuma linha foi atualizada, outro gestor já atendeu a solicitação!
  IF NOT FOUND THEN
    SELECT reset_resolved_by_name, reset_resolved_at, coalesce(name, email)
    INTO v_last_resolver, v_resolved_at, v_target_name
    FROM public.user_profiles
    WHERE id = target_user_id;

    RETURN jsonb_build_object(
      'success', false,
      'already_resolved', true,
      'resolved_by', coalesce(v_last_resolver, 'Outro gestor'),
      'resolved_at', v_resolved_at,
      'target_name', coalesce(v_target_name, 'este colaborador'),
      'message', format('A solicitação de %s já foi aprovada anteriormente por %s.', coalesce(v_target_name, 'este colaborador'), coalesce(v_last_resolver, 'outro gestor'))
    );
  END IF;

  -- Sucesso atômico: este gestor foi o primeiro e único a aprovar
  RETURN jsonb_build_object(
    'success', true,
    'target_email', v_target_email,
    'target_name', v_target_name,
    'approved_by', coalesce(v_approver_name, 'Gestor da Equipe')
  );
END;
$$;

-- 4. Permissões de execução
GRANT EXECUTE ON FUNCTION public.approve_password_reset(uuid, uuid) TO authenticated;
