/**
 * RC2 Venda Balcão A3 — helpers para merge no Gestor Inteligente.
 * Fonte: counter_sales (evita double-count com lançamentos VB).
 */
import { extrairDataBrasilYYYYMMDD } from '@/lib/data-local'
import { dataNoPeriodo, type IntervaloPeriodo } from '@/services/relatorios.service'
import type { FormaPagamentoStat, PontoFaturamentoDia } from '@/services/gestor-inteligente.service'
import { getLabelFormaPagamento } from '@/types/labels'
import type { VendaBalcao, VendaBalcaoItem } from '@/types/venda-balcao'
import { formaBalcaoParaFinanceiro } from '@/services/venda-balcao/venda-balcao-forma.helpers'

export function vendaBalcaoAtiva(v: VendaBalcao): boolean {
  return !v.deleted_at && v.status !== 'canceled' && v.payment_status !== 'canceled'
}

export function vendaBalcaoPaga(v: VendaBalcao): boolean {
  return vendaBalcaoAtiva(v) && v.payment_status === 'paid'
}

export function vendaBalcaoPendente(v: VendaBalcao): boolean {
  return vendaBalcaoAtiva(v) && v.payment_status === 'pending'
}

export function dataNegocioVendaBalcao(v: VendaBalcao): string {
  return extrairDataBrasilYYYYMMDD(v.sold_at || v.created_at)
}

export function vendasBalcaoPagasNoPeriodo(
  vendas: VendaBalcao[],
  intervalo: IntervaloPeriodo
): VendaBalcao[] {
  return vendas.filter(
    (v) => vendaBalcaoPaga(v) && dataNoPeriodo(dataNegocioVendaBalcao(v), intervalo)
  )
}

export function totalVendasBalcaoPagas(
  vendas: VendaBalcao[],
  intervalo: IntervaloPeriodo
): number {
  return Math.round(
    vendasBalcaoPagasNoPeriodo(vendas, intervalo).reduce(
      (a, v) => a + (Number(v.total) || 0),
      0
    ) * 100
  ) / 100
}

export function totalVendasBalcaoAReceber(vendas: VendaBalcao[]): {
  valor: number
  quantidade: number
} {
  const pendentes = vendas.filter(vendaBalcaoPendente)
  const valor = Math.round(
    pendentes.reduce(
      (a, v) => a + (Number(v.pending_amount) || Number(v.total) || 0),
      0
    ) * 100
  ) / 100
  return { valor, quantidade: pendentes.length }
}

export function mesclarFaturamentoPorDiaComBalcao(
  base: PontoFaturamentoDia[],
  vendas: VendaBalcao[],
  intervalo: IntervaloPeriodo
): PontoFaturamentoDia[] {
  const mapaValor = new Map(base.map((p) => [p.data, p.valor]))
  const mapaQtd = new Map(base.map((p) => [p.data, p.quantidade]))
  for (const v of vendasBalcaoPagasNoPeriodo(vendas, intervalo)) {
    const dia = dataNegocioVendaBalcao(v)
    if (!mapaValor.has(dia)) continue
    mapaValor.set(dia, (mapaValor.get(dia) ?? 0) + (Number(v.total) || 0))
    mapaQtd.set(dia, (mapaQtd.get(dia) ?? 0) + 1)
  }
  return base.map((p) => ({
    ...p,
    valor: Math.round((mapaValor.get(p.data) ?? 0) * 100) / 100,
    quantidade: mapaQtd.get(p.data) ?? 0,
  }))
}

export function mesclarFormasPagamentoComBalcao(
  base: FormaPagamentoStat[],
  vendas: VendaBalcao[],
  intervalo: IntervaloPeriodo
): FormaPagamentoStat[] {
  const mapa = new Map<string, { valor: number; quantidade: number }>()
  for (const f of base) {
    mapa.set(f.forma, { valor: f.valor, quantidade: f.quantidade })
  }
  for (const v of vendasBalcaoPagasNoPeriodo(vendas, intervalo)) {
    const formaFin = formaBalcaoParaFinanceiro(v.payment_method) ?? 'outro'
    const atual = mapa.get(formaFin) ?? { valor: 0, quantidade: 0 }
    mapa.set(formaFin, {
      valor: atual.valor + (Number(v.total) || 0),
      quantidade: atual.quantidade + 1,
    })
  }
  return [...mapa.entries()]
    .map(([forma, v]) => ({
      forma,
      label: getLabelFormaPagamento(forma),
      valor: Math.round(v.valor * 100) / 100,
      quantidade: v.quantidade,
    }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 8)
}

export function agregarPecasVendaBalcao(
  vendas: VendaBalcao[],
  intervalo: IntervaloPeriodo
): Array<{ nome: string; quantidade: number; valor: number }> {
  const mapa = new Map<string, { nome: string; quantidade: number; valor: number }>()
  for (const v of vendasBalcaoPagasNoPeriodo(vendas, intervalo)) {
    const itens = (v.itens ?? []) as VendaBalcaoItem[]
    for (const i of itens) {
      const nome = i.item_name?.trim() || 'Peça'
      const key = (i.inventory_local_id || nome).toLowerCase()
      const atual = mapa.get(key) ?? { nome, quantidade: 0, valor: 0 }
      mapa.set(key, {
        nome: atual.nome,
        quantidade: atual.quantidade + (Number(i.quantity) || 0),
        valor: atual.valor + (Number(i.total) || 0),
      })
    }
  }
  return [...mapa.values()]
    .map((p) => ({
      ...p,
      quantidade: Math.round(p.quantidade * 1000) / 1000,
      valor: Math.round(p.valor * 100) / 100,
    }))
    .sort((a, b) => b.quantidade - a.quantidade || b.valor - a.valor)
}

export function mesclarTopPecas(
  base: Array<{ nome: string; quantidade: number; valor: number }>,
  extra: Array<{ nome: string; quantidade: number; valor: number }>,
  limite = 8
): Array<{ nome: string; quantidade: number; valor: number }> {
  const mapa = new Map<string, { nome: string; quantidade: number; valor: number }>()
  for (const p of [...base, ...extra]) {
    const key = p.nome.trim().toLowerCase()
    const atual = mapa.get(key) ?? { nome: p.nome, quantidade: 0, valor: 0 }
    mapa.set(key, {
      nome: atual.nome || p.nome,
      quantidade: atual.quantidade + p.quantidade,
      valor: atual.valor + p.valor,
    })
  }
  return [...mapa.values()]
    .sort((a, b) => b.quantidade - a.quantidade || b.valor - a.valor)
    .slice(0, limite)
}

/** Lançamentos de VB não devem somar de novo no recebido do gestor. */
export function isLancamentoVendaBalcao(l: {
  client_payment_id?: string
  observacao?: string
  descricao?: string
  craft_meta?: Record<string, unknown>
}): boolean {
  const meta = l.craft_meta
  if (meta?.origin_type === 'counter_sale') return true
  if (typeof meta?.counter_sale_id === 'string' && meta.counter_sale_id.trim()) return true
  const c = l.client_payment_id ?? ''
  if (c.startsWith('counter-sale-payment:')) return true
  if (l.observacao?.includes('origem:counter_sale')) return true
  if (l.observacao?.includes('counter_sale_id:')) return true
  // Fallback: descrição típica da receita VB
  const desc = (l.descricao ?? '').toLowerCase()
  return desc.includes('venda balcão') || desc.includes('venda balcao')
}
