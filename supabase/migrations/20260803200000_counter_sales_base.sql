-- =============================================================================
-- BoxGestor — RC2 Venda Balcão Fase A1: base técnica
-- Migration ADITIVA e idempotente. NÃO remove dados.
--
-- Escopo desta fase:
--   • counter_sales — cabeçalho da venda balcão
--   • counter_sale_items — itens da venda
--   • RLS: SOMENTE dono (profiles.role = 'owner') + admin sistema
--   • Gerente (role = 'admin'), mecânico e recepção: SEM acesso nesta A1
--     (liberação de gerente fica para fase de tela/permissões)
--   • NÃO baixa estoque
--   • NÃO cria movimento de caixa
--   • NÃO cria lançamento financeiro
--   • NÃO emite nota fiscal (fiscal_status / fiscal_metadata só preparação)
--   • NÃO altera inventory_items / inventory_movements / XML de compra
--   • NÃO altera OS / pagamentos de OS
--
-- Pré-requisitos:
--   • public.offices
--   • public.profiles
--   • public.current_office_id()
--   • public.is_system_admin()
--   • public.set_updated_at()
--   • public.inventory_items (FK opcional nos itens)
--   • public.customers (FK opcional no cabeçalho)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) counter_sales
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.counter_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id UUID NOT NULL REFERENCES public.offices(id) ON DELETE CASCADE,
  local_id TEXT,
  sale_number INTEGER,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  local_customer_id TEXT,
  customer_name TEXT,
  customer_document TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'paid', 'pending', 'canceled')),
  payment_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('paid', 'pending', 'canceled')),
  payment_method TEXT
    CHECK (
      payment_method IS NULL
      OR payment_method IN (
        'dinheiro',
        'pix',
        'cartao_credito',
        'cartao_debito',
        'transferencia',
        'outro',
        'pendente'
      )
    ),
  subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  discount_total NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (discount_total >= 0),
  total NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  paid_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  pending_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (pending_amount >= 0),
  notes TEXT,
  seller_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  seller_name TEXT,
  sold_at TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  canceled_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  canceled_by_name TEXT,
  cancel_reason TEXT,
  fiscal_status TEXT NOT NULL DEFAULT 'nao_emitida',
  fiscal_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  craft_meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE public.counter_sales
  ADD COLUMN IF NOT EXISTS local_id TEXT,
  ADD COLUMN IF NOT EXISTS sale_number INTEGER,
  ADD COLUMN IF NOT EXISTS customer_id UUID,
  ADD COLUMN IF NOT EXISTS local_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS customer_name TEXT,
  ADD COLUMN IF NOT EXISTS customer_document TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT,
  ADD COLUMN IF NOT EXISTS payment_status TEXT,
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS subtotal NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS discount_total NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS total NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS pending_amount NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS seller_user_id UUID,
  ADD COLUMN IF NOT EXISTS seller_name TEXT,
  ADD COLUMN IF NOT EXISTS sold_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS canceled_by UUID,
  ADD COLUMN IF NOT EXISTS canceled_by_name TEXT,
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT,
  ADD COLUMN IF NOT EXISTS fiscal_status TEXT,
  ADD COLUMN IF NOT EXISTS fiscal_metadata JSONB,
  ADD COLUMN IF NOT EXISTS craft_meta JSONB,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'counter_sales_office_local_unique'
  ) THEN
    ALTER TABLE public.counter_sales
      ADD CONSTRAINT counter_sales_office_local_unique UNIQUE (office_id, local_id);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS counter_sales_office_local_id_uidx
  ON public.counter_sales (office_id, local_id);

CREATE UNIQUE INDEX IF NOT EXISTS counter_sales_office_sale_number_uidx
  ON public.counter_sales (office_id, sale_number)
  WHERE sale_number IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_counter_sales_office
  ON public.counter_sales (office_id);

