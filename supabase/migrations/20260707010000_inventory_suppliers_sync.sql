-- =============================================================================
-- Estoque: peças, fornecedores e movimentações (sync multi-dispositivo)
-- =============================================================================
-- Pré-requisitos: offices, inventory_items (schema base), current_office_id()

-- ---------------------------------------------------------------------------
-- 1) Ampliar inventory_items
-- ---------------------------------------------------------------------------
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS local_id TEXT,
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS supplier_id UUID,
  ADD COLUMN IF NOT EXISTS unit TEXT DEFAULT 'unidade',
  ADD COLUMN IF NOT EXISTS location TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS barcode TEXT,
  ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.inventory_items
  ALTER COLUMN quantity TYPE NUMERIC(12, 3) USING quantity::NUMERIC;

CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_items_office_local
  ON public.inventory_items(office_id, local_id)
  WHERE local_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inventory_items_office_local_unique'
  ) THEN
    ALTER TABLE public.inventory_items
      ADD CONSTRAINT inventory_items_office_local_unique UNIQUE (office_id, local_id);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2) Fornecedores
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id UUID NOT NULL REFERENCES public.offices(id) ON DELETE CASCADE,
  local_id TEXT,
  name TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_suppliers_office_local
  ON public.suppliers(office_id, local_id)
  WHERE local_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'suppliers_office_local_unique'
  ) THEN
    ALTER TABLE public.suppliers
      ADD CONSTRAINT suppliers_office_local_unique UNIQUE (office_id, local_id);
  END IF;
END $$;

ALTER TABLE public.inventory_items
  DROP CONSTRAINT IF EXISTS inventory_items_supplier_id_fkey;

ALTER TABLE public.inventory_items
  ADD CONSTRAINT inventory_items_supplier_id_fkey
  FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 3) Movimentações de estoque
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id UUID NOT NULL REFERENCES public.offices(id) ON DELETE CASCADE,
  local_id TEXT,
  inventory_item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('entrada', 'saida', 'ajuste', 'devolucao')),
  quantity NUMERIC(12, 3) NOT NULL CHECK (quantity > 0),
  unit_cost NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_value NUMERIC(12, 2) NOT NULL DEFAULT 0,
  movement_date DATE NOT NULL DEFAULT CURRENT_DATE,
  service_order_id UUID REFERENCES public.service_orders(id) ON DELETE SET NULL,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  reason TEXT,
  notes TEXT,
  user_id UUID,
  user_name TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS local_id TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_movements_office_local
  ON public.inventory_movements(office_id, local_id)
  WHERE local_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inventory_movements_office_local_unique'
  ) THEN
    ALTER TABLE public.inventory_movements
      ADD CONSTRAINT inventory_movements_office_local_unique UNIQUE (office_id, local_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_inventory_movements_office
  ON public.inventory_movements(office_id, movement_date DESC);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_item
  ON public.inventory_movements(inventory_item_id);

-- ---------------------------------------------------------------------------
-- 4) RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "suppliers_select_tenant" ON public.suppliers;
DROP POLICY IF EXISTS "suppliers_insert_tenant" ON public.suppliers;
DROP POLICY IF EXISTS "suppliers_update_tenant" ON public.suppliers;
DROP POLICY IF EXISTS "suppliers_delete_tenant" ON public.suppliers;

CREATE POLICY "suppliers_select_tenant" ON public.suppliers
  FOR SELECT TO authenticated
  USING (
    office_id = public.current_office_id()
    OR (SELECT public.is_system_admin())
  );

CREATE POLICY "suppliers_insert_tenant" ON public.suppliers
  FOR INSERT TO authenticated
  WITH CHECK (
    office_id IS NOT NULL
    AND office_id = public.current_office_id()
    AND public.current_office_id() IS NOT NULL
  );

CREATE POLICY "suppliers_update_tenant" ON public.suppliers
  FOR UPDATE TO authenticated
  USING (office_id = public.current_office_id())
  WITH CHECK (
    office_id = public.current_office_id()
    AND public.current_office_id() IS NOT NULL
  );

CREATE POLICY "suppliers_delete_tenant" ON public.suppliers
  FOR DELETE TO authenticated
  USING (office_id = public.current_office_id());

DROP POLICY IF EXISTS "inventory_movements_select_tenant" ON public.inventory_movements;
DROP POLICY IF EXISTS "inventory_movements_insert_tenant" ON public.inventory_movements;
DROP POLICY IF EXISTS "inventory_movements_update_tenant" ON public.inventory_movements;
DROP POLICY IF EXISTS "inventory_movements_delete_tenant" ON public.inventory_movements;

CREATE POLICY "inventory_movements_select_tenant" ON public.inventory_movements
  FOR SELECT TO authenticated
  USING (
    office_id = public.current_office_id()
    OR (SELECT public.is_system_admin())
  );

CREATE POLICY "inventory_movements_insert_tenant" ON public.inventory_movements
  FOR INSERT TO authenticated
  WITH CHECK (
    office_id IS NOT NULL
    AND office_id = public.current_office_id()
    AND public.current_office_id() IS NOT NULL
  );

CREATE POLICY "inventory_movements_update_tenant" ON public.inventory_movements
  FOR UPDATE TO authenticated
  USING (office_id = public.current_office_id())
  WITH CHECK (
    office_id = public.current_office_id()
    AND public.current_office_id() IS NOT NULL
  );

CREATE POLICY "inventory_movements_delete_tenant" ON public.inventory_movements
  FOR DELETE TO authenticated
  USING (office_id = public.current_office_id());
