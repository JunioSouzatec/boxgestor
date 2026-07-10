import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase'
import { obterContextoOfficeSupabase } from '@/lib/supabase-office-context'
import { registrarUltimoErroSupabase } from '@/services/supabase-sync/supabase-last-error.storage'
import type { SyncErro } from '@/services/supabase-sync/supabase-sync.types'
import type { MensagemAgendada } from '@/types/mensagem-agendada'

export interface ScheduledMessageRow {
  id: string
  office_id: string
  local_id: string
  status: string
  scheduled_for: string
  sent_at?: string | null
  customer_id?: string | null
  customer_name: string
  phone: string
  vehicle_id?: string | null
  vehicle_description?: string | null
  plate?: string | null
  message_type: string
  message_text: string
  internal_note?: string | null
  service_order_id?: string | null
  service_order_number?: number | null
  origin: string
  responsible_id?: string | null
  responsible_name?: string | null
  revision_type?: string | null
  metadata?: Record<string, unknown> | null
  created_at: string
  updated_at: string
  deleted_at?: string | null
}

async function resolverOfficeUuid(officeIdLocal: string): Promise<string | null> {
  const contexto = await obterContextoOfficeSupabase(officeIdLocal)
  return contexto?.officeUuid ?? null
}

export function mapearMensagemAgendadaParaSupabase(
  msg: MensagemAgendada,
  officeUuid: string,
  uuid: string
): ScheduledMessageRow {
  return {
    id: uuid,
    office_id: officeUuid,
    local_id: msg.id,
    status: msg.status,
    scheduled_for: msg.agendado_para,
    sent_at: msg.enviado_em ?? null,
    customer_id: msg.cliente_id,
    customer_name: msg.cliente_nome,
    phone: msg.telefone,
    vehicle_id: msg.moto_id ?? null,
    vehicle_description: msg.veiculo_descricao ?? null,
    plate: msg.placa ?? null,
    message_type: msg.tipo_mensagem,
    message_text: msg.mensagem,
    internal_note: msg.observacao_interna ?? null,
    service_order_id: msg.ordem_servico_id ?? null,
    service_order_number: msg.ordem_servico_numero ?? null,
    origin: msg.origem,
    responsible_id: msg.responsavel_id ?? null,
    responsible_name: msg.responsavel_nome ?? null,
    revision_type: msg.tipo_revisao ?? null,
    metadata: {},
    created_at: msg.created_at ?? new Date().toISOString(),
    updated_at: new Date().toISOString(),
    deleted_at: msg.status === 'cancelada' ? msg.updated_at ?? new Date().toISOString() : null,
  }
}

export function mapearMensagemAgendadaDoSupabase(
  row: ScheduledMessageRow,
  officeIdLocal: string
): MensagemAgendada {
  return {
    id: row.local_id,
    office_id: officeIdLocal,
    status: row.status as MensagemAgendada['status'],
    agendado_para: row.scheduled_for,
    enviado_em: row.sent_at ?? undefined,
    cliente_id: row.customer_id ?? '',
    cliente_nome: row.customer_name,
    telefone: row.phone,
    moto_id: row.vehicle_id ?? undefined,
    veiculo_descricao: row.vehicle_description ?? undefined,
    placa: row.plate ?? undefined,
    tipo_mensagem: row.message_type as MensagemAgendada['tipo_mensagem'],
    mensagem: row.message_text,
    observacao_interna: row.internal_note ?? undefined,
    ordem_servico_id: row.service_order_id ?? undefined,
    ordem_servico_numero: row.service_order_number ?? undefined,
    origem: row.origin as MensagemAgendada['origem'],
    responsavel_id: row.responsible_id ?? undefined,
    responsavel_nome: row.responsible_name ?? undefined,
    tipo_revisao: row.revision_type ?? undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export async function carregarMensagensAgendadasDoSupabase(
  officeIdLocal: string
): Promise<{ ok: boolean; dados: MensagemAgendada[] | null; erros: SyncErro[] }> {
  if (!isSupabaseConfigured()) {
    return { ok: false, dados: null, erros: [{ entidade: 'Mensagens agendadas', mensagem: 'Não configurado' }] }
  }
  const supabase = getSupabaseClient()
  if (!supabase) {
    return { ok: false, dados: null, erros: [{ entidade: 'Mensagens agendadas', mensagem: 'Sem cliente' }] }
  }
  const officeUuid = await resolverOfficeUuid(officeIdLocal)
  if (!officeUuid) {
    return { ok: false, dados: null, erros: [{ entidade: 'Mensagens agendadas', mensagem: 'Sem office_id' }] }
  }

  const { data, error } = await supabase
    .from('scheduled_messages')
    .select('*')
    .eq('office_id', officeUuid)
    .is('deleted_at', null)
    .order('scheduled_for', { ascending: true })

  if (error) {
    registrarUltimoErroSupabase({ mensagem: error.message, entidade: 'scheduled_messages' })
    return { ok: false, dados: null, erros: [{ entidade: 'Mensagens agendadas', mensagem: error.message }] }
  }

  const lista = ((data ?? []) as ScheduledMessageRow[]).map((row) =>
    mapearMensagemAgendadaDoSupabase(row, officeIdLocal)
  )
  return { ok: true, dados: lista, erros: [] }
}

export async function persistirMensagemAgendadaNoSupabase(
  officeIdLocal: string,
  msg: MensagemAgendada
): Promise<{ ok: boolean; erros: SyncErro[] }> {
  if (!isSupabaseConfigured()) {
    return { ok: false, erros: [{ entidade: 'Mensagens agendadas', mensagem: 'Não configurado' }] }
  }
  const supabase = getSupabaseClient()
  if (!supabase) {
    return { ok: false, erros: [{ entidade: 'Mensagens agendadas', mensagem: 'Sem cliente' }] }
  }
  const officeUuid = await resolverOfficeUuid(officeIdLocal)
  if (!officeUuid) {
    return { ok: false, erros: [{ entidade: 'Mensagens agendadas', mensagem: 'Sem office_id' }] }
  }

  const { localIdParaUuid } = await import('@/lib/local-id-uuid')
  const uuid = await localIdParaUuid(msg.id)
  const row = mapearMensagemAgendadaParaSupabase(msg, officeUuid, uuid)

  const { error } = await supabase
    .from('scheduled_messages')
    .upsert(row as never, { onConflict: 'office_id,local_id' })

  if (error) {
    registrarUltimoErroSupabase({ mensagem: error.message, entidade: 'scheduled_messages' })
    return { ok: false, erros: [{ entidade: 'Mensagens agendadas', mensagem: error.message }] }
  }
  return { ok: true, erros: [] }
}

export async function persistirMensagensAgendadasNoSupabase(
  officeIdLocal: string,
  mensagens: MensagemAgendada[]
): Promise<{ ok: boolean; enviados: number; erros: SyncErro[] }> {
  let enviados = 0
  const erros: SyncErro[] = []
  for (const msg of mensagens) {
    const resultado = await persistirMensagemAgendadaNoSupabase(officeIdLocal, msg)
    if (resultado.ok) enviados++
    else erros.push(...resultado.erros)
  }
  return { ok: erros.length === 0, enviados, erros }
}
