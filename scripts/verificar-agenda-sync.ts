import assert from 'node:assert/strict'
import { mesclarAgendamentos } from '../src/services/agenda/agenda-merge.ts'
import {
  executarPushAgendamentos,
  montarAgendaFkId,
  processarRetryAgendamentos,
  sanitizarTextoErroAgenda,
} from '../src/services/agenda/agenda-push.ts'
import {
  horarioLocalParaSupabase,
  horarioSupabaseParaLocal,
  idAgendamentoParaSupabase,
  mapearAgendamentoDoSupabase,
  mapearAgendamentoParaSupabase,
  type AppointmentRow,
} from '../src/services/agenda/agenda-mappers.ts'

import { filtrarEntidadesAtivas } from '../src/lib/entidade-ativa.ts'
import { isUuidFormato, localIdParaUuid } from '../src/lib/local-id-uuid.ts'
import { listarAgendaHojeCentral } from '../src/services/central-do-dia/central-do-dia.service.ts'
import {
  limparRegistroIds,
  obterLocalIdPorUuid,
  obterUuidPorLocalId,
  registrarMapeamentoId,
} from '../src/services/supabase-sync/id-registry.ts'
import { syncQueueService } from '../src/services/sync/sync-queue.service.ts'
import { deveExecutarPullAgora } from '../src/services/sync/sync-pull-throttle.ts'
import {
  criarSchedulerPullAgenda,
  destinoPullRealtime,
  DEBOUNCE_AGENDA_REALTIME_MS,
} from '../src/services/agenda/agenda-realtime-scheduler.ts'
import { aplicarPullAgendaDirecionado } from '../src/services/agenda/agenda-realtime-pull-core.ts'
import {
  diagnosticoPushAgendaVisivel,
  MAPPER_AGENDA_HOMOLOG,
  mensagemToastExclusaoAgenda,
  mensagemToastSaveAgenda,
} from '../src/services/agenda/agenda-save-ux.ts'
import { APP_DEPLOY_VERSION } from '../src/generated/app-version.ts'
import {
  consumirPersistenciaSomenteAgenda,
  marcarPersistenciaSomenteAgenda,
} from '../src/services/supabase-sync/persistencia-opcoes.ts'
import {
  enfileirarPushAgenda,
  resetarFilaPushAgendaParaTeste,
} from '../src/services/agenda/agenda-push-queue.ts'
import { stampUpdate } from '../src/services/migration.service.ts'
import { MSG } from '../src/lib/mensagens-usuario.ts'
import { readFileSync } from 'node:fs'
import type { Agendamento } from '../src/types/agendamento.ts'

const mem = new Map<string, string>()
const localStorageMock = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => {
    mem.set(k, v)
  },
  removeItem: (k: string) => {
    mem.delete(k)
  },
  clear: () => mem.clear(),
  key: (i: number) => [...mem.keys()][i] ?? null,
  get length() {
    return mem.size
  },
}
Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  configurable: true,
})

const OFFICE_LOCAL = 'oficina-teste-agenda'
const OFFICE_UUID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
const CLIENTE_LOCAL = 'cli-agenda-001'
const MOTO_LOCAL = 'moto-agenda-001'
const OS_LOCAL = 'os-agenda-001'
const ID_UUID = '11111111-2222-4333-8444-555555555555'

function agendamento(parcial: Partial<Agendamento> = {}): Agendamento {
  return {
    id: ID_UUID,
    oficina_id: OFFICE_LOCAL,
    office_id: OFFICE_LOCAL,
    data: '2026-09-17',
    horario: '09:00',
    cliente_id: CLIENTE_LOCAL,
    moto_id: MOTO_LOCAL,
    servico: 'Revisão',
    status: 'agendado',
    observacoes: 'óleo',
    created_at: '2026-09-17T10:00:00.000Z',
    updated_at: '2026-09-17T10:00:00.000Z',
    ...parcial,
  }
}

function upsertRemoto(
  store: Map<string, Record<string, unknown>>,
  row: Record<string, unknown>
): void {
  const id = String(row.id)
  store.set(id, { ...(store.get(id) ?? {}), ...row })
}

async function pushTodos(
  store: Map<string, Record<string, unknown>>,
  locais: Agendamento[]
): Promise<void> {
  for (const ag of locais) {
    const row = await mapearAgendamentoParaSupabase(ag, OFFICE_UUID)
    if (!row) continue
    upsertRemoto(store, row)
  }
}

function pullTodos(store: Map<string, Record<string, unknown>>): Agendamento[] {
  return [...store.values()].map((row) =>
    mapearAgendamentoDoSupabase(row as unknown as AppointmentRow, OFFICE_LOCAL)
  )
}

async function semearFks(): Promise<void> {
  limparRegistroIds()
  registrarMapeamentoId(CLIENTE_LOCAL, await localIdParaUuid(CLIENTE_LOCAL))
  registrarMapeamentoId(MOTO_LOCAL, await localIdParaUuid(MOTO_LOCAL))
  registrarMapeamentoId(OS_LOCAL, await localIdParaUuid(OS_LOCAL))
}

await semearFks()

// A. create local → remoto (mesmo UUID)
const remoto = new Map<string, Record<string, unknown>>()
const criado = agendamento()
await pushTodos(remoto, [criado])
assert.equal(remoto.size, 1)
assert.equal([...remoto.keys()][0], ID_UUID)
assert.equal(remoto.get(ID_UUID)?.service, 'Revisão')
assert.equal(remoto.get(ID_UUID)?.customer_id, await localIdParaUuid(CLIENTE_LOCAL))
assert.notEqual(remoto.get(ID_UUID)?.customer_id, '')

// B. update local → remoto (mesmo id)
const editado = agendamento({
  servico: 'Alinhamento',
  status: 'confirmado',
  updated_at: '2026-09-17T11:00:00.000Z',
})
await pushTodos(remoto, [editado])
assert.equal(remoto.size, 1)
assert.equal(remoto.get(ID_UUID)?.service, 'Alinhamento')
assert.equal(remoto.get(ID_UUID)?.status, 'confirmado')

// C. pull remoto → local
const puxados = pullTodos(remoto)
assert.equal(puxados.length, 1)
assert.equal(puxados[0].id, ID_UUID)
assert.equal(puxados[0].servico, 'Alinhamento')
assert.equal(puxados[0].cliente_id, CLIENTE_LOCAL)
assert.equal(puxados[0].moto_id, MOTO_LOCAL)

