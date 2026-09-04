-- =============================================================================
-- fix_profiles_sensitive_fields_update
-- Impede que o próprio usuário altere office_id / role / flags admin via
-- profiles_update_own. Gestão legítima de equipe passa por RPC controlada.
-- Idempotente. Não altera dados existentes.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Guard: BEFORE UPDATE — trava colunas sensíveis (OLD vs NEW)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.profiles_sensitive_update_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_jwt_role text;
  v_bypass text;
BEGIN
  v_bypass := nullif(current_setting('app.bypass_profile_sensitive_guard', true), '');
  IF v_bypass = 'on' THEN
    RETURN NEW;
  END IF;

  v_jwt_role := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  );

  -- Edge Functions / PostgREST com service_role
  IF v_jwt_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'profiles.id is immutable'
      USING ERRCODE = '42501';
  END IF;

  -- office_id nunca muda por cliente autenticado comum / system admin JWT
  IF NEW.office_id IS DISTINCT FROM OLD.office_id THEN
    RAISE EXCEPTION 'profiles.office_id cannot be changed'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role
     OR NEW.active IS DISTINCT FROM OLD.active
     OR NEW.is_internal IS DISTINCT FROM OLD.is_internal
     OR NEW.office_slug IS DISTINCT FROM OLD.office_slug
     OR NEW.login_username IS DISTINCT FROM OLD.login_username
     OR NEW.must_change_password IS DISTINCT FROM OLD.must_change_password
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.last_sign_in_at IS DISTINCT FROM OLD.last_sign_in_at
  THEN
    -- System admin (JWT) pode ajustar flags/role para suporte; office_id já bloqueado acima.
    IF coalesce(public.is_system_admin(), false) THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'profiles sensitive fields cannot be changed directly'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.profiles_sensitive_update_guard() IS
  'Bloqueia UPDATE de office_id/role/flags em profiles salvo service_role, bypass GUC ou is_system_admin (exceto office_id).';

DROP TRIGGER IF EXISTS trg_profiles_sensitive_update_guard ON public.profiles;
CREATE TRIGGER trg_profiles_sensitive_update_guard
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_sensitive_update_guard();

-- ---------------------------------------------------------------------------
-- 2) Privilégios por coluna — authenticated só edita campos pessoais
-- ---------------------------------------------------------------------------
REVOKE UPDATE ON TABLE public.profiles FROM authenticated;
GRANT UPDATE (full_name, avatar_url, email, updated_at)
  ON TABLE public.profiles TO authenticated;

-- anon não deve atualizar profiles
REVOKE UPDATE ON TABLE public.profiles FROM anon;

-- ---------------------------------------------------------------------------
-- 3) RPC: gestão legítima de equipe (owner / system admin)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_update_tenant_profile(
  p_user_id uuid,
  p_full_name text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_role public.profile_role DEFAULT NULL
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_requester public.profiles%ROWTYPE;
  v_target public.profiles%ROWTYPE;
  v_is_sysadmin boolean := coalesce(public.is_system_admin(), false);
  v_new_role public.profile_role;
  v_other_owners int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user id required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_requester
  FROM public.profiles
  WHERE id = v_uid;

  IF NOT FOUND OR coalesce(v_requester.active, true) = false THEN
    RAISE EXCEPTION 'requester profile not found or inactive' USING ERRCODE = '42501';
  END IF;

  IF NOT v_is_sysadmin AND v_requester.role IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION 'only office owner can manage users' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_target
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT v_is_sysadmin AND v_target.office_id IS DISTINCT FROM v_requester.office_id THEN
    RAISE EXCEPTION 'user not in your office' USING ERRCODE = '42501';
  END IF;

  -- Nunca permite trocar office_id por este RPC
  IF p_role IS NOT NULL THEN
    v_new_role := p_role;

    -- Espelha regra do app: gerente não gerencia usuários; owner pode todos os papéis.
    -- System admin: mesmos papéis válidos do enum.
    IF NOT v_is_sysadmin AND v_requester.role = 'owner' THEN
      IF v_new_role NOT IN ('owner', 'admin', 'mecanico', 'recepcionista') THEN
        RAISE EXCEPTION 'invalid role' USING ERRCODE = '22023';
      END IF;
    END IF;

    -- Não remover o último owner ativo da oficina
    IF v_target.role = 'owner'
       AND v_new_role IS DISTINCT FROM 'owner'
       AND coalesce(v_target.active, true) = true
    THEN
      SELECT count(*)::int INTO v_other_owners
      FROM public.profiles p
      WHERE p.office_id = v_target.office_id
        AND p.role = 'owner'
        AND coalesce(p.active, true) = true
        AND p.id IS DISTINCT FROM v_target.id;

      IF v_other_owners = 0 THEN
        RAISE EXCEPTION 'cannot demote the last active owner' USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;

  PERFORM set_config('app.bypass_profile_sensitive_guard', 'on', true);

  UPDATE public.profiles p
  SET
    full_name = CASE
      WHEN p_full_name IS NULL THEN p.full_name
      ELSE nullif(trim(p_full_name), '')
    END,
    email = CASE
      WHEN p_email IS NULL THEN p.email
      ELSE nullif(lower(trim(p_email)), '')
    END,
    role = COALESCE(v_new_role, p.role),
    updated_at = now()
  WHERE p.id = v_target.id
  RETURNING * INTO v_target;

  PERFORM set_config('app.bypass_profile_sensitive_guard', 'off', true);

  IF v_target.full_name IS NULL OR trim(v_target.full_name) = '' THEN
    RAISE EXCEPTION 'full_name required' USING ERRCODE = '22023';
  END IF;

  RETURN v_target;
END;
$fn$;

COMMENT ON FUNCTION public.admin_update_tenant_profile(uuid, text, text, public.profile_role) IS
  'Owner/system admin atualiza nome/email/role de usuário da própria oficina. Não altera office_id.';

REVOKE ALL ON FUNCTION public.admin_update_tenant_profile(uuid, text, text, public.profile_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_tenant_profile(uuid, text, text, public.profile_role) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4) Ajustar funções existentes que legítimamente alteram campos sensíveis
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.touch_profile_last_sign_in()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  PERFORM set_config('app.bypass_profile_sensitive_guard', 'on', true);

  UPDATE public.profiles
  SET last_sign_in_at = now(),
      updated_at = now()
  WHERE id = auth.uid();

  PERFORM set_config('app.bypass_profile_sensitive_guard', 'off', true);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.accept_user_invite(p_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_invite public.user_invites%ROWTYPE;
  v_email text;
  v_role public.profile_role;
  v_existing_office uuid;
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

  IF v_invite.expira_em < now() THEN
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

    PERFORM set_config('app.bypass_profile_sensitive_guard', 'on', true);

    UPDATE public.profiles SET
      full_name = v_invite.nome,
      role = v_role,
      email = lower(trim(v_invite.email)),
      active = true,
      updated_at = now()
    WHERE id = auth.uid();

    PERFORM set_config('app.bypass_profile_sensitive_guard', 'off', true);
  ELSE
    INSERT INTO public.profiles (id, office_id, full_name, role, email, active)
    VALUES (
      auth.uid(),
      v_invite.office_id,
      v_invite.nome,
      v_role,
      lower(trim(v_invite.email)),
      true
    );
  END IF;

  UPDATE public.user_invites SET
    status = 'aceito',
    aceito_em = now()
  WHERE id = v_invite.id;

  RETURN v_invite.office_id;
END;
$fn$;
