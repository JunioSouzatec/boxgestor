import type { Cliente, LancamentoFinanceiro, Moto, OrdemServico, Peca } from '@/types'
import type { StatusOS } from '@/types/enums'
import { isPagamentoOsAtivo } from '@/services/pagamentos/payment-active.helpers'
import {
  calcularResumoFinanceiroOS,
  calcularTotalGeralDeCampos,
} from '@/services/os-financeiro.service'
import {
  calcularTopPecasUsadas,
  calcularTopServicos,
  type PecaUsadaStat,
  type ServicoExecutadoStat,
} from '@/services/analytics.service'
import { calcularResumoEstoque } from '@/services/estoque.service'
import {
  dataNoPeriodo,
  type IntervaloPeriodo,
} from '@/services/relatorios.service'

export type PeriodoDashboardPreset = 'hoje' | 'semana' | 'mes' | 'mes_passado' | 'personalizado'

const OS_STATUS_ABERTAS: StatusOS[] = [
  'recebida',
  'em_diagnostico',
  'aguardando_aprovacao',
  'em_servico',
  'aguardando_peca',
]

const OS_CONCLUIDAS: StatusOS[] = ['finalizada', 'entregue']

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

export function calcularIntervaloDashboardPreset(
  preset: PeriodoDashboardPreset,
  referencia = new Date(),
  personalizado?: { inicio: string; fim: string }
): IntervaloPeriodo {
  const fim = formatarDataLocal(referencia)

  switch (preset) {
    case 'hoje':
      return { tipo: 'dia', inicio: fim, fim, label: 'Hoje' }
    case 'semana': {
      const inicio = formatarDataLocal(inicioSemana(referencia))
      return { tipo: 'semana', inicio, fim, label: 'Esta semana' }
    }
    case 'mes': {
      const inicio = formatarDataLocal(new Date(referencia.getFullYear(), referencia.getMonth(), 1))
      return { tipo: 'mes', inicio, fim, label: 'Este mês' }
    }
    case 'mes_passado': {
      const inicio = formatarDataLocal(
        new Date(referencia.getFullYear(), referencia.getMonth() - 1, 1)
      )
      const fimMesPassado = formatarDataLocal(
        new Date(referencia.getFullYear(), referencia.getMonth(), 0)
      )
      return { tipo: 'mes', inicio, fim: fimMesPassado, label: 'Mês passado' }
    }
    case 'personalizado': {
      const inicio = personalizado?.inicio?.slice(0, 10) ?? fim
      const fimCustom = personalizado?.fim?.slice(0, 10) ?? fim
      return {
        tipo: 'mes',
        inicio: inicio <= fimCustom ? inicio : fimCustom,
        fim: inicio <= fimCustom ? fimCustom : inicio,
        label: 'Período personalizado',
      }
    }
  }
}

export function getLabelPeriodoDashboard(preset: PeriodoDashboardPreset): string {
  const labels: Record<PeriodoDashboardPreset, string> = {
    hoje: 'Hoje',
    semana: 'Esta semana',
    mes: 'Este mês',
    mes_passado: 'Mês passado',
    personalizado: 'Personalizado',
  }
  return labels[preset]
}

function dataReferenciaOsConcluida(os: OrdemServico): string {
  return (os.data_saida ?? os.atualizado_em ?? os.criado_em ?? '').slice(0, 10)
}

export function osConcluidaNoPeriodo(os: OrdemServico, intervalo: IntervaloPeriodo): boolean {
  if (!OS_CONCLUIDAS.includes(os.status)) return false
  return dataNoPeriodo(dataReferenciaOsConcluida(os), intervalo)
}

/** Pagamentos ativos recebidos no período (faturamento real da oficina). */
export function calcularFaturamentoPeriodo(
  lancamentos: LancamentoFinanceiro[],
  intervalo: IntervaloPeriodo
): number {
  return lancamentos
    .filter(
      (l) => isPagamentoOsAtivo(l) && l.pago && dataNoPeriodo(l.data, intervalo)
    )
    .reduce((acc, l) => acc + l.valor, 0)
}

export interface LucroEstimadoPeriodo {
  total: number
  maoObra: number
  pecas: number
  custoPecas: number
  pecasSemCustoUsadas: number
}

