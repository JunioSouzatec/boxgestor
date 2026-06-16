import { encontrarPossivelDuplicidadePagamentoOs } from '@/services/os-pagamento.service'
import { isPagamentoOsAtivo } from '@/services/pagamentos/payment-active.helpers'
import {
  diagnosticarPagamentosPendentesSync,
  reconciliarFilaSyncComPendenciasAtivas,
  type PendenciaPagamentoDiagnostico,
} from '@/services/pagamentos/payment-pending-diagnostic.service'
import { atualizarStatusFinanceiroOrdens } from '@/services/pagamentos/payment-archive.service'
import { removerOrfaosDaFilaSync } from '@/services/pagamentos/payment-orphan.service'
import { registrarAuditoriaOrfao } from '@/services/pagamentos/payment-orphan.storage'
import { emitirDiagnosticoPendenciasAtualizado } from '@/services/persistence-status.events'
import { localCraftRepository } from '@/services/repository/local.repository'
import { carregarBaseSeguraOffice } from '@/services/supabase-sync/fase1-merge.helpers'
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

export interface LogResolucaoPendenciaAdmin {
  tipo: 'pagamento_os' | 'financeiro' | 'fila_sem_lancamento' | 'desconhecido'
  acao: 'resolvida' | 'descartada' | 'sincronizada'
  lancamento_id: string
  os_id?: string
  os_numero?: number
  apenas_cache_local: boolean
  detalhe: string
}

function datasProximas(a: string, b: string, toleranciaDias = TOLERANCIA_DIAS_DATA): boolean {
  const ta = new Date(a).getTime()
  const tb = new Date(b).getTime()
  if (Number.isNaN(ta) || Number.isNaN(tb)) return a === b
  return Math.abs(ta - tb) <= toleranciaDias * 86_400_000
}

export function logResolucaoPendenciaAdmin(payload: LogResolucaoPendenciaAdmin): void {
  console.info('[Admin BoxGestor] resolução pendência', payload)
}

function inferirTipoLancamento(l: LancamentoFinanceiro | undefined): LogResolucaoPendenciaAdmin['tipo'] {
  if (!l) return 'desconhecido'
  if (l.ordem_servico_id && l.tipo === 'receita') return 'pagamento_os'
  return 'financeiro'
}

function finalizarResolucaoSomenteLancamentos(
  officeId: string,
  base: CraftDatabase,
  lancamentos: LancamentoFinanceiro[],
  osIdsAfetados: Set<string>
): CraftDatabase {
  let atualizado: CraftDatabase = { ...base, lancamentos }
  if (osIdsAfetados.size > 0) {
    atualizado = atualizarStatusFinanceiroOrdens(atualizado, osIdsAfetados)
  }
  localCraftRepository.salvar(officeId, atualizado)
  reconciliarFilaSyncComPendenciasAtivas(officeId, atualizado)
  emitirDiagnosticoPendenciasAtualizado(officeId)
  return atualizado
}

function deveArquivarDuplicataLocal(
  lanc: LancamentoFinanceiro,
  duplicidade: DuplicidadePendenciaInfo
): boolean {
  if (lanc.payment_supabase_id) return false
  if (duplicidade.similar.id === lanc.id) return false
  return isPagamentoOsAtivo(duplicidade.similar)
}

function aplicarResolucaoFlags(
  lanc: LancamentoFinanceiro,
  duplicidade: DuplicidadePendenciaInfo | null,
  modo: 'resolvida' | 'descartada'
): LancamentoFinanceiro {
  const agora = new Date().toISOString()

  if (duplicidade && deveArquivarDuplicataLocal(lanc, duplicidade)) {
    return {
      ...lanc,
      cancelado: true,
      pago: false,
      sync_pendente: false,
      sync_arquivado: true,
      sync_arquivado_em: agora,
      sync_orfao: true,
      sync_orfao_motivo:
        modo === 'descartada'
          ? 'Pendência local descartada — duplicata removida da fila'
          : 'Pendência resolvida — duplicata local removida da fila',
      atualizado_em: agora.slice(0, 10),
    }
  }

  return {
    ...lanc,
    sync_pendente: false,
    sync_orfao: false,
    sync_orfao_motivo: undefined,
    atualizado_em: agora.slice(0, 10),
  }
}

