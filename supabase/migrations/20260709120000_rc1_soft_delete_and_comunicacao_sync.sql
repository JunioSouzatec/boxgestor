-- =============================================================================
-- RC1: soft delete (clientes, veículos, estoque) + sync comunicação
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Soft delete em entidades fase 1
-- ---------------------------------------------------------------------------
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE public.motorcycles
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_customers_office_active
  ON public.customers(office_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_motorcycles_office_active
  ON public.motorcycles(office_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_items_office_active
  ON public.inventory_items(office_id)
  WHERE deleted_at IS NULL AND active = TRUE;

-- ---------------------------------------------------------------------------
-- 2) Mensagens agendadas (multi-dispositivo)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.scheduled_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id UUID NOT NULL REFERENCES public.offices(id) ON DELETE CASCADE,
  local_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'enviada', 'cancelada')),
  scheduled_for TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  customer_id TEXT,
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  vehicle_id TEXT,
  vehicle_description TEXT,
  plate TEXT,
  message_type TEXT NOT NULL,
  message_text TEXT NOT NULL,
  internal_note TEXT,
  service_order_id TEXT,
  service_order_number INTEGER,
  origin TEXT NOT NULL DEFAULT 'manual',
  responsible_id TEXT,
  responsible_name TEXT,
  revision_type TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_scheduled_messages_office_local
  ON public.scheduled_messages(office_id, local_id);

CREATE INDEX IF NOT EXISTS idx_scheduled_messages_office_scheduled
  ON public.scheduled_messages(office_id, scheduled_for)
  WHERE deleted_at IS NULL AND status = 'pendente';

-- ---------------------------------------------------------------------------
-- 3) RLS scheduled_messages (mesmo padrão communication_alerts)
-- ---------------------------------------------------------------------------
ALTER TABLE public.scheduled_messages ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'scheduled_messages'
      AND policyname = 'scheduled_messages_office_access'
  ) THEN
    CREATE POLICY scheduled_messages_office_access ON public.scheduled_messages
      FOR ALL
      USING (office_id = public.current_office_id())
      WITH CHECK (office_id = public.current_office_id());
  END IF;
END $$;
