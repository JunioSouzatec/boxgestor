import assert from 'node:assert/strict'
import { localIdParaUuid } from '../src/lib/local-id-uuid.ts'
import {
  limparRegistroIds,
  obterLocalIdPorUuid,
  obterOrigemMapeamentoId,
  obterUuidPorLocalId,
  registrarMapeamentoIdConfirmado,
  registrarMapeamentoIdProvisorio,
} from '../src/services/supabase-sync/id-registry.ts'
import {
  expandirIdsConfirmadosAposUpsert,
  registrarMapeamentosFase1,
  resolverUuidRemotoConhecido,
} from '../src/services/supabase-sync/fase1-id-registro.ts'
import { SyncIdMap } from '../src/services/supabase-sync/sync-id-map.ts'
import {
  mapearCustomerReverso,
  mapearMotorcycleReverso,
} from '../src/services/supabase-sync/reverse-mappers.ts'
import { mapearAgendamentoParaSupabase } from '../src/services/agenda/agenda-mappers.ts'
import { stampCreate } from '../src/services/migration.service.ts'
import type { Agendamento } from '../src/types/agendamento.ts'

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
const AGORA = '2026-09-20T13:48:15.715Z'

const HASH_CLI = await localIdParaUuid(CLI_LOCAL)
const HASH_MOTO = await localIdParaUuid(MOTO_LOCAL)
assert.equal(HASH_CLI, '08da8694-07f8-5a7c-9174-607b142d8af4')
assert.equal(HASH_MOTO, '2e3c80ad-b639-5f4c-bf98-bd4659b7da33')

function simularPersistFase1(
  mapaLocalParaUuid: Record<string, string>,
  idsSelect: ReadonlySet<string>
): void {
  const idsRemotosConfirmados = new Set(idsSelect)
  expandirIdsConfirmadosAposUpsert(idsRemotosConfirmados, mapaLocalParaUuid)
  registrarMapeamentosFase1(mapaLocalParaUuid, idsRemotosConfirmados)
}

// 11) confirmado não é substituído pelo hash da Fase 1
limparRegistroIds()
registrarMapeamentoIdConfirmado(CLI_LOCAL, CUSTOMER_REAL)
registrarMapeamentoIdConfirmado(MOTO_LOCAL, MOTO_REAL)
assert.equal(obterUuidPorLocalId(CLI_LOCAL), CUSTOMER_REAL)
assert.equal(obterUuidPorLocalId(MOTO_LOCAL), MOTO_REAL)

simularPersistFase1(
  { [CLI_LOCAL]: HASH_CLI, [MOTO_LOCAL]: HASH_MOTO },
  new Set([CUSTOMER_REAL, MOTO_REAL])
)
assert.equal(obterUuidPorLocalId(CLI_LOCAL), CUSTOMER_REAL)
assert.equal(obterUuidPorLocalId(MOTO_LOCAL), MOTO_REAL)
assert.equal(obterLocalIdPorUuid(CUSTOMER_REAL), CLI_LOCAL)
assert.equal(obterLocalIdPorUuid(MOTO_REAL), MOTO_LOCAL)
assert.equal(obterLocalIdPorUuid(HASH_CLI), undefined)
assert.equal(obterLocalIdPorUuid(HASH_MOTO), undefined)
assert.notEqual(obterUuidPorLocalId(CLI_LOCAL), HASH_CLI)
assert.notEqual(obterUuidPorLocalId(MOTO_LOCAL), HASH_MOTO)

// lookup usa SELECT, não hash do registry
assert.equal(
  resolverUuidRemotoConhecido(CLI_LOCAL, undefined, new Set([CUSTOMER_REAL])),
  CUSTOMER_REAL
)
assert.equal(
  resolverUuidRemotoConhecido(MOTO_LOCAL, undefined, new Set([MOTO_REAL])),
  MOTO_REAL
)
assert.equal(resolverUuidRemotoConhecido(CLI_LOCAL, HASH_CLI, new Set([CUSTOMER_REAL])), CUSTOMER_REAL)

// SyncIdMap: lembrar hash não confirma; seed remoto vence
const ids = new SyncIdMap()
ids.lembrar(CLI_LOCAL, HASH_CLI)
assert.equal(ids.ehConfirmado(CLI_LOCAL), false)
assert.equal(await ids.uuid(CLI_LOCAL), HASH_CLI)
ids.seed(CLI_LOCAL, CUSTOMER_REAL)
assert.equal(ids.ehConfirmado(CLI_LOCAL), true)
assert.equal(await ids.uuid(CLI_LOCAL), CUSTOMER_REAL)
ids.lembrar(CLI_LOCAL, HASH_CLI)
assert.equal(await ids.uuid(CLI_LOCAL), CUSTOMER_REAL)

