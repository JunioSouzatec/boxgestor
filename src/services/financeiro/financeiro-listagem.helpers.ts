/**
 * Helpers de listagem/origem do Financeiro (somente leitura/exibição).
 * Não altera persistência de OS, caixa ou estoque.
 *
 * Receitas = lançamentos pagos + counter_sales pagas (fonte operacional VB).
 */
import type { LancamentoFinanceiro } from '@/types/financeiro'
import type { VendaBalcao } from '@/types/venda-balcao'
import {
  dataNegocioVendaBalcao,
  isLancamentoVendaBalcao,
  vendaBalcaoPaga,
  vendaBalcaoPendente,
} from '@/services/venda-balcao/venda-balcao-gestor.helpers'
import {
  deduplicarReceitasVendaBalcaoLocais,
  extrairCounterSaleIdDeLancamento,
  extrairCounterSaleIdDeObservacao,
} from '@/services/venda-balcao/venda-balcao-financeiro.service'
import {
  chavePagamentoVendaBalcao,
  formaBalcaoParaFinanceiro,
  formatarFormaBalcaoComParcelas,
  obterParcelasCraftMetaVenda,
} from '@/services/venda-balcao/venda-balcao-forma.helpers'

export type OrigemFinanceiro = 'os' | 'venda_balcao' | 'manual'

export type FiltroOrigemFinanceiro = 'todas' | OrigemFinanceiro

/** Marca linhas sintéticas vindas de counter_sales (só exibição). */
export const FONTE_EXIBICAO_COUNTER_SALES = 'counter_sales'

export function classificarOrigemLancamento(l: LancamentoFinanceiro): OrigemFinanceiro {
  if (l.ordem_servico_id) return 'os'
  if (isLancamentoVendaBalcao(l)) return 'venda_balcao'
  return 'manual'
}

export function labelOrigemFinanceiro(origem: OrigemFinanceiro): string {
  switch (origem) {
    case 'os':
      return 'OS'
    case 'venda_balcao':
      return 'Venda Balcão'
    default:
      return 'Manual'
  }
}

