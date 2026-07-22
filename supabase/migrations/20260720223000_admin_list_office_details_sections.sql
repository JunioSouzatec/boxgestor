-- ============================================================
-- RC2 Admin: listar seções completas de uma oficina (Ver todos)
-- Clientes, Veículos, OS e Financeiro/Pagamentos
-- ============================================================
-- TIPO: ADITIVA (não destrutiva)
-- NÃO apaga, NÃO altera e NÃO cria linhas em nenhuma tabela.
-- Apenas CREATE OR REPLACE de RPCs SECURITY DEFINER + GRANT/REVOKE.
--
-- Motivo: as abas Clientes/Veículos/OS/Financeiro recebiam apenas a
-- amostra de 15 itens de admin_get_office_details. O RLS de produção
-- bloqueia SELECT cruzado (current_office_id do admin ≠ oficina alvo),
-- então o "Ver todos" precisa de RPC SECURITY DEFINER — mesmo padrão de
-- admin_list_office_inventory.
--
-- Segurança (igual às RPCs admin existentes):
--   - SECURITY DEFINER + SET search_path = public
--   - Bloqueio via public.is_system_admin()
--   - Sempre filtra por p_office_id (sem vazamento entre oficinas)
--   - REVOKE de PUBLIC/anon, GRANT apenas authenticated
-- ============================================================

-- ------------------------------------------------------------
-- 1. Clientes
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_list_office_customers(
  p_office_id UUID,
  p_limit INTEGER DEFAULT 500,
  p_offset INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limite INTEGER := GREATEST(1, LEAST(COALESCE(p_limit, 500), 2000));
  v_offset INTEGER := GREATEST(0, COALESCE(p_offset, 0));
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

  RETURN coalesce((
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
      -- Mesmos filtros/ordem da amostra em admin_get_office_details
      SELECT c.id, c.name, c.phone, c.created_at
      FROM public.customers c
      WHERE c.office_id = p_office_id
      ORDER BY c.created_at DESC
      LIMIT v_limite OFFSET v_offset
    ) c
  ), '[]'::jsonb);
END;
$$;

-- ------------------------------------------------------------
-- 2. Veículos
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_list_office_motorcycles(
  p_office_id UUID,
  p_limit INTEGER DEFAULT 500,
  p_offset INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limite INTEGER := GREATEST(1, LEAST(COALESCE(p_limit, 500), 2000));
  v_offset INTEGER := GREATEST(0, COALESCE(p_offset, 0));
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

  RETURN coalesce((
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
      LIMIT v_limite OFFSET v_offset
    ) x
  ), '[]'::jsonb);
END;
$$;

-- ------------------------------------------------------------
-- 3. Ordens de Serviço
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_list_office_orders(
  p_office_id UUID,
  p_limit INTEGER DEFAULT 500,
  p_offset INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limite INTEGER := GREATEST(1, LEAST(COALESCE(p_limit, 500), 2000));
  v_offset INTEGER := GREATEST(0, COALESCE(p_offset, 0));
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

  RETURN coalesce((
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
      LIMIT v_limite OFFSET v_offset
    ) x
  ), '[]'::jsonb);
END;
$$;

-- ------------------------------------------------------------
-- 4. Financeiro / Pagamentos
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_list_office_payments(
  p_office_id UUID,
  p_limit INTEGER DEFAULT 500,
  p_offset INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limite INTEGER := GREATEST(1, LEAST(COALESCE(p_limit, 500), 2000));
  v_offset INTEGER := GREATEST(0, COALESCE(p_offset, 0));
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

  RETURN coalesce((
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
      LIMIT v_limite OFFSET v_offset
    ) p
  ), '[]'::jsonb);
END;
$$;

-- ------------------------------------------------------------
-- Permissões: bloquear anon/PUBLIC, liberar apenas authenticated
-- (a autorização real é feita por public.is_system_admin() dentro da RPC)
-- ------------------------------------------------------------
REVOKE ALL ON FUNCTION public.admin_list_office_customers(UUID, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_office_motorcycles(UUID, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_office_orders(UUID, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_office_payments(UUID, INTEGER, INTEGER) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.admin_list_office_customers(UUID, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_office_motorcycles(UUID, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_office_orders(UUID, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_office_payments(UUID, INTEGER, INTEGER) TO authenticated;

COMMENT ON FUNCTION public.admin_list_office_customers IS
  'Admin Sistema: lista completa de clientes de uma oficina (Ver todos).';
COMMENT ON FUNCTION public.admin_list_office_motorcycles IS
  'Admin Sistema: lista completa de veículos de uma oficina (Ver todos).';
COMMENT ON FUNCTION public.admin_list_office_orders IS
  'Admin Sistema: lista completa de OS de uma oficina (Ver todos).';
COMMENT ON FUNCTION public.admin_list_office_payments IS
  'Admin Sistema: lista completa de pagamentos de uma oficina (Ver todos).';

NOTIFY pgrst, 'reload schema';
