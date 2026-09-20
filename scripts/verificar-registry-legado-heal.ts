import assert from 'node:assert/strict'
import { localIdParaUuid } from '../src/lib/local-id-uuid.ts'
import {
  limparRegistroIds,
  invalidarCacheRegistroIdsParaTeste,
  normalizarOrigensLegadoRegistry,
  obterLocalIdPorUuid,
  obterOrigemMapeamentoId,
  obterUuidPorLocalId,
  registrarMapeamentoIdConfirmado,
  registrarMapeamentoIdProvisorio,
} from '../src/services/supabase-sync/id-registry.ts'
import { aplicarPullFase1Registry } from '../src/services/supabase-sync/fase1-registry-repair.ts'
import {
  mapearCustomerReverso,
  mapearMotorcycleReverso,
} from '../src/services/supabase-sync/reverse-mappers.ts'
import { mapearAgendamentoParaSupabase } from '../src/services/agenda/agenda-mappers.ts'
import { stampCreate } from '../src/services/migration.service.ts'
import type { Agendamento } from '../src/types/agendamento.ts'
import type { Cliente } from '../src/types/cliente.ts'
import type { Moto } from '../src/types/moto.ts'

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
const CLI_LOCAL = 'cli-4d0684fa'
const MOTO_LOCAL = 'moto-9bfe2738'
const CUSTOMER_REAL = '4d0684fa-acc3-55a6-8430-97e83187d2b8'
const MOTO_REAL = '9bfe2738-d569-516f-bc87-f4abb8ce91c6'
const HASH_CLI = '08da8694-07f8-5a7c-9174-607b142d8af4'
const HASH_MOTO = '2e3c80ad-b639-5f4c-bf98-bd4659b7da33'
const APT = '18f59ea6-0789-41a3-a2a9-34d754c670dd'
const AGORA = '2026-09-20T13:48:15.715Z'
const PLACA = 'TST0A00'

assert.equal(await localIdParaUuid(CLI_LOCAL), HASH_CLI)
assert.equal(await localIdParaUuid(MOTO_LOCAL), HASH_MOTO)

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
  plate: PLACA,
  color: 'preta',
  mileage: 1000,
  chassis: null,
  notes: null,
  created_at: AGORA,
  updated_at: AGORA,
}

const clienteAlias: Cliente = {
  id: CLI_LOCAL,
  oficina_id: OFFICE,
  office_id: OFFICE,
  nome: 'Cliente tecnico',
  telefone: '11900000001',
  endereco: '',
  criado_em: '2026-09-18',
  atualizado_em: '2026-09-18',
}
const motoAlias: Moto = {
  id: MOTO_LOCAL,
  oficina_id: OFFICE,
  office_id: OFFICE,
  cliente_id: CLI_LOCAL,
  marca: 'Honda',
  modelo: 'CG',
  ano: 2020,
  placa: PLACA,
  cor: 'preta',
  quilometragem: 1000,
  criado_em: '2026-09-18',
}

function plantarBrowserLegado(): void {
  mem.clear()
  localStorage.setItem(
    'craft_id_map_v1',
    JSON.stringify({
      version: 2,
      uuidParaLocal: {
        [HASH_CLI]: CLI_LOCAL,
        [HASH_MOTO]: MOTO_LOCAL,
        [CUSTOMER_REAL]: CUSTOMER_REAL,
        [MOTO_REAL]: MOTO_REAL,
      },
      localParaUuid: {
        [CLI_LOCAL]: HASH_CLI,
        [MOTO_LOCAL]: HASH_MOTO,
        [CUSTOMER_REAL]: CUSTOMER_REAL,
        [MOTO_REAL]: MOTO_REAL,
      },
    })
  )
  invalidarCacheRegistroIdsParaTeste()
}

function plantarV2SomenteHashes(): void {
  mem.clear()
  localStorage.setItem(
    'craft_id_map_v1',
    JSON.stringify({
      version: 2,
      uuidParaLocal: {
        [HASH_CLI]: CLI_LOCAL,
        [HASH_MOTO]: MOTO_LOCAL,
      },
      localParaUuid: {
        [CLI_LOCAL]: HASH_CLI,
        [MOTO_LOCAL]: HASH_MOTO,
      },
    })
  )
  invalidarCacheRegistroIdsParaTeste()
}

// A) alias→hash legado vira provisório; mapping permanece
plantarV2SomenteHashes()
await normalizarOrigensLegadoRegistry()
assert.equal(obterUuidPorLocalId(CLI_LOCAL), HASH_CLI)
assert.equal(obterUuidPorLocalId(MOTO_LOCAL), HASH_MOTO)
assert.equal(obterOrigemMapeamentoId(CLI_LOCAL), 'provisorio')
assert.equal(obterOrigemMapeamentoId(MOTO_LOCAL), 'provisorio')

