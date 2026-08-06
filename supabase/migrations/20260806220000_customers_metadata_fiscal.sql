-- =============================================================================
-- RC2 Fiscal F3B — metadata JSONB em customers (dados fiscais do cliente)
-- =============================================================================
-- Objetivo: persistir customers.metadata.fiscal sem colunas fiscais avulsas.
-- Não altera emissão, SEFAZ, certificado nem provedor.
-- Idempotente.

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.customers.metadata IS
  'Metadados flexíveis do cliente (ex.: fiscal F3B). Sem emissão nesta fase.';
