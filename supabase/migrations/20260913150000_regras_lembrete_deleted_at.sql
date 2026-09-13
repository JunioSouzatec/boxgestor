-- Tombstone de Regras de Retorno.
-- Aditiva: não apaga nem altera linhas existentes.

ALTER TABLE public.regras_lembrete
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_regras_lembrete_office_deleted_at
  ON public.regras_lembrete (office_id, deleted_at);

COMMENT ON COLUMN public.regras_lembrete.deleted_at IS
  'Tombstone de exclusão lógica. NULL = regra ativa para listagem/seed.';
