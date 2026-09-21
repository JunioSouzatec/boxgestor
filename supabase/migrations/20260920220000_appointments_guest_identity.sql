-- =============================================================================
-- Agenda: agendamento rápido (guest) sem poluir customers/motorcycles
-- TIPO: ADITIVA + relaxamento controlado de NOT NULL + CHECK de identidade.
-- NÃO altera Realtime, publication, replica identity, RLS, índices existentes
-- nem deleted_at.
--
-- Pré-condição: linhas existentes com customer_id + motorcycle_id NOT NULL
-- satisfazem o modo CADASTRADO do CHECK (guest_* NULL).
-- =============================================================================

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS guest_name text;

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS guest_vehicle text;

COMMENT ON COLUMN public.appointments.guest_name IS
  'Agendamento rápido: nome livre da pessoa. NULL no modo cliente cadastrado.';

COMMENT ON COLUMN public.appointments.guest_vehicle IS
  'Agendamento rápido: descrição livre do veículo. NULL no modo cliente cadastrado.';

-- Relaxa FKs (preserva constraints e ON DELETE atuais).
ALTER TABLE public.appointments
  ALTER COLUMN customer_id DROP NOT NULL;

ALTER TABLE public.appointments
  ALTER COLUMN motorcycle_id DROP NOT NULL;

-- CHECK de identidade: cadastrado XOR rápido (nunca híbrido / nunca vazio).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'appointments_identity_mode_check'
      AND conrelid = 'public.appointments'::regclass
  ) THEN
    ALTER TABLE public.appointments
      ADD CONSTRAINT appointments_identity_mode_check
      CHECK (
        (
          customer_id IS NOT NULL
          AND motorcycle_id IS NOT NULL
          AND guest_name IS NULL
          AND guest_vehicle IS NULL
        )
        OR
        (
          customer_id IS NULL
          AND motorcycle_id IS NULL
          AND guest_name IS NOT NULL
          AND btrim(guest_name) <> ''
          AND guest_vehicle IS NOT NULL
          AND btrim(guest_vehicle) <> ''
        )
      );
  END IF;
END $$;

COMMENT ON CONSTRAINT appointments_identity_mode_check ON public.appointments IS
  'Modo cadastrado (FKs) XOR modo rápido (guest_name + guest_vehicle).';
