-- =============================================================================
-- Expandir enum public.status_orcamento (coluna service_orders.budget_status)
-- =============================================================================
-- Contexto:
--   Tabela: public.service_orders
--   Coluna: budget_status
--   Tipo:   public.status_orcamento (ENUM Postgres)
--   Valores existentes: aguardando_aprovacao, aprovado, reprovado
--
-- Objetivo: aceitar oficialmente o fluxo completo de orçamento no BoxGestor.
-- Não remove valores antigos nem altera linhas existentes.
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'status_orcamento'
      AND e.enumlabel = 'rascunho'
  ) THEN
    ALTER TYPE public.status_orcamento ADD VALUE 'rascunho';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'status_orcamento'
      AND e.enumlabel = 'enviado'
  ) THEN
    ALTER TYPE public.status_orcamento ADD VALUE 'enviado';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'status_orcamento'
      AND e.enumlabel = 'recusado'
  ) THEN
    ALTER TYPE public.status_orcamento ADD VALUE 'recusado';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'status_orcamento'
      AND e.enumlabel = 'convertido'
  ) THEN
    ALTER TYPE public.status_orcamento ADD VALUE 'convertido';
  END IF;
END $$;

COMMENT ON TYPE public.status_orcamento IS
  'Status do orçamento (service_orders.budget_status): rascunho, enviado, aguardando_aprovacao, aprovado, recusado, convertido. Valor legado reprovado mantido para registros antigos.';
