-- =============================================================================
-- Craft Oficina — Convites de usuários (user_invites)
-- Execute manualmente no Supabase SQL Editor APÓS docs/supabase-schema.sql
-- e docs/supabase-auth-rls.sql
-- =============================================================================
--
-- Fluxo:
-- 1. Dono/gerente prepara convite na tela Usuários → INSERT em user_invites
-- 2. Convidado abre /convite/:token → RPC get_invite_by_token (anon ok)
-- 3. Cria senha (signUp) ou entra → RPC accept_user_invite (authenticated)
--
-- Dev: desabilite confirmação de e-mail em Authentication → Providers → Email
--      para entrar automaticamente após signUp.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.user_invites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id   UUID NOT NULL REFERENCES public.offices (id) ON DELETE CASCADE,
  token       TEXT NOT NULL UNIQUE,
  nome        TEXT NOT NULL,
  email       TEXT NOT NULL,
  papel       TEXT NOT NULL CHECK (papel IN ('gerente', 'recepcao', 'mecanico')),
  status      TEXT NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'aceito', 'cancelado', 'expirado')),
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expira_em   TIMESTAMPTZ NOT NULL,
  aceito_em   TIMESTAMPTZ,
  criado_por  UUID REFERENCES auth.users (id)
);

CREATE INDEX IF NOT EXISTS user_invites_office_id_idx ON public.user_invites (office_id);
CREATE INDEX IF NOT EXISTS user_invites_token_idx ON public.user_invites (token);
CREATE INDEX IF NOT EXISTS user_invites_email_idx ON public.user_invites (lower(email));

-- Apenas um convite pendente por e-mail/oficina
DROP INDEX IF EXISTS user_invites_office_email_pendente;
CREATE UNIQUE INDEX user_invites_office_email_pendente
  ON public.user_invites (office_id, lower(email))
  WHERE status = 'pendente';

COMMENT ON TABLE public.user_invites IS
  'Convites manuais de equipe. Link: /convite/{token}. Envio por e-mail será configurado depois.';

-- =============================================================================
-- Helpers
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_office_manager(p_office_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND office_id = p_office_id
      AND role IN ('owner', 'admin')
      AND active = TRUE
  );
$$;

CREATE OR REPLACE FUNCTION public.invite_papel_to_role(p_papel TEXT)
RETURNS public.profile_role
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_papel
    WHEN 'gerente' THEN 'admin'::public.profile_role
    WHEN 'mecanico' THEN 'mecanico'::public.profile_role
    WHEN 'recepcao' THEN 'recepcionista'::public.profile_role
    ELSE 'recepcionista'::public.profile_role
  END;
$$;

-- =============================================================================
-- RPC: buscar convite por token (público — apenas dados do convite)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_invite_by_token(p_token TEXT)
RETURNS TABLE (
  id UUID,
  token TEXT,
  office_id UUID,
  nome TEXT,
  email TEXT,
  papel TEXT,
  status TEXT,
  criado_em TIMESTAMPTZ,
  expira_em TIMESTAMPTZ,
  aceito_em TIMESTAMPTZ,
  criado_por UUID,
  nome_oficina TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.user_invites
  SET status = 'expirado'
  WHERE user_invites.token = p_token
    AND user_invites.status = 'pendente'
    AND user_invites.expira_em < NOW();

  RETURN QUERY
  SELECT
    i.id,
    i.token,
    i.office_id,
    i.nome,
    i.email,
    i.papel,
    i.status,
    i.criado_em,
    i.expira_em,
    i.aceito_em,
    i.criado_por,
    o.name AS nome_oficina
  FROM public.user_invites i
  JOIN public.offices o ON o.id = i.office_id
  WHERE i.token = p_token
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_invite_by_token(TEXT) TO anon, authenticated;

-- =============================================================================
-- RPC: aceitar convite (usuário autenticado — cria/atualiza profile)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.accept_user_invite(p_token TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite public.user_invites%ROWTYPE;
  v_email TEXT;
  v_role public.profile_role;
  v_existing_office UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT u.email INTO v_email
  FROM auth.users u
  WHERE u.id = auth.uid();

  IF v_email IS NULL OR trim(v_email) = '' THEN
    RAISE EXCEPTION 'email not found';
  END IF;

  SELECT * INTO v_invite
  FROM public.user_invites
  WHERE token = p_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invite not found';
  END IF;

  IF v_invite.status <> 'pendente' THEN
    RAISE EXCEPTION 'invite not available';
  END IF;

  IF v_invite.expira_em < NOW() THEN
    UPDATE public.user_invites SET status = 'expirado' WHERE id = v_invite.id;
    RAISE EXCEPTION 'invite expired';
  END IF;

  IF lower(trim(v_email)) <> lower(trim(v_invite.email)) THEN
    RAISE EXCEPTION 'email mismatch';
  END IF;

  v_role := public.invite_papel_to_role(v_invite.papel);

  SELECT office_id INTO v_existing_office
  FROM public.profiles
  WHERE id = auth.uid();

  IF FOUND THEN
    IF v_existing_office <> v_invite.office_id THEN
      RAISE EXCEPTION 'profile other office';
    END IF;

    UPDATE public.profiles SET
      full_name = v_invite.nome,
      role = v_role,
      email = lower(trim(v_invite.email)),
      active = TRUE,
      updated_at = NOW()
    WHERE id = auth.uid();
  ELSE
    INSERT INTO public.profiles (id, office_id, full_name, role, email, active)
    VALUES (
      auth.uid(),
      v_invite.office_id,
      v_invite.nome,
      v_role,
      lower(trim(v_invite.email)),
      TRUE
    );
  END IF;

  UPDATE public.user_invites SET
    status = 'aceito',
    aceito_em = NOW()
  WHERE id = v_invite.id;

  RETURN v_invite.office_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_user_invite(TEXT) TO authenticated;

-- =============================================================================
-- RLS
-- =============================================================================

ALTER TABLE public.user_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_invites_tenant_select" ON public.user_invites;
CREATE POLICY "user_invites_tenant_select" ON public.user_invites
  FOR SELECT TO authenticated
  USING (office_id = public.current_office_id());

DROP POLICY IF EXISTS "user_invites_tenant_insert" ON public.user_invites;
CREATE POLICY "user_invites_tenant_insert" ON public.user_invites
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_office_manager(office_id)
    AND status = 'pendente'
  );

DROP POLICY IF EXISTS "user_invites_tenant_update" ON public.user_invites;
CREATE POLICY "user_invites_tenant_update" ON public.user_invites
  FOR UPDATE TO authenticated
  USING (public.is_office_manager(office_id))
  WITH CHECK (public.is_office_manager(office_id));

-- =============================================================================
-- Verificação (opcional)
-- =============================================================================
-- SELECT * FROM public.get_invite_by_token('SEU_TOKEN');
-- SELECT public.accept_user_invite('SEU_TOKEN'); -- requer auth.uid() = e-mail do convite
