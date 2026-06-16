# BoxGestor — arquivar e restaurar oficinas (Admin Sistema)
# Execute APÓS docs/supabase-performance-admin-maintenance.sql
# NÃO executar automaticamente.

-- =============================================================================
-- Listar oficinas arquivadas (Admin Sistema)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.admin_list_archived_offices()
RETURNS TABLE (
  office_id UUID,
  office_name TEXT,
  phone TEXT,
  plan_tier TEXT,
  trial_started_at TIMESTAMPTZ,
  trial_ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
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
    o.archived_at,
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
  WHERE o.archived_at IS NOT NULL
  ORDER BY o.archived_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_archived_offices TO authenticated;

-- =============================================================================
-- Restaurar oficina arquivada (Admin Sistema)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.admin_restore_office(p_office_id UUID)
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
  SET archived_at = NULL, updated_at = NOW()
  WHERE id = p_office_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Oficina não encontrada.';
  END IF;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_restore_office TO authenticated;

COMMENT ON FUNCTION public.admin_list_archived_offices IS
  'Lista oficinas com archived_at preenchido — somente Admin Sistema.';

COMMENT ON FUNCTION public.admin_restore_office IS
  'Remove archived_at e reativa a oficina — somente Admin Sistema.';
