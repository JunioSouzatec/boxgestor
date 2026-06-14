import { getSupabaseClient } from '@/lib/supabase'
import { obterContextoOfficeSupabase } from '@/lib/supabase-office-context'
import { obterUuidPorLocalId } from '@/services/supabase-sync/id-registry'
import { ehPagamentoOS } from '@/services/supabase-sync/payment-mappers'
import {
  confirmarOrfaoComSupabase,
  detectarOrfaoLocal,
  isIdFallbackImportado,
} from '@/services/pagamentos/payment-orphan.service'
import {
  MENSAGEM_CLIENTE_MOTO_PENDENTE,
  obterCustomerIdLocalMapeado,
  obterMotorcycleIdLocalMapeado,
  resolverIdsPagamentoDaOsSupabase,
} from '@/services/pagamentos/payment-fk-resolver.service'
import { precisaSincronizarPagamento } from '@/services/pagamentos/payment-dedupe.helpers'
import { localCraftRepository } from '@/services/repository/local.repository'
import { syncQueueService } from '@/services/sync/sync-queue.service'
import type { CraftDatabase } from '@/types/database'
import type { LancamentoFinanceiro } from '@/types/financeiro'
import type { FormaPagamento } from '@/types'

export type TipoPendenciaPagamento = 'pagamento_os' | 'financeiro' | 'fila_sem_lancamento'

export type ClassificacaoPendencia =
  | 'sincronizavel'
  | 'orfao'
  | 'invalida'
  | 'quebrada'

export type OrigemPendencia = 'localStorage' | 'fila_sync' | 'localStorage+fila'

export interface PendenciaPagamentoDiagnostico {
  id: string
  lancamento?: LancamentoFinanceiro
  tipo: TipoPendenciaPagamento
  classificacao: ClassificacaoPendencia
  motivo: string
  origem: OrigemPendencia
  ordem_servico_id?: string
  local_service_order_id?: string
  service_order_uuid?: string
  os_numero?: number
  valor?: number
  forma_pagamento?: FormaPagamento
  data?: string
  observacao?: string
  na_fila: boolean
  /** Pode ser limpa/arquivada com segurança (não sincronizável) */
  pode_limpar: boolean
  customer_id_local?: string
  customer_id_supabase?: string | null
  customer_id_local_mapeado?: string
  motorcycle_id_local?: string
  motorcycle_id_supabase?: string | null
  motorcycle_id_local_mapeado?: string
  cliente_existe_supabase?: boolean
  moto_existe_supabase?: boolean
  erro_fk?: string
}

export interface ResumoPendenciasPagamentos {
  total: number
  vinculoOs: number
  sincronizaveis: number
  invalidas: number
  itens: PendenciaPagamentoDiagnostico[]
}

function inferirTipo(lancamento: LancamentoFinanceiro): TipoPendenciaPagamento {
  return ehPagamentoOS(lancamento) ? 'pagamento_os' : 'financeiro'
}

function montarCamposLancamento(
  lancamento: LancamentoFinanceiro,
  dados: CraftDatabase
): Pick<
  PendenciaPagamentoDiagnostico,
  | 'lancamento'
  | 'ordem_servico_id'
  | 'local_service_order_id'
  | 'service_order_uuid'
  | 'os_numero'
  | 'valor'
  | 'forma_pagamento'
  | 'data'
  | 'observacao'
  | 'tipo'
  | 'customer_id_local'
  | 'customer_id_local_mapeado'
  | 'motorcycle_id_local'
  | 'motorcycle_id_local_mapeado'
> {
  const os = lancamento.ordem_servico_id
    ? dados.ordens_servico.find((o) => o.id === lancamento.ordem_servico_id)
    : undefined

  return {
    lancamento,
    tipo: inferirTipo(lancamento),
    ordem_servico_id: lancamento.ordem_servico_id,
    local_service_order_id: lancamento.ordem_servico_id,
    service_order_uuid: lancamento.ordem_servico_id
      ? obterUuidPorLocalId(lancamento.ordem_servico_id) ?? undefined
      : undefined,
    os_numero: os?.numero,
    customer_id_local: os?.cliente_id,
    customer_id_local_mapeado: obterCustomerIdLocalMapeado(os?.cliente_id),
    motorcycle_id_local: os?.moto_id,
    motorcycle_id_local_mapeado: obterMotorcycleIdLocalMapeado(os?.moto_id),
    valor: lancamento.valor,
    forma_pagamento: lancamento.forma_pagamento,
    data: lancamento.data,
    observacao: lancamento.observacao ?? lancamento.descricao,
  }
}