// hash provisório não sobrescreve confirmado
registrarMapeamentoIdProvisorio(CLI_LOCAL, HASH_CLI)
assert.equal(obterUuidPorLocalId(CLI_LOCAL), CUSTOMER_REAL)
assert.equal(obterOrigemMapeamentoId(CLI_LOCAL), 'confirmado')

// 12) entidade nova: hash vira PK confirmada na primeira criação
limparRegistroIds()
const CLI_NOVO = 'cli-entidade-nova'
const HASH_NOVO = await localIdParaUuid(CLI_NOVO)
simularPersistFase1({ [CLI_NOVO]: HASH_NOVO }, new Set())
assert.equal(obterUuidPorLocalId(CLI_NOVO), HASH_NOVO)
assert.equal(obterLocalIdPorUuid(HASH_NOVO), CLI_NOVO)
assert.equal(obterOrigemMapeamentoId(CLI_NOVO), 'confirmado')

const MOTO_NOVA = 'moto-entidade-nova'
const HASH_MOTO_NOVA = await localIdParaUuid(MOTO_NOVA)
simularPersistFase1({ [MOTO_NOVA]: HASH_MOTO_NOVA }, new Set())
assert.equal(obterUuidPorLocalId(MOTO_NOVA), HASH_MOTO_NOVA)
assert.equal(obterOrigemMapeamentoId(MOTO_NOVA), 'confirmado')

// 13) reverse mapper: row remota vence hash
limparRegistroIds()
registrarMapeamentoIdProvisorio(CLI_LOCAL, HASH_CLI)
registrarMapeamentoIdProvisorio(MOTO_LOCAL, HASH_MOTO)
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
const clienteReverso = await mapearCustomerReverso(
  customerRow,
  OFFICE,
  [CLI_LOCAL],
  [{ id: CLI_LOCAL, oficina_id: OFFICE, office_id: OFFICE, nome: 'Cliente tecnico', telefone: '11900000001', endereco: '', criado_em: '2026-09-18' }]
)
assert.equal(clienteReverso.id, CLI_LOCAL)
assert.equal(obterUuidPorLocalId(CLI_LOCAL), CUSTOMER_REAL)
assert.equal(obterLocalIdPorUuid(HASH_CLI), undefined)
assert.equal(obterOrigemMapeamentoId(CLI_LOCAL), 'confirmado')

const motoReverso = await mapearMotorcycleReverso(
  motorcycleRow,
  OFFICE,
  [MOTO_LOCAL],
  new Map([[CUSTOMER_REAL, CLI_LOCAL]])
)
assert.equal(motoReverso.id, MOTO_LOCAL)
assert.equal(obterUuidPorLocalId(MOTO_LOCAL), MOTO_REAL)
assert.equal(obterLocalIdPorUuid(HASH_MOTO), undefined)
assert.equal(obterOrigemMapeamentoId(MOTO_LOCAL), 'confirmado')

// 1:1 identidade não apaga alias no mesmo lote
limparRegistroIds()
registrarMapeamentoIdConfirmado(CLI_LOCAL, CUSTOMER_REAL)
simularPersistFase1(
  { [CLI_LOCAL]: CUSTOMER_REAL, [CUSTOMER_REAL]: CUSTOMER_REAL },
  new Set([CUSTOMER_REAL])
)
assert.equal(obterUuidPorLocalId(CLI_LOCAL), CUSTOMER_REAL)
assert.equal(obterLocalIdPorUuid(CUSTOMER_REAL), CLI_LOCAL)

// 14) primeiro CREATE da Agenda usa UUID real, nunca hash
limparRegistroIds()
registrarMapeamentoIdConfirmado(CLI_LOCAL, CUSTOMER_REAL)
registrarMapeamentoIdConfirmado(MOTO_LOCAL, MOTO_REAL)
simularPersistFase1(
  { [CLI_LOCAL]: HASH_CLI, [MOTO_LOCAL]: HASH_MOTO },
  new Set([CUSTOMER_REAL, MOTO_REAL])
)
const criado = stampCreate(
  {
    id: '18f59ea6-0789-41a3-a2a9-34d754c670dd',
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

console.log('verificar-fase1-id-confirmado: ok')
