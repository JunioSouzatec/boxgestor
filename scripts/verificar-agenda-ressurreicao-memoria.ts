import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { MSG } from '../src/lib/mensagens-usuario.ts'
import {
  mensagemToastExclusaoAgenda,
  mensagemToastSaveAgenda,
} from '../src/services/agenda/agenda-save-ux.ts'
import {
  clonarAgendamentos,
  rebaseCreateAgendamento,
  rebaseDeleteAgendamento,
  rebaseUpdateAgendamento,
} from '../src/services/agenda/agenda-save-rebase.ts'
import type { AgendaPushResult } from '../src/services/agenda/agenda-push.ts'
import {
  enfileirarPushAgenda,
  resetarFilaPushAgendaParaTeste,
} from '../src/services/agenda/agenda-push-queue.ts'
import type { Agendamento, AgendamentoInput } from '../src/types/agendamento.ts'
import type { CraftDatabase } from '../src/types/database.ts'

const mem = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', {
  value: {
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
  },
  configurable: true,
})

const OFFICE = 'fdd4e82f-2a03-4cd7-9340-b5f067d2fed5'
const ID_A = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa'
const ID_B = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb'
const ID_C = 'cccccccc-3333-4333-8333-cccccccccccc'
const D719 = 'd71945fa-aaaa-4bbb-8ccc-111111111111'
const ID_4FC = '4fc69f21-dddd-4eee-8fff-222222222222'
const AGORA = '2026-09-19T03:00:00.000Z'

function ag(id: string, horario: string, extra: Partial<Agendamento> = {}): Agendamento {
  return {
    id,
    oficina_id: OFFICE,
    office_id: OFFICE,
    data: '2026-09-19',
    horario,
    cliente_id: '14175b13-f669-5d37-b081-0d1a32742359',
    moto_id: '0e08aaea-a07d-53b2-bc38-5ec87899c067',
    servico: 'tecnico',
    status: 'agendado',
    created_at: AGORA,
    updated_at: AGORA,
    ...extra,
  }
}

function dbCom(agendamentos: Agendamento[]): CraftDatabase {
  return {
    configuracao: {
      id: OFFICE,
      office_id: OFFICE,
      oficina_id: OFFICE,
      nome: 'T',
      endereco: '',
      telefone: '',
    },
    clientes: [],
    motos: [],
    ordens_servico: [],
    pecas: [],
    fornecedores: [],
    movimentacoes_estoque: [],
    lancamentos: [],
    agendamentos,
    modelos_checklist: [],
    servicos_catalogo: [],
    perfis_comissao: [],
    proximo_numero_os: 1,
  } as CraftDatabase
}

function ids(db: CraftDatabase): string[] {
  return db.agendamentos.map((a) => a.id)
}

function inputDe(row: Agendamento): AgendamentoInput {
  return {
    data: row.data,
    horario: row.horario,
    cliente_id: row.cliente_id,
    moto_id: row.moto_id,
    servico: row.servico,
    status: row.status,
    observacoes: row.observacoes,
    ordem_servico_id: row.ordem_servico_id,
  }
}

const A = ag(ID_A, '10:00')
const B = ag(ID_B, '11:00')
const d719 = ag(D719, '08:00')
const row4fc = ag(ID_4FC, '09:00')
const repo = dbCom([A, B])
const memoria = dbCom([A, B, d719, row4fc])

assert.equal(memoria.agendamentos.length, 4)
assert.equal(repo.agendamentos.length, 2)

// A) repo [A,B] memória [A,B,d719,4fc] UPDATE A → repo [A editado,B]; órfãos ausentes
const updateA = rebaseUpdateAgendamento(repo, ID_A, { horario: '15:00' })
assert.equal(updateA.ok, true)
if (!updateA.ok) throw new Error('A')
assert.equal(updateA.agendamento.horario, '15:00')
assert.deepEqual(ids(updateA.db).sort(), [ID_A, ID_B].sort())
assert.equal(updateA.db.agendamentos.some((a) => a.id === D719), false)
assert.equal(updateA.db.agendamentos.some((a) => a.id === ID_4FC), false)
assert.equal(updateA.db.agendamentos.find((a) => a.id === ID_B)?.horario, '11:00')

