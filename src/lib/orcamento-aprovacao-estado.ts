/**
 * Estado de aprovação do orçamento (link/manual) — helper central A2.5B.
 * Sem migration. Não altera status operacional da OS.
 */

import type { AprovacaoClienteMeta, TipoAprovacaoOrcamento } from '@/types/aprovacao-orcamento'
import type { StatusOrcamento } from '@/types/enums'
import type { OrdemServico } from '@/types/ordem-servico'

export function metaTemRespostaCliente(meta: AprovacaoClienteMeta | null | undefined): boolean {
  if (!meta || typeof meta !== 'object') return false
  if (meta.respondido_em) return true
  if (
    meta.approval_type === 'total' ||
    meta.approval_type === 'partial' ||
    meta.approval_type === 'rejected'
  ) {
    return true
  }
  if (
    meta.status === 'aprovado' ||
    meta.status === 'aprovado_parcialmente' ||
    meta.status === 'recusado'
  ) {
    return true
  }
  return (meta.eventos ?? []).some(
    (e) => e.tipo === 'aprovado' || e.tipo === 'aprovado_parcial' || e.tipo === 'recusado'
  )
}

export function tipoAprovacaoDeMeta(
  meta: AprovacaoClienteMeta | null | undefined
): TipoAprovacaoOrcamento | null {
  if (!meta) return null
  if (meta.approval_type === 'total' || meta.approval_type === 'partial' || meta.approval_type === 'rejected') {
    return meta.approval_type
  }
  if (meta.status === 'aprovado_parcialmente') return 'partial'
  if (meta.status === 'recusado') return 'rejected'
  if (meta.status === 'aprovado') return 'total'
  const ultimo = [...(meta.eventos ?? [])]
    .reverse()
    .find((e) => e.tipo === 'aprovado' || e.tipo === 'aprovado_parcial' || e.tipo === 'recusado')
  if (ultimo?.tipo === 'aprovado_parcial') return 'partial'
  if (ultimo?.tipo === 'aprovado') return 'total'
  if (ultimo?.tipo === 'recusado') return 'rejected'
  if (meta.respondido_em) {
    if (meta.motivo_recusa && !meta.cliente_observacao) return 'rejected'
    return 'total'
  }
  return null
}

/** Converte resposta do cliente em status_orcamento oficial (sem aprovado_parcialmente no enum). */
export function statusOrcamentoDeAprovacaoMeta(
  meta: AprovacaoClienteMeta | null | undefined
): StatusOrcamento | undefined {
  const tipo = tipoAprovacaoDeMeta(meta)
  if (tipo === 'rejected') return 'recusado'
  if (tipo === 'total' || tipo === 'partial') return 'aprovado'
  return undefined
}

export function orcamentoStatusPendente(status?: StatusOrcamento | null): boolean {
  return (
    status === 'rascunho' ||
    status === 'enviado' ||
    status === 'aguardando_aprovacao' ||
    !status
  )
}

/**
 * Incorpora resposta do cliente vinda do Supabase (Edge Function) na OS local,
 * mesmo quando o merge por updated_at preferiria o local.
 */
export function incorporarAprovacaoClienteRemotaNaOs(
  vencedor: OrdemServico,
  remoto: OrdemServico,
  local: OrdemServico
): OrdemServico {
  const aproR = remoto.aprovacao_cliente
  const aproL = local.aprovacao_cliente
  const remotoRespondeu = metaTemRespostaCliente(aproR)
  const localRespondeu = metaTemRespostaCliente(aproL)

  const statusRemoto = remoto.status_orcamento
  const statusLocal = local.status_orcamento
  const remotoBudgetFinal =
    statusRemoto === 'aprovado' || statusRemoto === 'recusado' || statusRemoto === 'convertido'

  if (!remotoRespondeu && !remotoBudgetFinal) return vencedor

  // Remoto tem resposta do link e local ainda não → trazer resposta + status.
  if (remotoRespondeu && !localRespondeu) {
    const statusDerivado = statusOrcamentoDeAprovacaoMeta(aproR) ?? statusRemoto
    return {
      ...vencedor,
      aprovacao_cliente: aproR,
      status_orcamento:
        statusDerivado && orcamentoStatusPendente(vencedor.status_orcamento)
          ? statusDerivado
          : statusDerivado ?? vencedor.status_orcamento,
      historico_eventos: preferirHistoricoComMaisEventos(
        remoto.historico_eventos,
        vencedor.historico_eventos
      ),
      updated_at: maxTs(remoto.updated_at, vencedor.updated_at) ?? vencedor.updated_at,
      atualizado_em:
        maxTs(remoto.atualizado_em, vencedor.atualizado_em)?.slice(0, 10) ??
        vencedor.atualizado_em,
    }
  }

  // Ambos responderam: preferir link público mais recente.
  if (remotoRespondeu && localRespondeu) {
    const tsR = aproR?.respondido_em ?? ''
    const tsL = aproL?.respondido_em ?? ''
    if (tsR && tsR >= tsL && (aproR?.canal_ultimo === 'link_publico' || !aproL?.canal_ultimo)) {
      return {
        ...vencedor,
        aprovacao_cliente: aproR,
        status_orcamento:
          statusOrcamentoDeAprovacaoMeta(aproR) ?? remoto.status_orcamento ?? vencedor.status_orcamento,
        historico_eventos: preferirHistoricoComMaisEventos(
          remoto.historico_eventos,
          vencedor.historico_eventos
        ),
      }
    }
  }

  // Remoto já tem budget_status final e local ainda pendente (meta pode ter falhado no pull parcial).
  if (remotoBudgetFinal && orcamentoStatusPendente(statusLocal)) {
    return {
      ...vencedor,
      status_orcamento: statusRemoto,
      aprovacao_cliente: remotoRespondeu ? aproR : vencedor.aprovacao_cliente,
      historico_eventos: preferirHistoricoComMaisEventos(
        remoto.historico_eventos,
        vencedor.historico_eventos
      ),
    }
  }

  return vencedor
}

function preferirHistoricoComMaisEventos(
  a?: OrdemServico['historico_eventos'],
  b?: OrdemServico['historico_eventos']
): OrdemServico['historico_eventos'] {
  const la = Array.isArray(a) ? a.length : 0
  const lb = Array.isArray(b) ? b.length : 0
  if (la === 0 && lb === 0) return a ?? b
  if (la >= lb) return a
  return b
}

function maxTs(a?: string | null, b?: string | null): string | undefined {
  const sa = a?.trim() || ''
  const sb = b?.trim() || ''
  if (!sa) return sb || undefined
  if (!sb) return sa
  return sa >= sb ? sa : sb
}

/** Rótulo da listagem (inclui parcial). */
export function labelStatusOrcamentoParaListagem(
  os: Pick<OrdemServico, 'status_orcamento' | 'aprovacao_cliente' | 'modo_documento'>
): string {
  const tipo = tipoAprovacaoDeMeta(os.aprovacao_cliente)
  if (tipo === 'partial') return 'Aprovado parcialmente'
  if (tipo === 'rejected') return 'Recusado'
  if (tipo === 'total') return 'Aprovado'
  const st = os.status_orcamento
  if (st === 'enviado') return 'Enviado'
  if (st === 'aguardando_aprovacao') return 'Aguardando aprovação'
  if (st === 'aprovado') return 'Aprovado'
  if (st === 'recusado') return 'Recusado'
  if (st === 'convertido') return 'Convertido em OS'
  if (st === 'rascunho') return 'Rascunho'
  return st || 'Rascunho'
}
