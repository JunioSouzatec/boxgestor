/**
 * Testes da notificação admin de nova oficina (lógica pura + mocks).
 * Sem chamada real ao Resend.
 *
 * Executar:
 *   npx tsx --tsconfig tsconfig.app.json scripts/verificar-notificacao-nova-oficina.ts
 */
import assert from 'node:assert/strict'
import {
  META_EMAIL_EM,
  META_EMAIL_ID,
  WEBHOOK_SECRET_HEADER,
  alreadyNotified,
  buildEmailHtml,
  buildIdempotencyKey,
  buildNotifyData,
  displayOrFallback,
  mergeEmailMarker,
  parseOfficesInsertPayload,
  processNovaOficinaNotify,
  secretsMatch,
  type ProcessDeps,
} from '../supabase/functions/notify-admin-nova-oficina/logic.ts'

const OFFICE_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee1'
const SECRET = 'test-webhook-secret-homolog-only'
const RESEND_KEY = 're_test_not_real'

type SendCall = {
  idempotencyKey: string
  from: string
  to: string
  subject: string
  html: string
}

function baseInsertPayload(overrides: Record<string, unknown> = {}) {
  return {
    type: 'INSERT',
    table: 'offices',
    schema: 'public',
    record: {
      id: OFFICE_ID,
      name: 'Brant Garage',
      phone: '11999990000',
      plan_tier: 'trial',
      trial_started_at: '2026-09-22T22:45:00.000Z',
      trial_ends_at: '2026-10-07T22:45:00.000Z',
      created_at: '2026-09-22T22:45:00.000Z',
    },
    old_record: null,
    ...overrides,
  }
}

function completeBundle(meta: Record<string, unknown> = {}) {
  return {
    office: {
      id: OFFICE_ID,
      name: 'Brant Garage',
      phone: '11999990000',
      plan_tier: 'trial',
      trial_started_at: '2026-09-22T22:45:00.000Z',
      trial_ends_at: '2026-10-07T22:45:00.000Z',
      created_at: '2026-09-22T22:45:00.000Z',
    },
    owner: {
      id: 'bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeee2',
      full_name: 'Pedro Felipe',
      email: 'pedro@example.com',
      role: 'owner',
      office_id: OFFICE_ID,
    },
    settings: {
      metadata: {
        cadastro_publico: true,
        trial_dias: 15,
        tipo_oficina: 'carros',
        ...meta,
      },
    },
  }
}

function makeDeps(opts: {
  bundle?: ReturnType<typeof completeBundle> | null
  sendFail?: boolean
  markFail?: boolean
  sends?: SendCall[]
  env?: Record<string, string>
}): ProcessDeps {
  const sends = opts.sends ?? []
  const env: Record<string, string> = {
    ADMIN_OFFICE_WEBHOOK_SECRET: SECRET,
    RESEND_API_KEY: RESEND_KEY,
    ADMIN_NOTIFY_TO: 'contato@useboxgestor.com.br',
    ADMIN_NOTIFY_FROM: 'BoxGestor <contato@useboxgestor.com.br>',
    ...(opts.env ?? {}),
  }

  return {
    nowIso: () => '2026-09-22T22:46:00.000Z',
    sleep: async () => {},
    getEnv: (k) => env[k],
    log: () => {},
    loadOfficeBundle: async () => {
      if (opts.bundle === null) {
        return { office: null, owner: null, settings: null }
      }
      return opts.bundle ?? completeBundle()
    },
    markNotified: async () => {
      if (opts.markFail) throw new Error('marker failed')
    },
    sendResend: async (input) => {
      if (opts.sendFail) throw new Error('resend down')
      sends.push(input)
      return { id: 'email_test_001' }
    },
  }
}

