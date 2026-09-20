import { dataLocalParaIso } from '@/lib/local-id-uuid'
import { listarIdsLocaisCandidatos, registrarMapeamentoId } from '@/services/supabase-sync/id-registry'
import {
  registrarFallbackPush,
  resolverLocalDeFkRemota,
  resolverUuidParaPush,
} from '@/services/supabase-sync/registry-fk'
import type { AlertaComunicacao } from '@/types/alerta-comunicacao'
import type { TipoMensagem } from '@/types/comunicacao'

export interface CommunicationAlertRow {
  id: string
  office_id: string
  local_id?: string | null
  client_id?: string | null
  vehicle_id?: string | null
  service_order_id?: string | null
  tipo: string
  motivo: string
  status: string
  prioridade: string
  due_date: string
  message_text: string
  metadata?: Record<string, unknown> | null
  created_at: string
  updated_at: string
  resolved_at?: string | null
}

interface AlertaMetadata {
  cliente_nome?: string
  telefone?: string
  moto_descricao?: string
  placa?: string
  ordem_servico_numero?: number
  lembrete_id?: string
  agendamento_id?: string
  mensagem_agendada_id?: string
  tipo_mensagem?: TipoMensagem
  adiado_ate?: string
}

async function uuidDeLocal(localId: string): Promise<string> {
  return resolverUuidParaPush(localId)
}

async function uuidOpcional(localId?: string | null): Promise<string | null> {
  if (!localId?.trim()) return null
  return uuidDeLocal(localId)
}

async function localDeUuid(
  uuid: string,
  candidatos: string[],
  prefixoFallback?: string,
  caller = 'comunicacao_alerta_localDeUuid'
): Promise<string> {
  return resolverLocalDeFkRemota(uuid, candidatos, prefixoFallback, caller)
}

export async function mapearAlertaParaSupabase(
  alerta: AlertaComunicacao,
  officeUuid: string
): Promise<CommunicationAlertRow> {
  const id = await uuidDeLocal(alerta.id)
  registrarFallbackPush(alerta.id, id, 'comunicacao_alerta_push')

  const metadata: AlertaMetadata = {
    cliente_nome: alerta.cliente_nome,
    telefone: alerta.telefone,
    moto_descricao: alerta.moto_descricao,
    placa: alerta.placa,
    ordem_servico_numero: alerta.ordem_servico_numero,
    lembrete_id: alerta.lembrete_id,
    agendamento_id: alerta.agendamento_id,
    mensagem_agendada_id: alerta.mensagem_agendada_id,
    tipo_mensagem: alerta.tipo_mensagem,
    adiado_ate: alerta.adiado_ate,
  }

  return {
    id,
    office_id: officeUuid,
    local_id: alerta.local_id,
    client_id: await uuidOpcional(alerta.cliente_id),
    vehicle_id: await uuidOpcional(alerta.moto_id),
    service_order_id: await uuidOpcional(alerta.ordem_servico_id),
    tipo: alerta.tipo,
    motivo: alerta.motivo,
    status: alerta.status,
    prioridade: alerta.prioridade,
    due_date: alerta.due_date.slice(0, 10),
    message_text: alerta.message_text,
    metadata: metadata as Record<string, unknown>,
    created_at: dataLocalParaIso(alerta.created_at),
    updated_at: dataLocalParaIso(alerta.updated_at),
    resolved_at: alerta.resolved_at ? dataLocalParaIso(alerta.resolved_at) : null,
  }
}

export async function mapearAlertaDoSupabase(
  row: CommunicationAlertRow,
  officeLocalId: string
): Promise<AlertaComunicacao> {
  const candidatos = listarIdsLocaisCandidatos(
    [row.local_id, (row.metadata as AlertaMetadata)?.lembrete_id].filter(Boolean) as string[]
  )

  const appId = await localDeUuid(row.id, candidatos, 'alert', 'comunicacao_alerta_pull')
  registrarMapeamentoId(appId, row.id, 'comunicacao_alerta_pull')

  const localIdDedup = row.local_id?.trim() ?? `alert-${appId}`

  const meta = (row.metadata ?? {}) as AlertaMetadata

  const clienteUuid = row.client_id?.trim()
  const clienteLocalId = clienteUuid
    ? await localDeUuid(clienteUuid, candidatos, 'cli', 'comunicacao_alerta_fk_customer')
    : 'desconhecido'

  const motoUuid = row.vehicle_id?.trim()
  const motoLocalId = motoUuid
    ? await localDeUuid(motoUuid, candidatos, 'moto', 'comunicacao_alerta_fk_vehicle')
    : undefined

  const osUuid = row.service_order_id?.trim()
  const osLocalId = osUuid
    ? await localDeUuid(osUuid, candidatos, 'os', 'comunicacao_alerta_fk_os')
    : undefined

  return {
    id: appId,
    office_id: officeLocalId,
    local_id: localIdDedup,
    cliente_id: clienteLocalId,
    cliente_nome: meta.cliente_nome?.trim() || 'Cliente',
    telefone: meta.telefone,
    moto_id: motoLocalId,
    moto_descricao: meta.moto_descricao,
    placa: meta.placa,
    ordem_servico_id: osLocalId,
    ordem_servico_numero: meta.ordem_servico_numero,
    lembrete_id: meta.lembrete_id,
    agendamento_id: meta.agendamento_id,
    mensagem_agendada_id: meta.mensagem_agendada_id,
    tipo: row.tipo as AlertaComunicacao['tipo'],
    motivo: row.motivo,
    status: row.status as AlertaComunicacao['status'],
    prioridade: row.prioridade as AlertaComunicacao['prioridade'],
    due_date: row.due_date.slice(0, 10),
    message_text: row.message_text,
    tipo_mensagem: (meta.tipo_mensagem ?? 'lembrete_revisao') as TipoMensagem,
    adiado_ate: meta.adiado_ate,
    created_at: row.created_at,
    updated_at: row.updated_at,
    resolved_at: row.resolved_at ?? undefined,
  }
}
