-- ============================================================
-- RC1: admin JWT claims + GRANTs tabelas sync (401)
-- ============================================================
-- TIPO: ADITIVA (não destrutiva)
-- NÃO apaga, TRUNCATE, DELETE ou altera linhas de dados reais.
--
-- Corrige:
-- 1) is_system_admin() — reconhece e-mail em JWT, profiles e auth.users
-- 2) GRANT authenticated em communication_alerts, employee_commission_profiles,
--    regras_lembrete, lembretes, lembretes_historico
-- 3) REVOKE anon (evita escrita sem JWT)
-- 4) RPC debug_auth_admin_status() para QA (só dados do próprio usuário)
--
-- ANTES: backup no Dashboard Supabase.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.system_admin_emails (
  email TEXT PRIMARY KEY
);

-- Admin global: compara e-mails do JWT + profile + auth.users
CREATE OR REPLACE FUNCTION public.is_system_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_candidates TEXT[];
BEGIN
  v_candidates := ARRAY[
    lower(nullif(trim(coalesce(auth.jwt() ->> 'email', '')), '')),
    lower(nullif(trim(coalesce(auth.jwt() -> 'user_metadata' ->> 'email', '')), '')),
    lower(nullif(trim(coalesce(auth.jwt() -> 'app_metadata' ->> 'email', '')), ''))
  ];

  IF v_uid IS NOT NULL THEN
    v_candidates := v_candidates || ARRAY[
      lower(nullif(trim(coalesce(
        (SELECT p.email FROM public.profiles p WHERE p.id = v_uid LIMIT 1),
        ''
      )), '')),
      lower(nullif(trim(coalesce(
        (SELECT u.email::text FROM auth.users u WHERE u.id = v_uid LIMIT 1),
        ''
      )), ''))
    ];
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.system_admin_emails sa
    CROSS JOIN LATERAL unnest(v_candidates) AS c(email)
    WHERE c.email IS NOT NULL
      AND c.email <> ''
      AND lower(trim(sa.email)) = c.email
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_system_admin() TO authenticated;

-- Diagnóstico seguro (apenas o próprio usuário autenticado — sem dados de outras oficinas)
CREATE OR REPLACE FUNCTION public.debug_auth_admin_status()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem_auth_uid');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'uid', v_uid,
    'jwt_email', auth.jwt() ->> 'email',
    'jwt_user_metadata_email', auth.jwt() -> 'user_metadata' ->> 'email',
    'profile_email', (SELECT p.email FROM public.profiles p WHERE p.id = v_uid LIMIT 1),
    'auth_users_email', (SELECT u.email FROM auth.users u WHERE u.id = v_uid LIMIT 1),
    'current_office_id', public.current_office_id(),
    'is_system_admin', public.is_system_admin()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.debug_auth_admin_status() TO authenticated;

-- Garante e-mail admin conhecido (idempotente; não remove outros)
INSERT INTO public.system_admin_emails (email)
VALUES ('juininho16@gmail.com')
ON CONFLICT (email) DO NOTHING;

-- ---------------------------------------------------------------------------
-- GRANTs: authenticated pode operar; anon não
-- ---------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.communication_alerts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.communication_history TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scheduled_messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_commission_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.regras_lembrete TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lembretes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lembretes_historico TO authenticated;

GRANT ALL ON public.communication_alerts TO service_role;
GRANT ALL ON public.communication_history TO service_role;
GRANT ALL ON public.scheduled_messages TO service_role;
GRANT ALL ON public.employee_commission_profiles TO service_role;
GRANT ALL ON public.regras_lembrete TO service_role;
GRANT ALL ON public.lembretes TO service_role;
GRANT ALL ON public.lembretes_historico TO service_role;

REVOKE ALL ON public.communication_alerts FROM anon;
REVOKE ALL ON public.communication_history FROM anon;
REVOKE ALL ON public.scheduled_messages FROM anon;
REVOKE ALL ON public.employee_commission_profiles FROM anon;
REVOKE ALL ON public.regras_lembrete FROM anon;
REVOKE ALL ON public.lembretes FROM anon;
REVOKE ALL ON public.lembretes_historico FROM anon;

-- Policies mínimas se faltarem (office_id = current_office_id)
DO $$
BEGIN
  IF to_regclass('public.communication_alerts') IS NOT NULL THEN
    ALTER TABLE public.communication_alerts ENABLE ROW LEVEL SECURITY;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'communication_alerts'
        AND policyname IN ('communication_alerts_select_tenant', 'communication_alerts_office_access')
    ) THEN
      CREATE POLICY communication_alerts_office_access ON public.communication_alerts
        FOR ALL TO authenticated
        USING (office_id = public.current_office_id() OR public.is_system_admin())
        WITH CHECK (office_id = public.current_office_id());
    END IF;
  END IF;

  IF to_regclass('public.regras_lembrete') IS NOT NULL THEN
    ALTER TABLE public.regras_lembrete ENABLE ROW LEVEL SECURITY;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'regras_lembrete'
        AND policyname IN ('regras_lembrete_select_tenant', 'regras_lembrete_office_access')
    ) THEN
      CREATE POLICY regras_lembrete_office_access ON public.regras_lembrete
        FOR ALL TO authenticated
        USING (office_id = public.current_office_id() OR public.is_system_admin())
        WITH CHECK (office_id = public.current_office_id());
    END IF;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
