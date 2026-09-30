-- =============================================================================
-- Merge atômico de aprovação em service_orders (Edge / service_role).
-- client_response: approval_links e service_orders na MESMA transação.
--   1) FOR UPDATE no link; 2) revalida pending/expiração/vínculo/token_hash;
--   3) FOR UPDATE na OS; 4) merge só da meta; 5) 1 UPDATE na OS;
--   6) fecha o link. Qualquer erro desfaz as duas escritas.
-- link_created: continua só o merge da OS (FOR UPDATE). O INSERT do link
--   permanece na Edge — create NÃO é transacional entre as duas tabelas.
-- revision: bump pelo trigger trg_service_orders_revision (não setar aqui).
-- NÃO altera save_service_order_if_revision nem grants de service_orders.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.apply_service_order_approval_patch(
  p_office_id UUID,
  p_service_order_id UUID,
  p_link_id UUID,
  p_kind TEXT,
  p_budget_status TEXT DEFAULT NULL,
  p_aprovacao_patch JSONB DEFAULT '{}'::JSONB,
  p_evento JSONB DEFAULT NULL,
  p_historico JSONB DEFAULT NULL,
  p_token_hash TEXT DEFAULT NULL,
  p_link_status TEXT DEFAULT NULL,
  p_response_name TEXT DEFAULT NULL,
  p_response_note TEXT DEFAULT NULL,
  p_response_ip TEXT DEFAULT NULL,
  p_response_user_agent TEXT DEFAULT NULL,
  p_link_metadata JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link public.approval_links%ROWTYPE;
  v_row public.service_orders%ROWTYPE;
  v_parts JSONB;
  v_craft JSONB;
  v_aprov JSONB;
  v_eventos JSONB;
  v_hist JSONB;
  v_evento_id TEXT;
  v_hist_id TEXT;
  v_already BOOLEAN := FALSE;
  v_budget public.status_orcamento;
  v_mode TEXT;
  v_expected_link_status TEXT;
BEGIN
  IF p_office_id IS NULL OR p_service_order_id IS NULL OR p_link_id IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'invalid_link',
      'reason', 'missing_ids',
      'updated', FALSE,
      'revision', NULL
    );
  END IF;

  IF p_kind IS DISTINCT FROM 'link_created' AND p_kind IS DISTINCT FROM 'client_response' THEN
    RAISE EXCEPTION 'invalid approval patch kind';
  END IF;

  IF p_aprovacao_patch IS NULL OR jsonb_typeof(p_aprovacao_patch) <> 'object' THEN
    RAISE EXCEPTION 'aprovacao_patch must be a JSON object';
  END IF;

  IF p_kind = 'link_created' AND p_budget_status IS NOT NULL THEN
    RAISE EXCEPTION 'link_created must not set budget_status';
  END IF;

  IF p_kind = 'client_response' THEN
    IF p_budget_status IS NULL OR p_budget_status NOT IN ('aprovado', 'recusado') THEN
      RAISE EXCEPTION 'client_response requires budget_status aprovado|recusado';
    END IF;
    v_budget := p_budget_status::public.status_orcamento;
    v_expected_link_status := CASE WHEN p_budget_status = 'recusado' THEN 'rejected' ELSE 'approved' END;

    IF p_token_hash IS NULL OR length(trim(p_token_hash)) < 32 THEN
      RETURN jsonb_build_object(
        'status', 'invalid_link',
        'reason', 'token',
        'updated', FALSE,
        'revision', NULL
      );
    END IF;

    IF p_link_status IS DISTINCT FROM 'approved' AND p_link_status IS DISTINCT FROM 'rejected' THEN
      RETURN jsonb_build_object(
        'status', 'invalid_link',
        'reason', 'link_status',
        'updated', FALSE,
        'revision', NULL
      );
    END IF;

    IF p_link_status IS DISTINCT FROM v_expected_link_status THEN
      RETURN jsonb_build_object(
        'status', 'invalid_link',
        'reason', 'status_mismatch',
        'updated', FALSE,
        'revision', NULL
      );
    END IF;

    IF p_link_metadata IS NOT NULL AND jsonb_typeof(p_link_metadata) <> 'object' THEN
      RAISE EXCEPTION 'link metadata must be a JSON object';
    END IF;

    SELECT *
    INTO v_link
    FROM public.approval_links
    WHERE id = p_link_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'status', 'not_found',
        'reason', 'link',
        'updated', FALSE,
        'revision', NULL
      );
    END IF;

    IF v_link.office_id IS DISTINCT FROM p_office_id
       OR v_link.service_order_id IS DISTINCT FROM p_service_order_id
       OR v_link.token_hash IS DISTINCT FROM trim(p_token_hash) THEN
      RETURN jsonb_build_object(
        'status', 'invalid_link',
        'reason', 'mismatch',
        'updated', FALSE,
        'revision', NULL
      );
    END IF;

    v_mode := lower(trim(COALESCE(
      v_link.metadata ->> 'portal_mode',
      v_link.metadata ->> 'link_purpose',
      ''
    )));
    IF v_mode IN ('service_tracking', 'photos', 'tracking', 'acompanhamento') THEN
      RETURN jsonb_build_object(
        'status', 'invalid_link',
        'reason', 'tracking',
        'updated', FALSE,
        'revision', NULL
      );
    END IF;

    IF v_link.status IS DISTINCT FROM 'pending' THEN
      IF v_link.status = 'expired' THEN
        RETURN jsonb_build_object(
          'status', 'expired',
          'link_status', 'expired',
          'updated', FALSE,
          'revision', NULL
        );
      END IF;
      RETURN jsonb_build_object(
        'status', 'already_responded',
        'link_status', v_link.status,
        'updated', FALSE,
        'revision', NULL
      );
    END IF;

    IF v_link.expires_at <= NOW() THEN
      UPDATE public.approval_links
      SET status = 'expired'
      WHERE id = p_link_id
        AND office_id = p_office_id
        AND service_order_id = p_service_order_id
        AND status = 'pending';

      RETURN jsonb_build_object(
        'status', 'expired',
        'link_status', 'expired',
        'updated', FALSE,
        'revision', NULL
      );
    END IF;
  END IF;

  SELECT *
  INTO v_row
  FROM public.service_orders
  WHERE id = p_service_order_id
    AND office_id = p_office_id
  FOR UPDATE;

  IF NOT FOUND THEN
    IF p_kind = 'client_response' THEN
      RETURN jsonb_build_object(
        'status', 'not_found',
        'reason', 'service_order',
        'updated', FALSE,
        'revision', NULL
      );
    END IF;
    RAISE EXCEPTION 'service_order not found for office';
  END IF;

  v_parts := COALESCE(v_row.parts_used, '{}'::JSONB);
  IF jsonb_typeof(v_parts) <> 'object' THEN
    v_parts := jsonb_build_object('pecas', '[]'::JSONB, 'craft_meta', '{}'::JSONB);
  END IF;

  v_craft := COALESCE(v_parts -> 'craft_meta', '{}'::JSONB);
  IF jsonb_typeof(v_craft) <> 'object' THEN
    v_craft := '{}'::JSONB;
  END IF;

  v_aprov := COALESCE(v_craft -> 'aprovacao_cliente', '{}'::JSONB);
  IF jsonb_typeof(v_aprov) <> 'object' OR v_aprov = 'null'::JSONB THEN
    v_aprov := '{}'::JSONB;
  END IF;

  v_eventos := COALESCE(v_aprov -> 'eventos', '[]'::JSONB);
  IF jsonb_typeof(v_eventos) <> 'array' THEN
    v_eventos := '[]'::JSONB;
  END IF;

  v_hist := COALESCE(v_craft -> 'historico_eventos', '[]'::JSONB);
  IF jsonb_typeof(v_hist) <> 'array' THEN
    v_hist := '[]'::JSONB;
  END IF;

  v_evento_id := NULLIF(p_evento ->> 'id', '');
  v_hist_id := NULLIF(p_historico ->> 'id', '');

  -- link_created: dedupe por link_id. client_response NÃO usa este atalho:
  -- o lock do link serializa approve vs reject; o perdedor sai em already_responded.
  IF p_kind = 'link_created' THEN
    IF (
      NULLIF(v_aprov ->> 'link_id', '') = p_link_id::TEXT
      AND NULLIF(v_aprov ->> 'status', '') = 'aguardando_cliente'
    ) OR (
      v_evento_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_eventos) e WHERE e ->> 'id' = v_evento_id
      )
    ) THEN
      v_already := TRUE;
    END IF;
  END IF;

  IF v_already THEN
    RETURN jsonb_build_object(
      'status', 'already_applied',
      'revision', v_row.revision,
      'service_order_id', v_row.id,
      'link_status', NULL,
      'updated', FALSE
    );
  END IF;

  v_aprov := v_aprov || p_aprovacao_patch;
  v_aprov := jsonb_set(v_aprov, '{link_id}', to_jsonb(p_link_id::TEXT), TRUE);

  IF p_evento IS NOT NULL AND jsonb_typeof(p_evento) = 'object' AND v_evento_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_eventos) e WHERE e ->> 'id' = v_evento_id
    ) THEN
      v_eventos := v_eventos || jsonb_build_array(p_evento);
      IF jsonb_array_length(v_eventos) > 30 THEN
        SELECT COALESCE(jsonb_agg(elem ORDER BY ord), '[]'::JSONB)
        INTO v_eventos
        FROM (
          SELECT elem, ord
          FROM jsonb_array_elements(v_eventos) WITH ORDINALITY AS t(elem, ord)
          WHERE ord > jsonb_array_length(v_eventos) - 30
        ) s;
      END IF;
    END IF;
  END IF;

  v_aprov := jsonb_set(v_aprov, '{eventos}', v_eventos, TRUE);

  IF p_historico IS NOT NULL AND jsonb_typeof(p_historico) = 'object' AND v_hist_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_hist) h WHERE h ->> 'id' = v_hist_id
    ) THEN
      v_hist := v_hist || jsonb_build_array(p_historico);
    END IF;
  END IF;

  v_craft := jsonb_set(v_craft, '{aprovacao_cliente}', v_aprov, TRUE);
  v_craft := jsonb_set(v_craft, '{historico_eventos}', v_hist, TRUE);
  v_parts := jsonb_set(v_parts, '{craft_meta}', v_craft, TRUE);

  IF p_kind = 'client_response' THEN
    UPDATE public.service_orders
    SET
      parts_used = v_parts,
      budget_status = v_budget,
      updated_at = NOW()
    WHERE id = p_service_order_id
      AND office_id = p_office_id
    RETURNING * INTO v_row;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'service_order approval update failed';
    END IF;

    UPDATE public.approval_links
    SET
      status = p_link_status,
      approved_at = CASE WHEN p_link_status = 'approved' THEN NOW() ELSE approved_at END,
      rejected_at = CASE WHEN p_link_status = 'rejected' THEN NOW() ELSE rejected_at END,
      response_name = NULLIF(trim(COALESCE(p_response_name, '')), ''),
      response_note = NULLIF(trim(COALESCE(p_response_note, '')), ''),
      response_ip = NULLIF(trim(COALESCE(p_response_ip, '')), ''),
      response_user_agent = NULLIF(trim(COALESCE(p_response_user_agent, '')), ''),
      metadata = COALESCE(v_link.metadata, '{}'::JSONB) || COALESCE(p_link_metadata, '{}'::JSONB)
    WHERE id = p_link_id
      AND office_id = p_office_id
      AND service_order_id = p_service_order_id
      AND status = 'pending';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'approval link close failed';
    END IF;

    RETURN jsonb_build_object(
      'status', 'applied',
      'link_status', p_link_status,
      'revision', v_row.revision,
      'service_order_id', v_row.id,
      'updated', TRUE
    );
  END IF;

  UPDATE public.service_orders
  SET
    parts_used = v_parts,
    updated_at = NOW()
  WHERE id = p_service_order_id
    AND office_id = p_office_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'service_order link metadata update failed';
  END IF;

  RETURN jsonb_build_object(
    'status', 'applied',
    'revision', v_row.revision,
    'service_order_id', v_row.id,
    'link_status', NULL,
    'updated', TRUE
  );
END;
$$;

COMMENT ON FUNCTION public.apply_service_order_approval_patch(
  UUID, UUID, UUID, TEXT, TEXT, JSONB, JSONB, JSONB, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB
) IS
  'client_response fecha approval_links e faz merge da OS na mesma transação. link_created só faz merge da OS. Só service_role.';

REVOKE ALL ON FUNCTION public.apply_service_order_approval_patch(
  UUID, UUID, UUID, TEXT, TEXT, JSONB, JSONB, JSONB, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_service_order_approval_patch(
  UUID, UUID, UUID, TEXT, TEXT, JSONB, JSONB, JSONB, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB
) FROM anon;
REVOKE ALL ON FUNCTION public.apply_service_order_approval_patch(
  UUID, UUID, UUID, TEXT, TEXT, JSONB, JSONB, JSONB, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.apply_service_order_approval_patch(
  UUID, UUID, UUID, TEXT, TEXT, JSONB, JSONB, JSONB, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB
) TO service_role;
