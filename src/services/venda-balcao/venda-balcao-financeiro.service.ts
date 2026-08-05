/**
 * RC2 Venda Balcão — receita financeira (idempotente, 1 por venda).
 * Não cria SOP. Não mexe em pagamento de OS.
 */
import { getDataLocalHoje } from '@/lib/data-local'
import { stampCreate, stampUpdate } from '@/services/migration.service'
import type { FormaPagamento } from '@/types/enums'
import type { LancamentoFinanceiro, LancamentoFinanceiroInput } from '@/types/financeiro'
import type { VendaBalcao, VendaBalcaoFormaPagamento } from '@/types/venda-balcao'
import {
  chavePagamentoVendaBalcao,
  formaBalcaoParaFinanceiro,
  formatarFormaBalcaoComParcelas,
  labelBaseFormaVendaBalcao,
  normalizarParcelasVendaBalcao,
} from '@/services/venda-balcao/venda-balcao-forma.helpers'

export function extrairCounterSaleIdDeObservacao(observacao?: string): string | null {
  if (!observacao) return null
  const m = observacao.match(/counter_sale_id:([^\s·]+)/)
  return m?.[1]?.trim() || null
}

export function extrairCounterSaleIdDeLancamento(l: LancamentoFinanceiro): string | null {
  const metaId = l.craft_meta?.counter_sale_id ?? l.craft_meta?.origin_id
  if (typeof metaId === 'string' && metaId.trim()) return metaId.trim()
  const fromObs = extrairCounterSaleIdDeObservacao(l.observacao)
  if (fromObs) return fromObs
  const cp = l.client_payment_id ?? ''
  if (cp.startsWith('counter-sale-payment:')) {
    return cp.slice('counter-sale-payment:'.length) || null
  }
  return null
}

export function encontrarLancamentosVendaBalcao(
  lancamentos: LancamentoFinanceiro[],
  saleId: string
): LancamentoFinanceiro[] {
  const chave = chavePagamentoVendaBalcao(saleId)
  return lancamentos.filter((l) => {
    if (l.cancelado || l.sync_arquivado) return false
    if (l.client_payment_id === chave || l.id === chave) return true
    if (extrairCounterSaleIdDeLancamento(l) === saleId) return true
    return false
  })
}

export function encontrarLancamentoVendaBalcao(
  lancamentos: LancamentoFinanceiro[],
  saleId: string
): LancamentoFinanceiro | undefined {
  const grupo = encontrarLancamentosVendaBalcao(lancamentos, saleId)
  if (grupo.length === 0) return undefined
  // Prefere pago; depois o mais recente.
  return [...grupo].sort((a, b) => {
    if (a.pago !== b.pago) return a.pago ? -1 : 1
    const ta = a.updated_at || a.atualizado_em || a.created_at || ''
    const tb = b.updated_at || b.atualizado_em || b.created_at || ''
    return tb.localeCompare(ta)
  })[0]
}

function montarObservacaoVendaBalcao(venda: VendaBalcao, observacao?: string): string {
  const obsExtra = observacao?.trim()
  return [`counter_sale_id:${venda.id}`, `origem:counter_sale`, obsExtra || null]
    .filter(Boolean)
    .join(' · ')
}

function labelNumeroVenda(venda: VendaBalcao): string {
  return venda.sale_number != null ? `#${venda.sale_number}` : venda.id.slice(0, 8)
}

export function montarCraftMetaReceitaVendaBalcao(params: {
  venda: VendaBalcao
  forma: VendaBalcaoFormaPagamento | string
  parcelas?: number | null
  metaAtual?: Record<string, unknown>
}): Record<string, unknown> {
  const parcelasNorm = normalizarParcelasVendaBalcao(params.forma, params.parcelas)
  const base = labelBaseFormaVendaBalcao(params.forma)
  const label = formatarFormaBalcaoComParcelas(params.forma, parcelasNorm)
  return {
    ...params.metaAtual,
    origin_type: 'counter_sale',
    origin_id: params.venda.id,
    counter_sale_id: params.venda.id,
    payment_method_base: base,
    payment_method_label: label,
    installments: parcelasNorm ?? null,
  }
}

