-- =============================================================================
-- Comercial A1B — Trial 15 dias no cadastro/restart (RPCs)
-- =============================================================================
-- Somente CREATE OR REPLACE das funções abaixo.
-- NÃO atualiza rows de offices existentes.
-- NÃO altera planos, RLS, approval_links, OS, estoque, caixa, financeiro.
--
-- Novos cadastros: trial_ends_at = NOW() + 15 days
-- Restart admin: trial_ends_at = NOW() + 15 days
-- set_plan para trial sem fim: + 15 days (só se trial_ends_at IS NULL)
-- extend: mantém inferência legada 7 dias para oficinas antigas sem fim
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_office_for_new_user(
  p_office_name TEXT,
  p_phone TEXT DEFAULT '',
  p_city TEXT DEFAULT '',
  p_state TEXT DEFAULT '',
  p_full_name TEXT DEFAULT '',
  p_email TEXT DEFAULT ''
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_office_id UUID := gen_random_uuid();
  v_address TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()) THEN
    RAISE EXCEPTION 'profile already exists';
  END IF;

  v_address := trim(both from concat_ws(' - ', NULLIF(trim(p_city), ''), NULLIF(trim(p_state), '')));
  IF v_address = '' THEN
    v_address := '—';
  END IF;

  INSERT INTO public.offices (id, name, address, phone, plan_tier, trial_started_at, trial_ends_at)
  VALUES (
    v_office_id,
    COALESCE(NULLIF(trim(p_office_name), ''), 'Minha Oficina'),
    v_address,
    COALESCE(NULLIF(trim(p_phone), ''), ''),
    'trial',
    NOW(),
    NOW() + INTERVAL '15 days'
  );

  INSERT INTO public.profiles (id, office_id, full_name, role, email, active)
  VALUES (
    auth.uid(),
    v_office_id,
    COALESCE(NULLIF(trim(p_full_name), ''), 'Responsável'),
    'owner',
    NULLIF(trim(p_email), ''),
    TRUE
  );

  INSERT INTO public.settings (office_id, metadata)
  VALUES (
    v_office_id,
    jsonb_build_object(
      'local_office_id', v_office_id::text,
      'onboarding_em', now()::text,
      'cadastro_publico', true,
      'trial_dias', 15,
      'modulo_fiscal_adicional_ativo', false
    )
  );

  RETURN v_office_id;
END;
$$;

COMMENT ON FUNCTION public.create_office_for_new_user IS
  'Onboarding via /cadastro — cria oficina com teste grátis (trial) por 15 dias. Módulo Fiscal NÃO incluso.';

GRANT EXECUTE ON FUNCTION public.create_office_for_new_user(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO authenticated;

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
    trial_ends_at = v_agora + INTERVAL '15 days',
    updated_at = v_agora
  WHERE id = p_office_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Oficina não encontrada.';
  END IF;

  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION public.admin_restart_office_trial(UUID) IS
  'Admin Sistema: reinicia teste grátis com 15 dias a partir de agora.';

GRANT EXECUTE ON FUNCTION public.admin_restart_office_trial(UUID) TO authenticated;

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
      WHEN p_plan_tier = 'trial' AND trial_ends_at IS NULL THEN NOW() + INTERVAL '15 days'
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

GRANT EXECUTE ON FUNCTION public.admin_set_office_plan(UUID, TEXT) TO authenticated;

-- extend: default p_days=7 permanece (quantidade a estender).
-- Inferência de fim ausente mantém 7 dias legado para oficinas antigas.
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
    v_agora + INTERVAL '15 days'
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

GRANT EXECUTE ON FUNCTION public.admin_extend_office_trial(UUID, INT) TO authenticated;
