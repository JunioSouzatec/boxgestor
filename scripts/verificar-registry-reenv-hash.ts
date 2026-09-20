import assert from 'node:assert/strict'
import { localIdParaUuid } from '../src/lib/local-id-uuid.ts'
import {
  limparRegistroIds,
  obterLocalIdPorUuid,
  obterOrigemMapeamentoId,
  obterUuidPorLocalId,
  registrarMapeamentoIdConfirmado,
} from '../src/services/supabase-sync/id-registry.ts'
import { SyncIdMap } from '../src/services/supabase-sync/sync-id-map.ts'
import {
  expandirIdsConfirmadosAposUpsert,
  registrarMapeamentosFase1,
} from '../src/services/supabase-sync/fase1-id-registro.ts'
import { mapearLembreteDoSupabase } from '../src/services/lembretes/lembretes-mappers.ts'
import { mapearAlertaDoSupabase } from '../src/services/comunicacao/alertas-comunicacao-mappers.ts'
import { repararRegistryFksAposPullAgenda } from '../src/services/agenda/agenda-mappers.ts'
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
const AGORA = '2026-09-20T15:24:00.000Z'

const HASH_CLI = await localIdParaUuid(CLI_LOCAL)
const HASH_MOTO = await localIdParaUuid(MOTO_LOCAL)
assert.equal(HASH_CLI, '08da8694-07f8-5a7c-9174-607b142d8af4')
assert.equal(HASH_MOTO, '2e3c80ad-b639-5f4c-bf98-bd4659b7da33')

function heal(): void {
  limparRegistroIds()
  registrarMapeamentoIdConfirmado(CLI_LOCAL, CUSTOMER_REAL, 'reverse_customer')
  registrarMapeamentoIdConfirmado(MOTO_LOCAL, MOTO_REAL, 'reverse_vehicle')
  assert.equal(obterUuidPorLocalId(CLI_LOCAL), CUSTOMER_REAL)
  assert.equal(obterUuidPorLocalId(MOTO_LOCAL), MOTO_REAL)
  assert.equal(obterOrigemMapeamentoId(CLI_LOCAL), 'confirmado')
  assert.equal(obterOrigemMapeamentoId(MOTO_LOCAL), 'confirmado')
}

function assertHealed(): void {
  assert.equal(obterUuidPorLocalId(CLI_LOCAL), CUSTOMER_REAL)
  assert.equal(obterUuidPorLocalId(MOTO_LOCAL), MOTO_REAL)
  assert.equal(obterLocalIdPorUuid(CUSTOMER_REAL), CLI_LOCAL)
  assert.equal(obterLocalIdPorUuid(MOTO_REAL), MOTO_LOCAL)
  assert.notEqual(obterUuidPorLocalId(CLI_LOCAL), HASH_CLI)
  assert.notEqual(obterUuidPorLocalId(MOTO_LOCAL), HASH_MOTO)
  assert.equal(obterLocalIdPorUuid(HASH_CLI), undefined)
  assert.equal(obterLocalIdPorUuid(HASH_MOTO), undefined)
}

// 1) Heal + persist/finalize Fase 1 com hash no payload local NÃO pode reenvenenar.
heal()
const ids = new SyncIdMap()
const uuidCli = obterUuidPorLocalId(CLI_LOCAL)
const uuidMoto = obterUuidPorLocalId(MOTO_LOCAL)
if (uuidCli) ids.lembrar(CLI_LOCAL, uuidCli)
if (uuidMoto) ids.lembrar(MOTO_LOCAL, uuidMoto)
assert.equal(await ids.uuid(CLI_LOCAL), CUSTOMER_REAL)
assert.equal(await ids.uuid(MOTO_LOCAL), MOTO_REAL)

const idsSemSeed = new SyncIdMap()
assert.equal(await idsSemSeed.uuid(CLI_LOCAL), HASH_CLI)
assert.equal(idsSemSeed.ehConfirmado(CLI_LOCAL), false)
assert.equal(await idsSemSeed.uuid(MOTO_LOCAL), HASH_MOTO)

const mapaIds = {
  [CLI_LOCAL]: await idsSemSeed.uuid(CLI_LOCAL),
  [MOTO_LOCAL]: await idsSemSeed.uuid(MOTO_LOCAL),
}
assert.equal(mapaIds[CLI_LOCAL], HASH_CLI)
assert.equal(mapaIds[MOTO_LOCAL], HASH_MOTO)
const idsSelect = new Set([CUSTOMER_REAL, MOTO_REAL])
expandirIdsConfirmadosAposUpsert(idsSelect, mapaIds)
assert.equal(idsSelect.has(HASH_CLI), false)
assert.equal(idsSelect.has(HASH_MOTO), false)
registrarMapeamentosFase1(mapaIds, idsSelect)
assertHealed()

// 2) Pull de lembrete com FK hash NÃO desfaz o heal.
heal()
await mapearLembreteDoSupabase(
  {
    id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    office_id: OFFICE,
    local_id: 'lem-diag',
    cliente_id: HASH_CLI,
    moto_id: HASH_MOTO,
    servico: 'revisao',
    data_prevista: '2026-09-20',
    mensagem: 'x',
    personalizado: false,
    created_at: AGORA,
    updated_at: AGORA,
  },
  OFFICE
)
assertHealed()

// 3) Pull de alerta com FK hash NÃO desfaz o heal.
heal()
await mapearAlertaDoSupabase(
  {
    id: 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff',
    office_id: OFFICE,
    local_id: 'alert-diag',
    client_id: HASH_CLI,
    vehicle_id: HASH_MOTO,
    tipo: 'revisao',
    motivo: 'revisao',
    status: 'pendente',
    prioridade: 'hoje',
    due_date: '2026-09-20',
    message_text: 'x',
    created_at: AGORA,
    updated_at: AGORA,
  },
  OFFICE
)
assertHealed()

// 4) Agenda repair com FK hash NÃO desfaz o heal.
heal()
const localAg = {
  id: '18f59ea6-0789-41a3-a2a9-34d754c670dd',
  oficina_id: OFFICE,
  office_id: OFFICE,
  data: '2026-09-20',
  horario: '10:48',
  cliente_id: CLI_LOCAL,
  moto_id: MOTO_LOCAL,
  servico: 'CREATE',
  status: 'agendado',
  created_at: AGORA,
  updated_at: AGORA,
} satisfies Agendamento
const remotoAg = { ...localAg, cliente_id: HASH_CLI, moto_id: HASH_MOTO }
repararRegistryFksAposPullAgenda([localAg], [remotoAg])
assertHealed()

console.log('verificar-registry-reenv-hash: ok')
