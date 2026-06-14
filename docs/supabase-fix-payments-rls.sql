-- =============================================================================
-- Craft Oficina — Correção RLS para pagamentos e financeiro
-- Execute APÓS:
--   docs/supabase-schema.sql
--   docs/supabase-fix-rls-v2.sql
--   docs/supabase-payments-finance.sql
--   docs/supabase-fix-service-orders-rls.sql (se OS já sincronizadas)
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
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'user_id'
  ) INTO v_has_user_id;

  IF v_has_user_id THEN
    SELECT p.office_id INTO v_office_id
    FROM public.profiles p
    WHERE p.user_id = auth.uid() AND COALESCE(p.active, TRUE) = TRUE
    LIMIT 1;
  ELSE
    SELECT p.office_id INTO v_office_id
    FROM public.profiles p
    WHERE p.id = auth.uid() AND COALESCE(p.active, TRUE) = TRUE
    LIMIT 1;
  END IF;

  RETURN v_office_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.current_office_id() TO authenticated;

-- Valida pagamento de OS (OS da mesma office; cliente/moto opcionais mas coerentes)
CREATE OR REPLACE FUNCTION public.service_order_payment_refs_valid(
  p_office_id UUID,
  p_service_order_id UUID,
  p_customer_id UUID,
  p_motorcycle_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p_office_id IS NOT NULL
    AND p_service_order_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.service_orders so
      WHERE so.id = p_service_order_id AND so.office_id = p_office_id
    )
    AND (
      p_customer_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.customers c
        WHERE c.id = p_customer_id AND c.office_id = p_office_id
      )
    )
    AND (
      p_motorcycle_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.motorcycles m
        WHERE m.id = p_motorcycle_id AND m.office_id = p_office_id
      )
    );
$$;

GRANT EXECUTE ON FUNCTION public.service_order_payment_refs_valid(UUID, UUID, UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.financial_transaction_refs_valid(
  p_office_id UUID,
  p_service_order_id UUID,
  p_customer_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p_office_id IS NOT NULL
    AND (
      p_service_order_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.service_orders so
        WHERE so.id = p_service_order_id AND so.office_id = p_office_id
      )
    )
    AND (
      p_customer_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.customers c
        WHERE c.id = p_customer_id AND c.office_id = p_office_id
      )
    );
$$;

GRANT EXECUTE ON FUNCTION public.financial_transaction_refs_valid(UUID, UUID, UUID) TO authenticated;

-- Garantir tabela de pagamentos
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

ALTER TABLE public.financial_transactions
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS craft_meta JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.service_order_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_transactions ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_order_payments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_transactions TO authenticated;

-- Remover políticas conflitantes
DROP POLICY IF EXISTS "sync_mvp_service_orders" ON public.service_order_payments;
DROP POLICY IF EXISTS "financial_tenant_all" ON public.financial_transactions;
DROP POLICY IF EXISTS "service_order_payments_select" ON public.service_order_payments;
DROP POLICY IF EXISTS "service_order_payments_insert" ON public.service_order_payments;
DROP POLICY IF EXISTS "service_order_payments_update" ON public.service_order_payments;
DROP POLICY IF EXISTS "service_order_payments_delete" ON public.service_order_payments;
DROP POLICY IF EXISTS "financial_select_tenant" ON public.financial_transactions;
DROP POLICY IF EXISTS "financial_insert_tenant" ON public.financial_transactions;
DROP POLICY IF EXISTS "financial_update_tenant" ON public.financial_transactions;
DROP POLICY IF EXISTS "financial_delete_tenant" ON public.financial_transactions;

-- FINANCIAL_TRANSACTIONS
CREATE POLICY "financial_select_tenant" ON public.financial_transactions
  FOR SELECT TO authenticated
  USING (office_id = public.current_office_id());

CREATE POLICY "financial_insert_tenant" ON public.financial_transactions
  FOR INSERT TO authenticated
  WITH CHECK (
    office_id IS NOT NULL
    AND public.current_office_id() IS NOT NULL
    AND office_id = public.current_office_id()
    AND public.financial_transaction_refs_valid(office_id, service_order_id, customer_id)
  );

CREATE POLICY "financial_update_tenant" ON public.financial_transactions
  FOR UPDATE TO authenticated
  USING (
    public.current_office_id() IS NOT NULL
    AND (
      office_id = public.current_office_id()
      OR (
        service_order_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.service_orders so
          WHERE so.id = financial_transactions.service_order_id
            AND so.office_id = public.current_office_id()
        )
      )
    )
  )
  WITH CHECK (
    office_id = public.current_office_id()
    AND public.financial_transaction_refs_valid(office_id, service_order_id, customer_id)
  );

CREATE POLICY "financial_delete_tenant" ON public.financial_transactions
  FOR DELETE TO authenticated
  USING (office_id = public.current_office_id());

-- SERVICE_ORDER_PAYMENTS
CREATE POLICY "service_order_payments_select" ON public.service_order_payments
  FOR SELECT TO authenticated
  USING (office_id = public.current_office_id());

CREATE POLICY "service_order_payments_insert" ON public.service_order_payments
  FOR INSERT TO authenticated
  WITH CHECK (
    office_id IS NOT NULL
    AND public.current_office_id() IS NOT NULL
    AND office_id = public.current_office_id()
    AND public.service_order_payment_refs_valid(
      office_id, service_order_id, customer_id, motorcycle_id
    )
  );

CREATE POLICY "service_order_payments_update" ON public.service_order_payments
  FOR UPDATE TO authenticated
  USING (
    public.current_office_id() IS NOT NULL
    AND (
      office_id = public.current_office_id()
      OR EXISTS (
        SELECT 1 FROM public.service_orders so
        WHERE so.id = service_order_payments.service_order_id
          AND so.office_id = public.current_office_id()
      )
    )
  )
  WITH CHECK (
    office_id = public.current_office_id()
    AND public.service_order_payment_refs_valid(
      office_id, service_order_id, customer_id, motorcycle_id
    )
  );

CREATE POLICY "service_order_payments_delete" ON public.service_order_payments
  FOR DELETE TO authenticated
  USING (office_id = public.current_office_id());