function classificarLancamentoSync(
  lancamento: LancamentoFinanceiro,
  dados: CraftDatabase
): Omit<PendenciaPagamentoDiagnostico, 'id' | 'na_fila' | 'origem'> {
  const base = montarCamposLancamento(lancamento, dados)

  if (lancamento.sync_orfao && !lancamento.sync_arquivado) {
    return {
      ...base,
      classificacao: 'orfao',
      motivo: lancamento.sync_orfao_motivo ?? 'Marcado como órfão (sem OS no Supabase)',
      pode_limpar: true,
    }
  }

  if (isIdFallbackImportado(lancamento.id)) {
    return {
      ...base,
      classificacao: 'invalida',
      motivo: 'Lançamento importado do Supabase sem vínculo local válido (fin-/pay-)',
      pode_limpar: true,
    }
  }

  const local = detectarOrfaoLocal(lancamento, dados)
  if (local.orfao) {
    return {
      ...base,
      classificacao: base.tipo === 'financeiro' ? 'invalida' : 'orfao',
      motivo:
        base.tipo === 'financeiro'
          ? `Lançamento financeiro órfão: ${local.motivo}`
          : local.motivo,
      os_numero: local.os_numero ?? base.os_numero,
      local_service_order_id: local.os_local_id ?? base.local_service_order_id,
      ordem_servico_id: local.os_local_id ?? base.ordem_servico_id,
      pode_limpar: true,
    }
  }

  if (base.tipo === 'financeiro' && precisaSincronizarPagamento(lancamento)) {
    return {
      ...base,
      classificacao: 'invalida',
      motivo: 'Lançamento financeiro pendente sem pagamento OS ou OS vinculada',
      pode_limpar: true,
    }
  }

  return {
    ...base,
    classificacao: 'sincronizavel',
    motivo: 'Aguardando sincronização com Supabase (OS local encontrada)',
    pode_limpar: false,
  }
}

/** Diagnóstico síncrono — mesma base usada pelo contador do topo */
export function diagnosticarPagamentosPendentesSync(
  dados: CraftDatabase,
  officeId: string
): PendenciaPagamentoDiagnostico[] {
  const mapa = new Map<string, PendenciaPagamentoDiagnostico>()

  const filaLancamentos = syncQueueService
    .listar(officeId, 'pendente')
    .filter((i) => i.entidade === 'lancamento')

  const idsFila = new Set(filaLancamentos.map((i) => i.entidade_id))

  for (const l of dados.lancamentos) {
    if (l.cancelado || l.sync_arquivado) continue
    const pendente =
      precisaSincronizarPagamento(l) || (l.sync_orfao && !l.sync_arquivado)
    if (!pendente) continue

    const info = classificarLancamentoSync(l, dados)
    mapa.set(l.id, {
      id: l.id,
      ...info,
      na_fila: idsFila.has(l.id),
      origem: idsFila.has(l.id) ? 'localStorage+fila' : 'localStorage',
    })
  }

  for (const item of filaLancamentos) {
    if (mapa.has(item.entidade_id)) continue

    const lanc = dados.lancamentos.find((l) => l.id === item.entidade_id)
    if (lanc && !lanc.cancelado && !lanc.sync_arquivado) {
      const info = classificarLancamentoSync(lanc, dados)
      mapa.set(lanc.id, {
        id: lanc.id,
        ...info,
        na_fila: true,
        origem: 'fila_sync',
        classificacao: info.classificacao === 'sincronizavel' ? 'quebrada' : info.classificacao,
        motivo:
          info.classificacao === 'sincronizavel'
            ? 'Na fila de sync, mas sem flag de pendência no localStorage (entrada inconsistente)'
            : info.motivo,
        pode_limpar: true,
      })
      continue
    }

    mapa.set(item.entidade_id, {
      id: item.entidade_id,
      tipo: 'fila_sem_lancamento',
      classificacao: 'quebrada',
      motivo: 'Entrada na fila de sync sem lançamento correspondente no localStorage',
      origem: 'fila_sync',
      na_fila: true,
      pode_limpar: true,
    })
  }

  return [...mapa.values()].sort(
    (a, b) => (b.data ?? '').localeCompare(a.data ?? '') || b.id.localeCompare(a.id)
  )
}