export function tituloExibicaoLancamento(l: LancamentoFinanceiro): string {
  const desc = (l.descricao ?? '').trim()
  if (l.ordem_servico_id) {
    const m = desc.match(/OS\s*#?\s*(\d+)/i)
    if (m) return `OS #${m[1]}`
    return desc || 'Pagamento OS'
  }
  if (isLancamentoVendaBalcao(l)) {
    const m = desc.match(/#\s*(\d+)/)
    if (m) return `Venda Balcão #${m[1]}`
    return desc || 'Venda Balcão'
  }
  return desc || 'Receita manual'
}

export function lancamentoAtivoFinanceiro(l: LancamentoFinanceiro): boolean {
  return !l.cancelado && !l.sync_arquivado
}

export function isReceitaSomenteExibicaoCounterSale(l: LancamentoFinanceiro): boolean {
  return l.craft_meta?.fonte_exibicao === FONTE_EXIBICAO_COUNTER_SALES
}

/** Chave estável para dedupe VB (lançamento ↔ counter_sale). */
export function chaveDedupeVendaBalcao(l: LancamentoFinanceiro): string | null {
  const saleId = extrairCounterSaleIdDeLancamento(l)
  if (saleId) return chavePagamentoVendaBalcao(saleId)
  const cp = l.client_payment_id?.trim()
  if (cp?.startsWith('counter-sale-payment:')) return cp
  return null
}

export function filtrarVendasBalcaoPendentes(vendas: VendaBalcao[]): VendaBalcao[] {
  return vendas
    .filter(vendaBalcaoPendente)
    .sort((a, b) => {
      const da = a.sold_at || a.created_at || ''
      const db = b.sold_at || b.created_at || ''
      return db.localeCompare(da)
    })
}

export function filtrarVendasBalcaoPagas(vendas: VendaBalcao[]): VendaBalcao[] {
  return vendas
    .filter((v) => {
      if (!vendaBalcaoPaga(v)) return false
      const total = Number(v.total) || 0
      const paid = Number(v.paid_amount)
      // paid_amount > 0 OU total pago (paid_amount ausente mas status paid)
      if (Number.isFinite(paid) && paid > 0) return true
      return total > 0 && (v.payment_status === 'paid' || v.status === 'paid')
    })
    .sort((a, b) => {
      const da = a.sold_at || a.created_at || ''
      const db = b.sold_at || b.created_at || ''
      return db.localeCompare(da)
    })
}

export function labelNumeroVendaBalcao(v: VendaBalcao): string {
  if (v.sale_number != null) return `Venda Balcão #${v.sale_number}`
  return `Venda Balcão ${v.id.slice(0, 8)}`
}

/** Converte counter_sale paga em linha de receita para a UI do Financeiro. */
export function lancamentoSinteticoDeVendaBalcaoPaga(
  venda: VendaBalcao,
  officeId?: string
): LancamentoFinanceiro | null {
  const total = Number(venda.paid_amount) > 0 ? Number(venda.paid_amount) : Number(venda.total) || 0
  if (!(total > 0)) {
    console.info('[Financeiro][Receitas][counter-sale]', {
      saleId: venda.id,
      status: venda.status,
      payment_status: venda.payment_status,
      total: venda.total,
      paid_amount: venda.paid_amount,
      payment_method: venda.payment_method,
      included: false,
      motivo: 'valor_invalido',
    })
    return null
  }

  const formaRaw = venda.payment_method
  const formaFin = formaBalcaoParaFinanceiro(formaRaw) ?? 'outro'
  const parcelas = obterParcelasCraftMetaVenda(venda)
  const chave = chavePagamentoVendaBalcao(venda.id)
  const data = dataNegocioVendaBalcao(venda)
  const office = officeId || venda.office_id

  const labelForma =
    (typeof venda.craft_meta?.payment_method_label === 'string' &&
      venda.craft_meta.payment_method_label.trim()) ||
    formatarFormaBalcaoComParcelas(formaRaw, parcelas)

  const lancamento: LancamentoFinanceiro = {
    id: chave,
    oficina_id: office,
    office_id: office,
    tipo: 'receita',
    descricao: `Venda balcão ${venda.sale_number != null ? `#${venda.sale_number}` : venda.id.slice(0, 8)}`,
    valor: Math.round(total * 100) / 100,
    forma_pagamento: formaFin,
    data,
    pago: true,
    parcelas: formaFin === 'credito' ? parcelas ?? 1 : undefined,
    observacao: `counter_sale_id:${venda.id} · origem:counter_sale`,
    usuario_nome: venda.seller_name,
    cancelado: false,
    client_payment_id: chave,
    sync_pendente: false,
    criado_em: data,
    atualizado_em: data,
    created_at: venda.sold_at || venda.created_at,
    updated_at: venda.updated_at || venda.sold_at || venda.created_at,
    craft_meta: {
      ...(venda.craft_meta ?? {}),
      fonte_exibicao: FONTE_EXIBICAO_COUNTER_SALES,
      origin_type: 'counter_sale',
      origin_id: venda.id,
      counter_sale_id: venda.id,
      payment_method_label: labelForma,
      payment_method_base:
        venda.craft_meta?.payment_method_base ?? labelForma.split(' — ')[0],
      installments: parcelas ?? null,
    },
  }

  console.info('[Financeiro][Receitas][counter-sale]', {
    saleId: venda.id,
    status: venda.status,
    payment_status: venda.payment_status,
    total: venda.total,
    paid_amount: venda.paid_amount,
    payment_method: venda.payment_method,
    included: true,
  })

  return lancamento
}

function enriquecerLancamentoComVenda(
  lancamento: LancamentoFinanceiro,
  venda: VendaBalcao
): LancamentoFinanceiro {
  const parcelas =
    lancamento.parcelas ??
    obterParcelasCraftMetaVenda(venda) ??
    (typeof venda.craft_meta?.installments === 'number'
      ? venda.craft_meta.installments
      : undefined)
  const label =
    (typeof venda.craft_meta?.payment_method_label === 'string' &&
      venda.craft_meta.payment_method_label.trim()) ||
    (typeof lancamento.craft_meta?.payment_method_label === 'string'
      ? String(lancamento.craft_meta.payment_method_label)
      : undefined)

  return {
    ...lancamento,
    pago: true,
    parcelas: lancamento.forma_pagamento === 'credito' ? parcelas ?? lancamento.parcelas : lancamento.parcelas,
    craft_meta: {
      ...(lancamento.craft_meta ?? {}),
      ...(venda.craft_meta ?? {}),
      origin_type: 'counter_sale',
      origin_id: venda.id,
      counter_sale_id: venda.id,
      ...(label ? { payment_method_label: label } : {}),
      installments: parcelas ?? lancamento.craft_meta?.installments ?? null,
    },
  }
}

/**
 * Lista unificada de receitas recebidas:
 * 1) lançamentos pagos (OS, manual, VB se existir)
 * 2) counter_sales pagas como fonte/fallback
 * Dedupe por sale id / client_payment_id — no máximo 1 linha por venda.
 */
export function listarReceitasRecebidasUnificadas(
  lancamentos: LancamentoFinanceiro[],
  vendasBalcao: VendaBalcao[],
  filtro: FiltroOrigemFinanceiro = 'todas',
  officeId?: string
): LancamentoFinanceiro[] {
  const pagosLocais = lancamentos.filter(
    (l) =>
      l.tipo === 'receita' &&
      lancamentoAtivoFinanceiro(l) &&
      Boolean(l.pago)
  )
  const dedupLocais = deduplicarReceitasVendaBalcaoLocais(pagosLocais).lancamentos.filter(
    (l) => lancamentoAtivoFinanceiro(l) && Boolean(l.pago)
  )

  const vendasPagas = filtrarVendasBalcaoPagas(vendasBalcao)
  const porChaveVb = new Map<string, LancamentoFinanceiro>()

  // Indexa lançamentos VB locais
  for (const l of dedupLocais) {
    const chave = chaveDedupeVendaBalcao(l)
    if (chave) porChaveVb.set(chave, l)
  }

  const sintetizados: LancamentoFinanceiro[] = []
  for (const venda of vendasPagas) {
    const chave = chavePagamentoVendaBalcao(venda.id)
    const existente = porChaveVb.get(chave)
    if (existente) {
      porChaveVb.set(chave, enriquecerLancamentoComVenda(existente, venda))
      continue
    }
    const sintetico = lancamentoSinteticoDeVendaBalcaoPaga(venda, officeId)
    if (sintetico) {
      porChaveVb.set(chave, sintetico)
      sintetizados.push(sintetico)
    }
  }

  // Não-VB (OS + manuais) + VB dedupados (local enriquecido ou sintético)
  const naoVb = dedupLocais.filter((l) => !chaveDedupeVendaBalcao(l))
  const vbUnicos = [...porChaveVb.values()]
  const unificados = [...naoVb, ...vbUnicos]

  const filtrados =
    filtro === 'todas'
      ? unificados
      : unificados.filter((l) => classificarOrigemLancamento(l) === filtro)

  const origemVb = unificados.filter((l) => classificarOrigemLancamento(l) === 'venda_balcao')

  console.info('[Financeiro][Receitas][fontes]', {
    lancamentos_pagos_total: dedupLocais.length,
    counter_sales_pagas_total: vendasPagas.length,
    receitas_normalizadas_total: unificados.length,
    receitas_venda_balcao_total: origemVb.length,
    receitas_exibidas_filtro: filtrados.length,
    filtro,
    sintetizados_counter_sales: sintetizados.length,
  })

  return [...filtrados].sort(
    (a, b) =>
      b.data.localeCompare(a.data) ||
      (b.updated_at || '').localeCompare(a.updated_at || '') ||
      b.id.localeCompare(a.id)
  )
}

/** @deprecated Use listarReceitasRecebidasUnificadas — mantido para compat. */
export function listarReceitasRecebidas(
  lancamentos: LancamentoFinanceiro[],
  filtro: FiltroOrigemFinanceiro = 'todas'
): LancamentoFinanceiro[] {
  return listarReceitasRecebidasUnificadas(lancamentos, [], filtro)
}

/** Lançamentos gerais pendentes (sem OS e sem VB). */
export function listarLancamentosGeraisPendentes(
  lancamentos: LancamentoFinanceiro[]
): LancamentoFinanceiro[] {
  const ativos = lancamentos.filter(
    (l) =>
      l.tipo === 'receita' &&
      lancamentoAtivoFinanceiro(l) &&
      !l.pago &&
      classificarOrigemLancamento(l) === 'manual'
  )
  return [...ativos].sort((a, b) => b.data.localeCompare(a.data))
}

/** Pendentes de VB vindos só dos lançamentos (legado), sem venda ativa correspondente. */
export function listarLancamentosVbPendentesSemVenda(
  lancamentos: LancamentoFinanceiro[],
  vendasPendentes: VendaBalcao[]
): LancamentoFinanceiro[] {
  const idsVenda = new Set(vendasPendentes.map((v) => v.id))
  const chavesVenda = new Set(vendasPendentes.map((v) => chavePagamentoVendaBalcao(v.id)))

  const ativos = lancamentos.filter((l) => {
    if (l.tipo !== 'receita' || !lancamentoAtivoFinanceiro(l) || l.pago) return false
    if (!isLancamentoVendaBalcao(l)) return false
    const saleId =
      extrairCounterSaleIdDeLancamento(l) || extrairCounterSaleIdDeObservacao(l.observacao)
    if (saleId && idsVenda.has(saleId)) return false
    if (l.client_payment_id && chavesVenda.has(l.client_payment_id)) return false
    return true
  })

  const dedup = deduplicarReceitasVendaBalcaoLocais(ativos).lancamentos.filter(
    (l) => lancamentoAtivoFinanceiro(l) && !l.pago
  )
  return [...dedup].sort((a, b) => b.data.localeCompare(a.data))
}