// B–D + H) self-map fantasma não bloqueia; customer/vehicle aliases reparados
plantarBrowserLegado()
const pull = await aplicarPullFase1Registry({
  officeLocalId: OFFICE,
  officeUuid: OFFICE,
  customers: [customerRow],
  motorcycles: [motorcycleRow],
  candidatosCliente: [CLI_LOCAL],
  candidatosMoto: [MOTO_LOCAL],
  clientesReferencia: [clienteAlias],
  motosReferencia: [motoAlias],
})
assert.equal(pull.clientes[0]?.id, CLI_LOCAL)
assert.equal(pull.motos[0]?.id, MOTO_LOCAL)
assert.equal(obterUuidPorLocalId(CLI_LOCAL), CUSTOMER_REAL)
assert.equal(obterUuidPorLocalId(MOTO_LOCAL), MOTO_REAL)
assert.equal(obterOrigemMapeamentoId(CLI_LOCAL), 'confirmado')
assert.equal(obterOrigemMapeamentoId(MOTO_LOCAL), 'confirmado')
assert.equal(obterLocalIdPorUuid(CUSTOMER_REAL), CLI_LOCAL)
assert.equal(obterLocalIdPorUuid(MOTO_REAL), MOTO_LOCAL)
assert.equal(obterLocalIdPorUuid(HASH_CLI), undefined)
assert.equal(obterLocalIdPorUuid(HASH_MOTO), undefined)
assert.notEqual(obterUuidPorLocalId(CLI_LOCAL), HASH_CLI)
assert.notEqual(obterUuidPorLocalId(MOTO_LOCAL), HASH_MOTO)

// E) confirmado bloqueia hash futuro
registrarMapeamentoIdProvisorio(CLI_LOCAL, HASH_CLI)
registrarMapeamentoIdProvisorio(MOTO_LOCAL, HASH_MOTO)
assert.equal(obterUuidPorLocalId(CLI_LOCAL), CUSTOMER_REAL)
assert.equal(obterUuidPorLocalId(MOTO_LOCAL), MOTO_REAL)
assert.equal(obterOrigemMapeamentoId(CLI_LOCAL), 'confirmado')
assert.equal(obterOrigemMapeamentoId(MOTO_LOCAL), 'confirmado')

// H) Agenda primeiro CREATE usa UUIDs reais depois do heal
const criado = stampCreate(
  {
    id: APT,
    oficina_id: OFFICE,
    office_id: OFFICE,
    data: '2026-09-20',
    horario: '10:48',
    cliente_id: CLI_LOCAL,
    moto_id: MOTO_LOCAL,
    servico: 'CREATE registry',
    status: 'agendado',
    created_at: AGORA,
    updated_at: AGORA,
  } satisfies Agendamento,
  OFFICE
)
const rowCreate = await mapearAgendamentoParaSupabase(criado, OFFICE)
assert.ok(rowCreate)
assert.equal(rowCreate.customer_id, CUSTOMER_REAL)
assert.equal(rowCreate.motorcycle_id, MOTO_REAL)
assert.notEqual(rowCreate.customer_id, HASH_CLI)
assert.notEqual(rowCreate.motorcycle_id, HASH_MOTO)

// F) self-map de entidade local real é preservado — não inventa alias
limparRegistroIds()
registrarMapeamentoIdConfirmado(CUSTOMER_REAL, CUSTOMER_REAL)
registrarMapeamentoIdConfirmado(MOTO_REAL, MOTO_REAL)
const clienteUuid: Cliente = { ...clienteAlias, id: CUSTOMER_REAL }
const motoUuid: Moto = { ...motoAlias, id: MOTO_REAL, cliente_id: CUSTOMER_REAL }
const clienteReal = await mapearCustomerReverso(
  customerRow,
  OFFICE,
  [CUSTOMER_REAL],
  [clienteUuid]
)
const motoReal = await mapearMotorcycleReverso(
  motorcycleRow,
  OFFICE,
  [MOTO_REAL],
  new Map([[CUSTOMER_REAL, CUSTOMER_REAL]]),
  [motoUuid]
)
assert.equal(clienteReal.id, CUSTOMER_REAL)
assert.equal(motoReal.id, MOTO_REAL)
assert.equal(obterUuidPorLocalId(CUSTOMER_REAL), CUSTOMER_REAL)
assert.equal(obterUuidPorLocalId(MOTO_REAL), MOTO_REAL)
assert.equal(obterLocalIdPorUuid(CUSTOMER_REAL), CUSTOMER_REAL)
assert.equal(obterUuidPorLocalId(CLI_LOCAL), undefined)
assert.equal(obterUuidPorLocalId(MOTO_LOCAL), undefined)

// G) hash legítimo de entidade nova pode virar confirmado
limparRegistroIds()
const CLI_NOVO = 'cli-entidade-nova'
const HASH_NOVO = await localIdParaUuid(CLI_NOVO)
localStorage.setItem(
  'craft_id_map_v1',
  JSON.stringify({
    version: 2,
    uuidParaLocal: { [HASH_NOVO]: CLI_NOVO },
    localParaUuid: { [CLI_NOVO]: HASH_NOVO },
  })
)
invalidarCacheRegistroIdsParaTeste()
await normalizarOrigensLegadoRegistry()
assert.equal(obterUuidPorLocalId(CLI_NOVO), HASH_NOVO)
assert.equal(obterOrigemMapeamentoId(CLI_NOVO), 'provisorio')
const rowNova = {
  ...customerRow,
  id: HASH_NOVO,
  name: 'Cliente novo',
  phone: '11900000999',
}
const clienteNovoLocal: Cliente = {
  ...clienteAlias,
  id: CLI_NOVO,
  nome: 'Cliente novo',
  telefone: '11900000999',
}
await mapearCustomerReverso(rowNova, OFFICE, [CLI_NOVO], [clienteNovoLocal])
assert.equal(obterUuidPorLocalId(CLI_NOVO), HASH_NOVO)
assert.equal(obterOrigemMapeamentoId(CLI_NOVO), 'confirmado')
assert.equal(obterLocalIdPorUuid(HASH_NOVO), CLI_NOVO)

console.log('verificar-registry-legado-heal: ok')
