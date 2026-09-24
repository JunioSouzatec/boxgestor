/**
 * Testes da notificação admin de nova oficina (lógica pura + mocks).
 * Sem chamada real ao Resend.
 *
 * Executar:
 *   npx tsx --tsconfig tsconfig.app.json scripts/verificar-notificacao-nova-oficina.ts
 */
import assert from 'node:assert/strict'
import {
  FALLBACK,
  META_EMAIL_EM,
  META_EMAIL_ID,
  WEBHOOK_SECRET_HEADER,
  alreadyNotified,
  buildEmailHtml,
  buildIdempotencyKey,
  buildNotifyData,
  displayOrFallback,
  formatDateTimeBr,
  mergeEmailMarker,
  parseOfficesInsertPayload,
  processNovaOficinaNotify,
  secretsMatch,
  type OfficeBundle,
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

function completeBundle(meta: Record<string, unknown> = {}): OfficeBundle {
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

/** Settings existe sem tipo_oficina (estado tipico pos-RPC, pre-gravarTipo). */
function bundleSemTipo(): OfficeBundle {
  const b = completeBundle()
  const meta = { ...(b.settings!.metadata ?? {}) }
  delete meta.tipo_oficina
  return { ...b, settings: { metadata: meta } }
}

function makeDeps(opts: {
  bundle?: OfficeBundle | null
  loadSequence?: OfficeBundle[]
  sendFail?: boolean
  markFail?: boolean
  sends?: SendCall[]
  env?: Record<string, string>
  logs?: Array<{ message: string; detail?: unknown }>
}): ProcessDeps {
  const sends = opts.sends ?? []
  const logs = opts.logs ?? []
  const env: Record<string, string> = {
    ADMIN_OFFICE_WEBHOOK_SECRET: SECRET,
    RESEND_API_KEY: RESEND_KEY,
    ADMIN_NOTIFY_TO: 'contato@useboxgestor.com.br',
    ADMIN_NOTIFY_FROM: 'BoxGestor <contato@useboxgestor.com.br>',
    ...(opts.env ?? {}),
  }
  let loadIdx = 0

  return {
    nowIso: () => '2026-09-22T22:46:00.000Z',
    sleep: async () => {},
    getEnv: (k) => env[k],
    log: (message, detail) => {
      logs.push({ message, detail })
    },
    loadOfficeBundle: async () => {
      if (opts.loadSequence) {
        const next = opts.loadSequence[Math.min(loadIdx, opts.loadSequence.length - 1)]!
        loadIdx += 1
        return next
      }
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
  assert.equal(displayOrFallback(''), FALLBACK)
  assert.equal(displayOrFallback(null), FALLBACK)

  // A) timestamp UTC → America/Sao_Paulo
  assert.equal(formatDateTimeBr('2026-09-24T00:40:48.940933Z'), '23/09/2026 21:40')
  assert.equal(formatDateTimeBr('2026-09-23T21:40:00.000Z'), '23/09/2026 18:40')

  const parsedOk = parseOfficesInsertPayload(baseInsertPayload())
  assert.equal(parsedOk.ok, true)
  if (parsedOk.ok) assert.equal(parsedOk.officeId, OFFICE_ID)

  const parsedBad = parseOfficesInsertPayload({ type: 'UPDATE', table: 'offices', record: { id: OFFICE_ID } })
  assert.equal(parsedBad.ok, false)

  // B) tipo_oficina já disponível na primeira leitura
  {
    const sends: SendCall[] = []
    const r = await processNovaOficinaNotify(
      { secretHeader: SECRET, body: baseInsertPayload() },
      makeDeps({ sends, bundle: completeBundle({ tipo_oficina: 'motos' }) }),
    )
    assert.equal(r.ok, true)
    assert.equal(sends.length, 1)
    assert.match(sends[0]!.html, /Oficina de motos/)
  }

  // C) settings existe sem tipo_oficina (ainda); se nunca chega → fallback
  {
    const sends: SendCall[] = []
    const logs: Array<{ message: string; detail?: unknown }> = []
    const r = await processNovaOficinaNotify(
      { secretHeader: SECRET, body: baseInsertPayload() },
      makeDeps({ sends, logs, bundle: bundleSemTipo() }),
    )
    assert.equal(r.ok, true)
    assert.equal(sends.length, 1)
    assert.match(sends[0]!.html, /Não informado/)
    assert.ok(logs.some((l) => l.message.includes('tipo_oficina ausente')))
  }

  // D) tipo_oficina aparece numa tentativa posterior
  {
    const sends: SendCall[] = []
    const seq = [
      bundleSemTipo(),
      bundleSemTipo(),
      completeBundle({ tipo_oficina: 'motos' }),
    ]
    const r = await processNovaOficinaNotify(
      { secretHeader: SECRET, body: baseInsertPayload() },
      makeDeps({ sends, loadSequence: seq }),
    )
    assert.equal(r.ok, true)
    assert.equal(sends.length, 1)
    assert.match(sends[0]!.html, /Oficina de motos/)
  }

  // E) timeout sem tipo_oficina mantém fallback "Não informado"
  {
    const data = buildNotifyData({
      office: {
        id: OFFICE_ID,
        name: 'Oficina Sem Tipo',
        phone: '11',
        plan_tier: 'trial',
        trial_started_at: '2026-09-24T00:40:48.940933Z',
        trial_ends_at: '2026-10-09T00:40:48.940933Z',
        created_at: '2026-09-24T00:40:48.940933Z',
      },
      owner: { id: 'o1', full_name: 'X', email: 'x@y.com', role: 'owner' },
      settings: { metadata: { cadastro_publico: true } },
    })
    assert.equal(data.tipo, FALLBACK)
    assert.equal(data.created_at, '23/09/2026 21:40')
    assert.equal(data.trial_started_at, '23/09/2026 21:40')
  }

  // F) idempotência continua impedindo segundo envio (marker)
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
    if (r.ok && 'already_notified' in r) assert.equal(r.already_notified, true)
    assert.equal(sends.length, 0)
    assert.equal(alreadyNotified({ [META_EMAIL_EM]: 'x' }), true)
  }

  // G) markers só após sucesso (provider falha → zero mark)
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

  // --- regressões anteriores ---
  {
    const sends: SendCall[] = []
    const r = await processNovaOficinaNotify(
      { secretHeader: SECRET, body: baseInsertPayload() },
      makeDeps({ sends }),
    )
    assert.equal(r.ok, true)
    assert.equal(sends.length, 1)
    assert.match(sends[0]!.html, /Oficina de carros/)
  }

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

  {
    const sends: SendCall[] = []
    const deps = makeDeps({ sends })
    await processNovaOficinaNotify({ secretHeader: SECRET, body: baseInsertPayload() }, deps)
    await processNovaOficinaNotify({ secretHeader: SECRET, body: baseInsertPayload() }, deps)
    assert.equal(sends.length, 2)
    assert.equal(sends[0]!.idempotencyKey, sends[1]!.idempotencyKey)
  }

  {
    const merged = mergeEmailMarker(
      { cadastro_publico: true, trial_dias: 15, tipo_oficina: 'motos' },
      '2026-09-22T22:46:00.000Z',
      'email_test_001',
    )
    assert.equal(merged.tipo_oficina, 'motos')
    assert.equal(merged[META_EMAIL_EM], '2026-09-22T22:46:00.000Z')
    assert.equal(merged[META_EMAIL_ID], 'email_test_001')
  }

  {
    const html = buildEmailHtml(
      buildNotifyData({
        office: {
          id: OFFICE_ID,
          name: 'Oficina Sem Dados',
          phone: '',
          plan_tier: 'trial',
          trial_started_at: null,
          trial_ends_at: null,
          created_at: '2026-09-22T22:45:00.000Z',
        },
        owner: { id: 'owner-1', full_name: '', email: null, role: 'owner' },
        settings: { metadata: {} },
      }),
    )
    assert.match(html, /Não informado/)
    assert.doesNotMatch(html, /password|token|Bearer/i)
  }

  assert.equal(WEBHOOK_SECRET_HEADER, 'x-boxgestor-webhook-secret')

  console.log('verificar-notificacao-nova-oficina: OK (A–G + regressão)')
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
