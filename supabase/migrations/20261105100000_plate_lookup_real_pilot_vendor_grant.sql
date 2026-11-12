-- =============================================================================
-- Consulta por placa — grant atômico de UMA chamada HTTP real (piloto Homolog)
-- =============================================================================
-- Posterior a 20261101120000_plate_lookup_usage_base.sql.
-- NÃO reaplicar a migration base. Aplicar SOMENTE este arquivo em Homolog quando autorizado.
-- Projeto alvo: cqnktgouczyrxkkeusio (Production PROIBIDO).
--
-- Garantia: no máximo uma linha por office_id (oficina fictícia do piloto).
-- INSERT ... ON CONFLICT dentro da mesma transação que valida o evento (FOR UPDATE).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Tabela persistente do direito adquirido (não expira automaticamente)
-- -----------------------------------------------------------------------------

CREATE TABLE public.plate_lookup_real_pilot_vendor_grant (
  office_id    UUID NOT NULL PRIMARY KEY
    REFERENCES public.offices (id) ON DELETE CASCADE,
  event_id     UUID NOT NULL UNIQUE
    REFERENCES public.plate_lookup_events (id) ON DELETE RESTRICT,
  plate_hash   TEXT NOT NULL CHECK (char_length(plate_hash) = 64),
  acquired_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.plate_lookup_real_pilot_vendor_grant IS
  'Piloto Homolog: direito durável à única chamada HTTP ao fornecedor por oficina. Não libera após timeout/erro; remoção só operacional explícita.';

ALTER TABLE public.plate_lookup_real_pilot_vendor_grant ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.plate_lookup_real_pilot_vendor_grant FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.plate_lookup_real_pilot_vendor_grant TO service_role;

-- -----------------------------------------------------------------------------
-- 2) RPC: aquisição atômica (service_role ONLY)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.plate_lookup_acquire_real_pilot_vendor_call(
  p_event_id UUID,
  p_placa TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pilot_office CONSTANT UUID := '486d31e8-3bad-4c6b-95c0-3a5757b6066b'::uuid;
  v_event public.plate_lookup_events%ROWTYPE;
  v_hash TEXT;
  v_inserted UUID;
BEGIN
  PERFORM public.plate_lookup_assert_service_role();

  IF p_event_id IS NULL THEN
    RAISE EXCEPTION 'event_id required' USING ERRCODE = '22023';
  END IF;

  IF NOT public.plate_lookup_plate_valid(p_placa) THEN
    RETURN jsonb_build_object(
      'ok', FALSE,
      'acquired', FALSE,
      'code', 'PLATE_INVALID'
    );
  END IF;

  v_hash := public.plate_lookup_plate_hash(p_placa);

  SELECT * INTO v_event
  FROM public.plate_lookup_events e
  WHERE e.id = p_event_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', FALSE,
      'acquired', FALSE,
      'code', 'EVENT_NOT_FOUND'
    );
  END IF;

  IF v_event.office_id IS DISTINCT FROM v_pilot_office THEN
    RETURN jsonb_build_object(
      'ok', FALSE,
      'acquired', FALSE,
      'code', 'PILOT_OFFICE_BLOCKED',
      'event_id', v_event.id
    );
  END IF;

  IF v_event.plate_hash IS DISTINCT FROM v_hash THEN
    RETURN jsonb_build_object(
      'ok', FALSE,
      'acquired', FALSE,
      'code', 'PLATE_MISMATCH',
      'event_id', v_event.id
    );
  END IF;

  IF v_event.status = 'reconciliation_pending' THEN
    RETURN jsonb_build_object(
      'ok', TRUE,
      'acquired', FALSE,
      'code', 'EVENT_RECONCILIATION_PENDING',
      'event_id', v_event.id,
      'status', v_event.status
    );
  END IF;

  IF v_event.status <> 'reserved' THEN
    RETURN jsonb_build_object(
      'ok', TRUE,
      'acquired', FALSE,
      'code', 'EVENT_NOT_ELIGIBLE',
      'event_id', v_event.id,
      'status', v_event.status
    );
  END IF;

  IF v_event.api_called IS TRUE THEN
    RETURN jsonb_build_object(
      'ok', TRUE,
      'acquired', FALSE,
      'code', 'EVENT_API_ALREADY_STARTED',
      'event_id', v_event.id,
      'api_called', TRUE
    );
  END IF;

  IF v_event.reservation_expires_at <= NOW() THEN
    RETURN jsonb_build_object(
      'ok', TRUE,
      'acquired', FALSE,
      'code', 'RESERVATION_EXPIRED',
      'event_id', v_event.id
    );
  END IF;

  INSERT INTO public.plate_lookup_real_pilot_vendor_grant (
    office_id,
    event_id,
    plate_hash
  )
  VALUES (
    v_event.office_id,
    v_event.id,
    v_hash
  )
  ON CONFLICT (office_id) DO NOTHING
  RETURNING office_id INTO v_inserted;

  IF v_inserted IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', TRUE,
      'acquired', TRUE,
      'event_id', v_event.id,
      'office_id', v_event.office_id
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'acquired', FALSE,
    'code', 'VENDOR_GRANT_ALREADY_HELD',
    'event_id', v_event.id,
    'office_id', v_event.office_id
  );
END;
$$;

COMMENT ON FUNCTION public.plate_lookup_acquire_real_pilot_vendor_call(UUID, TEXT) IS
  'Piloto Homolog: adquire atomicamente o direito à única chamada HTTP ao fornecedor (service_role). acquired=true só na primeira inserção por office_id.';

REVOKE ALL ON FUNCTION public.plate_lookup_acquire_real_pilot_vendor_call(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.plate_lookup_acquire_real_pilot_vendor_call(UUID, TEXT)
  TO service_role;
