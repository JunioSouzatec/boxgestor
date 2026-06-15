# BoxGestor — Admin: detalhes da oficina (RPC segura)
# Execute APÓS docs/supabase-admin-system.sql
# NÃO executar automaticamente.

-- Coluna opcional (também em supabase-performance-admin-maintenance.sql)
ALTER TABLE public.offices
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- =============================================================================
-- RPC: detalhes resumidos de uma oficina (somente Admin Sistema)
-- Bypassa RLS via SECURITY DEFINER — amostras limitadas + totais
-- =============================================================================

CREATE OR REPLACE FUNCTION public.admin_get_office_details(p_office_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limite INT := 15;
  v_office public.offices%ROWTYPE;
  v_meta JSONB := '{}'::jsonb;
  v_owner RECORD;
BEGIN
  IF NOT public.is_system_admin() THEN
    RAISE EXCEPTION 'Acesso negado. Apenas Administrador do Sistema.';
  END IF;

  SELECT * INTO v_office FROM public.offices WHERE id = p_office_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Oficina não encontrada.';
  END IF;

  SELECT coalesce(s.metadata, '{}'::jsonb) INTO v_meta
  FROM public.settings s
  WHERE s.office_id = p_office_id;

  SELECT pr.full_name, pr.email INTO v_owner
  FROM public.profiles pr
  WHERE pr.office_id = p_office_id AND pr.role = 'owner'
  ORDER BY pr.created_at ASC
  LIMIT 1;

  RETURN jsonb_build_object(
    'office', jsonb_build_object(
      'office_id', v_office.id,
      'nome', v_office.name,
      'nome_fantasia', nullif(trim(v_meta->>'nome_fantasia'), ''),
      'telefone', nullif(trim(v_office.phone), ''),
      'email', nullif(trim(v_office.email), ''),
      'endereco', nullif(trim(v_office.address), ''),
      'cidade', nullif(trim(coalesce(v_meta->'endereco'->>'cidade', v_meta->>'cidade')), ''),
      'estado', nullif(trim(coalesce(v_meta->'endereco'->>'estado', v_meta->>'estado')), ''),
      'plan_tier', v_office.plan_tier,
      'trial_inicio', v_office.trial_started_at,
      'trial_fim', v_office.trial_ends_at,
      'criado_em', v_office.created_at,
      'arquivada_em', v_office.archived_at,
      'responsavel_nome', v_owner.full_name,
      'responsavel_email', v_owner.email
    ),
    'usuarios', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'nome', p.full_name,
          'email', coalesce(p.email, ''),
          'papel', p.role::text,
          'ativo', coalesce(p.active, true),
          'criado_em', p.created_at
        )
        ORDER BY p.created_at
      )
      FROM public.profiles p
      WHERE p.office_id = p_office_id
    ), '[]'::jsonb),
    'totais', jsonb_build_object(
      'clientes', (SELECT count(*)::int FROM public.customers c WHERE c.office_id = p_office_id),
      'motos', (SELECT count(*)::int FROM public.motorcycles m WHERE m.office_id = p_office_id),
      'ordens', (SELECT count(*)::int FROM public.service_orders so WHERE so.office_id = p_office_id),
      'pagamentos', (SELECT count(*)::int FROM public.service_order_payments pay WHERE pay.office_id = p_office_id),
      'receita_paga', coalesce((
        SELECT sum(pay.amount)::numeric
        FROM public.service_order_payments pay
        WHERE pay.office_id = p_office_id
      ), 0),
      'pecas', (SELECT count(*)::int FROM public.inventory_items ii WHERE ii.office_id = p_office_id)
    ),
    'clientes', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'nome', c.name,
          'telefone', c.phone,
          'criado_em', c.created_at
        )
        ORDER BY c.created_at DESC
      )
      FROM (
        SELECT c.id, c.name, c.phone, c.created_at
        FROM public.customers c
        WHERE c.office_id = p_office_id
        ORDER BY c.created_at DESC
        LIMIT v_limite
      ) c
    ), '[]'::jsonb),
    'motos', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', x.id,
          'marca', x.brand,
          'modelo', x.model,
          'placa', x.plate,
          'cliente_nome', x.customer_name,
          'criado_em', x.created_at
        )
        ORDER BY x.created_at DESC
      )
      FROM (
        SELECT
          m.id,
          m.brand,
          m.model,
          m.plate,
          m.created_at,
          c.name AS customer_name
        FROM public.motorcycles m
        JOIN public.customers c ON c.id = m.customer_id
        WHERE m.office_id = p_office_id
        ORDER BY m.created_at DESC
        LIMIT v_limite
      ) x
    ), '[]'::jsonb),
    'ordens', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', x.id,
          'numero', x.number,
          'status', x.status::text,
          'total', x.total_value,
          'cliente_nome', x.customer_name,
          'moto_label', x.moto_label,
          'moto_placa', x.moto_placa,
          'criado_em', x.created_at
        )
        ORDER BY x.number DESC
      )
      FROM (
        SELECT
          so.id,
          so.number,
          so.status,
          so.total_value,
          so.created_at,
          cu.name AS customer_name,
          trim(both from concat_ws(' ', m.brand, m.model)) AS moto_label,
          m.plate AS moto_placa
        FROM public.service_orders so
        JOIN public.customers cu ON cu.id = so.customer_id
        JOIN public.motorcycles m ON m.id = so.motorcycle_id
        WHERE so.office_id = p_office_id
        ORDER BY so.number DESC
        LIMIT v_limite
      ) x
    ), '[]'::jsonb),
    'pagamentos', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'valor', p.amount,
          'forma', p.payment_method::text,
          'data', p.payment_date
        )
        ORDER BY p.payment_date DESC
      )
      FROM (
        SELECT p.id, p.amount, p.payment_method, p.payment_date
        FROM public.service_order_payments p
        WHERE p.office_id = p_office_id
        ORDER BY p.payment_date DESC
        LIMIT v_limite
      ) p
    ), '[]'::jsonb),
    'estoque', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', i.id,
          'nome', i.name,
          'quantidade', i.quantity,
          'estoque_minimo', i.minimum_stock,
          'valor', i.sale_price
        )
        ORDER BY i.name
      )
      FROM (
        SELECT i.id, i.name, i.quantity, i.minimum_stock, i.sale_price
        FROM public.inventory_items i
        WHERE i.office_id = p_office_id
        ORDER BY i.name
        LIMIT v_limite
      ) i
    ), '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_office_details(UUID) TO authenticated;

COMMENT ON FUNCTION public.admin_get_office_details IS
  'Admin Sistema: detalhes resumidos de uma oficina (amostra 15 itens + totais).';
