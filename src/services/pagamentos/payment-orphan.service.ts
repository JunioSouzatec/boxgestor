import { getSupabaseClient } from '@/lib/supabase'
import { obterContextoOfficeSupabase } from '@/lib/supabase-office-context'
import { obterUuidPorLocalId } from '@/services/supabase-sync/id-registry'
import { ehPagamentoOS } from '@/services/supabase-sync/payment-mappers'
import {
  extrairNumeroOsDaDescricaoPagamento,
  resolverOsParaPagamento,
} from '@/services/supabase-sync/payment-os-resolver'
import {
  buscarOsSupabasePorNumero,
  osExisteNoSupabasePorId,
} from '@/services/supabase-sync/payment-os-sync.service'
import {
  ehPagamentoOsReceita,
  precisaSincronizarPagamento,
} from '@/services/pagamentos/payment-dedupe.helpers'
import { registrarAuditoriaOrfao } from '@/services/pagamentos/payment-orphan.storage'
import { syncQueueService } from '@/services/sync/sync-queue.service'
import type { CraftDatabase } from '@/types/database'
import type { LancamentoFinanceiro } from '@/types/financeiro'
import { getDataLocalHoje } from '@/lib/data-local'

export interface PagamentoOrfaoInfo {
  lancamento: LancamentoFinanceiro
  motivo: string
  os_numero?: number
  os_local_id?: string
  os_referencia?: string
  ja_arquivado: boolean
}

export function isIdFallbackImportado(id: string): boolean {
  return /^(fin|pay)-[a-f0-9]{8}$/i.test(id.trim())
}

/** Detecção síncrona heurística (sem consulta remota) */
export function detectarOrfaoLocal(
  lancamento: LancamentoFinanceiro,
  dados: CraftDatabase
): { orfao: boolean; motivo: string; os_numero?: number; os_local_id?: string } {
  if (lancamento.cancelado || lancamento.payment_supabase_id) {
    return { orfao: false, motivo: '' }
  }

  if (lancamento.sync_orfao) {
    return {
      orfao: true,
      motivo: lancamento.sync_orfao_motivo ?? 'Marcado como órfão (sem OS no Supabase)',
      os_local_id: lancamento.ordem_servico_id,
    }
  }

  if (!precisaSincronizarPagamento(lancamento)) {
    return { orfao: false, motivo: '' }
  }

  if (isIdFallbackImportado(lancamento.id)) {
    return {
      orfao: true,
      motivo: 'Lançamento importado do Supabase sem vínculo local válido (fin-/pay-)',
    }
  }

  const numeroDescricao = extrairNumeroOsDaDescricaoPagamento(lancamento.descricao)
  const parecePagamentoOs =
    ehPagamentoOS(lancamento) ||
    Boolean(numeroDescricao) ||
    lancamento.descricao.toLowerCase().includes('pagamento os')

  if (!parecePagamentoOs) {
    if (precisaSincronizarPagamento(lancamento)) {
      return {
        orfao: true,
        motivo:
          lancamento.tipo === 'despesa'
            ? 'Despesa financeira pendente de sync sem vínculo válido'
            : 'Lançamento financeiro pendente sem OS vinculada',
      }
    }
    return { orfao: false, motivo: '' }
  }

  if (lancamento.ordem_servico_id) {
    const osLocal = dados.ordens_servico.find((o) => o.id === lancamento.ordem_servico_id)
    if (!osLocal) {
      return {
        orfao: true,
        motivo: 'A OS local referenciada não existe mais nos dados da oficina',
        os_local_id: lancamento.ordem_servico_id,
        os_numero: numeroDescricao ?? undefined,
      }
    }
    return {
      orfao: false,
      motivo: '',
      os_local_id: osLocal.id,
      os_numero: osLocal.numero,
    }
  }

  if (numeroDescricao != null) {
    const osPorNumero = dados.ordens_servico.find((o) => o.numero === numeroDescricao)
    if (!osPorNumero) {
      return {
        orfao: true,
        motivo: `OS #${numeroDescricao} não encontrada nos dados locais`,
        os_numero: numeroDescricao,
      }
    }
    return { orfao: false, motivo: '', os_local_id: osPorNumero.id, os_numero: osPorNumero.numero }
  }

  if (ehPagamentoOsReceita(lancamento) || lancamento.sync_pendente) {
    return {
      orfao: true,
      motivo: 'Pagamento de OS sem ordem_servico_id vinculada',
    }
  }

  return { orfao: false, motivo: '' }
}