async function run(): Promise<void> {
  // --- helpers unitários ---
  assert.equal(secretsMatch(SECRET, SECRET), true)
  assert.equal(secretsMatch(SECRET, 'wrong'), false)
  assert.equal(secretsMatch(SECRET, null), false)
  assert.equal(buildIdempotencyKey(OFFICE_ID), `boxgestor-nova-oficina/${OFFICE_ID}`)
  assert.equal(displayOrFallback(''), 'Não informado')
  assert.equal(displayOrFallback(null), 'Não informado')

  const parsedOk = parseOfficesInsertPayload(baseInsertPayload())
  assert.equal(parsedOk.ok, true)
  if (parsedOk.ok) assert.equal(parsedOk.officeId, OFFICE_ID)

  const parsedBad = parseOfficesInsertPayload({ type: 'UPDATE', table: 'offices', record: { id: OFFICE_ID } })
  assert.equal(parsedBad.ok, false)

  // A) payload INSERT válido → prepara 1 envio
  {
    const sends: SendCall[] = []
    const r = await processNovaOficinaNotify(
      { secretHeader: SECRET, body: baseInsertPayload() },
      makeDeps({ sends }),
    )
    assert.equal(r.ok, true)
    if (r.ok && 'sent' in r) {
      assert.equal(r.sent, true)
      assert.equal(r.office_id, OFFICE_ID)
    }
    assert.equal(sends.length, 1)
    assert.match(sends[0]!.html, /Brant Garage/)
    assert.match(sends[0]!.html, /Pedro Felipe/)
    assert.match(sends[0]!.html, /Oficina de carros/)
    assert.equal(sends[0]!.subject, 'Nova oficina cadastrada no BoxGestor')
  }

  // B) payload inválido → zero envio
  {
    const sends: SendCall[] = []
    const r = await processNovaOficinaNotify(
      { secretHeader: SECRET, body: { type: 'INSERT', table: 'profiles', record: { id: OFFICE_ID } } },
      makeDeps({ sends }),
    )
    assert.equal(r.ok, false)
    if (!r.ok) assert.equal(r.status, 400)
    assert.equal(sends.length, 0)
  }

  // C) secret errado → 401 / zero envio
  {
    const sends: SendCall[] = []
    const r = await processNovaOficinaNotify(
      { secretHeader: 'wrong-secret', body: baseInsertPayload() },
      makeDeps({ sends }),
    )
    assert.equal(r.ok, false)
    if (!r.ok) assert.equal(r.status, 401)
    assert.equal(sends.length, 0)
  }

  // D) marker já existe → zero envio
  {
    const sends: SendCall[] = []
    const r = await processNovaOficinaNotify(
      { secretHeader: SECRET, body: baseInsertPayload() },
      makeDeps({
        sends,
        bundle: completeBundle({
          [META_EMAIL_EM]: '2026-09-22T22:45:30.000Z',
          [META_EMAIL_ID]: 'email_prev',
        }),
      }),
    )
    assert.equal(r.ok, true)
    if (r.ok && 'already_notified' in r) {
      assert.equal(r.already_notified, true)
    }
    assert.equal(sends.length, 0)
    assert.equal(alreadyNotified({ [META_EMAIL_EM]: 'x' }), true)
  }

  // E) retry mesmo office_id → mesma idempotency key
  {
    const sends: SendCall[] = []
    const deps = makeDeps({ sends })
    await processNovaOficinaNotify({ secretHeader: SECRET, body: baseInsertPayload() }, deps)
    // simula retry sem marker (provider Idempotency-Key)
    await processNovaOficinaNotify({ secretHeader: SECRET, body: baseInsertPayload() }, deps)
    assert.equal(sends.length, 2)
    assert.equal(sends[0]!.idempotencyKey, sends[1]!.idempotencyKey)
    assert.equal(sends[0]!.idempotencyKey, buildIdempotencyKey(OFFICE_ID))
  }

  // F) provider falha → erro controlado; “cadastro” (bundle) não é tocado
  {
    const sends: SendCall[] = []
    let marked = false
    const deps = makeDeps({ sends, sendFail: true })
    deps.markNotified = async () => {
      marked = true
    }
    const r = await processNovaOficinaNotify(
      { secretHeader: SECRET, body: baseInsertPayload() },
      deps,
    )
    assert.equal(r.ok, false)
    if (!r.ok) {
      assert.equal(r.status, 502)
      assert.equal(r.retryable, true)
    }
    assert.equal(sends.length, 0)
    assert.equal(marked, false)
  }

  // G) metadata existente → preservado ao adicionar marker
  {
    const merged = mergeEmailMarker(
      { cadastro_publico: true, trial_dias: 15, tipo_oficina: 'motos' },
      '2026-09-22T22:46:00.000Z',
      'email_test_001',
    )
    assert.equal(merged.cadastro_publico, true)
    assert.equal(merged.trial_dias, 15)
    assert.equal(merged.tipo_oficina, 'motos')
    assert.equal(merged[META_EMAIL_EM], '2026-09-22T22:46:00.000Z')
    assert.equal(merged[META_EMAIL_ID], 'email_test_001')
  }

  // H) dados opcionais ausentes → e-mail válido com "Não informado"
  {
    const data = buildNotifyData({
      office: {
        id: OFFICE_ID,
        name: 'Oficina Sem Dados',
        phone: '',
        plan_tier: 'trial',
        trial_started_at: null,
        trial_ends_at: null,
        created_at: '2026-09-22T22:45:00.000Z',
      },
      owner: {
        id: 'owner-1',
        full_name: '',
        email: null,
        role: 'owner',
      },
      settings: { metadata: {} },
    })
    assert.equal(data.telefone, 'Não informado')
    assert.equal(data.responsavel, 'Não informado')
    assert.equal(data.email, 'Não informado')
    assert.equal(data.tipo, 'Não informado')
    assert.equal(data.trial_started_at, 'Não informado')
    const html = buildEmailHtml(data)
    assert.match(html, /Não informado/)
    assert.match(html, /Oficina Sem Dados/)
    assert.doesNotMatch(html, /password|token|Bearer/i)
  }

  // header name documentado
  assert.equal(WEBHOOK_SECRET_HEADER, 'x-boxgestor-webhook-secret')

  console.log('verificar-notificacao-nova-oficina: OK (A–H)')
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
