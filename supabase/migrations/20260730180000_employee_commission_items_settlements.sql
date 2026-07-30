-- =============================================================================
-- BoxGestor — RC2 Comissão Fase B1: itens por OS + baixas parciais
-- Migration ADITIVA e idempotente.
--
-- NÃO remove / NÃO altera:
--   • public.employee_commission_payments (modelo antigo por competência)
--   • public.employee_commission_profiles
--   • RLS existente de payments
--
-- Objetivo:
--   Base técnica para conta corrente do mecânico:
--   - item de comissão por OS
--   - várias baixas no mesmo mês
--   - vínculo baixa ↔ itens (pagamento parcial / FIFO)
--
-- Pré-requisitos:
--   • public.offices, public.profiles
--   • public.current_office_id()
--   • public.is_system_admin()
--
-- RLS nesta fase (igual legado de payments — seguro):
--   • SELECT/INSERT/UPDATE: DONO (role owner) ou Admin Sistema
--   • Mecânico/recepção/gerente: sem acesso direto via RLS
--   • Privacidade do mecânico continua na aplicação (Minha Comissão)
--   • Pendência futura: policy segura para mecânico ler só os próprios itens
--   • Sem DELETE policy (soft-delete via deleted_at)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) employee_commission_items — comissão gerada por OS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.employee_commission_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id UUID NOT NULL REFERENCES public.offices(id) ON DELETE CASCADE,
  -- id local do perfil de comissão (employee_commission_profiles.local_id / app)
  employee_id TEXT NOT NULL,
  employee_name TEXT NOT NULL DEFAULT '',
  -- id local da OS no app
  service_order_id TEXT NOT NULL,
  service_order_number TEXT,
  customer_name TEXT,
  vehicle_label TEXT,
  competence_month TEXT NOT NULL CHECK (competence_month ~ '^\d{4}-\d{2}$'),
  reference_date DATE,
  base_labor NUMERIC(12, 2) NOT NULL DEFAULT 0,
  base_parts NUMERIC(12, 2) NOT NULL DEFAULT 0,
  commission_type TEXT,
  labor_percent NUMERIC(8, 4) NOT NULL DEFAULT 0,
  parts_percent NUMERIC(8, 4) NOT NULL DEFAULT 0,
  commission_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  paid_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  open_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'em_aberto'
    CHECK (status IN ('em_aberto', 'parcial', 'pago', 'cancelado', 'ajustado')),
  source_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  adjustment_of_item_id UUID NULL REFERENCES public.employee_commission_items(id) ON DELETE SET NULL,
  adjustment_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE public.employee_commission_items
  ADD COLUMN IF NOT EXISTS employee_name TEXT,
  ADD COLUMN IF NOT EXISTS service_order_number TEXT,
  ADD COLUMN IF NOT EXISTS customer_name TEXT,
  ADD COLUMN IF NOT EXISTS vehicle_label TEXT,
  ADD COLUMN IF NOT EXISTS competence_month TEXT,
  ADD COLUMN IF NOT EXISTS reference_date DATE,
  ADD COLUMN IF NOT EXISTS base_labor NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS base_parts NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS commission_type TEXT,
  ADD COLUMN IF NOT EXISTS labor_percent NUMERIC(8, 4),
  ADD COLUMN IF NOT EXISTS parts_percent NUMERIC(8, 4),
  ADD COLUMN IF NOT EXISTS commission_amount NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS open_amount NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS status TEXT,
  ADD COLUMN IF NOT EXISTS source_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS adjustment_of_item_id UUID,
  ADD COLUMN IF NOT EXISTS adjustment_reason TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Um item “principal” ativo por OS + funcionário (ajustes podem multiplicar)
CREATE UNIQUE INDEX IF NOT EXISTS employee_commission_items_ativo_os_unique
  ON public.employee_commission_items (office_id, employee_id, service_order_id)
  WHERE adjustment_of_item_id IS NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_employee_commission_items_office
  ON public.employee_commission_items (office_id);

CREATE INDEX IF NOT EXISTS idx_employee_commission_items_employee
  ON public.employee_commission_items (office_id, employee_id);

CREATE INDEX IF NOT EXISTS idx_employee_commission_items_competence
  ON public.employee_commission_items (office_id, competence_month);

CREATE INDEX IF NOT EXISTS idx_employee_commission_items_os
  ON public.employee_commission_items (office_id, service_order_id);

