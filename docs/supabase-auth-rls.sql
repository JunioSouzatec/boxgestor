-- =============================================================================
-- Craft Oficina — Auth + RLS seguro (multi-oficina SaaS)
-- Execute APÓS docs/supabase-schema.sql
-- Substitui docs/supabase-sync-policies.sql quando login real estiver ativo
-- =============================================================================
--
-- Pré-requisitos:
-- 1. Supabase Auth habilitado (e-mail/senha)
-- 2. Desabilitar confirmação de e-mail em dev (Authentication → Providers → Email)
--    ou o usuário precisa confirmar e-mail antes do login
-- 3. No app: VITE_CRAFT_AUTH=supabase e VITE_CRAFT_PERSISTENCE=supabase
--
-- IMPORTANTE: Não use service_role no frontend. Apenas anon + JWT do usuário.
-- =============================================================================

-- Colunas extras em profiles (email espelhado + status ativo)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;

-- =============================================================================
-- Helper: office_id do usuário autenticado
-- =============================================================================

CREATE OR REPLACE FUNCTION public.current_office_id()
RETURNS UUID AS $$
  SELECT office_id FROM public.profiles WHERE id = auth.uid() AND active = TRUE
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- =============================================================================
-- RPC: onboarding — criar oficina + profile owner na primeira conta
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

  INSERT INTO public.offices (id, name, address, phone)
  VALUES (
    v_office_id,
    COALESCE(NULLIF(trim(p_office_name), ''), 'Minha Oficina'),
    v_address,
    COALESCE(NULLIF(trim(p_phone), ''), '')
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
      'onboarding_em', now()::text
    )
  );

  RETURN v_office_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_office_for_new_user TO authenticated;

-- =============================================================================
-- Remover políticas MVP anon (sync manual) — substituir por tenant seguro
-- =============================================================================

DROP POLICY IF EXISTS "sync_mvp_offices" ON public.offices;
DROP POLICY IF EXISTS "sync_mvp_settings" ON public.settings;
DROP POLICY IF EXISTS "sync_mvp_customers" ON public.customers;
DROP POLICY IF EXISTS "sync_mvp_motorcycles" ON public.motorcycles;
DROP POLICY IF EXISTS "sync_mvp_service_orders" ON public.service_orders;

-- =============================================================================
-- OFFICES
-- =============================================================================

DROP POLICY IF EXISTS "offices_tenant_select" ON public.offices;
CREATE POLICY "offices_tenant_select" ON public.offices
  FOR SELECT TO authenticated
  USING (id = public.current_office_id());

DROP POLICY IF EXISTS "offices_tenant_update" ON public.offices;
CREATE POLICY "offices_tenant_update" ON public.offices
  FOR UPDATE TO authenticated
  USING (id = public.current_office_id())
  WITH CHECK (id = public.current_office_id());

-- =============================================================================
-- PROFILES
-- =============================================================================

DROP POLICY IF EXISTS "profiles_self_select" ON public.profiles;
CREATE POLICY "profiles_self_select" ON public.profiles
  FOR SELECT TO authenticated
  USING (office_id = public.current_office_id());

DROP POLICY IF EXISTS "profiles_self_update" ON public.profiles;
CREATE POLICY "profiles_self_update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (office_id = public.current_office_id())
  WITH CHECK (office_id = public.current_office_id());

-- Dono/gerente pode inserir profiles da mesma oficina (convites futuros)
DROP POLICY IF EXISTS "profiles_tenant_insert" ON public.profiles;
CREATE POLICY "profiles_tenant_insert" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    office_id = public.current_office_id()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.office_id = public.current_office_id()
        AND p.role IN ('owner', 'admin')
    )
  );

-- =============================================================================
-- SETTINGS
-- =============================================================================

DROP POLICY IF EXISTS "settings_tenant_all" ON public.settings;
CREATE POLICY "settings_tenant_all" ON public.settings
  FOR ALL TO authenticated
  USING (office_id = public.current_office_id())
  WITH CHECK (office_id = public.current_office_id());

-- =============================================================================
-- CUSTOMERS
-- =============================================================================

DROP POLICY IF EXISTS "customers_tenant_all" ON public.customers;
CREATE POLICY "customers_tenant_all" ON public.customers
  FOR ALL TO authenticated
  USING (office_id = public.current_office_id())
  WITH CHECK (office_id = public.current_office_id());

-- =============================================================================
-- MOTORCYCLES
-- =============================================================================

DROP POLICY IF EXISTS "motorcycles_tenant_all" ON public.motorcycles;
CREATE POLICY "motorcycles_tenant_all" ON public.motorcycles
  FOR ALL TO authenticated
  USING (office_id = public.current_office_id())
  WITH CHECK (office_id = public.current_office_id());

-- =============================================================================
-- SERVICE ORDERS
-- =============================================================================

DROP POLICY IF EXISTS "service_orders_tenant_all" ON public.service_orders;
CREATE POLICY "service_orders_tenant_all" ON public.service_orders
  FOR ALL TO authenticated
  USING (office_id = public.current_office_id())
  WITH CHECK (office_id = public.current_office_id());

-- =============================================================================
-- INVENTORY (estoque)
-- =============================================================================

DROP POLICY IF EXISTS "inventory_tenant_all" ON public.inventory_items;
CREATE POLICY "inventory_tenant_all" ON public.inventory_items
  FOR ALL TO authenticated
  USING (office_id = public.current_office_id())
  WITH CHECK (office_id = public.current_office_id());

-- =============================================================================
-- FINANCIAL (financeiro)
-- =============================================================================

DROP POLICY IF EXISTS "financial_tenant_all" ON public.financial_transactions;
CREATE POLICY "financial_tenant_all" ON public.financial_transactions
  FOR ALL TO authenticated
  USING (office_id = public.current_office_id())
  WITH CHECK (office_id = public.current_office_id());

-- =============================================================================
-- APPOINTMENTS, PHOTOS, WARRANTIES — mesmo padrão tenant
-- =============================================================================

DROP POLICY IF EXISTS "appointments_tenant_all" ON public.appointments;
CREATE POLICY "appointments_tenant_all" ON public.appointments
  FOR ALL TO authenticated
  USING (office_id = public.current_office_id())
  WITH CHECK (office_id = public.current_office_id());

DROP POLICY IF EXISTS "photos_tenant_all" ON public.service_order_photos;
CREATE POLICY "photos_tenant_all" ON public.service_order_photos
  FOR ALL TO authenticated
  USING (office_id = public.current_office_id())
  WITH CHECK (office_id = public.current_office_id());

DROP POLICY IF EXISTS "warranties_tenant_all" ON public.warranties;
CREATE POLICY "warranties_tenant_all" ON public.warranties
  FOR ALL TO authenticated
  USING (office_id = public.current_office_id())
  WITH CHECK (office_id = public.current_office_id());

-- =============================================================================
-- Verificação rápida (opcional)
-- =============================================================================
-- SELECT public.current_office_id(); -- deve retornar UUID após login
-- SELECT * FROM public.profiles WHERE id = auth.uid();
