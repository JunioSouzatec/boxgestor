import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { isUuidFormato, localIdParaUuid } from '../src/lib/local-id-uuid.ts'
import { stampCreate, stampUpdate } from '../src/services/migration.service.ts'
import {
  idAgendamentoParaSupabase,
  mapearAgendamentoParaSupabase,
} from '../src/services/agenda/agenda-mappers.ts'
import {
  executarPushAgendamentos,
  type AgendaPushResult,
} from '../src/services/agenda/agenda-push.ts'
import {
  enfileirarPushAgenda,
  resetarFilaPushAgendaParaTeste,
} from '../src/services/agenda/agenda-push-queue.ts'
import { limparRegistroIds } from '../src/services/supabase-sync/id-registry.ts'
import type { Agendamento, AgendamentoInput } from '../src/types/agendamento.ts'

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

const OFFICE = 'fdd4e82f-2a03-4cd7-9340-b5f067d2fed5'
const CUSTOMER_EXISTENTE = '14175b13-f669-5d37-b081-0d1a32742359'
const MOTO_EXISTENTE = '0e08aaea-a07d-53b2-bc38-5ec87899c067'
const APT_EXISTENTE = 'b1dfdd63-319b-402d-a6dd-67b792ccc103'

function agendamentoBase(parcial: Partial<Agendamento> = {}): Agendamento {
  return {
    id: APT_EXISTENTE,
    oficina_id: OFFICE,
    office_id: OFFICE,
    data: '2026-09-18',
    horario: '09:00',
    cliente_id: CUSTOMER_EXISTENTE,
    moto_id: MOTO_EXISTENTE,
    servico: 'Teste realtime exclusivo 2',
    status: 'agendado',
    created_at: '2026-09-17T23:41:45.342Z',
    updated_at: '2026-09-19T02:10:18.798Z',
    deleted_at: null,
    ...parcial,
  }
}

/** Replica CraftDataService.adicionarAgendamento sem importar o service (evita supabase-env). */
function adicionarAgendamentoLocal(
  atuais: Agendamento[],
  input: AgendamentoInput
): { db: Agendamento[]; entity: Agendamento } {
  const entity = stampCreate(
    { ...input, id: crypto.randomUUID(), oficina_id: OFFICE, office_id: OFFICE },
    OFFICE
  )
  return { db: [...atuais, entity], entity }
}

const craftSrc = readFileSync(
  new URL('../src/context/CraftContext.tsx', import.meta.url),
  'utf8'
)
const craftDataSrc = readFileSync(
  new URL('../src/services/craft-data.service.ts', import.meta.url),
  'utf8'
)
const agendaPageSrc = readFileSync(
  new URL('../src/pages/AgendaPage.tsx', import.meta.url),
  'utf8'
)

