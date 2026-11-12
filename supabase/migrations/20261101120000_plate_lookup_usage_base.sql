-- =============================================================================
-- Consulta por placa — controle de consumo por oficina (Etapa 3B + 3C + 3E)
-- =============================================================================
--
-- pgcrypto / digest (Etapa 3E):
--   Supabase hospeda pgcrypto no schema extensions (padrão da plataforma).
--   Antes do apply em Homolog, confirmar SOMENTE LEITURA:
--     SELECT e.extname, n.nspname
--     FROM pg_extension e
--     JOIN pg_namespace n ON n.oid = e.extnamespace
--     WHERE e.extname = 'pgcrypto';
--   Se nspname <> 'extensions', ajustar plate_lookup_plate_hash para o schema real
--   (ex.: public.digest) antes de aplicar. Não alterar extensões nesta etapa.
--
-- Ordem de locks (Etapa 3E — evitar deadlock com finalize/reconcile):
--   1) plate_lookup_events (ORDER BY id; SKIP LOCKED em release_stale)
--   2) plate_lookup_cycle_usage (office_id + cycle_key)
--   offices FOR UPDATE em begin permanece antes de release_stale (serializa cadastro).
--
-- Drift de migrations (Homolog — Etapa 3D, NÃO reparar automaticamente):
--   Existem no remoto sem arquivo local: 20260905010000, 20260913150000,
--   20260917213000, 20260920220000. Planejar apply isolado desta migration;
--   não executar db push/repair/reset/link sem alinhamento operacional explícito.
--
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
-- Tabelas: plate_lookup_cycle_usage, plate_lookup_overage_consent, plate_lookup_events
-- RPCs authenticated: get_quota, accept_overage_consent, begin
-- RPCs service_role ONLY: mark_api_started, finalize_event, reconcile_event
--
-- Incerteza operacional (P2): mark_api_started indica intenção de chamar a API antes
-- do HTTP; não prova que o fornecedor recebeu ou cobrou a requisição. Eventos
-- api_called=TRUE sem finalize dentro do prazo passam a reconciliation_pending
-- (libera reserva, sem consumo automático) até reconcile_event idempotente.
--
-- NÃO executar automaticamente. Aplicar manualmente no Supabase Homolog quando autorizado.
-- Sem cache de resposta, sem cron, sem faturamento.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Tabelas
-- -----------------------------------------------------------------------------

CREATE TABLE public.plate_lookup_cycle_usage (
  office_id               UUID NOT NULL REFERENCES public.offices (id) ON DELETE CASCADE,
  cycle_key               TEXT NOT NULL,
  plan_tier_snapshot      TEXT NOT NULL,
  included_limit          INTEGER NOT NULL CHECK (included_limit >= 0),
  used_included           INTEGER NOT NULL DEFAULT 0 CHECK (used_included >= 0),
  used_overage            INTEGER NOT NULL DEFAULT 0 CHECK (used_overage >= 0),
  reserved_included       INTEGER NOT NULL DEFAULT 0 CHECK (reserved_included >= 0),
  reserved_overage        INTEGER NOT NULL DEFAULT 0 CHECK (reserved_overage >= 0),
  overage_amount_cents    INTEGER NOT NULL DEFAULT 0 CHECK (overage_amount_cents >= 0),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (office_id, cycle_key),
  CONSTRAINT plate_lookup_cycle_usage_counts_chk CHECK (
    used_included + reserved_included <= included_limit
  )
);

CREATE INDEX idx_plate_lookup_cycle_usage_office_updated
  ON public.plate_lookup_cycle_usage (office_id, updated_at DESC);

COMMENT ON TABLE public.plate_lookup_cycle_usage IS
  'Agregado de consumo de consulta por placa por oficina e ciclo (trial ou mês civil America/Sao_Paulo). included_limit é o teto do ciclo (não reduz em downgrade até novo ciclo).';

CREATE TABLE public.plate_lookup_overage_consent (
  office_id       UUID NOT NULL REFERENCES public.offices (id) ON DELETE CASCADE,
  cycle_key       TEXT NOT NULL,
  accepted_by     UUID NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  accepted_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  terms_version   TEXT NOT NULL CHECK (char_length(trim(terms_version)) > 0),
  PRIMARY KEY (office_id, cycle_key)
);

CREATE INDEX idx_plate_lookup_overage_consent_office
  ON public.plate_lookup_overage_consent (office_id, accepted_at DESC);

COMMENT ON TABLE public.plate_lookup_overage_consent IS
  'Aceite explícito de cobrança de consultas excedentes por ciclo (planos pagos). Trial não usa excedente.';

CREATE TABLE public.plate_lookup_events (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id               UUID NOT NULL REFERENCES public.offices (id) ON DELETE CASCADE,
  user_id                 UUID NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  cycle_key               TEXT NOT NULL,
  idempotency_key         TEXT NOT NULL,
  plate_hash              TEXT NOT NULL CHECK (char_length(plate_hash) = 64),
  status                  TEXT NOT NULL DEFAULT 'reserved'
    CHECK (status IN (
      'reserved',
      'finalized',
      'expired_released',
      'cancelled',
      'reconciliation_pending'
    )),
  reserve_bucket          TEXT NOT NULL
    CHECK (reserve_bucket IN ('included', 'overage', 'none')),
  billing_kind            TEXT
    CHECK (billing_kind IS NULL OR billing_kind IN (
      'included',
      'overage',
      'none',
      'ambiguous',
      'pending_reconciliation',
      'administrative_pending'
    )),
  api_called              BOOLEAN NOT NULL DEFAULT FALSE,
  api_started_at          TIMESTAMPTZ,
  api_provider_request_id TEXT,
  result_code             TEXT,
  outcome                 TEXT
    CHECK (outcome IS NULL OR outcome IN (
      'success',
      'not_found',
      'api_error',
      'invalid',
      'ambiguous',
      'timeout',
      'cancelled',
      'expired'
    )),
  result_payload          JSONB,
  reserved_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reservation_expires_at  TIMESTAMPTZ NOT NULL,
  finalized_at            TIMESTAMPTZ,
  reconciled_at           TIMESTAMPTZ,
  reconciliation_note     TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT plate_lookup_events_idempotency UNIQUE (office_id, idempotency_key),
  CONSTRAINT plate_lookup_events_api_started_chk CHECK (
    api_called = FALSE OR api_started_at IS NOT NULL
  )
);

