/**
 * Hotfix registry: cache + batch — write amplification.
 * Conta getItem/setItem de craft_id_map_v1 (não milissegundos).
 */
import assert from 'node:assert/strict'
import {
  executarEmLoteRegistry,
  invalidarCacheRegistroIdsParaTeste,
  lembrarHashDeterministico,
  limparRegistroIds,
  obterLocalIdPorUuid,
  obterUuidPorLocalId,
  registrarMapeamentoId,
  registrarMapeamentoIdConfirmado,
  registrarMapeamentoIdProvisorio,
} from '../src/services/supabase-sync/id-registry.ts'

const STORAGE_KEY = 'craft_id_map_v1'

const mem = new Map<string, string>()
let getItemCount = 0
let setItemCount = 0

function resetCounters(): void {
  getItemCount = 0
  setItemCount = 0
}

Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (k: string) => {
      if (k === STORAGE_KEY) getItemCount += 1
      return mem.get(k) ?? null
    },
    setItem: (k: string, v: string) => {
      if (k === STORAGE_KEY) setItemCount += 1
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

function uuidFor(i: number): string {
  const n = (i + 1).toString(16).padStart(12, '0')
  return `aaaaaaaa-bbbb-4ccc-8ddd-${n}`
}

function report(label: string, get: number, set: number): void {
  console.log(`  ${label}: getItem=${get} setItem=${set}`)
}

// ─── CASO A — 500 mappings em batch ───────────────────────────────────────────
console.log('CASO A — 500 mappings em batch')
limparRegistroIds()
invalidarCacheRegistroIdsParaTeste()
resetCounters()

executarEmLoteRegistry(() => {
  for (let i = 0; i < 500; i++) {
    registrarMapeamentoId(`loc-${i}`, uuidFor(i), 'caso-a')
  }
})

report('DEPOIS batch 500', getItemCount, setItemCount)
assert.ok(
  getItemCount <= 3,
  `CASO A: getItem esperado ~1 (máx 3), veio ${getItemCount}`
)
assert.equal(setItemCount, 1, `CASO A: setItem deve ser 1, veio ${setItemCount}`)
assert.equal(obterLocalIdPorUuid(uuidFor(0)), 'loc-0')
assert.equal(obterUuidPorLocalId('loc-499'), uuidFor(499))
console.log('  OK\n')

const casoA_get = getItemCount
const casoA_set = setItemCount

// ─── CASO B — 500 mappings iguais já existentes ───────────────────────────────
console.log('CASO B — 500 mappings iguais (sem dirty)')
resetCounters()

executarEmLoteRegistry(() => {
  for (let i = 0; i < 500; i++) {
    registrarMapeamentoId(`loc-${i}`, uuidFor(i), 'caso-b')
  }
})

report('DEPOIS re-registro idêntico', getItemCount, setItemCount)
assert.equal(
  setItemCount,
  0,
  `CASO B: não deve regravar (setItem=0), veio ${setItemCount}`
)
console.log('  OK\n')

const casoB_set = setItemCount

// ─── CASO C — write individual fora de batch ──────────────────────────────────
console.log('CASO C — write individual imediato')
limparRegistroIds()
invalidarCacheRegistroIdsParaTeste()
resetCounters()

registrarMapeamentoId('solo-1', uuidFor(900), 'caso-c')
report('após 1 write fora de batch', getItemCount, setItemCount)
assert.equal(setItemCount, 1, `CASO C: setItem imediato=1, veio ${setItemCount}`)
assert.equal(obterUuidPorLocalId('solo-1'), uuidFor(900))

registrarMapeamentoId('solo-2', uuidFor(901), 'caso-c')
assert.equal(setItemCount, 2, `CASO C: 2º write → setItem=2, veio ${setItemCount}`)
console.log('  OK\n')

const casoC_set = setItemCount

// ─── CASO D — Registry Guard ──────────────────────────────────────────────────
console.log('CASO D — Registry Guard (hash provisional ≠ UUID confirmado)')
limparRegistroIds()
invalidarCacheRegistroIdsParaTeste()

const LOCAL_G = 'cli-guard'
const UUID_REAL = '11111111-1111-4111-8111-111111111111'
registrarMapeamentoIdConfirmado(LOCAL_G, UUID_REAL, 'caso-d', 'remote_row')
const hash = await lembrarHashDeterministico(LOCAL_G)

registrarMapeamentoIdProvisorio(LOCAL_G, hash, 'caso-d-provisorio')
assert.equal(
  obterUuidPorLocalId(LOCAL_G),
  UUID_REAL,
  'CASO D: provisional não sobrescreve confirmado'
)

registrarMapeamentoId(LOCAL_G, hash, 'caso-d-unproven')
assert.equal(
  obterUuidPorLocalId(LOCAL_G),
  UUID_REAL,
  'CASO D: unproven hash não sobrescreve confirmado'
)
console.log('  OK (UUID real preservado)\n')

// ─── CASO E — invalidação de cache (outra aba) ────────────────────────────────
console.log('CASO E — invalidação de cache → reload')
limparRegistroIds()
invalidarCacheRegistroIdsParaTeste()

registrarMapeamentoId('aba-a', uuidFor(50), 'caso-e')
assert.equal(obterUuidPorLocalId('aba-a'), uuidFor(50))

// Simula outra aba: escreve direto no storage sem passar pelo módulo
const storeOutraAba = {
  version: 3 as const,
  uuidParaLocal: { [uuidFor(51)]: 'aba-b' },
  localParaUuid: { 'aba-b': uuidFor(51) },
  origemPorLocal: { 'aba-b': 'confirmado' as const },
}
mem.set(STORAGE_KEY, JSON.stringify(storeOutraAba))

// Cache ainda tem valor antigo até invalidar
assert.equal(obterUuidPorLocalId('aba-a'), uuidFor(50), 'cache ainda vivo')

invalidarCacheRegistroIdsParaTeste()
resetCounters()
assert.equal(obterUuidPorLocalId('aba-b'), uuidFor(51), 'após invalidar, lê storage')
assert.equal(obterUuidPorLocalId('aba-a'), undefined)
assert.ok(getItemCount >= 1, 'CASO E: recarregou via getItem')
report('após invalidar + 2 leituras', getItemCount, setItemCount)
console.log('  OK\n')

// ─── Resumo ───────────────────────────────────────────────────────────────────
console.log('════════════════════════════════════════')
console.log('ANTES conceitual: 500 mappings ≈ 500× loadStore+saveStore')
console.log(`DEPOIS CASO A: getItem=${casoA_get} setItem=${casoA_set}`)
console.log(`DEPOIS CASO B (idênticos): setItem=${casoB_set}`)
console.log(`DEPOIS CASO C (2 individuais): setItem=${casoC_set}`)
console.log('CASO D: Guard OK')
console.log('CASO E: invalidação OK')
console.log('verificar-registry-batch-performance: OK')
