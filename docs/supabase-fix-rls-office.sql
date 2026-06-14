-- =============================================================================
-- Craft Oficina — Correção RLS por office_id (Auth real)
-- Execute no SQL Editor do Supabase APÓS:
--   1. docs/supabase-schema.sql
--   2. docs/supabase-auth-rls.sql (opcional — este arquivo substitui políticas)
--
-- Corrige erro comum:
--   "new row violates row-level security policy (USING expression) for table customers"
--
-- Schema real verificado:
--   profiles.id = auth.users.id (PK, FK auth.users)
--   profiles.office_id → offices.id
--   NÃO existe profiles.user_id — usa profiles.id = auth.uid()
-- =============================================================================

-- Colunas extras (idempotente)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;

-- =============================================================================
-- Função auxiliar: office_id do usuário autenticado
-- SECURITY DEFINER bypassa RLS ao ler profiles (evita deadlock de políticas)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.current_office_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.office_id
  FROM public.profiles p
  WHERE p.id = auth.uid()
    AND COALESCE(p.active, TRUE) = TRUE
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.current_office_id() IS
  'Retorna office_id do profile onde profiles.id = auth.uid()';

GRANT EXECUTE ON FUNCTION public.current_office_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_office_id() TO anon;

-- =============================================================================
-- Grants básicos para role authenticated (RLS ainda filtra por office)
-- =============================================================================

GRANT USAGE ON SCHEMA public TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.offices TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.motorcycles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_orders TO authenticated;

-- =============================================================================
-- Remover políticas MVP anon (não usar em produção com Auth)
-- =============================================================================

DROP POLICY IF EXISTS "sync_mvp_offices" ON public.offices;
DROP POLICY IF EXISTS "sync_mvp_settings" ON public.settings;
DROP POLICY IF EXISTS "sync_mvp_customers" ON public.customers;
DROP POLICY IF EXISTS "sync_mvp_motorcycles" ON public.motorcycles;
DROP POLICY IF EXISTS "sync_mvp_service_orders" ON public.service_orders;

-- =============================================================================
-- OFFICES — usuário vê/edita apenas a oficina vinculada ao profile
-- =============================================================================

DROP POLICY IF EXISTS "offices_tenant_select" ON public.offices;
DROP POLICY IF EXISTS "offices_tenant_update" ON public.offices;

CREATE POLICY "offices_tenant_select" ON public.offices
  FOR SELECT TO authenticated
  USING (id = public.current_office_id());

CREATE POLICY "offices_tenant_update" ON public.offices
  FOR UPDATE TO authenticated
  USING (id = public.current_office_id())
  WITH CHECK (id = public.current_office_id());

-- Sem INSERT/DELETE em offices pelo app (criação via RPC create_office_for_new_user)

-- =============================================================================
-- PROFILES — id = auth.uid(); leitura do próprio profile é obrigatória
-- =============================================================================

DROP POLICY IF EXISTS "profiles_self_select" ON public.profiles;
DROP POLICY IF EXISTS "profiles_self_update" ON public.profiles;
DROP POLICY IF EXISTS "profiles_tenant_insert" ON public.profiles;
DROP POLICY IF EXISTS "profiles_read_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_read_tenant" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;

-- Próprio profile (essencial para o app resolver office_id)
CREATE POLICY "profiles_read_own" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

-- Colegas da mesma oficina
CREATE POLICY "profiles_read_tenant" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    office_id = public.current_office_id()
    AND public.current_office_id() IS NOT NULL
  );

CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

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
DROP POLICY IF EXISTS "settings_select_tenant" ON public.settings;
DROP POLICY IF EXISTS "settings_insert_tenant" ON public.settings;
DROP POLICY IF EXISTS "settings_update_tenant" ON public.settings;
DROP POLICY IF EXISTS "settings_delete_tenant" ON public.settings;

CREATE POLICY "settings_select_tenant" ON public.settings
  FOR SELECT TO authenticated
  USING (office_id = public.current_office_id());

CREATE POLICY "settings_insert_tenant" ON public.settings
  FOR INSERT TO authenticated
  WITH CHECK (
    office_id = public.current_office_id()
    AND public.current_office_id() IS NOT NULL
  );

CREATE POLICY "settings_update_tenant" ON public.settings
  FOR UPDATE TO authenticated
  USING (office_id = public.current_office_id())
  WITH CHECK (office_id = public.current_office_id());

CREATE POLICY "settings_delete_tenant" ON public.settings
  FOR DELETE TO authenticated
  USING (office_id = public.current_office_id());

