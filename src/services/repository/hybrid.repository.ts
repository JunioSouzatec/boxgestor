import { getCraftPersistenceMode, isSupabaseConfigured } from '@/lib/supabase'
import { emitirEventoPersistencia } from '@/services/persistence-status.events'
import { localCraftRepository } from '@/services/repository/local.repository'
import type { ICraftRepository } from '@/services/repository/types'
import { syncQueueService } from '@/services/sync/sync-queue.service'
import {
  carregarFase1DoSupabase,
  extrairDadosFase1,
  mesclarFase1Remota,
  persistirFase1NoSupabase,
} from '@/services/supabase-sync/supabase-phase1.persistence'
import type { CraftDatabase } from '@/types/database'

function enfileirarFase1Pendente(officeId: string, dados: CraftDatabase): void {
  syncQueueService.enfileirar({
    office_id: officeId,
    tipo_acao: 'update',
    entidade: 'configuracao',
    entidade_id: officeId,
    payload: { sync_fase1: true, dados: extrairDadosFase1(dados) },
  })
  emitirEventoPersistencia({
    type: 'fila_atualizada',
    pendentes: syncQueueService.contarPendentes(officeId),
  })
}

export async function processarFilaSyncPendente(officeId: string): Promise<boolean> {
  const pendentes = syncQueueService.listar(officeId, 'pendente')
  const fase1 = pendentes.filter(
    (i) =>
      i.entidade === 'configuracao' &&
      i.payload &&
      typeof i.payload === 'object' &&
      (i.payload as { sync_fase1?: boolean }).sync_fase1
  )

  if (fase1.length === 0) return true

  let algumOk = false
  for (const item of fase1) {
    const payload = item.payload as { dados?: ReturnType<typeof extrairDadosFase1> }
    if (!payload.dados) continue

    const resultado = await persistirFase1NoSupabase(officeId, payload.dados)
    if (resultado.ok) {
      syncQueueService.marcarSincronizado(item.id)
      algumOk = true
    } else {
      syncQueueService.marcarErro(item.id, resultado.erros[0]?.mensagem ?? 'Erro ao sincronizar')
    }
  }

  emitirEventoPersistencia({
    type: 'fila_atualizada',
    pendentes: syncQueueService.contarPendentes(officeId),
  })

  if (algumOk) {
    emitirEventoPersistencia({ type: 'supabase_ok' })
  }

  return algumOk
}

export class HybridCraftRepository implements ICraftRepository {
  carregar(officeId: string): CraftDatabase {
    return localCraftRepository.carregar(officeId)
  }

  salvar(officeId: string, dados: CraftDatabase): void {
    localCraftRepository.salvar(officeId, dados)

    if (getCraftPersistenceMode() !== 'supabase' || !isSupabaseConfigured()) {
      return
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      enfileirarFase1Pendente(officeId, dados)
      emitirEventoPersistencia({
        type: 'offline',
        mensagem:
          'Sem internet. Dados salvos localmente e enfileirados para sincronizar quando voltar online.',
      })
      return
    }

    void this.persistirRemoto(officeId, dados)
  }

  resetar(officeId: string): CraftDatabase {
    return localCraftRepository.resetar(officeId)
  }

  private async persistirRemoto(officeId: string, dados: CraftDatabase): Promise<void> {
    const resultado = await persistirFase1NoSupabase(officeId, extrairDadosFase1(dados))

    if (resultado.ok) {
      emitirEventoPersistencia({ type: 'supabase_ok' })
      return
    }

    console.error('[Craft Supabase] Falha ao persistir fase 1:', resultado.erros)

    enfileirarFase1Pendente(officeId, dados)
    emitirEventoPersistencia({
      type: 'fallback',
      mensagem:
        'Não foi possível salvar no Supabase. O registro foi salvo localmente e será sincronizado depois.',
    })
  }
}

export async function carregarComSupabase(officeId: string): Promise<CraftDatabase> {
  const local = localCraftRepository.carregar(officeId)

  if (getCraftPersistenceMode() !== 'supabase' || !isSupabaseConfigured()) {
    return local
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    emitirEventoPersistencia({
      type: 'offline',
      mensagem: 'Offline. Usando backup local até a conexão voltar.',
    })
    return local
  }

  const remoto = await carregarFase1DoSupabase(officeId, local)

  if (!remoto.ok || !remoto.dados) {
    emitirEventoPersistencia({
      type: 'fallback',
      mensagem:
        remoto.mensagem ??
        'Não foi possível carregar do Supabase. Usando backup local.',
    })
    return local
  }

  const mesclado = mesclarFase1Remota(local, remoto.dados)
  localCraftRepository.salvar(officeId, mesclado)
  emitirEventoPersistencia({ type: 'supabase_ok' })
  return mesclado
}

export const hybridCraftRepository = new HybridCraftRepository()
