-- RC2 Segurança A1 — Hardening grants EXECUTE das RPCs admin / admin_support
-- Somente grants. NÃO altera tabelas, dados, RLS, policies, Edge, Portal.
--
-- Objetivo:
--   REVOKE EXECUTE FROM anon, PUBLIC
--   GRANT  EXECUTE TO authenticated
-- em todas as funções public.admin_% (inclui admin_support_*).
--
-- Fora do escopo:
--   is_system_admin, approval-link Edges, funções de portal/cliente.

DO $$
DECLARE
  fn record;
  fq text;
BEGIN
  FOR fn IN
    SELECT
      n.nspname AS schema_name,
      p.proname AS function_name,
      pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname LIKE 'admin_%'
    ORDER BY p.proname, 3
  LOOP
    fq := format(
      '%I.%I(%s)',
      fn.schema_name,
      fn.function_name,
      fn.args
    );

    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', fq);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', fq);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fq);
  END LOOP;
END $$;
