import { formatarDetalhePagamento, formatarPagamentoAVista } from '@/lib/pagamento-format'
import {
  listarPagamentosOsEstrito,
  pagamentoPertenceOsEstrito,
  type OsVinculoPagamento,
} from '@/lib/pagamentos-os-vinculo'
import { extrairNumeroOsDaDescricaoPagamento } from '@/services/supabase-sync/payment-os-resolver'
import {
  isPagamentoOsAtivo,
  marcarPagamentoExcluido,
} from '@/services/pagamentos/payment-active.helpers'
import { calcularResumoFinanceiroOS } from '@/services/os-financeiro.service'
import { getDataLocalHoje } from '@/lib/data-local'
import type { CraftDatabase } from '@/types/database'
import type { LancamentoFinanceiro } from '@/types/financeiro'
import type { OrdemServico } from '@/types/ordem-servico'

export type OrigemPagamentoAuditoria = 'supabase' | 'local'

export interface LinhaAuditoriaPagamentoOs {
  lancamento: LancamentoFinanceiro
  origem: OrigemPagamentoAuditoria
  parcelamento: string
  numeroDescricao?: number
  vinculoValido: boolean
  motivoInvalido?: string
}

export interface AuditoriaPagamentosOs {
  os: OrdemServico
  linhas: LinhaAuditoriaPagamentoOs[]
  totalOs: number
  totalPagamentosPorId: number
  totalPagamentosValidos: number
  diferenca: number
  quantidadePorId: number
  quantidadeValidos: number
  quantidadeSuspeitos: number
}

function origemPagamento(l: LancamentoFinanceiro): OrigemPagamentoAuditoria {
  return l.payment_supabase_id ? 'supabase' : 'local'
}

function parcelamentoLinha(l: LancamentoFinanceiro): string {
  const detalhe = formatarDetalhePagamento(l)
  if (detalhe.parcelamento) return detalhe.parcelamento
  if (l.forma_pagamento === 'credito') return formatarPagamentoAVista()
  return '—'
}

/** Pagamentos com ordem_servico_id igual ao id da OS (sem validação de descrição). */
export function listarPagamentosPorVinculoId(
  osId: string,
  lancamentos: LancamentoFinanceiro[]
): LancamentoFinanceiro[] {
  const id = osId.trim()
  return lancamentos
    .filter((l) => isPagamentoOsAtivo(l) && l.ordem_servico_id?.trim() === id)
    .sort((a, b) => b.data.localeCompare(a.data) || b.id.localeCompare(a.id))
}

function motivoVinculoInvalido(
  os: OsVinculoPagamento,
  lancamento: LancamentoFinanceiro
): string | undefined {
  if (pagamentoPertenceOsEstrito(os, lancamento)) return undefined

  const vinculoId = lancamento.ordem_servico_id?.trim()
  if (!vinculoId) return 'Sem ordem_servico_id'

  if (vinculoId !== os.id.trim()) {
    return 'ordem_servico_id aponta para outra OS'
  }

  const numeroDescricao = extrairNumeroOsDaDescricaoPagamento(lancamento.descricao)
  if (numeroDescricao != null && numeroDescricao !== os.numero) {
    return `Descrição indica OS #${numeroDescricao}, não OS #${os.numero}`
  }

  const osOffice = (os.office_id ?? os.oficina_id)?.trim()
  const lOffice = (lancamento.office_id ?? lancamento.oficina_id)?.trim()
  if (osOffice && lOffice && lOffice !== osOffice) {
    return 'Pagamento de outra oficina'
  }

  return 'Vínculo inconsistente'
}

export function auditarPagamentosOs(
  dados: CraftDatabase,
  numeroOs: number
): AuditoriaPagamentosOs | null {
  const os = dados.ordens_servico.find((o) => o.numero === numeroOs)
  if (!os) return null

  const porId = listarPagamentosPorVinculoId(os.id, dados.lancamentos)
  const validos = listarPagamentosOsEstrito(os, dados.lancamentos)

  const linhas: LinhaAuditoriaPagamentoOs[] = porId.map((lancamento) => {
    const numeroDescricao = extrairNumeroOsDaDescricaoPagamento(lancamento.descricao) ?? undefined
    const vinculoValido = pagamentoPertenceOsEstrito(os, lancamento)
    return {
      lancamento,
      origem: origemPagamento(lancamento),
      parcelamento: parcelamentoLinha(lancamento),
      numeroDescricao,
      vinculoValido,
      motivoInvalido: vinculoValido ? undefined : motivoVinculoInvalido(os, lancamento),
    }
  })

  const resumo = calcularResumoFinanceiroOS(os, dados.lancamentos)
  const totalPagamentosPorId = porId.filter((p) => p.pago).reduce((a, p) => a + p.valor, 0)
  const totalPagamentosValidos = validos.filter((p) => p.pago).reduce((a, p) => a + p.valor, 0)

  return {
    os,
    linhas,
    totalOs: resumo.totalGeral,
    totalPagamentosPorId,
    totalPagamentosValidos,
    diferenca: totalPagamentosPorId - totalPagamentosValidos,
    quantidadePorId: porId.length,
    quantidadeValidos: validos.length,
    quantidadeSuspeitos: linhas.filter((l) => !l.vinculoValido).length,
  }
}

export function encontrarOsPorNumeroOuId(
  dados: CraftDatabase,
  referencia: string
): OrdemServico | undefined {
  const ref = referencia.trim()
  if (!ref) return undefined

  const porNumero = parseInt(ref.replace(/^#/, ''), 10)
  if (Number.isFinite(porNumero)) {
    const os = dados.ordens_servico.find((o) => o.numero === porNumero)
    if (os) return os
  }

  return dados.ordens_servico.find((o) => o.id === ref)
}

export function repararRemoverVinculoPagamentoOs(
  db: CraftDatabase,
  lancamentoId: string
): CraftDatabase {
  const agora = getDataLocalHoje()
  return {
    ...db,
    lancamentos: db.lancamentos.map((l) =>
      l.id === lancamentoId
        ? {
            ...l,
            ordem_servico_id: undefined,
            sync_pendente: true,
            atualizado_em: agora,
            observacao: [l.observacao, 'Vínculo com OS removido pelo admin (auditoria).']
              .filter(Boolean)
              .join(' ')
              .trim(),
          }
        : l
    ),
  }
}

export function repararMoverPagamentoParaOs(
  db: CraftDatabase,
  lancamentoId: string,
  osDestino: OrdemServico
): CraftDatabase {
  const agora = getDataLocalHoje()
  return {
    ...db,
    lancamentos: db.lancamentos.map((l) =>
      l.id === lancamentoId
        ? {
            ...l,
            ordem_servico_id: osDestino.id,
            sync_pendente: true,
            atualizado_em: agora,
            observacao: [
              l.observacao,
              `Vínculo alterado pelo admin para OS #${osDestino.numero}.`,
            ]
              .filter(Boolean)
              .join(' ')
              .trim(),
          }
        : l
    ),
  }
}

export function repararExcluirPagamentoTeste(
  db: CraftDatabase,
  lancamentoId: string
): CraftDatabase {
  return {
    ...db,
    lancamentos: db.lancamentos.map((l) =>
      l.id === lancamentoId ? marcarPagamentoExcluido(l) : l
    ),
  }
}
