import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { localIdParaUuid } from '../src/lib/local-id-uuid.ts'
import {
  aplicarRefsTecnicasMapeadasNoRepo,
  decidirServiceOrderIdTecnico,
  gravarRefsTecnicasAgendaAposPushOk,
  repararFksTecnicasAgendaPorMesmoId,
  type AgendaFksTecnicasRemotas,
} from '../src/services/agenda/agenda-fk-canonico.ts'
import { mapearAgendamentoParaSupabase } from '../src/services/agenda/agenda-mappers.ts'
import {
  executarPushAgendamentos,
  montarAgendaFkId,
} from '../src/services/agenda/agenda-push.ts'
import {
  rebaseCreateAgendamento,
  rebaseDeleteAgendamento,
  rebaseUpdateAgendamento,
} from '../src/services/agenda/agenda-save-rebase.ts'
import {
  limparRegistroIds,
  obterUuidPorLocalId,
  registrarMapeamentoId,
} from '../src/services/supabase-sync/id-registry.ts'
import type { Agendamento } from '../src/types/agendamento.ts'
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
const APT = '6447de8b-8799-4c6e-9012-e0399434fd4e'
const APT_OUTRO = 'b1dfdd63-319b-402d-a6dd-67b792ccc103'
const CUSTOMER = '14175b13-f669-5d37-b081-0d1a32742359'
const VEICULO = '0e08aaea-a07d-53b2-bc38-5ec87899c067'
const VEICULO_CARRO = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0002'
const CLI_ALIAS = 'cli-14175b13'
const MOTO_ALIAS = 'moto-0e08aaea'
const OS_LOCAL = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0001'
const OS_REMOTA = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff'
const TOMBSTONE = '2026-09-20T12:00:00.000Z'
const SERVICO_LOCAL = 'revisao local nao copiar do remoto'
const HASH_CLI = '9a71b021-067a-560a-be80-40d169efcfe0'
const HASH_MOTO = '54ae036b-da03-52bf-bce1-a8d93eedeab4'

