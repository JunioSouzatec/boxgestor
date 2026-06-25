-- =============================================================================
-- BoxGestor — Usuários internos (login + senha sem e-mail pessoal)
-- Execute APÓS docs/supabase-auth-rls.sql e docs/supabase-user-invites.sql
-- NÃO executar automaticamente — aplicar manualmente no Supabase SQL Editor
-- =============================================================================
--
-- Requer Edge Function: supabase/functions/internal-user-admin
-- (usa service_role APENAS no servidor — nunca no front-end)
-- =============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS login_username TEXT,
  ADD COLUMN IF NOT EXISTS is_internal BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS office_slug TEXT,
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS last_sign_in_at TIMESTAMPTZ;

ALTER TABLE public.offices
  ADD COLUMN IF NOT EXISTS slug TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_office_login_username_unique
  ON public.profiles (office_id, lower(login_username))
  WHERE login_username IS NOT NULL AND is_internal = TRUE;

CREATE INDEX IF NOT EXISTS profiles_login_username_idx
  ON public.profiles (lower(login_username))
  WHERE is_internal = TRUE AND active = TRUE;

-- =============================================================================
-- Resolver login interno → e-mail técnico para signInWithPassword
-- =============================================================================

CREATE OR REPLACE FUNCTION public.resolve_internal_login_email(
  p_identifier TEXT,
  p_office_slug TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT;
  v_username TEXT;
  v_count INT;
BEGIN
  p_identifier := lower(trim(p_identifier));
  IF p_identifier = '' THEN
    RAISE EXCEPTION 'login not found';
  END IF;

  IF position('@' in p_identifier) > 0 THEN
    RETURN p_identifier;
  END IF;

  v_username := regexp_replace(p_identifier, '[^a-z0-9._-]', '', 'g');
  IF length(v_username) < 3 THEN
    RAISE EXCEPTION 'login not found';
  END IF;

  IF p_office_slug IS NOT NULL AND trim(p_office_slug) <> '' THEN
    SELECT p.email INTO v_email
    FROM public.profiles p
    WHERE lower(p.login_username) = v_username
      AND p.is_internal = TRUE
      AND p.active = TRUE
      AND lower(coalesce(p.office_slug, '')) = lower(trim(p_office_slug))
    LIMIT 1;

    IF v_email IS NULL THEN
      RAISE EXCEPTION 'login not found';
    END IF;
    RETURN lower(v_email);
  END IF;

  SELECT count(*) INTO v_count
  FROM public.profiles p
  WHERE lower(p.login_username) = v_username
    AND p.is_internal = TRUE
    AND p.active = TRUE;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'login not found';
  END IF;

  IF v_count > 1 THEN
    RAISE EXCEPTION 'ambiguous login - inform office code';
  END IF;

  SELECT lower(p.email) INTO v_email
  FROM public.profiles p
  WHERE lower(p.login_username) = v_username
    AND p.is_internal = TRUE
    AND p.active = TRUE
  LIMIT 1;

  RETURN v_email;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_internal_login_email(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_internal_login_email(TEXT, TEXT) TO anon, authenticated;

-- =============================================================================
-- Dono atualiza last_sign_in_at (opcional — pode ser feito na Edge Function)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.touch_profile_last_sign_in()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  UPDATE public.profiles
  SET last_sign_in_at = now(), updated_at = now()
  WHERE id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.touch_profile_last_sign_in() TO authenticated;
