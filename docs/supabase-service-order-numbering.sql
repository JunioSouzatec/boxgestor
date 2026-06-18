-- BoxGestor — Numeração segura de Ordens de Serviço (parte 1 — segura)
-- Execute APÓS docs/supabase-admin-system.sql (função is_system_admin)
-- NÃO executar automaticamente.
-- NÃO cria índice único — rode a auditoria antes se houver duplicidades.

-- =============================================================================
-- 1) Auditoria manual (rodar antes de implantar)
-- =============================================================================
-- SELECT office_id, number, COUNT(*) AS qtd
-- FROM public.service_orders
-- GROUP BY office_id, number
-- HAVING COUNT(*) > 1;

-- =============================================================================
-- 2) Sincronizar settings.next_service_order_num (seguro após revisar duplicidades)
-- =============================================================================
-- UPDATE public.settings s
--    SET next_service_order_num = sub.maior + 1,
--        updated_at = now()
--   FROM (
--     SELECT office_id, COALESCE(MAX(number), 0) AS maior
--       FROM public.service_orders
--      GROUP BY office_id
--   ) sub
--  WHERE s.office_id = sub.office_id
--    AND COALESCE(s.next_service_order_num, 1) <= sub.maior;

-- =============================================================================
-- 3) RPC: reservar próximo número de OS (atômico, por office_id)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.next_service_order_number(p_office_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_max_number INTEGER;
  v_settings_next INTEGER;
  v_candidate INTEGER;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado.';
  END IF;

  IF NOT (
    EXISTS (
      SELECT 1
        FROM public.profiles p
       WHERE p.id = v_uid
         AND p.office_id = p_office_id
         AND COALESCE(p.active, true) = true
    )
    OR public.is_system_admin()
  ) THEN
    RAISE EXCEPTION 'Acesso negado para reservar número de OS nesta oficina.';
  END IF;

  SELECT COALESCE(MAX(so.number), 0)
    INTO v_max_number
    FROM public.service_orders so
   WHERE so.office_id = p_office_id;

  SELECT COALESCE(s.next_service_order_num, 1)
    INTO v_settings_next
    FROM public.settings s
   WHERE s.office_id = p_office_id;

  IF v_settings_next IS NULL THEN
    v_settings_next := 1;
  END IF;

  v_candidate := GREATEST(v_max_number + 1, v_settings_next);

  LOOP
    EXIT WHEN NOT EXISTS (
      SELECT 1
        FROM public.service_orders so
       WHERE so.office_id = p_office_id
         AND so.number = v_candidate
    );
    v_candidate := v_candidate + 1;
  END LOOP;

  UPDATE public.settings
     SET next_service_order_num = v_candidate + 1,
         updated_at = now()
   WHERE office_id = p_office_id;

  IF NOT FOUND THEN
    INSERT INTO public.settings (office_id, next_service_order_num, metadata, created_at, updated_at)
    VALUES (p_office_id, v_candidate + 1, '{}'::jsonb, now(), now());
  END IF;

  RETURN v_candidate;
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_service_order_number(UUID) TO authenticated;

-- =============================================================================
-- 4) RPC: auditoria de numeração (admin sistema ou membro da oficina)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.admin_audit_service_order_numbers(p_office_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_total INTEGER;
  v_max_number INTEGER;
  v_next_settings INTEGER;
  v_next_predicted INTEGER;
  v_duplicados JSONB;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado.';
  END IF;

  IF NOT (
    EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.id = v_uid AND p.office_id = p_office_id AND COALESCE(p.active, true) = true
    )
    OR public.is_system_admin()
  ) THEN
    RAISE EXCEPTION 'Acesso negado.';
  END IF;

  SELECT COUNT(*)::int, COALESCE(MAX(number), 0)
    INTO v_total, v_max_number
    FROM public.service_orders
   WHERE office_id = p_office_id;

  SELECT COALESCE(next_service_order_num, 1)
    INTO v_next_settings
    FROM public.settings
   WHERE office_id = p_office_id;

  v_next_predicted := GREATEST(v_max_number + 1, COALESCE(v_next_settings, 1));

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'number', d.number,
        'quantidade', d.qtd,
        'ids', d.ids
      )
      ORDER BY d.number
    ),
    '[]'::jsonb
  )
  INTO v_duplicados
  FROM (
    SELECT number, COUNT(*)::int AS qtd, jsonb_agg(id ORDER BY created_at) AS ids
      FROM public.service_orders
     WHERE office_id = p_office_id
     GROUP BY number
    HAVING COUNT(*) > 1
  ) d;

  RETURN jsonb_build_object(
    'office_id', p_office_id,
    'total_os', v_total,
    'maior_numero', v_max_number,
    'next_settings', COALESCE(v_next_settings, 1),
    'proximo_previsto', v_next_predicted,
    'duplicados', v_duplicados
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_audit_service_order_numbers(UUID) TO authenticated;
