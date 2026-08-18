-- =============================================================================
-- Admin Suporte A3 — RPC read-only: Saúde / Sync da oficina
-- =============================================================================
-- Somente CREATE OR REPLACE FUNCTION (SELECT).
-- NÃO altera tabelas, dados, RLS, nem grants anon.
-- Gate: public.is_system_admin().
-- NÃO retorna token, token_hash, link, craft_meta bruto.
-- Observação: não enxerga localStorage/IndexedDB/fila offline local.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.admin_support_get_office_health_overview(
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
  v_limite INTEGER := GREATEST(1, LEAST(COALESCE(p_limit, 50), 100));
  v_modulos JSONB := '[]'::jsonb;
  v_eventos JSONB := '[]'::jsonb;
  v_alertas JSONB := '[]'::jsonb;
  v_ultima JSONB := NULL;
  v_dias_sem INTEGER := NULL;
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

  WITH mods AS (
    SELECT * FROM (VALUES
      (
        'clientes'::text,
        'Clientes'::text,
        (SELECT count(*)::int FROM public.customers c WHERE c.office_id = p_office_id),
        (SELECT max(greatest(c.created_at, coalesce(c.updated_at, c.created_at)))
           FROM public.customers c WHERE c.office_id = p_office_id)
      ),
      (
        'veiculos',
        'Veículos',
        (SELECT count(*)::int FROM public.motorcycles m WHERE m.office_id = p_office_id),
        (SELECT max(greatest(m.created_at, coalesce(m.updated_at, m.created_at)))
           FROM public.motorcycles m WHERE m.office_id = p_office_id)
      ),
      (
        'os',
        'OS',
        (SELECT count(*)::int FROM public.service_orders so WHERE so.office_id = p_office_id),
        (SELECT max(greatest(so.created_at, coalesce(so.updated_at, so.created_at)))
           FROM public.service_orders so WHERE so.office_id = p_office_id)
      ),
      (
        'pagamentos',
        'Pagamentos',
        (SELECT count(*)::int FROM public.service_order_payments p WHERE p.office_id = p_office_id),
        (SELECT max(greatest(p.created_at, coalesce(p.updated_at, p.created_at)))
           FROM public.service_order_payments p WHERE p.office_id = p_office_id)
      ),
      (
        'caixa',
        'Caixa',
        (SELECT count(*)::int FROM public.cash_movements cm
          WHERE cm.office_id = p_office_id AND cm.deleted_at IS NULL),
        (SELECT max(cm.created_at) FROM public.cash_movements cm
          WHERE cm.office_id = p_office_id AND cm.deleted_at IS NULL)
      ),
      (
        'estoque',
        'Estoque',
        (SELECT count(*)::int FROM public.inventory_movements mv WHERE mv.office_id = p_office_id),
        (SELECT max(coalesce(mv.created_at, mv.movement_date::timestamptz))
           FROM public.inventory_movements mv WHERE mv.office_id = p_office_id)
      ),
      (
        'portal',
        'Portal/Aprovações',
        (SELECT count(*)::int FROM public.approval_links al WHERE al.office_id = p_office_id),
        (SELECT max(greatest(al.created_at, coalesce(al.updated_at, al.created_at)))
           FROM public.approval_links al WHERE al.office_id = p_office_id)
      ),
      (
        'fotos',
        'Fotos',
        (SELECT count(*)::int FROM public.service_order_photos ph
          WHERE ph.office_id = p_office_id AND ph.deleted_at IS NULL),
        (SELECT max(greatest(ph.created_at, coalesce(ph.updated_at, ph.created_at)))
           FROM public.service_order_photos ph
          WHERE ph.office_id = p_office_id AND ph.deleted_at IS NULL)
      ),
      (
        'comunicacao',
        'Comunicação',
        (SELECT count(*)::int FROM public.communication_history ch WHERE ch.office_id = p_office_id)
          + (SELECT count(*)::int FROM public.scheduled_messages sm WHERE sm.office_id = p_office_id),
        (SELECT max(ts) FROM (
           SELECT coalesce(ch.sent_at, ch.created_at) AS ts
           FROM public.communication_history ch WHERE ch.office_id = p_office_id
           UNION ALL
           SELECT coalesce(sm.sent_at, sm.updated_at, sm.created_at)
           FROM public.scheduled_messages sm WHERE sm.office_id = p_office_id
        ) t)
      )
    ) AS t(modulo, rotulo, quantidade, ultima_atividade)
  ),
  mods_status AS (
    SELECT
      modulo,
      rotulo,
      quantidade,
      ultima_atividade,
      CASE
        WHEN quantidade = 0 OR ultima_atividade IS NULL THEN 'Sem dados'
        WHEN ultima_atividade >= now() - interval '7 days' THEN 'Ativo recentemente'
        WHEN ultima_atividade >= now() - interval '30 days' THEN 'Sem movimento recente'
        ELSE 'Sem movimento recente'
      END AS status,
      CASE
        WHEN ultima_atividade IS NULL THEN NULL
        ELSE round(extract(epoch FROM (now() - ultima_atividade)) / 86400.0, 1)
      END AS dias_sem_atividade
    FROM mods
  )
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'modulo', modulo,
      'rotulo', rotulo,
      'quantidade', quantidade,
      'ultima_atividade', ultima_atividade,
      'status', status,
      'dias_sem_atividade', dias_sem_atividade
    )
    ORDER BY
      CASE status
        WHEN 'Ativo recentemente' THEN 1
        WHEN 'Sem movimento recente' THEN 2
        ELSE 3
      END,
      rotulo
  ), '[]'::jsonb)
  INTO v_modulos
  FROM mods_status;

  SELECT
    jsonb_build_object(
      'data_hora', x.ultima_atividade,
      'modulo', x.rotulo,
      'modulo_key', x.modulo,
      'dias_atras', round(extract(epoch FROM (now() - x.ultima_atividade)) / 86400.0, 1),
      'horas_atras', round(extract(epoch FROM (now() - x.ultima_atividade)) / 3600.0, 1)
    ),
    round(extract(epoch FROM (now() - x.ultima_atividade)) / 86400.0)::int
  INTO v_ultima, v_dias_sem
  FROM (
    SELECT
      (m->>'modulo') AS modulo,
      (m->>'rotulo') AS rotulo,
      (m->>'ultima_atividade')::timestamptz AS ultima_atividade
    FROM jsonb_array_elements(v_modulos) m
    WHERE nullif(m->>'ultima_atividade', '') IS NOT NULL
    ORDER BY (m->>'ultima_atividade')::timestamptz DESC NULLS LAST
    LIMIT 1
  ) x;

  -- Eventos recentes observáveis (sanitizados)
  SELECT coalesce(jsonb_agg(row_to_json(e)::jsonb ORDER BY e.data_hora DESC NULLS LAST), '[]'::jsonb)
  INTO v_eventos
  FROM (
    SELECT * FROM (
      SELECT
        so.updated_at AS data_hora,
        'OS'::text AS modulo,
        ('OS #' || so.number::text || ' atualizada (' || so.status::text || ')') AS descricao,
        ('#' || so.number::text) AS referencia,
        NULL::text AS usuario
      FROM public.service_orders so
      WHERE so.office_id = p_office_id

      UNION ALL
      SELECT
        p.created_at,
        'Pagamentos',
        ('Pagamento ' || coalesce(p.payment_method::text, '') || ' · ' || coalesce(p.amount::text, '0')),
        CASE WHEN so.number IS NOT NULL THEN ('OS #' || so.number::text) ELSE NULL END,
        nullif(trim(p.craft_meta->>'usuario_nome'), '')
      FROM public.service_order_payments p
      LEFT JOIN public.service_orders so
        ON so.id = p.service_order_id AND so.office_id = p.office_id
      WHERE p.office_id = p_office_id

      UNION ALL
      SELECT
        cm.created_at,
        'Caixa',
        ('Movimento de caixa: ' || coalesce(cm.type, '—')),
        left(cm.id::text, 8),
        nullif(trim(cm.created_by_name), '')
      FROM public.cash_movements cm
      WHERE cm.office_id = p_office_id AND cm.deleted_at IS NULL

      UNION ALL
      SELECT
        coalesce(cs.closed_at, cs.opened_at),
        'Caixa',
        CASE
          WHEN cs.status = 'closed' THEN 'Caixa fechado'
          ELSE 'Caixa aberto'
        END,
        left(cs.id::text, 8),
        coalesce(nullif(trim(cs.closed_by_name), ''), nullif(trim(cs.opened_by_name), ''))
      FROM public.cash_sessions cs
      WHERE cs.office_id = p_office_id AND cs.deleted_at IS NULL

      UNION ALL
      SELECT
        coalesce(mv.created_at, mv.movement_date::timestamptz),
        'Estoque',
        ('Movimento estoque: ' || coalesce(mv.movement_type, '—') ||
          CASE WHEN i.name IS NOT NULL THEN (' · ' || i.name) ELSE '' END),
        CASE WHEN mv.service_order_number IS NOT NULL THEN ('OS #' || mv.service_order_number::text) ELSE NULL END,
        nullif(trim(mv.user_name), '')
      FROM public.inventory_movements mv
      LEFT JOIN public.inventory_items i
        ON i.id = mv.inventory_item_id AND i.office_id = mv.office_id
      WHERE mv.office_id = p_office_id

      UNION ALL
      SELECT
        al.created_at,
        'Portal/Aprovações',
        ('Link de aprovação · status ' ||
          CASE
            WHEN al.status = 'approved'
              AND lower(coalesce(al.metadata->>'approval_type', '')) = 'partial'
              THEN 'aprovado_parcialmente'
            WHEN al.status = 'pending' AND al.expires_at <= now() THEN 'expirado'
            ELSE al.status
          END),
        CASE WHEN so.number IS NOT NULL THEN ('Orçamento #' || so.number::text) ELSE NULL END,
        NULL
      FROM public.approval_links al
      LEFT JOIN public.service_orders so
        ON so.id = al.service_order_id AND so.office_id = al.office_id
      WHERE al.office_id = p_office_id

      UNION ALL
      SELECT
        ph.created_at,
        'Fotos',
        'Foto de OS registrada',
        CASE WHEN so.number IS NOT NULL THEN ('OS #' || so.number::text) ELSE NULL END,
        nullif(trim(ph.created_by_name), '')
      FROM public.service_order_photos ph
      LEFT JOIN public.service_orders so
        ON so.id = ph.service_order_id AND so.office_id = ph.office_id
      WHERE ph.office_id = p_office_id AND ph.deleted_at IS NULL
    ) u
    ORDER BY u.data_hora DESC NULLS LAST
    LIMIT v_limite
  ) e;

  -- Alertas detectáveis (somente se comprováveis)
  SELECT coalesce(jsonb_agg(a.obj), '[]'::jsonb)
  INTO v_alertas
  FROM (
    SELECT jsonb_build_object(
      'codigo', 'sem_atividade_recente',
      'nivel', 'atencao',
      'titulo', 'Oficina sem atividade observada há muitos dias',
      'detalhe', 'Pode indicar necessidade de conferência. Não prova que a oficina está offline.'
    ) AS obj
    WHERE v_dias_sem IS NOT NULL AND v_dias_sem >= 14

    UNION ALL
    SELECT jsonb_build_object(
      'codigo', 'os_sem_pagamentos_recentes',
      'nivel', 'info',
      'titulo', 'OS recentes sem pagamentos recentes',
      'detalhe', 'Houve OS atualizadas nos últimos 7 dias, mas nenhum pagamento no mesmo período. Pode indicar necessidade de conferência.'
    )
    WHERE EXISTS (
      SELECT 1 FROM public.service_orders so
      WHERE so.office_id = p_office_id
        AND greatest(so.created_at, coalesce(so.updated_at, so.created_at)) >= now() - interval '7 days'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.service_order_payments p
      WHERE p.office_id = p_office_id
        AND p.created_at >= now() - interval '7 days'
    )

    UNION ALL
    SELECT jsonb_build_object(
      'codigo', 'pagamentos_sem_caixa',
      'nivel', 'atencao',
      'titulo', 'Pagamentos sem movimento de caixa vinculado',
      'detalhe', format(
        '%s pagamento(s) sem cash_movement vinculado. Pode indicar necessidade de conferência.',
        (
          SELECT count(*)::int
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
            )
        )
      )
    )
    WHERE (
      SELECT count(*)::int
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
        )
    ) > 0

    UNION ALL
    SELECT jsonb_build_object(
      'codigo', 'estoque_sem_movimento',
      'nivel', 'info',
      'titulo', 'Estoque sem movimentação há muito tempo',
      'detalhe', 'Nenhuma movimentação de estoque observada nos últimos 30 dias.'
    )
    WHERE EXISTS (SELECT 1 FROM public.inventory_items i WHERE i.office_id = p_office_id AND i.deleted_at IS NULL)
      AND NOT EXISTS (
        SELECT 1 FROM public.inventory_movements mv
        WHERE mv.office_id = p_office_id
          AND coalesce(mv.created_at, mv.movement_date::timestamptz) >= now() - interval '30 days'
      )

    UNION ALL
    SELECT jsonb_build_object(
      'codigo', 'estoque_critico',
      'nivel', 'atencao',
      'titulo', 'Muitos itens zerados ou abaixo do mínimo',
      'detalhe', format(
        '%s item(ns) zerados/baixos observados no servidor.',
        (
          SELECT count(*)::int FROM public.inventory_items i
          WHERE i.office_id = p_office_id
            AND i.deleted_at IS NULL
            AND coalesce(i.active, true)
            AND (
              coalesce(i.quantity, 0) <= 0
              OR i.quantity <= coalesce(i.minimum_stock, 0)
            )
        )
      )
    )
    WHERE (
      SELECT count(*)::int FROM public.inventory_items i
      WHERE i.office_id = p_office_id
        AND i.deleted_at IS NULL
        AND coalesce(i.active, true)
        AND (
          coalesce(i.quantity, 0) <= 0
          OR i.quantity <= coalesce(i.minimum_stock, 0)
        )
    ) >= 5

    UNION ALL
    SELECT jsonb_build_object(
      'codigo', 'aprovacoes_pendentes_expiradas',
      'nivel', 'atencao',
      'titulo', 'Links de aprovação pendentes ou expirados',
      'detalhe', format(
        '%s link(s) pendente(s)/expirado(s) observados.',
        (
          SELECT count(*)::int FROM public.approval_links al
          WHERE al.office_id = p_office_id
            AND al.revoked_at IS NULL
            AND (
              al.status = 'expired'
              OR (al.status = 'pending' AND al.expires_at <= now())
              OR al.status = 'pending'
            )
        )
      )
    )
    WHERE EXISTS (
      SELECT 1 FROM public.approval_links al
      WHERE al.office_id = p_office_id
        AND al.revoked_at IS NULL
        AND (
          al.status = 'expired'
          OR al.status = 'pending'
        )
    )

    UNION ALL
    SELECT jsonb_build_object(
      'codigo', 'fotos_sem_arquivo',
      'nivel', 'atencao',
      'titulo', 'Fotos registradas sem arquivo no storage',
      'detalhe', format(
        '%s foto(s) sem storage_path. Pode indicar upload incompleto.',
        (
          SELECT count(*)::int FROM public.service_order_photos ph
          WHERE ph.office_id = p_office_id
            AND ph.deleted_at IS NULL
            AND nullif(trim(ph.storage_path), '') IS NULL
        )
      )
    )
    WHERE EXISTS (
      SELECT 1 FROM public.service_order_photos ph
      WHERE ph.office_id = p_office_id
        AND ph.deleted_at IS NULL
        AND nullif(trim(ph.storage_path), '') IS NULL
    )

    UNION ALL
    SELECT jsonb_build_object(
      'codigo', 'caixa_aberto_longo',
      'nivel', 'atencao',
      'titulo', 'Caixa aberto há mais de 24 horas',
      'detalhe', 'Há sessão de caixa aberta há mais de 24h no servidor. Pode indicar necessidade de conferência.'
    )
    WHERE EXISTS (
      SELECT 1 FROM public.cash_sessions cs
      WHERE cs.office_id = p_office_id
        AND cs.deleted_at IS NULL
        AND cs.status = 'open'
        AND cs.opened_at <= now() - interval '24 hours'
    )
  ) a;

  RETURN jsonb_build_object(
    'ultima_atividade_geral', v_ultima,
    'resumo_por_modulo', coalesce(v_modulos, '[]'::jsonb),
    'alertas', coalesce(v_alertas, '[]'::jsonb),
    'eventos_recentes', coalesce(v_eventos, '[]'::jsonb),
    'limitacoes', jsonb_build_object(
      'texto',
        'O BoxGestor consegue ver apenas dados que chegaram ao servidor. Pendências locais em celulares/computadores offline, localStorage, IndexedDB ou fotos ainda não enviadas não são visíveis nesta tela.',
      'visivel_no_servidor', true,
      'visivel_localmente', false,
      'nao_confirma_offline_travado', true
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_support_get_office_health_overview(UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_support_get_office_health_overview(UUID, INTEGER) TO authenticated;

COMMENT ON FUNCTION public.admin_support_get_office_health_overview IS
  'Admin Sistema (suporte): saúde/atividade observada no servidor por oficina. Não enxerga fila offline local.';

NOTIFY pgrst, 'reload schema';
