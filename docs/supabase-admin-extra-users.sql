-- BoxGestor — Admin: usuários extras (settings.metadata.extra_users_count)
-- Execute APÓS docs/supabase-admin-system.sql
-- NÃO executar automaticamente.
--
-- Permite ao Admin Sistema definir extra_users_count mesmo quando a oficina
-- ainda não possui linha em public.settings (cria automaticamente).

-- =============================================================================
-- RPC: ler extra_users_count (somente Admin Sistema)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.admin_get_office_extra_users_count(p_office_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  IF NOT public.is_system_admin() THEN
    RAISE EXCEPTION 'Acesso negado. Apenas Administrador do Sistema.';
  END IF;

  SELECT coalesce((s.metadata->>'extra_users_count')::INTEGER, 0)
    INTO v_count
  FROM public.settings s
  WHERE s.office_id = p_office_id;

  IF v_count IS NULL OR v_count < 0 THEN
    RETURN 0;
  END IF;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_office_extra_users_count(UUID) TO authenticated;

-- =============================================================================
-- RPC: salvar extra_users_count (upsert settings se necessário)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.admin_set_office_extra_users_count(
  p_office_id UUID,
  p_count INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings public.settings%ROWTYPE;
  v_meta JSONB;
  v_email TEXT := coalesce(auth.jwt() ->> 'email', 'admin');
  v_count INTEGER := greatest(coalesce(p_count, 0), 0);
  v_criou BOOLEAN := false;
BEGIN
  IF NOT public.is_system_admin() THEN
    RAISE EXCEPTION 'Acesso negado. Apenas Administrador do Sistema.';
  END IF;

  SELECT * INTO v_settings
  FROM public.settings
  WHERE office_id = p_office_id
  FOR UPDATE;

  IF NOT FOUND THEN
  INSERT INTO public.settings (
    office_id,
    dark_theme,
    notifications,
    low_stock_alert,
    next_service_order_num,
    metadata,
    created_at,
    updated_at
  ) VALUES (
    p_office_id,
    true,
    true,
    true,
    1001,
    jsonb_build_object(
      'extra_users_count', v_count,
      'extra_users_atualizado_em', now(),
      'extra_users_atualizado_por', v_email
    ),
    now(),
    now()
  )
  RETURNING * INTO v_settings;

    v_criou := true;
  ELSE
    v_meta := coalesce(v_settings.metadata, '{}'::jsonb);
    v_meta := v_meta || jsonb_build_object(
      'extra_users_count', v_count,
      'extra_users_atualizado_em', now(),
      'extra_users_atualizado_por', v_email
    );

    UPDATE public.settings
    SET metadata = v_meta,
        updated_at = now()
    WHERE id = v_settings.id
    RETURNING * INTO v_settings;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'extra_users_count', v_count,
    'criou_settings', v_criou
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_office_extra_users_count(UUID, INTEGER) TO authenticated;
