import { dataLocalParaIso, isUuidFormato } from '@/lib/local-id-uuid'
import {
  sanitizarDataSupabase,
  sanitizarTextoObrigatorioSupabase,
  sanitizarTextoOpcionalSupabase,
} from '@/lib/supabase-sanitize'
import {
  obterLocalIdPorUuid,
  obterUuidPorLocalId,
} from '@/services/supabase-sync/id-registry'
import {
  registrarFallbackPush,
  registrarFkLocalParaRemoto,
  resolverUuidParaPush,
} from '@/services/supabase-sync/registry-fk'
import type { Agendamento, StatusAgendamento } from '@/types'
import {
  ehAgendamentoCadastrado,
  ehAgendamentoRapido,
  guestNameValido,
  guestVehicleValido,
  validarIdentidadeAgendamento,
} from '@/types/agendamento'
import { STATUS_AGENDAMENTO } from '@/types'

export interface AppointmentRow {
  id: string
  office_id: string
  customer_id: string | null
  motorcycle_id: string | null
  guest_name?: string | null
  guest_vehicle?: string | null
  service_order_id: string | null
  appointment_date: string
  appointment_time: string
  service: string
  status: string
  notes: string | null
  created_at: string
  updated_at: string
  deleted_at?: string | null
}

const STATUS_VALIDOS = new Set(STATUS_AGENDAMENTO.map((s) => s.value))

export function timestampAgendamento(ag: Pick<Agendamento, 'updated_at' | 'created_at'>): string {
  return ag.updated_at ?? ag.created_at ?? ''
}

/** Mesmo UUID local e remoto. Hash só para ids legados (ex.: seed ag-001). */
export async function idAgendamentoParaSupabase(localId: string): Promise<string> {
  return resolverUuidParaPush(localId)
}

/** UUID remoto → registry só para id legado → hash só sem registry. */
async function uuidFkObrigatorio(localId: string): Promise<string | null> {
  const trimmed = localId.trim()
  if (!trimmed) return null
  return resolverUuidParaPush(trimmed)
}

async function uuidFkOpcional(localId?: string | null): Promise<string | null> {
  if (!localId?.trim()) return null
  return uuidFkObrigatorio(localId)
}

export function horarioLocalParaSupabase(horario: string): string {
  const t = horario.trim()
  if (/^\d{2}:\d{2}:\d{2}/.test(t)) return t.slice(0, 8)
  if (/^\d{2}:\d{2}$/.test(t)) return `${t}:00`
  return t || '09:00:00'
}

export function horarioSupabaseParaLocal(horario: string): string {
  const t = horario.trim()
  const match = t.match(/^(\d{2}:\d{2})/)
  return match?.[1] ?? t
}

function sanitizarStatusAgendamento(valor: string | undefined): StatusAgendamento {
  const t = valor?.trim()
  if (t && STATUS_VALIDOS.has(t as StatusAgendamento)) return t as StatusAgendamento
  return 'agendado'
}

export async function mapearAgendamentoParaSupabase(
  agendamento: Agendamento,
  officeUuid: string
): Promise<Record<string, unknown> | null> {
  if (validarIdentidadeAgendamento(agendamento)) return null

  const id = await idAgendamentoParaSupabase(agendamento.id)
  if (!isUuidFormato(agendamento.id.trim())) {
    registrarFallbackPush(agendamento.id, id, 'agenda_id_legado')
  }

  const data = sanitizarDataSupabase(agendamento.data)
  if (!data) return null

  const serviceOrderId = await uuidFkOpcional(agendamento.ordem_servico_id)
  const base = {
    id,
    office_id: officeUuid,
    service_order_id: serviceOrderId,
    appointment_date: data,
    appointment_time: horarioLocalParaSupabase(agendamento.horario),
    service: sanitizarTextoObrigatorioSupabase(agendamento.servico, 'Agendamento'),
    status: sanitizarStatusAgendamento(agendamento.status),
    notes: sanitizarTextoOpcionalSupabase(agendamento.observacoes),
    created_at: dataLocalParaIso(agendamento.created_at),
    updated_at: dataLocalParaIso(agendamento.updated_at ?? agendamento.created_at),
    deleted_at: agendamento.deleted_at ? dataLocalParaIso(agendamento.deleted_at) : null,
  }

  if (ehAgendamentoRapido(agendamento)) {
    return {
      ...base,
      customer_id: null,
      motorcycle_id: null,
      guest_name: guestNameValido(agendamento),
      guest_vehicle: guestVehicleValido(agendamento),
    }
  }

  if (!ehAgendamentoCadastrado(agendamento)) return null

  const customerId = await uuidFkObrigatorio(agendamento.cliente_id!)
  const motorcycleId = await uuidFkObrigatorio(agendamento.moto_id!)
  if (!customerId || !motorcycleId) return null

  return {
    ...base,
    customer_id: customerId,
    motorcycle_id: motorcycleId,
    guest_name: null,
    guest_vehicle: null,
  }
}

