import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { localIdParaUuid } from '../src/lib/local-id-uuid.ts'
import {
  mapearRegraLembreteDoSupabase,
  mapearRegraLembreteParaSupabase,
  type RegraLembreteRow,
} from '../src/services/lembretes/lembretes-mappers.ts'
import { aplicarLimpezaDuplicatasRegras } from '../src/services/lembretes/limpar-duplicatas-regras.ts'
import { mesclarRegrasLembreteSemDuplicar } from '../src/services/lembretes/regra-lembrete-identidade.ts'
import {
  agruparLinhasRemotasPorLocalId,
  montarLinhasRegraComIdsRemotosResolvidos,
  selecionarRegrasSegurasParaPersistir,
} from '../src/services/lembretes/resolver-id-remoto-regra-lote.ts'
import type { RegraLembrete } from '../src/types/lembrete.ts'

if (typeof globalThis.localStorage === 'undefined') {
  const memoria = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (chave: string) => memoria.get(chave) ?? null,
      setItem: (chave: string, valor: string) => {
        memoria.set(chave, valor)
      },
      removeItem: (chave: string) => {
        memoria.delete(chave)
      },
      clear: () => {
        memoria.clear()
      },
      key: () => null,
      get length() {
        return memoria.size
      },
    },
  })
}

const officeLocal = 'office-1'
const officeUuid = 'fdd4e82f-2a03-4cd7-9340-b5f067d2fed5'
const agora = '2026-09-13T20:00:00.000Z'

function regra(
  parcial: Partial<RegraLembrete> & Pick<RegraLembrete, 'id' | 'nome_regra'>
): RegraLembrete {
  return {
    office_id: officeLocal,
    servico_relacionado: parcial.nome_regra,
    categoria: 'geral',
    prazo_dias: 45,
    prazo_meses: 0,
    km_retorno: 1234,
    mensagem_padrao: `msg ${parcial.nome_regra}`,
    ativo: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...parcial,
  }
}

function linhaRemota(
  parcial: Partial<RegraLembreteRow> & Pick<RegraLembreteRow, 'id' | 'local_id' | 'nome_regra'>
): RegraLembreteRow {
  return {
    office_id: officeUuid,
    servico_relacionado: parcial.nome_regra,
    categoria: 'geral',
    prazo_dias: 45,
    prazo_meses: 0,
    km_retorno: 1234,
    mensagem_padrao: `msg ${parcial.nome_regra}`,
    observacoes_internas: null,
    ativo: true,
    metadata: {},
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    deleted_at: null,
    ...parcial,
  }
}

async function puxar(store: RegraLembreteRow[], local: RegraLembrete[]): Promise<RegraLembrete[]> {
  const remoto: RegraLembrete[] = []
  for (const row of store) {
    remoto.push(await mapearRegraLembreteDoSupabase(row, officeLocal))
  }
  return mesclarRegrasLembreteSemDuplicar(local, remoto)
}

async function persistirCompleto(
  store: RegraLembreteRow[],
  local: RegraLembrete[]
): Promise<Record<string, unknown>[]> {
  const remotosPorLocalId = agruparLinhasRemotasPorLocalId(store)
  const seguras = selecionarRegrasSegurasParaPersistir(local, remotosPorLocalId)
  const rows = await montarLinhasRegraComIdsRemotosResolvidos(
    seguras,
    remotosPorLocalId,
    async (item) =>
      (await mapearRegraLembreteParaSupabase(item, officeUuid)) as unknown as Record<string, unknown>,
    localIdParaUuid
  )
  for (const row of rows) {
    const id = String(row.id)
    const indice = store.findIndex((existente) => existente.id === id)
    const proxima = { ...(indice >= 0 ? store[indice] : {}), ...row } as RegraLembreteRow
    if (indice >= 0) store[indice] = proxima
    else store.push(proxima)
  }
  return rows
}

const persistencia = readFileSync(
  new URL('../src/services/lembretes/supabase-lembretes.persistence.ts', import.meta.url),
  'utf8'
)
const mappers = readFileSync(
  new URL('../src/services/lembretes/lembretes-mappers.ts', import.meta.url),
  'utf8'
)
const persistCompletoFn = persistencia.match(
  /export async function persistirLembretesNoSupabase[\s\S]*?\n\/\*\* Uma leitura/
)
assert.ok(persistCompletoFn, 'persistirLembretesNoSupabase não encontrado')
assert.match(persistCompletoFn[0], /montarLinhasRegraComIdsRemotosResolvidos/)
assert.match(persistCompletoFn[0], /selecionarRegrasSegurasParaPersistir/)
assert.match(persistCompletoFn[0], /Uma leitura por oficina/)
assert.match(persistencia, /montarLinhasRegraComIdsRemotosResolvidos/)
assert.match(mappers, /const id = await uuidDeLocal\(regra\.id\)/)

// Caso crítico: id remoto legado != UUID(local_id). pull → sync → pull → sync
const localLegado = 'teste-legado-01'
const uuidHashLegado = await localIdParaUuid(localLegado)
const uuidLegado = 'a1b2c3d4-e5f6-4789-8abc-1234567890ab'
assert.notEqual(uuidLegado, uuidHashLegado)

const storeLegado = [
  linhaRemota({
    id: uuidLegado,
    local_id: localLegado,
    nome_regra: 'Teste legado',
  }),
]
let cache = await puxar(storeLegado, [])
assert.equal(cache.length, 1)
assert.equal(cache[0]?.id, localLegado)