function registrarAuditoriaResolucao(
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

export function marcarPendenciaComoResolvidaLocal(
  officeId: string,
  dadosContexto: CraftDatabase,
  lancamentoId: string
): { db: CraftDatabase; processados: number } {
  const base = carregarBaseSeguraOffice(officeId, dadosContexto)
  const lanc = base.lancamentos.find((l) => l.id === lancamentoId)

  if (!lanc) {
    removerOrfaosDaFilaSync(officeId, [lancamentoId])
    reconciliarFilaSyncComPendenciasAtivas(officeId, base)
    emitirDiagnosticoPendenciasAtualizado(officeId)
    logResolucaoPendenciaAdmin({
      tipo: 'desconhecido',
      acao: 'resolvida',
      lancamento_id: lancamentoId,
      apenas_cache_local: true,
      detalhe: 'Item removido da fila (lançamento local inexistente)',
    })
    return { db: base, processados: 1 }
  }

  const duplicidade = detectarPossivelDuplicidadePendencia(lanc, base)
  const os = lanc.ordem_servico_id
    ? base.ordens_servico.find((o) => o.id === lanc.ordem_servico_id)
    : undefined
  const osIds = new Set(lanc.ordem_servico_id ? [lanc.ordem_servico_id] : [])

  const lancamentos = base.lancamentos.map((l) =>
    l.id === lancamentoId ? aplicarResolucaoFlags(l, duplicidade, 'resolvida') : l
  )

  registrarAuditoriaResolucao(
    lanc,
    'resolvido',
    duplicidade && deveArquivarDuplicataLocal(lanc, duplicidade)
      ? 'Pendência resolvida — duplicata local removida da fila'
      : 'Pendência resolvida — já registrada na OS',
    os ? `OS #${os.numero}` : lanc.ordem_servico_id
  )

  logResolucaoPendenciaAdmin({
    tipo: inferirTipoLancamento(lanc),
    acao: 'resolvida',
    lancamento_id: lancamentoId,
    os_id: lanc.ordem_servico_id,
    os_numero: os?.numero,
    apenas_cache_local: true,
    detalhe: 'Removida da fila de sync; OS e entidades reais preservadas',
  })

  removerOrfaosDaFilaSync(officeId, [lancamentoId])
  const atualizado = finalizarResolucaoSomenteLancamentos(officeId, base, lancamentos, osIds)
  return { db: atualizado, processados: 1 }
}

export function descartarPendenciaLocalAdmin(
  officeId: string,
  dadosContexto: CraftDatabase,
  lancamentoId: string
): { db: CraftDatabase; processados: number } {
  const base = carregarBaseSeguraOffice(officeId, dadosContexto)
  const lanc = base.lancamentos.find((l) => l.id === lancamentoId)

  if (!lanc) {
    removerOrfaosDaFilaSync(officeId, [lancamentoId])
    reconciliarFilaSyncComPendenciasAtivas(officeId, base)
    emitirDiagnosticoPendenciasAtualizado(officeId)
    logResolucaoPendenciaAdmin({
      tipo: 'desconhecido',
      acao: 'descartada',
      lancamento_id: lancamentoId,
      apenas_cache_local: true,
      detalhe: 'Entrada fantasma removida da fila',
    })
    return { db: base, processados: 1 }
  }

  const duplicidade = detectarPossivelDuplicidadePendencia(lanc, base)
  const os = lanc.ordem_servico_id
    ? base.ordens_servico.find((o) => o.id === lanc.ordem_servico_id)
    : undefined
  const osIds = new Set(lanc.ordem_servico_id ? [lanc.ordem_servico_id] : [])

  const lancamentos = base.lancamentos.map((l) =>
    l.id === lancamentoId ? aplicarResolucaoFlags(l, duplicidade, 'descartada') : l
  )

  registrarAuditoriaResolucao(
    lanc,
    'descartado',
    lanc.payment_supabase_id
      ? 'Pendência local descartada — pagamento Supabase preservado'
      : 'Pendência local descartada pelo Admin',
    os ? `OS #${os.numero}` : lanc.ordem_servico_id
  )

  logResolucaoPendenciaAdmin({
    tipo: inferirTipoLancamento(lanc),
    acao: 'descartada',
    lancamento_id: lancamentoId,
    os_id: lanc.ordem_servico_id,
    os_numero: os?.numero,
    apenas_cache_local: true,
    detalhe: 'Somente fila/cache local; Supabase e OS intactos',
  })

  removerOrfaosDaFilaSync(officeId, [lancamentoId])
  const atualizado = finalizarResolucaoSomenteLancamentos(officeId, base, lancamentos, osIds)
  return { db: atualizado, processados: 1 }
}

export async function sincronizarPendenciaIndividualAdmin(
  officeId: string,
  dadosContexto: CraftDatabase,
  lancamentoId: string
): Promise<{ ok: boolean; mensagem: string; db: CraftDatabase }> {
  const base = carregarBaseSeguraOffice(officeId, dadosContexto)
  const lanc = base.lancamentos.find((l) => l.id === lancamentoId)

  if (!lanc) {
    removerOrfaosDaFilaSync(officeId, [lancamentoId])
    reconciliarFilaSyncComPendenciasAtivas(officeId, base)
    emitirDiagnosticoPendenciasAtualizado(officeId)
    return {
      ok: true,
      mensagem: 'Pendência removida da fila (lançamento local inexistente).',
      db: base,
    }
  }

  const resultado = await sincronizarPagamentosPendentes(officeId, base, [lancamentoId])
  let dbAtual = base

  if (
    resultado.correcoes_os.length > 0 ||
    resultado.sync_atualizados.length > 0 ||
    (resultado.orfaos_marcados?.length ?? 0) > 0 ||
    resultado.sincronizados_ids.length > 0
  ) {
    dbAtual = aplicarResultadoSyncPagamentosLocal(base, resultado)
    dbAtual = {
      ...dbAtual,
      ordens_servico: base.ordens_servico,
      clientes: base.clientes,
      motos: base.motos,
    }
    localCraftRepository.salvar(officeId, dbAtual)
  }

  if (resultado.sincronizados_ids.includes(lancamentoId)) {
    removerOrfaosDaFilaSync(officeId, [lancamentoId])
    logResolucaoPendenciaAdmin({
      tipo: inferirTipoLancamento(lanc),
      acao: 'sincronizada',
      lancamento_id: lancamentoId,
      os_id: lanc.ordem_servico_id,
      os_numero: base.ordens_servico.find((o) => o.id === lanc.ordem_servico_id)?.numero,
      apenas_cache_local: false,
      detalhe: 'Pagamento enviado ao Supabase',
    })
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

export function pendenciasSyncBloqueadasPorDuplicidade(
  officeId: string,
  dados: CraftDatabase
): { bloqueado: boolean; ids: string[] } {
  const itens = diagnosticarPagamentosPendentesSync(dados, officeId)
  const ids = [...listarIdsPendenciasSuspeitasDuplicidade(itens, dados)]
  return { bloqueado: ids.length > 0, ids }
}