CREATE INDEX idx_plate_lookup_events_office_cycle_status
  ON public.plate_lookup_events (office_id, cycle_key, status);

CREATE INDEX idx_plate_lookup_events_office_user_created
  ON public.plate_lookup_events (office_id, user_id, created_at DESC);

CREATE INDEX idx_plate_lookup_events_reserved_expires
  ON public.plate_lookup_events (reservation_expires_at)
  WHERE status = 'reserved' AND api_called = FALSE;

CREATE INDEX idx_plate_lookup_events_api_started_stale
  ON public.plate_lookup_events (api_started_at)
  WHERE status = 'reserved' AND api_called = TRUE;

COMMENT ON TABLE public.plate_lookup_events IS
  'Eventos/reservas de consulta por placa. Armazena plate_hash (SHA-256), nunca placa em claro.';

COMMENT ON COLUMN public.plate_lookup_events.result_payload IS
  'Snapshot JSON mapeado (marca/modelo/ano…) para replay idempotente sem nova chamada à API.';

COMMENT ON COLUMN public.plate_lookup_events.api_started_at IS
  'Momento em que o backend marcou início da chamada externa (antes do fetch). Não prova cobrança pelo fornecedor.';

-- -----------------------------------------------------------------------------
-- 2) updated_at triggers
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.plate_lookup_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_plate_lookup_cycle_usage_updated_at
  BEFORE UPDATE ON public.plate_lookup_cycle_usage
  FOR EACH ROW EXECUTE FUNCTION public.plate_lookup_touch_updated_at();

CREATE TRIGGER trg_plate_lookup_events_updated_at
  BEFORE UPDATE ON public.plate_lookup_events
  FOR EACH ROW EXECUTE FUNCTION public.plate_lookup_touch_updated_at();

-- -----------------------------------------------------------------------------
-- 3) RLS — deny direct access; mutações só via RPC SECURITY DEFINER / service_role
-- -----------------------------------------------------------------------------

ALTER TABLE public.plate_lookup_cycle_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plate_lookup_overage_consent ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plate_lookup_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.plate_lookup_cycle_usage FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.plate_lookup_overage_consent FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.plate_lookup_events FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE public.plate_lookup_cycle_usage TO service_role;
GRANT ALL ON TABLE public.plate_lookup_overage_consent TO service_role;
GRANT ALL ON TABLE public.plate_lookup_events TO service_role;

-- -----------------------------------------------------------------------------
-- 4) Helpers internos (sem GRANT EXECUTE a authenticated/anon)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.plate_lookup_jwt_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  );
$$;

