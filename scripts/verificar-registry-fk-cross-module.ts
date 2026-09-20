import assert from 'node:assert/strict'
import { localIdParaUuid } from '../src/lib/local-id-uuid.ts'
import {
  limparRegistroIds,
  lembrarHashDeterministico,
  obterOrigemMapeamentoId,
  obterUuidPorLocalId,
  registrarMapeamentoId,
  registrarMapeamentoIdConfirmado,
  registrarMapeamentoIdProvisorio,
  registrarMapeamentos,
} from '../src/services/supabase-sync/id-registry.ts'
import { mapearLembreteDoSupabase, mapearLembreteParaSupabase } from '../src/services/lembretes/lembretes-mappers.ts'
import { mapearAlertaDoSupabase, mapearAlertaParaSupabase } from '../src/services/comunicacao/alertas-comunicacao-mappers.ts'
import {
  mapearHistoricoDoSupabase,
  mapearHistoricoParaSupabase,
} from '../src/services/comunicacao/comunicacao-mappers.ts'
import {
  mapearAgendamentoParaSupabase,
  repararRegistryFksAposPullAgenda,
} from '../src/services/agenda/agenda-mappers.ts'
import type { Agendamento } from '../src/types/agendamento.ts'
import type { AlertaComunicacao } from '../src/types/alerta-comunicacao.ts'
import type { HistoricoContato } from '../src/types/comunicacao.ts'
import type { LembreteCliente } from '../src/types/lembrete.ts'

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
const APT = '18f59ea6-0789-41a3-a2a9-34d754c670dd'
const AGORA = '2026-09-20T15:37:00.000Z'

const HASH_CLI = await localIdParaUuid(CLI_LOCAL)
const HASH_MOTO = await localIdParaUuid(MOTO_LOCAL)
assert.equal(HASH_CLI, '08da8694-07f8-5a7c-9174-607b142d8af4')
assert.equal(HASH_MOTO, '2e3c80ad-b639-5f4c-bf98-bd4659b7da33')

function envenenar(): void {
  limparRegistroIds()
  registrarMapeamentoIdConfirmado(CLI_LOCAL, HASH_CLI, 'seed_veneno', 'deterministic_fallback')
  registrarMapeamentoIdConfirmado(MOTO_LOCAL, HASH_MOTO, 'seed_veneno', 'deterministic_fallback')
}

function heal(): void {
  registrarMapeamentoIdConfirmado(CLI_LOCAL, CUSTOMER_REAL, 'reverse_customer', 'remote_row')
  registrarMapeamentoIdConfirmado(MOTO_LOCAL, MOTO_REAL, 'reverse_vehicle', 'remote_row')
}

function assertHealed(): void {
  assert.equal(obterUuidPorLocalId(CLI_LOCAL), CUSTOMER_REAL)
  assert.equal(obterUuidPorLocalId(MOTO_LOCAL), MOTO_REAL)
  assert.equal(obterOrigemMapeamentoId(CLI_LOCAL), 'confirmado')
  assert.equal(obterOrigemMapeamentoId(MOTO_LOCAL), 'confirmado')
  assert.notEqual(obterUuidPorLocalId(CLI_LOCAL), HASH_CLI)
  assert.notEqual(obterUuidPorLocalId(MOTO_LOCAL), HASH_MOTO)
}

const lembreteLocal: LembreteCliente = {
  id: 'lem-diag',
  office_id: OFFICE,
  cliente_id: CLI_LOCAL,
  moto_id: MOTO_LOCAL,
  servico: 'revisao',
  data_prevista: '2026-09-20',
  mensagem: 'x',
  personalizado: false,
  created_at: AGORA,
}

const alertaLocal: AlertaComunicacao = {
  id: 'alert-diag',
  office_id: OFFICE,
  local_id: 'alert-diag',
  cliente_id: CLI_LOCAL,
  cliente_nome: 'Cliente',
  moto_id: MOTO_LOCAL,
  tipo: 'revisao',
  motivo: 'revisao',
  status: 'pendente',
  prioridade: 'hoje',
  due_date: '2026-09-20',
  message_text: 'x',
  tipo_mensagem: 'lembrete_revisao',
  created_at: AGORA,
  updated_at: AGORA,
}

const historicoLocal: HistoricoContato = {
  id: 'com-diag',
  office_id: OFFICE,
  data: AGORA,
  cliente_id: CLI_LOCAL,
  cliente_nome: 'Cliente',
  tipo_mensagem: 'lembrete_revisao',
  status: 'enviado_manualmente',
  preview: 'x',
}