/** Lucro estimado proporcional aos pagamentos recebidos no período. */
export function calcularLucroEstimadoPeriodo(
  ordens: OrdemServico[],
  lancamentos: LancamentoFinanceiro[],
  pecas: Peca[],
  intervalo: IntervaloPeriodo
): LucroEstimadoPeriodo {
  const osPorId = new Map(ordens.map((o) => [o.id, o]))
  let maoObra = 0
  let lucroPecas = 0
  let custoPecas = 0
  let pecasSemCustoUsadas = 0

  const pagamentos = lancamentos.filter(
    (l) => isPagamentoOsAtivo(l) && l.pago && dataNoPeriodo(l.data, intervalo)
  )

  for (const l of pagamentos) {
    const os = l.ordem_servico_id ? osPorId.get(l.ordem_servico_id) : undefined
    if (!os || os.status === 'cancelada') continue

    const totalOs = calcularTotalGeralDeCampos(os)
    if (totalOs <= 0) continue

    const ratio = Math.min(1, l.valor / totalOs)
    maoObra += ratio * (os.valor_mao_obra ?? 0)

    for (const pu of os.pecas_utilizadas ?? []) {
      const peca = pu.peca_id ? pecas.find((p) => p.id === pu.peca_id) : undefined
      const custoUnit = peca?.custo ?? 0
      if (pu.peca_id && (!peca || custoUnit <= 0)) {
        pecasSemCustoUsadas += pu.quantidade
      }
      const margemLinha = pu.quantidade * (pu.valor_unitario - custoUnit)
      lucroPecas += ratio * margemLinha
      custoPecas += ratio * pu.quantidade * custoUnit
    }
  }

  return {
    total: maoObra + lucroPecas,
    maoObra,
    pecas: lucroPecas,
    custoPecas,
    pecasSemCustoUsadas,
  }
}

export interface PagamentosPendentesResumo {
  valorTotal: number
  quantidadeOs: number
}

export function calcularPagamentosPendentes(
  ordens: OrdemServico[],
  lancamentos: LancamentoFinanceiro[]
): PagamentosPendentesResumo {
  let valorTotal = 0
  let quantidadeOs = 0

  for (const os of ordens) {
    if (os.status === 'cancelada') continue
    const resumo = calcularResumoFinanceiroOS(os, lancamentos)
    if (resumo.valorPendente > 0) {
      valorTotal += resumo.valorPendente
      quantidadeOs++
    }
  }

  return { valorTotal, quantidadeOs }
}

export interface MetricasDashboard {
  intervalo: IntervaloPeriodo
  faturamento: number
  lucroEstimado: LucroEstimadoPeriodo
  osAbertas: number
  osEmServico: number
  osFinalizadasPeriodo: number
  osEntreguesPeriodo: number
  pagamentosPendentes: PagamentosPendentesResumo
  clientesTotal: number
  motosTotal: number
  estoqueBaixo: number
  pecasBaixoLista: Peca[]
  topServicos: ServicoExecutadoStat[]
  topPecas: PecaUsadaStat[]
  resumoEstoque: ReturnType<typeof calcularResumoEstoque>
}

export interface DadosMetricasDashboard {
  clientes: Cliente[]
  motos: Moto[]
  ordens: OrdemServico[]
  pecas: Peca[]
  lancamentos: LancamentoFinanceiro[]
  movimentacoesEstoque?: import('@/types/movimentacao-estoque').MovimentacaoEstoque[]
}

