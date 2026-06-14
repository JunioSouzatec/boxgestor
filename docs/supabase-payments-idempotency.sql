-- =============================================================================
-- Craft Oficina — Idempotência de pagamentos (Supabase)
-- Execute no SQL Editor após docs/supabase-payments-finance.sql
-- Não apaga dados existentes.
-- =============================================================================

-- Identificador estável do pagamento no app (gerado uma vez no cliente)
ALTER TABLE public.service_order_payments
  ADD COLUMN IF NOT EXISTS client_payment_id TEXT;

-- Preencher linhas antigas a partir do craft_meta, quando existir
UPDATE public.service_order_payments
SET client_payment_id = craft_meta->>'local_id'
WHERE client_payment_id IS NULL
  AND craft_meta->>'local_id' IS NOT NULL
  AND trim(craft_meta->>'local_id') <> '';

COMMENT ON COLUMN public.service_order_payments.client_payment_id IS
  'ID estável do pagamento no app local — evita duplicidade na sincronização';

-- Índice único parcial: só aplica quando client_payment_id está preenchido
CREATE UNIQUE INDEX IF NOT EXISTS uq_service_order_payments_client_id
  ON public.service_order_payments (office_id, service_order_id, client_payment_id)
  WHERE client_payment_id IS NOT NULL AND trim(client_payment_id) <> '';

-- financial_transactions: vínculo opcional ao pagamento da OS
ALTER TABLE public.financial_transactions
  ADD COLUMN IF NOT EXISTS client_payment_id TEXT,
  ADD COLUMN IF NOT EXISTS service_order_payment_id UUID
    REFERENCES public.service_order_payments(id) ON DELETE SET NULL;

UPDATE public.financial_transactions
SET client_payment_id = craft_meta->>'local_id'
WHERE client_payment_id IS NULL
  AND craft_meta->>'local_id' IS NOT NULL
  AND trim(craft_meta->>'local_id') <> '';

CREATE UNIQUE INDEX IF NOT EXISTS uq_financial_transactions_client_payment
  ON public.financial_transactions (office_id, client_payment_id)
  WHERE client_payment_id IS NOT NULL AND trim(client_payment_id) <> '';

CREATE INDEX IF NOT EXISTS idx_financial_transactions_sop
  ON public.financial_transactions(service_order_payment_id)
  WHERE service_order_payment_id IS NOT NULL;
