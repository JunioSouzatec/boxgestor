-- ============================================================
-- RC1: grants seguros para lembretes (corrige 401 Unauthorized)
-- ============================================================
-- TIPO: ADITIVA (não destrutiva)
-- NÃO apaga, TRUNCATE, DELETE ou altera linhas existentes.
--
-- Problema: tabelas regras_lembrete / lembretes / lembretes_historico
-- tinham RLS TO authenticated, mas sem GRANT → PostgREST responde 401.
--
-- ANTES: backup no Dashboard Supabase.
-- ============================================================

ALTER TABLE public.regras_lembrete ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lembretes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lembretes_historico ENABLE ROW LEVEL SECURITY;

-- Grants para usuários logados (faltavam no script docs)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.regras_lembrete TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lembretes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lembretes_historico TO authenticated;

GRANT ALL ON public.regras_lembrete TO service_role;
GRANT ALL ON public.lembretes TO service_role;
GRANT ALL ON public.lembretes_historico TO service_role;

-- Anon não deve acessar (dados por oficina)
REVOKE ALL ON public.regras_lembrete FROM anon;
REVOKE ALL ON public.lembretes FROM anon;
REVOKE ALL ON public.lembretes_historico FROM anon;

-- Policies mínimas por office_id (só se ainda não existirem)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'regras_lembrete'
      AND policyname = 'regras_lembrete_office_access'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'regras_lembrete'
      AND policyname = 'regras_lembrete_select_tenant'
  ) THEN
    CREATE POLICY regras_lembrete_office_access ON public.regras_lembrete
      FOR ALL TO authenticated
      USING (office_id = public.current_office_id())
      WITH CHECK (office_id = public.current_office_id());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'lembretes'
      AND policyname = 'lembretes_office_access'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'lembretes'
      AND policyname = 'lembretes_select_tenant'
  ) THEN
    CREATE POLICY lembretes_office_access ON public.lembretes
      FOR ALL TO authenticated
      USING (office_id = public.current_office_id())
      WITH CHECK (office_id = public.current_office_id());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'lembretes_historico'
      AND policyname = 'lembretes_historico_office_access'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'lembretes_historico'
      AND policyname = 'lembretes_historico_select_tenant'
  ) THEN
    CREATE POLICY lembretes_historico_office_access ON public.lembretes_historico
      FOR ALL TO authenticated
      USING (office_id = public.current_office_id())
      WITH CHECK (office_id = public.current_office_id());
  END IF;
END $$;
