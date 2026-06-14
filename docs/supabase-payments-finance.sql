-- =============================================================================
-- Craft Oficina — Pagamentos de OS e Financeiro (Supabase)
-- Execute no SQL Editor após docs/supabase-schema.sql e docs/supabase-auth-rls.sql
-- =============================================================================

-- Extensões de financial_transactions (campos extras + metadados)
ALTER TABLE public.financial_transactions
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS craft_meta JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_financial_transactions_service_order
  ON public.financial_transactions(service_order_id)
  WHERE service_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_financial_transactions_customer
  ON public.financial_transactions(customer_id)
  WHERE customer_id IS NOT NULL;

-- =============================================================================
-- SERVICE_ORDER_PAYMENTS — pagamentos vinculados à OS
-- =============================================================================

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

CREATE INDEX IF NOT EXISTS idx_service_order_payments_office
  ON public.service_order_payments(office_id);

CREATE INDEX IF NOT EXISTS idx_service_order_payments_order
  ON public.service_order_payments(service_order_id);

CREATE INDEX IF NOT EXISTS idx_service_order_payments_office_date
  ON public.service_order_payments(office_id, payment_date DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_service_order_payments_local_id
  ON public.service_order_payments(office_id, ((craft_meta->>'local_id')))
  WHERE craft_meta->>'local_id' IS NOT NULL;

DROP TRIGGER IF EXISTS trg_service_order_payments_updated_at ON public.service_order_payments;
CREATE TRIGGER trg_service_order_payments_updated_at
  BEFORE UPDATE ON public.service_order_payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.service_order_payments ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- RLS — pagamentos da OS (tenant por office_id do profile)
-- =============================================================================

DROP POLICY IF EXISTS "service_order_payments_select" ON public.service_order_payments;
CREATE POLICY "service_order_payments_select" ON public.service_order_payments
  FOR SELECT TO authenticated
  USING (office_id = public.current_office_id());

DROP POLICY IF EXISTS "service_order_payments_insert" ON public.service_order_payments;
CREATE POLICY "service_order_payments_insert" ON public.service_order_payments
  FOR INSERT TO authenticated
  WITH CHECK (office_id = public.current_office_id());

DROP POLICY IF EXISTS "service_order_payments_update" ON public.service_order_payments;
CREATE POLICY "service_order_payments_update" ON public.service_order_payments
  FOR UPDATE TO authenticated
  USING (office_id = public.current_office_id())
  WITH CHECK (office_id = public.current_office_id());

DROP POLICY IF EXISTS "service_order_payments_delete" ON public.service_order_payments;
CREATE POLICY "service_order_payments_delete" ON public.service_order_payments
  FOR DELETE TO authenticated
  USING (office_id = public.current_office_id());

-- RLS completo (validação de OS/cliente/moto): docs/supabase-fix-payments-rls.sql
-- Execute esse arquivo se pagamentos falharem com erro RLS ou FK após login Auth.

-- =============================================================================
-- Verificação (opcional)
-- =============================================================================
-- SELECT * FROM public.service_order_payments WHERE office_id = public.current_office_id();
-- SELECT * FROM public.financial_transactions WHERE office_id = public.current_office_id();
