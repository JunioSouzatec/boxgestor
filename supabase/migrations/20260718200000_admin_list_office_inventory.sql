-- ============================================================
-- RC1 Admin: listar estoque completo de uma oficina (Ver todos)
-- ============================================================
-- TIPO: ADITIVA (não destrutiva)
-- NÃO apaga nem altera linhas de inventory_items.
-- Apenas CREATE OR REPLACE de RPC + GRANT.
--
-- Motivo: o botão "Ver todos" usava SELECT direto em inventory_items,
-- bloqueado pelo RLS (current_office_id do admin ≠ oficina alvo).
-- A lista inicial vinha de admin_get_office_details (SECURITY DEFINER).
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_list_office_inventory(
  p_office_id UUID,
  p_limit INTEGER DEFAULT 500
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limite INTEGER := GREATEST(1, LEAST(COALESCE(p_limit, 500), 2000));
BEGIN
  IF NOT public.is_system_admin() THEN
    RAISE EXCEPTION 'Acesso negado. Apenas Administrador do Sistema.';
  END IF;

  IF p_office_id IS NULL THEN
    RAISE EXCEPTION 'office_id inválido (null).';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.offices o WHERE o.id = p_office_id) THEN
    RAISE EXCEPTION 'Oficina não encontrada.';
  END IF;

  RETURN coalesce((
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', i.id,
        'nome', i.name,
        'quantidade', i.quantity,
        'estoque_minimo', i.minimum_stock,
        'valor', i.sale_price
      )
      ORDER BY i.name
    )
    FROM (
      -- Mesmos filtros da amostra em admin_get_office_details (só aumenta o limite)
      SELECT i.id, i.name, i.quantity, i.minimum_stock, i.sale_price
      FROM public.inventory_items i
      WHERE i.office_id = p_office_id
      ORDER BY i.name
      LIMIT v_limite
    ) i
  ), '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_office_inventory(UUID, INTEGER) TO authenticated;

NOTIFY pgrst, 'reload schema';