/** Enriquece com consulta Supabase (reclassifica sincronizáveis sem OS remota) */
export async function diagnosticarPagamentosPendentesCompleto(
  dados: CraftDatabase,
  officeLocalId: string
): Promise<PendenciaPagamentoDiagnostico[]> {
  const itens = diagnosticarPagamentosPendentesSync(dados, officeLocalId)
  const contexto = await obterContextoOfficeSupabase(officeLocalId)
  const officeUuid = contexto?.officeUuid

  if (!officeUuid || !getSupabaseClient()) {
    return itens
  }

  const enriquecidos: PendenciaPagamentoDiagnostico[] = []

  for (const item of itens) {
    let atualizado = item

    if (item.lancamento && item.tipo === 'pagamento_os') {
      const os = item.lancamento.ordem_servico_id
        ? dados.ordens_servico.find((o) => o.id === item.lancamento!.ordem_servico_id)
        : undefined

      if (os) {
        const idsRes = await resolverIdsPagamentoDaOsSupabase(
          officeUuid,
          os,
          dados,
          contexto,
          false
        )

        if (idsRes.ok) {
          atualizado = {
            ...atualizado,
            service_order_uuid: idsRes.ids.service_order_id,
            customer_id_supabase: idsRes.ids.customer_id,
            motorcycle_id_supabase: idsRes.ids.motorcycle_id,
            cliente_existe_supabase: idsRes.ids.customer_existe,
            moto_existe_supabase: idsRes.ids.motorcycle_existe,
          }

          const customerIdMapeadoInvalido =
            atualizado.customer_id_local_mapeado &&
            atualizado.customer_id_supabase &&
            atualizado.customer_id_local_mapeado !== atualizado.customer_id_supabase

          if (
            (idsRes.ids.customer_id && !idsRes.ids.customer_existe) ||
            (idsRes.ids.motorcycle_id && !idsRes.ids.motorcycle_existe) ||
            customerIdMapeadoInvalido
          ) {
            atualizado = {
              ...atualizado,
              classificacao: 'invalida',
              pode_limpar: true,
              erro_fk: 'customer_id_fkey ou motorcycle_id_fkey',
              motivo: MENSAGEM_CLIENTE_MOTO_PENDENTE,
            }
          }
        } else if (item.classificacao === 'sincronizavel') {
          atualizado = {
            ...atualizado,
            classificacao: 'invalida',
            pode_limpar: true,
            motivo: idsRes.motivo,
            erro_fk: 'dependencia_supabase',
          }
        }
      }
    }

    if (
      item.lancamento &&
      item.classificacao === 'sincronizavel' &&
      ehPagamentoOS(item.lancamento) &&
      atualizado.classificacao === 'sincronizavel'
    ) {
      const orfao = await confirmarOrfaoComSupabase(item.lancamento, dados, officeUuid)
      if (orfao && !orfao.ja_arquivado) {
        enriquecidos.push({
          ...item,
          classificacao: 'orfao',
          motivo: orfao.motivo,
          os_numero: orfao.os_numero ?? item.os_numero,
          local_service_order_id: orfao.os_local_id ?? item.local_service_order_id,
          ordem_servico_id: orfao.os_local_id ?? item.ordem_servico_id,
          pode_limpar: true,
        })
        continue
      }
    }
    enriquecidos.push(atualizado)
  }

  return enriquecidos
}

export function resumirPendenciasPagamentos(
  itens: PendenciaPagamentoDiagnostico[]
): ResumoPendenciasPagamentos {
  const sincronizaveis = itens.filter((i) => i.classificacao === 'sincronizavel').length
  const invalidas = itens.filter((i) => i.pode_limpar).length
  const vinculoOs = itens.filter(
    (i) => i.tipo === 'pagamento_os' || Boolean(i.ordem_servico_id)
  ).length

  return {
    total: itens.length,
    vinculoOs,
    sincronizaveis,
    invalidas,
    itens,
  }
}

export function obterResumoPendenciasPagamentosSync(
  officeId: string,
  dados?: CraftDatabase
): ResumoPendenciasPagamentos {
  const db = dados ?? localCraftRepository.carregar(officeId)
  const itens = diagnosticarPagamentosPendentesSync(db, officeId)
  return resumirPendenciasPagamentos(itens)
}

/** Contagem unificada de pendências ativas — mesma origem da lista em Backup e Segurança */
export function getActiveSyncPendingCount(
  officeId: string,
  dados?: CraftDatabase
): number {
  return obterResumoPendenciasPagamentosSync(officeId, dados).total
}

/**
 * Remove da fila de sync itens que não correspondem a pendências ativas reais
 * (arquivados, limpos, órfãos descartados, entradas fantasma).
 */
export function reconciliarFilaSyncComPendenciasAtivas(
  officeId: string,
  dados?: CraftDatabase
): number {
  const db = dados ?? localCraftRepository.carregar(officeId)
  const idsAtivos = new Set(
    diagnosticarPagamentosPendentesSync(db, officeId).map((p) => p.id)
  )

  for (const item of syncQueueService.listar(officeId, 'pendente')) {
    if (item.entidade !== 'lancamento') continue

    const lanc = db.lancamentos.find((l) => l.id === item.entidade_id)
    const arquivado = Boolean(lanc?.sync_arquivado || lanc?.cancelado)
    const ativo = idsAtivos.has(item.entidade_id)

    if (!lanc || arquivado || !ativo) {
      syncQueueService.marcarSincronizado(item.id)
      syncQueueService.marcarSincronizadosPorEntidade(officeId, 'lancamento', item.entidade_id)
    }
  }

  if (idsAtivos.size === 0) {
    for (const item of syncQueueService.listar(officeId, 'pendente')) {
      if (item.entidade === 'lancamento') {
        syncQueueService.marcarSincronizado(item.id)
      }
    }
  }

  return getActiveSyncPendingCount(officeId, db)
}
