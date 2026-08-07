-- =============================================================================
-- RC2 Fiscal F4B — rascunhos fiscais (preparação, SEM emissão)
-- =============================================================================
-- Salva snapshots de preparação NFC-e/NF-e/NFS-e futura.
-- NÃO cria número fiscal, chave, protocolo, XML autorizado nem DANFE.
-- Idempotente. Soft-delete via deleted_at.

CREATE TABLE IF NOT EXISTS public.fiscal_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id UUID NOT NULL REFERENCES public.offices(id) ON DELETE CASCADE,
  local_id TEXT,
  origin_type TEXT NOT NULL
    CHECK (origin_type IN ('counter_sale', 'service_order')),
  origin_id TEXT NOT NULL,
  origin_label TEXT,
  document_type_suggested TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'with_issues', 'ready_to_prepare')),
  customer_id TEXT,
  customer_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  issuer_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  items_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
  services_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
  payment_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  issues_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
  totals_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

COMMENT ON TABLE public.fiscal_drafts IS
  'RC2 F4B: rascunhos fiscais internos (preparação). Sem emissão, XML, DANFE, número ou chave.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_fiscal_drafts_office_origin_active
  ON public.fiscal_drafts (office_id, origin_type, origin_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_fiscal_drafts_office_updated
  ON public.fiscal_drafts (office_id, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_fiscal_drafts_office_local
  ON public.fiscal_drafts (office_id, local_id)
  WHERE local_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fiscal_drafts_deleted
  ON public.fiscal_drafts (office_id, deleted_at);

DROP TRIGGER IF EXISTS trg_fiscal_drafts_updated_at ON public.fiscal_drafts;
CREATE TRIGGER trg_fiscal_drafts_updated_at
  BEFORE UPDATE ON public.fiscal_drafts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.fiscal_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fiscal_drafts_select" ON public.fiscal_drafts;
DROP POLICY IF EXISTS "fiscal_drafts_insert" ON public.fiscal_drafts;
DROP POLICY IF EXISTS "fiscal_drafts_update" ON public.fiscal_drafts;
DROP POLICY IF EXISTS "fiscal_drafts_delete" ON public.fiscal_drafts;

-- Somente dono (owner) + admin sistema — alinhado a notas_fiscais / counter_sales
CREATE POLICY "fiscal_drafts_select" ON public.fiscal_drafts
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_system_admin())
    OR (
      office_id = public.current_office_id()
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.office_id = fiscal_drafts.office_id
          AND p.role = 'owner'
          AND COALESCE(p.active, TRUE) = TRUE
      )
    )
  );

CREATE POLICY "fiscal_drafts_insert" ON public.fiscal_drafts
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_system_admin())
    OR (
      office_id = public.current_office_id()
      AND public.current_office_id() IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.office_id = fiscal_drafts.office_id
          AND p.role = 'owner'
          AND COALESCE(p.active, TRUE) = TRUE
      )
    )
  );

CREATE POLICY "fiscal_drafts_update" ON public.fiscal_drafts
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.is_system_admin())
    OR (
      office_id = public.current_office_id()
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.office_id = fiscal_drafts.office_id
          AND p.role = 'owner'
          AND COALESCE(p.active, TRUE) = TRUE
      )
    )
  )
  WITH CHECK (
    (SELECT public.is_system_admin())
    OR (
      office_id = public.current_office_id()
      AND public.current_office_id() IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.office_id = fiscal_drafts.office_id
          AND p.role = 'owner'
          AND COALESCE(p.active, TRUE) = TRUE
      )
    )
  );

CREATE POLICY "fiscal_drafts_delete" ON public.fiscal_drafts
  FOR DELETE TO authenticated
  USING ((SELECT public.is_system_admin()));

GRANT SELECT, INSERT, UPDATE ON public.fiscal_drafts TO authenticated;

-- Realtime multi-dispositivo (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'fiscal_drafts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.fiscal_drafts;
  END IF;
END $$;
