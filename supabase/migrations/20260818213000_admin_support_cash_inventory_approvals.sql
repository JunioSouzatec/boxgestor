-- =============================================================================
-- Admin Suporte A2 — RPCs read-only: Caixa, Estoque, Portal/Aprovações
-- =============================================================================
-- Somente CREATE OR REPLACE FUNCTION (SELECT).
-- NÃO altera tabelas, dados, RLS, nem grants anon.
-- Gate obrigatório: public.is_system_admin().
-- NÃO retorna token, token_hash, link com token, craft_meta/metadata bruto.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Caixa
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_support_get_office_cash_overview(
  p_office_id UUID,
  p_limit INTEGER DEFAULT 50
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limite INTEGER := GREATEST(1, LEAST(COALESCE(p_limit, 50), 200));
  v_open public.cash_sessions%ROWTYPE;
  v_last_closed public.cash_sessions%ROWTYPE;
  v_open_in NUMERIC := 0;
  v_open_out NUMERIC := 0;
  v_sessao_aberta JSONB := NULL;
  v_ultimo_fechado JSONB := NULL;
  v_movimentos JSONB;
  v_pag_sem_caixa INTEGER := 0;
  v_mov_sem_sessao INTEGER := 0;
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

  SELECT * INTO v_open
  FROM public.cash_sessions cs
  WHERE cs.office_id = p_office_id
    AND cs.deleted_at IS NULL
    AND cs.status = 'open'
  ORDER BY cs.opened_at DESC NULLS LAST
  LIMIT 1;

  IF FOUND THEN
    SELECT
      coalesce(sum(CASE WHEN cm.type IN ('sale', 'manual_in', 'suprimento') THEN cm.amount ELSE 0 END), 0),
      coalesce(sum(CASE WHEN cm.type IN ('refund', 'manual_out', 'sangria') THEN cm.amount ELSE 0 END), 0)
    INTO v_open_in, v_open_out
    FROM public.cash_movements cm
    WHERE cm.office_id = p_office_id
      AND cm.cash_session_id = v_open.id
      AND cm.deleted_at IS NULL;

    v_sessao_aberta := jsonb_build_object(
      'session_id', v_open.id,
      'status', v_open.status,
      'opened_at', v_open.opened_at,
      'opened_by_name', nullif(trim(v_open.opened_by_name), ''),
      'opening_balance', v_open.opening_balance,
      'entradas', v_open_in,
      'saidas', v_open_out,
      'expected_balance', v_open.expected_balance,
      'difference', v_open.difference,
      'aberto_ha_horas',
        CASE
          WHEN v_open.opened_at IS NULL THEN NULL
          ELSE round(extract(epoch FROM (now() - v_open.opened_at)) / 3600.0, 1)
        END
    );
  END IF;

  SELECT * INTO v_last_closed
  FROM public.cash_sessions cs
  WHERE cs.office_id = p_office_id
    AND cs.deleted_at IS NULL
    AND cs.status = 'closed'
  ORDER BY cs.closed_at DESC NULLS LAST, cs.opened_at DESC NULLS LAST
  LIMIT 1;

  IF FOUND THEN
    v_ultimo_fechado := jsonb_build_object(
      'session_id', v_last_closed.id,
      'status', v_last_closed.status,
      'opened_at', v_last_closed.opened_at,
      'closed_at', v_last_closed.closed_at,
      'opened_by_name', nullif(trim(v_last_closed.opened_by_name), ''),
      'closed_by_name', nullif(trim(v_last_closed.closed_by_name), ''),
      'opening_balance', v_last_closed.opening_balance,
      'expected_balance', v_last_closed.expected_balance,
      'closing_balance_informed', v_last_closed.closing_balance_informed,
      'difference', v_last_closed.difference
    );
  END IF;

  SELECT coalesce(jsonb_agg(row_to_json(x)::jsonb ORDER BY x.created_at DESC NULLS LAST), '[]'::jsonb)
  INTO v_movimentos
  FROM (
    SELECT
      cm.id AS movement_id,
      cm.created_at,
      cm.type AS movement_type,
      cm.amount,
      cm.payment_method,
      nullif(trim(coalesce(cm.reason, cm.notes)), '') AS descricao,
      cm.cash_session_id,
      cm.service_order_payment_id,
      cm.financial_transaction_id,
      cm.created_by_name,
      so.number AS service_order_number,
      cu.name AS customer_name,
      NULLIF(trim(both from concat_ws(' ', m.brand, m.model)), '') AS vehicle_name,
      m.plate AS vehicle_plate,
      CASE
        WHEN lower(coalesce(cm.type, '')) IN ('refund')
          OR lower(coalesce(cm.craft_meta->>'status', '')) LIKE '%estorno%'
          THEN 'Estorno'
        WHEN cm.service_order_payment_id IS NOT NULL THEN 'Pagamento de OS'
        WHEN lower(coalesce(cm.craft_meta->>'origin_type', '')) = 'counter_sale'
          OR nullif(trim(cm.craft_meta->>'counter_sale_id'), '') IS NOT NULL
          OR coalesce(cm.local_lancamento_id, '') LIKE 'counter-sale%'
          THEN 'Venda balcão'
        WHEN lower(coalesce(cm.type, '')) IN ('manual_in', 'manual_out', 'sangria', 'suprimento')
          THEN 'Movimento manual'
        WHEN lower(coalesce(cm.type, '')) IN ('sale') THEN 'Venda / entrada'
        ELSE 'Origem não identificada'
      END AS origem_texto,
      CASE
        WHEN lower(coalesce(cm.type, '')) IN ('sale', 'manual_in', 'suprimento') THEN 'entrada'
        WHEN lower(coalesce(cm.type, '')) IN ('refund', 'manual_out', 'sangria') THEN 'saida'
        ELSE coalesce(cm.type, 'outro')
      END AS tipo_fluxo
    FROM public.cash_movements cm
    LEFT JOIN public.service_order_payments p
      ON p.id = cm.service_order_payment_id AND p.office_id = cm.office_id
    LEFT JOIN public.service_orders so
      ON so.id = p.service_order_id AND so.office_id = cm.office_id
    LEFT JOIN public.customers cu
      ON cu.id = coalesce(p.customer_id, so.customer_id) AND cu.office_id = cm.office_id
    LEFT JOIN public.motorcycles m
      ON m.id = coalesce(p.motorcycle_id, so.motorcycle_id) AND m.office_id = cm.office_id
    WHERE cm.office_id = p_office_id
      AND cm.deleted_at IS NULL
    ORDER BY cm.created_at DESC NULLS LAST
    LIMIT v_limite
  ) x;

  SELECT count(*)::int INTO v_pag_sem_caixa
  FROM public.service_order_payments p
  WHERE p.office_id = p_office_id
    AND NOT EXISTS (
      SELECT 1 FROM public.cash_movements cm
      WHERE cm.office_id = p.office_id
        AND cm.service_order_payment_id = p.id
        AND cm.deleted_at IS NULL
    )
    AND NOT (
      coalesce((p.craft_meta->>'cancelado')::boolean, false)
      OR lower(coalesce(p.craft_meta->>'status', '')) IN ('cancelado', 'canceled', 'cancelled')
      OR nullif(trim(p.craft_meta->>'deleted_at'), '') IS NOT NULL
    );

  SELECT count(*)::int INTO v_mov_sem_sessao
  FROM public.cash_movements cm
  WHERE cm.office_id = p_office_id
    AND cm.deleted_at IS NULL
    AND cm.cash_session_id IS NULL;

  RETURN jsonb_build_object(
    'tem_caixa_aberto', v_sessao_aberta IS NOT NULL,
    'sessao_aberta', v_sessao_aberta,
    'ultimo_fechado', v_ultimo_fechado,
    'movimentos', coalesce(v_movimentos, '[]'::jsonb),
    'alertas', jsonb_build_object(
      'pagamentos_sem_movimento_caixa', v_pag_sem_caixa,
      'movimentos_sem_sessao', v_mov_sem_sessao,
      'caixa_aberto_ha_mais_de_24h',
        CASE
          WHEN v_sessao_aberta IS NULL THEN false
          WHEN (v_sessao_aberta->>'aberto_ha_horas')::numeric > 24 THEN true
          ELSE false
        END,
      'ultimo_fechado_com_divergencia',
        CASE
          WHEN v_ultimo_fechado IS NULL THEN false
          WHEN v_ultimo_fechado->>'difference' IS NULL THEN false
          WHEN (v_ultimo_fechado->>'difference')::numeric <> 0 THEN true
          ELSE false
        END
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_support_get_office_cash_overview(UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_support_get_office_cash_overview(UUID, INTEGER) TO authenticated;

COMMENT ON FUNCTION public.admin_support_get_office_cash_overview IS
  'Admin Sistema (suporte): visão read-only de caixa por oficina. Sem craft_meta bruto.';

-- ---------------------------------------------------------------------------
-- 2) Estoque
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_support_get_office_inventory_overview(
  p_office_id UUID,
  p_limit INTEGER DEFAULT 50
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limite INTEGER := GREATEST(1, LEAST(COALESCE(p_limit, 50), 200));
  v_resumo JSONB;
  v_criticos JSONB;
  v_movimentos JSONB;
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

  SELECT jsonb_build_object(
    'total_itens', count(*)::int,
    'total_ativos', count(*) FILTER (WHERE coalesce(i.active, true) AND i.deleted_at IS NULL)::int,
    'estoque_baixo', count(*) FILTER (
      WHERE i.deleted_at IS NULL
        AND coalesce(i.active, true)
        AND i.quantity > 0
        AND i.quantity <= coalesce(i.minimum_stock, 0)
    )::int,
    'zerados', count(*) FILTER (
      WHERE i.deleted_at IS NULL
        AND coalesce(i.active, true)
        AND coalesce(i.quantity, 0) <= 0
    )::int,
    'inativos_ou_deletados', count(*) FILTER (
      WHERE i.deleted_at IS NOT NULL OR coalesce(i.active, true) = false
    )::int,
    'valor_estimado_venda', coalesce(sum(
      CASE
        WHEN i.deleted_at IS NULL AND coalesce(i.active, true)
          THEN coalesce(i.quantity, 0) * coalesce(i.sale_price, 0)
        ELSE 0
      END
    ), 0)
  )
  INTO v_resumo
  FROM public.inventory_items i
  WHERE i.office_id = p_office_id;

  SELECT coalesce(jsonb_agg(row_to_json(x)::jsonb ORDER BY x.prioridade, x.name), '[]'::jsonb)
  INTO v_criticos
  FROM (
    SELECT
      i.id AS item_id,
      i.name,
      nullif(trim(i.code), '') AS code,
      i.quantity,
      coalesce(i.minimum_stock, 0) AS minimum_stock,
      i.sale_price,
      i.cost,
      coalesce(i.active, true) AS active,
      i.deleted_at IS NOT NULL AS deleted,
      CASE
        WHEN i.deleted_at IS NOT NULL OR coalesce(i.active, true) = false THEN 'inativo'
        WHEN coalesce(i.quantity, 0) <= 0 THEN 'zerado'
        WHEN i.quantity <= coalesce(i.minimum_stock, 0) THEN 'baixo'
        ELSE 'normal'
      END AS status,
      CASE
        WHEN i.deleted_at IS NOT NULL OR coalesce(i.active, true) = false THEN 3
        WHEN coalesce(i.quantity, 0) <= 0 THEN 1
        WHEN i.quantity <= coalesce(i.minimum_stock, 0) THEN 2
        ELSE 9
      END AS prioridade
    FROM public.inventory_items i
    WHERE i.office_id = p_office_id
      AND (
        i.deleted_at IS NOT NULL
        OR coalesce(i.active, true) = false
        OR coalesce(i.quantity, 0) <= 0
        OR i.quantity <= coalesce(i.minimum_stock, 0)
      )
    ORDER BY prioridade, i.name
    LIMIT v_limite
  ) x;

  SELECT coalesce(jsonb_agg(row_to_json(x)::jsonb ORDER BY x.sort_ts DESC NULLS LAST), '[]'::jsonb)
  INTO v_movimentos
  FROM (
    SELECT
      mv.id AS movement_id,
      coalesce(mv.created_at, mv.movement_date::timestamptz) AS created_at,
      mv.movement_date,
      mv.movement_type,
      mv.quantity,
      nullif(trim(mv.reason), '') AS reason,
      nullif(trim(mv.notes), '') AS notes,
      mv.service_order_id,
      mv.service_order_number,
      mv.user_name,
      i.name AS item_name,
      nullif(trim(i.code), '') AS item_code,
      CASE
        WHEN mv.service_order_id IS NOT NULL
          OR mv.service_order_number IS NOT NULL
          THEN 'Uso em OS'
        WHEN coalesce(mv.notes, '') ILIKE '%counter-sale%'
          OR coalesce(mv.notes, '') ILIKE '%venda balcão%'
          OR coalesce(mv.local_id, '') LIKE 'counter-sale%'
          THEN 'Venda balcão'
        WHEN lower(coalesce(mv.movement_type, '')) IN ('devolucao', 'estorno', 'entrada_devolucao')
          THEN 'Estorno/devolução'
        WHEN lower(coalesce(mv.movement_type, '')) IN ('ajuste') THEN 'Ajuste'
        WHEN lower(coalesce(mv.movement_type, '')) IN ('entrada', 'in') THEN 'Entrada'
        WHEN lower(coalesce(mv.movement_type, '')) IN ('saida', 'out') THEN 'Saída'
        ELSE coalesce(mv.movement_type, 'Origem não identificada')
      END AS origem_texto,
      coalesce(mv.created_at, mv.movement_date::timestamptz) AS sort_ts
    FROM public.inventory_movements mv
    LEFT JOIN public.inventory_items i
      ON i.id = mv.inventory_item_id AND i.office_id = mv.office_id
    WHERE mv.office_id = p_office_id
    ORDER BY coalesce(mv.created_at, mv.movement_date::timestamptz) DESC NULLS LAST
    LIMIT v_limite
  ) x;

  RETURN jsonb_build_object(
    'resumo', coalesce(v_resumo, '{}'::jsonb),
    'itens_criticos', coalesce(v_criticos, '[]'::jsonb),
    'movimentos', coalesce(v_movimentos, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_support_get_office_inventory_overview(UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_support_get_office_inventory_overview(UUID, INTEGER) TO authenticated;

COMMENT ON FUNCTION public.admin_support_get_office_inventory_overview IS
  'Admin Sistema (suporte): visão read-only de estoque por oficina.';

-- ---------------------------------------------------------------------------
-- 3) Portal / Aprovações (sem token / token_hash / link)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_support_list_office_approval_links(
  p_office_id UUID,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limite INTEGER := GREATEST(1, LEAST(COALESCE(p_limit, 50), 200));
  v_offset INTEGER := GREATEST(0, COALESCE(p_offset, 0));
  v_resumo JSONB;
  v_links JSONB;
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

  SELECT jsonb_build_object(
    'total', count(*)::int,
    'pendentes', count(*) FILTER (
      WHERE al.status = 'pending' AND al.expires_at > now() AND al.revoked_at IS NULL
    )::int,
    'aprovados', count(*) FILTER (
      WHERE al.status = 'approved'
        AND lower(coalesce(al.metadata->>'approval_type', 'total')) <> 'partial'
    )::int,
    'aprovados_parcialmente', count(*) FILTER (
      WHERE al.status = 'approved'
        AND lower(coalesce(al.metadata->>'approval_type', '')) = 'partial'
    )::int,
    'recusados', count(*) FILTER (WHERE al.status = 'rejected')::int,
    'expirados', count(*) FILTER (
      WHERE al.status = 'expired'
         OR (al.status = 'pending' AND al.expires_at <= now())
    )::int,
    'revogados', count(*) FILTER (WHERE al.status = 'revoked' OR al.revoked_at IS NOT NULL)::int,
    'convertidos', count(*) FILTER (
      WHERE nullif(trim(al.metadata->>'converted_os_id'), '') IS NOT NULL
         OR nullif(trim(al.metadata->>'converted_os_number'), '') IS NOT NULL
         OR (al.metadata ? 'converted_os_number' AND (al.metadata->>'converted_os_number') ~ '^[0-9]+$')
    )::int
  )
  INTO v_resumo
  FROM public.approval_links al
  WHERE al.office_id = p_office_id;

  SELECT coalesce(jsonb_agg(row_to_json(x)::jsonb ORDER BY x.created_at DESC NULLS LAST), '[]'::jsonb)
  INTO v_links
  FROM (
    SELECT
      al.id AS approval_link_id,
      al.created_at,
      al.expires_at,
      coalesce(al.approved_at, al.rejected_at, al.revoked_at) AS respondido_em,
      al.sent_at,
      CASE
        WHEN al.status = 'revoked' OR al.revoked_at IS NOT NULL THEN 'revogado'
        WHEN al.status = 'expired' OR (al.status = 'pending' AND al.expires_at <= now()) THEN 'expirado'
        WHEN al.status = 'rejected' THEN 'recusado'
        WHEN al.status = 'approved'
          AND lower(coalesce(al.metadata->>'approval_type', '')) = 'partial'
          THEN 'aprovado_parcialmente'
        WHEN al.status = 'approved' THEN 'aprovado'
        WHEN al.status = 'pending' THEN 'pendente'
        ELSE al.status
      END AS status,
      CASE
        WHEN al.status = 'rejected' THEN 'recusado'
        WHEN al.status = 'approved'
          AND lower(coalesce(al.metadata->>'approval_type', '')) = 'partial'
          THEN 'aprovado parcialmente'
        WHEN al.status = 'approved' THEN 'aprovado'
        ELSE null
      END AS tipo_resposta,
      so.number AS orcamento_numero,
      so.status::text AS orcamento_status,
      so.total_value AS total,
      cu.name AS customer_name,
      NULLIF(trim(both from concat_ws(' ', m.brand, m.model)), '') AS vehicle_name,
      m.plate AS vehicle_plate,
      CASE
        WHEN (al.metadata->>'converted_os_number') ~ '^[0-9]+$'
          THEN (al.metadata->>'converted_os_number')::int
        WHEN (al.metadata->>'os_number') ~ '^[0-9]+$'
          AND nullif(trim(al.metadata->>'converted_os_id'), '') IS NOT NULL
          THEN (al.metadata->>'os_number')::int
        ELSE NULL
      END AS converted_os_number,
      nullif(trim(al.metadata->>'converted_os_id'), '') IS NOT NULL
        OR (
          (al.metadata->>'converted_os_number') ~ '^[0-9]+$'
        ) AS convertido,
      nullif(trim(al.response_name), '') AS response_name,
      left(nullif(trim(al.response_note), ''), 200) AS response_note_preview
    FROM public.approval_links al
    LEFT JOIN public.service_orders so
      ON so.id = al.service_order_id AND so.office_id = al.office_id
    LEFT JOIN public.customers cu
      ON cu.id = so.customer_id AND cu.office_id = al.office_id
    LEFT JOIN public.motorcycles m
      ON m.id = so.motorcycle_id AND m.office_id = al.office_id
    WHERE al.office_id = p_office_id
    ORDER BY al.created_at DESC NULLS LAST
    LIMIT v_limite OFFSET v_offset
  ) x;

  RETURN jsonb_build_object(
    'resumo', coalesce(v_resumo, '{}'::jsonb),
    'links', coalesce(v_links, '[]'::jsonb),
    'alertas', jsonb_build_object(
      'pendentes_expirados', (
        SELECT count(*)::int
        FROM public.approval_links al
        WHERE al.office_id = p_office_id
          AND al.status = 'pending'
          AND al.expires_at <= now()
          AND al.revoked_at IS NULL
      ),
      'aprovados_sem_conversao', (
        SELECT count(*)::int
        FROM public.approval_links al
        WHERE al.office_id = p_office_id
          AND al.status = 'approved'
          AND nullif(trim(al.metadata->>'converted_os_id'), '') IS NULL
          AND NOT ((al.metadata->>'converted_os_number') ~ '^[0-9]+$')
      ),
      'aprovados_parciais', (
        SELECT count(*)::int
        FROM public.approval_links al
        WHERE al.office_id = p_office_id
          AND al.status = 'approved'
          AND lower(coalesce(al.metadata->>'approval_type', '')) = 'partial'
      )
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_support_list_office_approval_links(UUID, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_support_list_office_approval_links(UUID, INTEGER, INTEGER) TO authenticated;

COMMENT ON FUNCTION public.admin_support_list_office_approval_links IS
  'Admin Sistema (suporte): lista approval_links sanitizada (sem token/token_hash/URL).';

NOTIFY pgrst, 'reload schema';
