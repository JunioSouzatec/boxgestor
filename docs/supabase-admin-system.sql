-- =============================================================================
-- BoxGestor — Admin do Sistema (listar oficinas, planos, teste premium)
-- Execute APÓS docs/supabase-schema.sql, supabase-auth-rls.sql,
-- supabase-plans-permissions.sql e supabase-cadastro-publico.sql
-- =============================================================================
--
-- 1. Insira seu e-mail de administrador:
--    INSERT INTO public.system_admin_emails (email) VALUES ('seu@email.com');
--
-- 2. No app (.env produção): VITE_SYSTEM_ADMIN_EMAILS=seu@email.com
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.system_admin_emails (
  email TEXT PRIMARY KEY
);

COMMENT ON TABLE public.system_admin_emails IS
  'E-mails autorizados como Administrador do Sistema BoxGestor (Admin BoxGestor).';

-- =============================================================================
-- Coluna opcional: fim do teste (extensões pelo admin)
-- =============================================================================

ALTER TABLE public.offices
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;

COMMENT ON COLUMN public.offices.trial_ends_at IS
  'Fim do Teste Premium. Se NULL, calcula trial_started_at + 7 dias.';

-- =============================================================================
-- Helper: verifica admin pelo e-mail do JWT
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_system_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.system_admin_emails sa
    WHERE lower(sa.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_system_admin() TO authenticated;

-- =============================================================================
-- RPC: listar todas as oficinas (somente Admin Sistema)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.admin_list_offices()
RETURNS TABLE (
  office_id UUID,
  office_name TEXT,
  phone TEXT,
  plan_tier TEXT,
  trial_started_at TIMESTAMPTZ,
  trial_ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  owner_name TEXT,
  owner_email TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_system_admin() THEN
    RAISE EXCEPTION 'Acesso negado. Apenas Administrador do Sistema.';
  END IF;

  RETURN QUERY
  SELECT
    o.id,
    o.name,
    o.phone,
    o.plan_tier,
    o.trial_started_at,
    o.trial_ends_at,
    o.created_at,
    p.full_name,
    coalesce(p.email, '')
  FROM public.offices o
  LEFT JOIN LATERAL (
    SELECT pr.full_name, pr.email
    FROM public.profiles pr
    WHERE pr.office_id = o.id AND pr.role = 'owner'
    ORDER BY pr.created_at ASC
    LIMIT 1
  ) p ON TRUE
  ORDER BY o.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_offices() TO authenticated;

-- =============================================================================
-- RPC: estender teste Premium (+N dias a partir do fim atual ou hoje)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.admin_extend_office_trial(
  p_office_id UUID,
  p_days INT DEFAULT 7
)
RETURNS public.offices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.offices;
  v_fim TIMESTAMPTZ;
  v_agora TIMESTAMPTZ := NOW();
BEGIN
  IF NOT public.is_system_admin() THEN
    RAISE EXCEPTION 'Acesso negado.';
  END IF;

  SELECT * INTO v_row FROM public.offices WHERE id = p_office_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Oficina não encontrada.';
  END IF;

  v_fim := coalesce(
    v_row.trial_ends_at,
    v_row.trial_started_at + INTERVAL '7 days',
    v_agora + INTERVAL '7 days'
  );

  IF v_fim < v_agora THEN
    v_fim := v_agora;
  END IF;

  v_fim := v_fim + (p_days || ' days')::INTERVAL;

  UPDATE public.offices
  SET
    plan_tier = 'trial',
    trial_started_at = coalesce(trial_started_at, v_agora),
    trial_ends_at = v_fim,
    updated_at = v_agora
  WHERE id = p_office_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_extend_office_trial TO authenticated;

-- Atualizar admin_set_office_plan para exigir is_system_admin (se já existir)
CREATE OR REPLACE FUNCTION public.admin_set_office_plan(
  p_office_id UUID,
  p_plan_tier TEXT
)
RETURNS public.offices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.offices;
BEGIN
  IF NOT public.is_system_admin() THEN
    RAISE EXCEPTION 'Acesso negado.';
  END IF;

  IF p_plan_tier NOT IN ('trial', 'essential', 'professional', 'premium') THEN
    RAISE EXCEPTION 'Plano inválido.';
  END IF;

  UPDATE public.offices
  SET
    plan_tier = p_plan_tier,
    trial_started_at = CASE
      WHEN p_plan_tier = 'trial' AND trial_started_at IS NULL THEN NOW()
      ELSE trial_started_at
    END,
    trial_ends_at = CASE
      WHEN p_plan_tier = 'trial' AND trial_ends_at IS NULL THEN NOW() + INTERVAL '7 days'
      WHEN p_plan_tier <> 'trial' THEN NULL
      ELSE trial_ends_at
    END,
    updated_at = NOW()
  WHERE id = p_office_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Oficina não encontrada.';
  END IF;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_office_plan TO authenticated;

-- =============================================================================
-- RPC: encerrar teste Premium imediatamente
-- =============================================================================

CREATE OR REPLACE FUNCTION public.admin_end_office_trial(p_office_id UUID)
RETURNS public.offices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.offices;
  v_agora TIMESTAMPTZ := NOW();
BEGIN
  IF NOT public.is_system_admin() THEN
    RAISE EXCEPTION 'Acesso negado.';
  END IF;

  UPDATE public.offices
  SET
    plan_tier = 'trial',
    trial_ends_at = v_agora - INTERVAL '1 day',
    updated_at = v_agora
  WHERE id = p_office_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Oficina não encontrada.';
  END IF;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_end_office_trial TO authenticated;

-- =============================================================================
-- RPC: reiniciar teste Premium (7 dias a partir de agora)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.admin_restart_office_trial(p_office_id UUID)
RETURNS public.offices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.offices;
  v_agora TIMESTAMPTZ := NOW();
BEGIN
  IF NOT public.is_system_admin() THEN
    RAISE EXCEPTION 'Acesso negado.';
  END IF;

  UPDATE public.offices
  SET
    plan_tier = 'trial',
    trial_started_at = v_agora,
    trial_ends_at = v_agora + INTERVAL '7 days',
    updated_at = v_agora
  WHERE id = p_office_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Oficina não encontrada.';
  END IF;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_restart_office_trial TO authenticated;