// B) mesmo cenário CREATE C → [A,B,C]; órfãos ausentes
const createC = rebaseCreateAgendamento(repo, inputDe(ag(ID_C, '16:00')), OFFICE)
assert.equal(createC.ok, true)
if (!createC.ok) throw new Error('B')
assert.equal(createC.db.agendamentos.length, 3)
assert.equal(createC.db.agendamentos.some((a) => a.id === D719), false)
assert.equal(createC.db.agendamentos.some((a) => a.id === ID_4FC), false)
assert.ok(createC.db.agendamentos.some((a) => a.id === ID_A))
assert.ok(createC.db.agendamentos.some((a) => a.id === ID_B))
assert.ok(createC.db.agendamentos.some((a) => a.id === createC.agendamento.id))
assert.notEqual(createC.agendamento.id, D719)
assert.notEqual(createC.agendamento.id, ID_4FC)

// C) DELETE B → tombstone em B; órfãos ausentes
const deleteB = rebaseDeleteAgendamento(repo, ID_B)
assert.equal(deleteB.ok, true)
if (!deleteB.ok) throw new Error('C')
assert.ok(deleteB.agendamento.deleted_at)
assert.equal(deleteB.db.agendamentos.length, 2)
assert.equal(deleteB.db.agendamentos.some((a) => a.id === D719), false)
assert.equal(deleteB.db.agendamentos.some((a) => a.id === ID_4FC), false)
assert.ok(deleteB.db.agendamentos.find((a) => a.id === ID_B)?.deleted_at)
assert.equal(deleteB.db.agendamentos.find((a) => a.id === ID_A)?.deleted_at, undefined)

// D) UPDATE d719 só na memória → nao_encontrado, não cria, não salva
const updateOrfao = rebaseUpdateAgendamento(repo, D719, { horario: '07:00' })
assert.equal(updateOrfao.ok, false)
if (updateOrfao.ok) throw new Error('D')
assert.equal(updateOrfao.motivo, 'nao_encontrado')
assert.equal(updateOrfao.operacao, 'update')
assert.equal(updateOrfao.db.agendamentos.some((a) => a.id === D719), false)
assert.deepEqual(ids(updateOrfao.db).sort(), [ID_A, ID_B].sort())
assert.equal(
  mensagemToastSaveAgenda({
    ok: false,
    syncHabilitado: true,
    motivoLocal: 'nao_encontrado',
  }),
  MSG.agendamentoNaoDisponivel
)
assert.notEqual(
  mensagemToastSaveAgenda({
    ok: false,
    syncHabilitado: true,
    motivoLocal: 'nao_encontrado',
  }),
  MSG.agendamentoSalvo
)

// E) DELETE d719 só na memória → não ressuscita
const deleteOrfao = rebaseDeleteAgendamento(repo, D719)
assert.equal(deleteOrfao.ok, false)
if (deleteOrfao.ok) throw new Error('E')
assert.equal(deleteOrfao.motivo, 'nao_encontrado')
assert.equal(deleteOrfao.db.agendamentos.some((a) => a.id === D719), false)
assert.equal(
  mensagemToastExclusaoAgenda({
    ok: false,
    syncHabilitado: true,
    motivoLocal: 'nao_encontrado',
  }),
  MSG.agendamentoNaoDisponivel
)

// F) snapshot enviado ao push é deep-equal a dbSalvo.agendamentos
const dbSalvo = updateA.db
const snapshotPush = clonarAgendamentos(dbSalvo.agendamentos)
assert.deepEqual(snapshotPush, dbSalvo.agendamentos)
snapshotPush.push(d719)
assert.equal(dbSalvo.agendamentos.some((a) => a.id === D719), false)
assert.equal(snapshotPush !== dbSalvo.agendamentos, true)

// G) trailing recebe snapshot pós-save independente
resetarFilaPushAgendaParaTeste()
const recebidos: Agendamento[][] = []
let liberarA!: () => void
const gateA = new Promise<void>((resolve) => {
  liberarA = resolve
})
const executar: (
  snapshot: Agendamento[]
) => Promise<AgendaPushResult> = async (snapshot) => {
  recebidos.push(snapshot)
  if (recebidos.length === 1) await gateA
  return { ok: true, etapa: 'ok' }
}
const snapA = clonarAgendamentos(updateA.db.agendamentos)
const pA = enfileirarPushAgenda(OFFICE, snapA, executar)
snapA.push(d719)
const snapB = clonarAgendamentos(createC.db.agendamentos)
const pB = enfileirarPushAgenda(OFFICE, snapB, executar)
snapB.push(row4fc)
liberarA()
const [rA, rB] = await Promise.all([pA, pB])
assert.equal(rA.ok, true)
assert.equal(rB.ok, true)
assert.equal(rA.trailing, false)
assert.equal(rB.trailing, true)
assert.equal(recebidos.length, 2)
assert.equal(recebidos[0].some((a) => a.id === D719), false)
assert.equal(recebidos[1].some((a) => a.id === ID_4FC), false)
assert.ok(recebidos[1].some((a) => a.id === createC.agendamento.id))
assert.notEqual(recebidos[0], recebidos[1])
assert.notEqual(recebidos[0], snapA)
assert.notEqual(recebidos[1], snapB)

