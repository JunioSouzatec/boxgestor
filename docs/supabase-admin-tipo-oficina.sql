-- BoxGestor — Admin: tipo de oficina (settings.metadata.tipo_oficina)
-- Execute APÓS docs/supabase-admin-system.sql
-- NÃO executar automaticamente.
--
-- Permite ao Admin Sistema definir tipo_oficina mesmo quando a oficina
-- ainda não possui linha em public.settings (cria automaticamente).

-- =============================================================================
-- RPC: ler tipo_oficina (somente Admin Sistema)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.admin_get_office_tipo_oficina(p_office_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tipo TEXT;
BEGIN
  IF NOT public.is_system_admin() THEN
    RAISE EXCEPTION 'Acesso negado. Apenas Administrador do Sistema.';
  END IF;

  SELECT nullif(trim(s.metadata->>'tipo_oficina'), '')
    INTO v_tipo
  FROM public.settings s
  WHERE s.office_id = p_office_id;

  IF v_tipo IN ('motos', 'carros', 'mista') THEN
    RETURN v_tipo;
  END IF;

  RETURN 'motos';
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_office_tipo_oficina(UUID) TO authenticated;

-- =============================================================================
-- RPC: salvar tipo_oficina (upsert settings se necessário)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.admin_set_office_tipo_oficina(
  p_office_id UUID,
  p_tipo TEXT
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
BEGIN
  IF NOT public.is_system_admin() THEN
    RAISE EXCEPTION 'Acesso negado. Apenas Administrador do Sistema.';
  END IF;

  IF p_tipo NOT IN ('motos', 'carros', 'mista') THEN
    RAISE EXCEPTION 'Tipo de oficina inválido: %', p_tipo;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.offices o WHERE o.id = p_office_id) THEN
    RAISE EXCEPTION 'Oficina não encontrada: %', p_office_id;
  END IF;

  SELECT * INTO v_settings
  FROM public.settings s
  WHERE s.office_id = p_office_id;

  v_meta := coalesce(v_settings.metadata, '{}'::jsonb);
  v_meta := v_meta || jsonb_build_object(
    'tipo_oficina', p_tipo,
    'tipo_oficina_atualizado_em', now()::text,
    'tipo_oficina_atualizado_por', v_email
  );

  IF v_settings.id IS NULL THEN
    INSERT INTO public.settings (
      office_id,
      dark_theme,
      notifications,
      low_stock_alert,
      next_service_order_num,
      metadata,
      created_at,
      updated_at
    )
    VALUES (
      p_office_id,
      TRUE,
      TRUE,
      TRUE,
      1001,
      v_meta,
      now(),
      now()
    );
  ELSE
    UPDATE public.settings
    SET
      metadata = v_meta,
      updated_at = now()
    WHERE office_id = p_office_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'office_id', p_office_id,
    'tipo_oficina', p_tipo,
    'criou_settings', (v_settings.id IS NULL)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_office_tipo_oficina(UUID, TEXT) TO authenticated;