export function calcularMetricasDashboard(
  dados: DadosMetricasDashboard,
  intervalo: IntervaloPeriodo
): MetricasDashboard {
  const { clientes, motos, ordens, pecas, lancamentos, movimentacoesEstoque = [] } = dados

  const ordensPeriodo = ordens.filter((o) => osConcluidaNoPeriodo(o, intervalo))

  const pecasBaixoLista = pecas.filter((p) => p.ativo !== false && p.quantidade <= p.estoque_minimo)

  return {
    intervalo,
    faturamento: calcularFaturamentoPeriodo(lancamentos, intervalo),
    lucroEstimado: calcularLucroEstimadoPeriodo(ordens, lancamentos, pecas, intervalo),
    osAbertas: ordens.filter((o) => OS_STATUS_ABERTAS.includes(o.status)).length,
    osEmServico: ordens.filter((o) => o.status === 'em_servico').length,
    osFinalizadasPeriodo: ordensPeriodo.filter((o) => o.status === 'finalizada').length,
    osEntreguesPeriodo: ordensPeriodo.filter((o) => o.status === 'entregue').length,
    pagamentosPendentes: calcularPagamentosPendentes(ordens, lancamentos),
    clientesTotal: clientes.length,
    motosTotal: motos.length,
    estoqueBaixo: pecasBaixoLista.length,
    pecasBaixoLista,
    topServicos: calcularTopServicos(ordensPeriodo, 5),
    topPecas: calcularTopPecasUsadas(ordensPeriodo, 5),
    resumoEstoque: calcularResumoEstoque(pecas, movimentacoesEstoque, ordens),
  }
}

export interface RelatorioResumoExecutivo {
  faturamento: number
  lucroEstimado: LucroEstimadoPeriodo
  pagamentosPendentes: PagamentosPendentesResumo
  osAbertas: number
  osEmServico: number
  osFinalizadas: number
  osEntregues: number
  osConcluidas: number
  tempoMedioDiasEntradaSaida: number | null
  motosAtendidas: number
  clientesAtendidos: number
  clientesRecorrentes: number
  estoqueBaixo: number
  valorEstoque: number
  lucroPotencialEstoque: number
  topPecas: PecaUsadaStat[]
  topServicos: ServicoExecutadoStat[]
}

export function calcularRelatorioResumoExecutivo(
  dados: DadosMetricasDashboard,
  intervalo: IntervaloPeriodo
): RelatorioResumoExecutivo {
  const metricas = calcularMetricasDashboard(dados, intervalo)
  const ordensPeriodo = dados.ordens.filter((o) => osConcluidaNoPeriodo(o, intervalo))

  const clientesAtendidosSet = new Set<string>()
  const visitasPorCliente = new Map<string, number>()

  for (const os of ordensPeriodo) {
    clientesAtendidosSet.add(os.cliente_id)
    visitasPorCliente.set(os.cliente_id, (visitasPorCliente.get(os.cliente_id) ?? 0) + 1)
  }

  const motosAtendidas = new Set(ordensPeriodo.map((o) => o.moto_id)).size
  const clientesRecorrentes = [...visitasPorCliente.values()].filter((v) => v > 1).length

  const diasEntradaSaida: number[] = []
  for (const os of ordensPeriodo) {
    const entrada = os.data_entrada?.slice(0, 10)
    const saida = os.data_saida?.slice(0, 10)
    if (!entrada || !saida) continue
    const diff =
      (new Date(saida + 'T12:00:00').getTime() - new Date(entrada + 'T12:00:00').getTime()) /
      (1000 * 60 * 60 * 24)
    if (diff >= 0) diasEntradaSaida.push(diff)
  }

  const tempoMedioDiasEntradaSaida =
    diasEntradaSaida.length > 0
      ? Math.round(
          (diasEntradaSaida.reduce((a, b) => a + b, 0) / diasEntradaSaida.length) * 10
        ) / 10
      : null

  return {
    faturamento: metricas.faturamento,
    lucroEstimado: metricas.lucroEstimado,
    pagamentosPendentes: metricas.pagamentosPendentes,
    osAbertas: metricas.osAbertas,
    osEmServico: metricas.osEmServico,
    osFinalizadas: metricas.osFinalizadasPeriodo,
    osEntregues: metricas.osEntreguesPeriodo,
    osConcluidas: metricas.osFinalizadasPeriodo + metricas.osEntreguesPeriodo,
    tempoMedioDiasEntradaSaida,
    motosAtendidas,
    clientesAtendidos: clientesAtendidosSet.size,
    clientesRecorrentes,
    estoqueBaixo: metricas.estoqueBaixo,
    valorEstoque: metricas.resumoEstoque.valorTotalEstoque,
    lucroPotencialEstoque: metricas.resumoEstoque.lucroEstimadoEstoque,
    topPecas: metricas.topPecas,
    topServicos: metricas.topServicos,
  }
}
