-- =============================================================================
-- Craft Oficina — Correção RLS v2 (Auth real + pagamentos)
-- Execute no SQL Editor do Supabase APÓS docs/supabase-schema.sql
--
-- Substitui / complementa:
--   docs/supabase-auth-rls.sql
--   docs/supabase-fix-rls-office.sql
--
-- Corrige:
--   • current_office_id() retornando NULL
--   • INSERT em customers bloqueado por RLS
--   • profiles.id vs user_id (detecta schema real)
--   • financial_transactions e service_order_payments
-- =============================================================================

-- =============================================================================
-- 1. DIAGNÓSTICO DO SCHEMA (execute e confira o resultado)
-- =============================================================================

-- Colunas de profiles (id vs user_id)
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'profiles'
ORDER BY ordinal_position;

-- Usuário atual (requer JWT autenticado no SQL Editor ou teste via app)
-- SELECT auth.uid() AS auth_user_id;

-- =============================================================================
-- 2. Colunas extras (idempotente)
-- =============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE public.financial_transactions
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS craft_meta JSONB NOT NULL DEFAULT '{}'::jsonb;

-- service_order_payments (se ainda não existir — ver docs/supabase-payments-finance.sql)
CREATE TABLE IF NOT EXISTS public.service_order_payments (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id               UUID NOT NULL REFERENCES public.offices(id) ON DELETE CASCADE,
  service_order_id        UUID NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
  customer_id             UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  motorcycle_id           UUID REFERENCES public.motorcycles(id) ON DELETE SET NULL,
  amount                  NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  payment_method          public.forma_pagamento NOT NULL DEFAULT 'pix',
  installments            SMALLINT CHECK (installments IS NULL OR installments >= 1),
  installment_amount      NUMERIC(12, 2) CHECK (installment_amount IS NULL OR installment_amount >= 0),
  payment_date            DATE NOT NULL DEFAULT CURRENT_DATE,
  notes                   TEXT,
  created_by              UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  financial_transaction_id UUID REFERENCES public.financial_transactions(id) ON DELETE SET NULL,
  craft_meta              JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.service_order_payments ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 3. current_office_id() — detecta profiles.id OU profiles.user_id
-- =============================================================================

CREATE OR REPLACE FUNCTION public.current_office_id()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_office_id UUID;
  v_has_user_id BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'user_id'
  ) INTO v_has_user_id;

  IF v_has_user_id THEN
    SELECT p.office_id INTO v_office_id
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND COALESCE(p.active, TRUE) = TRUE
    LIMIT 1;
  ELSE
    SELECT p.office_id INTO v_office_id
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND COALESCE(p.active, TRUE) = TRUE
    LIMIT 1;
  END IF;

  RETURN v_office_id;
END;
$$;

COMMENT ON FUNCTION public.current_office_id() IS
  'Retorna office_id do profile autenticado. Suporta profiles.id=auth.uid() ou profiles.user_id=auth.uid().';

GRANT EXECUTE ON FUNCTION public.current_office_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_office_id() TO anon;

-- =============================================================================
-- 4. Grants authenticated
-- =============================================================================

GRANT USAGE ON SCHEMA public TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.offices TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.motorcycles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_orders TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_transactions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_order_payments TO authenticated;

-- =============================================================================
-- 5. Remover políticas MVP anon (produção com Auth)
-- =============================================================================

DROP POLICY IF EXISTS "sync_mvp_offices" ON public.offices;
DROP POLICY IF EXISTS "sync_mvp_settings" ON public.settings;
DROP POLICY IF EXISTS "sync_mvp_customers" ON public.customers;
DROP POLICY IF EXISTS "sync_mvp_motorcycles" ON public.motorcycles;
DROP POLICY IF EXISTS "sync_mvp_service_orders" ON public.service_orders;

-- Políticas antigas (nomes variados)
DROP POLICY IF EXISTS "offices_tenant_select" ON public.offices;
DROP POLICY IF EXISTS "offices_tenant_update" ON public.offices;
DROP POLICY IF EXISTS "offices_tenant_all" ON public.offices;
DROP POLICY IF EXISTS "profiles_self_select" ON public.profiles;
DROP POLICY IF EXISTS "profiles_self_update" ON public.profiles;
DROP POLICY IF EXISTS "profiles_tenant_insert" ON public.profiles;
DROP POLICY IF EXISTS "profiles_read_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_read_tenant" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
DROP POLICY IF EXISTS "settings_tenant_all" ON public.settings;
DROP POLICY IF EXISTS "settings_select_tenant" ON public.settings;
DROP POLICY IF EXISTS "settings_insert_tenant" ON public.settings;
DROP POLICY IF EXISTS "settings_update_tenant" ON public.settings;
DROP POLICY IF EXISTS "settings_delete_tenant" ON public.settings;
DROP POLICY IF EXISTS "customers_tenant_all" ON public.customers;
DROP POLICY IF EXISTS "customers_select_tenant" ON public.customers;
DROP POLICY IF EXISTS "customers_insert_tenant" ON public.customers;
DROP POLICY IF EXISTS "customers_update_tenant" ON public.customers;
DROP POLICY IF EXISTS "customers_delete_tenant" ON public.customers;
DROP POLICY IF EXISTS "motorcycles_tenant_all" ON public.motorcycles;
DROP POLICY IF EXISTS "motorcycles_select_tenant" ON public.motorcycles;
DROP POLICY IF EXISTS "motorcycles_insert_tenant" ON public.motorcycles;
DROP POLICY IF EXISTS "motorcycles_update_tenant" ON public.motorcycles;
DROP POLICY IF EXISTS "motorcycles_delete_tenant" ON public.motorcycles;
DROP POLICY IF EXISTS "service_orders_tenant_all" ON public.service_orders;
DROP POLICY IF EXISTS "service_orders_select_tenant" ON public.service_orders;
DROP POLICY IF EXISTS "service_orders_insert_tenant" ON public.service_orders;
DROP POLICY IF EXISTS "service_orders_update_tenant" ON public.service_orders;
DROP POLICY IF EXISTS "service_orders_delete_tenant" ON public.service_orders;
DROP POLICY IF EXISTS "financial_tenant_all" ON public.financial_transactions;
DROP POLICY IF EXISTS "financial_select_tenant" ON public.financial_transactions;
DROP POLICY IF EXISTS "financial_insert_tenant" ON public.financial_transactions;
DROP POLICY IF EXISTS "financial_update_tenant" ON public.financial_transactions;
DROP POLICY IF EXISTS "financial_delete_tenant" ON public.financial_transactions;
DROP POLICY IF EXISTS "service_order_payments_select" ON public.service_order_payments;
DROP POLICY IF EXISTS "service_order_payments_insert" ON public.service_order_payments;
DROP POLICY IF EXISTS "service_order_payments_update" ON public.service_order_payments;
DROP POLICY IF EXISTS "service_order_payments_delete" ON public.service_order_payments;

