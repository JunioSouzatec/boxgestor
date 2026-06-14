-- =============================================================================
-- BoxGestor — Solicitações de upgrade de plano (upgrade_requests)
-- Execute manualmente no Supabase SQL Editor quando quiser persistir
-- solicitações de upgrade no banco (modo online).
-- =============================================================================
--
-- Fluxo:
-- 1. Dono da oficina solicita upgrade na tela Planos → INSERT upgrade_requests
-- 2. Administrador do Sistema vê pedidos no Admin BoxGestor
-- 3. Admin aprova → atualiza offices.plan_tier + status approved
-- 4. Admin recusa → status rejected (plano da oficina não muda)
--
-- Status: pending | approved | rejected | cancelled
-- Planos: trial | essential | professional | premium
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.upgrade_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id       UUID NOT NULL REFERENCES public.offices (id) ON DELETE CASCADE,
  requested_by    UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  current_plan    TEXT NOT NULL CHECK (current_plan IN ('trial', 'essential', 'professional', 'premium')),
  requested_plan  TEXT NOT NULL CHECK (requested_plan IN ('trial', 'essential', 'professional', 'premium')),
  status          TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at      TIMESTAMPTZ,
  decided_by      UUID REFERENCES auth.users (id)
);

CREATE INDEX IF NOT EXISTS upgrade_requests_office_id_idx ON public.upgrade_requests (office_id);
CREATE INDEX IF NOT EXISTS upgrade_requests_status_idx ON public.upgrade_requests (status);
CREATE INDEX IF NOT EXISTS upgrade_requests_created_at_idx ON public.upgrade_requests (created_at DESC);

COMMENT ON TABLE public.upgrade_requests IS
  'Solicitações de upgrade/mudança de plano feitas por donos de oficina. Aprovação manual pelo Admin BoxGestor.';

-- =============================================================================
-- RLS (ajuste is_system_admin conforme sua estratégia de admin)
-- =============================================================================

ALTER TABLE public.upgrade_requests ENABLE ROW LEVEL SECURITY;

-- Dono/gerente da oficina: ver e criar solicitações da própria oficina
DROP POLICY IF EXISTS upgrade_requests_select_office ON public.upgrade_requests;
CREATE POLICY upgrade_requests_select_office ON public.upgrade_requests
  FOR SELECT
  USING (
    office_id IN (
      SELECT office_id FROM public.profiles WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS upgrade_requests_insert_office ON public.upgrade_requests;
CREATE POLICY upgrade_requests_insert_office ON public.upgrade_requests
  FOR INSERT
  WITH CHECK (
    requested_by = auth.uid()
    AND office_id IN (
      SELECT office_id FROM public.profiles
      WHERE id = auth.uid() AND role IN ('owner', 'manager')
    )
    AND status = 'pending'
  );

-- Admin do sistema: ver todas (requer função is_system_admin — crie conforme necessidade)
-- Exemplo com e-mail em app settings ou flag em profiles:
--
-- CREATE OR REPLACE FUNCTION public.is_system_admin()
-- RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
--   SELECT EXISTS (
--     SELECT 1 FROM public.profiles p
--     JOIN auth.users u ON u.id = p.id
--     WHERE p.id = auth.uid()
--       AND lower(u.email) = ANY (string_to_array(current_setting('app.system_admin_emails', true), ','))
--   );
-- $$;
--
-- DROP POLICY IF EXISTS upgrade_requests_admin_all ON public.upgrade_requests;
-- CREATE POLICY upgrade_requests_admin_all ON public.upgrade_requests
--   FOR ALL USING (public.is_system_admin());

-- =============================================================================
-- RPC: aprovar solicitação (admin)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.approve_upgrade_request(
  p_request_id UUID
)
RETURNS public.upgrade_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req public.upgrade_requests;
BEGIN
  -- TODO: validar is_system_admin() antes de aprovar

  SELECT * INTO v_req
  FROM public.upgrade_requests
  WHERE id = p_request_id AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação não encontrada ou já processada.';
  END IF;

  UPDATE public.offices
  SET
    plan_tier = v_req.requested_plan,
    trial_started_at = CASE
      WHEN v_req.requested_plan = 'trial' AND trial_started_at IS NULL THEN NOW()
      WHEN v_req.requested_plan <> 'trial' THEN trial_started_at
      ELSE trial_started_at
    END,
    updated_at = NOW()
  WHERE id = v_req.office_id;

  UPDATE public.upgrade_requests
  SET
    status = 'approved',
    decided_at = NOW(),
    decided_by = auth.uid()
  WHERE id = p_request_id
  RETURNING * INTO v_req;

  RETURN v_req;
END;
$$;

-- =============================================================================
-- RPC: recusar solicitação (admin)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.reject_upgrade_request(
  p_request_id UUID,
  p_note TEXT DEFAULT NULL
)
RETURNS public.upgrade_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req public.upgrade_requests;
BEGIN
  -- TODO: validar is_system_admin() antes de recusar

  UPDATE public.upgrade_requests
  SET
    status = 'rejected',
    note = NULLIF(trim(p_note), ''),
    decided_at = NOW(),
    decided_by = auth.uid()
  WHERE id = p_request_id AND status = 'pending'
  RETURNING * INTO v_req;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação não encontrada ou já processada.';
  END IF;

  RETURN v_req;
END;
$$;

-- =============================================================================
-- RPC: alterar plano manualmente (admin)
-- =============================================================================

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
  -- TODO: validar is_system_admin()

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
    updated_at = NOW()
  WHERE id = p_office_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Oficina não encontrada.';
  END IF;

  RETURN v_row;
END;
$$;
