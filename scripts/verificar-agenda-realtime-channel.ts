import assert from 'node:assert/strict'
import {
  TABELAS_REALTIME_OFFICE,
  appointmentsEstaNoBinding,
  bindingsRealtimeUnicos,
  classificarHttp400,
  cleanupDeveRemoverChannel,
  listarBindingsRealtime,
  logRealtimeStatus,
  nomeChannelRealtimeOffice,
  pathHttpSanitizado,
  sanitizarMotivoRealtime,
  statusRealtimeVisivel,
  textoStatusRealtime,
  iniciarObservacaoRealtime,
  pararObservacaoRealtime,
} from '../src/services/sync/realtime-diagnostico.ts'

const OFFICE_UUID = 'fdd4e82f-2a03-4cd7-9340-b5f067d2fed5'
const CHANNEL = nomeChannelRealtimeOffice(OFFICE_UUID)

type FakeChannel = {
  id: string
  bindings: string[]
  status: string
  removido: boolean
}

function criarCicloChannel() {
  let geracao = 0
  let ativo: FakeChannel | null = null

  function subscribe(): { geracao: number; channel: FakeChannel } {
    geracao += 1
    const channel: FakeChannel = {
      id: `ch-${geracao}`,
      bindings: [...TABELAS_REALTIME_OFFICE],
      status: 'SUBSCRIBED',
      removido: false,
    }
    ativo = channel
    return { geracao, channel }
  }

  function cleanupAtual(channelCleanup: FakeChannel): FakeChannel | null {
    if (ativo) ativo.removido = true
    ativo = null
    void channelCleanup
    return ativo
  }

  function cleanupSeguro(
    geracaoCleanup: number,
    channelCleanup: FakeChannel
  ): FakeChannel | null {
    if (
      !cleanupDeveRemoverChannel({
        geracaoCleanup,
        geracaoAtiva: geracao,
        channelCleanup,
        channelAtivo: ativo,
      })
    ) {
      return ativo
    }
    channelCleanup.removido = true
    if (ativo === channelCleanup) ativo = null
    return ativo
  }

  return {
    subscribe,
    cleanupAtual,
    cleanupSeguro,
    get ativo() {
      return ativo
    },
    get geracao() {
      return geracao
    },
  }
}

const logs: string[] = []
const originalInfo = console.info
console.info = (...args: unknown[]) => {
  logs.push(args.map((a) => (typeof a === 'string' ? a : '')).join(' '))
}

