import type { Cliente, LancamentoFinanceiro, Moto, OrdemServico, Peca } from '@/types'
import type { FormaPagamento, StatusOS } from '@/types/enums'
import { STATUS_OS, getLabelFormaPagamento, getLabelStatusOS } from '@/types/labels'

export type PeriodoRelatorio = 'dia' | 'semana' | 'mes' | 'ano'

export interface IntervaloPeriodo {
  tipo: PeriodoRelatorio
  inicio: string
  fim: string
  label: string
}

export interface PontoSerieFinanceira {
  label: string
  receitas: number
  despesas: number
}

export interface RelatorioFaturamento {
  receitas: number
  despesas: number
  lucro: number
  serie: PontoSerieFinanceira[]
}

export interface RelatorioOS {
  abertas: number
  finalizadas: number
  canceladas: number
  porStatus: { status: StatusOS; label: string; quantidade: number }[]
  ticketMedio: number
}

export interface ClienteRelatorioItem {
  clienteId: string
  nome: string
  valorTotal: number
  quantidade: number
  ultimaVisita?: string
}

export interface RelatorioClientes {
  topGastos: ClienteRelatorioItem[]
  topFrequentes: ClienteRelatorioItem[]
  semRetorno90: ClienteRelatorioItem[]
}

export interface MotoRelatorioItem {
  motoId: string
  label: string
  servicos: number
  valorTotal: number
  kmMedia?: number
}

export interface RelatorioMotos {
  maisServicos: MotoRelatorioItem[]
  historicoResumo: MotoRelatorioItem[]
  kmMediaGeral: number
}

export interface PecaVendidaItem {
  pecaId: string
  nome: string
  quantidade: number
  receita: number
}

export interface PecaLucroItem {
  pecaId: string
  nome: string
  quantidade: number
  lucroUnitario: number
  lucroTotal: number
}

export interface RelatorioEstoque {
  maisVendidas: PecaVendidaItem[]
  estoqueBaixo: Peca[]
  valorTotalEstoque: number
  lucroPorPeca: PecaLucroItem[]
}

export interface LancamentoPendenteItem {
  id: string
  descricao: string
  valor: number
  vencimento?: string
  data: string
}

export interface FormaPagamentoItem {
  forma: FormaPagamento
  label: string
  quantidade: number
  valor: number
}

export interface RelatorioFinanceiro {
  contasReceber: LancamentoPendenteItem[]
  contasPagar: LancamentoPendenteItem[]
  totalReceber: number
  totalPagar: number
  recebimentosPendentes: number
  formasPagamento: FormaPagamentoItem[]
}

export interface DadosRelatorios {
  clientes: Cliente[]
  motos: Moto[]
  ordens: OrdemServico[]
  pecas: Peca[]
  lancamentos: LancamentoFinanceiro[]
}

const OS_FINALIZADAS: StatusOS[] = ['finalizada', 'entregue']
const OS_ABERTAS: StatusOS[] = STATUS_OS.map((s) => s.value).filter(
  (s) => !OS_FINALIZADAS.includes(s) && s !== 'cancelada'
)