CREATE OR REPLACE FUNCTION public.plate_lookup_assert_service_role()
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF public.plate_lookup_jwt_role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'plate_lookup: service_role required' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.plate_lookup_normalize_plate(p_placa TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT upper(regexp_replace(trim(coalesce(p_placa, '')), '[\s-]', '', 'g'));
$$;

CREATE OR REPLACE FUNCTION public.plate_lookup_plate_hash(p_placa TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions
AS $$
  SELECT encode(
    extensions.digest(public.plate_lookup_normalize_plate(p_placa), 'sha256'),
    'hex'
  );
$$;

CREATE OR REPLACE FUNCTION public.plate_lookup_plate_valid(p_placa TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    length(public.plate_lookup_normalize_plate(p_placa)) = 7
    AND (
      public.plate_lookup_normalize_plate(p_placa) ~ '^[A-Z]{3}[0-9]{4}$'
      OR public.plate_lookup_normalize_plate(p_placa) ~ '^[A-Z]{3}[0-9][A-Z][0-9]{2}$'
    );
$$;

CREATE OR REPLACE FUNCTION public.plate_lookup_normalize_plan_tier(p_plan TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE lower(trim(coalesce(p_plan, '')))
    WHEN 'free' THEN 'trial'
    WHEN 'profissional' THEN 'professional'
    WHEN 'trial' THEN 'trial'
    WHEN 'essential' THEN 'essential'
    WHEN 'professional' THEN 'professional'
    WHEN 'premium' THEN 'premium'
    ELSE 'trial'
  END;
$$;

CREATE OR REPLACE FUNCTION public.plate_lookup_trial_active(p_plan_tier TEXT, p_trial_ends_at TIMESTAMPTZ)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    public.plate_lookup_normalize_plan_tier(p_plan_tier) = 'trial'
    AND p_trial_ends_at IS NOT NULL
    AND p_trial_ends_at > NOW();
$$;

CREATE OR REPLACE FUNCTION public.plate_lookup_cycle_key(
  p_plan_tier TEXT,
  p_trial_ends_at TIMESTAMPTZ,
  p_office_id UUID
)
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN public.plate_lookup_trial_active(p_plan_tier, p_trial_ends_at) THEN
      'trial:' || p_office_id::text
    ELSE
      to_char(timezone('America/Sao_Paulo', NOW()), 'YYYY-MM')
  END;
$$;

CREATE OR REPLACE FUNCTION public.plate_lookup_included_limit(p_plan_tier TEXT, p_trial_active BOOLEAN)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_trial_active THEN 20
    WHEN public.plate_lookup_normalize_plan_tier(p_plan_tier) = 'essential' THEN 50
    WHEN public.plate_lookup_normalize_plan_tier(p_plan_tier) = 'professional' THEN 150
    WHEN public.plate_lookup_normalize_plan_tier(p_plan_tier) = 'premium' THEN 500
    ELSE 0
  END;
$$;

-- Limite efetivo do ciclo: nunca abaixo do já concedido (downgrade); sobe em upgrade (P3/P4).
CREATE OR REPLACE FUNCTION public.plate_lookup_effective_included_limit(
  p_stored_limit INTEGER,
  p_current_plan_limit INTEGER
)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT GREATEST(coalesce(p_stored_limit, 0), coalesce(p_current_plan_limit, 0));
$$;

CREATE OR REPLACE FUNCTION public.plate_lookup_get_caller_profile()
RETURNS TABLE (
  user_id UUID,
  office_id UUID,
  role public.profile_role,
  active BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;

  RETURN QUERY
  SELECT p.id, p.office_id, p.role, coalesce(p.active, TRUE)
  FROM public.profiles p
  WHERE p.id = auth.uid()
  LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.plate_lookup_lock_cycle_usage(
  p_office_id UUID,
  p_cycle_key TEXT
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  PERFORM 1
  FROM public.plate_lookup_cycle_usage u
  WHERE u.office_id = p_office_id AND u.cycle_key = p_cycle_key
  FOR UPDATE;
END;
$$;

CREATE OR REPLACE FUNCTION public.plate_lookup_release_event_reservation(
  p_office_id UUID,
  p_cycle_key TEXT,
  p_reserve_bucket TEXT
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF p_reserve_bucket NOT IN ('included', 'overage') THEN
    RETURN;
  END IF;

  PERFORM public.plate_lookup_lock_cycle_usage(p_office_id, p_cycle_key);

  IF p_reserve_bucket = 'included' THEN
    UPDATE public.plate_lookup_cycle_usage u
    SET
      reserved_included = greatest(0, u.reserved_included - 1),
      updated_at = NOW()
    WHERE u.office_id = p_office_id AND u.cycle_key = p_cycle_key;
  ELSE
    UPDATE public.plate_lookup_cycle_usage u
    SET
      reserved_overage = greatest(0, u.reserved_overage - 1),
      updated_at = NOW()
    WHERE u.office_id = p_office_id AND u.cycle_key = p_cycle_key;
  END IF;
END;
$$;

-- Consumo incluído: só incrementa se used_included + reserved_included < included_limit (CHECK-safe).
-- Exige linha de cycle_usage já bloqueada (FOR UPDATE) pelo caller.
CREATE OR REPLACE FUNCTION public.plate_lookup_consume_included_if_available(
  p_office_id UUID,
  p_cycle_key TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_updated INT;
BEGIN
  UPDATE public.plate_lookup_cycle_usage u
  SET
    used_included = u.used_included + 1,
    updated_at = NOW()
  WHERE u.office_id = p_office_id
    AND u.cycle_key = p_cycle_key
    AND u.used_included + u.reserved_included < u.included_limit;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

-- Excedente: só com consentimento do ciclo; nunca converte incluído automaticamente.
CREATE OR REPLACE FUNCTION public.plate_lookup_consume_overage_if_allowed(
  p_office_id UUID,
  p_cycle_key TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_consent BOOLEAN;
  v_updated INT;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.plate_lookup_overage_consent c
    WHERE c.office_id = p_office_id AND c.cycle_key = p_cycle_key
  ) INTO v_consent;

  IF NOT v_consent THEN
    RETURN FALSE;
  END IF;

  UPDATE public.plate_lookup_cycle_usage u
  SET
    used_overage = u.used_overage + 1,
    overage_amount_cents = u.overage_amount_cents + 10,
    updated_at = NOW()
  WHERE u.office_id = p_office_id AND u.cycle_key = p_cycle_key;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.plate_lookup_release_stale_reservations(p_office_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
BEGIN
  -- Reservas não iniciadas (api_called=FALSE) expiradas pelo TTL curto (3 min).
  -- Locks: evento → cycle_usage (mesma ordem que finalize_event / reconcile_event).
  FOR r IN
    SELECT e.id, e.cycle_key, e.reserve_bucket
    FROM public.plate_lookup_events e
    WHERE e.office_id = p_office_id
      AND e.status = 'reserved'
      AND e.api_called = FALSE
      AND e.reservation_expires_at < NOW()
    ORDER BY e.id
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.plate_lookup_events e
    SET
      status = 'expired_released',
      outcome = 'expired',
      billing_kind = 'none',
      finalized_at = NOW(),
      updated_at = NOW()
    WHERE e.id = r.id;

    PERFORM public.plate_lookup_release_event_reservation(
      p_office_id, r.cycle_key, r.reserve_bucket
    );
  END LOOP;

  -- API marcada como iniciada mas sem finalize: libera franquia, pendência de reconciliação (P1/P2).
  FOR r IN
    SELECT e.id, e.cycle_key, e.reserve_bucket
    FROM public.plate_lookup_events e
    WHERE e.office_id = p_office_id
      AND e.status = 'reserved'
      AND e.api_called = TRUE
      AND e.api_started_at IS NOT NULL
      AND e.api_started_at < NOW() - INTERVAL '15 minutes'
    ORDER BY e.id
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.plate_lookup_events e
    SET
      status = 'reconciliation_pending',
      outcome = coalesce(e.outcome, 'ambiguous'),
      billing_kind = 'pending_reconciliation',
      finalized_at = NOW(),
      updated_at = NOW()
    WHERE e.id = r.id;

    PERFORM public.plate_lookup_release_event_reservation(
      p_office_id, r.cycle_key, r.reserve_bucket
    );
  END LOOP;
END;
$$;

-- -----------------------------------------------------------------------------
-- 5) RPC: quota (authenticated)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.plate_lookup_get_quota()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prof RECORD;
  v_office RECORD;
  v_plan TEXT;
  v_trial_active BOOLEAN;
  v_cycle_key TEXT;
  v_plan_limit INT;
  v_effective_limit INT;
  v_usage public.plate_lookup_cycle_usage%ROWTYPE;
  v_consent BOOLEAN;
BEGIN
  SELECT * INTO v_prof FROM public.plate_lookup_get_caller_profile();
  IF NOT FOUND OR v_prof.active IS FALSE OR v_prof.office_id IS NULL THEN
    RAISE EXCEPTION 'profile or office invalid' USING ERRCODE = '42501';
  END IF;

  SELECT o.id, o.plan_tier, o.trial_started_at, o.trial_ends_at
  INTO v_office
  FROM public.offices o
  WHERE o.id = v_prof.office_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'office not found' USING ERRCODE = '42501';
  END IF;

  v_plan := public.plate_lookup_normalize_plan_tier(v_office.plan_tier);
  v_trial_active := public.plate_lookup_trial_active(v_office.plan_tier, v_office.trial_ends_at);
  v_cycle_key := public.plate_lookup_cycle_key(v_office.plan_tier, v_office.trial_ends_at, v_office.id);
  v_plan_limit := public.plate_lookup_included_limit(v_office.plan_tier, v_trial_active);

  SELECT * INTO v_usage
  FROM public.plate_lookup_cycle_usage u
  WHERE u.office_id = v_office.id AND u.cycle_key = v_cycle_key;

  v_effective_limit := public.plate_lookup_effective_included_limit(
    v_usage.included_limit,
    v_plan_limit
  );

  SELECT EXISTS (
    SELECT 1 FROM public.plate_lookup_overage_consent c
    WHERE c.office_id = v_office.id AND c.cycle_key = v_cycle_key
  ) INTO v_consent;

  RETURN jsonb_build_object(
    'office_id', v_office.id,
    'cycle_key', v_cycle_key,
    'plan_tier', v_plan,
    'trial_active', v_trial_active,
    'trial_ends_at', v_office.trial_ends_at,
    'included_limit', v_effective_limit,
    'plan_included_limit', v_plan_limit,
    'used_included', coalesce(v_usage.used_included, 0),
    'reserved_included', coalesce(v_usage.reserved_included, 0),
    'used_overage', coalesce(v_usage.used_overage, 0),
    'reserved_overage', coalesce(v_usage.reserved_overage, 0),
    'remaining_included', greatest(
      0,
      v_effective_limit
        - coalesce(v_usage.used_included, 0)
        - coalesce(v_usage.reserved_included, 0)
    ),
    'overage_amount_cents', coalesce(v_usage.overage_amount_cents, 0),
    'overage_consent_accepted', v_consent,
    'trial_allows_overage', FALSE,
    'overage_unit_cents', CASE WHEN v_trial_active THEN NULL ELSE 10 END
  );
END;
$$;

COMMENT ON FUNCTION public.plate_lookup_get_quota() IS
  'Retorna franquia efetiva e consumo do ciclo (mesma regra de limite que plate_lookup_begin).';

-- -----------------------------------------------------------------------------
-- 6) RPC: aceite excedente (authenticated — owner/admin)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.plate_lookup_accept_overage_consent(p_terms_version TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prof RECORD;
  v_office RECORD;
  v_trial_active BOOLEAN;
  v_cycle_key TEXT;
  v_terms TEXT;
BEGIN
  v_terms := trim(coalesce(p_terms_version, ''));
  IF v_terms = '' THEN
    RAISE EXCEPTION 'terms_version required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_prof FROM public.plate_lookup_get_caller_profile();
  IF NOT FOUND OR v_prof.active IS FALSE THEN
    RAISE EXCEPTION 'profile invalid' USING ERRCODE = '42501';
  END IF;

  IF v_prof.role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'only owner or admin may accept overage billing' USING ERRCODE = '42501';
  END IF;

  SELECT o.id, o.plan_tier, o.trial_ends_at
  INTO v_office
  FROM public.offices o
  WHERE o.id = v_prof.office_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'office not found' USING ERRCODE = '42501';
  END IF;

  v_trial_active := public.plate_lookup_trial_active(v_office.plan_tier, v_office.trial_ends_at);
  IF v_trial_active THEN
    RAISE EXCEPTION 'trial plan does not allow paid overage' USING ERRCODE = 'P0001';
  END IF;

  IF public.plate_lookup_normalize_plan_tier(v_office.plan_tier) = 'trial' AND NOT v_trial_active THEN
    RAISE EXCEPTION 'trial expired' USING ERRCODE = 'P0001';
  END IF;

  v_cycle_key := public.plate_lookup_cycle_key(v_office.plan_tier, v_office.trial_ends_at, v_office.id);

  INSERT INTO public.plate_lookup_overage_consent (office_id, cycle_key, accepted_by, terms_version)
  VALUES (v_office.id, v_cycle_key, v_prof.user_id, v_terms)
  ON CONFLICT (office_id, cycle_key) DO UPDATE
  SET
    accepted_by = EXCLUDED.accepted_by,
    accepted_at = NOW(),
    terms_version = EXCLUDED.terms_version;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'cycle_key', v_cycle_key,
    'terms_version', v_terms,
    'accepted_at', NOW()
  );
END;
$$;

COMMENT ON FUNCTION public.plate_lookup_accept_overage_consent(TEXT) IS
  'Registra aceite de cobrança de consultas excedentes no ciclo atual (somente owner/admin; trial proibido).';

-- -----------------------------------------------------------------------------
-- 7) RPC: begin / reserva (authenticated)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.plate_lookup_begin(
  p_placa TEXT,
  p_idempotency_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prof RECORD;
  v_office RECORD;
  v_plan TEXT;
  v_trial_active BOOLEAN;
  v_cycle_key TEXT;
  v_plan_limit INT;
  v_effective_limit INT;
  v_key TEXT;
  v_hash TEXT;
  v_existing public.plate_lookup_events%ROWTYPE;
  v_usage public.plate_lookup_cycle_usage%ROWTYPE;
  v_consent BOOLEAN;
  v_bucket TEXT;
  v_event_id UUID;
  v_rate INT;
BEGIN
  v_key := trim(coalesce(p_idempotency_key, ''));
  IF v_key = '' OR char_length(v_key) > 128 THEN
    RAISE EXCEPTION 'idempotency_key required (max 128 chars)' USING ERRCODE = '22023';
  END IF;

  IF NOT public.plate_lookup_plate_valid(p_placa) THEN
    RAISE EXCEPTION 'invalid plate' USING ERRCODE = '22023';
  END IF;

  v_hash := public.plate_lookup_plate_hash(p_placa);

  SELECT * INTO v_prof FROM public.plate_lookup_get_caller_profile();
  IF NOT FOUND OR v_prof.active IS FALSE OR v_prof.office_id IS NULL THEN
    RAISE EXCEPTION 'profile or office invalid' USING ERRCODE = '42501';
  END IF;

  SELECT o.id, o.plan_tier, o.trial_started_at, o.trial_ends_at
  INTO v_office
  FROM public.offices o
  WHERE o.id = v_prof.office_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'office not found' USING ERRCODE = '42501';
  END IF;

  v_plan := public.plate_lookup_normalize_plan_tier(v_office.plan_tier);
  v_trial_active := public.plate_lookup_trial_active(v_office.plan_tier, v_office.trial_ends_at);

  IF v_plan = 'trial' AND NOT v_trial_active THEN
    RAISE EXCEPTION 'trial expired' USING ERRCODE = 'P0001';
  END IF;

  v_cycle_key := public.plate_lookup_cycle_key(v_office.plan_tier, v_office.trial_ends_at, v_office.id);
  v_plan_limit := public.plate_lookup_included_limit(v_office.plan_tier, v_trial_active);

  SELECT * INTO v_existing
  FROM public.plate_lookup_events e
  WHERE e.office_id = v_office.id AND e.idempotency_key = v_key;

  IF FOUND THEN
    IF v_existing.user_id IS DISTINCT FROM v_prof.user_id THEN
      RAISE EXCEPTION 'idempotency_key conflict' USING ERRCODE = '23505';
    END IF;

    IF v_existing.plate_hash <> v_hash THEN
      RETURN jsonb_build_object(
        'ok', FALSE,
        'code', 'IDEMPOTENCY_PLATE_MISMATCH',
        'message', 'Esta chave de idempotência já foi usada para outra placa.',
        'event_id', v_existing.id
      );
    END IF;

    RETURN jsonb_build_object(
      'ok', TRUE,
      'event_id', v_existing.id,
      'status', v_existing.status,
      'idempotent_replay', TRUE,
      'allow_api_call',
        v_existing.status = 'reserved'
        AND v_existing.api_called = FALSE
        AND v_existing.reservation_expires_at > NOW(),
      'api_call_blocked_reason', CASE
        WHEN v_existing.api_called THEN 'API_ALREADY_STARTED'
        WHEN v_existing.status <> 'reserved' THEN 'EVENT_NOT_RESERVED'
        WHEN v_existing.reservation_expires_at <= NOW() THEN 'RESERVATION_EXPIRED'
        ELSE NULL
      END,
      'result_payload', v_existing.result_payload,
      'result_code', v_existing.result_code,
      'outcome', v_existing.outcome,
      'billing_kind', v_existing.billing_kind
    );
  END IF;

  SELECT count(*)::int INTO v_rate
  FROM public.plate_lookup_events e
  WHERE e.office_id = v_office.id
    AND e.created_at > NOW() - INTERVAL '60 minutes';

  IF v_rate >= 30 THEN
    RAISE EXCEPTION 'rate limit exceeded' USING ERRCODE = 'P0001';
  END IF;

  PERFORM public.plate_lookup_release_stale_reservations(v_office.id);

  INSERT INTO public.plate_lookup_cycle_usage AS u (
    office_id,
    cycle_key,
    plan_tier_snapshot,
    included_limit
  ) VALUES (
    v_office.id,
    v_cycle_key,
    v_plan,
    v_plan_limit
  )
  ON CONFLICT (office_id, cycle_key) DO UPDATE
  SET
    plan_tier_snapshot = EXCLUDED.plan_tier_snapshot,
    included_limit = GREATEST(
      u.included_limit,
      EXCLUDED.included_limit
    ),
    updated_at = NOW();

  SELECT * INTO v_usage
  FROM public.plate_lookup_cycle_usage u
  WHERE u.office_id = v_office.id AND u.cycle_key = v_cycle_key
  FOR UPDATE;

  v_effective_limit := public.plate_lookup_effective_included_limit(
    v_usage.included_limit,
    v_plan_limit
  );

  IF v_effective_limit <> v_usage.included_limit THEN
    UPDATE public.plate_lookup_cycle_usage
    SET included_limit = v_effective_limit, updated_at = NOW()
    WHERE office_id = v_office.id AND cycle_key = v_cycle_key;
    v_usage.included_limit := v_effective_limit;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.plate_lookup_overage_consent c
    WHERE c.office_id = v_office.id AND c.cycle_key = v_cycle_key
  ) INTO v_consent;

  IF v_usage.used_included + v_usage.reserved_included < v_effective_limit THEN
    v_bucket := 'included';
  ELSIF v_trial_active THEN
    RAISE EXCEPTION 'trial quota exceeded' USING ERRCODE = 'P0001';
  ELSIF NOT v_consent THEN
    RETURN jsonb_build_object(
      'ok', FALSE,
      'code', 'NEEDS_OVERAGE_CONSENT',
      'message', 'Aceite de cobrança excedente necessário para este ciclo.',
      'cycle_key', v_cycle_key
    );
  ELSE
    v_bucket := 'overage';
  END IF;

  IF v_bucket = 'included' THEN
    UPDATE public.plate_lookup_cycle_usage
    SET reserved_included = reserved_included + 1, updated_at = NOW()
    WHERE office_id = v_office.id AND cycle_key = v_cycle_key;
  ELSE
    UPDATE public.plate_lookup_cycle_usage
    SET reserved_overage = reserved_overage + 1, updated_at = NOW()
    WHERE office_id = v_office.id AND cycle_key = v_cycle_key;
  END IF;

  INSERT INTO public.plate_lookup_events (
    office_id,
    user_id,
    cycle_key,
    idempotency_key,
    plate_hash,
    status,
    reserve_bucket,
    reservation_expires_at
  ) VALUES (
    v_office.id,
    v_prof.user_id,
    v_cycle_key,
    v_key,
    v_hash,
    'reserved',
    v_bucket,
    NOW() + INTERVAL '3 minutes'
  )
  RETURNING id INTO v_event_id;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'event_id', v_event_id,
    'status', 'reserved',
    'idempotent_replay', FALSE,
    'allow_api_call', TRUE,
    'reserve_bucket', v_bucket,
    'cycle_key', v_cycle_key,
    'reservation_expires_at', (NOW() + INTERVAL '3 minutes')
  );
END;
$$;

COMMENT ON FUNCTION public.plate_lookup_begin(TEXT, TEXT) IS
  'Reserva atômica de consumo (FOR UPDATE). Idempotência por (office_id, idempotency_key) com validação de plate_hash.';

-- -----------------------------------------------------------------------------
-- 8) RPC: mark_api_started (SOMENTE service_role — antes do fetch HTTP)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.plate_lookup_mark_api_started(p_event_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event public.plate_lookup_events%ROWTYPE;
BEGIN
  PERFORM public.plate_lookup_assert_service_role();

  IF p_event_id IS NULL THEN
    RAISE EXCEPTION 'event_id required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_event
  FROM public.plate_lookup_events e
  WHERE e.id = p_event_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'event not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_event.status = 'finalized' THEN
    RETURN jsonb_build_object(
      'ok', TRUE,
      'event_id', v_event.id,
      'status', v_event.status,
      'idempotent_replay', TRUE,
      'api_called', v_event.api_called
    );
  END IF;

  IF v_event.status = 'reconciliation_pending' THEN
    RETURN jsonb_build_object(
      'ok', FALSE,
      'code', 'EVENT_NOT_API_ELIGIBLE',
      'event_id', v_event.id,
      'status', v_event.status
    );
  END IF;

  IF v_event.status <> 'reserved' THEN
    RAISE EXCEPTION 'event not reservable for api start' USING ERRCODE = 'P0001';
  END IF;

  IF v_event.api_called THEN
    RETURN jsonb_build_object(
      'ok', TRUE,
      'event_id', v_event.id,
      'status', v_event.status,
      'idempotent_replay', TRUE,
      'api_called', TRUE,
      'api_started_at', v_event.api_started_at
    );
  END IF;

  IF v_event.reservation_expires_at <= NOW() THEN
    RAISE EXCEPTION 'reservation expired' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.plate_lookup_events
  SET
    api_called = TRUE,
    api_started_at = NOW(),
    updated_at = NOW()
  WHERE id = v_event.id;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'event_id', v_event.id,
    'status', 'reserved',
    'api_called', TRUE,
    'api_started_at', NOW()
  );
END;
$$;

COMMENT ON FUNCTION public.plate_lookup_mark_api_started(UUID) IS
  'Marca início da chamada externa (service_role). Impede expiração automática de reserva não iniciada; não prova cobrança pelo fornecedor.';

-- -----------------------------------------------------------------------------
-- 9) RPC: finalize (SOMENTE service_role — Edge Function após HTTP externo)
-- Contrato Edge (contabilização tardia): finalize pode retornar consumed=false com
-- billing_kind=administrative_pending e status reconciliation_pending quando a franquia
-- incluída já foi realocada; não repetir mark_api_started nem nova chamada HTTP paga.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.plate_lookup_finalize_event(
  p_event_id UUID,
  p_outcome TEXT,
  p_api_called BOOLEAN,
  p_result_code TEXT DEFAULT NULL,
  p_api_provider_request_id TEXT DEFAULT NULL,
  p_result_payload JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event public.plate_lookup_events%ROWTYPE;
  v_usage public.plate_lookup_cycle_usage%ROWTYPE;
  v_bill TEXT;
  v_consume BOOLEAN;
  v_final_status TEXT;
  v_outcome TEXT;
  v_consumed_ok BOOLEAN;
BEGIN
  PERFORM public.plate_lookup_assert_service_role();

  IF p_event_id IS NULL THEN
    RAISE EXCEPTION 'event_id required' USING ERRCODE = '22023';
  END IF;

  v_outcome := lower(trim(coalesce(p_outcome, '')));
  IF v_outcome NOT IN (
    'success', 'not_found', 'api_error', 'invalid', 'ambiguous', 'timeout',
    'cancelled', 'expired'
  ) THEN
    RAISE EXCEPTION 'invalid outcome' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_event
  FROM public.plate_lookup_events e
  WHERE e.id = p_event_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'event not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_event.status = 'finalized' THEN
    RETURN jsonb_build_object(
      'ok', TRUE,
      'event_id', v_event.id,
      'status', v_event.status,
      'idempotent_replay', TRUE,
      'billing_kind', v_event.billing_kind,
      'consumed', v_event.billing_kind IN ('included', 'overage'),
      'result_payload', v_event.result_payload
    );
  END IF;

  IF v_event.status = 'reconciliation_pending' THEN
    IF v_event.reconciled_at IS NOT NULL OR v_event.billing_kind IN ('included', 'overage', 'none') THEN
      RETURN jsonb_build_object(
        'ok', TRUE,
        'event_id', v_event.id,
        'status', 'finalized',
        'idempotent_replay', TRUE,
        'billing_kind', v_event.billing_kind,
        'consumed', v_event.billing_kind IN ('included', 'overage')
      );
    END IF;

    IF v_event.billing_kind = 'administrative_pending' AND v_event.outcome = 'success' THEN
      RETURN jsonb_build_object(
        'ok', TRUE,
        'event_id', v_event.id,
        'status', v_event.status,
        'idempotent_replay', TRUE,
        'billing_kind', v_event.billing_kind,
        'consumed', FALSE,
        'code', 'LATE_SUCCESS_ADMINISTRATIVE_PENDING',
        'message', 'Consulta confirmada; contabilização aguarda reconcile (bill_included/bill_overage/waive).',
        'result_payload', v_event.result_payload
      );
    END IF;

    IF v_outcome = 'success' AND p_api_called THEN
      SELECT * INTO v_usage
      FROM public.plate_lookup_cycle_usage u
      WHERE u.office_id = v_event.office_id AND u.cycle_key = v_event.cycle_key
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'usage row missing' USING ERRCODE = 'P0001';
      END IF;

      v_consumed_ok := FALSE;
      v_bill := 'administrative_pending';
      v_final_status := 'reconciliation_pending';

      IF v_event.reserve_bucket = 'included' THEN
        v_consumed_ok := public.plate_lookup_consume_included_if_available(
          v_event.office_id, v_event.cycle_key
        );
        IF v_consumed_ok THEN
          v_bill := 'included';
          v_final_status := 'finalized';
        END IF;
      ELSIF v_event.reserve_bucket = 'overage' THEN
        v_consumed_ok := public.plate_lookup_consume_overage_if_allowed(
          v_event.office_id, v_event.cycle_key
        );
        IF v_consumed_ok THEN
          v_bill := 'overage';
          v_final_status := 'finalized';
        END IF;
      END IF;

      UPDATE public.plate_lookup_events
      SET
        status = v_final_status,
        outcome = v_outcome,
        billing_kind = v_bill,
        api_called = TRUE,
        api_provider_request_id = nullif(trim(coalesce(p_api_provider_request_id, '')), ''),
        result_code = nullif(trim(coalesce(p_result_code, '')), ''),
        result_payload = p_result_payload,
        finalized_at = CASE WHEN v_final_status = 'finalized' THEN coalesce(v_event.finalized_at, NOW()) ELSE v_event.finalized_at END,
        reconciliation_note = CASE
          WHEN NOT v_consumed_ok THEN coalesce(
            nullif(trim(v_event.reconciliation_note), ''),
            'Sucesso tardio sem slot incluído/excedente elegível; resolver via reconcile.'
          )
          ELSE v_event.reconciliation_note
        END,
        updated_at = NOW()
      WHERE id = v_event.id;

      RETURN jsonb_build_object(
        'ok', TRUE,
        'event_id', v_event.id,
        'status', v_final_status,
        'billing_kind', v_bill,
        'consumed', v_consumed_ok,
        'code', CASE WHEN NOT v_consumed_ok THEN 'LATE_SUCCESS_ADMINISTRATIVE_PENDING' ELSE NULL END,
        'late_success_after_reconciliation_pending', TRUE,
        'result_payload', p_result_payload
      );
    END IF;

    RETURN jsonb_build_object(
      'ok', TRUE,
      'event_id', v_event.id,
      'status', v_event.status,
      'idempotent_replay', TRUE,
      'billing_kind', v_event.billing_kind,
      'consumed', FALSE,
      'message', 'Use plate_lookup_reconcile_event para contabilizar após revisão.'
    );
  END IF;

  IF v_event.status <> 'reserved' THEN
    RAISE EXCEPTION 'event not reservable' USING ERRCODE = 'P0001';
  END IF;

  IF p_api_called AND NOT v_event.api_called THEN
    RAISE EXCEPTION 'api_called mismatch: call plate_lookup_mark_api_started first' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_usage
  FROM public.plate_lookup_cycle_usage u
  WHERE u.office_id = v_event.office_id AND u.cycle_key = v_event.cycle_key
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'usage row missing' USING ERRCODE = 'P0001';
  END IF;

  v_consume := FALSE;
  v_bill := 'none';
  v_final_status := 'finalized';

  IF v_outcome = 'success' AND p_api_called THEN
    v_consume := TRUE;
    v_bill := v_event.reserve_bucket;
  ELSIF v_outcome IN ('not_found', 'invalid') AND p_api_called
        AND coalesce(p_result_code, '') IN (
          'placa_nao_encontrada', 'placa_invalida', 'PLATE_NOT_FOUND', 'PLATE_INVALID'
        ) THEN
    v_consume := FALSE;
    v_bill := 'none';
  ELSIF v_outcome IN ('api_error', 'cancelled', 'expired') AND p_api_called = FALSE THEN
    v_consume := FALSE;
    v_bill := 'none';
  ELSIF v_outcome IN ('ambiguous', 'timeout', 'api_error') AND p_api_called THEN
    -- P1: débito pelo fornecedor não confirmado — não consumir; fila de reconciliação.
    v_consume := FALSE;
    v_bill := 'pending_reconciliation';
    v_final_status := 'reconciliation_pending';
  ELSE
    v_consume := FALSE;
    v_bill := 'none';
  END IF;

  PERFORM public.plate_lookup_release_event_reservation(
    v_event.office_id, v_event.cycle_key, v_event.reserve_bucket
  );

  IF v_consume THEN
    v_consumed_ok := FALSE;
    IF v_event.reserve_bucket = 'included' THEN
      v_consumed_ok := public.plate_lookup_consume_included_if_available(
        v_event.office_id, v_event.cycle_key
      );
      IF v_consumed_ok THEN
        v_bill := 'included';
      ELSE
        v_consume := FALSE;
        v_bill := 'administrative_pending';
        v_final_status := 'reconciliation_pending';
      END IF;
    ELSIF v_event.reserve_bucket = 'overage' THEN
      v_consumed_ok := public.plate_lookup_consume_overage_if_allowed(
        v_event.office_id, v_event.cycle_key
      );
      IF v_consumed_ok THEN
        v_bill := 'overage';
      ELSE
        v_consume := FALSE;
        v_bill := 'administrative_pending';
        v_final_status := 'reconciliation_pending';
      END IF;
    ELSE
      v_consume := FALSE;
      v_bill := 'none';
    END IF;
  END IF;

  UPDATE public.plate_lookup_events
  SET
    status = v_final_status,
    outcome = v_outcome,
    billing_kind = v_bill,
    api_called = coalesce(p_api_called, v_event.api_called),
    api_provider_request_id = nullif(trim(coalesce(p_api_provider_request_id, '')), ''),
    result_code = nullif(trim(coalesce(p_result_code, '')), ''),
    result_payload = p_result_payload,
    finalized_at = NOW(),
    reconciliation_note = CASE
      WHEN v_bill = 'administrative_pending' THEN coalesce(
        nullif(trim(v_event.reconciliation_note), ''),
        'Sucesso sem slot de contabilização imediata; resolver via reconcile.'
      )
      ELSE v_event.reconciliation_note
    END,
    updated_at = NOW()
  WHERE id = v_event.id;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'event_id', v_event.id,
    'status', v_final_status,
    'billing_kind', v_bill,
    'consumed', v_consume,
    'code', CASE WHEN v_bill = 'administrative_pending' THEN 'SUCCESS_ADMINISTRATIVE_PENDING' ELSE NULL END,
    'result_payload', p_result_payload
  );
END;
$$;

COMMENT ON FUNCTION public.plate_lookup_finalize_event(
  UUID, TEXT, BOOLEAN, TEXT, TEXT, JSONB
) IS
  'Finaliza reserva após resposta da API (service_role). Consumo incluído só se couber no limite; sem auto-excedente.';

-- -----------------------------------------------------------------------------
-- 10) RPC: reconcile (SOMENTE service_role — pós-revisão operacional)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.plate_lookup_reconcile_event(
  p_event_id UUID,
  p_decision TEXT,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event public.plate_lookup_events%ROWTYPE;
  v_decision TEXT;
  v_bill TEXT;
  v_consume BOOLEAN;
  v_consumed_ok BOOLEAN;
BEGIN
  PERFORM public.plate_lookup_assert_service_role();

  v_decision := lower(trim(coalesce(p_decision, '')));
  IF v_decision NOT IN ('waive', 'bill_included', 'bill_overage') THEN
    RAISE EXCEPTION 'invalid reconciliation decision' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_event
  FROM public.plate_lookup_events e
  WHERE e.id = p_event_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'event not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_event.status = 'finalized' AND v_event.reconciled_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', TRUE,
      'event_id', v_event.id,
      'status', v_event.status,
      'billing_kind', v_event.billing_kind,
      'idempotent_replay', TRUE,
      'consumed', v_event.billing_kind IN ('included', 'overage')
    );
  END IF;

  IF v_event.status <> 'reconciliation_pending' THEN
    RAISE EXCEPTION 'event not pending reconciliation' USING ERRCODE = 'P0001';
  END IF;

  v_consume := FALSE;
  v_consumed_ok := FALSE;
  v_bill := CASE v_decision
    WHEN 'waive' THEN 'none'
    WHEN 'bill_included' THEN 'included'
    WHEN 'bill_overage' THEN 'overage'
  END;

  IF v_decision = 'waive' THEN
    v_consume := FALSE;
  ELSE
    PERFORM 1
    FROM public.plate_lookup_cycle_usage u
    WHERE u.office_id = v_event.office_id AND u.cycle_key = v_event.cycle_key
    FOR UPDATE;

    IF v_decision = 'bill_included' THEN
      IF v_event.reserve_bucket <> 'included' THEN
        RAISE EXCEPTION 'reserve_bucket is not included' USING ERRCODE = 'P0001';
      END IF;
      v_consumed_ok := public.plate_lookup_consume_included_if_available(
        v_event.office_id, v_event.cycle_key
      );
      IF NOT v_consumed_ok THEN
        RETURN jsonb_build_object(
          'ok', FALSE,
          'code', 'INCLUDED_SLOT_UNAVAILABLE',
          'event_id', v_event.id,
          'status', v_event.status,
          'billing_kind', v_event.billing_kind,
          'consumed', FALSE,
          'message', 'Franquia incluída esgotada; não converter automaticamente para excedente.'
        );
      END IF;
      v_consume := TRUE;
    ELSIF v_decision = 'bill_overage' THEN
      IF v_event.reserve_bucket <> 'overage' THEN
        RAISE EXCEPTION 'reserve_bucket is not overage; use bill_included or waive' USING ERRCODE = 'P0001';
      END IF;
      v_consumed_ok := public.plate_lookup_consume_overage_if_allowed(
        v_event.office_id, v_event.cycle_key
      );
      IF NOT v_consumed_ok THEN
        RETURN jsonb_build_object(
          'ok', FALSE,
          'code', 'OVERAGE_NOT_ALLOWED',
          'event_id', v_event.id,
          'status', v_event.status,
          'billing_kind', v_event.billing_kind,
          'consumed', FALSE,
          'message', 'Excedente não permitido (sem consentimento do ciclo).'
        );
      END IF;
      v_consume := TRUE;
    END IF;
  END IF;

  UPDATE public.plate_lookup_events
  SET
    status = 'finalized',
    billing_kind = v_bill,
    reconciled_at = NOW(),
    reconciliation_note = nullif(trim(coalesce(p_note, '')), ''),
    updated_at = NOW()
  WHERE id = v_event.id;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'event_id', v_event.id,
    'status', 'finalized',
    'billing_kind', v_bill,
    'consumed', v_consume
  );
END;
$$;

COMMENT ON FUNCTION public.plate_lookup_reconcile_event(UUID, TEXT, TEXT) IS
  'Contabiliza ou isenta evento pendente; bill_included respeita limite; bill_overage exige bucket+consent.';

-- -----------------------------------------------------------------------------
-- 11) Permissões EXECUTE (P6)
-- -----------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.plate_lookup_get_quota() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plate_lookup_get_quota() TO authenticated;

