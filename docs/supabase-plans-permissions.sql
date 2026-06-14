-- =============================================================================
-- Craft Oficina — Planos oficiais (Supabase)
-- =============================================================================
-- NÃO executar automaticamente. Rode manualmente no SQL Editor do Supabase
-- quando quiser persistir o plano da oficina no banco.
--
-- Valores oficiais: trial | essential | professional | premium
-- Legado: free → trial, profissional → professional
-- =============================================================================

ALTER TABLE public.offices
  ADD COLUMN IF NOT EXISTS plan_tier TEXT NOT NULL DEFAULT 'trial';

-- Ajustar CHECK se coluna já existia com valores antigos
ALTER TABLE public.offices DROP CONSTRAINT IF EXISTS offices_plan_tier_check;
ALTER TABLE public.offices
  ADD CONSTRAINT offices_plan_tier_check
  CHECK (plan_tier IN ('trial', 'essential', 'professional', 'premium', 'free', 'profissional'));

COMMENT ON COLUMN public.offices.plan_tier IS
  'Plano comercial: trial (7 dias), essential (R$127), professional (R$247), premium (R$397).';

-- Migrar valores legados
UPDATE public.offices SET plan_tier = 'trial' WHERE plan_tier = 'free';
UPDATE public.offices SET plan_tier = 'professional' WHERE plan_tier = 'profissional';

-- Opcional: restringir só aos valores oficiais
-- ALTER TABLE public.offices DROP CONSTRAINT IF EXISTS offices_plan_tier_check;
-- ALTER TABLE public.offices
--   ADD CONSTRAINT offices_plan_tier_check
--   CHECK (plan_tier IN ('trial', 'essential', 'professional', 'premium'));

ALTER TABLE public.offices
  ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ;

COMMENT ON COLUMN public.offices.trial_started_at IS
  'Início do teste grátis (7 dias) quando plan_tier = trial.';

CREATE INDEX IF NOT EXISTS idx_offices_plan_tier ON public.offices(plan_tier);

CREATE OR REPLACE FUNCTION public.get_office_plan_tier(p_office_id UUID DEFAULT NULL)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT CASE o.plan_tier
        WHEN 'free' THEN 'trial'
        WHEN 'profissional' THEN 'professional'
        ELSE o.plan_tier
      END
      FROM public.offices o
      WHERE o.id = COALESCE(
        p_office_id,
        (SELECT office_id FROM public.profiles WHERE id = auth.uid())
      )
    ),
    'trial'
  );
$$;

CREATE OR REPLACE FUNCTION public.set_office_plan_tier(
  p_office_id UUID,
  p_plan_tier TEXT
)
RETURNS public.offices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role public.profile_role;
  v_plan TEXT;
  v_row public.offices;
BEGIN
  IF p_plan_tier NOT IN ('trial', 'essential', 'professional', 'premium') THEN
    RAISE EXCEPTION 'Plano inválido. Use trial, essential, professional ou premium.';
  END IF;

  SELECT role INTO v_role
  FROM public.profiles
  WHERE id = auth.uid() AND office_id = p_office_id;

  IF v_role IS NULL OR v_role <> 'owner' THEN
    RAISE EXCEPTION 'Apenas o dono da oficina pode alterar o plano.';
  END IF;

  v_plan := p_plan_tier;

  UPDATE public.offices
  SET
    plan_tier = v_plan,
    trial_started_at = CASE
      WHEN v_plan = 'trial' AND trial_started_at IS NULL THEN NOW()
      ELSE trial_started_at
    END,
    updated_at = NOW()
  WHERE id = p_office_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Oficina não encontrada.';
  END IF;

  RETURN v_row;
END;
$$;

-- =============================================================================
-- Tabela de referência — preços oficiais (informativo)
-- =============================================================================
-- trial:        R$   0,00 — 7 dias — 10 OS, 10 clientes, 10 motos, 1 usuário
-- essential:    R$ 127,00/mês — 100 OS/mês, 1 usuário, clientes/motos ilimitados
-- professional: R$ 247,00/mês — mais indicado — 3 usuários, OS ilimitadas
-- premium:      R$ 397,00/mês — usuários ilimitados, recursos avançados
-- =============================================================================