const agLocal: Agendamento = {
  id: APT,
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
}

// 1-5) veneno → heal Fase 1 → pulls cross-module → registry final intacto
envenenar()
assert.equal(obterUuidPorLocalId(CLI_LOCAL), HASH_CLI)
heal()
assertHealed()

const lembretePull = await mapearLembreteDoSupabase(
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
assert.equal(lembretePull.cliente_id, CLI_LOCAL)
assert.equal(lembretePull.moto_id, MOTO_LOCAL)

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

await mapearHistoricoDoSupabase(
  {
    id: 'cccccccc-dddd-4eee-8fff-000000000000',
    office_id: OFFICE,
    local_id: 'com-diag',
    client_id: HASH_CLI,
    vehicle_id: HASH_MOTO,
    tipo: 'lembrete_revisao',
    status: 'enviado_manualmente',
    message_text: 'x',
    preview: 'x',
    sent_at: AGORA,
    created_at: AGORA,
  },
  OFFICE
)

repararRegistryFksAposPullAgenda([agLocal], [{ ...agLocal, cliente_id: HASH_CLI, moto_id: HASH_MOTO }])
assertHealed()

// 9) Push usa UUID real, nunca hash
const lembretePush = await mapearLembreteParaSupabase(lembreteLocal, OFFICE)
assert.equal(lembretePush.cliente_id, CUSTOMER_REAL)
assert.equal(lembretePush.moto_id, MOTO_REAL)
assert.notEqual(lembretePush.cliente_id, HASH_CLI)
assert.notEqual(lembretePush.moto_id, HASH_MOTO)

const alertaPush = await mapearAlertaParaSupabase(alertaLocal, OFFICE)
assert.equal(alertaPush.client_id, CUSTOMER_REAL)
assert.equal(alertaPush.vehicle_id, MOTO_REAL)

const historicoPush = await mapearHistoricoParaSupabase(historicoLocal, OFFICE)
assert.equal(historicoPush.client_id, CUSTOMER_REAL)

const agendaPush = await mapearAgendamentoParaSupabase(agLocal, OFFICE)
assert.ok(agendaPush)
assert.equal(agendaPush.customer_id, CUSTOMER_REAL)
assert.equal(agendaPush.motorcycle_id, MOTO_REAL)

// 10) Hash remoto legítimo (entidade nova, row.id = H)
limparRegistroIds()
const CLI_NOVO = 'cli-entidade-nova'
const HASH_NOVO = await lembrarHashDeterministico(CLI_NOVO)
registrarMapeamentoIdProvisorio(CLI_NOVO, HASH_NOVO, 'seed_novo')
assert.equal(obterOrigemMapeamentoId(CLI_NOVO), 'provisorio')
registrarMapeamentoIdConfirmado(CLI_NOVO, HASH_NOVO, 'persistirFase1_customer', 'remote_upsert')
assert.equal(obterUuidPorLocalId(CLI_NOVO), HASH_NOVO)
assert.equal(obterOrigemMapeamentoId(CLI_NOVO), 'confirmado')

// 11) Proteção central: tentativas sem prova remota não desfazem UUID real
envenenar()
heal()
await lembrarHashDeterministico(CLI_LOCAL)
await lembrarHashDeterministico(MOTO_LOCAL)
registrarMapeamentoId(CLI_LOCAL, HASH_CLI, 'lembretes_pull_fk_customer')
registrarMapeamentoId(MOTO_LOCAL, HASH_MOTO, 'lembretes_pull_fk_vehicle')
registrarMapeamentoIdProvisorio(CLI_LOCAL, HASH_CLI, 'lembretes_push')
registrarMapeamentoIdProvisorio(MOTO_LOCAL, HASH_MOTO, 'lembretes_push')
registrarMapeamentos({ [HASH_CLI]: CLI_LOCAL, [HASH_MOTO]: MOTO_LOCAL })
registrarMapeamentoIdConfirmado(CLI_LOCAL, HASH_CLI, 'comunicacao_alerta_fk_customer', 'remote_row')
registrarMapeamentoIdConfirmado(MOTO_LOCAL, HASH_MOTO, 'agenda_fk_remoto', 'remote_row')
assertHealed()

console.log('verificar-registry-fk-cross-module: ok')
