-- =============================================================================
-- Admin Suporte A1 — RPC read-only: pagamentos detalhados por oficina
-- =============================================================================
-- Somente CREATE OR REPLACE FUNCTION (SELECT).
-- NÃO altera tabelas, dados, RLS, nem grants anon.
-- Gate obrigatório: public.is_system_admin().
-- NÃO retorna craft_meta bruto, tokens, custos, comissão ou fiscal sensível.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.admin_support_list_office_payments(
  p_office_id UUID,
  p_limit INTEGER DEFAULT 100,
  p_offset INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limite INTEGER := GREATEST(1, LEAST(COALESCE(p_limit, 100), 500));
  v_offset INTEGER := GREATEST(0, COALESCE(p_offset, 0));
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
    SELECT jsonb_agg(row_to_json(x)::jsonb ORDER BY x.sort_ts DESC NULLS LAST)
    FROM (
      SELECT
        p.id AS payment_id,
        p.payment_date,
        p.created_at AS payment_created_at,
        p.amount,
        p.payment_method::text AS payment_method,
        NULLIF(trim(p.notes), '') AS notes,
        p.service_order_id,
        so.number AS service_order_number,
        so.status::text AS service_order_status,
        cu.name AS customer_name,
        NULLIF(trim(both from concat_ws(' ', m.brand, m.model)), '') AS vehicle_name,
        m.plate AS vehicle_plate,
        p.created_by AS received_by_user_id,
        coalesce(
          nullif(trim(p.craft_meta->>'usuario_nome'), ''),
          pr.full_name,
          cm.created_by_name
        ) AS received_by_name,
        nullif(trim(p.craft_meta->>'autorizado_por_nome'), '') AS authorized_by_name,
        cm.cash_session_id,
        cs.status::text AS cash_session_status,
        cm.id AS cash_movement_id,
        cm.type::text AS cash_movement_type,
        p.financial_transaction_id,
        CASE
          WHEN ft.id IS NULL THEN NULL
          WHEN ft.paid IS TRUE THEN 'pago'
          ELSE 'pendente'
        END AS financial_transaction_status,
        (
          coalesce((p.craft_meta->>'cancelado')::boolean, false)
          OR lower(coalesce(p.craft_meta->>'status', '')) IN ('cancelado', 'canceled', 'cancelled')
          OR nullif(trim(p.craft_meta->>'deleted_at'), '') IS NOT NULL
        ) AS is_canceled,
        nullif(trim(coalesce(
          p.craft_meta->>'canceled_at',
          p.craft_meta->>'cancelado_em',
          p.craft_meta->>'deleted_at'
        )), '') AS canceled_at,
        nullif(trim(coalesce(
          p.craft_meta->>'canceled_by_name',
          p.craft_meta->>'cancelado_por_nome'
        )), '') AS canceled_by,
        (
          lower(coalesce(cm.type::text, '')) LIKE '%refund%'
          OR lower(coalesce(cm.type::text, '')) LIKE '%estorno%'
          OR lower(coalesce(p.craft_meta->>'status', '')) IN ('estornado', 'refund', 'refunded')
          OR coalesce((p.craft_meta->>'estorno')::boolean, false)
          OR coalesce((p.craft_meta->>'is_refund')::boolean, false)
        ) AS is_refund_or_reversal,
        CASE
          WHEN (
            lower(coalesce(cm.type::text, '')) LIKE '%refund%'
            OR lower(coalesce(cm.type::text, '')) LIKE '%estorno%'
            OR lower(coalesce(p.craft_meta->>'status', '')) IN ('estornado', 'refund', 'refunded')
            OR coalesce((p.craft_meta->>'estorno')::boolean, false)
            OR coalesce((p.craft_meta->>'is_refund')::boolean, false)
          ) THEN 'Estorno'
          WHEN p.service_order_id IS NOT NULL AND so.id IS NOT NULL THEN
            'OS #' || coalesce(so.number::text, '?')
          WHEN p.service_order_id IS NOT NULL THEN 'OS (vínculo sem OS encontrada)'
          ELSE 'Origem não identificada'
        END AS origem_texto,
        CASE
          WHEN (
            coalesce((p.craft_meta->>'cancelado')::boolean, false)
            OR lower(coalesce(p.craft_meta->>'status', '')) IN ('cancelado', 'canceled', 'cancelled')
            OR nullif(trim(p.craft_meta->>'deleted_at'), '') IS NOT NULL
          ) THEN 'cancelado'
          WHEN (
            lower(coalesce(cm.type::text, '')) LIKE '%refund%'
            OR lower(coalesce(cm.type::text, '')) LIKE '%estorno%'
            OR lower(coalesce(p.craft_meta->>'status', '')) IN ('estornado', 'refund', 'refunded')
            OR coalesce((p.craft_meta->>'estorno')::boolean, false)
            OR coalesce((p.craft_meta->>'is_refund')::boolean, false)
          ) THEN 'estornado'
          ELSE 'pago'
        END AS status,
        coalesce(p.created_at, p.payment_date::timestamptz) AS sort_ts
      FROM public.service_order_payments p
      LEFT JOIN public.service_orders so
        ON so.id = p.service_order_id AND so.office_id = p.office_id
      LEFT JOIN public.customers cu
        ON cu.id = coalesce(p.customer_id, so.customer_id) AND cu.office_id = p.office_id
      LEFT JOIN public.motorcycles m
        ON m.id = coalesce(p.motorcycle_id, so.motorcycle_id) AND m.office_id = p.office_id
      LEFT JOIN public.profiles pr
        ON pr.id = p.created_by
      LEFT JOIN LATERAL (
        SELECT cm0.id, cm0.type, cm0.cash_session_id, cm0.created_by_name
        FROM public.cash_movements cm0
        WHERE cm0.office_id = p.office_id
          AND cm0.service_order_payment_id = p.id
        ORDER BY cm0.created_at DESC NULLS LAST
        LIMIT 1
      ) cm ON TRUE
      LEFT JOIN public.cash_sessions cs
        ON cs.id = cm.cash_session_id AND cs.office_id = p.office_id
      LEFT JOIN public.financial_transactions ft
        ON ft.id = p.financial_transaction_id AND ft.office_id = p.office_id
      WHERE p.office_id = p_office_id
      ORDER BY coalesce(p.created_at, p.payment_date::timestamptz) DESC NULLS LAST
      LIMIT v_limite OFFSET v_offset
    ) x
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_support_list_office_payments(UUID, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_support_list_office_payments(UUID, INTEGER, INTEGER) TO authenticated;

COMMENT ON FUNCTION public.admin_support_list_office_payments IS
  'Admin Sistema (suporte): lista pagamentos detalhados de uma oficina (somente leitura). Não retorna craft_meta bruto nem tokens.';

NOTIFY pgrst, 'reload schema';
