import assert from 'node:assert/strict'
import {
  TABELAS_REALTIME_OFFICE,
  appointmentsEstaNoBinding,
  listarBindingsRealtime,
  nomeChannelRealtimeOffice,
} from '../src/services/sync/realtime-diagnostico.ts'
import {
  PREFIXO_CHANNEL_AGENDA_CANARY_LEGADO,
  agendaUsaMesmoClient,
  bindingAgendaAppointments,
  bindingsAgendaUnicos,
  canaryAgendaDuplicadoAtivo,
  capturarAuthRealtimeBooleano,
  channelPrincipalContemAppointments,
  cleanupAgendaDeveRemover,
  destinoEventoChannelAgenda,
  eventoAgendaDisparaSyncGlobal,
  nomeChannelAgenda,
  outrasTabelasDisparamChannelAgenda,
  qtdTabelasChannelPrincipal,
  statusChannelPermiteRecriar,
} from '../src/services/sync/agenda-realtime-channel.ts'
import { destinoPullRealtime } from '../src/services/agenda/agenda-realtime-scheduler.ts'

const OFFICE = 'fdd4e82f-2a03-4cd7-9340-b5f067d2fed5'

type FakeChannel = { id: string; removido: boolean }

function criarCicloAgenda() {
  let geracao = 0
  let ativo: FakeChannel | null = null

  function subscribe(): { geracao: number; channel: FakeChannel } {
    geracao += 1
    const channel = { id: `agenda-${geracao}`, removido: false }
    ativo = channel
    return { geracao, channel }
  }

  function cleanup(geracaoCleanup: number, channelCleanup: FakeChannel): FakeChannel | null {
    if (
      !cleanupAgendaDeveRemover({
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
    cleanup,
    get ativo() {
      return ativo
    },
    get geracao() {
      return geracao
    },
  }
}

// A) channel principal não contém appointments
assert.equal(channelPrincipalContemAppointments(), false)
assert.equal(appointmentsEstaNoBinding(), false)
assert.equal(TABELAS_REALTIME_OFFICE.includes('appointments'), false)

// B) channel principal continua com as outras 10 tabelas
assert.equal(qtdTabelasChannelPrincipal(), 10)
assert.deepEqual([...TABELAS_REALTIME_OFFICE], [
  'customers',
  'motorcycles',
  'service_orders',
  'inventory_items',
  'inventory_movements',
  'suppliers',
  'financial_transactions',
  'communication_history',
  'communication_alerts',
  'scheduled_messages',
])
const principais = listarBindingsRealtime(OFFICE)
assert.equal(principais.length, 10)
assert.ok(principais.every((b) => b.table !== 'appointments'))

// C) channel Agenda contém exatamente 1 binding appointments
const binding = bindingAgendaAppointments(OFFICE)
assert.deepEqual(binding, {
  event: '*',
  schema: 'public',
  table: 'appointments',
  filter: `office_id=eq.${OFFICE}`,
})
assert.equal(bindingsAgendaUnicos([binding]), true)
assert.equal(nomeChannelAgenda(OFFICE), `boxgestor-agenda-${OFFICE}`)
assert.notEqual(nomeChannelAgenda(OFFICE), nomeChannelRealtimeOffice(OFFICE))
assert.equal(nomeChannelAgenda(OFFICE).includes(PREFIXO_CHANNEL_AGENDA_CANARY_LEGADO), false)

// D) UPDATE appointments → scheduler Agenda
assert.equal(destinoEventoChannelAgenda('appointments'), 'agenda')
assert.equal(destinoPullRealtime('appointments'), 'agenda')

// E) evento Agenda NÃO dispara sync global
assert.equal(eventoAgendaDisparaSyncGlobal(), false)
assert.equal(destinoPullRealtime('appointments') === 'global', false)

// F) outras tabelas NÃO disparam channel Agenda
assert.equal(outrasTabelasDisparamChannelAgenda('customers'), false)
assert.equal(outrasTabelasDisparamChannelAgenda('service_orders'), false)
assert.equal(destinoEventoChannelAgenda('customers'), 'nenhum')
assert.equal(destinoPullRealtime('customers'), 'global')

// G) channel Agenda usa mesmo client/sessão
const client = { id: 'unico' }
assert.equal(agendaUsaMesmoClient(client, client), true)
assert.equal(agendaUsaMesmoClient(client, { id: 'outro' }), false)
const auth = capturarAuthRealtimeBooleano({
  session: {
    access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.aaa.bbb',
    user: { id: 'user-secreto' },
  } as never,
  supabase: client,
  clientEsperado: client,
  sessaoProntaAntesDoSubscribe: true,
  socketConnected: true,
})
assert.equal(auth.mesmoClient, true)
assert.equal(auth.sessaoProntaAntesDoSubscribe, true)
assert.equal(JSON.stringify(auth).includes('eyJ'), false)

// H) cleanup remove somente sua própria instância
const cicloH = criarCicloAgenda()
const h = cicloH.subscribe()
assert.equal(cicloH.cleanup(h.geracao, h.channel), null)
assert.equal(h.channel.removido, true)

// I) cleanup antigo não mata channel Agenda novo
const cicloI = criarCicloAgenda()
const i1 = cicloI.subscribe()
const i2 = cicloI.subscribe()
assert.equal(cicloI.cleanup(i1.geracao, i1.channel), i2.channel)
assert.equal(i2.channel.removido, false)
assert.equal(cicloI.ativo?.id, i2.channel.id)

// J) CHANNEL_ERROR / CLOSED / TIMED_OUT permite recriação
assert.equal(statusChannelPermiteRecriar('CHANNEL_ERROR', 'errored'), true)
assert.equal(statusChannelPermiteRecriar('CLOSED', 'closed'), true)
assert.equal(statusChannelPermiteRecriar('TIMED_OUT', 'joined'), true)
assert.equal(statusChannelPermiteRecriar('SUBSCRIBED', 'joined'), false)

// K) nenhum canary duplicado ativo
assert.equal(canaryAgendaDuplicadoAtivo([nomeChannelAgenda(OFFICE), nomeChannelRealtimeOffice(OFFICE)]), false)
assert.equal(canaryAgendaDuplicadoAtivo([`${PREFIXO_CHANNEL_AGENDA_CANARY_LEGADO}${OFFICE}`]), true)

console.info('verificar-agenda-realtime-exclusivo: ok')
