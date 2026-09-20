import assert from 'node:assert/strict'
import { criarCoordenadorPullAgenda } from '../src/services/agenda/agenda-realtime-coordenador.ts'
import {
  DEBOUNCE_AGENDA_REALTIME_MS,
  delayFromRemoteMs,
} from '../src/services/agenda/agenda-realtime-scheduler.ts'
import type { Agendamento } from '../src/types/agendamento.ts'
import type { CraftDatabase } from '../src/types/database.ts'

const OFFICE = 'oficina-trailing-agenda'

function agendamento(parcial: Partial<Agendamento> = {}): Agendamento {
  return {
    id: '11111111-2222-4333-8444-555555555555',
    oficina_id: OFFICE,
    office_id: OFFICE,
    data: '2026-09-19',
    horario: '09:00',
    cliente_id: 'cli-1',
    moto_id: 'moto-1',
    servico: 'Servico tecnico',
    status: 'agendado',
    created_at: '2026-09-19T00:00:00.000Z',
    updated_at: '2026-09-19T00:00:00.000Z',
    ...parcial,
  }
}

type SelectResult = { ok: boolean; dados: Agendamento[] | null }

function criarFilaSelect() {
  const pendentes: Array<(valor: SelectResult) => void> = []
  let selects = 0
  return {
    get selects() {
      return selects
    },
    carregarRemoto: async (): Promise<SelectResult> => {
      selects += 1
      return new Promise((resolve) => {
        pendentes.push(resolve)
      })
    },
    resolver(valor: SelectResult) {
      const proximo = pendentes.shift()
      assert.ok(proximo, 'nenhum SELECT pendente')
      proximo(valor)
    },
  }
}

async function esperar(condicao: () => boolean, rotulo: string): Promise<void> {
  for (let i = 0; i < 40; i++) {
    if (condicao()) return
    await Promise.resolve()
    await Promise.resolve()
  }
  throw new Error(`timeout: ${rotulo}`)
}

function criarTimers() {
  const timers: Array<{ id: number; fn: () => void; ms: number }> = []
  let nextId = 1
  return {
    timers,
    agendarTimer: (fn: () => void, ms: number) => {
      const id = nextId++
      timers.push({ id, fn, ms })
      return id
    },
    cancelarTimer: (id: unknown) => {
      const idx = timers.findIndex((t) => t.id === id)
      if (idx >= 0) timers.splice(idx, 1)
    },
    disparar() {
      const pendentes = [...timers]
      timers.length = 0
      for (const t of pendentes) t.fn()
    },
  }
}

function criarCoord(fila: ReturnType<typeof criarFilaSelect>, timers = criarTimers()) {
  const gravados: Agendamento[][] = []
  const ui: Agendamento[][] = []
  const coord = criarCoordenadorPullAgenda(OFFICE, {
    debounceMs: DEBOUNCE_AGENDA_REALTIME_MS,
    agendarTimer: timers.agendarTimer,
    cancelarTimer: timers.cancelarTimer,
    carregarLocal: () => ({ agendamentos: [] }) as CraftDatabase,
    carregarRemoto: fila.carregarRemoto,
    salvarLocal: (_id, db) => {
      gravados.push(db.agendamentos ?? [])
    },
    onUi: (_id, ags) => {
      ui.push(ags)
    },
  })
  return { coord, timers, gravados, ui }
}

const remotoOk = { ok: true, dados: [agendamento()] }
const remotoErro = { ok: false, dados: null }

// Tempo: appointments → 500 ms → pull; sem espera 10–15 s
{
  const fila = criarFilaSelect()
  const { coord, timers } = criarCoord(fila)
  const agendado = coord.agendar('appointments', {
    eventType: 'UPDATE',
    appointmentId: 'apt-tempo',
  })
  assert.equal(agendado.destino, 'agenda')
  assert.equal(agendado.agendaAgendada, true)
  assert.equal(agendado.delayMs, 500)
  assert.equal(DEBOUNCE_AGENDA_REALTIME_MS, 500)
  assert.equal(timers.timers.length, 1)
  assert.equal(timers.timers[0].ms, 500)
  assert.equal(timers.timers.every((t) => t.ms < 10_000), true)
  assert.equal(fila.selects, 0)
  timers.disparar()
  await esperar(() => fila.selects === 1, 'pull apos 500 ms')
  fila.resolver(remotoOk)
  await esperar(() => !coord.estaPullEmAndamento(), 'pull tempo terminou')
  assert.equal(coord.pullsIniciados(), 1)
}

// A) evento A → pull A → termina → apenas 1 pull
{
  const fila = criarFilaSelect()
  const { coord } = criarCoord(fila)
  const p = coord.executar()
  await esperar(() => fila.selects === 1, 'A select')
  fila.resolver(remotoOk)
  await p
  assert.equal(coord.pullsIniciados(), 1)
  assert.equal(fila.selects, 1)
  assert.equal(coord.estaSuja(), false)
}

// B) evento B chega enquanto A está antes do SELECT terminar → após A, executa B
{
  const fila = criarFilaSelect()
  const { coord } = criarCoord(fila)
  const p = coord.executar()
  await esperar(() => fila.selects === 1, 'B: A antes do SELECT')
  const r = coord.agendar('appointments', { eventType: 'UPDATE', appointmentId: 'apt-b' })
  assert.equal(r.marcouTrailing, true)
  assert.equal(r.agendaAgendada, false)
  assert.equal(coord.estaSuja(), true)
  fila.resolver(remotoOk)
  await esperar(() => fila.selects === 2, 'B: trailing SELECT')
  fila.resolver(remotoOk)
  await p
  assert.equal(coord.pullsIniciados(), 2)
  assert.equal(fila.selects, 2)
}