CREATE INDEX IF NOT EXISTS idx_employee_commission_items_status
  ON public.employee_commission_items (office_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_employee_commission_items_deleted
  ON public.employee_commission_items (office_id, deleted_at);

COMMENT ON TABLE public.employee_commission_items IS
  'RC2 B1: item de comissão por OS (conta corrente do mecânico). open_amount = commission_amount - paid_amount na aplicação.';

-- -----------------------------------------------------------------------------
-- 2) employee_commission_settlements — baixas/pagamentos (várias no mês)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.employee_commission_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id UUID NOT NULL REFERENCES public.offices(id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL,
  employee_name TEXT NOT NULL DEFAULT '',
  -- competência opcional (filtro/relatório); NÃO há unique por mês
  competence_month TEXT NULL CHECK (
    competence_month IS NULL OR competence_month ~ '^\d{4}-\d{2}$'
  ),
  amount_paid NUMERIC(12, 2) NOT NULL DEFAULT 0,
  payment_method TEXT,
  paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_by UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  paid_by_name TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'ativo'
    CHECK (status IN ('ativo', 'corrigido', 'cancelado')),
  correction_of_id UUID NULL REFERENCES public.employee_commission_settlements(id) ON DELETE SET NULL,
  correction_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE public.employee_commission_settlements
  ADD COLUMN IF NOT EXISTS employee_name TEXT,
  ADD COLUMN IF NOT EXISTS competence_month TEXT,
  ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paid_by UUID,
  ADD COLUMN IF NOT EXISTS paid_by_name TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT,
  ADD COLUMN IF NOT EXISTS correction_of_id UUID,
  ADD COLUMN IF NOT EXISTS correction_reason TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_employee_commission_settlements_office
  ON public.employee_commission_settlements (office_id);

CREATE INDEX IF NOT EXISTS idx_employee_commission_settlements_employee
  ON public.employee_commission_settlements (office_id, employee_id);

CREATE INDEX IF NOT EXISTS idx_employee_commission_settlements_competence
  ON public.employee_commission_settlements (office_id, competence_month);

CREATE INDEX IF NOT EXISTS idx_employee_commission_settlements_paid_at
  ON public.employee_commission_settlements (office_id, paid_at DESC);

COMMENT ON TABLE public.employee_commission_settlements IS
  'RC2 B1: baixa/pagamento de comissão. Permite várias baixas no mesmo mês (semanal/parcial/aleatória).';

-- -----------------------------------------------------------------------------
-- 3) employee_commission_settlement_items — vínculo baixa ↔ itens
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.employee_commission_settlement_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id UUID NOT NULL REFERENCES public.offices(id) ON DELETE CASCADE,
  settlement_id UUID NOT NULL REFERENCES public.employee_commission_settlements(id) ON DELETE CASCADE,
  commission_item_id UUID NOT NULL REFERENCES public.employee_commission_items(id) ON DELETE RESTRICT,
  amount_paid NUMERIC(12, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.employee_commission_settlement_items
  ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_employee_commission_settlement_items_office
  ON public.employee_commission_settlement_items (office_id);

CREATE INDEX IF NOT EXISTS idx_employee_commission_settlement_items_settlement
  ON public.employee_commission_settlement_items (settlement_id);

CREATE INDEX IF NOT EXISTS idx_employee_commission_settlement_items_item
  ON public.employee_commission_settlement_items (commission_item_id);

COMMENT ON TABLE public.employee_commission_settlement_items IS
  'RC2 B1: alocação de valor de uma baixa nos itens de comissão (FIFO ou seleção).';

-- -----------------------------------------------------------------------------
-- RLS — mesma política do legado employee_commission_payments (dono/admin sistema)
-- -----------------------------------------------------------------------------
ALTER TABLE public.employee_commission_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_commission_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_commission_settlement_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "employee_commission_items_select" ON public.employee_commission_items;
DROP POLICY IF EXISTS "employee_commission_items_insert" ON public.employee_commission_items;
DROP POLICY IF EXISTS "employee_commission_items_update" ON public.employee_commission_items;

CREATE POLICY "employee_commission_items_select" ON public.employee_commission_items
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_system_admin())
    OR (
      office_id = public.current_office_id()
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.office_id = employee_commission_items.office_id
          AND p.role = 'owner'
          AND COALESCE(p.active, TRUE) = TRUE
      )
    )
  );

CREATE POLICY "employee_commission_items_insert" ON public.employee_commission_items
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_system_admin())
    OR (
      office_id = public.current_office_id()
      AND public.current_office_id() IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.office_id = employee_commission_items.office_id
          AND p.role = 'owner'
          AND COALESCE(p.active, TRUE) = TRUE
      )
    )
  );

