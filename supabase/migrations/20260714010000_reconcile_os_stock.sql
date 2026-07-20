-- =============================================================================
-- RC1: Reconciliação idempotente de estoque por OS (fonte da verdade no servidor)
-- =============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_movements_office_idempotency
  ON public.inventory_movements (office_id, ((metadata->>'chave_idempotencia')))
  WHERE metadata ? 'chave_idempotencia'
    AND nullif(metadata->>'chave_idempotencia', '') IS NOT NULL;

CREATE OR REPLACE FUNCTION public.reconcile_os_stock(
  p_office_id UUID,
  p_os_local_id TEXT,
  p_os_numero INTEGER DEFAULT NULL,
  p_demand JSONB DEFAULT '[]'::jsonb,
  p_user_id UUID DEFAULT NULL,
  p_user_name TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row RECORD;
  v_item RECORD;
  v_applied NUMERIC(12, 3);
  v_diff NUMERIC(12, 3);
  v_chave TEXT;
  v_local_mov_id TEXT;
  v_tipo TEXT;
  v_qtd NUMERIC(12, 3);
  v_resultado JSONB := '[]'::jsonb;
  v_movimento_existente UUID;
  v_qty_final NUMERIC(12, 3);
BEGIN
  IF p_office_id IS NULL OR p_os_local_id IS NULL OR length(trim(p_os_local_id)) = 0 THEN
    RAISE EXCEPTION 'office_id e os_local_id são obrigatórios';
  END IF;

  IF NOT (
    public.is_system_admin()
    OR p_office_id = public.current_office_id()
  ) THEN
    RAISE EXCEPTION 'Sem permissão para reconciliar estoque desta oficina';
  END IF;

  FOR v_row IN
    WITH pecas_mov AS (
      SELECT DISTINCT COALESCE(
        nullif(m.metadata->>'peca_id', ''),
        ii.local_id
      ) AS item_local_id
      FROM public.inventory_movements m
      JOIN public.inventory_items ii ON ii.id = m.inventory_item_id
      WHERE m.office_id = p_office_id
        AND (
          m.metadata->>'ordem_servico_id' = p_os_local_id
          OR (
            p_os_numero IS NOT NULL
            AND nullif(m.metadata->>'ordem_servico_numero', '') IS NOT NULL
            AND (m.metadata->>'ordem_servico_numero')::INT = p_os_numero
          )
        )
        AND m.movement_type IN ('saida', 'devolucao')
    ),
    pecas_demand AS (
      SELECT
        nullif(d->>'item_local_id', '') AS item_local_id,
        GREATEST(0, COALESCE((d->>'desired_qty')::NUMERIC, 0)) AS desired_qty,
        COALESCE((d->>'unit_cost')::NUMERIC, 0) AS unit_cost,
        COALESCE(nullif(d->>'nome', ''), 'Peça') AS nome
      FROM jsonb_array_elements(COALESCE(p_demand, '[]'::jsonb)) d
    )
    SELECT
      COALESCE(pd.item_local_id, pm.item_local_id) AS item_local_id,
      COALESCE(pd.desired_qty, 0) AS desired_qty,
      COALESCE(pd.unit_cost, 0) AS unit_cost,
      COALESCE(pd.nome, 'Peça') AS nome
    FROM pecas_demand pd
    FULL OUTER JOIN pecas_mov pm ON pm.item_local_id = pd.item_local_id
    WHERE COALESCE(pd.item_local_id, pm.item_local_id) IS NOT NULL
  LOOP
    SELECT * INTO v_item
    FROM public.inventory_items
    WHERE office_id = p_office_id
      AND local_id = v_row.item_local_id
      AND COALESCE(active, TRUE) = TRUE
      AND deleted_at IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    SELECT COALESCE(SUM(
      CASE
        WHEN m.movement_type = 'saida' THEN m.quantity
        WHEN m.movement_type = 'devolucao' THEN -m.quantity
        ELSE 0
      END
    ), 0)
    INTO v_applied
    FROM public.inventory_movements m
    WHERE m.office_id = p_office_id
      AND m.inventory_item_id = v_item.id
      AND m.movement_type IN ('saida', 'devolucao')
      AND (
        m.metadata->>'ordem_servico_id' = p_os_local_id
        OR (
          p_os_numero IS NOT NULL
          AND nullif(m.metadata->>'ordem_servico_numero', '') IS NOT NULL
          AND (m.metadata->>'ordem_servico_numero')::INT = p_os_numero
        )
      );

    v_diff := round((v_row.desired_qty - v_applied)::NUMERIC, 3);

    IF abs(v_diff) < 0.0001 THEN
      v_resultado := v_resultado || jsonb_build_array(jsonb_build_object(
        'item_local_id', v_row.item_local_id,
        'quantity', v_item.quantity,
        'applied', v_applied,
        'desired', v_row.desired_qty,
        'changed', false
      ));
      CONTINUE;
    END IF;

    IF v_diff > 0 THEN
      v_tipo := 'saida';
      v_qtd := v_diff;
    ELSE
      v_tipo := 'devolucao';
      v_qtd := abs(v_diff);
    END IF;

    v_chave := format(
      'os-delta:%s:%s:%s->%s',
      p_os_local_id,
      v_row.item_local_id,
      trim(to_char(round(v_applied, 3), 'FM999999990.999')),
      trim(to_char(round(v_row.desired_qty, 3), 'FM999999990.999'))
    );
    v_local_mov_id := 'rpc-' || md5(v_chave);

    SELECT m.id INTO v_movimento_existente
    FROM public.inventory_movements m
    WHERE m.office_id = p_office_id
      AND (
        m.local_id = v_local_mov_id
        OR m.metadata->>'chave_idempotencia' = v_chave
      )
    LIMIT 1;

    IF v_movimento_existente IS NULL THEN
      INSERT INTO public.inventory_movements (
        office_id,
        local_id,
        inventory_item_id,
        movement_type,
        quantity,
        unit_cost,
        total_value,
        movement_date,
        reason,
        notes,
        user_id,
        user_name,
        metadata
      ) VALUES (
        p_office_id,
        v_local_mov_id,
        v_item.id,
        v_tipo,
        v_qtd,
        COALESCE(v_row.unit_cost, 0),
        round(v_qtd * COALESCE(v_row.unit_cost, 0), 2),
        (timezone('America/Sao_Paulo', now()))::date,
        CASE
          WHEN v_tipo = 'saida' THEN format('Saída por OS #%s', COALESCE(p_os_numero::text, p_os_local_id))
          ELSE 'Devolução'
        END,
        CASE
          WHEN v_tipo = 'saida' AND v_applied = 0
            THEN format('Saída por OS #%s', COALESCE(p_os_numero::text, p_os_local_id))
          WHEN v_tipo = 'saida'
            THEN format('Saída por OS #%s (ajuste +%s)', COALESCE(p_os_numero::text, p_os_local_id), v_qtd)
          WHEN v_row.desired_qty = 0
            THEN format('Devolução por OS #%s', COALESCE(p_os_numero::text, p_os_local_id))
          ELSE format('Devolução por OS #%s (ajuste -%s)', COALESCE(p_os_numero::text, p_os_local_id), v_qtd)
        END,
        p_user_id,
        p_user_name,
        jsonb_build_object(
          'peca_id', v_row.item_local_id,
          'peca_nome', COALESCE(v_item.name, v_row.nome),
          'ordem_servico_id', p_os_local_id,
          'ordem_servico_numero', p_os_numero,
          'chave_idempotencia', v_chave,
          'origem', 'reconcile_os_stock'
        )
      );

      IF v_tipo = 'saida' THEN
        UPDATE public.inventory_items
        SET quantity = GREATEST(0, quantity - v_qtd),
            updated_at = now()
        WHERE id = v_item.id;
      ELSE
        UPDATE public.inventory_items
        SET quantity = quantity + v_qtd,
            updated_at = now()
        WHERE id = v_item.id;
      END IF;
    END IF;

    SELECT quantity INTO v_qty_final FROM public.inventory_items WHERE id = v_item.id;

    v_resultado := v_resultado || jsonb_build_array(jsonb_build_object(
      'item_local_id', v_row.item_local_id,
      'quantity', v_qty_final,
      'applied_before', v_applied,
      'desired', v_row.desired_qty,
      'diff', v_diff,
      'changed', true
    ));
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'os_local_id', p_os_local_id,
    'items', v_resultado
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_os_stock(UUID, TEXT, INTEGER, JSONB, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reconcile_os_stock(UUID, TEXT, INTEGER, JSONB, UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION public.reconcile_os_stock IS
  'RC1: reconcilia estoque de uma OS de forma idempotente. Demanda desejada → movimentos + quantity no servidor.';