function ag(parcial: Partial<Agendamento> = {}): Agendamento {
  return {
    id: APT,
    oficina_id: OFFICE,
    office_id: OFFICE,
    data: '2026-09-20',
    horario: '14:30',
    cliente_id: CLI_ALIAS,
    moto_id: MOTO_ALIAS,
    servico: SERVICO_LOCAL,
    status: 'confirmado',
    observacoes: 'nota-local',
    created_at: '2026-09-19T10:00:00.000Z',
    updated_at: '2026-09-20T12:00:00.000Z',
    deleted_at: TOMBSTONE,
    ...parcial,
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

function fksRemotas(parcial: Partial<AgendaFksTecnicasRemotas> = {}): AgendaFksTecnicasRemotas {
  return {
    customer_id: CUSTOMER,
    motorcycle_id: VEICULO,
    service_order_id: null,
    ...parcial,
  }
}

assert.equal(await localIdParaUuid(CLI_ALIAS), HASH_CLI)
assert.equal(await localIdParaUuid(MOTO_ALIAS), HASH_MOTO)

const helperSrc = readFileSync(
  new URL('../src/services/agenda/agenda-fk-canonico.ts', import.meta.url),
  'utf8'
)
const pushSrc = readFileSync(
  new URL('../src/services/agenda/agenda-push.ts', import.meta.url),
  'utf8'
)
const persistSrc = readFileSync(
  new URL('../src/services/agenda/supabase-agenda.persistence.ts', import.meta.url),
  'utf8'
)
const syncSrc = readFileSync(
  new URL('../src/services/agenda/agenda-sync.service.ts', import.meta.url),
  'utf8'
)
const realtimeSrc = readFileSync(
  new URL('../src/services/sync/agenda-realtime-channel.ts', import.meta.url),
  'utf8'
)
const craftSrc = readFileSync(
  new URL('../src/context/CraftContext.tsx', import.meta.url),
  'utf8'
)

assert.match(helperSrc, /export function repararFksTecnicasAgendaPorMesmoId/)
assert.match(helperSrc, /export function aplicarRefsTecnicasMapeadasNoRepo/)
assert.doesNotMatch(helperSrc, /stampUpdate\(/)
assert.doesNotMatch(helperSrc, /publicarAgendamentosLocais/)
assert.doesNotMatch(helperSrc, /tipo_veiculo|isMoto\(|isCarro\(/)
assert.match(pushSrc, /repararFksTecnicasAgendaPorMesmoId\(ag, indiceFks\.get\(ag\.id\)\)/)
assert.match(pushSrc, /const resultado = await persistir\(paraPersistir\)/)
assert.match(pushSrc, /canonicalizarRefsLocais\(refsCanon\)/)
assert.match(persistSrc, /indexarFksTecnicasPorAppointmentId\(rows\)/)
assert.match(persistSrc, /fksTecnicasPorId/)
assert.match(syncSrc, /gravarRefsTecnicasAgendaAposPushOk/)
assert.match(
  syncSrc,
  /canonicalizarRefsLocais =\s*opcoes\?\.canonicalizarRefsLocais \?\?\s*\(\(refs\) =>\s*gravarRefsTecnicasAgendaAposPushOk\(/
)
assert.match(syncSrc, /\(id\) => localCraftRepository\.carregar\(id\)/)
assert.match(realtimeSrc, /export const PREFIXO_CHANNEL_AGENDA = 'boxgestor-agenda-'/)
assert.match(realtimeSrc, /bindingsAgendaUnicos/)
assert.match(
  craftSrc,
  /adicionarAgendamento = useCallback\([\s\S]*localCraftRepository\.carregar\(officeId\)[\s\S]*rebaseCreateAgendamento/
)

limparRegistroIds()
const localTomb = ag()
const semReparo = await mapearAgendamentoParaSupabase(localTomb, OFFICE)
assert.ok(semReparo)
assert.equal(semReparo.customer_id, HASH_CLI)
assert.equal(semReparo.motorcycle_id, HASH_MOTO)
assert.equal(semReparo.deleted_at, TOMBSTONE)

const reparado = repararFksTecnicasAgendaPorMesmoId(localTomb, fksRemotas())
assert.equal(reparado.cliente_id, CUSTOMER)
assert.equal(reparado.moto_id, VEICULO)
assert.equal(reparado.deleted_at, TOMBSTONE)
assert.equal(reparado.servico, SERVICO_LOCAL)
assert.equal(reparado.data, '2026-09-20')
assert.equal(reparado.horario, '14:30')
assert.equal(reparado.status, 'confirmado')
assert.equal(reparado.observacoes, 'nota-local')
assert.equal(reparado.updated_at, localTomb.updated_at)
assert.equal(reparado.created_at, localTomb.created_at)

const comReparo = await mapearAgendamentoParaSupabase(reparado, OFFICE)
assert.ok(comReparo)
assert.equal(comReparo.id, APT)
assert.equal(comReparo.customer_id, CUSTOMER)
assert.equal(comReparo.motorcycle_id, VEICULO)
assert.equal(comReparo.deleted_at, TOMBSTONE)
assert.equal(comReparo.service, SERVICO_LOCAL)
assert.notEqual(comReparo.customer_id, HASH_CLI)
assert.notEqual(comReparo.motorcycle_id, HASH_MOTO)

const outroId = repararFksTecnicasAgendaPorMesmoId(
  localTomb,
  undefined
)
assert.equal(outroId.cliente_id, CLI_ALIAS)
assert.equal(outroId.moto_id, MOTO_ALIAS)

assert.equal(decidirServiceOrderIdTecnico(undefined, OS_REMOTA), OS_REMOTA)
assert.equal(decidirServiceOrderIdTecnico('os-alias', OS_REMOTA), OS_REMOTA)
assert.equal(decidirServiceOrderIdTecnico(OS_LOCAL, OS_REMOTA), OS_LOCAL)
assert.equal(decidirServiceOrderIdTecnico(OS_LOCAL, null), OS_LOCAL)
assert.equal(decidirServiceOrderIdTecnico(undefined, null), undefined)

const osPreservada = repararFksTecnicasAgendaPorMesmoId(
  ag({ ordem_servico_id: OS_LOCAL, deleted_at: null }),
  fksRemotas({ service_order_id: OS_REMOTA })
)
assert.equal(osPreservada.ordem_servico_id, OS_LOCAL)
assert.equal(osPreservada.cliente_id, CUSTOMER)

const osReparada = repararFksTecnicasAgendaPorMesmoId(
  ag({ ordem_servico_id: 'os-alias', deleted_at: null }),
  fksRemotas({ service_order_id: OS_REMOTA })
)
assert.equal(osReparada.ordem_servico_id, OS_REMOTA)

const carro = repararFksTecnicasAgendaPorMesmoId(
  ag({ id: 'cccccccc-dddd-4eee-8fff-000000000001', moto_id: 'moto-carro', deleted_at: null }),
  fksRemotas({ motorcycle_id: VEICULO_CARRO })
)
const moto = repararFksTecnicasAgendaPorMesmoId(
  ag({ id: 'cccccccc-dddd-4eee-8fff-000000000002', deleted_at: null }),
  fksRemotas({ motorcycle_id: VEICULO })
)
assert.equal(carro.moto_id, VEICULO_CARRO)
assert.equal(moto.moto_id, VEICULO)
assert.equal(carro.cliente_id, CUSTOMER)
assert.equal(moto.cliente_id, CUSTOMER)

let persistirN = 0
let enfileirarN = 0
let canonN = 0
let repo = dbCom([localTomb])
const updatedAntes = localTomb.updated_at
const persistidos: Agendamento[] = []

const rDelete = await executarPushAgendamentos({
  officeId: OFFICE,
  habilitado: true,
  online: true,
  locais: [localTomb],
  carregarRemoto: async () => ({
    ok: true,
    dados: [
      ag({
        cliente_id: CLI_ALIAS,
        moto_id: MOTO_ALIAS,
        deleted_at: null,
        servico: 'remoto antigo',
        updated_at: '2026-09-19T10:00:00.000Z',
      }),
    ],
    erros: [],
    fksTecnicasPorId: {
      [APT]: fksRemotas(),
      [APT_OUTRO]: fksRemotas({
        customer_id: '99999999-9999-4999-8999-999999999999',
        motorcycle_id: '88888888-8888-4888-8888-888888888888',
      }),
    },
  }),
  persistir: async (ags) => {
    persistirN += 1
    persistidos.push(...ags)
    const linhas = []
    for (const item of ags) {
      const row = await mapearAgendamentoParaSupabase(item, OFFICE)
      assert.ok(row)
      linhas.push(row)
    }
    return {
      ok: true,
      enviados: ags.length,
      erros: [],
      fkIds: ags.map((item, i) => montarAgendaFkId(item, linhas[i]!)),
    }
  },
  salvarLocal: (mesclados) => {
    repo = { ...repo, agendamentos: mesclados }
  },
  contarFila: () => 0,
  enfileirar: () => {
    enfileirarN += 1
  },
  marcarSincronizados: () => undefined,
  canonicalizarRefsLocais: (refs) => {
    canonN += 1
    gravarRefsTecnicasAgendaAposPushOk(
      OFFICE,
      refs,
      () => repo,
      (_id, db) => {
        repo = db
      }
    )
  },
})

assert.equal(rDelete.ok, true)
assert.equal(persistirN, 1)
assert.equal(enfileirarN, 0)
assert.equal(canonN, 1)
assert.equal(persistidos[0]?.cliente_id, CUSTOMER)
assert.equal(persistidos[0]?.moto_id, VEICULO)
assert.equal(persistidos[0]?.deleted_at, TOMBSTONE)
assert.equal(persistidos[0]?.servico, SERVICO_LOCAL)
assert.equal(repo.agendamentos[0]?.cliente_id, CUSTOMER)
assert.equal(repo.agendamentos[0]?.moto_id, VEICULO)
assert.equal(repo.agendamentos[0]?.deleted_at, TOMBSTONE)
assert.equal(repo.agendamentos[0]?.servico, SERVICO_LOCAL)
assert.equal(repo.agendamentos[0]?.updated_at, updatedAntes)

limparRegistroIds()
const semRemoteMesmoId = await mapearAgendamentoParaSupabase(
  repararFksTecnicasAgendaPorMesmoId(
    ag({ id: APT, deleted_at: null }),
    undefined
  ),
  OFFICE
)
assert.ok(semRemoteMesmoId)
assert.equal(semRemoteMesmoId.customer_id, HASH_CLI)
assert.equal(semRemoteMesmoId.motorcycle_id, HASH_MOTO)

const rDiferenteId = await executarPushAgendamentos({
  officeId: OFFICE,
  habilitado: true,
  online: true,
  locais: [ag({ deleted_at: null })],
  carregarRemoto: async () => ({
    ok: true,
    dados: [ag({ id: APT_OUTRO, cliente_id: CUSTOMER, moto_id: VEICULO, deleted_at: null })],
    erros: [],
    fksTecnicasPorId: {
      [APT_OUTRO]: fksRemotas(),
    },
  }),
  persistir: async (ags) => {
    const row = await mapearAgendamentoParaSupabase(ags[0]!, OFFICE)
    assert.ok(row)
    assert.equal(row.customer_id, HASH_CLI)
    assert.equal(row.motorcycle_id, HASH_MOTO)
    return {
      ok: false,
      enviados: 0,
      erros: [{ codigo: '23503', mensagem: 'appointments_customer_id_fkey' }],
      fkIds: [montarAgendaFkId(ags[0]!, row)],
    }
  },
  contarFila: () => 0,
  enfileirar: () => undefined,
  marcarSincronizados: () => undefined,
})
assert.equal(rDiferenteId.ok, false)
assert.equal(rDiferenteId.etapa, 'upsert_falhou')
assert.equal(rDiferenteId.supabaseCode, '23503')

limparRegistroIds()
registrarMapeamentoId(CLI_ALIAS, CUSTOMER)
registrarMapeamentoId(MOTO_ALIAS, VEICULO)
const createInput = {
  data: '2026-09-21',
  horario: '09:00',
  cliente_id: CLI_ALIAS,
  moto_id: MOTO_ALIAS,
  servico: 'create canon',
  status: 'agendado' as const,
}
const created = rebaseCreateAgendamento(dbCom([]), createInput, OFFICE)
assert.equal(created.ok, true)
if (!created.ok) throw new Error('create')
const rowCreate = await mapearAgendamentoParaSupabase(created.agendamento, OFFICE)
assert.ok(rowCreate)
assert.equal(rowCreate.customer_id, CUSTOMER)
assert.equal(rowCreate.motorcycle_id, VEICULO)

let repoCreate = created.db
let persistirCreate = 0
const rCreate = await executarPushAgendamentos({
  officeId: OFFICE,
  habilitado: true,
  online: true,
  locais: created.db.agendamentos,
  carregarRemoto: async () => ({ ok: true, dados: [], erros: [] }),
  persistir: async (ags) => {
    persistirCreate += 1
    const linhas = []
    for (const item of ags) {
      const row = await mapearAgendamentoParaSupabase(item, OFFICE)
      assert.ok(row)
      linhas.push(row)
    }
    return {
      ok: true,
      enviados: ags.length,
      erros: [],
      fkIds: ags.map((item, i) => montarAgendaFkId(item, linhas[i]!)),
    }
  },
  salvarLocal: (mesclados) => {
    repoCreate = { ...repoCreate, agendamentos: mesclados }
  },
  contarFila: () => 0,
  enfileirar: () => {
    throw new Error('create nao pode enfileirar')
  },
  marcarSincronizados: () => undefined,
  canonicalizarRefsLocais: (refs) => {
    gravarRefsTecnicasAgendaAposPushOk(
      OFFICE,
      refs,
      () => repoCreate,
      (_id, db) => {
        repoCreate = db
      }
    )
  },
})
assert.equal(rCreate.ok, true)
assert.equal(persistirCreate, 1)
const aptCanon = repoCreate.agendamentos.find((a) => a.id === created.agendamento.id)
assert.ok(aptCanon)
assert.equal(aptCanon.cliente_id, CUSTOMER)
assert.equal(aptCanon.moto_id, VEICULO)
assert.equal(aptCanon.servico, 'create canon')
assert.equal(aptCanon.updated_at, created.agendamento.updated_at)

limparRegistroIds()
assert.equal(obterUuidPorLocalId(CLI_ALIAS), undefined)
assert.equal(obterUuidPorLocalId(CUSTOMER), undefined)

const rowUpdateAposCanon = await mapearAgendamentoParaSupabase(
  { ...aptCanon, servico: 'update apos canon' },
  OFFICE
)
assert.ok(rowUpdateAposCanon)
assert.equal(rowUpdateAposCanon.customer_id, CUSTOMER)
assert.equal(rowUpdateAposCanon.motorcycle_id, VEICULO)
assert.notEqual(rowUpdateAposCanon.customer_id, HASH_CLI)

const updateRebase = rebaseUpdateAgendamento(repoCreate, aptCanon.id, {
  servico: 'update apos canon',
})
assert.equal(updateRebase.ok, true)
if (!updateRebase.ok) throw new Error('update')
const rowUpdateRebase = await mapearAgendamentoParaSupabase(updateRebase.agendamento, OFFICE)
assert.ok(rowUpdateRebase)
assert.equal(rowUpdateRebase.customer_id, CUSTOMER)
assert.equal(rowUpdateRebase.motorcycle_id, VEICULO)

const deleteRebase = rebaseDeleteAgendamento(updateRebase.db, aptCanon.id)
assert.equal(deleteRebase.ok, true)
if (!deleteRebase.ok) throw new Error('delete')
assert.ok(deleteRebase.agendamento.deleted_at)
const rowDelete = await mapearAgendamentoParaSupabase(deleteRebase.agendamento, OFFICE)
assert.ok(rowDelete)
assert.equal(rowDelete.customer_id, CUSTOMER)
assert.equal(rowDelete.motorcycle_id, VEICULO)
assert.ok(rowDelete.deleted_at)
assert.notEqual(rowDelete.customer_id, HASH_CLI)

const rebaseMemoria = rebaseCreateAgendamento(
  deleteRebase.db,
  {
    data: '2026-09-22',
    horario: '11:00',
    cliente_id: CUSTOMER,
    moto_id: VEICULO,
    servico: 'novo apos canon',
    status: 'agendado',
  },
  OFFICE
)
assert.equal(rebaseMemoria.ok, true)
if (!rebaseMemoria.ok) throw new Error('rebase')
assert.equal(rebaseMemoria.db.agendamentos.length, 2)
assert.ok(rebaseMemoria.db.agendamentos.some((a) => a.id === aptCanon.id && a.deleted_at))
assert.ok(rebaseMemoria.db.agendamentos.some((a) => a.servico === 'novo apos canon'))

const canonSemMudarTempo = aplicarRefsTecnicasMapeadasNoRepo(dbCom([ag({ cliente_id: CUSTOMER, moto_id: VEICULO })]), [
  {
    appointmentId: APT,
    customerId: CUSTOMER,
    motorcycleId: VEICULO,
    serviceOrderId: null,
  },
])
assert.equal(canonSemMudarTempo.agendamentos[0]?.updated_at, localTomb.updated_at)

console.log('verificar-agenda-fk-canonico: ok')