export function criarInputReceitaVendaBalcao(params: {
  venda: VendaBalcao
  forma: VendaBalcaoFormaPagamento | string
  pago: boolean
  parcelas?: number | null
  usuario?: { id?: string; nome?: string }
  observacao?: string
}): LancamentoFinanceiroInput | null {
  const total = Number(params.venda.total) || 0
  if (!(total > 0)) return null

  let formaFin: FormaPagamento | null = formaBalcaoParaFinanceiro(params.forma)
  // Pendente não tem forma financeira — usa placeholder técnico (UI mostra Pendente via pago:false).
  if (!formaFin) {
    if (!params.pago && (params.forma === 'pendente' || !params.forma)) {
      formaFin = 'outro'
    } else {
      return null
    }
  }

  const chave = chavePagamentoVendaBalcao(params.venda.id)
  const parcelas =
    formaFin === 'credito'
      ? normalizarParcelasVendaBalcao('cartao_credito', params.parcelas) ?? 1
      : undefined

  const craftMeta = montarCraftMetaReceitaVendaBalcao({
    venda: params.venda,
    forma: params.forma,
    parcelas: params.parcelas,
    metaAtual: params.venda.craft_meta,
  })

  return {
    tipo: 'receita',
    descricao: `Venda balcão ${labelNumeroVenda(params.venda)}`,
    valor: Math.round(total * 100) / 100,
    forma_pagamento: formaFin,
    data: getDataLocalHoje(),
    pago: params.pago,
    parcelas,
    observacao: montarObservacaoVendaBalcao(params.venda, params.observacao),
    usuario_id: params.usuario?.id,
    usuario_nome: params.usuario?.nome,
    cancelado: false,
    client_payment_id: chave,
    sync_pendente: true,
    craft_meta: craftMeta,
  }
}

/**
 * Monta entidade completa sem depender do retorno do setState do React.
 */
export function construirLancamentoReceitaVendaBalcao(params: {
  officeId: string
  venda: VendaBalcao
  forma: VendaBalcaoFormaPagamento | string
  pago: boolean
  parcelas?: number | null
  existente?: LancamentoFinanceiro
  usuario?: { id?: string; nome?: string }
  observacao?: string
}): LancamentoFinanceiro | null {
  const input = criarInputReceitaVendaBalcao(params)
  if (!input) return null
  const chave = chavePagamentoVendaBalcao(params.venda.id)
  const id = params.existente?.id || chave
  const base = {
    ...params.existente,
    ...input,
    id,
    client_payment_id: chave,
    oficina_id: params.officeId,
    office_id: params.officeId,
    cancelado: false,
    sync_arquivado: false,
    sync_orfao: false,
    sync_orfao_motivo: undefined,
  }
  return params.existente
    ? stampUpdate(base as LancamentoFinanceiro)
    : stampCreate(base as LancamentoFinanceiro, params.officeId)
}

/**
 * Garante no máximo 1 receita por venda.
 * - Pendente: cria ou mantém pago:false
 * - Paga: atualiza a existente para pago:true (nunca cria segunda)
 * Sempre retorna entidade construída (não depende só do React setState).
 */