REVOKE ALL ON FUNCTION public.plate_lookup_accept_overage_consent(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plate_lookup_accept_overage_consent(TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.plate_lookup_begin(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plate_lookup_begin(TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.plate_lookup_mark_api_started(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.plate_lookup_mark_api_started(UUID) TO service_role;

REVOKE ALL ON FUNCTION public.plate_lookup_finalize_event(
  UUID, TEXT, BOOLEAN, TEXT, TEXT, JSONB
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.plate_lookup_finalize_event(
  UUID, TEXT, BOOLEAN, TEXT, TEXT, JSONB
) TO service_role;

REVOKE ALL ON FUNCTION public.plate_lookup_reconcile_event(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.plate_lookup_reconcile_event(UUID, TEXT, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.plate_lookup_assert_service_role() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.plate_lookup_release_stale_reservations(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.plate_lookup_release_event_reservation(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.plate_lookup_lock_cycle_usage(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.plate_lookup_consume_included_if_available(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.plate_lookup_consume_overage_if_allowed(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.plate_lookup_get_caller_profile() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.plate_lookup_jwt_role() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.plate_lookup_normalize_plate(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.plate_lookup_plate_hash(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.plate_lookup_plate_valid(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.plate_lookup_normalize_plan_tier(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.plate_lookup_trial_active(TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.plate_lookup_cycle_key(TEXT, TIMESTAMPTZ, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.plate_lookup_included_limit(TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.plate_lookup_effective_included_limit(INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.plate_lookup_touch_updated_at() FROM PUBLIC, anon, authenticated;