// H) repo muda entre abertura do modal e o save: usa repo fresco + patch
const abertoNoModal = ag(ID_A, '10:00', { servico: 'tecnico', observacoes: 'modal' })
const repoAposPull = dbCom([
  ag(ID_A, '10:00', { servico: 'alterado-pelo-pull', observacoes: 'do-pull' }),
  B,
  ag(ID_C, '12:00'),
])
const memoriaVelha = dbCom([abertoNoModal, B, d719, row4fc])
const patchFormulario = { horario: '15:00', servico: 'tecnico' }
const updateAposPull = rebaseUpdateAgendamento(repoAposPull, ID_A, patchFormulario)
assert.equal(updateAposPull.ok, true)
if (!updateAposPull.ok) throw new Error('H')
assert.equal(updateAposPull.agendamento.horario, '15:00')
assert.equal(updateAposPull.agendamento.servico, 'tecnico')
assert.equal(updateAposPull.agendamento.observacoes, 'do-pull')
assert.ok(updateAposPull.db.agendamentos.some((a) => a.id === ID_C))
assert.equal(updateAposPull.db.agendamentos.some((a) => a.id === D719), false)
assert.equal(memoriaVelha.agendamentos.length, 4)

// I) CREATE e UPDATE normais (repo = memória) continuam funcionando
const repoNormal = dbCom([A, B])
const createNormal = rebaseCreateAgendamento(
  repoNormal,
  { data: '2026-09-19', horario: '17:00', cliente_id: A.cliente_id, moto_id: A.moto_id, servico: 'novo', status: 'agendado' },
  OFFICE
)
assert.equal(createNormal.ok, true)
if (!createNormal.ok) throw new Error('I-create')
assert.equal(createNormal.db.agendamentos.length, 3)
assert.equal(createNormal.agendamento.servico, 'novo')
const updateNormal = rebaseUpdateAgendamento(repoNormal, ID_A, { servico: 'editado' })
assert.equal(updateNormal.ok, true)
if (!updateNormal.ok) throw new Error('I-update')
assert.equal(updateNormal.agendamento.servico, 'editado')
assert.equal(updateNormal.db.agendamentos.length, 2)

// J) Realtime exclusivo da Agenda não foi alterado por este rebase
const rebaseSrc = readFileSync(
  new URL('../src/services/agenda/agenda-save-rebase.ts', import.meta.url),
  'utf8'
)
const craftSrc = readFileSync(
  new URL('../src/context/CraftContext.tsx', import.meta.url),
  'utf8'
)
const realtimeSrc = readFileSync(
  new URL('../src/services/sync/agenda-realtime-channel.ts', import.meta.url),
  'utf8'
)
assert.doesNotMatch(rebaseSrc, /agenda-realtime/)
assert.doesNotMatch(rebaseSrc, /iniciarRealtimeOffice/)
assert.doesNotMatch(craftSrc, /agendarPullAgendaRealtime/)
assert.match(realtimeSrc, /export const PREFIXO_CHANNEL_AGENDA = 'boxgestor-agenda-'/)
assert.match(realtimeSrc, /table: 'appointments'/)
assert.match(realtimeSrc, /bindingsAgendaUnicos/)
assert.match(craftSrc, /localCraftRepository\.carregar\(officeId\)/)
assert.match(craftSrc, /rebaseCreateAgendamento/)
assert.match(craftSrc, /rebaseUpdateAgendamento/)
assert.match(craftSrc, /rebaseDeleteAgendamento/)
assert.match(craftSrc, /clonarAgendamentos/)
assert.doesNotMatch(craftSrc, /service\.atualizarAgendamento\(dadosRef\.current/)

console.log('verificar-agenda-ressurreicao-memoria: ok')
