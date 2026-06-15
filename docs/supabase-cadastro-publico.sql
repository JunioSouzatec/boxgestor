-- =============================================================================
-- BoxGestor — Cadastro público + Teste Premium automático (Supabase)
-- Execute manualmente no SQL Editor APÓS docs/supabase-schema.sql,
-- docs/supabase-auth-rls.sql e docs/supabase-plans-permissions.sql
-- =============================================================================
--
-- Atualiza a RPC de onboarding para iniciar toda oficina nova com:
--   plan_tier = 'trial'
--   trial_started_at = NOW()
--
-- O app também grava o teste no localStorage (craft_assinaturas_v1).
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

  INSERT INTO public.offices (id, name, address, phone, plan_tier, trial_started_at)
  VALUES (
    v_office_id,
    COALESCE(NULLIF(trim(p_office_name), ''), 'Minha Oficina'),
    v_address,
    COALESCE(NULLIF(trim(p_phone), ''), ''),
    'trial',
    NOW()
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
      'trial_dias', 7
    )
  );

  RETURN v_office_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_office_for_new_user TO authenticated;

COMMENT ON FUNCTION public.create_office_for_new_user IS
  'Onboarding via /cadastro ou /comece-agora — cria oficina com Teste Premium (trial) por 7 dias.';

-- =============================================================================
-- Opcional: coluna trial_ends_at calculada (informativo)
-- =============================================================================
-- ALTER TABLE public.offices
--   ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ
--   GENERATED ALWAYS AS (
--     CASE WHEN plan_tier = 'trial' AND trial_started_at IS NOT NULL
--       THEN trial_started_at + INTERVAL '7 days'
--       ELSE NULL
--     END
--   ) STORED;
