-- =============================================================================
-- BoxGestor — Comissão: novos tipos (peças, MO+peças) + coluna percentual_pecas
-- Migration ADITIVA e idempotente. NÃO remove dados nem colunas existentes.
--
-- Contexto:
--   • employee_commission_profiles já existe (docs/supabase-financeiro-funcionarios-comissoes.sql).
--   • O app continua funcionando SEM esta migration (percentual_pecas trafega em metadata JSONB).
--   • Esta migration dá paridade no servidor: coluna dedicada + CHECK abrangente.
-- =============================================================================

-- 1) Coluna aditiva para percentual sobre peças (nullable, sem default destrutivo).
ALTER TABLE public.employee_commission_profiles
  ADD COLUMN IF NOT EXISTS percentual_pecas NUMERIC(6, 2);

-- 2) Relaxa o CHECK de tipo_comissao para abranger os novos tipos.
--    Inclui o valor legado 'valor_fixo_por_os' por compatibilidade com bancos antigos.
DO $$
BEGIN
  ALTER TABLE public.employee_commission_profiles
    DROP CONSTRAINT IF EXISTS employee_commission_profiles_tipo_comissao_check;

  ALTER TABLE public.employee_commission_profiles
    ADD CONSTRAINT employee_commission_profiles_tipo_comissao_check
    CHECK (tipo_comissao IN (
      'sem_comissao',
      'percentual_mao_obra',
      'percentual_pecas',
      'percentual_mao_obra_pecas',
      'valor_fixo_os',
      'valor_fixo_por_os'
    ));
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Ajuste de CHECK tipo_comissao ignorado: %', SQLERRM;
END $$;

COMMENT ON COLUMN public.employee_commission_profiles.percentual_pecas IS
  'Percentual sobre peças (0-100). Usado nos tipos percentual_pecas e percentual_mao_obra_pecas.';
