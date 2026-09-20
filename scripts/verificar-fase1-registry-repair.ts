import assert from 'node:assert/strict'
import { localIdParaUuid } from '../src/lib/local-id-uuid.ts'
import {
  limparRegistroIds,
  obterLocalIdPorUuid,
  obterUuidPorLocalId,
  registrarMapeamentoId,
} from '../src/services/supabase-sync/id-registry.ts'
import {
  aplicarPullFase1Registry,
  repararRegistryAposDedupClientes,
} from '../src/services/supabase-sync/fase1-registry-repair.ts'
import { mapearAgendamentoParaSupabase } from '../src/services/agenda/agenda-mappers.ts'
import { stampCreate } from '../src/services/migration.service.ts'
import type { Agendamento } from '../src/types/agendamento.ts'
import type { Cliente } from '../src/types/cliente.ts'

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

const OFFICE_LOCAL = 'fdd4e82f-2a03-4cd7-9340-b5f067d2fed5'
const OFFICE_UUID = 'fdd4e82f-2a03-4cd7-9340-b5f067d2fed5'
const CLI_LOCAL = 'cli-4d0684fa'
const MOTO_LOCAL = 'moto-9bfe2738'
const CUSTOMER_REAL = '4d0684fa-acc3-55a6-8430-97e83187d2b8'
const MOTO_REAL = '9bfe2738-d569-516f-bc87-f4abb8ce91c6'
const CUSTOMER_HASH_VENENO = '08da8694-07f8-5a7c-9174-607b142d8af4'
const MOTO_HASH_VENENO = '2e3c80ad-b639-5f4c-bf98-bd4659b7da33'
const AGORA = '2026-09-18T23:00:00.000Z'

const customerRow = {
  id: CUSTOMER_REAL,
  name: 'Cliente tecnico',
  phone: '11900000001',
  cpf: null,
  address: '',
  notes: null,
  created_at: AGORA,
  updated_at: AGORA,
}

const motorcycleRow = {
  id: MOTO_REAL,
  customer_id: CUSTOMER_REAL,
  brand: 'Honda',
  model: 'CG',
  year: 2020,
  plate: 'TST0A00',
  color: 'preta',
  mileage: 1000,
  chassis: null,
  notes: null,
  created_at: AGORA,
  updated_at: AGORA,
}

function plantarVeneno(): void {
  limparRegistroIds()
  registrarMapeamentoId(CLI_LOCAL, CUSTOMER_HASH_VENENO)
  registrarMapeamentoId(MOTO_LOCAL, MOTO_HASH_VENENO)
  assert.equal(obterUuidPorLocalId(CLI_LOCAL), CUSTOMER_HASH_VENENO)
  assert.equal(obterUuidPorLocalId(MOTO_LOCAL), MOTO_HASH_VENENO)
}

const clienteLocal: Cliente = {
  id: CLI_LOCAL,
  oficina_id: OFFICE_LOCAL,
  office_id: OFFICE_LOCAL,
  nome: 'Cliente tecnico',
  telefone: '11900000001',
  endereco: '',
  criado_em: '2026-09-18',
  atualizado_em: '2026-09-18',
}

plantarVeneno()
await aplicarPullFase1Registry({
  officeLocalId: OFFICE_LOCAL,
  officeUuid: OFFICE_UUID,
  customers: [customerRow],
  motorcycles: [motorcycleRow],
  candidatosCliente: [CLI_LOCAL],
  candidatosMoto: [MOTO_LOCAL],
  clientesReferencia: [clienteLocal],
})

assert.equal(obterUuidPorLocalId(CLI_LOCAL), CUSTOMER_REAL)
assert.equal(obterUuidPorLocalId(MOTO_LOCAL), MOTO_REAL)
assert.equal(obterLocalIdPorUuid(CUSTOMER_REAL), CLI_LOCAL)
assert.equal(obterLocalIdPorUuid(MOTO_REAL), MOTO_LOCAL)
assert.equal(obterLocalIdPorUuid(CUSTOMER_HASH_VENENO), undefined)
assert.equal(obterLocalIdPorUuid(MOTO_HASH_VENENO), undefined)
assert.notEqual(obterUuidPorLocalId(CLI_LOCAL), CUSTOMER_HASH_VENENO)
assert.notEqual(obterUuidPorLocalId(MOTO_LOCAL), MOTO_HASH_VENENO)
assert.notEqual(obterUuidPorLocalId(CLI_LOCAL), await localIdParaUuid(CLI_LOCAL))
assert.notEqual(obterUuidPorLocalId(MOTO_LOCAL), await localIdParaUuid(MOTO_LOCAL))

const criado = stampCreate(
  {
    id: 'd71945fa-1111-4111-8111-aaaaaaaaaaaa',
    oficina_id: OFFICE_LOCAL,
    office_id: OFFICE_LOCAL,
    data: '2026-09-18',
    horario: '10:00',
    cliente_id: CLI_LOCAL,
    moto_id: MOTO_LOCAL,
    servico: 'teste tombstone 1',
    status: 'agendado',
    created_at: AGORA,
    updated_at: AGORA,
  } satisfies Agendamento,
  OFFICE_LOCAL
)
const rowCreate = await mapearAgendamentoParaSupabase(criado, OFFICE_UUID)
assert.ok(rowCreate)
assert.equal(rowCreate.customer_id, CUSTOMER_REAL)
assert.equal(rowCreate.motorcycle_id, MOTO_REAL)
assert.notEqual(rowCreate.customer_id, CUSTOMER_HASH_VENENO)
assert.notEqual(rowCreate.motorcycle_id, MOTO_HASH_VENENO)

// Dedup: localA some, sobrevivente localB herda UUID remoto
registrarMapeamentoId(CLI_LOCAL, CUSTOMER_REAL)
repararRegistryAposDedupClientes(
  new Map([
    [CLI_LOCAL, 'cli-sobrevivente'],
    ['cli-sobrevivente', 'cli-sobrevivente'],
  ])
)
assert.equal(obterUuidPorLocalId('cli-sobrevivente'), CUSTOMER_REAL)
assert.equal(obterLocalIdPorUuid(CUSTOMER_REAL), 'cli-sobrevivente')

console.log('verificar-fase1-registry-repair: ok')