/** Confirma órfão consultando Supabase quando possível */
export async function confirmarOrfaoComSupabase(
  lancamento: LancamentoFinanceiro,
  dados: CraftDatabase,
  officeUuid: string
): Promise<PagamentoOrfaoInfo | null> {
  const local = detectarOrfaoLocal(lancamento, dados)
  if (local.orfao) {
    return {
      lancamento,
      motivo: local.motivo,
      os_numero: local.os_numero,
      os_local_id: local.os_local_id,
      os_referencia: local.os_numero != null ? `OS #${local.os_numero}` : local.os_local_id,
      ja_arquivado: Boolean(lancamento.sync_arquivado),
    }
  }

  if (!precisaSincronizarPagamento(lancamento) || !ehPagamentoOS(lancamento)) {
    return null
  }

  const resolucao = await resolverOsParaPagamento(lancamento, dados, officeUuid)
  if (resolucao.os && resolucao.diagnostico.os_supabase_encontrada) {
    return null
  }

  if (resolucao.os) {
    const uuid = obterUuidPorLocalId(resolucao.os.id)
    if (uuid && (await osExisteNoSupabasePorId(officeUuid, uuid))) {
      return null
    }
    const row = await buscarOsSupabasePorNumero(officeUuid, resolucao.os.numero)
    if (row) return null

    return {
      lancamento,
      motivo: 'OS existe localmente mas não foi encontrada no Supabase após sincronização',
      os_numero: resolucao.os.numero,
      os_local_id: resolucao.os.id,
      os_referencia: `OS #${resolucao.os.numero}`,
      ja_arquivado: Boolean(lancamento.sync_arquivado),
    }
  }

  const numero =
    local.os_numero ??
    extrairNumeroOsDaDescricaoPagamento(lancamento.descricao) ??
    undefined

  return {
    lancamento,
    motivo:
      resolucao.diagnostico.erro ??
      'Não foi possível localizar a OS correspondente (local ou Supabase)',
    os_numero: numero,
    os_local_id: lancamento.ordem_servico_id,
    os_referencia: numero != null ? `OS #${numero}` : lancamento.ordem_servico_id,
    ja_arquivado: Boolean(lancamento.sync_arquivado),
  }
}

export async function listarPagamentosOrfaosPendentes(
  dados: CraftDatabase,
  officeLocalId: string
): Promise<PagamentoOrfaoInfo[]> {
  const contexto = await obterContextoOfficeSupabase(officeLocalId)
  const officeUuid = contexto?.officeUuid
  const candidatos = dados.lancamentos.filter(
    (l) => !l.cancelado && !l.payment_supabase_id && (precisaSincronizarPagamento(l) || l.sync_orfao)
  )

  const orfaos: PagamentoOrfaoInfo[] = []

  for (const l of candidatos) {
    if (l.sync_arquivado && !l.sync_orfao) continue

    if (officeUuid && getSupabaseClient()) {
      const info = await confirmarOrfaoComSupabase(l, dados, officeUuid)
      if (info) orfaos.push(info)
    } else {
      const local = detectarOrfaoLocal(l, dados)
      if (local.orfao) {
        orfaos.push({
          lancamento: l,
          motivo: local.motivo,
          os_numero: local.os_numero,
          os_local_id: local.os_local_id,
          os_referencia:
            local.os_numero != null ? `OS #${local.os_numero}` : local.os_local_id,
          ja_arquivado: Boolean(l.sync_arquivado),
        })
      }
    }
  }

  return orfaos.sort(
    (a, b) => b.lancamento.data.localeCompare(a.lancamento.data) || b.lancamento.id.localeCompare(a.lancamento.id)
  )
}

export function marcarLancamentoComoOrfao(
  lancamento: LancamentoFinanceiro,
  motivo: string
): LancamentoFinanceiro {
  return {
    ...lancamento,
    sync_orfao: true,
    sync_orfao_motivo: motivo,
    sync_pendente: false,
    atualizado_em: getDataLocalHoje(),
  }
}

export interface ResultadoArquivarOrfaos {
  db: CraftDatabase
  processados: number
  ids: string[]
}

function aplicarArquivamentoOrfaos(
  dados: CraftDatabase,
  ids: Set<string>,
  acao: 'arquivado' | 'limpo'
): ResultadoArquivarOrfaos {
  const agora = new Date().toISOString()
  const processados: string[] = []

  const lancamentos = dados.lancamentos.map((l) => {
    if (!ids.has(l.id)) return l
    processados.push(l.id)

    registrarAuditoriaOrfao({
      lancamento_id: l.id,
      valor: l.valor,
      descricao: l.descricao,
      motivo: l.sync_orfao_motivo ?? 'Sem OS correspondente no Supabase',
      acao,
      arquivado_em: agora,
      os_referencia: l.ordem_servico_id,
    })

    return {
      ...l,
      sync_orfao: true,
      sync_orfao_motivo:
        l.sync_orfao_motivo ?? 'Sem OS correspondente no Supabase — pendência descartada',
      sync_arquivado: true,
      sync_arquivado_em: agora,
      sync_pendente: false,
      atualizado_em: agora.slice(0, 10),
    }
  })

  return {
    db: { ...dados, lancamentos },
    processados: processados.length,
    ids: processados,
  }
}

export function arquivarPagamentosOrfaos(
  dados: CraftDatabase,
  ids: string[]
): ResultadoArquivarOrfaos {
  return aplicarArquivamentoOrfaos(dados, new Set(ids), 'arquivado')
}

export function limparPagamentosOrfaos(
  dados: CraftDatabase,
  ids: string[]
): ResultadoArquivarOrfaos {
  return aplicarArquivamentoOrfaos(dados, new Set(ids), 'limpo')
}

export function removerOrfaosDaFilaSync(officeId: string, ids: string[]): void {
  for (const id of ids) {
    syncQueueService.marcarSincronizadosPorEntidade(officeId, 'lancamento', id)
    for (const item of syncQueueService.listar(officeId, 'pendente')) {
      if (item.entidade === 'lancamento' && item.entidade_id === id) {
        syncQueueService.marcarSincronizado(item.id)
      }
    }
  }
}

export function contarOrfaosPendentesVisiveis(dados: CraftDatabase): number {
  return dados.lancamentos.filter(
    (l) =>
      !l.cancelado &&
      !l.payment_supabase_id &&
      (l.sync_orfao || (precisaSincronizarPagamento(l) && !l.sync_arquivado))
  ).length
}
