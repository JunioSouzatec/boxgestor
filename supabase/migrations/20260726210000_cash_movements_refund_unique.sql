-- =============================================================================
-- BoxGestor — RC2 Caixa Fase 2D: idempotência refund ↔ pagamento OS
-- Migration ADITIVA. Não altera tabelas de pagamento/financeiro.
--
-- Garante no máximo 1 movimento refund ativo por service_order_payment_id.
-- =============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS cash_movements_unique_active_refund_payment
  ON public.cash_movements (service_order_payment_id)
  WHERE type = 'refund'
    AND deleted_at IS NULL
    AND service_order_payment_id IS NOT NULL;

COMMENT ON INDEX public.cash_movements_unique_active_refund_payment IS
  'Fase 2D: 1 pagamento OS = no máximo 1 refund ativo no caixa.';