try {
  // A) subscribe SUBSCRIBED mantém channel ativo
  const cicloA = criarCicloChannel()
  const a = cicloA.subscribe()
  assert.equal(a.channel.status, 'SUBSCRIBED')
  assert.equal(cicloA.ativo, a.channel)
  assert.equal(a.channel.removido, false)
  assert.equal(textoStatusRealtime('SUBSCRIBED', CHANNEL), `status=SUBSCRIBED channel=${CHANNEL}`)

  // B) cleanup remove somente o channel que criou
  const cicloB = criarCicloChannel()
  const b = cicloB.subscribe()
  const aposB = cicloB.cleanupSeguro(b.geracao, b.channel)
  assert.equal(aposB, null)
  assert.equal(b.channel.removido, true)

  // C) re-subscribe não é removido por cleanup antigo
  const cicloC = criarCicloChannel()
  const c1 = cicloC.subscribe()
  const c2 = cicloC.subscribe()
  const aposC = cicloC.cleanupSeguro(c1.geracao, c1.channel)
  assert.equal(aposC, c2.channel)
  assert.equal(c2.channel.removido, false)
  assert.equal(cicloC.ativo?.id, c2.channel.id)
  const corridaAtual = criarCicloChannel()
  const r1 = corridaAtual.subscribe()
  const r2 = corridaAtual.subscribe()
  corridaAtual.cleanupAtual(r1.channel)
  assert.equal(corridaAtual.ativo, null)
  assert.equal(r2.channel.removido, true)

  // D) channel principal NÃO contém appointments; as 10 outras permanecem
  assert.equal(appointmentsEstaNoBinding(), false)
  assert.equal(TABELAS_REALTIME_OFFICE.includes('appointments'), false)
  assert.equal(TABELAS_REALTIME_OFFICE.length, 10)
  const bindings = listarBindingsRealtime(OFFICE_UUID)
  const apt = bindings.find((b) => b.table === 'appointments')
  assert.equal(apt, undefined)
  assert.equal(bindings.length, 10)
  assert.ok(bindings.every((b) => b.schema === 'public' && b.event === '*' && b.filter === `office_id=eq.${OFFICE_UUID}`))
  const d = criarCicloChannel().subscribe()
  assert.equal(appointmentsEstaNoBinding(d.channel.bindings), false)

  // E) CHANNEL_ERROR / TIMED_OUT / CLOSED ficam visíveis e logados; SUBSCRIBED não polui
  assert.equal(statusRealtimeVisivel('SUBSCRIBED'), true)
  assert.match(textoStatusRealtime('SUBSCRIBED', CHANNEL), /status=SUBSCRIBED/)
  for (const status of ['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'] as const) {
    assert.equal(statusRealtimeVisivel(status), true)
    assert.match(textoStatusRealtime(status, CHANNEL), new RegExp(`status=${status}`))
    logs.length = 0
    logRealtimeStatus({
      status,
      channelName: CHANNEL,
      officeId: OFFICE_UUID,
      channelState: 'closed',
      socketConnected: false,
      motivo: status === 'CHANNEL_ERROR' ? 'join failed' : null,
      geracao: 1,
      appointmentsEventReceived: 'nao',
    })
    assert.ok(
      logs.some((l) => l.includes(`status=${status} channel=${CHANNEL}`)),
      `log textual ausente para ${status}`
    )
    assert.ok(
      logs.some((l) => l.includes('[BoxGestor Sync][realtime]')),
      `prefixo ausente para ${status}`
    )
  }
  logs.length = 0
  logRealtimeStatus({
    status: 'SUBSCRIBED',
    channelName: CHANNEL,
    officeId: OFFICE_UUID,
    channelState: 'joined',
    socketConnected: true,
    motivo: null,
    geracao: 1,
    appointmentsEventReceived: 'nao',
  })
  assert.equal(logs.length, 0, 'SUBSCRIBED não deve gerar log de diagnóstico')
  assert.equal(statusRealtimeVisivel('JOINING'), false)

  // F) reconnect não duplica bindings
  assert.equal(bindingsRealtimeUnicos(), true)
  assert.equal(bindings.length, TABELAS_REALTIME_OFFICE.length)
  const reconectado = [...TABELAS_REALTIME_OFFICE]
  assert.equal(bindingsRealtimeUnicos(reconectado), true)
  assert.equal(bindingsRealtimeUnicos([...reconectado, 'customers']), false)

  assert.equal(CHANNEL, `boxgestor-office-${OFFICE_UUID}`)
  assert.equal(classificarHttp400('https://x.supabase.co/realtime/v1/websocket?apikey=SECRET'), 'realtime')
  assert.equal(classificarHttp400('https://x.supabase.co/auth/v1/token?grant_type=refresh'), 'auth')
  assert.equal(classificarHttp400('https://x.supabase.co/rest/v1/appointments'), 'rest')
  assert.equal(pathHttpSanitizado('https://x.supabase.co/realtime/v1/websocket?apikey=SECRET'), '/realtime/v1/websocket')
  assert.equal(sanitizarMotivoRealtime({ message: 'CHANNEL_ERROR' }), 'CHANNEL_ERROR')
  assert.equal(cleanupDeveRemoverChannel({
    geracaoCleanup: 2,
    geracaoAtiva: 2,
    channelCleanup: r2,
    channelAtivo: r2,
  }), true)
  assert.equal(cleanupDeveRemoverChannel({
    geracaoCleanup: 1,
    geracaoAtiva: 2,
    channelCleanup: r1,
    channelAtivo: r2,
  }), false)

  iniciarObservacaoRealtime(
    'office-watch',
    () => ({
      em: new Date().toISOString(),
      officeId: 'office-watch',
      channelName: CHANNEL,
      status: 'SUBSCRIBED',
      channelState: 'joined',
      socketConnected: true,
      appointmentsBinding: true,
      appointmentsEventosRecebidos: 0,
      geracaoAtiva: 1,
      geracaoCleanup: null,
    }),
    { duracaoMs: 25, intervaloMs: 8 }
  )
  await new Promise((r) => setTimeout(r, 40))
  pararObservacaoRealtime('office-watch')
  // Watch de diagnóstico silencioso: só valida start/stop sem spam de log.
  assert.equal(
    logs.filter((l) => l.includes('watch ')).length,
    0,
    'observação realtime não deve emitir logs de watch'
  )

  console.info = originalInfo
  console.info('verificar-agenda-realtime-channel: ok')
} catch (err) {
  console.info = originalInfo
  throw err
}
