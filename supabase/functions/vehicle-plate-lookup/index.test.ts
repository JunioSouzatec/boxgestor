/**
 * Testes unit�rios � vehicle-plate-lookup (n�o faz parte do bundle de deploy).
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import {
  avaliarEstadoAutorizacaoPiloto,
  avaliarReservaConsultaRealComercial,
  cenarioSimulacao,
  classificarCandidatoConsultaRealComercial,
  classificarCandidatoPilotoReal,
  consultaExternaHabilitada,
  consultaRealComercialFetchPermitido,
  dadosSimuladosPersistidos,
  dadosVeiculoSimulado,
  deveNegarConsultaRealOficinaForaAllowlist,
  executarConsultaRealComercial,
  executarConsultaRealPiloto,
  handleVehiclePlateLookupRequest,
  interpretarAquisicaoPilotoVendor,
  markApiStartedPermiteChamadaHttp,
  mapearResultadoApiParaFinalize,
  parseRealOfficesAllowlist,
  pilotoRealPermitido,
  pilotoVendorFetchPermitido,
  simulacaoPermitida,
  type RealPilotTestDeps,
} from './index.ts'

const HOMOLOG_PROJECT_REF = 'cqnktgouczyrxkkeusio'
const HOMOLOG_URL_TEST = `https://${HOMOLOG_PROJECT_REF}.supabase.co`
const ENV_PLATE_LOOKUP_REAL_PILOT = 'PLATE_LOOKUP_REAL_PILOT'
const ENV_API_PLACAS_TOKEN = 'API_PLACAS_TOKEN'
const ENV_PLATE_LOOKUP_REAL_PILOT_PLACA = 'PLATE_LOOKUP_REAL_PILOT_PLACA'
const ENV_PLATE_LOOKUP_REAL_PILOT_AUTH_KEY = 'PLATE_LOOKUP_REAL_PILOT_AUTHORIZATION_KEY'
const ENV_PLATE_LOOKUP_SIMULATE = 'PLATE_LOOKUP_SIMULATE'
const ENV_PLATE_LOOKUP_ENABLED = 'PLATE_LOOKUP_ENABLED'
const ENV_PLATE_LOOKUP_REAL_OFFICES = 'PLATE_LOOKUP_REAL_OFFICES'
const RESULT_CODE_REAL_OK = 'PLATE_LOOKUP_OK'
const COMMERCIAL_OFFICE_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const COMMERCIAL_OFFICE_B = '11111111-1111-1111-1111-111111111111'
const COMMERCIAL_PLACA = 'DEF2E34'
const RESULT_SOURCE_REAL_PILOT = 'plate-lookup-edge-real-pilot'
const SIMULATE_OFFICE_ID = '486d31e8-3bad-4c6b-95c0-3a5757b6066b'
const SIMULATE_PLACA = 'ZZZ9Z99'
const SIMULATE_PLACA_SUCESSO_2 = 'ZZZ9Z98'
const SIMULATE_PLACA_NOT_FOUND = 'ZZZ9Z00'
const SIMULATE_PLACA_TIMEOUT = 'ZZZ8Z99'
const SIMULATE_PLACA_API_ERROR = 'ZZZ7Z99'
const PILOT_PLACA_TEST = 'ABC1D23'
const PILOT_AUTH_KEY_TEST = 'pilot-auth-key-001'
const HANDLER_USER_ID = '22222222-2222-2222-2222-222222222222'
const VALID_IDEMP_KEY = 'idem-handler-001'

type MockUserSbOpts = {
  authenticated: boolean
  active: boolean
  officeId: string | null
  officeExists: boolean
  membership: boolean
}

function createMockUserSb(opts: MockUserSbOpts): SupabaseClient {
  return {
    auth: {
      getUser: async () => {
        if (!opts.authenticated) {
          return { data: { user: null }, error: { message: 'invalid jwt' } }
        }
        return { data: { user: { id: HANDLER_USER_ID } }, error: null }
      },
    },
    from(table: string) {
      return {
        select(_cols?: string) {
          return {
            eq(col: string, _val: string) {
              return {
                eq(col2: string, _val2: string) {
                  return {
                    maybeSingle: async () => {
                      if (
                        table === 'profiles' &&
                        col === 'id' &&
                        col2 === 'office_id'
                      ) {
                        return opts.membership
                          ? { data: { id: HANDLER_USER_ID }, error: null }
                          : { data: null, error: null }
                      }
                      return { data: null, error: null }
                    },
                  }
                },
                maybeSingle: async () => {
                  if (table === 'profiles' && col === 'id') {
                    if (!opts.officeId) {
                      return { data: null, error: null }
                    }
                    return {
                      data: {
                        id: HANDLER_USER_ID,
                        office_id: opts.officeId,
                        active: opts.active,
                        role: 'owner',
                      },
                      error: null,
                    }
                  }
                  if (table === 'offices' && col === 'id') {
                    return opts.officeExists && opts.officeId
                      ? { data: { id: opts.officeId }, error: null }
                      : { data: null, error: null }
                  }
                  return { data: null, error: null }
                },
              }
            },
          }
        },
      }
    },
  } as unknown as SupabaseClient
}

function postPlateLookup(
  body: Record<string, unknown>,
  auth?: string
): Request {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (auth) headers.Authorization = auth
  return new Request('http://localhost/vehicle-plate-lookup', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

async function withPilotEnvAsync<T>(
  overrides: Record<string, string | undefined>,
  fn: () => Promise<T>
): Promise<T> {
  const keys = [
    ENV_PLATE_LOOKUP_REAL_PILOT,
    ENV_API_PLACAS_TOKEN,
    ENV_PLATE_LOOKUP_REAL_PILOT_PLACA,
    ENV_PLATE_LOOKUP_REAL_PILOT_AUTH_KEY,
    'SUPABASE_URL',
    ENV_PLATE_LOOKUP_SIMULATE,
    ENV_PLATE_LOOKUP_ENABLED,
    ENV_PLATE_LOOKUP_REAL_OFFICES,
  ]
  const prev = new Map<string, string | undefined>()
  for (const k of keys) prev.set(k, Deno.env.get(k))
  try {
    for (const [k, v] of Object.entries(overrides)) {
      if (v === undefined) Deno.env.delete(k)
      else Deno.env.set(k, v)
    }
    return await fn()
  } finally {
    for (const k of keys) {
      const v = prev.get(k)
      if (v === undefined) Deno.env.delete(k)
      else Deno.env.set(k, v)
    }
  }
}

async function handlerComReenv(
  overrides: Record<string, string | undefined>,
  req: Request,
  userSb: SupabaseClient
): Promise<{ res: Response; comercialCalls: number }> {
  let comercialCalls = 0
  const res = await withPilotEnvAsync(
    {
      SUPABASE_URL: HOMOLOG_URL_TEST,
      ...overrides,
    },
    async () =>
      handleVehiclePlateLookupRequest(req, '11111111-1111-4111-8111-111111111111', {
        userClientFn: () => userSb,
        executarComercial: async () => {
          comercialCalls++
          return new Response(JSON.stringify({ ok: false, code: 'COMMERCIAL_STUB' }), {
            status: 503,
          })
        },
      })
  )
  return { res, comercialCalls }
}

function withPilotEnv<T>(
  overrides: Record<string, string | undefined>,
  fn: () => T
): T {
  const keys = [
    ENV_PLATE_LOOKUP_REAL_PILOT,
    ENV_API_PLACAS_TOKEN,
    ENV_PLATE_LOOKUP_REAL_PILOT_PLACA,
    ENV_PLATE_LOOKUP_REAL_PILOT_AUTH_KEY,
    'SUPABASE_URL',
    ENV_PLATE_LOOKUP_SIMULATE,
    ENV_PLATE_LOOKUP_ENABLED,
    ENV_PLATE_LOOKUP_REAL_OFFICES,
  ]
  const prev = new Map<string, string | undefined>()
  for (const k of keys) prev.set(k, Deno.env.get(k))
  try {
    for (const [k, v] of Object.entries(overrides)) {
      if (v === undefined) Deno.env.delete(k)
      else Deno.env.set(k, v)
    }
    return fn()
  } finally {
    for (const k of keys) {
      const v = prev.get(k)
      if (v === undefined) Deno.env.delete(k)
      else Deno.env.set(k, v)
    }
  }
}

const EVENT_ID_TEST = '550e8400-e29b-41d4-a716-446655440000'

function beginReservado(): Record<string, unknown> {
  return {
    ok: true,
    event_id: EVENT_ID_TEST,
    status: 'reserved',
    allow_api_call: true,
    api_called: false,
  }
}

async function lerJson(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>
}

Deno.test('piloto real: desativado (REAL_PILOT ausente)', () => {
  withPilotEnv(
    {
      [ENV_PLATE_LOOKUP_REAL_PILOT]: undefined,
      SUPABASE_URL: HOMOLOG_URL_TEST,
    },
    () => {
      assertEquals(
        classificarCandidatoPilotoReal(SIMULATE_OFFICE_ID, PILOT_PLACA_TEST),
        'nao_candidato'
      )
    }
  )
})

Deno.test('piloto real: token ausente ? config inv�lida', () => {
  withPilotEnv(
    {
      [ENV_PLATE_LOOKUP_REAL_PILOT]: 'true',
      [ENV_PLATE_LOOKUP_REAL_PILOT_PLACA]: PILOT_PLACA_TEST,
      [ENV_PLATE_LOOKUP_REAL_PILOT_AUTH_KEY]: PILOT_AUTH_KEY_TEST,
      [ENV_API_PLACAS_TOKEN]: undefined,
      SUPABASE_URL: HOMOLOG_URL_TEST,
    },
    () => {
      assertEquals(
        classificarCandidatoPilotoReal(SIMULATE_OFFICE_ID, PILOT_PLACA_TEST),
        'config_invalida'
      )
    }
  )
})

Deno.test('piloto real: outra oficina', () => {
  withPilotEnv(
    {
      [ENV_PLATE_LOOKUP_REAL_PILOT]: 'true',
      [ENV_PLATE_LOOKUP_REAL_PILOT_PLACA]: PILOT_PLACA_TEST,
      [ENV_PLATE_LOOKUP_REAL_PILOT_AUTH_KEY]: PILOT_AUTH_KEY_TEST,
      [ENV_API_PLACAS_TOKEN]: 'token-test',
      SUPABASE_URL: HOMOLOG_URL_TEST,
    },
    () => {
      assertEquals(
        classificarCandidatoPilotoReal(
          '11111111-1111-1111-1111-111111111111',
          PILOT_PLACA_TEST
        ),
        'nao_candidato'
      )
    }
  )
})

Deno.test('piloto real: placa n�o autorizada', () => {
  withPilotEnv(
    {
      [ENV_PLATE_LOOKUP_REAL_PILOT]: 'true',
      [ENV_PLATE_LOOKUP_REAL_PILOT_PLACA]: PILOT_PLACA_TEST,
      [ENV_PLATE_LOOKUP_REAL_PILOT_AUTH_KEY]: PILOT_AUTH_KEY_TEST,
      [ENV_API_PLACAS_TOKEN]: 'token-test',
      SUPABASE_URL: HOMOLOG_URL_TEST,
    },
    () => {
      assertEquals(
        classificarCandidatoPilotoReal(SIMULATE_OFFICE_ID, 'ZZZ9Z99'),
        'nao_candidato'
      )
    }
  )
})

Deno.test('piloto real: projeto diferente de Homolog', () => {
  assertEquals(
    pilotoRealPermitido({
      homologUrl: 'https://fgarivlagocabyumniiz.supabase.co',
      realPilotEnv: 'true',
      apiTokenEnv: 'x',
      pilotPlacaEnv: PILOT_PLACA_TEST,
      pilotAuthKeyEnv: PILOT_AUTH_KEY_TEST,
      officeId: SIMULATE_OFFICE_ID,
      placaNorm: PILOT_PLACA_TEST,
    }),
    false
  )
})

Deno.test('piloto real: autoriza��o j� consumida (api_called)', () => {
  assertEquals(
    avaliarEstadoAutorizacaoPiloto([
      { status: 'finalized', api_called: true },
    ]),
    'bloqueado_consumida'
  )
})

Deno.test('piloto real: estado incerto reconciliation_pending', () => {
  assertEquals(
    avaliarEstadoAutorizacaoPiloto([
      { status: 'reconciliation_pending', api_called: true },
    ]),
    'bloqueado_incerta'
  )
})

Deno.test('piloto real: mark_api_started replay n�o permite HTTP', () => {
  assertEquals(
    markApiStartedPermiteChamadaHttp({
      ok: true,
      idempotent_replay: true,
      api_called: true,
    }),
    false
  )
  assertEquals(
    markApiStartedPermiteChamadaHttp({ ok: true, api_called: true }),
    true
  )
})

Deno.test('piloto real: franquia esgotada no begin', async () => {
  await withPilotEnv(
    {
      [ENV_PLATE_LOOKUP_REAL_PILOT]: 'true',
      [ENV_PLATE_LOOKUP_REAL_PILOT_PLACA]: PILOT_PLACA_TEST,
      [ENV_PLATE_LOOKUP_REAL_PILOT_AUTH_KEY]: PILOT_AUTH_KEY_TEST,
      [ENV_API_PLACAS_TOKEN]: 'token-test',
      SUPABASE_URL: HOMOLOG_URL_TEST,
    },
    async () => {
      const res = await executarConsultaRealPiloto(
        {} as SupabaseClient,
        PILOT_PLACA_TEST,
        'client-key-quota',
        'req-quota',
        SIMULATE_OFFICE_ID,
        {
          rpcAcquire: async (eventId) => ({
            ok: true,
            payload: { ok: true, acquired: true, event_id: eventId },
          }),
          rpcBegin: async () => ({
            ok: true,
            payload: { ok: false, code: 'TRIAL_QUOTA_EXCEEDED' },
          }),
        }
      )
      assertEquals(res.status, 409)
      const body = await lerJson(res)
      assertEquals(body.code, 'TRIAL_QUOTA_EXCEEDED')
    }
  )
})

Deno.test('piloto real: reserva n�o concedida (begin ok=false)', async () => {
  await withPilotEnv(
    {
      [ENV_PLATE_LOOKUP_REAL_PILOT]: 'true',
      [ENV_PLATE_LOOKUP_REAL_PILOT_PLACA]: PILOT_PLACA_TEST,
      [ENV_PLATE_LOOKUP_REAL_PILOT_AUTH_KEY]: PILOT_AUTH_KEY_TEST,
      [ENV_API_PLACAS_TOKEN]: 'token-test',
      SUPABASE_URL: HOMOLOG_URL_TEST,
    },
    async () => {
      const res = await executarConsultaRealPiloto(
        {} as SupabaseClient,
        PILOT_PLACA_TEST,
        'client-key-deny',
        'req-deny',
        SIMULATE_OFFICE_ID,
        {
          rpcAcquire: async (eventId) => ({
            ok: true,
            payload: { ok: true, acquired: true, event_id: eventId },
          }),
          rpcBegin: async () => ({
            ok: false,
            mapped: {
              httpStatus: 503,
              code: 'PLATE_LOOKUP_BEGIN_FAILED',
              message: 'x',
            },
          }),
        }
      )
      assertEquals(res.status, 503)
    }
  )
})

Deno.test('piloto real: replay finalizado sucesso', async () => {
  await withPilotEnv(
    {
      [ENV_PLATE_LOOKUP_REAL_PILOT]: 'true',
      [ENV_PLATE_LOOKUP_REAL_PILOT_PLACA]: PILOT_PLACA_TEST,
      [ENV_PLATE_LOOKUP_REAL_PILOT_AUTH_KEY]: PILOT_AUTH_KEY_TEST,
      [ENV_API_PLACAS_TOKEN]: 'token-test',
      SUPABASE_URL: HOMOLOG_URL_TEST,
    },
    async () => {
      let apiCalls = 0
      const res = await executarConsultaRealPiloto(
        {} as SupabaseClient,
        PILOT_PLACA_TEST,
        'client-replay-ok',
        'req-replay',
        SIMULATE_OFFICE_ID,
        {
          rpcAcquire: async (eventId) => ({
            ok: true,
            payload: { ok: true, acquired: true, event_id: eventId },
          }),
          rpcBegin: async () => ({
            ok: true,
            payload: {
              ok: true,
              event_id: EVENT_ID_TEST,
              status: 'finalized',
              idempotent_replay: true,
              outcome: 'success',
              result_code: RESULT_CODE_REAL_OK,
              billing_kind: 'included',
              consumed: true,
              result_payload: {
                source: RESULT_SOURCE_REAL_PILOT,
                pilot: true,
                dados: {
                  placa: PILOT_PLACA_TEST,
                  marca: 'FIAT',
                  fonte: 'api_placas',
                },
              },
            },
          }),
          consultarApi: async () => {
            apiCalls++
            return { ok: true, dados: { placa: PILOT_PLACA_TEST, fonte: 'api_placas' } }
          },
        }
      )
      assertEquals(apiCalls, 0)
      assertEquals(res.status, 200)
      const body = await lerJson(res)
      assertEquals(body.code, RESULT_CODE_REAL_OK)
      assertEquals(body.simulacao, false)
    }
  )
})

Deno.test('piloto real: replay reserved api_called bloqueia fornecedor', async () => {
  await withPilotEnv(
    {
      [ENV_PLATE_LOOKUP_REAL_PILOT]: 'true',
      [ENV_PLATE_LOOKUP_REAL_PILOT_PLACA]: PILOT_PLACA_TEST,
      [ENV_PLATE_LOOKUP_REAL_PILOT_AUTH_KEY]: PILOT_AUTH_KEY_TEST,
      [ENV_API_PLACAS_TOKEN]: 'token-test',
      SUPABASE_URL: HOMOLOG_URL_TEST,
    },
    async () => {
      let apiCalls = 0
      const res = await executarConsultaRealPiloto(
        {} as SupabaseClient,
        PILOT_PLACA_TEST,
        'client-api-started',
        'req-started',
        SIMULATE_OFFICE_ID,
        {
          rpcAcquire: async (eventId) => ({
            ok: true,
            payload: { ok: true, acquired: true, event_id: eventId },
          }),
          rpcBegin: async () => ({
            ok: true,
            payload: {
              ok: true,
              event_id: EVENT_ID_TEST,
              status: 'reserved',
              idempotent_replay: true,
              allow_api_call: false,
              api_called: true,
              api_call_blocked_reason: 'API_ALREADY_STARTED',
            },
          }),
          consultarApi: async () => {
            apiCalls++
            return { ok: true, dados: { placa: PILOT_PLACA_TEST, fonte: 'api_placas' } }
          },
        }
      )
      assertEquals(apiCalls, 0)
      assertEquals(res.status, 409)
    }
  )
})

Deno.test('piloto real: segunda aquisi��o negada (grant j� held)', async () => {
  await withPilotEnv(
    {
      [ENV_PLATE_LOOKUP_REAL_PILOT]: 'true',
      [ENV_PLATE_LOOKUP_REAL_PILOT_PLACA]: PILOT_PLACA_TEST,
      [ENV_PLATE_LOOKUP_REAL_PILOT_AUTH_KEY]: PILOT_AUTH_KEY_TEST,
      [ENV_API_PLACAS_TOKEN]: 'token-test',
      SUPABASE_URL: HOMOLOG_URL_TEST,
    },
    async () => {
      let markCalls = 0
      const res = await executarConsultaRealPiloto(
        {} as SupabaseClient,
        PILOT_PLACA_TEST,
        'outra-idempotency-key',
        'req-2',
        SIMULATE_OFFICE_ID,
        {
          rpcBegin: async () => ({ ok: true, payload: beginReservado() }),
          rpcAcquire: async () => ({
            ok: true,
            payload: {
              ok: true,
              acquired: false,
              code: 'VENDOR_GRANT_ALREADY_HELD',
            },
          }),
          rpcMark: async () => {
            markCalls++
            return { ok: true, payload: { ok: true, api_called: true } }
          },
        }
      )
      assertEquals(markCalls, 0)
      assertEquals(res.status, 409)
      const body = await lerJson(res)
      assertEquals(body.code, 'REAL_PILOT_ALREADY_USED')
    }
  )
})

Deno.test('piloto real: mark replay idempotente bloqueia segunda chamada HTTP', async () => {
  await withPilotEnv(
    {
      [ENV_PLATE_LOOKUP_REAL_PILOT]: 'true',
      [ENV_PLATE_LOOKUP_REAL_PILOT_PLACA]: PILOT_PLACA_TEST,
      [ENV_PLATE_LOOKUP_REAL_PILOT_AUTH_KEY]: PILOT_AUTH_KEY_TEST,
      [ENV_API_PLACAS_TOKEN]: 'token-test',
      SUPABASE_URL: HOMOLOG_URL_TEST,
    },
    async () => {
      let apiCalls = 0
      const res = await executarConsultaRealPiloto(
        {} as SupabaseClient,
        PILOT_PLACA_TEST,
        'client-concurrent',
        'req-conc',
        SIMULATE_OFFICE_ID,
        {
          rpcAcquire: async (eventId) => ({
            ok: true,
            payload: { ok: true, acquired: true, event_id: eventId },
          }),
          rpcBegin: async () => ({ ok: true, payload: beginReservado() }),
          rpcMark: async () => ({
            ok: true,
            payload: {
              ok: true,
              idempotent_replay: true,
              api_called: true,
            },
          }),
          consultarApi: async () => {
            apiCalls++
            return { ok: true, dados: { placa: PILOT_PLACA_TEST, fonte: 'api_placas' } }
          },
        }
      )
      assertEquals(apiCalls, 0)
      assertEquals(res.status, 503)
    }
  )
})

Deno.test('piloto real: mark_api_started falha n�o chama fornecedor', async () => {
  await withPilotEnv(
    {
      [ENV_PLATE_LOOKUP_REAL_PILOT]: 'true',
      [ENV_PLATE_LOOKUP_REAL_PILOT_PLACA]: PILOT_PLACA_TEST,
      [ENV_PLATE_LOOKUP_REAL_PILOT_AUTH_KEY]: PILOT_AUTH_KEY_TEST,
      [ENV_API_PLACAS_TOKEN]: 'token-test',
      SUPABASE_URL: HOMOLOG_URL_TEST,
    },
    async () => {
      let apiCalls = 0
      const res = await executarConsultaRealPiloto(
        {} as SupabaseClient,
        PILOT_PLACA_TEST,
        'client-mark-fail',
        'req-mark',
        SIMULATE_OFFICE_ID,
        {
          rpcAcquire: async (eventId) => ({
            ok: true,
            payload: { ok: true, acquired: true, event_id: eventId },
          }),
          rpcBegin: async () => ({ ok: true, payload: beginReservado() }),
          rpcMark: async () => ({ ok: false, reason: 'rpc' }),
          consultarApi: async () => {
            apiCalls++
            return { ok: true, dados: { placa: PILOT_PLACA_TEST, fonte: 'api_placas' } }
          },
        }
      )
      assertEquals(apiCalls, 0)
      assertEquals(res.status, 503)
    }
  )
})

Deno.test('piloto real: sucesso fornecedor mock', async () => {
  await withPilotEnv(
    {
      [ENV_PLATE_LOOKUP_REAL_PILOT]: 'true',
      [ENV_PLATE_LOOKUP_REAL_PILOT_PLACA]: PILOT_PLACA_TEST,
      [ENV_PLATE_LOOKUP_REAL_PILOT_AUTH_KEY]: PILOT_AUTH_KEY_TEST,
      [ENV_API_PLACAS_TOKEN]: 'token-test',
      SUPABASE_URL: HOMOLOG_URL_TEST,
    },
    async () => {
      const res = await executarConsultaRealPiloto(
        {} as SupabaseClient,
        PILOT_PLACA_TEST,
        'client-ok',
        'req-ok',
        SIMULATE_OFFICE_ID,
        {
          rpcAcquire: async (eventId) => ({
            ok: true,
            payload: { ok: true, acquired: true, event_id: eventId },
          }),
          rpcBegin: async () => ({ ok: true, payload: beginReservado() }),
          rpcMark: async () => ({
            ok: true,
            payload: { ok: true, api_called: true },
          }),
          rpcFinalize: async () => ({
            ok: true,
            payload: {
              event_id: EVENT_ID_TEST,
              status: 'finalized',
              billing_kind: 'included',
              consumed: true,
            },
          }),
          consultarApi: async () => ({
            ok: true,
            dados: {
              placa: PILOT_PLACA_TEST,
              marca: 'FIAT',
              fonte: 'api_placas',
            },
          }),
        }
      )
      assertEquals(res.status, 200)
      const body = await lerJson(res)
      assertEquals(body.code, RESULT_CODE_REAL_OK)
      assertEquals(body.fonte, 'api_placas')
      assertEquals(body.consumed, true)
    }
  )
})

Deno.test('piloto real: placa n�o encontrada', async () => {
  await withPilotEnv(
    {
      [ENV_PLATE_LOOKUP_REAL_PILOT]: 'true',
      [ENV_PLATE_LOOKUP_REAL_PILOT_PLACA]: PILOT_PLACA_TEST,
      [ENV_PLATE_LOOKUP_REAL_PILOT_AUTH_KEY]: PILOT_AUTH_KEY_TEST,
      [ENV_API_PLACAS_TOKEN]: 'token-test',
      SUPABASE_URL: HOMOLOG_URL_TEST,
    },
    async () => {
      const res = await executarConsultaRealPiloto(
        {} as SupabaseClient,
        PILOT_PLACA_TEST,
        'client-nf',
        'req-nf',
        SIMULATE_OFFICE_ID,
        {
          rpcAcquire: async (eventId) => ({
            ok: true,
            payload: { ok: true, acquired: true, event_id: eventId },
          }),
          rpcBegin: async () => ({ ok: true, payload: beginReservado() }),
          rpcMark: async () => ({
            ok: true,
            payload: { ok: true, api_called: true },
          }),
          rpcFinalize: async (_id, mapped) => ({
            ok: true,
            payload: {
              event_id: EVENT_ID_TEST,
              status: 'finalized',
              billing_kind: 'none',
              consumed: false,
            },
          }),
          consultarApi: async () => ({
            ok: false,
            httpStatus: 404,
            code: 'PLATE_NOT_FOUND',
            message: 'x',
          }),
        }
      )
      assertEquals(res.status, 404)
      const body = await lerJson(res)
      assertEquals(body.consumed, false)
    }
  )
})

Deno.test('piloto real: timeout ? reconcilia��o pendente', async () => {
  await withPilotEnv(
    {
      [ENV_PLATE_LOOKUP_REAL_PILOT]: 'true',
      [ENV_PLATE_LOOKUP_REAL_PILOT_PLACA]: PILOT_PLACA_TEST,
      [ENV_PLATE_LOOKUP_REAL_PILOT_AUTH_KEY]: PILOT_AUTH_KEY_TEST,
      [ENV_API_PLACAS_TOKEN]: 'token-test',
      SUPABASE_URL: HOMOLOG_URL_TEST,
    },
    async () => {
      const res = await executarConsultaRealPiloto(
        {} as SupabaseClient,
        PILOT_PLACA_TEST,
        'client-to',
        'req-to',
        SIMULATE_OFFICE_ID,
        {
          rpcAcquire: async (eventId) => ({
            ok: true,
            payload: { ok: true, acquired: true, event_id: eventId },
          }),
          rpcBegin: async () => ({ ok: true, payload: beginReservado() }),
          rpcMark: async () => ({
            ok: true,
            payload: { ok: true, api_called: true },
          }),
          rpcFinalize: async () => ({
            ok: true,
            payload: {
              event_id: EVENT_ID_TEST,
              status: 'reconciliation_pending',
              billing_kind: 'pending_reconciliation',
              consumed: false,
            },
          }),
          consultarApi: async () => ({
            ok: false,
            httpStatus: 503,
            code: 'API_TIMEOUT',
            message: 'x',
          }),
        }
      )
      assertEquals(res.status, 503)
      const body = await lerJson(res)
      assertEquals(body.code, 'PLATE_LOOKUP_RECONCILIATION_PENDING')
    }
  )
})

Deno.test('piloto real: erro HTTP fornecedor', async () => {
  const mapped = mapearResultadoApiParaFinalize(
    {
      ok: false,
      httpStatus: 502,
      code: 'API_ERROR',
      message: 'x',
    },
    PILOT_PLACA_TEST
  )
  assertEquals(mapped.outcome, 'api_error')
  assertEquals(mapped.apiCalled, true)
})

Deno.test('piloto real: resposta inv�lida mapeia reconcilia��o', () => {
  const mapped = mapearResultadoApiParaFinalize(
    {
      ok: false,
      httpStatus: 502,
      code: 'API_INVALID_RESPONSE',
      message: 'x',
    },
    PILOT_PLACA_TEST
  )
  assertEquals(mapped.responseCode, 'PLATE_LOOKUP_RECONCILIATION_PENDING')
})

Deno.test('piloto real: falha finalize n�o declara sucesso', async () => {
  await withPilotEnv(
    {
      [ENV_PLATE_LOOKUP_REAL_PILOT]: 'true',
      [ENV_PLATE_LOOKUP_REAL_PILOT_PLACA]: PILOT_PLACA_TEST,
      [ENV_PLATE_LOOKUP_REAL_PILOT_AUTH_KEY]: PILOT_AUTH_KEY_TEST,
      [ENV_API_PLACAS_TOKEN]: 'token-test',
      SUPABASE_URL: HOMOLOG_URL_TEST,
    },
    async () => {
      const res = await executarConsultaRealPiloto(
        {} as SupabaseClient,
        PILOT_PLACA_TEST,
        'client-fin-fail',
        'req-fin',
        SIMULATE_OFFICE_ID,
        {
          rpcAcquire: async (eventId) => ({
            ok: true,
            payload: { ok: true, acquired: true, event_id: eventId },
          }),
          rpcBegin: async () => ({ ok: true, payload: beginReservado() }),
          rpcMark: async () => ({
            ok: true,
            payload: { ok: true, api_called: true },
          }),
          rpcFinalize: async () => ({ ok: false, reason: 'rpc' }),
          consultarApi: async () => ({
            ok: true,
            dados: { placa: PILOT_PLACA_TEST, marca: 'X', fonte: 'api_placas' },
          }),
        }
      )
      assertEquals(res.status, 503)
      const body = await lerJson(res)
      assertEquals(body.code, 'PLATE_LOOKUP_FINALIZE_PENDING')
    }
  )
})

Deno.test('piloto real: reconcilia��o pendente na aquisi��o bloqueia HTTP', async () => {
  await withPilotEnv(
    {
      [ENV_PLATE_LOOKUP_REAL_PILOT]: 'true',
      [ENV_PLATE_LOOKUP_REAL_PILOT_PLACA]: PILOT_PLACA_TEST,
      [ENV_PLATE_LOOKUP_REAL_PILOT_AUTH_KEY]: PILOT_AUTH_KEY_TEST,
      [ENV_API_PLACAS_TOKEN]: 'token-test',
      SUPABASE_URL: HOMOLOG_URL_TEST,
    },
    async () => {
      let markCalls = 0
      const res = await executarConsultaRealPiloto(
        {} as SupabaseClient,
        PILOT_PLACA_TEST,
        'client-incerto',
        'req-inc',
        SIMULATE_OFFICE_ID,
        {
          rpcBegin: async () => ({ ok: true, payload: beginReservado() }),
          rpcAcquire: async () => ({
            ok: true,
            payload: {
              ok: true,
              acquired: false,
              code: 'EVENT_RECONCILIATION_PENDING',
            },
          }),
          rpcMark: async () => {
            markCalls++
            return { ok: true, payload: { ok: true, api_called: true } }
          },
        }
      )
      assertEquals(markCalls, 0)
      assertEquals(res.status, 503)
    }
  )
})

Deno.test('piloto real: aquisi��o at�mica � interpreta��o e fetch gate', () => {
  const primeira = interpretarAquisicaoPilotoVendor({
    ok: true,
    acquired: true,
    event_id: EVENT_ID_TEST,
  })
  assertEquals(primeira.ok && primeira.acquired, true)
  const segunda = interpretarAquisicaoPilotoVendor({
    ok: true,
    acquired: false,
    code: 'VENDOR_GRANT_ALREADY_HELD',
  })
  assertEquals(
    segunda.ok && !segunda.acquired && segunda.blockCode === 'VENDOR_GRANT_ALREADY_HELD',
    true
  )
  assertEquals(
    pilotoVendorFetchPermitido(primeira, { ok: true, api_called: true }),
    true
  )
  assertEquals(
    pilotoVendorFetchPermitido(segunda, { ok: true, api_called: true }),
    false
  )
  assertEquals(
    pilotoVendorFetchPermitido(primeira, {
      ok: true,
      idempotent_replay: true,
      api_called: true,
    }),
    false
  )
})

Deno.test('piloto real: aquisi��o concorrente mock � exatamente uma autorizada', async () => {
  let acquireCount = 0
  const acquireMock = async () => {
    acquireCount++
    const acquired = acquireCount === 1
    return {
      ok: true as const,
      payload: {
        ok: true,
        acquired,
        code: acquired ? undefined : 'VENDOR_GRANT_ALREADY_HELD',
      },
    }
  }
  await withPilotEnv(
    {
      [ENV_PLATE_LOOKUP_REAL_PILOT]: 'true',
      [ENV_PLATE_LOOKUP_REAL_PILOT_PLACA]: PILOT_PLACA_TEST,
      [ENV_PLATE_LOOKUP_REAL_PILOT_AUTH_KEY]: PILOT_AUTH_KEY_TEST,
      [ENV_API_PLACAS_TOKEN]: 'token-test',
      SUPABASE_URL: HOMOLOG_URL_TEST,
    },
    async () => {
      const baseDeps: RealPilotTestDeps = {
        rpcBegin: async () => ({ ok: true, payload: beginReservado() }),
        rpcAcquire: acquireMock,
        rpcMark: async () => ({
          ok: true as const,
          payload: { ok: true, api_called: true },
        }),
        rpcFinalize: async () => ({
          ok: true as const,
          payload: {
            event_id: EVENT_ID_TEST,
            status: 'finalized',
            billing_kind: 'included',
            consumed: true,
          },
        }),
        consultarApi: async () => ({
          ok: true as const,
          dados: {
            placa: PILOT_PLACA_TEST,
            marca: 'FIAT',
            fonte: 'api_placas' as const,
          },
        }),
      }
      const [r1, r2] = await Promise.all([
        executarConsultaRealPiloto(
          {} as SupabaseClient,
          PILOT_PLACA_TEST,
          'c1',
          'req-a',
          SIMULATE_OFFICE_ID,
          baseDeps
        ),
        executarConsultaRealPiloto(
          {} as SupabaseClient,
          PILOT_PLACA_TEST,
          'c2',
          'req-b',
          SIMULATE_OFFICE_ID,
          baseDeps
        ),
      ])
      const okCount = [r1, r2].filter((r) => r.status === 200).length
      const deniedCount = [r1, r2].filter((r) => r.status === 409).length
      assertEquals(acquireCount, 2)
      assertEquals(okCount, 1)
      assertEquals(deniedCount, 1)
    }
  )
})

Deno.test('piloto real: falha RPC aquisi��o impede mark e HTTP', async () => {
  await withPilotEnv(
    {
      [ENV_PLATE_LOOKUP_REAL_PILOT]: 'true',
      [ENV_PLATE_LOOKUP_REAL_PILOT_PLACA]: PILOT_PLACA_TEST,
      [ENV_PLATE_LOOKUP_REAL_PILOT_AUTH_KEY]: PILOT_AUTH_KEY_TEST,
      [ENV_API_PLACAS_TOKEN]: 'token-test',
      SUPABASE_URL: HOMOLOG_URL_TEST,
    },
    async () => {
      let markCalls = 0
      let apiCalls = 0
      const res = await executarConsultaRealPiloto(
        {} as SupabaseClient,
        PILOT_PLACA_TEST,
        'client-acq-fail',
        'req-acq',
        SIMULATE_OFFICE_ID,
        {
          rpcBegin: async () => ({ ok: true, payload: beginReservado() }),
          rpcAcquire: async () => ({ ok: false, reason: 'rpc' }),
          rpcMark: async () => {
            markCalls++
            return { ok: true, payload: { ok: true, api_called: true } }
          },
          consultarApi: async () => {
            apiCalls++
            return { ok: true, dados: { placa: PILOT_PLACA_TEST, fonte: 'api_placas' } }
          },
        }
      )
      assertEquals(markCalls, 0)
      assertEquals(apiCalls, 0)
      assertEquals(res.status, 503)
    }
  )
})

Deno.test('simula��o ZZZ9Z99 permanece permitida com piloto env ligado', () => {
  withPilotEnv(
    {
      [ENV_PLATE_LOOKUP_REAL_PILOT]: 'true',
      [ENV_PLATE_LOOKUP_SIMULATE]: 'true',
      [ENV_PLATE_LOOKUP_ENABLED]: undefined,
      SUPABASE_URL: HOMOLOG_URL_TEST,
    },
    () => {
      assertEquals(simulacaoPermitida({
        homologUrl: HOMOLOG_URL_TEST,
        simulateEnv: 'true',
        enabledEnv: undefined,
        officeId: SIMULATE_OFFICE_ID,
        placaNorm: SIMULATE_PLACA,
      }), true)
      assertEquals(cenarioSimulacao(SIMULATE_PLACA_NOT_FOUND), 'not_found')
      assertEquals(cenarioSimulacao(SIMULATE_PLACA_TIMEOUT), 'timeout')
      assertEquals(cenarioSimulacao(SIMULATE_PLACA_API_ERROR), 'api_error')
    }
  )
})

Deno.test('simulacao: ZZZ9Z99 mantem dados ficticios originais', () => {
  const dados = dadosVeiculoSimulado(SIMULATE_PLACA)
  assertEquals(dados?.placa, SIMULATE_PLACA)
  assertEquals(dados?.modelo, 'VEICULO FICTICIO')
  assertEquals(dados?.ano, 2020)
  assertEquals(dados?.cor, 'CINZA')
  assertEquals(cenarioSimulacao(SIMULATE_PLACA), 'success')
})

Deno.test('simulacao: ZZZ9Z98 sucesso e dados consistentes', () => {
  assertEquals(cenarioSimulacao(SIMULATE_PLACA_SUCESSO_2), 'success')
  assertEquals(
    simulacaoPermitida({
      homologUrl: HOMOLOG_URL_TEST,
      simulateEnv: 'true',
      enabledEnv: undefined,
      officeId: SIMULATE_OFFICE_ID,
      placaNorm: SIMULATE_PLACA_SUCESSO_2,
    }),
    true
  )
  const dados = dadosVeiculoSimulado(SIMULATE_PLACA_SUCESSO_2)
  assertEquals(dados?.placa, SIMULATE_PLACA_SUCESSO_2)
  assertEquals(dados?.marca, 'SIMULADO')
  assertEquals(dados?.modelo, 'VEICULO FICTICIO 2')
  assertEquals(dados?.ano, 2021)
  assertEquals(dados?.cor, 'AZUL')
  assertEquals(dados?.combustivel, 'FLEX')
  assertEquals(dados?.municipio, 'HOMOLOG')
  assertEquals(dados?.uf, 'SP')
  assertEquals(dados?.fonte, 'simulacao_homolog')
})

function withCommercialEnv<T>(
  overrides: Record<string, string | undefined>,
  fn: () => T
): T {
  return withPilotEnv(
    {
      [ENV_PLATE_LOOKUP_REAL_PILOT]: undefined,
      [ENV_PLATE_LOOKUP_REAL_OFFICES]: COMMERCIAL_OFFICE_A,
      [ENV_API_PLACAS_TOKEN]: 'token-test',
      SUPABASE_URL: HOMOLOG_URL_TEST,
      ...overrides,
    },
    fn
  )
}

Deno.test('comercial: config ausente (allowlist vazia)', () => {
  withPilotEnv(
    {
      [ENV_PLATE_LOOKUP_REAL_OFFICES]: undefined,
      SUPABASE_URL: HOMOLOG_URL_TEST,
    },
    () => {
      assertEquals(parseRealOfficesAllowlist(undefined), null)
      assertEquals(
        classificarCandidatoConsultaRealComercial(COMMERCIAL_OFFICE_A),
        'nao_candidato'
      )
    }
  )
})

Deno.test('comercial: config inválida (UUID malformado na lista)', () => {
  withPilotEnv(
    {
      [ENV_PLATE_LOOKUP_REAL_OFFICES]: 'nao-e-uuid',
      SUPABASE_URL: HOMOLOG_URL_TEST,
    },
    () => {
      assertEquals(parseRealOfficesAllowlist('nao-e-uuid'), null)
      assertEquals(
        classificarCandidatoConsultaRealComercial(COMMERCIAL_OFFICE_A),
        'nao_candidato'
      )
    }
  )
})

Deno.test('comercial: oficina fora da allowlist', () => {
  withCommercialEnv({}, () => {
    assertEquals(
      classificarCandidatoConsultaRealComercial(COMMERCIAL_OFFICE_B),
      'nao_candidato'
    )
    assertEquals(
      deveNegarConsultaRealOficinaForaAllowlist(COMMERCIAL_OFFICE_B),
      true
    )
  })
})

Deno.test('comercial: token ausente com oficina na lista', () => {
  withCommercialEnv({ [ENV_API_PLACAS_TOKEN]: undefined }, () => {
    assertEquals(
      classificarCandidatoConsultaRealComercial(COMMERCIAL_OFFICE_A),
      'config_invalida'
    )
  })
})

Deno.test('comercial: oficina autorizada com quota — mock HTTP sucesso', async () => {
  await withCommercialEnv({}, async () => {
    let apiCalls = 0
    const res = await executarConsultaRealComercial(
      {} as SupabaseClient,
      COMMERCIAL_PLACA,
      'client-com-ok',
      'req-com-ok',
      {
        rpcBegin: async () => ({
          ok: true,
          payload: {
            ...beginReservado(),
            reserve_bucket: 'included',
          },
        }),
        rpcMark: async () => ({
          ok: true,
          payload: { ok: true, api_called: true },
        }),
        rpcFinalize: async () => ({
          ok: true,
          payload: {
            event_id: EVENT_ID_TEST,
            status: 'finalized',
            billing_kind: 'included',
            consumed: true,
          },
        }),
        consultarApi: async () => {
          apiCalls++
          return {
            ok: true,
            dados: {
              placa: COMMERCIAL_PLACA,
              marca: 'VW',
              fonte: 'api_placas',
            },
          }
        },
      }
    )
    assertEquals(apiCalls, 1)
    assertEquals(res.status, 200)
    const body = await lerJson(res)
    assertEquals(body.code, RESULT_CODE_REAL_OK)
    assertEquals(body.simulacao, false)
  })
})

Deno.test('comercial: sem quota — sem HTTP', async () => {
  await withCommercialEnv({}, async () => {
    let apiCalls = 0
    const res = await executarConsultaRealComercial(
      {} as SupabaseClient,
      COMMERCIAL_PLACA,
      'client-com-quota',
      'req-com-quota',
      {
        rpcBegin: async () => ({
          ok: true,
          payload: { ok: false, code: 'TRIAL_QUOTA_EXCEEDED' },
        }),
        consultarApi: async () => {
          apiCalls++
          return { ok: true, dados: { placa: COMMERCIAL_PLACA, fonte: 'api_placas' } }
        },
      }
    )
    assertEquals(apiCalls, 0)
    assertEquals(res.status, 403)
    const body = await lerJson(res)
    assertEquals(body.code, 'TRIAL_QUOTA_EXCEEDED')
  })
})

Deno.test('comercial: excedente pago bloqueado (NEEDS_OVERAGE_CONSENT)', async () => {
  await withCommercialEnv({}, async () => {
    let apiCalls = 0
    const res = await executarConsultaRealComercial(
      {} as SupabaseClient,
      COMMERCIAL_PLACA,
      'client-over',
      'req-over',
      {
        rpcBegin: async () => ({
          ok: true,
          payload: { ok: false, code: 'NEEDS_OVERAGE_CONSENT' },
        }),
        consultarApi: async () => {
          apiCalls++
          return { ok: true, dados: { placa: COMMERCIAL_PLACA, fonte: 'api_placas' } }
        },
      }
    )
    assertEquals(apiCalls, 0)
    const body = await lerJson(res)
    assertEquals(body.code, 'TRIAL_QUOTA_EXCEEDED')
  })
})

Deno.test('comercial: reserva bucket overage bloqueada', () => {
  const rej = avaliarReservaConsultaRealComercial({
    ok: true,
    event_id: EVENT_ID_TEST,
    reserve_bucket: 'overage',
  })
  assertEquals(rej.rejected, true)
  if (rej.rejected) {
    assertEquals(rej.code, 'TRIAL_QUOTA_EXCEEDED')
    assertEquals(rej.releaseEventId, EVENT_ID_TEST)
  }
})

Deno.test('comercial: replay idempotency sem segunda chamada HTTP', async () => {
  await withCommercialEnv({}, async () => {
    let apiCalls = 0
    const res = await executarConsultaRealComercial(
      {} as SupabaseClient,
      COMMERCIAL_PLACA,
      'client-replay-com',
      'req-replay-com',
      {
        rpcBegin: async () => ({
          ok: true,
          payload: {
            ok: true,
            event_id: EVENT_ID_TEST,
            status: 'finalized',
            idempotent_replay: true,
            outcome: 'success',
            result_code: RESULT_CODE_REAL_OK,
            billing_kind: 'included',
            consumed: true,
            result_payload: {
              source: 'plate-lookup-edge-real-commercial',
              commercial: true,
              dados: {
                placa: COMMERCIAL_PLACA,
                marca: 'VW',
                fonte: 'api_placas',
              },
            },
          },
        }),
        consultarApi: async () => {
          apiCalls++
          return { ok: true, dados: { placa: COMMERCIAL_PLACA, fonte: 'api_placas' } }
        },
      }
    )
    assertEquals(apiCalls, 0)
    assertEquals(res.status, 200)
  })
})

Deno.test('comercial: mark replay bloqueia segunda chamada HTTP', async () => {
  await withCommercialEnv({}, async () => {
    let apiCalls = 0
    const res = await executarConsultaRealComercial(
      {} as SupabaseClient,
      COMMERCIAL_PLACA,
      'client-mark-replay',
      'req-mreplay',
      {
        rpcBegin: async () => ({
          ok: true,
          payload: {
            ...beginReservado(),
            reserve_bucket: 'included',
            idempotent_replay: true,
            allow_api_call: false,
            api_called: true,
            api_call_blocked_reason: 'API_ALREADY_STARTED',
          },
        }),
        rpcMark: async () => ({ ok: true, payload: { ok: true, idempotent_replay: true } }),
        consultarApi: async () => {
          apiCalls++
          return { ok: true, dados: { placa: COMMERCIAL_PLACA, fonte: 'api_placas' } }
        },
      }
    )
    assertEquals(apiCalls, 0)
    assertEquals(res.status, 409)
  })
})

Deno.test('comercial: timeout fornecedor → reconciliação', async () => {
  await withCommercialEnv({}, async () => {
    const res = await executarConsultaRealComercial(
      {} as SupabaseClient,
      COMMERCIAL_PLACA,
      'client-timeout',
      'req-to',
      {
        rpcBegin: async () => ({
          ok: true,
          payload: { ...beginReservado(), reserve_bucket: 'included' },
        }),
        rpcMark: async () => ({ ok: true, payload: { ok: true, api_called: true } }),
        rpcFinalize: async () => ({
          ok: true,
          payload: {
            event_id: EVENT_ID_TEST,
            status: 'reconciliation_pending',
            billing_kind: 'pending_reconciliation',
          },
        }),
        consultarApi: async () => ({
          ok: false,
          httpStatus: 503,
          code: 'API_TIMEOUT',
          message: 'timeout',
        }),
      }
    )
    assertEquals(res.status, 503)
    const body = await lerJson(res)
    assertEquals(body.code, 'PLATE_LOOKUP_RECONCILIATION_PENDING')
  })
})

Deno.test('comercial: falha finalize', async () => {
  await withCommercialEnv({}, async () => {
    const res = await executarConsultaRealComercial(
      {} as SupabaseClient,
      COMMERCIAL_PLACA,
      'client-fin',
      'req-fin',
      {
        rpcBegin: async () => ({
          ok: true,
          payload: { ...beginReservado(), reserve_bucket: 'included' },
        }),
        rpcMark: async () => ({ ok: true, payload: { ok: true, api_called: true } }),
        rpcFinalize: async () => ({ ok: false, reason: 'rpc' }),
        consultarApi: async () => ({
          ok: true,
          dados: { placa: COMMERCIAL_PLACA, fonte: 'api_placas' },
        }),
      }
    )
    assertEquals(res.status, 503)
    const body = await lerJson(res)
    assertEquals(body.code, 'PLATE_LOOKUP_FINALIZE_PENDING')
  })
})

Deno.test('comercial: PLATE_LOOKUP_ENABLED não libera allowlist sozinho', () => {
  withCommercialEnv({ [ENV_PLATE_LOOKUP_ENABLED]: 'true' }, () => {
    assertEquals(consultaExternaHabilitada(), true)
    assertEquals(
      classificarCandidatoConsultaRealComercial(COMMERCIAL_OFFICE_A),
      'executar'
    )
  })
})

Deno.test('comercial: piloto técnico não dispara com REAL_PILOT ausente', () => {
  withCommercialEnv({}, () => {
    assertEquals(
      classificarCandidatoPilotoReal(SIMULATE_OFFICE_ID, PILOT_PLACA_TEST),
      'nao_candidato'
    )
  })
})

Deno.test('comercial: parse allowlist múltiplos UUIDs', () => {
  const raw = `${COMMERCIAL_OFFICE_A}, ${COMMERCIAL_OFFICE_B}`
  const set = parseRealOfficesAllowlist(raw)
  assertEquals(set?.has(COMMERCIAL_OFFICE_A.toLowerCase()), true)
  assertEquals(set?.has(COMMERCIAL_OFFICE_B.toLowerCase()), true)
})

Deno.test('comercial: mark replay bloqueia HTTP', () => {
  assertEquals(
    consultaRealComercialFetchPermitido({
      ok: true,
      idempotent_replay: true,
      api_called: true,
    }),
    false
  )
})

Deno.test('comercial: overage reservado dispara cancelamento sem HTTP', async () => {
  await withCommercialEnv({}, async () => {
    let cancelCalls = 0
    let apiCalls = 0
    await executarConsultaRealComercial(
      {} as SupabaseClient,
      COMMERCIAL_PLACA,
      'client-cancel-over',
      'req-cancel-over',
      {
        rpcBegin: async () => ({
          ok: true,
          payload: {
            ok: true,
            event_id: EVENT_ID_TEST,
            reserve_bucket: 'overage',
          },
        }),
        rpcCancel: async () => {
          cancelCalls++
          return { ok: true, payload: { status: 'cancelled' } }
        },
        consultarApi: async () => {
          apiCalls++
          return { ok: true, dados: { placa: COMMERCIAL_PLACA, fonte: 'api_placas' } }
        },
      }
    )
    assertEquals(cancelCalls, 1)
    assertEquals(apiCalls, 0)
  })
})

Deno.test('comercial: falha mark não chama fornecedor', async () => {
  await withCommercialEnv({}, async () => {
    let apiCalls = 0
    const res = await executarConsultaRealComercial(
      {} as SupabaseClient,
      COMMERCIAL_PLACA,
      'client-mark-fail',
      'req-mark-fail',
      {
        rpcBegin: async () => ({
          ok: true,
          payload: { ...beginReservado(), reserve_bucket: 'included' },
        }),
        rpcMark: async () => ({ ok: false, reason: 'rpc' }),
        consultarApi: async () => {
          apiCalls++
          return { ok: true, dados: { placa: COMMERCIAL_PLACA, fonte: 'api_placas' } }
        },
      }
    )
    assertEquals(apiCalls, 0)
    assertEquals(res.status, 503)
  })
})

Deno.test('comercial: allowlist UUID duplicado deduplica', () => {
  const raw = `${COMMERCIAL_OFFICE_A}, ${COMMERCIAL_OFFICE_A}`
  const set = parseRealOfficesAllowlist(raw)
  assertEquals(set?.size, 1)
})

Deno.test('segurança handler: JWT ausente', async () => {
  const req = postPlateLookup({
    placa: COMMERCIAL_PLACA,
    idempotency_key: VALID_IDEMP_KEY,
  })
  const { res, comercialCalls } = await handlerComReenv(
    {
      [ENV_PLATE_LOOKUP_REAL_OFFICES]: COMMERCIAL_OFFICE_A,
      [ENV_API_PLACAS_TOKEN]: 'token-test',
    },
    req,
    createMockUserSb({
      authenticated: true,
      active: true,
      officeId: COMMERCIAL_OFFICE_A,
      officeExists: true,
      membership: true,
    })
  )
  assertEquals(res.status, 401)
  assertEquals(comercialCalls, 0)
})

Deno.test('segurança handler: JWT inválido', async () => {
  const req = postPlateLookup(
    { placa: COMMERCIAL_PLACA, idempotency_key: VALID_IDEMP_KEY },
    'Bearer token-invalido'
  )
  const { res, comercialCalls } = await handlerComReenv(
    {
      [ENV_PLATE_LOOKUP_REAL_OFFICES]: COMMERCIAL_OFFICE_A,
      [ENV_API_PLACAS_TOKEN]: 'token-test',
    },
    req,
    createMockUserSb({
      authenticated: false,
      active: true,
      officeId: COMMERCIAL_OFFICE_A,
      officeExists: true,
      membership: true,
    })
  )
  assertEquals(res.status, 401)
  assertEquals(comercialCalls, 0)
})

Deno.test('segurança handler: perfil inativo', async () => {
  const req = postPlateLookup(
    { placa: COMMERCIAL_PLACA, idempotency_key: VALID_IDEMP_KEY },
    'Bearer ok'
  )
  const { res, comercialCalls } = await handlerComReenv(
    {
      [ENV_PLATE_LOOKUP_REAL_OFFICES]: COMMERCIAL_OFFICE_A,
      [ENV_API_PLACAS_TOKEN]: 'token-test',
    },
    req,
    createMockUserSb({
      authenticated: true,
      active: false,
      officeId: COMMERCIAL_OFFICE_A,
      officeExists: true,
      membership: true,
    })
  )
  assertEquals(res.status, 403)
  assertEquals(comercialCalls, 0)
})

Deno.test('segurança handler: sem vínculo com oficina', async () => {
  const req = postPlateLookup(
    { placa: COMMERCIAL_PLACA, idempotency_key: VALID_IDEMP_KEY },
    'Bearer ok'
  )
  const { res, comercialCalls } = await handlerComReenv(
    {
      [ENV_PLATE_LOOKUP_REAL_OFFICES]: COMMERCIAL_OFFICE_A,
      [ENV_API_PLACAS_TOKEN]: 'token-test',
    },
    req,
    createMockUserSb({
      authenticated: true,
      active: true,
      officeId: COMMERCIAL_OFFICE_A,
      officeExists: true,
      membership: false,
    })
  )
  assertEquals(res.status, 403)
  assertEquals(comercialCalls, 0)
})

Deno.test('segurança handler: oficina fora da allowlist', async () => {
  const req = postPlateLookup(
    { placa: COMMERCIAL_PLACA, idempotency_key: VALID_IDEMP_KEY },
    'Bearer ok'
  )
  const { res, comercialCalls } = await handlerComReenv(
    {
      [ENV_PLATE_LOOKUP_REAL_OFFICES]: COMMERCIAL_OFFICE_A,
      [ENV_API_PLACAS_TOKEN]: 'token-test',
    },
    req,
    createMockUserSb({
      authenticated: true,
      active: true,
      officeId: COMMERCIAL_OFFICE_B,
      officeExists: true,
      membership: true,
    })
  )
  assertEquals(res.status, 403)
  const body = await lerJson(res)
  assertEquals(body.code, 'REAL_COMMERCIAL_OFFICE_DENIED')
  assertEquals(comercialCalls, 0)
})

Deno.test('segurança handler: office_id no body não autoriza outra oficina', async () => {
  const req = postPlateLookup(
    {
      placa: COMMERCIAL_PLACA,
      idempotency_key: VALID_IDEMP_KEY,
      office_id: COMMERCIAL_OFFICE_A,
    },
    'Bearer ok'
  )
  const { res, comercialCalls } = await handlerComReenv(
    {
      [ENV_PLATE_LOOKUP_REAL_OFFICES]: COMMERCIAL_OFFICE_A,
      [ENV_API_PLACAS_TOKEN]: 'token-test',
    },
    req,
    createMockUserSb({
      authenticated: true,
      active: true,
      officeId: COMMERCIAL_OFFICE_B,
      officeExists: true,
      membership: true,
    })
  )
  assertEquals(comercialCalls, 0)
  const body = await lerJson(res)
  assertEquals(body.code, 'REAL_COMMERCIAL_OFFICE_DENIED')
})

Deno.test('segurança handler: enabled no body não dispara comercial sozinho', async () => {
  const req = postPlateLookup(
    {
      placa: COMMERCIAL_PLACA,
      idempotency_key: VALID_IDEMP_KEY,
      enabled: true,
      simulate: true,
    },
    'Bearer ok'
  )
  const { res, comercialCalls } = await handlerComReenv(
    {
      [ENV_PLATE_LOOKUP_REAL_OFFICES]: undefined,
      [ENV_API_PLACAS_TOKEN]: 'token-test',
    },
    req,
    createMockUserSb({
      authenticated: true,
      active: true,
      officeId: COMMERCIAL_OFFICE_B,
      officeExists: true,
      membership: true,
    })
  )
  assertEquals(comercialCalls, 0)
  assertEquals(res.status, 503)
  const body = await lerJson(res)
  assertEquals(body.code, 'PLATE_LOOKUP_DISABLED')
})

Deno.test('segurança handler: PLATE_LOOKUP_ENABLED bloqueia comercial', async () => {
  const req = postPlateLookup(
    { placa: COMMERCIAL_PLACA, idempotency_key: VALID_IDEMP_KEY },
    'Bearer ok'
  )
  const { res, comercialCalls } = await handlerComReenv(
    {
      [ENV_PLATE_LOOKUP_REAL_OFFICES]: COMMERCIAL_OFFICE_A,
      [ENV_API_PLACAS_TOKEN]: 'token-test',
      [ENV_PLATE_LOOKUP_ENABLED]: 'true',
    },
    req,
    createMockUserSb({
      authenticated: true,
      active: true,
      officeId: COMMERCIAL_OFFICE_A,
      officeExists: true,
      membership: true,
    })
  )
  assertEquals(comercialCalls, 0)
  assertEquals(res.status, 503)
  const body = await lerJson(res)
  assertEquals(body.code, 'PLATE_LOOKUP_REAL_MODE_BLOCKED')
})

Deno.test('prioridade: simulação vence comercial na mesma oficina fictícia', () => {
  withCommercialEnv(
    {
      [ENV_PLATE_LOOKUP_SIMULATE]: 'true',
      [ENV_PLATE_LOOKUP_REAL_OFFICES]: SIMULATE_OFFICE_ID,
    },
    () => {
      assertEquals(
        simulacaoPermitida({
          homologUrl: HOMOLOG_URL_TEST,
          simulateEnv: 'true',
          enabledEnv: undefined,
          officeId: SIMULATE_OFFICE_ID,
          placaNorm: SIMULATE_PLACA,
        }),
        true
      )
      assertEquals(
        classificarCandidatoConsultaRealComercial(SIMULATE_OFFICE_ID),
        'executar'
      )
    }
  )
})

Deno.test('prioridade: piloto técnico não dispara se REAL_PILOT desligado', () => {
  withCommercialEnv(
    {
      [ENV_PLATE_LOOKUP_REAL_PILOT]: undefined,
      [ENV_PLATE_LOOKUP_REAL_OFFICES]: COMMERCIAL_OFFICE_A,
    },
    () => {
      assertEquals(
        classificarCandidatoPilotoReal(SIMULATE_OFFICE_ID, PILOT_PLACA_TEST),
        'nao_candidato'
      )
    }
  )
})

Deno.test('comercial: mapear finalize usa source comercial', () => {
  const mapped = mapearResultadoApiParaFinalize(
    { ok: true, dados: { placa: COMMERCIAL_PLACA, fonte: 'api_placas' } },
    COMMERCIAL_PLACA,
    'commercial'
  )
  const payload = mapped.resultPayload as Record<string, unknown>
  assertEquals(payload.source, 'plate-lookup-edge-real-commercial')
  assertEquals(payload.commercial, true)
})

Deno.test('simulacao: replay aceita payload persistido de ZZZ9Z98', () => {
  const dados = dadosVeiculoSimulado(SIMULATE_PLACA_SUCESSO_2)
  if (!dados) throw new Error('dados simulados ausentes')
  const payload = {
    status: 'finalized',
    outcome: 'success',
    billing_kind: 'none',
    consumed: false,
    result_code: 'homolog_edge_simulate_no_api',
    result_payload: {
      source: 'plate-lookup-edge-simulate',
      dados,
    },
  }
  assertEquals(dadosSimuladosPersistidos(payload)?.placa, SIMULATE_PLACA_SUCESSO_2)
})
