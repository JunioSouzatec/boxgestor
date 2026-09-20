import { dataLocalParaIso } from '@/lib/local-id-uuid'
import { listarIdsLocaisCandidatos, registrarMapeamentoId } from '@/services/supabase-sync/id-registry'
import {
  registrarFallbackPush,
  resolverLocalDeFkRemota,
  resolverUuidParaPush,
} from '@/services/supabase-sync/registry-fk'
import type { HistoricoContato } from '@/types/comunicacao'

export interface CommunicationHistoryRow {
  id: string
  office_id: string
  local_id?: string | null
  client_id?: string | null
  vehicle_id?: string | null
  service_order_id?: string | null
  tipo: string
  status: string
  message_text: string
  preview: string
  responsavel_nome?: string | null
  sent_at: string
  metadata?: Record<string, unknown> | null
  created_at: string
}

interface CommunicationHistoryMetadata {
  cliente_nome?: string
  ordem_servico_numero?: number
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
  caller = 'comunicacao_localDeUuid'
): Promise<string> {
  return resolverLocalDeFkRemota(uuid, candidatos, prefixoFallback, caller)
}

export async function mapearHistoricoParaSupabase(
  registro: HistoricoContato,
  officeUuid: string
): Promise<CommunicationHistoryRow> {
  const id = await uuidDeLocal(registro.id)
  registrarFallbackPush(registro.id, id, 'comunicacao_historico_push')

  const metadata: CommunicationHistoryMetadata = {
    cliente_nome: registro.cliente_nome,
    ordem_servico_numero: registro.ordem_servico_numero,
  }

  return {
    id,
    office_id: officeUuid,
    local_id: registro.id,
    client_id: await uuidOpcional(registro.cliente_id),
    vehicle_id: null,
    service_order_id: await uuidOpcional(registro.ordem_servico_id),
    tipo: registro.tipo_mensagem,
    status: registro.status,
    message_text: registro.mensagem_texto ?? '',
    preview: registro.preview,
    responsavel_nome: registro.responsavel_nome ?? null,
    sent_at: dataLocalParaIso(registro.data),
    metadata: metadata as Record<string, unknown>,
    created_at: dataLocalParaIso(registro.data),
  }
}

export async function mapearHistoricoDoSupabase(
  row: CommunicationHistoryRow,
  officeLocalId: string
): Promise<HistoricoContato> {
  const candidatos = listarIdsLocaisCandidatos(row.local_id ? [row.local_id] : [])
  const localId = row.local_id?.trim()
    ? row.local_id
    : await localDeUuid(row.id, candidatos, 'com', 'comunicacao_historico_pull')
  registrarMapeamentoId(localId, row.id, 'comunicacao_historico_pull')

  const meta = (row.metadata ?? {}) as CommunicationHistoryMetadata
  const clienteUuid = row.client_id?.trim()
  const clienteLocalId = clienteUuid
    ? await localDeUuid(clienteUuid, candidatos, 'cli', 'comunicacao_historico_fk_customer')
    : 'desconhecido'

  const osUuid = row.service_order_id?.trim()
  const osLocalId = osUuid
    ? await localDeUuid(osUuid, candidatos, 'os', 'comunicacao_historico_fk_os')
    : undefined

  return {
    id: localId,
    office_id: officeLocalId,
    data: row.sent_at,
    cliente_id: clienteLocalId,
    cliente_nome: meta.cliente_nome?.trim() || 'Cliente',
    tipo_mensagem: row.tipo as HistoricoContato['tipo_mensagem'],
    ordem_servico_id: osLocalId,
    ordem_servico_numero: meta.ordem_servico_numero,
    status: row.status as HistoricoContato['status'],
    preview: row.preview,
    mensagem_texto: row.message_text || undefined,
    responsavel_nome: row.responsavel_nome ?? undefined,
  }
}
