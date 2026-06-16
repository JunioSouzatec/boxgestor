import { encontrarPossivelDuplicidadePagamentoOs } from '@/services/os-pagamento.service'
import { isPagamentoOsAtivo } from '@/services/pagamentos/payment-active.helpers'
import {
  diagnosticarPagamentosPendentesSync,
  reconciliarFilaSyncComPendenciasAtivas,
  type PendenciaPagamentoDiagnostico,
} from '@/services/pagamentos/payment-pending-diagnostic.service'
import {
  limparPagamentosOrfaos,
  removerOrfaosDaFilaSync,
} from '@/services/pagamentos/payment-orphan.service'
import { registrarAuditoriaOrfao } from '@/services/pagamentos/payment-orphan.storage'
import { emitirDiagnosticoPendenciasAtualizado } from '@/services/persistence-status.events'
import { localCraftRepository } from '@/services/repository/local.repository'
import {
  aplicarResultadoSyncPagamentosLocal,
  sincronizarPagamentosPendentes,
} from '@/services/supabase-sync/supabase-payments.persistence'
import type { CraftDatabase } from '@/types/database'
import type { LancamentoFinanceiro } from '@/types/financeiro'

const TOLERANCIA_DIAS_DATA = 3

export interface DuplicidadePendenciaInfo {
  pendencia: LancamentoFinanceiro
  similar: LancamentoFinanceiro
  os_numero?: number
}

function datasProximas(a: string, b: string, toleranciaDias = TOLERANCIA_DIAS_DATA): boolean {
  const ta = new Date(a).getTime()
  const tb = new Date(b).getTime()
  if (Number.isNaN(ta) || Number.isNaN(tb)) return a === b
  return Math.abs(ta - tb) <= toleranciaDias * 86_400_000
}

/** Mesma OS, valor, forma e data próxima — critério admin para evitar duplicar no Supabase. */
export function detectarPossivelDuplicidadePendencia(
  pendencia: LancamentoFinanceiro,
  dados: CraftDatabase
): DuplicidadePendenciaInfo | null {
  if (!pendencia.ordem_servico_id) return null

  const exato = encontrarPossivelDuplicidadePagamentoOs(
    pendencia.ordem_servico_id,
    {
      valor: pendencia.valor,
      forma_pagamento: pendencia.forma_pagamento,
      data: pendencia.data,
      observacao: pendencia.observacao,
    },
    dados.lancamentos,
    { excluirLancamentoId: pendencia.id }
  )

  if (exato) {
    const os = dados.ordens_servico.find((o) => o.id === pendencia.ordem_servico_id)
    return { pendencia, similar: exato, os_numero: os?.numero }
  }

  for (const l of dados.lancamentos) {
    if (l.id === pendencia.id || !isPagamentoOsAtivo(l)) continue
    if (l.ordem_servico_id !== pendencia.ordem_servico_id) continue
    if (Math.abs(l.valor - pendencia.valor) > 0.009) continue
    if (l.forma_pagamento !== pendencia.forma_pagamento) continue
    if (!datasProximas(l.data, pendencia.data)) continue

    const os = dados.ordens_servico.find((o) => o.id === pendencia.ordem_servico_id)
    return { pendencia, similar: l, os_numero: os?.numero }
  }

  return null
}

export function listarIdsPendenciasSuspeitasDuplicidade(
  pendencias: PendenciaPagamentoDiagnostico[],
  dados: CraftDatabase
): Set<string> {
  const ids = new Set<string>()
  for (const item of pendencias) {
    if (item.classificacao !== 'sincronizavel' || !item.lancamento) continue
    if (detectarPossivelDuplicidadePendencia(item.lancamento, dados)) {
      ids.add(item.id)
    }
  }
  return ids
}

