import assert from 'node:assert/strict'
import {
  limparRegistroIds,
  invalidarCacheRegistroIdsParaTeste,
  obterLocalIdPorUuid,
  obterOrigemMapeamentoId,
  obterUuidPorLocalId,
  registrarMapeamentoId,
  registrarMapeamentoIdProvisorio,
} from '../src/services/supabase-sync/id-registry.ts'
import {
  mapearCustomerReverso,
  mapearMotorcycleReverso,
  mapearServiceOrderReverso,
} from '../src/services/supabase-sync/reverse-mappers.ts'
import { mapearAgendamentoDoSupabase } from '../src/services/agenda/agenda-mappers.ts'
import type { AppointmentRow } from '../src/services/agenda/agenda-mappers.ts'
import { localIdParaUuid } from '../src/lib/local-id-uuid.ts'

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

const LOCAL_A = 'cli-x'
const LOCAL_B = 'cli-y'
const UUID1 = '11111111-1111-4111-8111-111111111111'
const UUID2 = '22222222-2222-4222-8222-222222222222'

function simetria(local: string, uuid: string): void {
  assert.equal(obterUuidPorLocalId(local), uuid)
  assert.equal(obterLocalIdPorUuid(uuid), local)
}

// A) overwrite localA uuid1 → uuid2 remove reverse stale de uuid1
limparRegistroIds()
registrarMapeamentoId(LOCAL_A, UUID1)
simetria(LOCAL_A, UUID1)
registrarMapeamentoId(LOCAL_A, UUID2)
assert.equal(obterUuidPorLocalId(LOCAL_A), UUID2)
assert.equal(obterLocalIdPorUuid(UUID2), LOCAL_A)
assert.equal(obterLocalIdPorUuid(UUID1), undefined)
assert.equal(obterUuidPorLocalId(LOCAL_A) === UUID1, false)

// B) uuid1 já reassociado a localB: corrigir localA → uuid2 NÃO apaga uuid1 → localB
limparRegistroIds()
registrarMapeamentoId(LOCAL_A, UUID1)
registrarMapeamentoId(LOCAL_B, UUID1)
assert.equal(obterLocalIdPorUuid(UUID1), LOCAL_B)
assert.equal(obterUuidPorLocalId(LOCAL_B), UUID1)
assert.equal(obterUuidPorLocalId(LOCAL_A), undefined)
registrarMapeamentoId(LOCAL_A, UUID2)
assert.equal(obterLocalIdPorUuid(UUID1), LOCAL_B)
assert.equal(obterUuidPorLocalId(LOCAL_B), UUID1)
simetria(LOCAL_A, UUID2)

limparRegistroIds()
localStorage.setItem(
  'craft_id_map_v1',
  JSON.stringify({
    version: 2,
    uuidParaLocal: { [UUID1]: LOCAL_B },
    localParaUuid: { [LOCAL_A]: UUID1, [LOCAL_B]: UUID1 },
  })
)
invalidarCacheRegistroIdsParaTeste()
registrarMapeamentoId(LOCAL_A, UUID2)
assert.equal(obterLocalIdPorUuid(UUID1), LOCAL_B)
assert.equal(obterUuidPorLocalId(LOCAL_B), UUID1)
simetria(LOCAL_A, UUID2)

// C) mesmo par é idempotente
limparRegistroIds()
registrarMapeamentoId(LOCAL_A, UUID2)
registrarMapeamentoId(LOCAL_A, UUID2)
registrarMapeamentoId(` ${LOCAL_A} `, ` ${UUID2} `)
simetria(LOCAL_A, UUID2)
assert.equal(obterLocalIdPorUuid(UUID1), undefined)

// D) dois localIds no mesmo uuid não deixam reverse incoerente
limparRegistroIds()
registrarMapeamentoId(LOCAL_A, UUID1)
registrarMapeamentoId(LOCAL_B, UUID1)
assert.equal(obterLocalIdPorUuid(UUID1), LOCAL_B)
assert.equal(obterUuidPorLocalId(LOCAL_B), UUID1)
assert.equal(obterUuidPorLocalId(LOCAL_A), undefined)
assert.equal(obterLocalIdPorUuid(UUID1) === LOCAL_A, false)

// E) simetria de mappings válidos
limparRegistroIds()
registrarMapeamentoId('moto-aaaa', UUID1)
registrarMapeamentoId('os-bbbb', UUID2)
simetria('moto-aaaa', UUID1)
simetria('os-bbbb', UUID2)

// Regressão Fase 1 reverse: customer / motorcycle / OS
const agora = '2026-09-18T10:00:00.000Z'
const customerRow = {
  id: '4d0684fa-acc3-55a6-8430-97e83187d2b8',
  name: 'Cliente B',
  phone: '11900000000',
  cpf: null,
  address: '',
  notes: null,
  created_at: agora,
  updated_at: agora,
}
limparRegistroIds()
const cliente = await mapearCustomerReverso(customerRow, 'oficina-teste', [], [])
assert.equal(cliente.id, 'cli-4d0684fa')
simetria(cliente.id, customerRow.id)