// C) o código atual do CREATE NÃO deixa de chamar push
assert.match(
  craftSrc,
  /adicionarAgendamento = useCallback\([\s\S]*localCraftRepository\.carregar\(officeId\)[\s\S]*rebaseCreateAgendamento\(repo, agendamento, officeId\)[\s\S]*persistirAgendaLocal\(rebase\.db\)[\s\S]*return concluirSaveAgenda\(rebase\.db\.agendamentos/
)
assert.match(
  craftSrc,
  /atualizarAgendamento = useCallback\([\s\S]*localCraftRepository\.carregar\(officeId\)[\s\S]*rebaseUpdateAgendamento\(repo, id, agendamento\)[\s\S]*persistirAgendaLocal\(rebase\.db\)[\s\S]*return concluirSaveAgenda\(rebase\.db\.agendamentos/
)
assert.match(
  craftSrc,
  /concluirSaveAgenda = useCallback\([\s\S]*snapshotPush[\s\S]*publicarAgendamentosLocais\(officeId, \{\s*agendamentos: snapshotPush,/
)
assert.match(
  craftSrc,
  /excluirAgendamento = useCallback\([\s\S]*localCraftRepository\.carregar\(officeId\)[\s\S]*rebaseDeleteAgendamento\(repo, id\)[\s\S]*persistirAgendaLocal\(rebase\.db\)[\s\S]*return concluirSaveAgenda\(rebase\.db\.agendamentos/
)
assert.doesNotMatch(craftSrc, /service\.adicionarAgendamento\(dadosRef\.current/)
assert.doesNotMatch(craftSrc, /service\.atualizarAgendamento\(dadosRef\.current/)
assert.doesNotMatch(craftSrc, /service\.excluirAgendamento\(dadosRef\.current/)
assert.doesNotMatch(craftSrc, /marcarPersistenciaSomenteAgenda/)
assert.match(
  agendaPageSrc,
  /editando\s*\? await atualizarAgendamento\(editando\.id, dados\)\s*: await adicionarAgendamento\(dados\)/
)
assert.match(
  craftDataSrc,
  /stampCreate\(\s*\{ \.\.\.input, id: gerarId\(\), oficina_id: this\.officeId, office_id: this\.officeId \}/
)

// A) CREATE local válido → snapshot → mapper → publicar → ok
limparRegistroIds()
resetarFilaPushAgendaParaTeste()

const existentes = [agendamentoBase()]
const criado = adicionarAgendamentoLocal(existentes, {
  data: '2026-09-18',
  horario: '10:00',
  cliente_id: CUSTOMER_EXISTENTE,
  moto_id: MOTO_EXISTENTE,
  servico: 'teste tombstone 1',
  status: 'agendado',
})

assert.equal(criado.db.length, 2)
assert.equal(criado.entity.servico, 'teste tombstone 1')
assert.ok(criado.entity.id, 'CREATE gera id antes do save')
assert.equal(isUuidFormato(criado.entity.id), true)
assert.equal(await idAgendamentoParaSupabase(criado.entity.id), criado.entity.id)
assert.ok(criado.entity.created_at)
assert.ok(criado.entity.updated_at)
assert.equal(criado.entity.oficina_id, OFFICE)
assert.equal(criado.entity.office_id, OFFICE)
assert.equal(criado.entity.deleted_at, undefined)
assert.ok(criado.db.some((ag) => ag.id === criado.entity.id))

const rowCreate = await mapearAgendamentoParaSupabase(criado.entity, OFFICE)
assert.ok(rowCreate, 'CREATE entra no mapper')
assert.equal(rowCreate.id, criado.entity.id)
assert.equal(rowCreate.service, 'teste tombstone 1')
assert.equal(rowCreate.customer_id, CUSTOMER_EXISTENTE)
assert.equal(rowCreate.motorcycle_id, MOTO_EXISTENTE)
assert.equal(rowCreate.office_id, OFFICE)
assert.equal(rowCreate.deleted_at, null)

let publicarCreateChamado = 0
let snapshotCreate: Agendamento[] = []
const resultadoCreate = await new Promise<AgendaPushResult>((resolve, reject) => {
  void (async () => {
    const persistirAgendaLocal = (next: Agendamento[]) => {
      snapshotCreate = next
    }
    const concluirSaveAgenda = async (agendamentos: Agendamento[]) => {
      publicarCreateChamado += 1
      return enfileirarPushAgenda(OFFICE, agendamentos, (locais) =>
        executarPushAgendamentos({
          officeId: OFFICE,
          habilitado: true,
          online: true,
          locais,
          carregarRemoto: async () => ({ ok: true, dados: existentes, erros: [] }),
          persistir: async (ags) => {
            assert.ok(ags.some((ag) => ag.id === criado.entity.id))
            assert.ok(ags.some((ag) => ag.servico === 'teste tombstone 1'))
            return { ok: true, enviados: ags.length, erros: [] }
          },
          contarFila: () => 0,
          enfileirar: () => undefined,
          marcarSincronizados: () => undefined,
        })
      )
    }
    persistirAgendaLocal(criado.db)
    resolve(await concluirSaveAgenda(criado.db))
  })().catch(reject)
})

assert.equal(publicarCreateChamado, 1)
assert.ok(snapshotCreate.some((ag) => ag.id === criado.entity.id))
assert.equal(resultadoCreate.ok, true)
assert.equal(resultadoCreate.etapa, 'ok')

// B) UPDATE existente usa o mesmo concluirSaveAgenda / snapshot / push
limparRegistroIds()
resetarFilaPushAgendaParaTeste()
const editado = stampUpdate({
  ...agendamentoBase(),
  servico: 'Teste realtime exclusivo 2 edit',
})
assert.ok(editado.updated_at)
assert.ok(editado.updated_at > (agendamentoBase().updated_at ?? ''))

const rowUpdate = await mapearAgendamentoParaSupabase(editado, OFFICE)
assert.ok(rowUpdate)
assert.equal(rowUpdate.id, APT_EXISTENTE)
assert.equal(rowUpdate.customer_id, CUSTOMER_EXISTENTE)
assert.equal(rowUpdate.motorcycle_id, MOTO_EXISTENTE)

let publicarUpdateChamado = 0
const resultadoUpdate = await enfileirarPushAgenda(OFFICE, [editado], (locais) => {
  publicarUpdateChamado += 1
  return executarPushAgendamentos({
    officeId: OFFICE,
    habilitado: true,
    online: true,
    locais,
    carregarRemoto: async () => ({
      ok: true,
      dados: [agendamentoBase()],
      erros: [],
    }),
    persistir: async (ags) => {
      assert.equal(ags[0]?.servico, 'Teste realtime exclusivo 2 edit')
      return { ok: true, enviados: ags.length, erros: [] }
    },
    contarFila: () => 0,
    enfileirar: () => undefined,
    marcarSincronizados: () => undefined,
  })
})
assert.equal(publicarUpdateChamado, 1)
assert.equal(resultadoUpdate.ok, true)
assert.equal(resultadoUpdate.etapa, 'ok')

// Assimetria de DADOS, não de caminho: CREATE com cli- local gera hash ≠ customer remoto
limparRegistroIds()
const hashCli = await localIdParaUuid('cli-4d0684fa')
const hashMoto = await localIdParaUuid('moto-9bfe2738')
assert.notEqual(hashCli, CUSTOMER_EXISTENTE)
assert.notEqual(hashCli, '4d0684fa-acc3-55a6-8430-97e83187d2b8')
assert.notEqual(hashMoto, MOTO_EXISTENTE)
assert.notEqual(hashMoto, '9bfe2738-d569-516f-bc87-f4abb8ce91c6')

const createComIdLocal = adicionarAgendamentoLocal(existentes, {
  data: '2026-09-18',
  horario: '10:00',
  cliente_id: 'cli-4d0684fa',
  moto_id: 'moto-9bfe2738',
  servico: 'teste tombstone 1',
  status: 'agendado',
})
const rowHash = await mapearAgendamentoParaSupabase(createComIdLocal.entity, OFFICE)
assert.ok(rowHash, 'mapper NÃO descarta o CREATE — entra no lote com hash')
assert.equal(rowHash.customer_id, hashCli)
assert.equal(rowHash.motorcycle_id, hashMoto)

const createSemFk = adicionarAgendamentoLocal(existentes, {
  data: '2026-09-18',
  horario: '10:00',
  cliente_id: '   ',
  moto_id: MOTO_EXISTENTE,
  servico: 'teste tombstone 1',
  status: 'agendado',
})
const rowSemFk = await mapearAgendamentoParaSupabase(createSemFk.entity, OFFICE)
assert.equal(rowSemFk, null, 'só FK/data vazia tira o CREATE do lote')

console.log('verificar-agenda-create: ok')
