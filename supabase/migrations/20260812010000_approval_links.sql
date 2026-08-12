-- =============================================================================
-- RC2 Aprovação de Orçamento A2.1 — approval_links (token hash, SEM aplicar ainda)
-- =============================================================================
-- OBJETIVO:
--   Base segura para link público de aprovação sem abrir service_orders ao anon.
--
-- SEGURANÇA:
--   - NÃO armazena token bruto (somente token_hash).
--   - token_hash é imutável após INSERT (trigger approval_links_forbid_token_hash_change).
--   - NÃO cria policy anon em approval_links / service_orders / customers / motorcycles.
--   - Acesso público deve ser via Edge Function com service_role (bypass RLS).
--   - Authenticated só vê/cria/revoga links da própria oficina.
--
-- APLICAR:
--   Somente após autorização explícita. NÃO rodar supabase db push nesta fase A2.1.
--
-- ROLLBACK MANUAL (se aplicada por engano):
--   DROP TABLE IF EXISTS public.approval_links CASCADE;
--   (não há alteração em service_orders / RLS de outras tabelas)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.approval_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id UUID NOT NULL REFERENCES public.offices(id) ON DELETE CASCADE,
  service_order_id UUID NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'expired', 'revoked')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  response_name TEXT,
  response_note TEXT,
  response_ip TEXT,
  response_user_agent TEXT,
  last_accessed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT approval_links_token_hash_unique UNIQUE (token_hash)
);

COMMENT ON TABLE public.approval_links IS
  'RC2 A2.1: links públicos de aprovação de orçamento. Guarda apenas token_hash; acesso anon só via Edge Function service_role.';

COMMENT ON COLUMN public.approval_links.token_hash IS
  'SHA-256 hex do token bruto. Token bruto nunca é persistido.';

COMMENT ON COLUMN public.approval_links.metadata IS
  'Metadados leves (ex.: validity_days, os_number). Sem dados financeiros internos/PIN/fiscal.';

CREATE INDEX IF NOT EXISTS idx_approval_links_office_created
  ON public.approval_links (office_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_approval_links_office_os
  ON public.approval_links (office_id, service_order_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_approval_links_status_expires
  ON public.approval_links (status, expires_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_approval_links_token_hash
  ON public.approval_links (token_hash);

DROP TRIGGER IF EXISTS trg_approval_links_updated_at ON public.approval_links;
CREATE TRIGGER trg_approval_links_updated_at
  BEFORE UPDATE ON public.approval_links
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- token_hash imutável após INSERT (bloqueia authenticated e service_role).
CREATE OR REPLACE FUNCTION public.approval_links_forbid_token_hash_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.token_hash IS DISTINCT FROM OLD.token_hash THEN
    RAISE EXCEPTION 'approval_links.token_hash is immutable after insert';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_approval_links_token_hash_immutable ON public.approval_links;
CREATE TRIGGER trg_approval_links_token_hash_immutable
  BEFORE UPDATE ON public.approval_links
  FOR EACH ROW
  EXECUTE FUNCTION public.approval_links_forbid_token_hash_change();

COMMENT ON FUNCTION public.approval_links_forbid_token_hash_change() IS
  'RC2 A2.1B: impede UPDATE de token_hash em approval_links (hash só na criação).';

ALTER TABLE public.approval_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "approval_links_select_tenant" ON public.approval_links;
DROP POLICY IF EXISTS "approval_links_insert_tenant" ON public.approval_links;
DROP POLICY IF EXISTS "approval_links_update_tenant" ON public.approval_links;
DROP POLICY IF EXISTS "approval_links_delete_tenant" ON public.approval_links;

-- SELECT: staff da própria oficina (ou admin sistema)
CREATE POLICY "approval_links_select_tenant" ON public.approval_links
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_system_admin())
    OR (
      office_id = public.current_office_id()
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.office_id = approval_links.office_id
          AND COALESCE(p.active, TRUE) = TRUE
      )
    )
  );

-- INSERT: staff da própria oficina; OS precisa ser da mesma oficina
CREATE POLICY "approval_links_insert_tenant" ON public.approval_links
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_system_admin())
    OR (
      office_id = public.current_office_id()
      AND public.current_office_id() IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.office_id = approval_links.office_id
          AND COALESCE(p.active, TRUE) = TRUE
      )
      AND EXISTS (
        SELECT 1 FROM public.service_orders so
        WHERE so.id = approval_links.service_order_id
          AND so.office_id = approval_links.office_id
      )
    )
  );

-- UPDATE: revogar / marcar enviado — mesma oficina (não permite alterar token_hash via app sem service_role)
CREATE POLICY "approval_links_update_tenant" ON public.approval_links
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.is_system_admin())
    OR (
      office_id = public.current_office_id()
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.office_id = approval_links.office_id
          AND COALESCE(p.active, TRUE) = TRUE
      )
    )
  )
  WITH CHECK (
    (SELECT public.is_system_admin())
    OR (
      office_id = public.current_office_id()
      AND public.current_office_id() IS NOT NULL
    )
  );

-- Sem DELETE para authenticated (usar status = revoked)
-- Sem policy anon — acesso público somente via Edge Function + service_role

REVOKE ALL ON TABLE public.approval_links FROM PUBLIC;
REVOKE ALL ON TABLE public.approval_links FROM anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.approval_links TO authenticated;
-- service_role já tem bypass RLS no Supabase; não conceder grants extras a anon.

-- NÃO adicionar à publication realtime por padrão (evita vazamento de metadados de link).