/** UUID da row remota é a fonte da verdade. Não registra UUID → o mesmo UUID. */
export function registrarFkAgendaLocalParaRemoto(
  localId: string | null | undefined,
  remotoUuid: string | null | undefined
): void {
  registrarFkLocalParaRemoto(localId, remotoUuid, 'agenda_fk_remoto')
}

function resolverFkAgendaDoRemoto(remotoUuid: string | null | undefined): string | undefined {
  if (!remotoUuid?.trim()) return undefined
  const remoto = remotoUuid.trim()
  const local = obterLocalIdPorUuid(remoto) ?? remoto
  registrarFkAgendaLocalParaRemoto(local, remoto)
  return local
}

export function uuidRemotoFkAgenda(id: string | null | undefined): string | undefined {
  const t = id?.trim()
  if (!t) return undefined
  if (isUuidFormato(t)) return t
  return obterUuidPorLocalId(t)
}

/** Repara local → UUID remoto após o merge, se o appointment local vencer o LWW. */
export function repararRegistryFksAposPullAgenda(
  mesclados: Agendamento[],
  remotosMapeados: Agendamento[]
): void {
  const remotoPorId = new Map(remotosMapeados.map((ag) => [ag.id, ag]))
  for (const ag of mesclados) {
    if (ehAgendamentoRapido(ag)) continue
    const remoto = remotoPorId.get(ag.id)
    if (!remoto || ehAgendamentoRapido(remoto)) continue
    registrarFkAgendaLocalParaRemoto(ag.cliente_id, uuidRemotoFkAgenda(remoto.cliente_id))
    registrarFkAgendaLocalParaRemoto(ag.moto_id, uuidRemotoFkAgenda(remoto.moto_id))
    registrarFkAgendaLocalParaRemoto(
      ag.ordem_servico_id,
      uuidRemotoFkAgenda(remoto.ordem_servico_id)
    )
  }
}

export function mapearAgendamentoDoSupabase(
  row: AppointmentRow,
  officeLocalId: string
): Agendamento {
  const localId = obterLocalIdPorUuid(row.id) ?? row.id
  const guestNome = row.guest_name?.trim() || null
  const guestVeiculo = row.guest_vehicle?.trim() || null
  const customerRemoto = row.customer_id?.trim() || null
  const motorcycleRemoto = row.motorcycle_id?.trim() || null

  const base = {
    id: localId,
    oficina_id: officeLocalId,
    office_id: officeLocalId,
    data: sanitizarDataSupabase(row.appointment_date) ?? row.appointment_date.slice(0, 10),
    horario: horarioSupabaseParaLocal(row.appointment_time),
    servico: row.service,
    status: sanitizarStatusAgendamento(row.status),
    observacoes: row.notes ?? undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at ?? null,
  }

  // Modo rápido: guest preenchido e FKs ausentes — sem registry.
  if (guestNome && guestVeiculo && !customerRemoto && !motorcycleRemoto) {
    const osId = resolverFkAgendaDoRemoto(row.service_order_id)
    return {
      ...base,
      cliente_id: null,
      moto_id: null,
      guest_name: guestNome,
      guest_vehicle: guestVeiculo,
      ordem_servico_id: osId,
    }
  }

  const clienteId = resolverFkAgendaDoRemoto(row.customer_id)
  const motoId = resolverFkAgendaDoRemoto(row.motorcycle_id)
  const osId = resolverFkAgendaDoRemoto(row.service_order_id)

  return {
    ...base,
    cliente_id: clienteId ?? row.customer_id,
    moto_id: motoId ?? row.motorcycle_id,
    guest_name: null,
    guest_vehicle: null,
    ordem_servico_id: osId,
  }
}
