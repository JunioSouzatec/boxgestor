-- Concorrência multiusuário de Ordens de Serviço.
-- Toda criação/edição autenticada passa por uma única operação atômica.

ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS revision BIGINT NOT NULL DEFAULT 1;

ALTER TABLE public.service_orders
  DROP CONSTRAINT IF EXISTS service_orders_revision_positive;

ALTER TABLE public.service_orders
  ADD CONSTRAINT service_orders_revision_positive CHECK (revision > 0);

CREATE OR REPLACE FUNCTION public.bump_service_order_revision()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.revision := OLD.revision + 1;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_service_orders_revision ON public.service_orders;
CREATE TRIGGER trg_service_orders_revision
  BEFORE UPDATE ON public.service_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.bump_service_order_revision();

CREATE OR REPLACE FUNCTION public.save_service_order_if_revision(
  p_office_id UUID,
  p_service_order_id UUID,
  p_expected_revision BIGINT,
  p_payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current public.service_orders%ROWTYPE;
  v_saved public.service_orders%ROWTYPE;
  v_current_office UUID;
  v_customer_id UUID;
  v_motorcycle_id UUID;
  v_budget_status public.status_orcamento;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  v_current_office := public.current_office_id();
  IF v_current_office IS DISTINCT FROM p_office_id
     AND NOT public.is_system_admin() THEN
    RAISE EXCEPTION 'office access denied';
  END IF;

  IF p_payload IS NULL
     OR NULLIF(p_payload ->> 'id', '')::UUID IS DISTINCT FROM p_service_order_id
     OR NULLIF(p_payload ->> 'office_id', '')::UUID IS DISTINCT FROM p_office_id THEN
    RAISE EXCEPTION 'invalid service order payload';
  END IF;

  v_customer_id := NULLIF(p_payload ->> 'customer_id', '')::UUID;
  v_motorcycle_id := NULLIF(p_payload ->> 'motorcycle_id', '')::UUID;

  IF NOT EXISTS (
    SELECT 1
    FROM public.customers c
    WHERE c.id = v_customer_id
      AND c.office_id = p_office_id
  ) THEN
    RAISE EXCEPTION 'customer does not belong to office';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.motorcycles m
    WHERE m.id = v_motorcycle_id
      AND m.office_id = p_office_id
      AND m.customer_id = v_customer_id
  ) THEN
    RAISE EXCEPTION 'motorcycle does not belong to customer and office';
  END IF;

  IF NULLIF(p_payload ->> 'budget_status', '') IS NULL THEN
    v_budget_status := NULL;
  ELSE
    v_budget_status := (p_payload ->> 'budget_status')::public.status_orcamento;
  END IF;

  SELECT *
  INTO v_current
  FROM public.service_orders
  WHERE id = p_service_order_id
    AND office_id = p_office_id
  FOR UPDATE;

  IF FOUND THEN
    IF p_expected_revision IS NULL OR v_current.revision <> p_expected_revision THEN
      RETURN jsonb_build_object(
        'status', 'conflict',
        'expected_revision', p_expected_revision,
        'current_revision', v_current.revision,
        'service_order', to_jsonb(v_current)
      );
    END IF;

    UPDATE public.service_orders
    SET
      customer_id = v_customer_id,
      motorcycle_id = v_motorcycle_id,
      number = (p_payload ->> 'number')::INTEGER,
      reported_issue = COALESCE(p_payload ->> 'reported_issue', ''),
      diagnosis = COALESCE(p_payload ->> 'diagnosis', ''),
      services_performed = COALESCE(p_payload ->> 'services_performed', ''),
      parts_used = COALESCE(p_payload -> 'parts_used', '[]'::JSONB),
      parts_value = COALESCE((p_payload ->> 'parts_value')::NUMERIC, 0),
      labor_value = COALESCE((p_payload ->> 'labor_value')::NUMERIC, 0),
      discount = COALESCE((p_payload ->> 'discount')::NUMERIC, 0),
      total_value = COALESCE((p_payload ->> 'total_value')::NUMERIC, 0),
      status = (p_payload ->> 'status')::public.status_os,
      entry_checklist = NULLIF(p_payload -> 'entry_checklist', 'null'::JSONB),
      estimated_value = NULLIF(p_payload ->> 'estimated_value', '')::NUMERIC,
      budget_date = NULLIF(p_payload ->> 'budget_date', '')::DATE,
      budget_status = v_budget_status,
      entry_mileage = NULLIF(p_payload ->> 'entry_mileage', '')::INTEGER,
      exit_mileage = NULLIF(p_payload ->> 'exit_mileage', '')::INTEGER,
      warranty_days = NULLIF(p_payload ->> 'warranty_days', '')::INTEGER,
      warranty_expires_at = NULLIF(p_payload ->> 'warranty_expires_at', '')::DATE,
      updated_at = NOW()
    WHERE id = p_service_order_id
      AND office_id = p_office_id
      AND revision = p_expected_revision
    RETURNING * INTO v_saved;

    IF NOT FOUND THEN
      SELECT *
      INTO v_current
      FROM public.service_orders
      WHERE id = p_service_order_id
        AND office_id = p_office_id;

      RETURN jsonb_build_object(
        'status', 'conflict',
        'expected_revision', p_expected_revision,
        'current_revision', v_current.revision,
        'service_order', to_jsonb(v_current)
      );
    END IF;
  ELSE
    IF p_expected_revision IS NOT NULL THEN
      RETURN jsonb_build_object(
        'status', 'conflict',
        'expected_revision', p_expected_revision,
        'current_revision', NULL,
        'service_order', NULL
      );
    END IF;

    INSERT INTO public.service_orders (
      id,
      office_id,
      customer_id,
      motorcycle_id,
      number,
      reported_issue,
      diagnosis,
      services_performed,
      parts_used,
      parts_value,
      labor_value,
      discount,
      total_value,
      status,
      entry_checklist,
      estimated_value,
      budget_date,
      budget_status,
      entry_mileage,
      exit_mileage,
      warranty_days,
      warranty_expires_at,
      created_at
    )
    VALUES (
      p_service_order_id,
      p_office_id,
      v_customer_id,
      v_motorcycle_id,
      (p_payload ->> 'number')::INTEGER,
      COALESCE(p_payload ->> 'reported_issue', ''),
      COALESCE(p_payload ->> 'diagnosis', ''),
      COALESCE(p_payload ->> 'services_performed', ''),
      COALESCE(p_payload -> 'parts_used', '[]'::JSONB),
      COALESCE((p_payload ->> 'parts_value')::NUMERIC, 0),
      COALESCE((p_payload ->> 'labor_value')::NUMERIC, 0),
      COALESCE((p_payload ->> 'discount')::NUMERIC, 0),
      COALESCE((p_payload ->> 'total_value')::NUMERIC, 0),
      (p_payload ->> 'status')::public.status_os,
      NULLIF(p_payload -> 'entry_checklist', 'null'::JSONB),
      NULLIF(p_payload ->> 'estimated_value', '')::NUMERIC,
      NULLIF(p_payload ->> 'budget_date', '')::DATE,
      v_budget_status,
      NULLIF(p_payload ->> 'entry_mileage', '')::INTEGER,
      NULLIF(p_payload ->> 'exit_mileage', '')::INTEGER,
      NULLIF(p_payload ->> 'warranty_days', '')::INTEGER,
      NULLIF(p_payload ->> 'warranty_expires_at', '')::DATE,
      COALESCE(NULLIF(p_payload ->> 'created_at', '')::TIMESTAMPTZ, NOW())
    )
    RETURNING * INTO v_saved;
  END IF;

  RETURN jsonb_build_object(
    'status', 'saved',
    'expected_revision', p_expected_revision,
    'current_revision', v_saved.revision,
    'service_order', to_jsonb(v_saved)
  );