-- =============================================================================
-- CUSTOMERS
-- =============================================================================

DROP POLICY IF EXISTS "customers_tenant_all" ON public.customers;
DROP POLICY IF EXISTS "customers_select_tenant" ON public.customers;
DROP POLICY IF EXISTS "customers_insert_tenant" ON public.customers;
DROP POLICY IF EXISTS "customers_update_tenant" ON public.customers;
DROP POLICY IF EXISTS "customers_delete_tenant" ON public.customers;

CREATE POLICY "customers_select_tenant" ON public.customers
  FOR SELECT TO authenticated
  USING (office_id = public.current_office_id());

CREATE POLICY "customers_insert_tenant" ON public.customers
  FOR INSERT TO authenticated
  WITH CHECK (
    office_id IS NOT NULL
    AND office_id = public.current_office_id()
    AND public.current_office_id() IS NOT NULL
  );

CREATE POLICY "customers_update_tenant" ON public.customers
  FOR UPDATE TO authenticated
  USING (office_id = public.current_office_id())
  WITH CHECK (
    office_id = public.current_office_id()
    AND public.current_office_id() IS NOT NULL
  );

CREATE POLICY "customers_delete_tenant" ON public.customers
  FOR DELETE TO authenticated
  USING (office_id = public.current_office_id());

-- =============================================================================
-- MOTORCYCLES
-- =============================================================================

DROP POLICY IF EXISTS "motorcycles_tenant_all" ON public.motorcycles;
DROP POLICY IF EXISTS "motorcycles_select_tenant" ON public.motorcycles;
DROP POLICY IF EXISTS "motorcycles_insert_tenant" ON public.motorcycles;
DROP POLICY IF EXISTS "motorcycles_update_tenant" ON public.motorcycles;
DROP POLICY IF EXISTS "motorcycles_delete_tenant" ON public.motorcycles;

CREATE POLICY "motorcycles_select_tenant" ON public.motorcycles
  FOR SELECT TO authenticated
  USING (office_id = public.current_office_id());

CREATE POLICY "motorcycles_insert_tenant" ON public.motorcycles
  FOR INSERT TO authenticated
  WITH CHECK (
    office_id IS NOT NULL
    AND office_id = public.current_office_id()
    AND public.current_office_id() IS NOT NULL
  );

CREATE POLICY "motorcycles_update_tenant" ON public.motorcycles
  FOR UPDATE TO authenticated
  USING (office_id = public.current_office_id())
  WITH CHECK (
    office_id = public.current_office_id()
    AND public.current_office_id() IS NOT NULL
  );

CREATE POLICY "motorcycles_delete_tenant" ON public.motorcycles
  FOR DELETE TO authenticated
  USING (office_id = public.current_office_id());

-- =============================================================================
-- SERVICE ORDERS
-- =============================================================================

DROP POLICY IF EXISTS "service_orders_tenant_all" ON public.service_orders;
DROP POLICY IF EXISTS "service_orders_select_tenant" ON public.service_orders;
DROP POLICY IF EXISTS "service_orders_insert_tenant" ON public.service_orders;
DROP POLICY IF EXISTS "service_orders_update_tenant" ON public.service_orders;
DROP POLICY IF EXISTS "service_orders_delete_tenant" ON public.service_orders;

CREATE POLICY "service_orders_select_tenant" ON public.service_orders
  FOR SELECT TO authenticated
  USING (office_id = public.current_office_id());

CREATE POLICY "service_orders_insert_tenant" ON public.service_orders
  FOR INSERT TO authenticated
  WITH CHECK (
    office_id IS NOT NULL
    AND office_id = public.current_office_id()
    AND public.current_office_id() IS NOT NULL
  );

CREATE POLICY "service_orders_update_tenant" ON public.service_orders
  FOR UPDATE TO authenticated
  USING (office_id = public.current_office_id())
  WITH CHECK (
    office_id = public.current_office_id()
    AND public.current_office_id() IS NOT NULL
  );

CREATE POLICY "service_orders_delete_tenant" ON public.service_orders
  FOR DELETE TO authenticated
  USING (office_id = public.current_office_id());

-- =============================================================================
-- Verificação (execute logado no app ou via SQL com JWT de teste)
-- =============================================================================
-- SELECT auth.uid() AS user_id, public.current_office_id() AS office_id;
-- SELECT id, office_id, full_name, role FROM public.profiles WHERE id = auth.uid();
-- SELECT count(*) FROM public.customers WHERE office_id = public.current_office_id();