const soLocal = agendamento({ id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', servico: 'Pendente' })
const mergePull = mesclarAgendamentos([soLocal], puxados)
assert.equal(mergePull.length, 2)
assert.ok(mergePull.some((a) => a.id === ID_UUID && a.servico === 'Alinhamento'))
assert.ok(mergePull.some((a) => a.id === soLocal.id && a.servico === 'Pendente'))

// D. idempotência: push 2 vezes → 1 registro
await pushTodos(remoto, [editado])
await pushTodos(remoto, [editado])
assert.equal(remoto.size, 1)

// E. tombstone: delete em A → não reaparece após pull de cópia ativa antiga
const tombstoneA = agendamento({
  deleted_at: '2026-09-17T12:00:00.000Z',
  updated_at: '2026-09-17T12:00:00.000Z',
})
const aposDelete = mesclarAgendamentos([tombstoneA], [editado])
assert.equal(aposDelete.length, 1)
assert.ok(aposDelete[0].deleted_at)
assert.equal(filtrarEntidadesAtivas(aposDelete).length, 0)
await pushTodos(remoto, aposDelete)
const aposPullDelete = mesclarAgendamentos(aposDelete, pullTodos(remoto))
assert.equal(filtrarEntidadesAtivas(aposPullDelete).length, 0)

// F. dispositivo B com cópia velha: tombstone remoto vence
const copiaVelhaB = agendamento({
  servico: 'Cópia velha B',
  updated_at: '2026-09-17T10:30:00.000Z',
  deleted_at: null,
})
const remotoTombstone = pullTodos(remoto)
const mergeB = mesclarAgendamentos([copiaVelhaB], remotoTombstone)
assert.equal(mergeB.length, 1)
assert.ok(mergeB[0].deleted_at)
assert.equal(filtrarEntidadesAtivas(mergeB).length, 0)
await pushTodos(remoto, mergeB)
assert.ok(remoto.get(ID_UUID)?.deleted_at)
assert.equal(remoto.size, 1)

// G. offline: criar/editar/excluir → fila → online → remoto correto
syncQueueService.enfileirar({
  office_id: OFFICE_LOCAL,
  tipo_acao: 'update',
  entidade: 'agendamento',
  entidade_id: OFFICE_LOCAL,
  payload: { sync_agendamentos: true },
})
syncQueueService.enfileirar({
  office_id: OFFICE_LOCAL,
  tipo_acao: 'update',
  entidade: 'agendamento',
  entidade_id: OFFICE_LOCAL,
  payload: { sync_agendamentos: true },
})
assert.equal(syncQueueService.contarPendentes(OFFICE_LOCAL), 1)

const idOffline = '99999999-aaaa-4bbb-8ccc-dddddddddddd'
const remotoG = new Map<string, Record<string, unknown>>()
let localG: Agendamento[] = [
  agendamento({
    id: idOffline,
    servico: 'Offline create',
    created_at: '2026-09-17T13:00:00.000Z',
    updated_at: '2026-09-17T13:00:00.000Z',
  }),
]
localG = [
  {
    ...localG[0],
    servico: 'Offline edit',
    updated_at: '2026-09-17T13:10:00.000Z',
  },
]
localG = [
  {
    ...localG[0],
    deleted_at: '2026-09-17T13:20:00.000Z',
    updated_at: '2026-09-17T13:20:00.000Z',
  },
]
const mescladoOnline = mesclarAgendamentos(localG, pullTodos(remotoG))
await pushTodos(remotoG, mescladoOnline)
assert.equal(remotoG.size, 1)
assert.equal(remotoG.get(idOffline)?.service, 'Offline edit')
assert.ok(remotoG.get(idOffline)?.deleted_at)
for (const item of syncQueueService.listar(OFFICE_LOCAL, 'pendente')) {
  syncQueueService.marcarSincronizado(item.id)
}
assert.equal(syncQueueService.contarPendentes(OFFICE_LOCAL), 0)

// H. merge: updated_at mais recente vence entre versões ativas
const localAtivo = agendamento({
  servico: 'Local novo',
  updated_at: '2026-09-17T15:00:00.000Z',
})
const remotoAtivo = agendamento({
  servico: 'Remoto antigo',
  updated_at: '2026-09-17T14:00:00.000Z',
})
const mergeLww = mesclarAgendamentos([localAtivo], [remotoAtivo])
assert.equal(mergeLww[0].servico, 'Local novo')
const mergeLwwInverso = mesclarAgendamentos(
  [agendamento({ servico: 'Local antigo', updated_at: '2026-09-17T14:00:00.000Z' })],
  [agendamento({ servico: 'Remoto novo', updated_at: '2026-09-17T15:00:00.000Z' })]
)
assert.equal(mergeLwwInverso[0].servico, 'Remoto novo')

// I. vínculo OS preservado
const comOs = agendamento({
  ordem_servico_id: OS_LOCAL,
  updated_at: '2026-09-17T16:00:00.000Z',
})
const rowOs = await mapearAgendamentoParaSupabase(comOs, OFFICE_UUID)
assert.ok(rowOs)
assert.equal(rowOs.service_order_id, await localIdParaUuid(OS_LOCAL))
const deVoltaOs = mapearAgendamentoDoSupabase(rowOs as unknown as AppointmentRow, OFFICE_LOCAL)
assert.equal(deVoltaOs.ordem_servico_id, OS_LOCAL)
const mergeOs = mesclarAgendamentos([comOs], [deVoltaOs])
assert.equal(mergeOs[0].ordem_servico_id, OS_LOCAL)

// J. dados existentes no localStorage (sem deleted_at/office_id) continuam carregando
const legado = {
  id: 'ag-001',
  oficina_id: OFFICE_LOCAL,
  data: '2026-09-17',
  horario: '14:30',
  cliente_id: CLIENTE_LOCAL,
  moto_id: MOTO_LOCAL,
  servico: 'Troca de óleo',
  status: 'agendado' as const,
}
assert.equal(filtrarEntidadesAtivas([legado]).length, 1)
const idLegadoRemoto = await idAgendamentoParaSupabase(legado.id)
assert.notEqual(idLegadoRemoto, legado.id)
const rowLegado = await mapearAgendamentoParaSupabase(legado, OFFICE_UUID)
assert.ok(rowLegado)
assert.equal(rowLegado.id, idLegadoRemoto)
assert.equal(rowLegado.deleted_at, null)
const remotoLegado = new Map<string, Record<string, unknown>>()
await pushTodos(remotoLegado, [legado])
await pushTodos(remotoLegado, [legado])
assert.equal(remotoLegado.size, 1)

// Horário HH:MM ↔ TIME e FK nunca vira string vazia
assert.equal(horarioLocalParaSupabase('09:00'), '09:00:00')
assert.equal(horarioSupabaseParaLocal('09:00:00'), '09:00')
const semCliente = await mapearAgendamentoParaSupabase(
  agendamento({ cliente_id: '' }),
  OFFICE_UUID
)
assert.equal(semCliente, null)

const uiHoje = listarAgendaHojeCentral(
  [
    agendamento({ data: '2026-09-17' }),
    agendamento({
      id: '22222222-3333-4444-8555-666666666666',
      data: '2026-09-17',
      deleted_at: '2026-09-17T12:00:00.000Z',
    }),
  ],
  [{ id: CLIENTE_LOCAL, nome: 'Ana' }],
  '2026-09-17'
)
assert.equal(uiHoje.length, 1)
assert.equal(uiHoje[0].id, ID_UUID)

// Realtime UPDATE não pode ser descartado pelo throttle de 12s do pull anterior.
const t0 = 1_000_000
assert.equal(deveExecutarPullAgora('realtime', t0, t0 + 5_000, false), true)
assert.equal(deveExecutarPullAgora('realtime', t0, t0 + 500, false), true)
assert.equal(deveExecutarPullAgora('manual', t0, t0 + 5_000, false), false)
assert.equal(deveExecutarPullAgora('manual', t0, t0 + 12_000, false), true)
assert.equal(deveExecutarPullAgora('manual', t0, t0 + 5_000, true), true)
assert.equal(deveExecutarPullAgora('visibility', t0, t0 + 5_000, false), false)

function contarFilaAgenda(): number {
  return syncQueueService
    .listar(OFFICE_LOCAL, 'pendente')
    .filter((i) => i.entidade === 'agendamento').length
}

function enfileirarAgendaTeste(motivo: string): void {
  syncQueueService.enfileirar({
    office_id: OFFICE_LOCAL,
    tipo_acao: 'update',
    entidade: 'agendamento',
    entidade_id: OFFICE_LOCAL,
    payload: { sync_agendamentos: true, motivo },
  })
}

function marcarAgendaSincronizada(): void {
  syncQueueService.marcarSincronizadosPorEntidade(OFFICE_LOCAL, 'agendamento', OFFICE_LOCAL)
}

function inputPushBase(parcial: {
  locais: Agendamento[]
  carregarRemoto: () => Promise<{
    ok: boolean
    dados: Agendamento[] | null
    erros: { mensagem?: string }[]
  }>
  persistir: (ags: Agendamento[]) => Promise<{
    ok: boolean
    enviados: number
    erros: { mensagem?: string }[]
  }>
}) {
  return {
    officeId: OFFICE_LOCAL,
    habilitado: true,
    online: true,
    contarFila: contarFilaAgenda,
    enfileirar: enfileirarAgendaTeste,
    marcarSincronizados: marcarAgendaSincronizada,
    ...parcial,
  }
}

// 1. Fase 1 falha não bloqueia Agenda: SELECT/merge/upsert próprios e sem pendência
syncQueueService.limparPorOffice(OFFICE_LOCAL)
const remoto1 = new Map<string, Record<string, unknown>>()
await pushTodos(remoto1, [
  agendamento({ servico: 'Remoto antigo', updated_at: '2026-09-17T10:00:00.000Z' }),
])
const fase1Falhou = true
assert.equal(fase1Falhou, true)
const ok1 = await executarPushAgendamentos(
  inputPushBase({
    locais: [
      agendamento({
        servico: 'Editado independente da fase 1',
        updated_at: '2026-09-17T18:00:00.000Z',
      }),
    ],
    carregarRemoto: async () => ({ ok: true, dados: pullTodos(remoto1), erros: [] }),
    persistir: async (ags) => {
      await pushTodos(remoto1, ags)
      return { ok: true, erros: [], enviados: ags.length }
    },
  })
)
assert.equal(ok1.ok, true)
assert.equal(ok1.etapa, 'ok')
assert.equal(remoto1.get(ID_UUID)?.service, 'Editado independente da fase 1')
assert.equal(contarFilaAgenda(), 0)

// 2. SELECT Agenda falha → ZERO upserts → fila pendente
syncQueueService.limparPorOffice(OFFICE_LOCAL)
const remoto2 = new Map<string, Record<string, unknown>>()
await pushTodos(remoto2, [agendamento({ servico: 'Antes do select' })])
let upserts2 = 0
const ok2 = await executarPushAgendamentos(
  inputPushBase({
    locais: [
      agendamento({
        servico: 'Nao pode ir as cegas',
        updated_at: '2026-09-17T18:10:00.000Z',
      }),
    ],
    carregarRemoto: async () => ({
      ok: false,
      dados: null,
      erros: [{ mensagem: 'timeout select' }],
    }),
    persistir: async (ags) => {
      upserts2 += 1
      await pushTodos(remoto2, ags)
      return { ok: true, erros: [], enviados: ags.length }
    },
  })
)
assert.equal(ok2.ok, false)
assert.equal(ok2.etapa, 'select_falhou')
assert.equal(ok2.enviados ?? 0, 0)
assert.equal(upserts2, 0)
assert.equal(remoto2.get(ID_UUID)?.service, 'Antes do select')
assert.equal(contarFilaAgenda(), 1)
assert.equal(
  (syncQueueService.listar(OFFICE_LOCAL, 'pendente')[0]?.payload as { motivo?: string }).motivo,
  'select_falhou'
)

// 3. retry após SELECT voltar → SELECT + merge + upsert → fila limpa
const ok3 = await processarRetryAgendamentos({
  officeId: OFFICE_LOCAL,
  quantidadePendentes: contarFilaAgenda(),
  contarFila: contarFilaAgenda,
  marcarItensSincronizados: marcarAgendaSincronizada,
  publicar: () =>
    executarPushAgendamentos(
      inputPushBase({
        locais: [
          agendamento({
            servico: 'Editado apos retry',
            updated_at: '2026-09-17T18:20:00.000Z',
          }),
        ],
        carregarRemoto: async () => ({ ok: true, dados: pullTodos(remoto2), erros: [] }),
        persistir: async (ags) => {
          upserts2 += 1
          await pushTodos(remoto2, ags)
          return { ok: true, erros: [], enviados: ags.length }
        },
      })
    ),
})
assert.equal(ok3, true)
assert.equal(upserts2, 1)
assert.equal(remoto2.get(ID_UUID)?.service, 'Editado apos retry')
assert.equal(contarFilaAgenda(), 0)

// 4. upsert falha → fila permanece
syncQueueService.limparPorOffice(OFFICE_LOCAL)
const remoto4 = new Map<string, Record<string, unknown>>()
await pushTodos(remoto4, [agendamento({ servico: 'Antes do upsert' })])
const ok4 = await executarPushAgendamentos(
  inputPushBase({
    locais: [
      agendamento({
        servico: 'Falha upsert',
        updated_at: '2026-09-17T19:00:00.000Z',
      }),
    ],
    carregarRemoto: async () => ({ ok: true, dados: pullTodos(remoto4), erros: [] }),
    persistir: async () => ({
      ok: false,
      enviados: 0,
      erros: [{ mensagem: 'Failed to fetch' }],
    }),
  })
)
assert.equal(ok4.ok, false)
assert.equal(ok4.etapa, 'upsert_falhou')
assert.equal(remoto4.get(ID_UUID)?.service, 'Antes do upsert')
assert.equal(contarFilaAgenda(), 1)

// 5. lote parcial → fila permanece
syncQueueService.limparPorOffice(OFFICE_LOCAL)
const idParcial = '22222222-3333-4444-8555-666666666666'
const ok5 = await executarPushAgendamentos(
  inputPushBase({
    locais: [
      agendamento({ servico: 'Ok parcial', updated_at: '2026-09-17T19:10:00.000Z' }),
      agendamento({
        id: idParcial,
        servico: 'Falhou parcial',
        updated_at: '2026-09-17T19:10:00.000Z',
      }),
    ],
    carregarRemoto: async () => ({
      ok: true,
      dados: [
        agendamento({ servico: 'Remoto A' }),
        agendamento({ id: idParcial, servico: 'Remoto B' }),
      ],
      erros: [],
    }),
    persistir: async () => ({
      ok: false,
      enviados: 1,
      erros: [{ mensagem: 'mapper/upsert do irmao falhou' }],
    }),
  })
)
assert.equal(ok5.ok, false)
assert.equal(ok5.etapa, 'upsert_parcial')
assert.equal(contarFilaAgenda(), 1)
assert.equal(
  (syncQueueService.listar(OFFICE_LOCAL, 'pendente')[0]?.payload as { motivo?: string }).motivo,
  'upsert_parcial'
)

// 6. lote 100% confirmado → fila limpa
syncQueueService.limparPorOffice(OFFICE_LOCAL)
enfileirarAgendaTeste('pendente_anterior')
assert.equal(contarFilaAgenda(), 1)
const ok6 = await executarPushAgendamentos(
  inputPushBase({
    locais: [
      agendamento({ servico: 'Lote total', updated_at: '2026-09-17T19:20:00.000Z' }),
    ],
    carregarRemoto: async () => ({
      ok: true,
      dados: [agendamento({ servico: 'Remoto total' })],
      erros: [],
    }),
    persistir: async (ags) => ({ ok: true, erros: [], enviados: ags.length }),
  })
)
assert.equal(ok6.ok, true)
assert.equal(ok6.etapa, 'ok')
assert.equal(contarFilaAgenda(), 0)

// 7. tombstone remoto + SELECT falha → local ativo NÃO é enviado às cegas
syncQueueService.limparPorOffice(OFFICE_LOCAL)
const remoto7 = new Map<string, Record<string, unknown>>()
await pushTodos(remoto7, [
  agendamento({
    servico: 'Tombstone remoto',
    deleted_at: '2026-09-17T12:00:00.000Z',
    updated_at: '2026-09-17T12:00:00.000Z',
  }),
])
let upserts7 = 0
const ok7 = await executarPushAgendamentos(
  inputPushBase({
    locais: [
      agendamento({
        servico: 'Copia ativa local',
        deleted_at: null,
        updated_at: '2026-09-17T10:00:00.000Z',
      }),
    ],
    carregarRemoto: async () => ({
      ok: false,
      dados: null,
      erros: [{ mensagem: 'select tombstone indisponivel' }],
    }),
    persistir: async (ags) => {
      upserts7 += 1
      await pushTodos(remoto7, ags)
      return { ok: true, erros: [], enviados: ags.length }
    },
  })
)
assert.equal(ok7.ok, false)
assert.equal(ok7.etapa, 'select_falhou')
assert.equal(upserts7, 0)
assert.ok(remoto7.get(ID_UUID)?.deleted_at)
assert.equal(contarFilaAgenda(), 1)

// Realtime: appointments usa via própria; outras tabelas não resetam o timer da Agenda.
assert.equal(destinoPullRealtime('appointments'), 'agenda')
assert.equal(destinoPullRealtime('service_orders'), 'global')
assert.equal(destinoPullRealtime('customers'), 'global')
assert.equal(DEBOUNCE_AGENDA_REALTIME_MS >= 300 && DEBOUNCE_AGENDA_REALTIME_MS <= 800, true)

const timers: Array<{ id: number; fn: () => void; ms: number }> = []
let nextTimerId = 1
let pullsAgenda = 0
const scheduler = criarSchedulerPullAgenda({
  debounceMs: DEBOUNCE_AGENDA_REALTIME_MS,
  agendarTimer: (fn, ms) => {
    const id = nextTimerId++
    timers.push({ id, fn, ms })
    return id
  },
  cancelarTimer: (id) => {
    const idx = timers.findIndex((t) => t.id === id)
    if (idx >= 0) timers.splice(idx, 1)
  },
  executarPull: () => {
    pullsAgenda += 1
  },
})

function dispararTimersPendentes() {
  const pendentes = [...timers]
  timers.length = 0
  for (const t of pendentes) t.fn()
}

// A) UPDATE appointments → pull Agenda direcionado
const a = scheduler.agendar('appointments')
assert.equal(a.destino, 'agenda')
assert.equal(a.agendaAgendada, true)
assert.equal(timers.length, 1)
assert.equal(timers[0].ms, DEBOUNCE_AGENDA_REALTIME_MS)
dispararTimersPendentes()
assert.equal(pullsAgenda, 1)

// B) service_orders logo depois NÃO cancela/posterga o timer da Agenda
pullsAgenda = 0
const bAgenda = scheduler.agendar('appointments')
assert.equal(bAgenda.agendaAgendada, true)
const timerAntes = timers[0]
const bOs = scheduler.agendar('service_orders')
assert.equal(bOs.destino, 'global')
assert.equal(bOs.agendaAgendada, false)
assert.equal(bOs.timerAgendaReiniciado, false)
assert.equal(timers.length, 1)
assert.equal(timers[0], timerAntes)
dispararTimersPendentes()
assert.equal(pullsAgenda, 1)

// C) 5 eventos appointments em 500 ms → no máximo 1 pull após debounce
pullsAgenda = 0
for (let n = 0; n < 5; n++) scheduler.agendar('appointments')
assert.equal(timers.length, 1)
dispararTimersPendentes()
assert.equal(pullsAgenda, 1)

// D) pull Agenda não dispara push
let persistenciasPull = 0
const gravados: Agendamento[][] = []
const uiRecebida: Agendamento[][] = []
const pullD = await aplicarPullAgendaDirecionado({
  officeId: OFFICE_LOCAL,
  carregarLocal: () => ({
    agendamentos: [agendamento({ servico: 'Local velho', updated_at: '2026-09-17T10:00:00.000Z' })],
  }),
  carregarRemoto: async () => ({
    ok: true,
    dados: [
      agendamento({
        servico: 'Remoto novo',
        updated_at: '2026-09-17T12:00:00.000Z',
      }),
    ],
  }),
  salvarLocal: (ags) => {
    gravados.push(ags)
  },
  onUi: (ags) => {
    uiRecebida.push(ags)
  },
  persistir: async () => {
    persistenciasPull += 1
  },
})
assert.equal(pullD.ok, true)
assert.equal(pullD.disparouPush, false)
assert.equal(persistenciasPull, 0)
assert.equal(gravados.length, 1)
assert.equal(uiRecebida[0][0].servico, 'Remoto novo')

// E) UPDATE remoto mais novo vence
assert.equal(pullD.agendamentos?.[0].servico, 'Remoto novo')

// F) tombstone remoto vence ativo local
const pullF = await aplicarPullAgendaDirecionado({
  officeId: OFFICE_LOCAL,
  carregarLocal: () => ({
    agendamentos: [agendamento({ servico: 'Ativo local', deleted_at: null })],
  }),
  carregarRemoto: async () => ({
    ok: true,
    dados: [
      agendamento({
        servico: 'Tombstone',
        deleted_at: '2026-09-17T13:00:00.000Z',
        updated_at: '2026-09-17T13:00:00.000Z',
      }),
    ],
  }),
  salvarLocal: () => undefined,
})
assert.ok(pullF.agendamentos?.[0].deleted_at)

// G) INSERT remoto continua funcionando
const idInsert = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const pullG = await aplicarPullAgendaDirecionado({
  officeId: OFFICE_LOCAL,
  carregarLocal: () => ({ agendamentos: [agendamento()] }),
  carregarRemoto: async () => ({
    ok: true,
    dados: [
      agendamento(),
      agendamento({ id: idInsert, servico: 'Novo insert' }),
    ],
  }),
  salvarLocal: () => undefined,
})
assert.equal(pullG.agendamentos?.length, 2)
assert.ok(pullG.agendamentos?.some((a) => a.id === idInsert))

// H) Realtime global das outras tabelas continua roteado para global
assert.equal(destinoPullRealtime('financial_transactions'), 'global')
assert.equal(destinoPullRealtime('inventory_items'), 'global')

// I) sem duplicação de appointment
const idsG = pullG.agendamentos?.map((a) => a.id) ?? []
assert.equal(new Set(idsG).size, idsG.length)

assert.equal(
  mensagemToastSaveAgenda({ ok: true, syncHabilitado: true }),
  MSG.agendamentoSalvo
)
assert.equal(
  mensagemToastSaveAgenda({ ok: true, syncHabilitado: false }),
  MSG.agendamentoSalvo
)
assert.equal(
  mensagemToastSaveAgenda({ ok: false, syncHabilitado: false }),
  MSG.agendamentoSalvo
)
assert.equal(
  mensagemToastSaveAgenda({ ok: false, syncHabilitado: true }),
  MSG.agendamentoSalvoPendenteSync
)
assert.equal(
  mensagemToastExclusaoAgenda({ ok: false, syncHabilitado: true }),
  MSG.agendamentoExcluidoPendenteSync
)
assert.equal(
  mensagemToastSaveAgenda(
    { ok: false, syncHabilitado: true, etapa: 'select_falhou' },
    { diagnosticoEtapa: true }
  ),
  'Agendamento salvo neste dispositivo.\nSincronização pendente: select_falhou.'
)
assert.equal(
  mensagemToastSaveAgenda(
    { ok: false, syncHabilitado: true, etapa: 'upsert_falhou' },
    { diagnosticoEtapa: false }
  ),
  MSG.agendamentoSalvoPendenteSync
)
assert.equal(
  diagnosticoPushAgendaVisivel('https://cqnktgouczyrxkkeusio.supabase.co'),
  true
)
assert.equal(
  diagnosticoPushAgendaVisivel('https://fgarivlagocabyumniiz.supabase.co'),
  false
)
assert.equal(
  diagnosticoPushAgendaVisivel(
    'https://cqnktgouczyrxkkeusio.supabase.co/?x=fgarivlagocabyumniiz'
  ),
  false
)

assert.equal(consumirPersistenciaSomenteAgenda(), false)
marcarPersistenciaSomenteAgenda()
assert.equal(consumirPersistenciaSomenteAgenda(), true)
assert.equal(consumirPersistenciaSomenteAgenda(), false)

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function publicarSnapshotTeste(
  snap: Agendamento[],
  extra: {
    carregarRemoto?: () => Promise<{
      ok: boolean
      dados: Agendamento[] | null
      erros: { mensagem?: string }[]
    }>
    persistir?: (ags: Agendamento[]) => Promise<{
      ok: boolean
      enviados: number
      erros: { mensagem?: string }[]
    }>
  } = {}
) {
  return enfileirarPushAgenda(OFFICE_LOCAL, snap, (agendamentos, origem) =>
    executarPushAgendamentos({
      ...inputPushBase({
        locais: agendamentos,
        carregarRemoto:
          extra.carregarRemoto ??
          (async () => ({ ok: true, dados: [] as Agendamento[], erros: [] })),
        persistir:
          extra.persistir ??
          (async (ags) => ({
            ok: true,
            erros: [] as { mensagem?: string }[],
            enviados: ags.length,
          })),
      }),
      trailing: origem?.trailing,
    })
  )
}

// A) save novo sem push em andamento: local novo → SELECT → merge → upsert novo → ok
resetarFilaPushAgendaParaTeste()
syncQueueService.limparPorOffice(OFFICE_LOCAL)
const persistidosA: string[] = []
const snapNovoA = [
  agendamento({
    servico: 'Save novo sem corrida',
    updated_at: '2026-09-17T21:00:00.000Z',
  }),
]
const okCorridaA = await publicarSnapshotTeste(snapNovoA, {
  carregarRemoto: async () => ({
    ok: true,
    dados: [
      agendamento({
        servico: 'Remoto antigo',
        updated_at: '2026-09-17T10:00:00.000Z',
      }),
    ],
    erros: [],
  }),
  persistir: async (ags) => {
    persistidosA.push(ags[0].servico)
    return { ok: true, erros: [], enviados: ags.length }
  },
})
assert.equal(okCorridaA.ok, true)
assert.equal(okCorridaA.etapa, 'ok')
assert.deepEqual(persistidosA, ['Save novo sem corrida'])
assert.equal(contarFilaAgenda(), 0)
assert.equal(
  mensagemToastSaveAgenda({ ok: okCorridaA.ok, syncHabilitado: true }),
  MSG.agendamentoSalvo
)

// B) push A em andamento; save B NÃO reutiliza resultado de A; após A, roda snapshot B
resetarFilaPushAgendaParaTeste()
syncQueueService.limparPorOffice(OFFICE_LOCAL)
let liberarA!: () => void
const gateA = new Promise<void>((resolve) => {
  liberarA = resolve
})
let sinalizarInicioA!: () => void
const inicioA = new Promise<void>((resolve) => {
  sinalizarInicioA = resolve
})
const persistidosB: string[] = []
const pPushA = publicarSnapshotTeste([agendamento({ servico: 'snap-A' })], {
  carregarRemoto: async () => {
    sinalizarInicioA()
    await gateA
    return { ok: true, dados: [], erros: [] }
  },
  persistir: async (ags) => {
    persistidosB.push(ags[0].servico)
    return { ok: true, erros: [], enviados: ags.length }
  },
})
await inicioA
const pPushB = publicarSnapshotTeste([agendamento({ servico: 'snap-B' })], {
  persistir: async (ags) => {
    persistidosB.push(ags[0].servico)
    return { ok: true, erros: [], enviados: ags.length }
  },
})
let bResolvido = false
void pPushB.then(() => {
  bResolvido = true
})
await delay(15)
assert.equal(bResolvido, false)
assert.deepEqual(persistidosB, [])
liberarA()
const [okPushA, okPushB] = await Promise.all([pPushA, pPushB])
assert.equal(okPushA.ok, true)
assert.equal(okPushB.ok, true)
assert.equal(okPushA.etapa, 'ok')
assert.equal(okPushB.etapa, 'ok')
assert.equal(okPushA.trailing, false)
assert.equal(okPushB.trailing, true)
assert.notEqual(okPushA.tentativaId, okPushB.tentativaId)
assert.deepEqual(persistidosB, ['snap-A', 'snap-B'])
assert.equal(persistidosB.at(-1), 'snap-B')

// C) A falha, B chegou depois: B ganha tentativa própria; não herda falha de A
resetarFilaPushAgendaParaTeste()
syncQueueService.limparPorOffice(OFFICE_LOCAL)
let liberarC!: () => void
const gateC = new Promise<void>((resolve) => {
  liberarC = resolve
})
let sinalizarInicioC!: () => void
const inicioC = new Promise<void>((resolve) => {
  sinalizarInicioC = resolve
})
const persistidosC: string[] = []
const pC_A = publicarSnapshotTeste([agendamento({ servico: 'C-A' })], {
  carregarRemoto: async () => {
    sinalizarInicioC()
    await gateC
    return { ok: true, dados: [], erros: [] }
  },
  persistir: async (ags) => {
    persistidosC.push(ags[0].servico)
    return { ok: false, erros: [{ mensagem: 'A falhou' }], enviados: 0 }
  },
})
await inicioC
const pC_B = publicarSnapshotTeste([agendamento({ servico: 'C-B' })], {
  persistir: async (ags) => {
    persistidosC.push(ags[0].servico)
    return { ok: true, erros: [], enviados: ags.length }
  },
})
liberarC()
const [okC_A, okC_B] = await Promise.all([pC_A, pC_B])
assert.equal(okC_A.ok, false)
assert.equal(okC_A.etapa, 'upsert_falhou')
assert.equal(okC_B.ok, true)
assert.equal(okC_B.etapa, 'ok')
assert.notEqual(okC_A.tentativaId, okC_B.tentativaId)
assert.deepEqual(persistidosC, ['C-A', 'C-B'])
assert.equal(contarFilaAgenda(), 0)

// D) A sucesso, B falha: UI/save B recebe false; fila permanece
resetarFilaPushAgendaParaTeste()
syncQueueService.limparPorOffice(OFFICE_LOCAL)
let liberarD!: () => void
const gateD = new Promise<void>((resolve) => {
  liberarD = resolve
})
let sinalizarInicioD!: () => void
const inicioD = new Promise<void>((resolve) => {
  sinalizarInicioD = resolve
})
const pD_A = publicarSnapshotTeste([agendamento({ servico: 'D-A' })], {
  carregarRemoto: async () => {
    sinalizarInicioD()
    await gateD
    return { ok: true, dados: [], erros: [] }
  },
})
await inicioD
const pD_B = publicarSnapshotTeste([agendamento({ servico: 'D-B' })], {
  persistir: async () => ({
    ok: false,
    erros: [{ mensagem: 'B falhou' }],
    enviados: 0,
  }),
})
liberarD()
const [okD_A, okD_B] = await Promise.all([pD_A, pD_B])
assert.equal(okD_A.ok, true)
assert.equal(okD_A.etapa, 'ok')
assert.equal(okD_B.ok, false)
assert.equal(okD_B.etapa, 'upsert_falhou')
assert.notEqual(okD_A.tentativaId, okD_B.tentativaId)
assert.equal(contarFilaAgenda() > 0, true)
assert.equal(
  mensagemToastSaveAgenda({ ok: okD_B.ok, syncHabilitado: true }),
  MSG.agendamentoSalvoPendenteSync
)

// E) 5 saves rápidos: último snapshot obrigatoriamente chega remoto
resetarFilaPushAgendaParaTeste()
syncQueueService.limparPorOffice(OFFICE_LOCAL)
let liberarE!: () => void
const gateE = new Promise<void>((resolve) => {
  liberarE = resolve
})
let sinalizarInicioE!: () => void
const inicioE = new Promise<void>((resolve) => {
  sinalizarInicioE = resolve
})
const persistidosE: string[] = []
const persistirE = async (ags: Agendamento[]) => {
  persistidosE.push(ags[0].servico)
  return { ok: true, erros: [], enviados: ags.length }
}
const pE1 = publicarSnapshotTeste([agendamento({ servico: 'E-1' })], {
  carregarRemoto: async () => {
    sinalizarInicioE()
    await gateE
    return { ok: true, dados: [], erros: [] }
  },
  persistir: persistirE,
})
await inicioE
const pEs = [pE1]
for (let n = 2; n <= 5; n++) {
  pEs.push(
    publicarSnapshotTeste([agendamento({ servico: `E-${n}` })], {
      persistir: persistirE,
    })
  )
}
liberarE()
const resultadosE = await Promise.all(pEs)
assert.equal(resultadosE.every((r) => r.ok), true)
assert.equal(persistidosE.at(-1), 'E-5')
assert.ok(persistidosE.includes('E-5'))
assert.ok(persistidosE.length >= 2)
assert.ok(persistidosE.length <= 5)

// H) SELECT falha via snapshot explícito: zero upsert; fila pendente
resetarFilaPushAgendaParaTeste()
syncQueueService.limparPorOffice(OFFICE_LOCAL)
let upsertsH = 0
const okH = await publicarSnapshotTeste(
  [agendamento({ servico: 'H nao pode ir as cegas' })],
  {
    carregarRemoto: async () => ({
      ok: false,
      dados: null,
      erros: [{ mensagem: 'timeout select H' }],
    }),
    persistir: async (ags) => {
      upsertsH += 1
      return { ok: true, erros: [], enviados: ags.length }
    },
  }
)
assert.equal(okH.ok, false)
assert.equal(okH.etapa, 'select_falhou')
assert.equal(upsertsH, 0)
assert.equal(contarFilaAgenda(), 1)

// I) upsert parcial: fila permanece
resetarFilaPushAgendaParaTeste()
syncQueueService.limparPorOffice(OFFICE_LOCAL)
const okI = await publicarSnapshotTeste([agendamento({ servico: 'I parcial' })], {
  persistir: async (ags) => ({
    ok: false,
    erros: [{ mensagem: 'parcial' }],
    enviados: Math.max(0, ags.length - 1),
  }),
})
assert.equal(okI.ok, false)
assert.equal(contarFilaAgenda() > 0, true)

// J) sucesso total: fila limpa
resetarFilaPushAgendaParaTeste()
syncQueueService.limparPorOffice(OFFICE_LOCAL)
enfileirarAgendaTeste('pre-j')
assert.equal(contarFilaAgenda() > 0, true)
const okJ = await publicarSnapshotTeste([
  agendamento({
    servico: 'J sucesso total',
    updated_at: '2026-09-17T22:00:00.000Z',
  }),
])
assert.equal(okJ.ok, true)
assert.equal(okJ.etapa, 'ok')
assert.equal(contarFilaAgenda(), 0)

// K) tombstone continua protegido no push com snapshot explícito
resetarFilaPushAgendaParaTeste()
syncQueueService.limparPorOffice(OFFICE_LOCAL)
let upsertsK = 0
const okK = await publicarSnapshotTeste(
  [
    agendamento({
      servico: 'K ativo local',
      deleted_at: null,
      updated_at: '2026-09-17T10:00:00.000Z',
    }),
  ],
  {
    carregarRemoto: async () => ({
      ok: false,
      dados: null,
      erros: [{ mensagem: 'select tombstone K' }],
    }),
    persistir: async (ags) => {
      upsertsK += 1
      return { ok: true, erros: [], enviados: ags.length }
    },
  }
)
assert.equal(okK.ok, false)
assert.equal(okK.etapa, 'select_falhou')
assert.equal(upsertsK, 0)
const kTomb = mesclarAgendamentos(
  [
    agendamento({
      servico: 'K ativo local',
      deleted_at: null,
      updated_at: '2026-09-17T10:00:00.000Z',
    }),
  ],
  [
    agendamento({
      servico: 'K tombstone remoto',
      deleted_at: '2026-09-17T13:00:00.000Z',
      updated_at: '2026-09-17T13:00:00.000Z',
    }),
  ]
)
assert.ok(kTomb[0].deleted_at)

const hybridSrc = readFileSync(
  new URL('../src/services/repository/hybrid.repository.ts', import.meta.url),
  'utf8'
)
assert.match(hybridSrc, /consumirPersistenciaSomenteAgenda/)
assert.match(hybridSrc, /if \(somenteAgenda\) return/)
assert.match(hybridSrc, /enfileirarSyncAgendamentos\(officeId, 'offline'\)/)
assert.doesNotMatch(
  hybridSrc,
  /marcarPersistenciaSomenteAgenda\(\)[\s\S]*agendarPersistirRemoto/
)

const idxSalvarLocal = hybridSrc.indexOf('localCraftRepository.salvar(officeId, snapshot)')
const idxSomenteAgenda = hybridSrc.indexOf('if (somenteAgenda) return')
const idxVoidPush = hybridSrc.indexOf('void publicarAgendamentosLocais(officeId)')
const idxFase1 = hybridSrc.indexOf('enfileirarFase1Pendente(officeId, dados)')
const idxPagamentos = hybridSrc.indexOf('enfileirarPagamentosDoDatabase(officeId, dados)')
const idxAgendarRemoto = hybridSrc.indexOf('this.agendarPersistirRemoto(officeId, snapshot)')
assert.ok(idxSalvarLocal >= 0 && idxSomenteAgenda > idxSalvarLocal)
assert.ok(idxVoidPush > idxSomenteAgenda)
assert.ok(idxFase1 > idxSomenteAgenda)
assert.ok(idxPagamentos > idxSomenteAgenda)
assert.ok(idxAgendarRemoto > idxSomenteAgenda)

const craftSrc = readFileSync(
  new URL('../src/context/CraftContext.tsx', import.meta.url),
  'utf8'
)
assert.match(craftSrc, /persistirAgendaLocal/)
assert.match(craftSrc, /localCraftRepository\.salvar\(officeId, next\)/)
assert.match(craftSrc, /setDados\(next\)/)
assert.match(
  craftSrc,
  /publicarAgendamentosLocais\(officeId, \{\s*agendamentos: snapshotPush,/
)
assert.match(craftSrc, /etapa: resultado\.etapa/)
assert.doesNotMatch(craftSrc, /marcarPersistenciaSomenteAgenda/)
assert.doesNotMatch(craftSrc, /void publicarAgendamentosLocais/)
assert.doesNotMatch(craftSrc, /agendarPullAgendaRealtime/)

const syncSrc = readFileSync(
  new URL('../src/services/agenda/agenda-sync.service.ts', import.meta.url),
  'utf8'
)
assert.match(syncSrc, /enfileirarPushAgenda/)
assert.match(syncSrc, /opcoes\?\.agendamentos/)
assert.doesNotMatch(syncSrc, /reuse_in_flight/)
assert.doesNotMatch(syncSrc, /publicacoesEmAndamento/)

const queueSrc = readFileSync(
  new URL('../src/services/agenda/agenda-push-queue.ts', import.meta.url),
  'utf8'
)
assert.match(queueSrc, /trailingWaiters/)
assert.match(queueSrc, /trailingExecutar/)
assert.match(queueSrc, /bombearPushAgenda/)
assert.match(queueSrc, /clonarAgendamentos/)
assert.match(queueSrc, /AgendaPushResult/)
assert.doesNotMatch(queueSrc, /trailingWaiters: Array<\(ok: boolean\) => void>/)

const REAL_ID = 'b1dfdd63-319b-402d-a6dd-67b792ccc103'
const REMOTO_ATUAL = agendamento({
  id: REAL_ID,
  servico: 'Teste realtime direcionado 3',
  updated_at: '2026-09-18T00:45:35.908174Z',
  deleted_at: null,
})
const PATCH_NOVO = { servico: 'teste snapshot novo 1' }

// A) local com updated_at NOVO (stampUpdate) → local vence → upsert contém o texto novo
const localComStamp = stampUpdate({ ...REMOTO_ATUAL, ...PATCH_NOVO })
assert.equal(localComStamp.servico, 'teste snapshot novo 1')
assert.ok(localComStamp.updated_at)
assert.ok(localComStamp.updated_at > REMOTO_ATUAL.updated_at!)
const mergeComStamp = mesclarAgendamentos([localComStamp], [REMOTO_ATUAL])
assert.equal(mergeComStamp[0].servico, 'teste snapshot novo 1')
assert.equal(mergeComStamp[0].id, REAL_ID)
assert.equal(mergeComStamp[0].deleted_at ?? null, null)

resetarFilaPushAgendaParaTeste()
syncQueueService.limparPorOffice(OFFICE_LOCAL)
const upsertA: string[] = []
const okStamp = await executarPushAgendamentos(
  inputPushBase({
    locais: [localComStamp],
    carregarRemoto: async () => ({ ok: true, dados: [REMOTO_ATUAL], erros: [] }),
    persistir: async (ags) => {
      upsertA.push(ags[0].servico)
      return { ok: true, erros: [], enviados: ags.length }
    },
  })
)
assert.equal(okStamp.ok, true)
assert.deepEqual(upsertA, ['teste snapshot novo 1'])
assert.equal(contarFilaAgenda(), 0)

// B) local SEM bump de updated_at → merge atual descarta a edição; push ainda pode retornar true
const localSemStamp = { ...REMOTO_ATUAL, ...PATCH_NOVO }
assert.equal(localSemStamp.servico, 'teste snapshot novo 1')
assert.equal(localSemStamp.updated_at, REMOTO_ATUAL.updated_at)
const mergeSemStamp = mesclarAgendamentos([localSemStamp], [REMOTO_ATUAL])
assert.equal(mergeSemStamp[0].servico, 'Teste realtime direcionado 3')
assert.equal(mergeSemStamp[0].updated_at, REMOTO_ATUAL.updated_at)

resetarFilaPushAgendaParaTeste()
syncQueueService.limparPorOffice(OFFICE_LOCAL)
const upsertB: string[] = []
const okSemStamp = await executarPushAgendamentos(
  inputPushBase({
    locais: [localSemStamp],
    carregarRemoto: async () => ({ ok: true, dados: [REMOTO_ATUAL], erros: [] }),
    persistir: async (ags) => {
      upsertB.push(ags[0].servico)
      return { ok: true, erros: [], enviados: ags.length }
    },
  })
)
assert.equal(okSemStamp.ok, true)
assert.deepEqual(upsertB, ['Teste realtime direcionado 3'])
assert.equal(
  mensagemToastSaveAgenda({ ok: okSemStamp.ok, syncHabilitado: true }),
  MSG.agendamentoSalvo
)

const craftDataSrc = readFileSync(
  new URL('../src/services/craft-data.service.ts', import.meta.url),
  'utf8'
)
assert.match(
  craftDataSrc,
  /atualizarAgendamento\([\s\S]*stampUpdate\(\{ \.\.\.a, \.\.\.patch \}\)/
)
assert.match(craftSrc, /rebaseUpdateAgendamento\(repo, id, agendamento\)/)
const rebaseSrc = readFileSync(
  new URL('../src/services/agenda/agenda-save-rebase.ts', import.meta.url),
  'utf8'
)
assert.match(
  rebaseSrc,
  /stampUpdate\(\{ \.\.\.atual, \.\.\.patch, id: atual\.id \}\)/
)

const agendaPageSrc = readFileSync(
  new URL('../src/pages/AgendaPage.tsx', import.meta.url),
  'utf8'
)
assert.match(agendaPageSrc, /mensagemToastSaveAgenda/)
assert.match(agendaPageSrc, /diagnosticoPushAgendaVisivel/)
assert.match(agendaPageSrc, /diagnosticoEtapa: DIAGNOSTICO_AGENDA_HOMOLOG/)
assert.match(agendaPageSrc, /toast\.atencao\(msg\)/)
assert.doesNotMatch(agendaPageSrc, /MSG\.atencaoSync/)

// Observabilidade A) offline
resetarFilaPushAgendaParaTeste()
syncQueueService.limparPorOffice(OFFICE_LOCAL)
let upsertsOffline = 0
const rOffline = await executarPushAgendamentos({
  ...inputPushBase({
    locais: [agendamento({ servico: 'Offline visivel' })],
    carregarRemoto: async () => ({ ok: true, dados: [], erros: [] }),
    persistir: async (ags) => {
      upsertsOffline += 1
      return { ok: true, erros: [], enviados: ags.length }
    },
  }),
  online: false,
})
assert.equal(rOffline.ok, false)
assert.equal(rOffline.etapa, 'offline')
assert.equal(upsertsOffline, 0)
assert.equal(contarFilaAgenda(), 1)

// Observabilidade C) mapper falha → etapa mapper_falhou; fila permanece
resetarFilaPushAgendaParaTeste()
syncQueueService.limparPorOffice(OFFICE_LOCAL)
const rMapper = await executarPushAgendamentos(
  inputPushBase({
    locais: [agendamento({ servico: 'Mapper falhou' })],
    carregarRemoto: async () => ({
      ok: true,
      dados: [agendamento({ servico: 'Remoto mapper' })],
      erros: [],
    }),
    persistir: async () => ({
      ok: false,
      enviados: 0,
      erros: [
        {
          mensagem: 'Agendamento sem cliente/veículo UUID válido para o remoto',
        },
      ],
    }),
  })
)
assert.equal(rMapper.ok, false)
assert.equal(rMapper.etapa, 'mapper_falhou')
assert.equal(contarFilaAgenda(), 1)
assert.equal(
  (syncQueueService.listar(OFFICE_LOCAL, 'pendente')[0]?.payload as { motivo?: string })
    .motivo,
  'upsert_falhou'
)

// Propagação do erro real do UPSERT
resetarFilaPushAgendaParaTeste()
syncQueueService.limparPorOffice(OFFICE_LOCAL)
const r42501 = await executarPushAgendamentos(
  inputPushBase({
    locais: [agendamento({ servico: 'Erro rls visivel' })],
    carregarRemoto: async () => ({
      ok: true,
      dados: [agendamento({ servico: 'Remoto rls' })],
      erros: [],
    }),
    persistir: async (ags) => ({
      ok: false,
      enviados: 0,
      loteTamanho: ags.length,
      loteIds: ags.map((a) => a.id),
      erros: [
        {
          codigo: '42501',
          mensagem:
            'new row violates row-level security policy for table "appointments"',
          details:
            'Cliente João tel 11999999999 placa ABC1D23 eyJhbGciOi.aaa.bbb https://x.supabase.co',
          hint: 'Check policy WITH CHECK',
        },
      ],
    }),
  })
)
assert.equal(r42501.ok, false)
assert.equal(r42501.etapa, 'upsert_falhou')
assert.equal(r42501.supabaseCode, '42501')
assert.match(
  r42501.supabaseMessage ?? '',
  /new row violates row-level security policy/
)
assert.equal((r42501.supabaseDetails ?? '').includes('11999999999'), false)
assert.equal((r42501.supabaseDetails ?? '').includes('ABC1D23'), false)
assert.equal((r42501.supabaseDetails ?? '').includes('eyJ'), false)
assert.match(r42501.supabaseDetails ?? '', /\[redacted\]/)
const toast42501 = mensagemToastSaveAgenda(
  {
    ok: false,
    syncHabilitado: true,
    etapa: 'upsert_falhou',
    supabaseCode: r42501.supabaseCode,
    supabaseMessage: r42501.supabaseMessage,
    supabaseDetails: r42501.supabaseDetails,
  },
  { diagnosticoEtapa: true }
)
assert.equal(
  toast42501,
  [
    'Agendamento salvo neste dispositivo.',
    'Sincronização pendente: upsert_falhou.',
    'Código: 42501',
    'Motivo: new row violates row-level security policy for table "appointments"',
  ].join('\n')
)
assert.equal(toast42501.includes('João'), false)
assert.equal(toast42501.includes('11999999999'), false)
assert.equal(toast42501.includes('ABC1D23'), false)
assert.equal(
  mensagemToastSaveAgenda(
    {
      ok: false,
      syncHabilitado: true,
      etapa: 'upsert_falhou',
      supabaseCode: '42501',
    },
    { diagnosticoEtapa: false }
  ),
  MSG.agendamentoSalvoPendenteSync
)

const sanitizado = sanitizarTextoErroAgenda(
  'Bearer abc.def João 11988887777 placa XYZ1A23 eyJhbGciOi.xxx.yyy'
)
assert.ok(sanitizado)
assert.equal(sanitizado.includes('11988887777'), false)
assert.equal(sanitizado.includes('XYZ1A23'), false)
assert.equal(sanitizado.includes('eyJ'), false)
assert.equal(sanitizado.includes('Bearer'), false)

resetarFilaPushAgendaParaTeste()
syncQueueService.limparPorOffice(OFFICE_LOCAL)
let liberarErro!: () => void
const gateErro = new Promise<void>((resolve) => {
  liberarErro = resolve
})
let sinalizarErro!: () => void
const inicioErro = new Promise<void>((resolve) => {
  sinalizarErro = resolve
})
const pErrA = publicarSnapshotTeste([agendamento({ servico: 'ERR-A' })], {
  carregarRemoto: async () => {
    sinalizarErro()
    await gateErro
    return { ok: true, dados: [], erros: [] }
  },
  persistir: async () => ({
    ok: false,
    enviados: 0,
    erros: [{ codigo: '42501', mensagem: 'RLS A' }],
  }),
})
await inicioErro
const pErrB = publicarSnapshotTeste([agendamento({ servico: 'ERR-B' })], {
  persistir: async () => ({
    ok: false,
    enviados: 0,
    erros: [{ codigo: '23503', mensagem: 'FK B' }],
  }),
})
liberarErro()
const [errA, errB] = await Promise.all([pErrA, pErrB])
assert.equal(errA.ok, false)
assert.equal(errA.etapa, 'upsert_falhou')
assert.equal(errA.supabaseCode, '42501')
assert.equal(errA.supabaseMessage, 'RLS A')
assert.equal(errB.ok, false)
assert.equal(errB.etapa, 'upsert_falhou')
assert.equal(errB.supabaseCode, '23503')
assert.equal(errB.supabaseMessage, 'FK B')
assert.notEqual(errA.tentativaId, errB.tentativaId)

resetarFilaPushAgendaParaTeste()
syncQueueService.limparPorOffice(OFFICE_LOCAL)
const rOkErro = await publicarSnapshotTeste([
  agendamento({ servico: 'Sucesso apos erro' }),
])
assert.equal(rOkErro.ok, true)
assert.equal(rOkErro.etapa, 'ok')
assert.equal(rOkErro.supabaseCode, undefined)

// FK: registry → UUID preservado → fallback legado
const APT_A = 'b1dfdd63-319b-402d-a6dd-67b792ccc103'
const APT_B = '2a2a0944-4792-4aab-9339-cb836ada9c42'
const CUSTOMER_A_REAL = '14175b13-f669-5d37-b081-0d1a32742359'
const CUSTOMER_B_REAL = '4d0684fa-acc3-55a6-8430-97e83187d2b8'
const MOTO_A_REAL = '0e08aaea-a07d-53b2-bc38-5ec87899c067'
const MOTO_B_REAL = '9bfe2738-d569-516f-bc87-f4abb8ce91c6'
const HASH_CUSTOMER_A_INVALIDO = 'd1c82a52-015d-5816-a730-b41b9e098a27'
const HASH_MOTO_A_INVALIDO = 'ebdd7c40-a659-5003-931b-d24f07a525c8'
const HASH_CUSTOMER_B_INVALIDO = 'c543caa3-066c-5911-a0ad-315b4eaf7d37'
const HASH_MOTO_B_INVALIDO = 'c478ff94-50f8-53d9-b201-36e606a824cc'
const OS_UUID_REAL = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0001'
const customersReais = new Set([CUSTOMER_A_REAL, CUSTOMER_B_REAL])
const motosReais = new Set([MOTO_A_REAL, MOTO_B_REAL])

async function persistirComFkModelo(ags: Agendamento[]): Promise<{
  ok: boolean
  enviados: number
  loteTamanho: number
  loteIds: string[]
  fkIds: ReturnType<typeof montarAgendaFkId>[]
  erros: { codigo?: string; mensagem?: string }[]
}> {
  const linhas: Record<string, unknown>[] = []
  const fkIds: ReturnType<typeof montarAgendaFkId>[] = []
  for (const ag of ags) {
    const row = await mapearAgendamentoParaSupabase(ag, OFFICE_UUID)
    if (!row) {
      return {
        ok: false,
        enviados: 0,
        loteTamanho: 0,
        loteIds: [],
        fkIds: [],
        erros: [{ mensagem: 'mapper_falhou' }],
      }
    }
    linhas.push(row)
    fkIds.push(montarAgendaFkId(ag, row))
  }
  const loteIds = linhas.map((row) => String(row.id ?? ''))
  const fkInvalida = linhas.some(
    (row) =>
      !customersReais.has(String(row.customer_id ?? '')) ||
      !motosReais.has(String(row.motorcycle_id ?? ''))
  )
  if (fkInvalida) {
    return {
      ok: false,
      enviados: 0,
      loteTamanho: linhas.length,
      loteIds,
      fkIds,
      erros: [
        {
          codigo: '23503',
          mensagem:
            'insert or update on table "appointments" violates foreign key constraint "appointments_customer_id_fkey"',
        },
      ],
    }
  }
  return {
    ok: true,
    enviados: linhas.length,
    loteTamanho: linhas.length,
    loteIds,
    fkIds,
    erros: [],
  }
}

function agendamentoAuditado(
  id: string,
  clienteId: string,
  motoId: string,
  osId?: string
): Agendamento {
  return agendamento({
    id,
    cliente_id: clienteId,
    moto_id: motoId,
    ordem_servico_id: osId,
  })
}

limparRegistroIds()
assert.equal(await localIdParaUuid(CUSTOMER_A_REAL), HASH_CUSTOMER_A_INVALIDO)
assert.equal(await localIdParaUuid(MOTO_A_REAL), HASH_MOTO_A_INVALIDO)
assert.equal(await localIdParaUuid(CUSTOMER_B_REAL), HASH_CUSTOMER_B_INVALIDO)
assert.equal(await localIdParaUuid(MOTO_B_REAL), HASH_MOTO_B_INVALIDO)
assert.equal(customersReais.has(HASH_CUSTOMER_A_INVALIDO), false)
assert.equal(motosReais.has(HASH_MOTO_A_INVALIDO), false)

const rowA = await mapearAgendamentoParaSupabase(
  agendamentoAuditado(APT_A, CUSTOMER_A_REAL, MOTO_A_REAL),
  OFFICE_UUID
)
assert.ok(rowA)
assert.equal(rowA.id, APT_A)
assert.equal(rowA.customer_id, CUSTOMER_A_REAL)
assert.equal(rowA.motorcycle_id, MOTO_A_REAL)
assert.notEqual(rowA.customer_id, HASH_CUSTOMER_A_INVALIDO)
assert.notEqual(rowA.motorcycle_id, HASH_MOTO_A_INVALIDO)
assert.equal(rowA.service_order_id, null)

const rowB = await mapearAgendamentoParaSupabase(
  agendamentoAuditado(APT_B, CUSTOMER_B_REAL, MOTO_B_REAL),
  OFFICE_UUID
)
assert.ok(rowB)
assert.equal(rowB.id, APT_B)
assert.equal(rowB.customer_id, CUSTOMER_B_REAL)
assert.equal(rowB.motorcycle_id, MOTO_B_REAL)
assert.notEqual(rowB.customer_id, HASH_CUSTOMER_B_INVALIDO)
assert.notEqual(rowB.motorcycle_id, HASH_MOTO_B_INVALIDO)

const rLoteReal = await persistirComFkModelo([
  agendamentoAuditado(APT_A, CUSTOMER_A_REAL, MOTO_A_REAL),
  agendamentoAuditado(APT_B, CUSTOMER_B_REAL, MOTO_B_REAL),
])
assert.equal(rLoteReal.ok, true)
assert.equal(rLoteReal.enviados, 2)
assert.deepEqual(rLoteReal.loteIds, [APT_A, APT_B])
assert.equal(rLoteReal.erros.length, 0)

// A) ID não-UUID com registry → UUID do registry
limparRegistroIds()
registrarMapeamentoId('cli-existente', CUSTOMER_A_REAL)
registrarMapeamentoId('moto-existente', MOTO_A_REAL)
const rowRegistry = await mapearAgendamentoParaSupabase(
  agendamentoAuditado(APT_A, 'cli-existente', 'moto-existente'),
  OFFICE_UUID
)
assert.ok(rowRegistry)
assert.equal(rowRegistry.customer_id, CUSTOMER_A_REAL)
assert.equal(rowRegistry.motorcycle_id, MOTO_A_REAL)

// B) UUID com registry antigo/diferente → AINDA preserva o UUID de entrada
limparRegistroIds()
registrarMapeamentoId(CUSTOMER_A_REAL, CUSTOMER_B_REAL)
registrarMapeamentoId(MOTO_A_REAL, MOTO_B_REAL)
const rowRegistryPrioridade = await mapearAgendamentoParaSupabase(
  agendamentoAuditado(APT_A, CUSTOMER_A_REAL, MOTO_A_REAL),
  OFFICE_UUID
)
assert.ok(rowRegistryPrioridade)
assert.equal(rowRegistryPrioridade.customer_id, CUSTOMER_A_REAL)
assert.equal(rowRegistryPrioridade.motorcycle_id, MOTO_A_REAL)
assert.notEqual(rowRegistryPrioridade.customer_id, CUSTOMER_B_REAL)

// C) UUID sem registry → preserva o próprio UUID
limparRegistroIds()
const rowPreserva = await mapearAgendamentoParaSupabase(
  agendamentoAuditado(APT_A, CUSTOMER_A_REAL, MOTO_A_REAL, OS_UUID_REAL),
  OFFICE_UUID
)
assert.ok(rowPreserva)
assert.equal(rowPreserva.customer_id, CUSTOMER_A_REAL)
assert.equal(rowPreserva.motorcycle_id, MOTO_A_REAL)
assert.equal(rowPreserva.service_order_id, OS_UUID_REAL)

// D) ID legado não-UUID sem registry → fallback determinístico
limparRegistroIds()
const rowLegadoFk = await mapearAgendamentoParaSupabase(
  agendamentoAuditado(APT_A, 'cli-legado-fk', 'moto-legado-fk'),
  OFFICE_UUID
)
assert.ok(rowLegadoFk)
assert.equal(rowLegadoFk.customer_id, await localIdParaUuid('cli-legado-fk'))
assert.equal(rowLegadoFk.motorcycle_id, await localIdParaUuid('moto-legado-fk'))
assert.equal(isUuidFormato(String(rowLegadoFk.customer_id)), true)
const fkLegado = montarAgendaFkId(
  agendamentoAuditado(APT_A, 'cli-legado-fk', 'moto-legado-fk'),
  rowLegadoFk
)
assert.equal(fkLegado.clienteIdEntrada, 'cli-legado-fk')
assert.equal(fkLegado.customerIdFinal, await localIdParaUuid('cli-legado-fk'))
assert.equal(fkLegado.motoIdEntrada, 'moto-legado-fk')
assert.equal(fkLegado.motorcycleIdFinal, await localIdParaUuid('moto-legado-fk'))

// E) FK opcional vazia → null
limparRegistroIds()
const rowOsVazia = await mapearAgendamentoParaSupabase(
  agendamentoAuditado(APT_A, CUSTOMER_A_REAL, MOTO_A_REAL, '   '),
  OFFICE_UUID
)
assert.ok(rowOsVazia)
assert.equal(rowOsVazia.service_order_id, null)

// Registry envenenado: UUID de entrada prevalece; hashes inválidos não saem no payload
limparRegistroIds()
registrarMapeamentoId(CUSTOMER_A_REAL, HASH_CUSTOMER_A_INVALIDO)
registrarMapeamentoId(MOTO_A_REAL, HASH_MOTO_A_INVALIDO)
registrarMapeamentoId(CUSTOMER_B_REAL, HASH_CUSTOMER_B_INVALIDO)
registrarMapeamentoId(MOTO_B_REAL, HASH_MOTO_B_INVALIDO)
assert.equal(obterUuidPorLocalId(CUSTOMER_A_REAL), HASH_CUSTOMER_A_INVALIDO)
assert.equal(obterUuidPorLocalId(CUSTOMER_B_REAL), HASH_CUSTOMER_B_INVALIDO)
assert.equal(obterUuidPorLocalId(MOTO_A_REAL), HASH_MOTO_A_INVALIDO)
assert.equal(obterUuidPorLocalId(MOTO_B_REAL), HASH_MOTO_B_INVALIDO)

const rowPoisonA = await mapearAgendamentoParaSupabase(
  agendamentoAuditado(APT_A, CUSTOMER_A_REAL, MOTO_A_REAL),
  OFFICE_UUID
)
assert.ok(rowPoisonA)
assert.equal(rowPoisonA.customer_id, CUSTOMER_A_REAL)
assert.equal(rowPoisonA.motorcycle_id, MOTO_A_REAL)
assert.notEqual(rowPoisonA.customer_id, HASH_CUSTOMER_A_INVALIDO)
assert.notEqual(rowPoisonA.motorcycle_id, HASH_MOTO_A_INVALIDO)
assert.equal(customersReais.has(String(rowPoisonA.customer_id)), true)
assert.equal(motosReais.has(String(rowPoisonA.motorcycle_id)), true)

const rowPoisonB = await mapearAgendamentoParaSupabase(
  agendamentoAuditado(APT_B, CUSTOMER_B_REAL, MOTO_B_REAL),
  OFFICE_UUID
)
assert.ok(rowPoisonB)
assert.equal(rowPoisonB.customer_id, CUSTOMER_B_REAL)
assert.equal(rowPoisonB.motorcycle_id, MOTO_B_REAL)
assert.notEqual(rowPoisonB.customer_id, HASH_CUSTOMER_B_INVALIDO)
assert.notEqual(rowPoisonB.motorcycle_id, HASH_MOTO_B_INVALIDO)

const rPoison = await persistirComFkModelo([
  agendamentoAuditado(APT_A, CUSTOMER_A_REAL, MOTO_A_REAL),
  agendamentoAuditado(APT_B, CUSTOMER_B_REAL, MOTO_B_REAL),
])
assert.equal(rPoison.ok, true)
assert.equal(rPoison.enviados, 2)
assert.deepEqual(rPoison.loteIds, [APT_A, APT_B])
assert.equal(rPoison.erros.length, 0)
assert.equal(obterUuidPorLocalId(CUSTOMER_A_REAL), HASH_CUSTOMER_A_INVALIDO)
assert.equal(rPoison.fkIds[0]?.clienteIdEntrada, CUSTOMER_A_REAL)
assert.equal(rPoison.fkIds[0]?.customerIdFinal, CUSTOMER_A_REAL)
assert.equal(rPoison.fkIds[0]?.motoIdEntrada, MOTO_A_REAL)
assert.equal(rPoison.fkIds[0]?.motorcycleIdFinal, MOTO_A_REAL)

const toastFk = mensagemToastSaveAgenda(
  {
    ok: false,
    syncHabilitado: true,
    etapa: 'upsert_falhou',
    supabaseCode: '23503',
    supabaseMessage:
      'insert or update on table "appointments" violates foreign key constraint "appointments_customer_id_fkey"',
    fkIds: [
      {
        appointmentId: APT_A,
        clienteIdEntrada: 'cli-celular-entrada',
        customerId: HASH_CUSTOMER_A_INVALIDO,
        customerIdFinal: HASH_CUSTOMER_A_INVALIDO,
        motoIdEntrada: 'moto-celular-entrada',
        motorcycleId: HASH_MOTO_A_INVALIDO,
        motorcycleIdFinal: HASH_MOTO_A_INVALIDO,
      },
      {
        appointmentId: APT_B,
        clienteIdEntrada: CUSTOMER_B_REAL,
        customerId: CUSTOMER_B_REAL,
        customerIdFinal: CUSTOMER_B_REAL,
        motoIdEntrada: MOTO_B_REAL,
        motorcycleId: MOTO_B_REAL,
        motorcycleIdFinal: MOTO_B_REAL,
      },
    ],
  },
  { diagnosticoEtapa: true }
)
assert.match(toastFk, /^Agenda pendente: upsert_falhou \(23503\)/)
assert.match(toastFk, new RegExp(`apt=${APT_A.slice(0, 8)}`))
assert.match(toastFk, /entradaCliente=cli-celular-entrada/)
assert.match(toastFk, new RegExp(`customerFinal=${HASH_CUSTOMER_A_INVALIDO}`))
assert.match(toastFk, /entradaMoto=moto-celular-entrada/)
assert.match(toastFk, new RegExp(`motorcycleFinal=${HASH_MOTO_A_INVALIDO}`))
assert.match(toastFk, new RegExp(`entradaCliente=${CUSTOMER_B_REAL}`))
assert.match(toastFk, new RegExp(`customerFinal=${CUSTOMER_B_REAL}`))
assert.match(toastFk, new RegExp(`mapper=${MAPPER_AGENDA_HOMOLOG}`))
assert.equal(MAPPER_AGENDA_HOMOLOG, 'uuid-first-v2')
assert.match(toastFk, new RegExp(`build=${APP_DEPLOY_VERSION}`))
assert.match(toastFk, /FK: appointments_customer_id_fkey/)
assert.equal(toastFk.includes('insert or update on table'), false)
assert.equal(toastFk.includes('João'), false)
assert.equal(toastFk.includes('11999999999'), false)
assert.equal(toastFk.includes('ABC1D23'), false)
assert.equal(toastFk.includes('eyJ'), false)
assert.equal(
  mensagemToastSaveAgenda(
    {
      ok: false,
      syncHabilitado: true,
      etapa: 'upsert_falhou',
      supabaseCode: '23503',
      supabaseMessage:
        'insert or update on table "appointments" violates foreign key constraint "appointments_customer_id_fkey"',
      fkIds: [
        {
          appointmentId: APT_A,
          clienteIdEntrada: CUSTOMER_A_REAL,
          customerId: HASH_CUSTOMER_A_INVALIDO,
          customerIdFinal: HASH_CUSTOMER_A_INVALIDO,
          motoIdEntrada: MOTO_A_REAL,
          motorcycleId: HASH_MOTO_A_INVALIDO,
          motorcycleIdFinal: HASH_MOTO_A_INVALIDO,
        },
      ],
    },
    { diagnosticoEtapa: false }
  ),
  MSG.agendamentoSalvoPendenteSync
)

resetarFilaPushAgendaParaTeste()
syncQueueService.limparPorOffice(OFFICE_LOCAL)
const rFkIds = await executarPushAgendamentos(
  inputPushBase({
    locais: [agendamentoAuditado(APT_A, CUSTOMER_A_REAL, MOTO_A_REAL)],
    carregarRemoto: async () => ({ ok: true, dados: [], erros: [] }),
    persistir: async () => ({
      ok: false,
      enviados: 0,
      loteTamanho: 1,
      loteIds: [APT_A],
      fkIds: [
        {
          appointmentId: APT_A,
          clienteIdEntrada: CUSTOMER_A_REAL,
          customerId: HASH_CUSTOMER_A_INVALIDO,
          customerIdFinal: HASH_CUSTOMER_A_INVALIDO,
          motoIdEntrada: MOTO_A_REAL,
          motorcycleId: HASH_MOTO_A_INVALIDO,
          motorcycleIdFinal: HASH_MOTO_A_INVALIDO,
        },
      ],
      erros: [
        {
          codigo: '23503',
          mensagem:
            'insert or update on table "appointments" violates foreign key constraint "appointments_customer_id_fkey"',
        },
      ],
    }),
  })
)
assert.equal(rFkIds.ok, false)
assert.equal(rFkIds.etapa, 'upsert_falhou')
assert.equal(rFkIds.fkIds?.[0]?.appointmentId, APT_A)
assert.equal(rFkIds.fkIds?.[0]?.clienteIdEntrada, CUSTOMER_A_REAL)
assert.equal(rFkIds.fkIds?.[0]?.customerIdFinal, HASH_CUSTOMER_A_INVALIDO)
assert.equal(rFkIds.fkIds?.[0]?.customerId, HASH_CUSTOMER_A_INVALIDO)
assert.equal(rFkIds.fkIds?.[0]?.motoIdEntrada, MOTO_A_REAL)
assert.equal(rFkIds.fkIds?.[0]?.motorcycleIdFinal, HASH_MOTO_A_INVALIDO)
assert.equal(rFkIds.fkIds?.[0]?.motorcycleId, HASH_MOTO_A_INVALIDO)

const CLI_B_LOCAL = 'cli-4d0684fa'
const MOTO_B_LOCAL = 'moto-9bfe2738'
const HASH_CLI_B_POISON = '08da8694-07f8-5a7c-9174-607b142d8af4'
const HASH_MOTO_B_POISON = '2e3c80ad-b639-5f4c-bf98-bd4659b7da33'
const OS_B_LOCAL = 'os-aaaaaaaa'
const HASH_OS_B_POISON = await localIdParaUuid(OS_B_LOCAL)

function rowAppointmentB(parcial: Partial<AppointmentRow> = {}): AppointmentRow {
  return {
    id: APT_B,
    office_id: OFFICE_UUID,
    customer_id: CUSTOMER_B_REAL,
    motorcycle_id: MOTO_B_REAL,
    service_order_id: OS_UUID_REAL,
    appointment_date: '2026-09-18',
    appointment_time: '10:00:00',
    service: 'Revisão B',
    status: 'agendado',
    notes: null,
    created_at: '2026-09-18T10:00:00.000Z',
    updated_at: '2026-09-18T10:00:00.000Z',
    deleted_at: null,
    ...parcial,
  }
}

function plantarRegistryEnvenenadoB(): void {
  limparRegistroIds()
  localStorage.setItem(
    'craft_id_map_v1',
    JSON.stringify({
      version: 2,
      uuidParaLocal: {
        [HASH_CLI_B_POISON]: CLI_B_LOCAL,
        [CUSTOMER_B_REAL]: CLI_B_LOCAL,
        [HASH_MOTO_B_POISON]: MOTO_B_LOCAL,
        [MOTO_B_REAL]: MOTO_B_LOCAL,
        [HASH_OS_B_POISON]: OS_B_LOCAL,
        [OS_UUID_REAL]: OS_B_LOCAL,
      },
      localParaUuid: {
        [CLI_B_LOCAL]: HASH_CLI_B_POISON,
        [MOTO_B_LOCAL]: HASH_MOTO_B_POISON,
        [OS_B_LOCAL]: HASH_OS_B_POISON,
      },
    })
  )
}

// A) registry correto permanece
limparRegistroIds()
registrarMapeamentoId(CLI_B_LOCAL, CUSTOMER_B_REAL)
registrarMapeamentoId(MOTO_B_LOCAL, MOTO_B_REAL)
const pullA = mapearAgendamentoDoSupabase(rowAppointmentB(), OFFICE_LOCAL)
assert.equal(pullA.cliente_id, CLI_B_LOCAL)
assert.equal(pullA.moto_id, MOTO_B_LOCAL)
assert.equal(obterUuidPorLocalId(CLI_B_LOCAL), CUSTOMER_B_REAL)
assert.equal(obterUuidPorLocalId(MOTO_B_LOCAL), MOTO_B_REAL)

// B) registry errado é reparado pelo UUID remoto da row
plantarRegistryEnvenenadoB()
assert.equal(obterUuidPorLocalId(CLI_B_LOCAL), HASH_CLI_B_POISON)
const pullB = mapearAgendamentoDoSupabase(rowAppointmentB(), OFFICE_LOCAL)
assert.equal(pullB.cliente_id, CLI_B_LOCAL)
assert.equal(pullB.moto_id, MOTO_B_LOCAL)
assert.equal(pullB.ordem_servico_id, OS_B_LOCAL)
assert.equal(obterUuidPorLocalId(CLI_B_LOCAL), CUSTOMER_B_REAL)
assert.equal(obterUuidPorLocalId(MOTO_B_LOCAL), MOTO_B_REAL)
assert.equal(obterUuidPorLocalId(OS_B_LOCAL), OS_UUID_REAL)
assert.equal(obterLocalIdPorUuid(CUSTOMER_B_REAL), CLI_B_LOCAL)
assert.equal(obterLocalIdPorUuid(HASH_CLI_B_POISON), undefined)

// C) registry ausente é criado para ID local não-UUID
limparRegistroIds()
localStorage.setItem(
  'craft_id_map_v1',
  JSON.stringify({
    version: 2,
    uuidParaLocal: {
      [CUSTOMER_B_REAL]: CLI_B_LOCAL,
      [MOTO_B_REAL]: MOTO_B_LOCAL,
    },
    localParaUuid: {},
  })
)
assert.equal(obterUuidPorLocalId(CLI_B_LOCAL), undefined)
const pullC = mapearAgendamentoDoSupabase(rowAppointmentB(), OFFICE_LOCAL)
assert.equal(pullC.cliente_id, CLI_B_LOCAL)
assert.equal(obterUuidPorLocalId(CLI_B_LOCAL), CUSTOMER_B_REAL)
assert.equal(obterUuidPorLocalId(MOTO_B_LOCAL), MOTO_B_REAL)

// D) UUID local direto continua preservado e não vira outro mapping
limparRegistroIds()
const pullDUuid = mapearAgendamentoDoSupabase(rowAppointmentB(), OFFICE_LOCAL)
assert.equal(pullDUuid.cliente_id, CUSTOMER_B_REAL)
assert.equal(pullDUuid.moto_id, MOTO_B_REAL)
assert.equal(obterUuidPorLocalId(CUSTOMER_B_REAL), undefined)
assert.equal(obterLocalIdPorUuid(CUSTOMER_B_REAL), undefined)

// E) customer e motorcycle reparados no pull direcionado com LWW local
plantarRegistryEnvenenadoB()
const localB = agendamentoAuditado(APT_B, CLI_B_LOCAL, MOTO_B_LOCAL)
localB.updated_at = '2026-09-18T12:00:00.000Z'
const remotoB = mapearAgendamentoDoSupabase(
  rowAppointmentB({ updated_at: '2026-09-18T11:00:00.000Z' }),
  OFFICE_LOCAL
)
const pullLww = await aplicarPullAgendaDirecionado({
  officeId: OFFICE_LOCAL,
  carregarLocal: () => ({ agendamentos: [localB] }),
  carregarRemoto: async () => ({ ok: true, dados: [remotoB] }),
  salvarLocal: () => undefined,
})
assert.equal(pullLww.ok, true)
assert.equal(pullLww.disparouPush, false)
assert.equal(pullLww.agendamentos?.[0]?.cliente_id, CLI_B_LOCAL)
assert.equal(obterUuidPorLocalId(CLI_B_LOCAL), CUSTOMER_B_REAL)
assert.equal(obterUuidPorLocalId(MOTO_B_LOCAL), MOTO_B_REAL)

// G/H) push após reparo: A e B com FKs reais, sem hash
plantarRegistryEnvenenadoB()
registrarMapeamentoId('cli-14175b13', CUSTOMER_A_REAL)
registrarMapeamentoId('moto-0e08aaea', MOTO_A_REAL)
mapearAgendamentoDoSupabase(
  {
    id: APT_A,
    office_id: OFFICE_UUID,
    customer_id: CUSTOMER_A_REAL,
    motorcycle_id: MOTO_A_REAL,
    service_order_id: null,
    appointment_date: '2026-09-18',
    appointment_time: '09:00:00',
    service: 'A',
    status: 'agendado',
    notes: null,
    created_at: '2026-09-18T09:00:00.000Z',
    updated_at: '2026-09-18T09:00:00.000Z',
  },
  OFFICE_LOCAL
)
mapearAgendamentoDoSupabase(rowAppointmentB(), OFFICE_LOCAL)
assert.equal(obterUuidPorLocalId('cli-14175b13'), CUSTOMER_A_REAL)
assert.equal(obterUuidPorLocalId(CLI_B_LOCAL), CUSTOMER_B_REAL)
const rowAposA = await mapearAgendamentoParaSupabase(
  agendamentoAuditado(APT_A, 'cli-14175b13', 'moto-0e08aaea'),
  OFFICE_UUID
)
const rowAposB = await mapearAgendamentoParaSupabase(
  agendamentoAuditado(APT_B, CLI_B_LOCAL, MOTO_B_LOCAL),
  OFFICE_UUID
)
assert.ok(rowAposA)
assert.ok(rowAposB)
assert.equal(rowAposA.customer_id, CUSTOMER_A_REAL)
assert.equal(rowAposA.motorcycle_id, MOTO_A_REAL)
assert.equal(rowAposB.customer_id, CUSTOMER_B_REAL)
assert.equal(rowAposB.motorcycle_id, MOTO_B_REAL)
assert.notEqual(rowAposB.customer_id, HASH_CLI_B_POISON)
assert.notEqual(rowAposB.motorcycle_id, HASH_MOTO_B_POISON)
assert.notEqual(rowAposB.customer_id, HASH_CUSTOMER_B_INVALIDO)
assert.notEqual(rowAposB.motorcycle_id, HASH_MOTO_B_INVALIDO)
const rLoteReparo = await persistirComFkModelo([
  agendamentoAuditado(APT_A, 'cli-14175b13', 'moto-0e08aaea'),
  agendamentoAuditado(APT_B, CLI_B_LOCAL, MOTO_B_LOCAL),
])
assert.equal(rLoteReparo.ok, true)
assert.equal(rLoteReparo.enviados, 2)
assert.equal(rLoteReparo.erros.length, 0)
assert.equal(rLoteReparo.fkIds[0]?.customerIdFinal, CUSTOMER_A_REAL)
assert.equal(rLoteReparo.fkIds[1]?.customerIdFinal, CUSTOMER_B_REAL)

console.log('verificar-agenda-sync: ok')