const motoRow = {
  id: '9bfe2738-d569-516f-bc87-f4abb8ce91c6',
  customer_id: customerRow.id,
  brand: 'Honda',
  model: 'CG',
  year: 2020,
  plate: 'TST1A23',
  color: 'preta',
  mileage: 1000,
  chassis: null,
  notes: null,
  created_at: agora,
  updated_at: agora,
}
const moto = await mapearMotorcycleReverso(
  motoRow,
  'oficina-teste',
  [],
  new Map([[customerRow.id, cliente.id]])
)
assert.equal(moto.id, 'moto-9bfe2738')
assert.equal(moto.cliente_id, cliente.id)
simetria(moto.id, motoRow.id)

const osRow = {
  id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0001',
  customer_id: customerRow.id,
  motorcycle_id: motoRow.id,
  number: 10,
  reported_issue: 'ruído',
  diagnosis: '',
  services_performed: '',
  parts_used: null,
  parts_value: 0,
  labor_value: 0,
  discount: 0,
  total_value: 0,
  status: 'orcamento' as const,
  entry_checklist: null,
  estimated_value: null,
  budget_date: null,
  budget_status: null,
  entry_mileage: null,
  exit_mileage: null,
  warranty_days: null,
  warranty_expires_at: null,
  created_at: agora,
  updated_at: agora,
}
const os = await mapearServiceOrderReverso(
  osRow,
  'oficina-teste',
  [],
  new Map([[customerRow.id, cliente.id]]),
  new Map([[motoRow.id, moto.id]])
)
assert.equal(os.cliente_id, cliente.id)
assert.equal(os.moto_id, moto.id)
simetria(os.id, osRow.id)

const hashErrado = await localIdParaUuid('cli-4d0684fa')
const hashMotoErrado = await localIdParaUuid('moto-9bfe2738')
limparRegistroIds()
registrarMapeamentoId('cli-4d0684fa', '08da8694-07f8-5a7c-9174-607b142d8af4')
registrarMapeamentoId('moto-9bfe2738', '2e3c80ad-b639-5f4c-bf98-bd4659b7da33')
const clienteReparado = await mapearCustomerReverso(customerRow, 'oficina-teste', ['cli-4d0684fa'], [])
assert.equal(clienteReparado.id, 'cli-4d0684fa')
assert.equal(obterUuidPorLocalId('cli-4d0684fa'), customerRow.id)
assert.equal(obterLocalIdPorUuid('08da8694-07f8-5a7c-9174-607b142d8af4'), undefined)
const motoReparado = await mapearMotorcycleReverso(
  motoRow,
  'oficina-teste',
  ['moto-9bfe2738'],
  new Map([[customerRow.id, 'cli-4d0684fa']])
)
assert.equal(motoReparado.id, 'moto-9bfe2738')
assert.equal(obterUuidPorLocalId('moto-9bfe2738'), motoRow.id)
assert.equal(obterLocalIdPorUuid('2e3c80ad-b639-5f4c-bf98-bd4659b7da33'), undefined)

limparRegistroIds()
registrarMapeamentoId('cli-4d0684fa', hashErrado)
registrarMapeamentoId('moto-9bfe2738', hashMotoErrado)
localStorage.setItem(
  'craft_id_map_v1',
  JSON.stringify({
    version: 2,
    uuidParaLocal: {
      [hashErrado]: 'cli-4d0684fa',
      [customerRow.id]: 'cli-4d0684fa',
      [motoRow.id]: 'moto-9bfe2738',
    },
    localParaUuid: {
      'cli-4d0684fa': hashErrado,
      'moto-9bfe2738': await localIdParaUuid('moto-9bfe2738'),
    },
  })
)
invalidarCacheRegistroIdsParaTeste()
const apt = mapearAgendamentoDoSupabase(
  {
    id: '2a2a0944-4792-4aab-9339-cb836ada9c42',
    office_id: 'fdd4e82f-2a03-4cd7-9340-b5f067d2fed5',
    customer_id: customerRow.id,
    motorcycle_id: motoRow.id,
    service_order_id: null,
    appointment_date: '2026-09-18',
    appointment_time: '10:00:00',
    service: 'Revisão',
    status: 'agendado',
    notes: null,
    created_at: agora,
    updated_at: agora,
    deleted_at: null,
  } satisfies AppointmentRow,
  'oficina-teste'
)
assert.equal(apt.cliente_id, 'cli-4d0684fa')
assert.equal(obterUuidPorLocalId('cli-4d0684fa'), customerRow.id)
assert.equal(obterLocalIdPorUuid(hashErrado), undefined)
assert.equal(obterUuidPorLocalId('cli-4d0684fa') === hashErrado, false)

// Hash provisório não substitui UUID remoto confirmado
limparRegistroIds()
registrarMapeamentoId('cli-4d0684fa', customerRow.id)
registrarMapeamentoIdProvisorio('cli-4d0684fa', hashErrado)
assert.equal(obterUuidPorLocalId('cli-4d0684fa'), customerRow.id)
assert.equal(obterOrigemMapeamentoId('cli-4d0684fa'), 'confirmado')
registrarMapeamentoIdProvisorio('cli-entidade-nova', await localIdParaUuid('cli-entidade-nova'))
assert.equal(
  obterUuidPorLocalId('cli-entidade-nova'),
  await localIdParaUuid('cli-entidade-nova')
)
assert.equal(obterOrigemMapeamentoId('cli-entidade-nova'), 'provisorio')

console.log('verificar-id-registry: ok')
