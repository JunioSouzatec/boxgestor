-- =============================================================================
-- RC2 Aprovação de Orçamento A2.2B — endurecer grants de approval_links
-- =============================================================================
-- Remove DELETE/TRUNCATE herdados de default privileges para authenticated.
-- Não altera RLS/policies, dados, nem outras tabelas.
-- Não revoga service_role.
-- =============================================================================

REVOKE ALL ON TABLE public.approval_links FROM anon;
REVOKE ALL ON TABLE public.approval_links FROM PUBLIC;

REVOKE DELETE, TRUNCATE ON TABLE public.approval_links FROM authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE public.approval_links TO authenticated;

COMMENT ON TABLE public.approval_links IS
  'RC2 A2.1/A2.2B: links públicos de aprovação. token_hash only; authenticated = SELECT/INSERT/UPDATE; sem DELETE/TRUNCATE; anon sem acesso; Edge Function via service_role.';
