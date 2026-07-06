-- =============================================================================
-- Histórico de comunicação (WhatsApp / mensagens ao cliente)
-- =============================================================================
-- Pré-requisitos: offices, current_office_id() (docs/supabase-fix-rls-office.sql)
-- Admin sistema opcional: is_system_admin() (docs/supabase-admin-system.sql)

CREATE TABLE IF NOT EXISTS public.communication_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id UUID NOT NULL REFERENCES public.offices(id) ON DELETE CASCADE,
  local_id TEXT,
  client_id UUID,
  vehicle_id UUID,
  service_order_id UUID,
  tipo TEXT NOT NULL,
  status TEXT NOT NULL,
  message_text TEXT NOT NULL DEFAULT '',
  preview TEXT NOT NULL DEFAULT '',
  responsavel_nome TEXT,
  sent_at TIMESTAMPTZ NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.communication_history
  ADD COLUMN IF NOT EXISTS local_id TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_communication_history_office_sent
  ON public.communication_history(office_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_communication_history_office_client
  ON public.communication_history(office_id, client_id);

CREATE INDEX IF NOT EXISTS idx_communication_history_office_os
  ON public.communication_history(office_id, service_order_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_communication_history_office_local
  ON public.communication_history(office_id, local_id)
  WHERE local_id IS NOT NULL;

-- Constraint explícita para upsert via PostgREST (onConflict office_id,local_id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'communication_history_office_local_unique'
  ) THEN
    ALTER TABLE public.communication_history
      ADD CONSTRAINT communication_history_office_local_unique
      UNIQUE (office_id, local_id);
  END IF;
END $$;

COMMENT ON TABLE public.communication_history IS
  'Histórico de mensagens enviadas ao cliente (WhatsApp manual, modelos prontos, etc.)';

-- =============================================================================
-- RLS — isolamento por office_id
-- =============================================================================

ALTER TABLE public.communication_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "communication_history_select_tenant" ON public.communication_history;
DROP POLICY IF EXISTS "communication_history_insert_tenant" ON public.communication_history;
DROP POLICY IF EXISTS "communication_history_update_tenant" ON public.communication_history;
DROP POLICY IF EXISTS "communication_history_delete_tenant" ON public.communication_history;

CREATE POLICY "communication_history_select_tenant" ON public.communication_history
  FOR SELECT TO authenticated
  USING (
    office_id = public.current_office_id()
    OR (SELECT public.is_system_admin())
  );

CREATE POLICY "communication_history_insert_tenant" ON public.communication_history
  FOR INSERT TO authenticated
  WITH CHECK (
    office_id IS NOT NULL
    AND office_id = public.current_office_id()
    AND public.current_office_id() IS NOT NULL
  );

CREATE POLICY "communication_history_update_tenant" ON public.communication_history
  FOR UPDATE TO authenticated
  USING (office_id = public.current_office_id())
  WITH CHECK (
    office_id = public.current_office_id()
    AND public.current_office_id() IS NOT NULL
  );

CREATE POLICY "communication_history_delete_tenant" ON public.communication_history
  FOR DELETE TO authenticated
  USING (office_id = public.current_office_id());