CREATE INDEX IF NOT EXISTS idx_counter_sales_office_status
  ON public.counter_sales (office_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_counter_sales_office_payment_status
  ON public.counter_sales (office_id, payment_status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_counter_sales_office_sold_at
  ON public.counter_sales (office_id, sold_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_counter_sales_office_customer
  ON public.counter_sales (office_id, customer_id)
  WHERE customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_counter_sales_office_local_customer
  ON public.counter_sales (office_id, local_customer_id)
  WHERE local_customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_counter_sales_deleted
  ON public.counter_sales (office_id, deleted_at);

COMMENT ON TABLE public.counter_sales IS
  'RC2 A1: venda balcão (peças/produtos sem OS). Sem baixa de estoque/caixa/financeiro nesta fase.';

DROP TRIGGER IF EXISTS trg_counter_sales_updated_at ON public.counter_sales;
CREATE TRIGGER trg_counter_sales_updated_at
  BEFORE UPDATE ON public.counter_sales
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 2) counter_sale_items
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.counter_sale_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id UUID NOT NULL REFERENCES public.offices(id) ON DELETE CASCADE,
  sale_id UUID NOT NULL REFERENCES public.counter_sales(id) ON DELETE CASCADE,
  local_id TEXT,
  inventory_item_id UUID REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  inventory_local_id TEXT,
  item_name TEXT NOT NULL,
  sku TEXT,
  quantity NUMERIC(12, 3) NOT NULL CHECK (quantity > 0),
  unit TEXT,
  unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
  discount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
  total NUMERIC(12, 2) NOT NULL CHECK (total >= 0),
  cost_price_snapshot NUMERIC(12, 2),
  sale_price_snapshot NUMERIC(12, 2),
  stock_before NUMERIC(12, 3),
  stock_after NUMERIC(12, 3),
  fiscal_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  craft_meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE public.counter_sale_items
  ADD COLUMN IF NOT EXISTS local_id TEXT,
  ADD COLUMN IF NOT EXISTS inventory_item_id UUID,
  ADD COLUMN IF NOT EXISTS inventory_local_id TEXT,
  ADD COLUMN IF NOT EXISTS item_name TEXT,
  ADD COLUMN IF NOT EXISTS sku TEXT,
  ADD COLUMN IF NOT EXISTS quantity NUMERIC(12, 3),
  ADD COLUMN IF NOT EXISTS unit TEXT,
  ADD COLUMN IF NOT EXISTS unit_price NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS discount NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS total NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS cost_price_snapshot NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS sale_price_snapshot NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS stock_before NUMERIC(12, 3),
  ADD COLUMN IF NOT EXISTS stock_after NUMERIC(12, 3),
  ADD COLUMN IF NOT EXISTS fiscal_metadata JSONB,
  ADD COLUMN IF NOT EXISTS craft_meta JSONB,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'counter_sale_items_office_local_unique'
  ) THEN
    ALTER TABLE public.counter_sale_items
      ADD CONSTRAINT counter_sale_items_office_local_unique UNIQUE (office_id, local_id);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS counter_sale_items_office_local_id_uidx
  ON public.counter_sale_items (office_id, local_id);

CREATE INDEX IF NOT EXISTS idx_counter_sale_items_office
  ON public.counter_sale_items (office_id);

CREATE INDEX IF NOT EXISTS idx_counter_sale_items_sale
  ON public.counter_sale_items (office_id, sale_id);

CREATE INDEX IF NOT EXISTS idx_counter_sale_items_inventory
  ON public.counter_sale_items (office_id, inventory_item_id)
  WHERE inventory_item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_counter_sale_items_inventory_local
  ON public.counter_sale_items (office_id, inventory_local_id)
  WHERE inventory_local_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_counter_sale_items_deleted
  ON public.counter_sale_items (office_id, deleted_at);

COMMENT ON TABLE public.counter_sale_items IS
  'RC2 A1: itens da venda balcão. stock_before/after e baixa real ficam para Fase A2.';

DROP TRIGGER IF EXISTS trg_counter_sale_items_updated_at ON public.counter_sale_items;
CREATE TRIGGER trg_counter_sale_items_updated_at
  BEFORE UPDATE ON public.counter_sale_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 3) RLS — somente dono (owner) + admin sistema
