-- BoxGestor — performance, admin e manutenção (Supabase)
-- Execute APÓS docs/supabase-admin-system.sql
-- NÃO executar automaticamente.

-- =============================================================================
-- Arquivar oficina (Admin Sistema) — esconde da lista sem apagar dados
-- =============================================================================

ALTER TABLE public.offices
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

COMMENT ON COLUMN public.offices.archived_at IS
  'Quando preenchido, oficina arquivada (inativa) — visível só no suporte.';

CREATE OR REPLACE FUNCTION public.admin_archive_office(p_office_id UUID)
RETURNS public.offices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.offices;
BEGIN
  IF NOT public.is_system_admin() THEN
    RAISE EXCEPTION 'Acesso negado.';
  END IF;

  UPDATE public.offices
  SET archived_at = NOW(), updated_at = NOW()
  WHERE id = p_office_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Oficina não encontrada.';
  END IF;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_archive_office TO authenticated;

-- Atualizar listagem admin para ocultar arquivadas
CREATE OR REPLACE FUNCTION public.admin_list_offices()
RETURNS TABLE (
  office_id UUID,
  office_name TEXT,
  phone TEXT,
  plan_tier TEXT,
  trial_started_at TIMESTAMPTZ,
  trial_ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  owner_name TEXT,
  owner_email TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_system_admin() THEN
    RAISE EXCEPTION 'Acesso negado. Apenas Administrador do Sistema.';
  END IF;

  RETURN QUERY
  SELECT
    o.id,
    o.name,
    o.phone,
    o.plan_tier,
    o.trial_started_at,
    o.trial_ends_at,
    o.created_at,
    p.full_name,
    coalesce(p.email, '')
  FROM public.offices o
  LEFT JOIN LATERAL (
    SELECT pr.full_name, pr.email
    FROM public.profiles pr
    WHERE pr.office_id = o.id AND pr.role = 'owner'
    ORDER BY pr.created_at ASC
    LIMIT 1
  ) p ON TRUE
  WHERE o.archived_at IS NULL
  ORDER BY o.created_at DESC;
END;
$$;

-- =============================================================================
-- Índices para consultas por oficina (listagens e admin)
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_customers_office_created
  ON public.customers(office_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_motorcycles_office_created
  ON public.motorcycles(office_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_service_orders_office_number
  ON public.service_orders(office_id, number DESC);

CREATE INDEX IF NOT EXISTS idx_service_order_payments_office_date
  ON public.service_order_payments(office_id, payment_date DESC);

CREATE INDEX IF NOT EXISTS idx_financial_transactions_office_date
  ON public.financial_transactions(office_id, transaction_date DESC);

CREATE INDEX IF NOT EXISTS idx_profiles_office_id
  ON public.profiles(office_id);

CREATE INDEX IF NOT EXISTS idx_offices_archived_at
  ON public.offices(archived_at)
  WHERE archived_at IS NULL;