function registrarResolucaoLocal(
  l: LancamentoFinanceiro,
  acao: 'resolvido' | 'descartado',
  motivo: string,
  osReferencia?: string
): void {
  registrarAuditoriaOrfao({
    lancamento_id: l.id,
    valor: l.valor,
    descricao: l.descricao,
    motivo,
    acao: acao === 'descartado' ? 'limpo' : 'arquivado',
    arquivado_em: new Date().toISOString(),
    os_referencia: osReferencia ?? l.ordem_servico_id,
  })
}

/** Remove da fila local sem tocar Supabase — pagamento real permanece na OS. */
export function marcarPendenciaComoResolvidaLocal(
  officeId: string,
  db: CraftDatabase,
  lancamentoId: string
): { db: CraftDatabase; processados: number } {
  const lanc = db.lancamentos.find((l) => l.id === lancamentoId)
  if (!lanc) {
    removerOrfaosDaFilaSync(officeId, [lancamentoId])
    reconciliarFilaSyncComPendenciasAtivas(officeId, db)
    emitirDiagnosticoPendenciasAtualizado(officeId)
    return { db, processados: 1 }
  }

  const duplicidade = detectarPossivelDuplicidadePendencia(lanc, db)
  const agora = new Date().toISOString()
  const os = lanc.ordem_servico_id
    ? db.ordens_servico.find((o) => o.id === lanc.ordem_servico_id)
    : undefined

  let lancamentos: LancamentoFinanceiro[]

  if (
    duplicidade &&
    !lanc.payment_supabase_id &&
    (duplicidade.similar.payment_supabase_id || duplicidade.similar.id !== lanc.id)
  ) {
    lancamentos = db.lancamentos.map((l) =>
      l.id === lancamentoId
        ? {
            ...l,
            cancelado: true,
            pago: false,
            sync_pendente: false,
            sync_arquivado: true,
            sync_arquivado_em: agora,
            sync_orfao: true,
            sync_orfao_motivo: 'Pendência resolvida — duplicata local removida da fila',
            atualizado_em: agora.slice(0, 10),
          }
        : l
    )
    registrarResolucaoLocal(
      lanc,
      'resolvido',
      'Pendência resolvida — duplicata local removida da fila',
      os ? `OS #${os.numero}` : lanc.ordem_servico_id
    )
  } else {
    lancamentos = db.lancamentos.map((l) =>
      l.id === lancamentoId
        ? {
            ...l,
            sync_pendente: false,
            sync_orfao: false,
            sync_orfao_motivo: undefined,
            atualizado_em: agora.slice(0, 10),
          }
        : l
    )
    registrarResolucaoLocal(
      lanc,
      'resolvido',
      'Pendência resolvida — já registrada na OS',
      os ? `OS #${os.numero}` : lanc.ordem_servico_id
    )
  }

  const atualizado: CraftDatabase = { ...db, lancamentos }
  removerOrfaosDaFilaSync(officeId, [lancamentoId])
  reconciliarFilaSyncComPendenciasAtivas(officeId, atualizado)
  localCraftRepository.salvar(officeId, atualizado)
  emitirDiagnosticoPendenciasAtualizado(officeId)

  return { db: atualizado, processados: 1 }
}