export function garantirReceitaVendaBalcao(params: {
  officeId?: string
  venda: VendaBalcao
  forma: VendaBalcaoFormaPagamento | string
  pago: boolean
  parcelas?: number | null
  lancamentos: LancamentoFinanceiro[]
  adicionarLancamento: (input: LancamentoFinanceiroInput) => LancamentoFinanceiro
  atualizarLancamento: (id: string, patch: Partial<LancamentoFinanceiro>) => void
  usuario?: { id?: string; nome?: string }
  observacao?: string
}): {
  status: 'criado' | 'atualizado' | 'ja_existia' | 'ignorado'
  lancamento?: LancamentoFinanceiro
  duplicadosArquivados?: string[]
} {
  const chave = chavePagamentoVendaBalcao(params.venda.id)
  const grupo = encontrarLancamentosVendaBalcao(params.lancamentos, params.venda.id)
  const principal = encontrarLancamentoVendaBalcao(params.lancamentos, params.venda.id)
  const officeId =
    params.officeId ||
    principal?.office_id ||
    principal?.oficina_id ||
    params.venda.office_id ||
    ''

  const duplicadosArquivados: string[] = []
  if (grupo.length > 1 && principal) {
    for (const l of grupo) {
      if (l.id === principal.id) continue
      params.atualizarLancamento(l.id, {
        cancelado: true,
        sync_arquivado: true,
        sync_pendente: false,
        pago: false,
        sync_orfao_motivo: 'Duplicata venda balcão — mantido lançamento principal',
      })
      duplicadosArquivados.push(l.id)
      console.info('[VendaBalcao][financeiro:dedupe]', {
        sale_id: params.venda.id,
        mantido: principal.id,
        arquivado: l.id,
        pago_mantido: principal.pago,
      })
    }
  }

  const input = criarInputReceitaVendaBalcao({
    venda: params.venda,
    forma: params.forma,
    pago: params.pago,
    parcelas: params.parcelas,
    usuario: params.usuario,
    observacao: params.observacao,
  })
  if (!input) return { status: 'ignorado', duplicadosArquivados }

  if (!principal) {
    // Best-effort React state; entidade canônica vem de construirLancamento.
    try {
      params.adicionarLancamento(input)
    } catch (e) {
      console.warn('[Financeiro][VB][receita-upsert] adicionarLancamento falhou', e)
    }
    const lancamento = construirLancamentoReceitaVendaBalcao({
      officeId: officeId || 'unknown',
      venda: params.venda,
      forma: params.forma,
      pago: params.pago,
      parcelas: params.parcelas,
      usuario: params.usuario,
      observacao: params.observacao,
    })
    return { status: 'criado', lancamento: lancamento ?? undefined, duplicadosArquivados }
  }

  const precisaAtualizar =
    principal.pago !== params.pago ||
    (params.pago && principal.forma_pagamento !== input.forma_pagamento) ||
    principal.valor !== input.valor ||
    principal.client_payment_id !== chave ||
    principal.parcelas !== input.parcelas ||
    !principal.observacao?.includes(`counter_sale_id:${params.venda.id}`) ||
    principal.craft_meta?.origin_type !== 'counter_sale' ||
    (params.pago && principal.sync_pendente) ||
    principal.cancelado ||
    principal.sync_arquivado

  const patch: Partial<LancamentoFinanceiro> = {
    ...input,
    client_payment_id: chave,
    sync_pendente: true,
    sync_orfao: false,
    sync_orfao_motivo: undefined,
    sync_arquivado: false,
    cancelado: false,
  }

  if (precisaAtualizar || params.pago !== principal.pago) {
    try {
      params.atualizarLancamento(principal.id, patch)
    } catch (e) {
      console.warn('[Financeiro][VB][receita-upsert] atualizarLancamento falhou', e)
    }
  }

  const lancamento = construirLancamentoReceitaVendaBalcao({
    officeId: officeId || principal.office_id || principal.oficina_id || 'unknown',
    venda: params.venda,
    forma: params.forma,
    pago: params.pago,
    parcelas: params.parcelas,
    existente: { ...principal, ...patch, id: principal.id },
    usuario: params.usuario,
    observacao: params.observacao,
  })

  if (!precisaAtualizar && params.pago === principal.pago) {
    return { status: 'ja_existia', lancamento: lancamento ?? principal, duplicadosArquivados }
  }

  return {
    status: principal.pago === params.pago ? 'ja_existia' : 'atualizado',
    lancamento: lancamento ?? undefined,
    duplicadosArquivados,
  }
}

/**
 * Remove duplicatas locais de VB na listagem (mesmo sale / mesma chave).
 * Prefere Pago; arquiva os demais no array retornado (caller persiste se quiser).
 */
export function deduplicarReceitasVendaBalcaoLocais(
  lancamentos: LancamentoFinanceiro[]
): { lancamentos: LancamentoFinanceiro[]; removidos: number } {
  const porSale = new Map<string, LancamentoFinanceiro[]>()

  for (const l of lancamentos) {
    if (l.cancelado || l.sync_arquivado) continue
    if (l.tipo !== 'receita') continue
    const saleId = extrairCounterSaleIdDeLancamento(l)
    if (!saleId) continue
    const g = porSale.get(saleId) ?? []
    g.push(l)
    porSale.set(saleId, g)
  }

  const arquivar = new Set<string>()
  for (const [saleId, grupo] of porSale) {
    if (grupo.length < 2) continue
    const vencedor = [...grupo].sort((a, b) => {
      if (a.pago !== b.pago) return a.pago ? -1 : 1
      const ta = a.updated_at || a.atualizado_em || ''
      const tb = b.updated_at || b.atualizado_em || ''
      return tb.localeCompare(ta)
    })[0]
    for (const l of grupo) {
      if (l.id === vencedor.id) continue
      arquivar.add(l.id)
      console.info('[VendaBalcao][financeiro:dedupe-local]', {
        sale_id: saleId,
        mantido: vencedor.id,
        arquivado: l.id,
        pago_mantido: vencedor.pago,
      })
    }
  }

  if (arquivar.size === 0) return { lancamentos, removidos: 0 }

  const agora = new Date().toISOString()
  return {
    removidos: arquivar.size,
    lancamentos: lancamentos.map((l) =>
      arquivar.has(l.id)
        ? {
            ...l,
            cancelado: true,
            sync_arquivado: true,
            sync_pendente: false,
            pago: false,
            sync_orfao_motivo: 'Duplicata venda balcão (dedupe local)',
            updated_at: agora,
            atualizado_em: agora.slice(0, 10),
          }
        : l
    ),
  }
}
