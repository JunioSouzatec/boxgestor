/**
 * UPDATE pontual de cliente → Supabase customers.
 * Não altera estoque, OS, pagamentos nem o sync fase1 geral.
 */
import { getCraftPersistenceMode, getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase'
import { obterContextoOfficeSupabase } from '@/lib/supabase-office-context'
import { atualizarContagemPendenciasAtivas } from '@/services/persistence-status.events'
import { obterUuidPorLocalId, registrarMapeamentoId } from '@/services/supabase-sync/id-registry'
import { mapearCustomer, SyncIdMap } from '@/services/supabase-sync/mappers'
import { syncQueueService } from '@/services/sync/sync-queue.service'
import type { Cliente } from '@/types/cliente'

export interface ResultadoPublicacaoCliente {
  ok: boolean
  remoto: boolean
  pendente: boolean
  erro?: string
  customer_id?: string
}

function logClienteUpdate(payload: Record<string, unknown>): void {
  console.info('[BoxGestor Cliente][update]', payload)
}

function statusFilaCliente(officeId: string): {
  pendentes: number
  clientesPendentes: number
} {
  const pendentes = syncQueueService.listar(officeId, 'pendente')
  const clientes = pendentes.filter((i) => i.entidade === 'cliente')
  return {
    pendentes: pendentes.length,
    clientesPendentes: clientes.length,
  }
}

function camposAlterados(
  anterior: Cliente | undefined,
  atual: Cliente,
  patch: Partial<Cliente>
): Array<{ campo: string; valor_antigo: unknown; valor_novo: unknown }> {
  const chaves = Object.keys(patch) as (keyof Cliente)[]
  const out: Array<{ campo: string; valor_antigo: unknown; valor_novo: unknown }> = []
  for (const campo of chaves) {
    if (campo === 'id' || campo === 'oficina_id' || campo === 'office_id') continue
    const antigo = anterior?.[campo]
    const novo = atual[campo]
    if (antigo !== novo) {
      out.push({ campo: String(campo), valor_antigo: antigo ?? null, valor_novo: novo ?? null })
    }
  }
  return out
}

function enfileirarClienteUpdate(officeId: string, cliente: Cliente): void {
  syncQueueService.enfileirar({
    office_id: officeId,
    tipo_acao: 'update',
    entidade: 'cliente',
    entidade_id: cliente.id,
    payload: {
      cliente_id: cliente.id,
      nome: cliente.nome,
      telefone: cliente.telefone,
    },
  })
  atualizarContagemPendenciasAtivas(officeId)
}

function clienteModoSupabase(): boolean {
  return getCraftPersistenceMode() === 'supabase' && isSupabaseConfigured()
}

/**
 * Publica UPDATE de um cliente em `customers` imediatamente.
 * Offline/falha → fila entidade `cliente` (retry no processarFila).
 */
export async function publicarClienteAtualizado(
  officeId: string,
  cliente: Cliente,
  opcoes?: { anterior?: Cliente; patch?: Partial<Cliente> }
): Promise<ResultadoPublicacaoCliente> {
  const alteracoes = camposAlterados(opcoes?.anterior, cliente, opcoes?.patch ?? cliente)
  const baseLog = {
    customer_id_local: cliente.id,
    office_id: officeId,
    campos_alterados: alteracoes,
    telefone: cliente.telefone,
    nome: cliente.nome,
  }

  logClienteUpdate({
    fase: 'inicio',
    ...baseLog,
    online: typeof navigator !== 'undefined' ? navigator.onLine : null,
    modo_supabase: clienteModoSupabase(),
    status_fila: statusFilaCliente(officeId),
  })

  if (!clienteModoSupabase()) {
    logClienteUpdate({
      fase: 'modo_local_sem_remoto',
      ...baseLog,
      status_fila: statusFilaCliente(officeId),
    })
    return { ok: true, remoto: false, pendente: false }
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    enfileirarClienteUpdate(officeId, cliente)
    logClienteUpdate({
      fase: 'offline_pendencia',
      ...baseLog,
      tentativa_supabase: false,
      entrou_fila: true,
      status_fila: statusFilaCliente(officeId),
    })
    return { ok: true, remoto: false, pendente: true }
  }

  const contexto = await obterContextoOfficeSupabase(officeId)
  const officeUuid = contexto?.officeUuid
  if (!officeUuid) {
    enfileirarClienteUpdate(officeId, cliente)
    logClienteUpdate({
      fase: 'sem_office_uuid',
      ...baseLog,
      tentativa_supabase: false,
      erro: 'Sem office_id no perfil',
      entrou_fila: true,
      status_fila: statusFilaCliente(officeId),
    })
    return {
      ok: false,
      remoto: false,
      pendente: true,
      erro: 'Sem office_id no perfil',
    }
  }

  const supabase = getSupabaseClient()
  if (!supabase) {
    enfileirarClienteUpdate(officeId, cliente)
    logClienteUpdate({
      fase: 'sem_cliente_supabase',
      ...baseLog,
      tentativa_supabase: false,
      erro: 'Cliente Supabase indisponível',
      entrou_fila: true,
      status_fila: statusFilaCliente(officeId),
    })
    return {
      ok: false,
      remoto: false,
      pendente: true,
      erro: 'Cliente Supabase indisponível',
    }
  }

  const ids = new SyncIdMap()
  const uuidConhecido = obterUuidPorLocalId(cliente.id)
  if (uuidConhecido) ids.seed(cliente.id, uuidConhecido)

  // Se já existe no Supabase por local_id mapeado ou busca por id
  if (!uuidConhecido) {
    const uuidDerivado = await ids.uuid(cliente.id)
    const { data: porId } = await supabase
      .from('customers')
      .select('id')
      .eq('office_id', officeUuid)
      .eq('id', uuidDerivado)
      .maybeSingle()
    if (porId && (porId as { id: string }).id) {
      ids.seed(cliente.id, (porId as { id: string }).id)
    }
  }

  const row = await mapearCustomer(cliente, officeUuid, ids)
  // Garantir timestamp ISO preciso (não só data) para o merge LWW no outro device
  const agora = new Date().toISOString()
  row.updated_at = agora

  logClienteUpdate({
    fase: 'tentativa_supabase',
    ...baseLog,
    customer_id: row.id,
    office_uuid: officeUuid,
    chamada: 'upsert customers',
    payload: {
      name: row.name,
      phone: row.phone,
      cpf: row.cpf,
      address: row.address,
      notes: row.notes,
      updated_at: row.updated_at,
    },
    status_fila: statusFilaCliente(officeId),
  })

  const { data, error } = await supabase
    .from('customers')
    .upsert(row as never, { onConflict: 'id' })
    .select('id, name, phone, updated_at')
    .maybeSingle()

  if (error) {
    enfileirarClienteUpdate(officeId, cliente)
    logClienteUpdate({
      fase: 'erro_supabase',
      ...baseLog,
      customer_id: row.id,
      tentativa_supabase: true,
      resposta_supabase: null,
      erro: error.message,
      erro_code: error.code,
      entrou_fila: true,
      status_fila: statusFilaCliente(officeId),
    })
    return {
      ok: false,
      remoto: false,
      pendente: true,
      erro: error.message,
      customer_id: String(row.id),
    }
  }

  const remoto = data as { id: string; name: string; phone: string; updated_at: string } | null
  if (!remoto) {
    enfileirarClienteUpdate(officeId, cliente)
    logClienteUpdate({
      fase: 'upsert_sem_linha',
      ...baseLog,
      customer_id: row.id,
      tentativa_supabase: true,
      resposta_supabase: null,
      erro: 'upsert ok mas SELECT não retornou linha',
      entrou_fila: true,
      status_fila: statusFilaCliente(officeId),
    })
    return {
      ok: false,
      remoto: false,
      pendente: true,
      erro: 'Cliente não confirmado no Supabase após upsert',
      customer_id: String(row.id),
    }
  }

  registrarMapeamentoId(cliente.id, remoto.id)
  syncQueueService.marcarSincronizadosPorEntidade(officeId, 'cliente', cliente.id)
  atualizarContagemPendenciasAtivas(officeId)

  logClienteUpdate({
    fase: 'ok_supabase',
    ...baseLog,
    customer_id: remoto.id,
    tentativa_supabase: true,
    resposta_supabase: {
      id: remoto.id,
      name: remoto.name,
      phone: remoto.phone,
      updated_at: remoto.updated_at,
    },
    erro: null,
    entrou_fila: false,
    status_fila: statusFilaCliente(officeId),
  })

  return {
    ok: true,
    remoto: true,
    pendente: false,
    customer_id: remoto.id,
  }
}

/** Reenvia clientes com UPDATE pendente na fila. */
export async function processarFilaClientesPendente(officeId: string): Promise<boolean> {
  if (!clienteModoSupabase()) return true
  if (typeof navigator !== 'undefined' && !navigator.onLine) return false

  const pendentes = syncQueueService
    .listar(officeId, 'pendente')
    .filter((i) => i.entidade === 'cliente')

  if (pendentes.length === 0) return true

  const { localCraftRepository } = await import('@/services/repository/local.repository')
  const local = localCraftRepository.carregar(officeId)
  let algumOk = false

  for (const item of pendentes) {
    const cliente = local.clientes.find((c) => c.id === item.entidade_id)
    if (!cliente) {
      syncQueueService.marcarSincronizado(item.id)
      algumOk = true
      continue
    }
    const r = await publicarClienteAtualizado(officeId, cliente, {
      patch: { telefone: cliente.telefone, nome: cliente.nome },
    })
    if (r.ok && r.remoto) {
      syncQueueService.marcarSincronizado(item.id)
      algumOk = true
    } else if (r.erro) {
      syncQueueService.marcarErro(item.id, r.erro)
    }
  }

  atualizarContagemPendenciasAtivas(officeId)
  return algumOk || pendentes.length === 0
}