// C) evento B chega depois do SELECT de A, mas A ainda está rodando → após A, executa B
{
  const fila = criarFilaSelect()
  const gravados: Agendamento[][] = []
  let eventoDuranteOnUi = false
  const timers = criarTimers()
  const coord = criarCoordenadorPullAgenda(OFFICE, {
    debounceMs: DEBOUNCE_AGENDA_REALTIME_MS,
    agendarTimer: timers.agendarTimer,
    cancelarTimer: timers.cancelarTimer,
    carregarLocal: () => ({ agendamentos: [] }) as CraftDatabase,
    carregarRemoto: fila.carregarRemoto,
    salvarLocal: (_id, db) => {
      gravados.push(db.agendamentos ?? [])
    },
    onUi: () => {
      if (fila.selects === 1 && !eventoDuranteOnUi) {
        eventoDuranteOnUi = true
        const r = coord.agendar('appointments', {
          eventType: 'UPDATE',
          appointmentId: 'apt-c',
        })
        assert.equal(r.marcouTrailing, true)
        assert.equal(coord.estaSuja(), true)
        assert.equal(coord.estaPullEmAndamento(), true)
      }
    },
  })
  const p = coord.executar()
  await esperar(() => fila.selects === 1, 'C: SELECT A')
  fila.resolver(remotoOk)
  await esperar(() => eventoDuranteOnUi && fila.selects === 2, 'C: trailing SELECT')
  fila.resolver(remotoOk)
  await p
  assert.equal(coord.pullsIniciados(), 2)
  assert.equal(gravados.length, 2)
}

// D) 5 eventos durante A → apenas 1 trailing pull B
{
  const fila = criarFilaSelect()
  const { coord } = criarCoord(fila)
  const p = coord.executar()
  await esperar(() => fila.selects === 1, 'D: A')
  for (let n = 0; n < 5; n++) {
    coord.agendar('appointments', { eventType: 'UPDATE', appointmentId: `apt-${n}` })
  }
  assert.equal(coord.estaSuja(), true)
  fila.resolver(remotoOk)
  await esperar(() => fila.selects === 2, 'D: um trailing')
  fila.resolver(remotoOk)
  await p
  assert.equal(coord.pullsIniciados(), 2)
  assert.equal(fila.selects, 2)
}

// E) evento durante B → gera C após B
{
  const fila = criarFilaSelect()
  const { coord } = criarCoord(fila)
  const p = coord.executar()
  await esperar(() => fila.selects === 1, 'E: A')
  coord.agendar('appointments', { eventType: 'UPDATE', appointmentId: 'apt-e1' })
  fila.resolver(remotoOk)
  await esperar(() => fila.selects === 2, 'E: B')
  coord.agendar('appointments', { eventType: 'UPDATE', appointmentId: 'apt-e2' })
  assert.equal(coord.estaSuja(), true)
  fila.resolver(remotoOk)
  await esperar(() => fila.selects === 3, 'E: C')
  fila.resolver(remotoOk)
  await p
  assert.equal(coord.pullsIniciados(), 3)
  assert.equal(fila.selects, 3)
}

// F) outras tabelas → não marcam trailing Agenda
{
  const fila = criarFilaSelect()
  const { coord, timers } = criarCoord(fila)
  const p = coord.executar()
  await esperar(() => fila.selects === 1, 'F: A')
  const r = coord.agendar('service_orders', { eventType: 'UPDATE' })
  assert.equal(r.destino, 'global')
  assert.equal(r.marcouTrailing, false)
  assert.equal(r.agendaAgendada, false)
  assert.equal(coord.estaSuja(), false)
  assert.equal(timers.timers.length, 0)
  fila.resolver(remotoOk)
  await p
  assert.equal(coord.pullsIniciados(), 1)
  assert.equal(fila.selects, 1)
}

// G) sem evento novo → não gera pull extra
{
  const fila = criarFilaSelect()
  const { coord } = criarCoord(fila)
  const p = coord.executar()
  await esperar(() => fila.selects === 1, 'G: A')
  fila.resolver(remotoOk)
  await p
  assert.equal(coord.pullsIniciados(), 1)
  assert.equal(fila.selects, 1)
}

// H) erro no pull A + Agenda ficou suja → ainda tenta trailing B
{
  const fila = criarFilaSelect()
  const { coord } = criarCoord(fila)
  const p = coord.executar()
  await esperar(() => fila.selects === 1, 'H: A erro')
  coord.agendar('appointments', { eventType: 'UPDATE', appointmentId: 'apt-h' })
  fila.resolver(remotoErro)
  await esperar(() => fila.selects === 2, 'H: trailing apos erro')
  fila.resolver(remotoOk)
  const resultado = await p
  assert.equal(coord.pullsIniciados(), 2)
  assert.equal(fila.selects, 2)
  assert.equal(resultado?.[0]?.id, remotoOk.dados?.[0]?.id)
}

assert.equal(delayFromRemoteMs('2026-09-19T00:00:00.000Z', '2026-09-19T00:00:15.000Z'), 15_000)
assert.equal(delayFromRemoteMs(undefined, '2026-09-19T00:00:15.000Z'), null)

console.log('verificar-agenda-trailing-pull: ok')
