-- =============================================================================
-- Revoga DELETE direto de service_orders para anon/authenticated.
-- Soft delete / cancelamento / CAS continuam via UPDATE nas RPCs.
-- Reset de teste continua via SECURITY DEFINER reset_office_test_data.
-- service_role: grants inalterados.
-- Policy DELETE pode permanecer (GRANT revogado impede DML direto).
-- NÃO altera SELECT, INSERT/UPDATE já revogados, nem RPCs CAS.
-- =============================================================================

REVOKE DELETE ON TABLE public.service_orders FROM anon;
REVOKE DELETE ON TABLE public.service_orders FROM authenticated;