/** Descarta item da fila/localStorage — não altera Supabase. */
export function descartarPendenciaLocalAdmin(
  officeId: string,
  db: CraftDatabase,
  lancamentoId: string
): { db: CraftDatabase; processados: number } {
  const lanc = db.lancamentos.find((l) => l.id === lancamentoId)
  const agora = new Date().toISOString()

  if (lanc?.payment_supabase_id) {
    const lancamentos = db.lancamentos.map((l) =>
      l.id === lancamentoId
        ? {
            ...l,
            sync_pendente: false,
            sync_orfao: false,
            atualizado_em: agora.slice(0, 10),
          }
        : l
    )
    const atualizado: CraftDatabase = { ...db, lancamentos }
    removerOrfaosDaFilaSync(officeId, [lancamentoId])
    reconciliarFilaSyncComPendenciasAtivas(officeId, atualizado)
    registrarResolucaoLocal(
      lanc,
      'descartado',
      'Pendência local descartada — pagamento Supabase preservado',
      lanc.ordem_servico_id
    )
    localCraftRepository.salvar(officeId, atualizado)
    emitirDiagnosticoPendenciasAtualizado(officeId)
    return { db: atualizado, processados: 1 }
  }

  if (lanc) {
    const resultado = limparPagamentosOrfaos(db, [lancamentoId])
    registrarResolucaoLocal(
      lanc,
      'descartado',
      'Pendência local descartada pelo Admin',
      lanc.ordem_servico_id
    )
    removerOrfaosDaFilaSync(officeId, [lancamentoId])
    reconciliarFilaSyncComPendenciasAtivas(officeId, resultado.db)
    localCraftRepository.salvar(officeId, resultado.db)
    emitirDiagnosticoPendenciasAtualizado(officeId)
    return { db: resultado.db, processados: resultado.processados }
  }

  removerOrfaosDaFilaSync(officeId, [lancamentoId])
  reconciliarFilaSyncComPendenciasAtivas(officeId, db)
  emitirDiagnosticoPendenciasAtualizado(officeId)
  return { db, processados: 1 }
}

export async function sincronizarPendenciaIndividualAdmin(
  officeId: string,
  db: CraftDatabase,
  lancamentoId: string
): Promise<{ ok: boolean; mensagem: string; db: CraftDatabase }> {
  const lanc = db.lancamentos.find((l) => l.id === lancamentoId)
  if (!lanc) {
    removerOrfaosDaFilaSync(officeId, [lancamentoId])
    reconciliarFilaSyncComPendenciasAtivas(officeId, db)
    emitirDiagnosticoPendenciasAtualizado(officeId)
    return { ok: true, mensagem: 'Pendência removida da fila (lançamento local inexistente).', db }
  }

  const resultado = await sincronizarPagamentosPendentes(officeId, db, [lancamentoId])
  let dbAtual = db

  if (
    resultado.correcoes_os.length > 0 ||
    resultado.sync_atualizados.length > 0 ||
    (resultado.orfaos_marcados?.length ?? 0) > 0 ||
    resultado.sincronizados_ids.length > 0
  ) {
    dbAtual = aplicarResultadoSyncPagamentosLocal(db, resultado)
    localCraftRepository.salvar(officeId, dbAtual)
  }

  if (resultado.sincronizados_ids.includes(lancamentoId)) {
    removerOrfaosDaFilaSync(officeId, [lancamentoId])
    syncQueueServiceMarcar(officeId, lancamentoId)
  } else if (resultado.duplicatas_evitadas_ids.includes(lancamentoId)) {
    const resolvido = marcarPendenciaComoResolvidaLocal(officeId, dbAtual, lancamentoId)
    dbAtual = resolvido.db
  } else if (resultado.erros.some((e) => e.id === lancamentoId)) {
    return {
      ok: false,
      mensagem: resultado.erros.find((e) => e.id === lancamentoId)?.mensagem ?? resultado.mensagem,
      db: dbAtual,
    }
  }

  reconciliarFilaSyncComPendenciasAtivas(officeId, dbAtual)
  emitirDiagnosticoPendenciasAtualizado(officeId)

  const ok = resultado.sincronizados_ids.includes(lancamentoId) || resultado.ok
  return {
    ok,
    mensagem: ok ? 'Pagamento sincronizado com sucesso.' : resultado.mensagem,
    db: dbAtual,
  }
}

function syncQueueServiceMarcar(officeId: string, lancamentoId: string): void {
  removerOrfaosDaFilaSync(officeId, [lancamentoId])
}

export function pendenciasSyncBloqueadasPorDuplicidade(
  officeId: string,
  dados: CraftDatabase
): { bloqueado: boolean; ids: string[] } {
  const itens = diagnosticarPagamentosPendentesSync(dados, officeId)
  const ids = [...listarIdsPendenciasSuspeitasDuplicidade(itens, dados)]
  return { bloqueado: ids.length > 0, ids }
}
