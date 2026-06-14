-- =============================================================================
-- Craft Oficina — Limpeza segura de dados operacionais de teste
-- Execute manualmente no SQL Editor do Supabase (NÃO roda automaticamente).
--
-- Apaga somente dados da oficina do usuário logado (profile.office_id).
-- Preserva: auth.users, profiles, offices, settings, logo, cores, plano, RLS.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.reset_office_test_data(
  p_incluir_estoque BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_office_id UUID;
  v_profile_office UUID;
  v_deleted JSONB := '{}'::jsonb;
  v_count INTEGER;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT office_id INTO v_profile_office
  FROM public.profiles
  WHERE user_id = v_user_id OR id = v_user_id
  ORDER BY updated_at DESC NULLS LAST
  LIMIT 1;

  IF v_profile_office IS NULL THEN
    RAISE EXCEPTION 'Perfil sem office_id';
  END IF;

  v_office_id := public.current_office_id();

  IF v_office_id IS NULL OR v_office_id <> v_profile_office THEN
    RAISE EXCEPTION 'office_id não corresponde ao usuário logado';
  END IF;

  -- 1. Fotos da OS
  DELETE FROM public.service_order_photos WHERE office_id = v_office_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('service_order_photos', v_count);

  -- 2. Pagamentos da OS
  DELETE FROM public.service_order_payments WHERE office_id = v_office_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('service_order_payments', v_count);

  -- 3. Financeiro
  DELETE FROM public.financial_transactions WHERE office_id = v_office_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('financial_transactions', v_count);

  -- 4. Garantias
  DELETE FROM public.warranties WHERE office_id = v_office_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('warranties', v_count);

  -- 5. Agenda
  DELETE FROM public.appointments WHERE office_id = v_office_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('appointments', v_count);

  -- 6. Ordens de serviço
  DELETE FROM public.service_orders WHERE office_id = v_office_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('service_orders', v_count);

  -- 7–8. Estoque (opcional)
  IF p_incluir_estoque THEN
    IF to_regclass('public.inventory_movements') IS NOT NULL THEN
      DELETE FROM public.inventory_movements WHERE office_id = v_office_id;
      GET DIAGNOSTICS v_count = ROW_COUNT;
      v_deleted := v_deleted || jsonb_build_object('inventory_movements', v_count);
    END IF;

    DELETE FROM public.inventory_items WHERE office_id = v_office_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('inventory_items', v_count);
  END IF;

  -- 9. Motos
  DELETE FROM public.motorcycles WHERE office_id = v_office_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('motorcycles', v_count);

  -- 10. Clientes
  DELETE FROM public.customers WHERE office_id = v_office_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('customers', v_count);

  RETURN jsonb_build_object(
    'ok', true,
    'office_id', v_office_id,
    'incluiu_estoque', p_incluir_estoque,
    'deleted', v_deleted
  );
END;
$$;

COMMENT ON FUNCTION public.reset_office_test_data(BOOLEAN) IS
  'Remove dados operacionais de teste apenas da oficina do usuário logado. Não apaga auth, profiles, offices nem settings.';

REVOKE ALL ON FUNCTION public.reset_office_test_data(BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_office_test_data(BOOLEAN) TO authenticated;

-- =============================================================================
-- Uso (como usuário autenticado no app ou SQL Editor com JWT):
--   SELECT public.reset_office_test_data(false);  -- operação
--   SELECT public.reset_office_test_data(true);   -- operação + estoque
-- =============================================================================
