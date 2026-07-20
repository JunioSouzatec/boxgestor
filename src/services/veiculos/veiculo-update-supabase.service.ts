/**
 * CREATE/UPDATE pontual de veículo → Supabase motorcycles.
 * Não altera estoque, OS, pagamentos nem o sync fase1 geral.
 */
import { getCraftPersistenceMode, getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase'
import { obterContextoOfficeSupabase } from '@/lib/supabase-office-context'
import { atualizarContagemPendenciasAtivas } from '@/services/persistence-status.events'
import { obterUuidPorLocalId, registrarMapeamentoId } from '@/services/supabase-sync/id-registry'
import { mapearMotorcycle, SyncIdMap } from '@/services/supabase-sync/mappers'
import { syncQueueService } from '@/services/sync/sync-queue.service'
import type { Moto } from '@/types/moto'

export interface ResultadoPublicacaoVeiculo {
  ok: boolean
  remoto: boolean
  pendente: boolean
  erro?: string
  motorcycle_id?: string
}

function logVeiculoSync(fase: string, payload: Record<string, unknown>): void {
  console.info(`[BoxGestor Veiculo][${fase}]`, payload)
}

function statusFilaVeiculo(officeId: string) {
  const pendentes = syncQueueService.listar(officeId, 'pendente')
  const motos = pendentes.filter((i) => i.entidade === 'moto')
  return { pendentes: pendentes.length, veiculosPendentes: motos.length }
}

function veiculoModoSupabase(): boolean {
  return getCraftPersistenceMode() === 'supabase' && isSupabaseConfigured()
}

function enfileirarVeiculo(
  officeId: string,
  moto: Moto,
  tipoAcao: 'create' | 'update'
): void {
  syncQueueService.enfileirar({
    office_id: officeId,
    tipo_acao: tipoAcao,
    entidade: 'moto',
    entidade_id: moto.id,
    payload: {
      moto_id: moto.id,
      placa: moto.placa,
      modelo: moto.modelo,
      cliente_id: moto.cliente_id,
    },
  })
  atualizarContagemPendenciasAtivas(officeId)
}

async function publicarVeiculoNoSupabase(
  officeId: string,
  moto: Moto,
  tipoAcao: 'create' | 'update',
  opcoes?: { anterior?: Moto; patch?: Partial<Moto> }
): Promise<ResultadoPublicacaoVeiculo> {
  const alteracoes: Array<{ campo: string; valor_antigo: unknown; valor_novo: unknown }> = []
  if (opcoes?.patch && opcoes.anterior) {
    for (const campo of Object.keys(opcoes.patch) as (keyof Moto)[]) {
      if (campo === 'id' || campo === 'oficina_id' || campo === 'office_id') continue
      const antigo = opcoes.anterior[campo]
      const novo = moto[campo]
      if (antigo !== novo) {
        alteracoes.push({
          campo: String(campo),
          valor_antigo: antigo ?? null,
          valor_novo: novo ?? null,
        })
      }
    }
  }

  const baseLog = {
    moto_id_local: moto.id,
    office_id: officeId,
    placa: moto.placa,
    modelo: moto.modelo,
    cliente_id: moto.cliente_id,
    campos_alterados: alteracoes,
    tipo_acao: tipoAcao,
  }

  logVeiculoSync(tipoAcao === 'create' ? 'create' : 'update', {
    fase: 'inicio',
    ...baseLog,
    online: typeof navigator !== 'undefined' ? navigator.onLine : null,
    modo_supabase: veiculoModoSupabase(),
    status_fila: statusFilaVeiculo(officeId),
  })

  if (!veiculoModoSupabase()) {
    logVeiculoSync(tipoAcao, {
      fase: 'modo_local_sem_remoto',
      ...baseLog,
      status_fila: statusFilaVeiculo(officeId),
    })
    return { ok: true, remoto: false, pendente: false }
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    enfileirarVeiculo(officeId, moto, tipoAcao)
    logVeiculoSync(tipoAcao, {
      fase: 'offline_pendencia',
      ...baseLog,
      tentativa_supabase: false,
      entrou_fila: true,
      status_fila: statusFilaVeiculo(officeId),
    })
    return { ok: true, remoto: false, pendente: true }
  }

  const contexto = await obterContextoOfficeSupabase(officeId)
  const officeUuid = contexto?.officeUuid
  if (!officeUuid) {
    enfileirarVeiculo(officeId, moto, tipoAcao)
    logVeiculoSync(tipoAcao, {
      fase: 'sem_office_uuid',
      ...baseLog,
      erro: 'Sem office_id no perfil',
      entrou_fila: true,
      status_fila: statusFilaVeiculo(officeId),
    })
    return { ok: false, remoto: false, pendente: true, erro: 'Sem office_id no perfil' }
  }

  const supabase = getSupabaseClient()
  if (!supabase) {
    enfileirarVeiculo(officeId, moto, tipoAcao)
    logVeiculoSync(tipoAcao, {
      fase: 'sem_cliente_supabase',
      ...baseLog,
      erro: 'Cliente Supabase indisponível',
      entrou_fila: true,
      status_fila: statusFilaVeiculo(officeId),
    })
    return { ok: false, remoto: false, pendente: true, erro: 'Cliente Supabase indisponível' }
  }

  const ids = new SyncIdMap()
  for (const localId of [moto.id, moto.cliente_id]) {
    const uuid = obterUuidPorLocalId(localId)
    if (uuid) ids.seed(localId, uuid)
  }

  // Garante customer_id remoto — veículo não sobe sem cliente no Supabase
  const customerUuid = await ids.uuid(moto.cliente_id)
  const { data: customerRow } = await supabase
    .from('customers')
    .select('id')
    .eq('office_id', officeUuid)
    .eq('id', customerUuid)
    .maybeSingle()

  if (!customerRow) {
    enfileirarVeiculo(officeId, moto, tipoAcao)
    logVeiculoSync(tipoAcao, {
      fase: 'cliente_ausente_remoto',
      ...baseLog,
      customer_uuid: customerUuid,
      erro: 'Cliente ainda não está no Supabase — veículo enfileirado',
      entrou_fila: true,
      status_fila: statusFilaVeiculo(officeId),
    })
    return {
      ok: false,
      remoto: false,
      pendente: true,
      erro: 'Cliente ainda não está no Supabase',
    }
  }

  const row = await mapearMotorcycle(moto, officeUuid, ids)
  row.updated_at = new Date().toISOString()

  logVeiculoSync(tipoAcao, {
    fase: 'tentativa_supabase',
    ...baseLog,
    motorcycle_id: row.id,
    office_uuid: officeUuid,
    chamada: 'upsert motorcycles',
    payload: {
      brand: row.brand,
      model: row.model,
      plate: row.plate,
      customer_id: row.customer_id,
      updated_at: row.updated_at,
    },
    status_fila: statusFilaVeiculo(officeId),
  })

  const { data, error } = await supabase
    .from('motorcycles')
    .upsert(row as never, { onConflict: 'id' })
    .select('id, plate, model, brand, updated_at')
    .maybeSingle()

  if (error) {
    enfileirarVeiculo(officeId, moto, tipoAcao)
    logVeiculoSync(tipoAcao, {
      fase: 'erro_supabase',
      ...baseLog,
      motorcycle_id: row.id,
      tentativa_supabase: true,
      resposta_supabase: null,
      erro: error.message,
      erro_code: error.code,
      entrou_fila: true,
      status_fila: statusFilaVeiculo(officeId),
    })
    return {
      ok: false,
      remoto: false,
      pendente: true,
      erro: error.message,
      motorcycle_id: String(row.id),
    }
  }

  const remoto = data as {
    id: string
    plate: string
    model: string
    brand: string
    updated_at: string
  } | null

  if (!remoto) {
    enfileirarVeiculo(officeId, moto, tipoAcao)
    logVeiculoSync(tipoAcao, {
      fase: 'upsert_sem_linha',
      ...baseLog,
      motorcycle_id: row.id,
      erro: 'upsert ok mas SELECT não retornou linha',
      entrou_fila: true,
      status_fila: statusFilaVeiculo(officeId),
    })
    return {
      ok: false,
      remoto: false,
      pendente: true,
      erro: 'Veículo não confirmado no Supabase após upsert',
      motorcycle_id: String(row.id),
    }
  }

  registrarMapeamentoId(moto.id, remoto.id)
  syncQueueService.marcarSincronizadosPorEntidade(officeId, 'moto', moto.id)
  atualizarContagemPendenciasAtivas(officeId)

  logVeiculoSync(tipoAcao, {
    fase: 'ok_supabase',
    ...baseLog,
    motorcycle_id: remoto.id,
    tentativa_supabase: true,
    resposta_supabase: remoto,
    erro: null,
    entrou_fila: false,
    status_fila: statusFilaVeiculo(officeId),
  })

  return {
    ok: true,
    remoto: true,
    pendente: false,
    motorcycle_id: remoto.id,
  }
}

export async function publicarVeiculoCriado(
  officeId: string,
  moto: Moto
): Promise<ResultadoPublicacaoVeiculo> {
  return publicarVeiculoNoSupabase(officeId, moto, 'create')
}

export async function publicarVeiculoAtualizado(
  officeId: string,
  moto: Moto,
  opcoes?: { anterior?: Moto; patch?: Partial<Moto> }
): Promise<ResultadoPublicacaoVeiculo> {
  return publicarVeiculoNoSupabase(officeId, moto, 'update', opcoes)
}

export async function processarFilaVeiculosPendente(officeId: string): Promise<boolean> {
  if (!veiculoModoSupabase()) return true
  if (typeof navigator !== 'undefined' && !navigator.onLine) return false

  const pendentes = syncQueueService
    .listar(officeId, 'pendente')
    .filter((i) => i.entidade === 'moto')

  if (pendentes.length === 0) return true

  const { localCraftRepository } = await import('@/services/repository/local.repository')
  const local = localCraftRepository.carregar(officeId)
  let algumOk = false

  for (const item of pendentes) {
    const moto = local.motos.find((m) => m.id === item.entidade_id)
    if (!moto) {
      syncQueueService.marcarSincronizado(item.id)
      algumOk = true
      continue
    }
    const r =
      item.tipo_acao === 'create'
        ? await publicarVeiculoCriado(officeId, moto)
        : await publicarVeiculoAtualizado(officeId, moto)
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