CREATE POLICY "employee_commission_items_update" ON public.employee_commission_items
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.is_system_admin())
    OR (
      office_id = public.current_office_id()
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.office_id = employee_commission_items.office_id
          AND p.role = 'owner'
          AND COALESCE(p.active, TRUE) = TRUE
      )
    )
  )
  WITH CHECK (
    (SELECT public.is_system_admin())
    OR (
      office_id = public.current_office_id()
      AND public.current_office_id() IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.office_id = employee_commission_items.office_id
          AND p.role = 'owner'
          AND COALESCE(p.active, TRUE) = TRUE
      )
    )
  );

DROP POLICY IF EXISTS "employee_commission_settlements_select" ON public.employee_commission_settlements;
DROP POLICY IF EXISTS "employee_commission_settlements_insert" ON public.employee_commission_settlements;
DROP POLICY IF EXISTS "employee_commission_settlements_update" ON public.employee_commission_settlements;

CREATE POLICY "employee_commission_settlements_select" ON public.employee_commission_settlements
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_system_admin())
    OR (
      office_id = public.current_office_id()
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.office_id = employee_commission_settlements.office_id
          AND p.role = 'owner'
          AND COALESCE(p.active, TRUE) = TRUE
      )
    )
  );

CREATE POLICY "employee_commission_settlements_insert" ON public.employee_commission_settlements
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_system_admin())
    OR (
      office_id = public.current_office_id()
      AND public.current_office_id() IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.office_id = employee_commission_settlements.office_id
          AND p.role = 'owner'
          AND COALESCE(p.active, TRUE) = TRUE
      )
    )
  );

CREATE POLICY "employee_commission_settlements_update" ON public.employee_commission_settlements
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.is_system_admin())
    OR (
      office_id = public.current_office_id()
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.office_id = employee_commission_settlements.office_id
          AND p.role = 'owner'
          AND COALESCE(p.active, TRUE) = TRUE
      )
    )
  )
  WITH CHECK (
    (SELECT public.is_system_admin())
    OR (
      office_id = public.current_office_id()
      AND public.current_office_id() IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.office_id = employee_commission_settlements.office_id
          AND p.role = 'owner'
          AND COALESCE(p.active, TRUE) = TRUE
      )
    )
  );

DROP POLICY IF EXISTS "employee_commission_settlement_items_select" ON public.employee_commission_settlement_items;
DROP POLICY IF EXISTS "employee_commission_settlement_items_insert" ON public.employee_commission_settlement_items;
DROP POLICY IF EXISTS "employee_commission_settlement_items_update" ON public.employee_commission_settlement_items;

CREATE POLICY "employee_commission_settlement_items_select" ON public.employee_commission_settlement_items
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_system_admin())
    OR (
      office_id = public.current_office_id()
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.office_id = employee_commission_settlement_items.office_id
          AND p.role = 'owner'
          AND COALESCE(p.active, TRUE) = TRUE
      )
    )
  );

CREATE POLICY "employee_commission_settlement_items_insert" ON public.employee_commission_settlement_items
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_system_admin())
    OR (
      office_id = public.current_office_id()
      AND public.current_office_id() IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.office_id = employee_commission_settlement_items.office_id
          AND p.role = 'owner'
          AND COALESCE(p.active, TRUE) = TRUE
      )
    )
  );

CREATE POLICY "employee_commission_settlement_items_update" ON public.employee_commission_settlement_items
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.is_system_admin())
    OR (
      office_id = public.current_office_id()
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.office_id = employee_commission_settlement_items.office_id
          AND p.role = 'owner'
          AND COALESCE(p.active, TRUE) = TRUE
      )
    )
  )
  WITH CHECK (
    (SELECT public.is_system_admin())
    OR (
      office_id = public.current_office_id()
      AND public.current_office_id() IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.office_id = employee_commission_settlement_items.office_id
          AND p.role = 'owner'
          AND COALESCE(p.active, TRUE) = TRUE
      )
    )
  );

GRANT USAGE ON SCHEMA public TO authenticated;

GRANT SELECT, INSERT, UPDATE ON public.employee_commission_items TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.employee_commission_settlements TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.employee_commission_settlement_items TO authenticated;

GRANT ALL ON public.employee_commission_items TO service_role;
GRANT ALL ON public.employee_commission_settlements TO service_role;
GRANT ALL ON public.employee_commission_settlement_items TO service_role;

REVOKE ALL ON public.employee_commission_items FROM anon;
REVOKE ALL ON public.employee_commission_settlements FROM anon;
REVOKE ALL ON public.employee_commission_settlement_items FROM anon;

NOTIFY pgrst, 'reload schema';
