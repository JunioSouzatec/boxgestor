import { getCraftPersistenceMode, isSupabaseConfigured } from '@/lib/supabase'
import {
  aplicarOfficeUuidEmDadosFase1,
  obterContextoOfficeSupabase,
} from '@/lib/supabase-office-context'
import { emitirEventoPersistencia } from '@/services/persistence-status.events'
import { localCraftRepository } from '@/services/repository/local.repository'
import type { ICraftRepository } from '@/services/repository/types'
import { syncQueueService } from '@/services/sync/sync-queue.service'
import {
  carregarFase1DoSupabase,
  extrairDadosFase1,
  mesclarFase1Remota,
  mensagemFallbackPersistencia,
  persistirFase1NoSupabase,
} from '@/services/supabase-sync/supabase-phase1.persistence'
import {
  contarFilaPendentes,
  logCarregamentoSupabaseDev,
} from '@/services/supabase-sync/supabase-load-debug'
import type { CraftDatabase } from '@/types/database'

const MENSAGEM_FALLBACK_LOCAL =
  'Exibindo dados locais por segurança. Não foi possível carregar do Supabase.'

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

function limparFilaAposSucessoSupabase(officeId: string): void {
  const removidos = syncQueueService.limparPendentesFase1(officeId)
  if (removidos > 0 && import.meta.env.DEV) {
    console.info('[Craft Supabase] Fila fase1 limpa após persistência', { removidos })
  }
  emitirEventoPersistencia({
    type: 'fila_atualizada',
    pendentes: syncQueueService.contarPendentes(officeId),
  })
}

/** Processamento manual da fila — não é chamado automaticamente no login */
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

    const contexto = await obterContextoOfficeSupabase(officeId)
    const officeUuid = contexto?.officeUuid ?? officeId
    const dados = contexto
      ? aplicarOfficeUuidEmDadosFase1(payload.dados, officeUuid)
      : payload.dados

    const resultado = await persistirFase1NoSupabase(officeUuid, dados, contexto?.opcoes)
    if (resultado.ok || resultado.contagem.customers + resultado.contagem.motorcycles > 0) {
      syncQueueService.marcarSincronizado(item.id)
      algumOk = true
    } else {
      syncQueueService.marcarErro(item.id, resultado.erros[0]?.mensagem ?? 'Erro ao sincronizar')
    }
  }

  if (algumOk) {
    limparFilaAposSucessoSupabase(officeId)
    emitirEventoPersistencia({ type: 'supabase_ok' })
  } else {
    emitirEventoPersistencia({
      type: 'fila_atualizada',
      pendentes: syncQueueService.contarPendentes(officeId),
    })
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
    const contexto = await obterContextoOfficeSupabase(officeId)
    if (!contexto) {
      console.warn('[Craft Supabase] Persistência remota ignorada — sem office_id do profile.')
      enfileirarFase1Pendente(officeId, dados)
      emitirEventoPersistencia({
        type: 'fallback',
        mensagem:
          'Usuário sem oficina vinculada no Supabase. Dados salvos apenas localmente.',
      })
      return
    }

    const fase1 = aplicarOfficeUuidEmDadosFase1(extrairDadosFase1(dados), contexto.officeUuid)
    const resultado = await persistirFase1NoSupabase(
      contexto.officeUuid,
      fase1,
      contexto.opcoes
    )

    const dadosMigrados =
      resultado.contagem.customers +
      resultado.contagem.motorcycles +
      resultado.contagem.service_orders

    if (resultado.ok || dadosMigrados > 0) {
      limparFilaAposSucessoSupabase(officeId)
      for (const c of dados.clientes) {
        syncQueueService.marcarSincronizadosPorEntidade(officeId, 'cliente', c.id)
      }
      emitirEventoPersistencia({ type: 'supabase_ok' })
      return
    }

    console.error('[Craft Supabase] Falha ao persistir fase 1:', resultado.erros)

    enfileirarFase1Pendente(officeId, dados)
    emitirEventoPersistencia({
      type: 'fallback',
      mensagem: mensagemFallbackPersistencia(resultado.erros),
    })
  }
}

export async function carregarComSupabase(officeId: string): Promise<CraftDatabase> {
  const local = localCraftRepository.carregar(officeId)
  const clientesLocaisAntes = local.clientes.length
  const filaPendentes = contarFilaPendentes(officeId)

  if (getCraftPersistenceMode() !== 'supabase' || !isSupabaseConfigured()) {
    return local
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    logCarregamentoSupabaseDev({
      origem: 'localStorage_fallback',
      clientesSupabase: 0,
      clientesLocaisAntes,
      clientesAposDedup: clientesLocaisAntes,
      duplicadosRemovidos: 0,
      motos: local.motos.length,
      os: local.ordens_servico.length,
      filaPendentes,
    })
    emitirEventoPersistencia({
      type: 'offline',
      mensagem: MENSAGEM_FALLBACK_LOCAL,
    })
    return local
  }

  const contexto = await obterContextoOfficeSupabase(officeId)
  const officeUuid = contexto?.officeUuid ?? officeId

  const remoto = await carregarFase1DoSupabase(officeUuid, local)

  if (!remoto.ok || !remoto.dados) {
    logCarregamentoSupabaseDev({
      origem: 'localStorage_fallback',
      clientesSupabase: 0,
      clientesLocaisAntes,
      clientesAposDedup: clientesLocaisAntes,
      duplicadosRemovidos: 0,
      motos: local.motos.length,
      os: local.ordens_servico.length,
      filaPendentes,
    })
    emitirEventoPersistencia({
      type: 'fallback',
      mensagem: remoto.mensagem ?? MENSAGEM_FALLBACK_LOCAL,
    })
    return local
  }

  /** Supabase é fonte da verdade para fase 1; localStorage só cache + fase 2 */
  const snapshot = mesclarFase1Remota(local, remoto.dados)
  localCraftRepository.salvar(officeId, snapshot)

  logCarregamentoSupabaseDev({
    origem: 'supabase',
    clientesSupabase: remoto.dados.clientes.length,
    clientesLocaisAntes,
    clientesAposDedup: snapshot.clientes.length,
    duplicadosRemovidos: Math.max(0, remoto.dados.clientes.length - snapshot.clientes.length),
    motos: snapshot.motos.length,
    os: snapshot.ordens_servico.length,
    filaPendentes,
  })

  emitirEventoPersistencia({ type: 'supabase_ok' })
  return snapshot
}

export const hybridCraftRepository = new HybridCraftRepository()