-- Gerente (admin), mecânico e recepção: sem acesso nesta A1.
-- Soft delete via UPDATE (deleted_at). Sem DELETE físico para authenticated.
-- -----------------------------------------------------------------------------
ALTER TABLE public.counter_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.counter_sale_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "counter_sales_select" ON public.counter_sales;
DROP POLICY IF EXISTS "counter_sales_insert" ON public.counter_sales;
DROP POLICY IF EXISTS "counter_sales_update" ON public.counter_sales;
DROP POLICY IF EXISTS "counter_sales_delete" ON public.counter_sales;

CREATE POLICY "counter_sales_select" ON public.counter_sales
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_system_admin())
    OR (
      office_id = public.current_office_id()
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.office_id = counter_sales.office_id
          AND p.role = 'owner'
          AND COALESCE(p.active, TRUE) = TRUE
      )
    )
  );

CREATE POLICY "counter_sales_insert" ON public.counter_sales
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_system_admin())
    OR (
      office_id = public.current_office_id()
      AND public.current_office_id() IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.office_id = counter_sales.office_id
          AND p.role = 'owner'
          AND COALESCE(p.active, TRUE) = TRUE
      )
    )
  );

CREATE POLICY "counter_sales_update" ON public.counter_sales
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.is_system_admin())
    OR (
      office_id = public.current_office_id()
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.office_id = counter_sales.office_id
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
          AND p.office_id = counter_sales.office_id
          AND p.role = 'owner'
          AND COALESCE(p.active, TRUE) = TRUE
      )
    )
  );

CREATE POLICY "counter_sales_delete" ON public.counter_sales
  FOR DELETE TO authenticated
  USING ((SELECT public.is_system_admin()));

DROP POLICY IF EXISTS "counter_sale_items_select" ON public.counter_sale_items;
DROP POLICY IF EXISTS "counter_sale_items_insert" ON public.counter_sale_items;
DROP POLICY IF EXISTS "counter_sale_items_update" ON public.counter_sale_items;
DROP POLICY IF EXISTS "counter_sale_items_delete" ON public.counter_sale_items;

CREATE POLICY "counter_sale_items_select" ON public.counter_sale_items
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_system_admin())
    OR (
      office_id = public.current_office_id()
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.office_id = counter_sale_items.office_id
          AND p.role = 'owner'
          AND COALESCE(p.active, TRUE) = TRUE
      )
    )
  );

CREATE POLICY "counter_sale_items_insert" ON public.counter_sale_items
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_system_admin())
    OR (
      office_id = public.current_office_id()
      AND public.current_office_id() IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.office_id = counter_sale_items.office_id
          AND p.role = 'owner'
          AND COALESCE(p.active, TRUE) = TRUE
      )
    )
  );

CREATE POLICY "counter_sale_items_update" ON public.counter_sale_items
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.is_system_admin())
    OR (
      office_id = public.current_office_id()
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.office_id = counter_sale_items.office_id
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
          AND p.office_id = counter_sale_items.office_id
          AND p.role = 'owner'
          AND COALESCE(p.active, TRUE) = TRUE
      )
    )
  );

CREATE POLICY "counter_sale_items_delete" ON public.counter_sale_items
  FOR DELETE TO authenticated
  USING ((SELECT public.is_system_admin()));

-- -----------------------------------------------------------------------------
-- 4) Grants
-- -----------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO authenticated;

GRANT SELECT, INSERT, UPDATE ON public.counter_sales TO authenticated;
GRANT ALL ON public.counter_sales TO service_role;
REVOKE ALL ON public.counter_sales FROM anon;

GRANT SELECT, INSERT, UPDATE ON public.counter_sale_items TO authenticated;
GRANT ALL ON public.counter_sale_items TO service_role;
REVOKE ALL ON public.counter_sale_items FROM anon;

NOTIFY pgrst, 'reload schema';