function formatarDataLocal(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function inicioSemana(d: Date): Date {
  const copy = new Date(d)
  const dia = copy.getDay()
  const diff = dia === 0 ? 6 : dia - 1
  copy.setDate(copy.getDate() - diff)
  copy.setHours(0, 0, 0, 0)
  return copy
}

export function calcularIntervaloPeriodo(
  tipo: PeriodoRelatorio,
  referencia = new Date()
): IntervaloPeriodo {
  const fim = formatarDataLocal(referencia)

  switch (tipo) {
    case 'dia':
      return { tipo, inicio: fim, fim, label: 'Hoje' }
    case 'semana': {
      const inicio = formatarDataLocal(inicioSemana(referencia))
      return { tipo, inicio, fim, label: 'Esta semana' }
    }
    case 'mes': {
      const inicio = formatarDataLocal(new Date(referencia.getFullYear(), referencia.getMonth(), 1))
      return { tipo, inicio, fim, label: 'Este mês' }
    }
    case 'ano': {
      const inicio = formatarDataLocal(new Date(referencia.getFullYear(), 0, 1))
      return { tipo, inicio, fim, label: 'Este ano' }
    }
  }
}

export function dataNoPeriodo(data: string, intervalo: IntervaloPeriodo): boolean {
  const normalizada = data.slice(0, 10)
  return normalizada >= intervalo.inicio && normalizada <= intervalo.fim
}

function filtrarLancamentosPeriodo(
  lancamentos: LancamentoFinanceiro[],
  intervalo: IntervaloPeriodo
): LancamentoFinanceiro[] {
  return lancamentos.filter((l) => dataNoPeriodo(l.data, intervalo))
}

function filtrarOrdensPeriodo(ordens: OrdemServico[], intervalo: IntervaloPeriodo): OrdemServico[] {
  return ordens.filter((o) => dataNoPeriodo(o.criado_em ?? o.created_at ?? '', intervalo))
}

function gerarSerieFaturamento(
  lancamentos: LancamentoFinanceiro[],
  intervalo: IntervaloPeriodo
): PontoSerieFinanceira[] {
  const filtrados = filtrarLancamentosPeriodo(lancamentos, intervalo)

  if (intervalo.tipo === 'dia') {
    const receitas = filtrados.filter((l) => l.tipo === 'receita').reduce((a, l) => a + l.valor, 0)
    const despesas = filtrados.filter((l) => l.tipo === 'despesa').reduce((a, l) => a + l.valor, 0)
    return [{ label: 'Hoje', receitas, despesas }]
  }

  if (intervalo.tipo === 'semana') {
    const pontos: PontoSerieFinanceira[] = []
    const dias = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
    const inicio = new Date(intervalo.inicio + 'T12:00:00')
    for (let i = 0; i < 7; i++) {
      const d = new Date(inicio)
      d.setDate(inicio.getDate() + i)
      const chave = formatarDataLocal(d)
      const doDia = filtrados.filter((l) => l.data.slice(0, 10) === chave)
      pontos.push({
        label: dias[i],
        receitas: doDia.filter((l) => l.tipo === 'receita').reduce((a, l) => a + l.valor, 0),
        despesas: doDia.filter((l) => l.tipo === 'despesa').reduce((a, l) => a + l.valor, 0),
      })
    }
    return pontos
  }

  if (intervalo.tipo === 'mes') {
    const pontos: PontoSerieFinanceira[] = []
    const inicio = new Date(intervalo.inicio + 'T12:00:00')
    const fim = new Date(intervalo.fim + 'T12:00:00')
    let semana = 1
    let cursor = new Date(inicio)

    while (cursor <= fim) {
      const fimSemana = new Date(cursor)
      fimSemana.setDate(cursor.getDate() + 6)
      if (fimSemana > fim) fimSemana.setTime(fim.getTime())

      const iniStr = formatarDataLocal(cursor)
      const fimStr = formatarDataLocal(fimSemana)
      const doPeriodo = filtrados.filter((l) => {
        const d = l.data.slice(0, 10)
        return d >= iniStr && d <= fimStr
      })

      pontos.push({
        label: `Sem ${semana}`,
        receitas: doPeriodo.filter((l) => l.tipo === 'receita').reduce((a, l) => a + l.valor, 0),
        despesas: doPeriodo.filter((l) => l.tipo === 'despesa').reduce((a, l) => a + l.valor, 0),
      })

      cursor.setDate(cursor.getDate() + 7)
      semana++
    }
    return pontos
  }

  const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  return meses.map((label, idx) => {
    const prefixo = `${intervalo.inicio.slice(0, 4)}-${String(idx + 1).padStart(2, '0')}`
    const doMes = filtrados.filter((l) => l.data.startsWith(prefixo))
    return {
      label,
      receitas: doMes.filter((l) => l.tipo === 'receita').reduce((a, l) => a + l.valor, 0),
      despesas: doMes.filter((l) => l.tipo === 'despesa').reduce((a, l) => a + l.valor, 0),
    }
  })
}

export function calcularRelatorioFaturamento(
  lancamentos: LancamentoFinanceiro[],
  intervalo: IntervaloPeriodo
): RelatorioFaturamento {
  const filtrados = filtrarLancamentosPeriodo(lancamentos, intervalo)
  const receitas = filtrados.filter((l) => l.tipo === 'receita').reduce((a, l) => a + l.valor, 0)
  const despesas = filtrados.filter((l) => l.tipo === 'despesa').reduce((a, l) => a + l.valor, 0)

  return {
    receitas,
    despesas,
    lucro: receitas - despesas,
    serie: gerarSerieFaturamento(lancamentos, intervalo),
  }
}

export function calcularRelatorioOS(
  ordens: OrdemServico[],
  intervalo: IntervaloPeriodo
): RelatorioOS {
  const filtradas = filtrarOrdensPeriodo(ordens, intervalo)
  const finalizadas = filtradas.filter((o) => OS_FINALIZADAS.includes(o.status))
  const canceladas = filtradas.filter((o) => o.status === 'cancelada')
  const abertas = filtradas.filter((o) => OS_ABERTAS.includes(o.status))

  const porStatus = STATUS_OS.map(({ value, label }) => ({
    status: value,
    label,
    quantidade: filtradas.filter((o) => o.status === value).length,
  })).filter((s) => s.quantidade > 0)

  const ticketMedio =
    finalizadas.length > 0
      ? finalizadas.reduce((a, o) => a + o.valor_total, 0) / finalizadas.length
      : 0

  return {
    abertas: abertas.length,
    finalizadas: finalizadas.length,
    canceladas: canceladas.length,
    porStatus,
    ticketMedio,
  }
}

function mapaClientesOrdens(ordens: OrdemServico[], clientes: Cliente[]) {
  const mapa = new Map<string, { valorTotal: number; quantidade: number; ultimaVisita: string }>()

  for (const os of ordens) {
    if (!OS_FINALIZADAS.includes(os.status)) continue
    const data = os.criado_em ?? os.updated_at ?? ''
    const atual = mapa.get(os.cliente_id) ?? { valorTotal: 0, quantidade: 0, ultimaVisita: '' }
    mapa.set(os.cliente_id, {
      valorTotal: atual.valorTotal + os.valor_total,
      quantidade: atual.quantidade + 1,
      ultimaVisita: data > atual.ultimaVisita ? data : atual.ultimaVisita,
    })
  }

  return [...mapa.entries()].map(([clienteId, stats]) => ({
    clienteId,
    nome: clientes.find((c) => c.id === clienteId)?.nome ?? 'Cliente',
    ...stats,
  }))
}

export function calcularRelatorioClientes(
  ordens: OrdemServico[],
  clientes: Cliente[],
  intervalo: IntervaloPeriodo
): RelatorioClientes {
  const ordensPeriodo = filtrarOrdensPeriodo(ordens, intervalo)
  const stats = mapaClientesOrdens(ordensPeriodo, clientes)

  const topGastos = [...stats]
    .sort((a, b) => b.valorTotal - a.valorTotal)
    .slice(0, 10)
    .map(({ clienteId, nome, valorTotal, quantidade, ultimaVisita }) => ({
      clienteId,
      nome,
      valorTotal,
      quantidade,
      ultimaVisita,
    }))

  const topFrequentes = [...stats]
    .sort((a, b) => b.quantidade - a.quantidade || b.valorTotal - a.valorTotal)
    .slice(0, 10)
    .map(({ clienteId, nome, valorTotal, quantidade, ultimaVisita }) => ({
      clienteId,
      nome,
      valorTotal,
      quantidade,
      ultimaVisita,
    }))

  const limite90 = new Date()
  limite90.setDate(limite90.getDate() - 90)
  const limiteStr = formatarDataLocal(limite90)

  const statsGeral = mapaClientesOrdens(ordens, clientes)
  const semRetorno90: ClienteRelatorioItem[] = []

  for (const c of clientes) {
    const stat = statsGeral.find((s) => s.clienteId === c.id)
    if (stat?.ultimaVisita && stat.ultimaVisita >= limiteStr) continue

    semRetorno90.push({
      clienteId: c.id,
      nome: c.nome,
      valorTotal: stat?.valorTotal ?? 0,
      quantidade: stat?.quantidade ?? 0,
      ultimaVisita: stat?.ultimaVisita || undefined,
    })
  }

  semRetorno90.sort((a, b) => (a.ultimaVisita ?? '').localeCompare(b.ultimaVisita ?? ''))
  const semRetorno90Limitado = semRetorno90.slice(0, 15)

  return { topGastos, topFrequentes, semRetorno90: semRetorno90Limitado }
}

export function calcularRelatorioMotos(
  ordens: OrdemServico[],
  motos: Moto[],
  intervalo: IntervaloPeriodo
): RelatorioMotos {
  const ordensPeriodo = filtrarOrdensPeriodo(ordens, intervalo).filter((o) =>
    OS_FINALIZADAS.includes(o.status)
  )

  const mapa = new Map<string, { servicos: number; valorTotal: number; kms: number[] }>()

  for (const os of ordensPeriodo) {
    const atual = mapa.get(os.moto_id) ?? { servicos: 0, valorTotal: 0, kms: [] }
    const km = os.quilometragem_saida ?? os.quilometragem_entrada
    mapa.set(os.moto_id, {
      servicos: atual.servicos + 1,
      valorTotal: atual.valorTotal + os.valor_total,
      kms: km !== undefined ? [...atual.kms, km] : atual.kms,
    })
  }

  const toItem = (motoId: string, stats: { servicos: number; valorTotal: number; kms: number[] }): MotoRelatorioItem => {
    const moto = motos.find((m) => m.id === motoId)
    const kmMedia =
      stats.kms.length > 0 ? Math.round(stats.kms.reduce((a, k) => a + k, 0) / stats.kms.length) : undefined
    return {
      motoId,
      label: moto ? `${moto.marca} ${moto.modelo} (${moto.placa})` : motoId,
      servicos: stats.servicos,
      valorTotal: stats.valorTotal,
      kmMedia,
    }
  }

  const items = [...mapa.entries()].map(([id, stats]) => toItem(id, stats))
  const maisServicos = [...items].sort((a, b) => b.servicos - a.servicos).slice(0, 10)
  const historicoResumo = [...items].sort((a, b) => b.valorTotal - a.valorTotal).slice(0, 10)

  const todasKms = motos.map((m) => m.quilometragem).filter((k) => k > 0)
  const kmMediaGeral =
    todasKms.length > 0 ? Math.round(todasKms.reduce((a, k) => a + k, 0) / todasKms.length) : 0

  return { maisServicos, historicoResumo, kmMediaGeral }
}

export function calcularRelatorioEstoque(
  ordens: OrdemServico[],
  pecas: Peca[],
  intervalo: IntervaloPeriodo
): RelatorioEstoque {
  const ordensPeriodo = filtrarOrdensPeriodo(ordens, intervalo).filter((o) =>
    OS_FINALIZADAS.includes(o.status)
  )

  const vendas = new Map<string, { nome: string; quantidade: number; receita: number }>()

  for (const os of ordensPeriodo) {
    for (const pu of os.pecas_utilizadas ?? []) {
      const atual = vendas.get(pu.peca_id) ?? { nome: pu.nome, quantidade: 0, receita: 0 }
      vendas.set(pu.peca_id, {
        nome: pu.nome,
        quantidade: atual.quantidade + pu.quantidade,
        receita: atual.receita + pu.quantidade * pu.valor_unitario,
      })
    }
  }

  const maisVendidas = [...vendas.entries()]
    .map(([pecaId, stats]) => ({ pecaId, ...stats }))
    .sort((a, b) => b.quantidade - a.quantidade)
    .slice(0, 10)

  const estoqueBaixo = pecas
    .filter((p) => p.quantidade <= p.estoque_minimo)
    .sort((a, b) => a.quantidade - b.quantidade)

  const valorTotalEstoque = pecas.reduce((a, p) => a + p.quantidade * p.custo, 0)

  const lucroPorPeca = pecas
    .map((p) => ({
      pecaId: p.id,
      nome: p.nome,
      quantidade: p.quantidade,
      lucroUnitario: p.preco_venda - p.custo,
      lucroTotal: (p.preco_venda - p.custo) * p.quantidade,
    }))
    .filter((p) => p.lucroUnitario > 0)
    .sort((a, b) => b.lucroTotal - a.lucroTotal)
    .slice(0, 10)

  return { maisVendidas, estoqueBaixo, valorTotalEstoque, lucroPorPeca }
}

export function calcularRelatorioFinanceiro(
  lancamentos: LancamentoFinanceiro[],
  intervalo: IntervaloPeriodo
): RelatorioFinanceiro {
  const filtrados = filtrarLancamentosPeriodo(lancamentos, intervalo)

  const contasReceber = filtrados
    .filter((l) => l.tipo === 'receita' && !l.pago)
    .map((l) => ({
      id: l.id,
      descricao: l.descricao,
      valor: l.valor,
      vencimento: l.vencimento,
      data: l.data,
    }))

  const contasPagar = filtrados
    .filter((l) => l.tipo === 'despesa' && !l.pago)
    .map((l) => ({
      id: l.id,
      descricao: l.descricao,
      valor: l.valor,
      vencimento: l.vencimento,
      data: l.data,
    }))

  const formasMap = new Map<FormaPagamento, { quantidade: number; valor: number }>()
  for (const l of filtrados.filter((x) => x.tipo === 'receita' && x.pago)) {
    const atual = formasMap.get(l.forma_pagamento) ?? { quantidade: 0, valor: 0 }
    formasMap.set(l.forma_pagamento, {
      quantidade: atual.quantidade + 1,
      valor: atual.valor + l.valor,
    })
  }

  const formasPagamento = [...formasMap.entries()]
    .map(([forma, stats]) => ({
      forma,
      label: getLabelFormaPagamento(forma),
      ...stats,
    }))
    .sort((a, b) => b.valor - a.valor)

  const totalReceber = contasReceber.reduce((a, l) => a + l.valor, 0)
  const totalPagar = contasPagar.reduce((a, l) => a + l.valor, 0)

  return {
    contasReceber,
    contasPagar,
    totalReceber,
    totalPagar,
    recebimentosPendentes: totalReceber,
    formasPagamento,
  }
}

export function gerarRelatoriosCompletos(
  dados: DadosRelatorios,
  intervalo: IntervaloPeriodo
) {
  return {
    intervalo,
    faturamento: calcularRelatorioFaturamento(dados.lancamentos, intervalo),
    os: calcularRelatorioOS(dados.ordens, intervalo),
    clientes: calcularRelatorioClientes(dados.ordens, dados.clientes, intervalo),
    motos: calcularRelatorioMotos(dados.ordens, dados.motos, intervalo),
    estoque: calcularRelatorioEstoque(dados.ordens, dados.pecas, intervalo),
    financeiro: calcularRelatorioFinanceiro(dados.lancamentos, intervalo),
  }
}

export function getLabelPeriodo(tipo: PeriodoRelatorio): string {
  const labels: Record<PeriodoRelatorio, string> = {
    dia: 'Dia',
    semana: 'Semana',
    mes: 'Mês',
    ano: 'Ano',
  }
  return labels[tipo]
}

export { getLabelStatusOS }