END;
$$;

COMMENT ON FUNCTION public.save_service_order_if_revision(UUID, UUID, BIGINT, JSONB) IS
  'Cria OS com expected_revision nula ou atualiza atomicamente quando a revision esperada ainda é a atual.';

CREATE OR REPLACE FUNCTION public.save_service_order_pair_if_revisions(
  p_first_office_id UUID,
  p_first_service_order_id UUID,
  p_first_expected_revision BIGINT,
  p_first_payload JSONB,
  p_second_office_id UUID,
  p_second_service_order_id UUID,
  p_second_expected_revision BIGINT,
  p_second_payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_first JSONB;
  v_second JSONB;
BEGIN
  IF p_first_office_id IS DISTINCT FROM p_second_office_id THEN
    RAISE EXCEPTION 'service orders must belong to the same office';
  END IF;

  v_first := public.save_service_order_if_revision(
    p_first_office_id,
    p_first_service_order_id,
    p_first_expected_revision,
    p_first_payload
  );

  IF v_first ->> 'status' = 'conflict' THEN
    RETURN jsonb_build_object(
      'status', 'conflict',
      'first', v_first,
      'second', NULL
    );
  END IF;

  v_second := public.save_service_order_if_revision(
    p_second_office_id,
    p_second_service_order_id,
    p_second_expected_revision,
    p_second_payload
  );

  IF v_second ->> 'status' <> 'saved' THEN
    RAISE EXCEPTION 'second service order could not be saved atomically';
  END IF;

  RETURN jsonb_build_object(
    'status', 'saved',
    'first', v_first,
    'second', v_second
  );
END;
$$;

COMMENT ON FUNCTION public.save_service_order_pair_if_revisions(
  UUID, UUID, BIGINT, JSONB, UUID, UUID, BIGINT, JSONB
) IS
  'Salva duas OS na mesma transação; usado para converter orçamento sem estado parcial.';

REVOKE ALL ON FUNCTION public.save_service_order_if_revision(UUID, UUID, BIGINT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_service_order_if_revision(UUID, UUID, BIGINT, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.save_service_order_if_revision(UUID, UUID, BIGINT, JSONB) TO authenticated;
REVOKE ALL ON FUNCTION public.save_service_order_pair_if_revisions(
  UUID, UUID, BIGINT, JSONB, UUID, UUID, BIGINT, JSONB
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_service_order_pair_if_revisions(
  UUID, UUID, BIGINT, JSONB, UUID, UUID, BIGINT, JSONB
) FROM anon;
GRANT EXECUTE ON FUNCTION public.save_service_order_pair_if_revisions(
  UUID, UUID, BIGINT, JSONB, UUID, UUID, BIGINT, JSONB
) TO authenticated;

-- Impede clientes autenticados de contornarem o compare-and-swap.
-- service_role continua disponível para rotinas internas controladas.
REVOKE INSERT, UPDATE ON public.service_orders FROM authenticated;
REVOKE INSERT, UPDATE ON public.service_orders FROM anon;
