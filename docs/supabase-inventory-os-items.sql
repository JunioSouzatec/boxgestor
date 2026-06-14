-- =============================================================================
-- Craft Oficina — Estoque e itens de OS (opcional / fase futura)
-- =============================================================================
--
-- STATUS ATUAL (app em produção):
--   • Peças cadastradas: array `pecas` no localStorage (CraftDatabase)
--   • Movimentações: array `movimentacoes_estoque` no localStorage
--   • Itens na OS: `pecas_utilizadas` dentro de `service_orders.parts_used` JSONB
--   • Flag de baixa: `craft_meta.estoque_baixado` em parts_used
--
-- NÃO é necessário rodar este script para o app funcionar hoje.
--
-- Tabela existente no schema base:
--   • public.inventory_items (subset de campos — ver docs/supabase-schema.sql)
--
-- QUANDO RODAR:
--   Apenas se quiser sincronizar estoque/movimentações no Supabase
--   ou normalizar itens de OS em tabela dedicada.
--
-- ANTES DE EXECUTAR: backup + staging + avisar a equipe.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Ampliar inventory_items (campos extras do app local)
-- ---------------------------------------------------------------------------
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS supplier_id UUID,
  ADD COLUMN IF NOT EXISTS unit TEXT DEFAULT 'unidade',
  ADD COLUMN IF NOT EXISTS location TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS barcode TEXT,
  ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN public.inventory_items.notes IS 'Observação da peça/produto';

-- quantity como NUMERIC para suportar litros/kg (app local usa decimais)
ALTER TABLE public.inventory_items
  ALTER COLUMN quantity TYPE NUMERIC(12, 3) USING quantity::NUMERIC;

-- ---------------------------------------------------------------------------
-- 2) Histórico de movimentações (hoje só localStorage)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id           UUID NOT NULL REFERENCES public.offices(id) ON DELETE CASCADE,
  inventory_item_id   UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  movement_type       TEXT NOT NULL CHECK (movement_type IN ('entrada', 'saida', 'ajuste', 'devolucao')),
  quantity            NUMERIC(12, 3) NOT NULL CHECK (quantity > 0),
  unit_cost           NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_value         NUMERIC(12, 2) NOT NULL DEFAULT 0,
  movement_date       DATE NOT NULL DEFAULT CURRENT_DATE,
  service_order_id    UUID REFERENCES public.service_orders(id) ON DELETE SET NULL,
  service_order_number INTEGER,
  supplier_id         UUID,
  reason              TEXT,
  notes               TEXT,
  user_id             UUID,
  user_name           TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_office
  ON public.inventory_movements(office_id, movement_date DESC);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_item
  ON public.inventory_movements(inventory_item_id);

ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

-- Política tenant (ajuste conforme seu RLS existente):
-- CREATE POLICY "inventory_movements_tenant" ON public.inventory_movements
--   FOR ALL USING (office_id = auth.jwt()->>'office_id');

-- ---------------------------------------------------------------------------
-- 3) Itens normalizados da OS (opcional — hoje em parts_used JSONB)
-- ---------------------------------------------------------------------------
-- CREATE TABLE IF NOT EXISTS public.service_order_items (
--   id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--   office_id           UUID NOT NULL REFERENCES public.offices(id) ON DELETE CASCADE,
--   service_order_id    UUID NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
--   inventory_item_id   UUID REFERENCES public.inventory_items(id) ON DELETE SET NULL,
--   line_id             TEXT NOT NULL,
--   name                TEXT NOT NULL,
--   code                TEXT,
--   quantity            NUMERIC(12, 3) NOT NULL DEFAULT 1,
--   unit                TEXT DEFAULT 'unidade',
--   unit_sale_price     NUMERIC(12, 2) NOT NULL DEFAULT 0,
--   is_manual           BOOLEAN NOT NULL DEFAULT FALSE,
--   notes               TEXT,
--   created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
-- );