-- =============================================================================
-- 6. OFFICES
-- =============================================================================

CREATE POLICY "offices_tenant_select" ON public.offices
  FOR SELECT TO authenticated
  USING (id = public.current_office_id());

CREATE POLICY "offices_tenant_update" ON public.offices
  FOR UPDATE TO authenticated
  USING (id = public.current_office_id())
  WITH CHECK (id = public.current_office_id());

-- =============================================================================
-- 7. PROFILES
-- =============================================================================

CREATE POLICY "profiles_read_own" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

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

-- =============================================================================
-- 8. SETTINGS
-- =============================================================================

CREATE POLICY "settings_select_tenant" ON public.settings
  FOR SELECT TO authenticated
  USING (office_id = public.current_office_id());

CREATE POLICY "settings_insert_tenant" ON public.settings
  FOR INSERT TO authenticated
  WITH CHECK (
    office_id IS NOT NULL
    AND office_id = public.current_office_id()
    AND public.current_office_id() IS NOT NULL
  );

CREATE POLICY "settings_update_tenant" ON public.settings
  FOR UPDATE TO authenticated
  USING (office_id = public.current_office_id())
  WITH CHECK (
    office_id = public.current_office_id()
    AND public.current_office_id() IS NOT NULL
  );

CREATE POLICY "settings_delete_tenant" ON public.settings
  FOR DELETE TO authenticated
  USING (office_id = public.current_office_id());

-- =============================================================================
-- 9. CUSTOMERS
-- =============================================================================

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
-- 10. MOTORCYCLES
-- =============================================================================

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
-- 11. SERVICE_ORDERS
-- =============================================================================

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
-- 12. FINANCIAL_TRANSACTIONS
-- =============================================================================

CREATE POLICY "financial_select_tenant" ON public.financial_transactions
  FOR SELECT TO authenticated
  USING (office_id = public.current_office_id());

CREATE POLICY "financial_insert_tenant" ON public.financial_transactions
  FOR INSERT TO authenticated
  WITH CHECK (
    office_id IS NOT NULL
    AND office_id = public.current_office_id()
    AND public.current_office_id() IS NOT NULL
  );

CREATE POLICY "financial_update_tenant" ON public.financial_transactions
  FOR UPDATE TO authenticated
  USING (office_id = public.current_office_id())
  WITH CHECK (
    office_id = public.current_office_id()
    AND public.current_office_id() IS NOT NULL
  );

CREATE POLICY "financial_delete_tenant" ON public.financial_transactions
  FOR DELETE TO authenticated
  USING (office_id = public.current_office_id());

-- =============================================================================
-- 13. SERVICE_ORDER_PAYMENTS
-- =============================================================================

CREATE POLICY "service_order_payments_select" ON public.service_order_payments
  FOR SELECT TO authenticated
  USING (office_id = public.current_office_id());

CREATE POLICY "service_order_payments_insert" ON public.service_order_payments
  FOR INSERT TO authenticated
  WITH CHECK (
    office_id IS NOT NULL
    AND office_id = public.current_office_id()
    AND public.current_office_id() IS NOT NULL
  );

CREATE POLICY "service_order_payments_update" ON public.service_order_payments
  FOR UPDATE TO authenticated
  USING (office_id = public.current_office_id())
  WITH CHECK (
    office_id = public.current_office_id()
    AND public.current_office_id() IS NOT NULL
  );

CREATE POLICY "service_order_payments_delete" ON public.service_order_payments
  FOR DELETE TO authenticated
  USING (office_id = public.current_office_id());

-- =============================================================================
-- 14. Verificação pós-execução (logado no app)
-- =============================================================================
-- SELECT auth.uid() AS user_id, public.current_office_id() AS office_id;
-- SELECT id, office_id, full_name, role, active FROM public.profiles WHERE id = auth.uid();
-- SELECT count(*) FROM public.customers WHERE office_id = public.current_office_id();
