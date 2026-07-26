-- =============================================================================
-- BoxGestor — RC2 Caixa Fase 2A: base técnica de movimentos
-- Migration ADITIVA e idempotente. NÃO remove dados.
--
-- Escopo desta fase:
--   • cash_movements — movimentos da sessão de caixa
--   • NÃO vincula pagamento de OS no fluxo da aplicação
--   • NÃO atualiza cash_sessions.expected_balance automaticamente
--   • Colunas service_order_payment_id / financial_transaction_id
--     ficam preparadas para vínculo futuro (sem FK rígida nesta fase)
--
-- Pré-requisitos:
--   • public.cash_sessions
--   • public.current_office_id()
--   • public.is_system_admin()
--   • public.set_updated_at()
-- =============================================================================

-- -----------------------------------------------------------------------------
-- cash_movements
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cash_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id UUID NOT NULL REFERENCES public.offices(id) ON DELETE CASCADE,
  cash_session_id UUID NOT NULL REFERENCES public.cash_sessions(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (
    type IN (
      'manual_in',
      'manual_out',
      'sangria',
      'suprimento',
      'sale',
      'refund'
    )
  ),
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  payment_method TEXT,
  reason TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name TEXT,
  authorized_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  authorized_by_name TEXT,
  authorized_by_pin BOOLEAN NOT NULL DEFAULT false,
  -- Preparado para vínculo futuro com pagamento OS / lançamento financeiro
  service_order_payment_id UUID,
  financial_transaction_id UUID,
  local_lancamento_id TEXT,
  craft_meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE public.cash_movements
  ADD COLUMN IF NOT EXISTS cash_session_id UUID REFERENCES public.cash_sessions(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS type TEXT,
  ADD COLUMN IF NOT EXISTS amount NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS reason TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_by_name TEXT,
  ADD COLUMN IF NOT EXISTS authorized_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS authorized_by_name TEXT,
  ADD COLUMN IF NOT EXISTS authorized_by_pin BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS service_order_payment_id UUID,
  ADD COLUMN IF NOT EXISTS financial_transaction_id UUID,
  ADD COLUMN IF NOT EXISTS local_lancamento_id TEXT,
  ADD COLUMN IF NOT EXISTS craft_meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_cash_movements_office
  ON public.cash_movements (office_id);

CREATE INDEX IF NOT EXISTS idx_cash_movements_session
  ON public.cash_movements (cash_session_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cash_movements_office_session_created
  ON public.cash_movements (office_id, cash_session_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cash_movements_sopayment
  ON public.cash_movements (service_order_payment_id)
  WHERE service_order_payment_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cash_movements_fin_tx
  ON public.cash_movements (financial_transaction_id)
  WHERE financial_transaction_id IS NOT NULL AND deleted_at IS NULL;

COMMENT ON TABLE public.cash_movements IS
  'Movimentos de caixa (manual, sangria, suprimento, venda, estorno). Fase 2A: sem vínculo automático com pagamento de OS.';

DROP TRIGGER IF EXISTS trg_cash_movements_updated_at ON public.cash_movements;
CREATE TRIGGER trg_cash_movements_updated_at
  BEFORE UPDATE ON public.cash_movements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- RLS — tenant por office_id (mesmo padrão de cash_sessions)
-- -----------------------------------------------------------------------------
ALTER TABLE public.cash_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cash_movements_select" ON public.cash_movements;
DROP POLICY IF EXISTS "cash_movements_insert" ON public.cash_movements;
DROP POLICY IF EXISTS "cash_movements_update" ON public.cash_movements;
DROP POLICY IF EXISTS "cash_movements_delete" ON public.cash_movements;

CREATE POLICY "cash_movements_select" ON public.cash_movements
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_system_admin())
    OR office_id = public.current_office_id()
  );

CREATE POLICY "cash_movements_insert" ON public.cash_movements
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_system_admin())
    OR (
      office_id = public.current_office_id()
      AND public.current_office_id() IS NOT NULL
    )
  );

CREATE POLICY "cash_movements_update" ON public.cash_movements
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.is_system_admin())
    OR office_id = public.current_office_id()
  )
  WITH CHECK (
    (SELECT public.is_system_admin())
    OR (
      office_id = public.current_office_id()
      AND public.current_office_id() IS NOT NULL
    )
  );

-- Soft delete via UPDATE (deleted_at). Sem DELETE físico para authenticated.
CREATE POLICY "cash_movements_delete" ON public.cash_movements
  FOR DELETE TO authenticated
  USING ((SELECT public.is_system_admin()));

-- -----------------------------------------------------------------------------
-- GRANTs
-- -----------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO authenticated;

GRANT SELECT, INSERT, UPDATE ON public.cash_movements TO authenticated;
GRANT ALL ON public.cash_movements TO service_role;
REVOKE ALL ON public.cash_movements FROM anon;

NOTIFY pgrst, 'reload schema';