const mapeadaCega = await mapearRegraLembreteParaSupabase(cache[0]!, officeUuid)
assert.equal(mapeadaCega.id, uuidHashLegado)
assert.notEqual(mapeadaCega.id, uuidLegado)

const sync1 = await persistirCompleto(storeLegado, cache)
assert.deepEqual(
  sync1.map((row) => row.id),
  [uuidLegado]
)
assert.equal(storeLegado.length, 1)
assert.equal(storeLegado[0]?.id, uuidLegado)
assert.equal(storeLegado[0]?.local_id, localLegado)
assert.equal(
  storeLegado.some((row) => row.id === uuidHashLegado),
  false
)

cache = await puxar(storeLegado, cache)
assert.equal(cache.length, 1)
assert.equal(cache[0]?.id, localLegado)

const sync2 = await persistirCompleto(storeLegado, cache)
assert.deepEqual(
  sync2.map((row) => row.id),
  [uuidLegado]
)
assert.equal(storeLegado.length, 1)
assert.equal(storeLegado[0]?.id, uuidLegado)
assert.equal(
  storeLegado.some((row) => row.id === uuidHashLegado),
  false
)

// Regra nova sem remoto → cria 1 linha com UUID determinístico
const localNova = 'regra-nova-sync'
const uuidNova = await localIdParaUuid(localNova)
const storeNova: RegraLembreteRow[] = []
const cacheNova = [regra({ id: localNova, nome_regra: 'Nova' })]
const syncNova = await persistirCompleto(storeNova, cacheNova)
assert.equal(syncNova.length, 1)
assert.equal(syncNova[0]?.id, uuidNova)
assert.equal(storeNova.length, 1)
await persistirCompleto(storeNova, await puxar(storeNova, cacheNova))
assert.equal(storeNova.length, 1)
assert.equal(storeNova[0]?.id, uuidNova)

// Tombstone legado → atualiza a linha existente
const localTomb = 'teste-legado-tomb'
const uuidTombHash = await localIdParaUuid(localTomb)
const uuidTomb = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff'
assert.notEqual(uuidTomb, uuidTombHash)
const storeTomb = [
  linhaRemota({
    id: uuidTomb,
    local_id: localTomb,
    nome_regra: 'Tombstone legado',
  }),
]
const cacheTomb = [
  regra({
    id: localTomb,
    nome_regra: 'Tombstone legado',
    deleted_at: agora,
    updated_at: agora,
  }),
]
const syncTomb = await persistirCompleto(storeTomb, cacheTomb)
assert.equal(storeTomb.length, 1)
assert.equal(storeTomb[0]?.id, uuidTomb)
assert.equal(storeTomb[0]?.deleted_at, agora)
assert.equal(syncTomb.some((row) => row.id === uuidTombHash), false)

// Múltiplas linhas remotas com o mesmo local_id → nenhuma nova
const localMulti = 'teste-legado-multi'
const uuidMultiHash = await localIdParaUuid(localMulti)
const uuidMultiA = '11111111-2222-4333-8444-555555555555'
const storeMulti = [
  linhaRemota({ id: uuidMultiA, local_id: localMulti, nome_regra: 'Multi' }),
  linhaRemota({ id: uuidMultiHash, local_id: localMulti, nome_regra: 'Multi' }),
]
const cacheMulti = [
  regra({
    id: localMulti,
    nome_regra: 'Multi',
    deleted_at: agora,
    updated_at: agora,
  }),
]
await persistirCompleto(storeMulti, cacheMulti)
assert.equal(storeMulti.length, 2)
assert.equal(storeMulti.every((row) => row.deleted_at === agora), true)
assert.equal(new Set(storeMulti.map((row) => row.id)).size, 2)

// 95 regras semanticamente iguais, local_ids distintos → continuam 95
const copias = Array.from({ length: 95 }, (_, indice) =>
  regra({
    id: `bat-${String(indice).padStart(2, '0')}`,
    nome_regra: 'Bateria',
    categoria: 'eletrica',
    prazo_dias: 0,
    prazo_meses: 12,
    mensagem_padrao: 'msg Bateria',
    created_at: `2026-02-01T00:00:${String(indice).padStart(2, '0')}.000Z`,
    updated_at: `2026-02-01T00:00:${String(indice).padStart(2, '0')}.000Z`,
  })
)
const store95: RegraLembreteRow[] = []
for (const copia of copias) {
  store95.push(
    linhaRemota({
      id: await localIdParaUuid(copia.id),
      local_id: copia.id,
      nome_regra: 'Bateria',
      categoria: 'eletrica',
      prazo_dias: 0,
      prazo_meses: 12,
      mensagem_padrao: 'msg Bateria',
    })
  )
}
assert.equal(store95.length, 95)
await persistirCompleto(store95, copias)
assert.equal(store95.length, 95)
await persistirCompleto(store95, await puxar(store95, copias))
assert.equal(store95.length, 95)
assert.equal(new Set(store95.map((row) => row.local_id)).size, 95)

const limpeza = aplicarLimpezaDuplicatasRegras(copias, 'bat-94', new Set(), agora)
assert.equal(limpeza.ok, true)
assert.equal(limpeza.arquivadas.length, 94)
const aposLimpeza = await persistirCompleto(store95, limpeza.regras)
assert.equal(store95.length, 95)
assert.equal(aposLimpeza.length, 95)
assert.equal(store95.filter((row) => row.deleted_at).length, 94)
assert.equal(store95.filter((row) => !row.deleted_at).length, 1)

console.log('OK — identidade remota no sync completo validada (pull→sync→pull→sync).')
