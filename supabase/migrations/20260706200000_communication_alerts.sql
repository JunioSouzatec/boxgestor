-- =============================================================================
-- Central de alertas de comunicação
-- =============================================================================
-- Pré-requisitos: offices, current_office_id() (docs/supabase-fix-rls-office.sql)
-- Admin sistema opcional: is_system_admin() (docs/supabase-admin-system.sql)

CREATE TABLE IF NOT EXISTS public.communication_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id UUID NOT NULL REFERENCES public.offices(id) ON DELETE CASCADE,
  local_id TEXT,
  client_id UUID,
  vehicle_id UUID,
  service_order_id UUID,
  tipo TEXT NOT NULL,
  motivo TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente',
  prioridade TEXT NOT NULL,
  due_date DATE NOT NULL,
  message_text TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

ALTER TABLE public.communication_alerts
  ADD COLUMN IF NOT EXISTS local_id TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_communication_alerts_office_due
  ON public.communication_alerts(office_id, due_date);

CREATE INDEX IF NOT EXISTS idx_communication_alerts_office_status
  ON public.communication_alerts(office_id, status);

CREATE INDEX IF NOT EXISTS idx_communication_alerts_office_os
  ON public.communication_alerts(office_id, service_order_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_communication_alerts_office_local
  ON public.communication_alerts(office_id, local_id)
  WHERE local_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'communication_alerts_office_local_unique'
  ) THEN
    ALTER TABLE public.communication_alerts
      ADD CONSTRAINT communication_alerts_office_local_unique
      UNIQUE (office_id, local_id);
  END IF;
END $$;

COMMENT ON TABLE public.communication_alerts IS
  'Alertas de comunicação — retorno, entrega, revisão e agendamento (sem envio automático)';

-- =============================================================================
-- RLS — isolamento por office_id
-- =============================================================================

ALTER TABLE public.communication_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "communication_alerts_select_tenant" ON public.communication_alerts;
DROP POLICY IF EXISTS "communication_alerts_insert_tenant" ON public.communication_alerts;
DROP POLICY IF EXISTS "communication_alerts_update_tenant" ON public.communication_alerts;
DROP POLICY IF EXISTS "communication_alerts_delete_tenant" ON public.communication_alerts;

CREATE POLICY "communication_alerts_select_tenant" ON public.communication_alerts
  FOR SELECT TO authenticated
  USING (
    office_id = public.current_office_id()
    OR (SELECT public.is_system_admin())
  );

CREATE POLICY "communication_alerts_insert_tenant" ON public.communication_alerts
  FOR INSERT TO authenticated
  WITH CHECK (
    office_id IS NOT NULL
    AND office_id = public.current_office_id()
    AND public.current_office_id() IS NOT NULL
  );

CREATE POLICY "communication_alerts_update_tenant" ON public.communication_alerts
  FOR UPDATE TO authenticated
  USING (office_id = public.current_office_id())
  WITH CHECK (
    office_id = public.current_office_id()
    AND public.current_office_id() IS NOT NULL
  );

CREATE POLICY "communication_alerts_delete_tenant" ON public.communication_alerts
  FOR DELETE TO authenticated
  USING (office_id = public.current_office_id());
