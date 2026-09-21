/**
 * Agendamento rápido (guest): CREATE/UPDATE/DELETE/display/registry/offline.
 * Executar: npx tsx --tsconfig tsconfig.app.json scripts/verificar-agenda-guest.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  mapearAgendamentoDoSupabase,
  mapearAgendamentoParaSupabase,
  type AppointmentRow,
} from '../src/services/agenda/agenda-mappers.ts'
import {
  rotuloClienteAgenda,
  rotuloVeiculoAgenda,
} from '../src/services/agenda/agenda-display-refs.ts'
import {
  limparRegistroIds,
  obterUuidPorLocalId,
  registrarMapeamentoId,
} from '../src/services/supabase-sync/id-registry.ts'
import {
  ehAgendamentoCadastrado,
  ehAgendamentoRapido,
  normalizarIdentidadeAgendamento,
  validarIdentidadeAgendamento,
  type Agendamento,
} from '../src/types/agendamento.ts'

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
const CUSTOMER = '14175b13-f669-5d37-b081-0d1a32742359'
const MOTO = '0e08aaea-a07d-53b2-bc38-5ec87899c067'
const APT_GUEST = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee1'
const APT_REG = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee2'

function reset(): void {
  limparRegistroIds()
  mem.clear()
}

function guestBase(parcial: Partial<Agendamento> = {}): Agendamento {
  return {
    id: APT_GUEST,
    oficina_id: OFFICE,
    office_id: OFFICE,
    data: '2026-09-20',
    horario: '10:30',
    cliente_id: null,
    moto_id: null,
    guest_name: 'João',
    guest_vehicle: 'Gol 1.6 branco',
    servico: 'Revisão rápida',
    status: 'agendado',
    created_at: '2026-09-20T12:00:00.000Z',
    updated_at: '2026-09-20T12:00:00.000Z',
    deleted_at: null,
    ...parcial,
  }
}

function registradoBase(parcial: Partial<Agendamento> = {}): Agendamento {
  return {
    id: APT_REG,
    oficina_id: OFFICE,
    office_id: OFFICE,
    data: '2026-09-20',
    horario: '11:00',
    cliente_id: CUSTOMER,
    moto_id: MOTO,
    guest_name: null,
    guest_vehicle: null,
    servico: 'Troca de óleo',
    status: 'agendado',
    created_at: '2026-09-20T12:00:00.000Z',
    updated_at: '2026-09-20T12:00:00.000Z',
    deleted_at: null,
    ...parcial,
  }
}

// --- CASO A — CREATE guest ---
reset()
{
  const local = guestBase()
  assert.equal(ehAgendamentoRapido(local), true)
  assert.equal(validarIdentidadeAgendamento(local), null)
  const row = await mapearAgendamentoParaSupabase(local, OFFICE)
  assert.ok(row)
  assert.equal(row!.customer_id, null)
  assert.equal(row!.motorcycle_id, null)
  assert.equal(row!.guest_name, 'João')
  assert.equal(row!.guest_vehicle, 'Gol 1.6 branco')
  assert.equal(obterUuidPorLocalId(CUSTOMER), undefined)
}

// --- CASO B — DISPLAY guest ---
{
  const ag = guestBase()
  assert.equal(rotuloClienteAgenda(ag.cliente_id, [], ag), 'João')
  assert.equal(rotuloVeiculoAgenda(ag.moto_id, [], ag), 'Gol 1.6 branco')
  assert.notEqual(rotuloClienteAgenda(ag.cliente_id, [], ag), '—')
  assert.notEqual(rotuloVeiculoAgenda(ag.moto_id, [], ag), '—')
}

// --- CASO C — UPDATE guest (preserva modo) ---
{
  const atualizado = guestBase({
    guest_name: 'Maria',
    guest_vehicle: 'Civic prata',
    servico: 'Alinhamento',
    updated_at: '2026-09-20T13:00:00.000Z',
  })
  assert.equal(ehAgendamentoRapido(atualizado), true)
  const row = await mapearAgendamentoParaSupabase(atualizado, OFFICE)
  assert.ok(row)
  assert.equal(row!.customer_id, null)
  assert.equal(row!.motorcycle_id, null)
  assert.equal(row!.guest_name, 'Maria')
  assert.equal(row!.guest_vehicle, 'Civic prata')
  assert.equal(row!.service, 'Alinhamento')
}

// --- CASO D — DELETE/tombstone guest ---
{
  const tomb = guestBase({
    deleted_at: '2026-09-20T14:00:00.000Z',
    updated_at: '2026-09-20T14:00:00.000Z',
  })
  assert.equal(ehAgendamentoRapido(tomb), true)
  const row = await mapearAgendamentoParaSupabase(tomb, OFFICE)
  assert.ok(row)
  assert.equal(row!.customer_id, null)
  assert.equal(row!.motorcycle_id, null)
  assert.equal(row!.guest_name, 'João')
  assert.equal(row!.guest_vehicle, 'Gol 1.6 branco')
  assert.ok(row!.deleted_at)
}

// --- CASO E — REGISTRADO regressão ---
reset()
{
  const local = registradoBase()
  assert.equal(ehAgendamentoCadastrado(local), true)
  const row = await mapearAgendamentoParaSupabase(local, OFFICE)
  assert.ok(row)
  assert.equal(row!.customer_id, CUSTOMER)
  assert.equal(row!.motorcycle_id, MOTO)
  assert.equal(row!.guest_name, null)
  assert.equal(row!.guest_vehicle, null)
}

// --- CASO F — inválido (sem FK e sem guest) ---
{
  const invalido = guestBase({
    guest_name: null,
    guest_vehicle: null,
    cliente_id: null,
    moto_id: null,
  })
  assert.ok(validarIdentidadeAgendamento(invalido))
  assert.equal(await mapearAgendamentoParaSupabase(invalido, OFFICE), null)
}

// --- CASO G — híbrido inválido ---
{
  const hibrido = guestBase({
    cliente_id: CUSTOMER,
    moto_id: MOTO,
    guest_name: 'João',
    guest_vehicle: 'Gol 1.6 branco',
  })
  const err = validarIdentidadeAgendamento(hibrido)
  assert.ok(err)
  assert.match(err!, /misturar|rápido|cadastrado/i)
  assert.equal(await mapearAgendamentoParaSupabase(hibrido, OFFICE), null)
}

// --- CASO H — registry: guest NÃO chama registrarMapeamentoId ---
reset()
{
  const mappersSrc = readFileSync(
    new URL('../src/services/agenda/agenda-mappers.ts', import.meta.url),
    'utf8'
  )
  // Pull guest: bloco sem resolverFkAgendaDoRemoto para customer/motorcycle
  assert.match(
    mappersSrc,
    /if \(guestNome && guestVeiculo && !customerRemoto && !motorcycleRemoto\)[\s\S]*?cliente_id: null[\s\S]*?moto_id: null/
  )

  const remote: AppointmentRow = {
    id: APT_GUEST,
    office_id: OFFICE,
    customer_id: null,
    motorcycle_id: null,
    guest_name: 'João',
    guest_vehicle: 'Gol 1.6 branco',
    service_order_id: null,
    appointment_date: '2026-09-20',
    appointment_time: '10:30:00',
    service: 'Revisão rápida',
    status: 'agendado',
    notes: null,
    created_at: '2026-09-20T12:00:00.000Z',
    updated_at: '2026-09-20T12:00:00.000Z',
    deleted_at: null,
  }
  const pulled = mapearAgendamentoDoSupabase(remote, OFFICE)
  assert.equal(ehAgendamentoRapido(pulled), true)
  assert.equal(pulled.guest_name, 'João')
  assert.equal(pulled.guest_vehicle, 'Gol 1.6 branco')
  assert.equal(pulled.cliente_id, null)
  assert.equal(pulled.moto_id, null)
  // Sem mapping inventado para guest
  assert.equal(obterUuidPorLocalId('João'), undefined)
}

// --- CASO I — offline/retry: serialização preserva guest ---
{
  const local = guestBase()
  const json = JSON.stringify(local)
  const reloaded = JSON.parse(json) as Agendamento
  const normalizado = normalizarIdentidadeAgendamento(reloaded, 'rapido')
  assert.equal(ehAgendamentoRapido(normalizado), true)
  const row = await mapearAgendamentoParaSupabase(normalizado, OFFICE)
  assert.ok(row)
  assert.equal(row!.customer_id, null)
  assert.equal(row!.motorcycle_id, null)
  assert.equal(row!.guest_name, 'João')
  assert.equal(row!.guest_vehicle, 'Gol 1.6 branco')
}

// UI: troca de modo limpa campos opostos; edição preserva modo
{
  const pageSrc = readFileSync(
    new URL('../src/pages/AgendaPage.tsx', import.meta.url),
    'utf8'
  )
  assert.match(pageSrc, /Tipo de agendamento/)
  assert.match(pageSrc, /Agendamento rápido/)
  assert.match(pageSrc, /Cliente cadastrado/)
  assert.match(pageSrc, /trocarModoForm/)
  assert.match(pageSrc, /guest_name: '', guest_vehicle: ''/)
  assert.match(pageSrc, /cliente_id: '', moto_id: ''/)
  assert.match(pageSrc, /disabled=\{Boolean\(editando\)\}/)
  assert.match(pageSrc, /ehAgendamentoRapido\(ag\)/)
}

// Migration local presente e defensiva
{
  const mig = readFileSync(
    new URL(
      '../supabase/migrations/20260920220000_appointments_guest_identity.sql',
      import.meta.url
    ),
    'utf8'
  )
  assert.match(mig, /guest_name/)
  assert.match(mig, /guest_vehicle/)
  assert.match(mig, /DROP NOT NULL/)
  assert.match(mig, /appointments_identity_mode_check/)
  assert.match(mig, /ADD COLUMN IF NOT EXISTS/)
  const sqlSemComentarios = mig
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('--'))
    .join('\n')
  assert.doesNotMatch(
    sqlSemComentarios,
    /replica identity|publication|realtime|ENABLE ROW LEVEL/i
  )
}

// Registry confirmado ainda funciona para cadastrado (não poluir com guest)
reset()
registrarMapeamentoId('cli-local-x', CUSTOMER)
assert.equal(obterUuidPorLocalId('cli-local-x'), CUSTOMER)

console.log('verificar-agenda-guest: OK (A–I)')
