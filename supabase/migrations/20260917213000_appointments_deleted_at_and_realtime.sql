-- =============================================================================
-- Agenda multi-device: tombstone (deleted_at) + Realtime
-- TIPO: ADITIVA — não apaga, TRUNCATE, DELETE ou altera linhas existentes.
-- NÃO relaxa customer_id / motorcycle_id (continuam NOT NULL nesta fase).
-- =============================================================================

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_appointments_office_deleted_at
  ON public.appointments (office_id, deleted_at);

COMMENT ON COLUMN public.appointments.deleted_at IS
  'Tombstone de exclusão lógica. NULL = agendamento ativo. Não ressuscitar o mesmo id.';

DO $$
BEGIN
  IF to_regclass('public.appointments') IS NULL THEN
    RAISE NOTICE 'Tabela public.appointments inexistente — pulando Realtime';
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE public.appointments REPLICA IDENTITY FULL';

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'appointments'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.appointments';
    RAISE NOTICE 'Realtime habilitado para public.appointments';
  ELSE
    RAISE NOTICE 'Realtime já ativo para public.appointments';
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.appointments TO authenticated;
