/**
 * RC2 Gestor Inteligente Fase 1 — painel somente leitura.
 * Usa dados já carregados (OS, lançamentos, estoque, comissões locais).
 * Não altera caixa/OS/estoque/comissão.
 */
import type { LancamentoFinanceiro, OrdemServico, Peca } from '@/types'
import type { StatusOS } from '@/types/enums'
import type { ComissoesConfigOficina, PerfilComissaoFuncionario } from '@/types/comissoes'
import type { ResumoCaixa, SessaoCaixa } from '@/types/caixa'
import { isPagamentoOsAtivo } from '@/services/pagamentos/payment-active.helpers'
import { getLabelFormaPagamento } from '@/types/labels'
import {
  calcularFaturamentoPeriodo,
  calcularMetricasDashboard,
  calcularPagamentosPendentes,
  type DadosMetricasDashboard,
} from '@/services/dashboard-metrics.service'
import {
  calcularRelatorioComissoesMes,
  listarOsComissaoFuncionario,
} from '@/services/comissoes/comissoes.service'
import {
  dataNoPeriodo,
  type IntervaloPeriodo,
} from '@/services/relatorios.service'
import { formatarDataLocalYYYYMMDD, getDataLocalHoje } from '@/lib/data-local'
import { formatarMoeda } from '@/lib/utils'
import { osContaComoOperacional } from '@/lib/os-modo-documento'
import type { VendaBalcao } from '@/types/venda-balcao'
import {
  agregarPecasVendaBalcao,
  isLancamentoVendaBalcao,
  mesclarFaturamentoPorDiaComBalcao,
  mesclarFormasPagamentoComBalcao,
  mesclarTopPecas,
  totalVendasBalcaoAReceber,
  totalVendasBalcaoPagas,
  vendasBalcaoPagasNoPeriodo,
} from '@/services/venda-balcao/venda-balcao-gestor.helpers'

export type PeriodoGestorPreset = 'hoje' | '7dias' | '30dias' | 'mes' | 'personalizado'
export type TipoPainelGestor = 'geral' | 'financeiro' | 'os' | 'estoque' | 'funcionarios'

const OS_ABERTAS: StatusOS[] = [
  'recebida',
  'em_diagnostico',
  'aguardando_aprovacao',
  'em_servico',
  'pronto_para_retirada',
  'aguardando_peca',
]

export function getLabelPeriodoGestor(preset: PeriodoGestorPreset): string {
  const labels: Record<PeriodoGestorPreset, string> = {
    hoje: 'Hoje',
    '7dias': '7 dias',
    '30dias': '30 dias',
    mes: 'Mês atual',
    personalizado: 'Personalizado',
  }
  return labels[preset]
}

export function calcularIntervaloGestorPreset(
  preset: PeriodoGestorPreset,
  referencia = new Date(),
  personalizado?: { inicio: string; fim: string }
): IntervaloPeriodo {
  const fim = formatarDataLocalYYYYMMDD(referencia)

  switch (preset) {
    case 'hoje':
      return { tipo: 'dia', inicio: fim, fim, label: 'Hoje' }
    case '7dias': {
      const d = new Date(referencia)
      d.setDate(d.getDate() - 6)
      return {
        tipo: 'semana',
        inicio: formatarDataLocalYYYYMMDD(d),
        fim,
        label: 'Últimos 7 dias',
      }
    }
    case '30dias': {
      const d = new Date(referencia)
      d.setDate(d.getDate() - 29)
      return {
        tipo: 'mes',
        inicio: formatarDataLocalYYYYMMDD(d),
        fim,
        label: 'Últimos 30 dias',
      }
    }
    case 'mes': {
      const inicio = formatarDataLocalYYYYMMDD(
        new Date(referencia.getFullYear(), referencia.getMonth(), 1)
      )
      return { tipo: 'mes', inicio, fim, label: 'Mês atual' }
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

function calcularRecebidoPeriodo(
  lancamentos: LancamentoFinanceiro[],
  intervalo: IntervaloPeriodo
): number {
  return lancamentos
    .filter(
      (l) =>
        l.tipo === 'receita' &&
        l.pago &&
        !l.cancelado &&
        !isLancamentoVendaBalcao(l) &&
        dataNoPeriodo(l.data, intervalo)
    )
    .reduce((acc, l) => acc + Number(l.valor ?? 0), 0)
}

export interface OsParadaInfo {
  os_id: string
  numero: number
  status: StatusOS
  dias_parada: number
  atualizado_em: string
  responsavel?: string
}

export function calcularOsParadas(
  ordens: OrdemServico[],
  diasMinimos = 5,
  limite = 8
): OsParadaInfo[] {
  const hoje = new Date(`${getDataLocalHoje()}T12:00:00`)
  const lista: OsParadaInfo[] = []

  for (const os of ordens) {
    if (!osContaComoOperacional(os)) continue
    if (!OS_ABERTAS.includes(os.status)) continue
    const ref = (os.atualizado_em ?? os.criado_em ?? '').slice(0, 10)
    if (!ref) continue
    const dias = Math.floor(
      (hoje.getTime() - new Date(`${ref}T12:00:00`).getTime()) / (1000 * 60 * 60 * 24)
    )
    if (dias < diasMinimos) continue
    lista.push({
      os_id: os.id,
      numero: os.numero,
      status: os.status,
      dias_parada: dias,
      atualizado_em: ref,
      responsavel: os.responsavel?.trim() || undefined,
    })
  }

  return lista.sort((a, b) => b.dias_parada - a.dias_parada).slice(0, limite)
}

export interface FuncionarioGestorStat {
  id: string
  nome: string
  quantidade_os: number
  comissao_gerada: number
  comissao_em_aberto: number
}

export function calcularRankingFuncionarios(
  perfis: PerfilComissaoFuncionario[],
  ordens: OrdemServico[],
  lancamentos: LancamentoFinanceiro[],
  intervalo: IntervaloPeriodo,
  config: ComissoesConfigOficina,
  openByEmployee?: Map<string, number>
): FuncionarioGestorStat[] {
  const mes = intervalo.fim.slice(0, 7)
  const ativos = perfis.filter((p) => p.comissao_ativa && p.tipo_comissao !== 'sem_comissao')

  return ativos
    .map((perfil) => {
      const detalhes = listarOsComissaoFuncionario(
        perfil,
        ordens,
        lancamentos,
        mes,
        config
      ).filter((d) => dataNoPeriodo(d.data_referencia, intervalo))
      const gerada = detalhes.reduce((a, d) => a + d.comissao, 0)
      return {
        id: perfil.id,
        nome: perfil.nome,
        quantidade_os: detalhes.length,
        comissao_gerada: Math.round(gerada * 100) / 100,
        comissao_em_aberto:
          openByEmployee?.get(perfil.id) ?? Math.round(gerada * 100) / 100,
      }
    })
    .filter((f) => f.quantidade_os > 0 || f.comissao_gerada > 0.009)
    .sort((a, b) => b.comissao_gerada - a.comissao_gerada)
    .slice(0, 10)
}

export type CategoriaAlertaGestor =
  | 'Atenção'
  | 'Oportunidade'
  | 'Financeiro'
  | 'Estoque'
  | 'Operação'

export interface AlertaGestor {
  id: string
  categoria: CategoriaAlertaGestor
  severidade: 'info' | 'warning' | 'critical'
  titulo: string
  descricao: string
}

export interface InsightGestor {
  id: string
  titulo: string
  texto: string
  tom: 'default' | 'success' | 'warning' | 'info'
}

export interface PontoFaturamentoDia {
  data: string
  label: string
  valor: number
  /** Quantidade de pagamentos de OS no dia */
  quantidade: number
}

export interface FatiaDonut {
  key: string
  label: string
  valor: number
  cor: string
}

export interface FormaPagamentoStat {
  forma: string
  label: string
  valor: number
  quantidade: number
}

export interface PainelGestorInteligente {
  intervalo: IntervaloPeriodo
  faturamento: number
  totalRecebido: number
  aReceber: number
  osAReceberQtd: number
  osAbertas: number
  osFinalizadas: number
  osCanceladas: number
  ticketMedio: number
  comissaoEmAberto: number
  estoqueBaixo: number
  qtdPagamentosRecebidos: number
  melhorDiaFaturamento: PontoFaturamentoDia | null
  faturamentoPorDia: PontoFaturamentoDia[]
  osStatusFatias: FatiaDonut[]
  formasPagamento: FormaPagamentoStat[]
  topServicos: Array<{ nome: string; quantidade: number; valor: number }>
  topPecas: Array<{ nome: string; quantidade: number; valor: number }>
  funcionarios: FuncionarioGestorStat[]
  osParadas: OsParadaInfo[]
  alertas: AlertaGestor[]
  insights: InsightGestor[]
  resumoTextos: string[]
  pecasBaixo: Peca[]
}

function listarDiasIntervalo(inicio: string, fim: string, maxDias = 62): string[] {
  const dias: string[] = []
  const cursor = new Date(`${inicio}T12:00:00`)
  const fimDate = new Date(`${fim}T12:00:00`)
  if (Number.isNaN(cursor.getTime()) || Number.isNaN(fimDate.getTime())) return dias
  while (cursor <= fimDate && dias.length < maxDias) {
    dias.push(formatarDataLocalYYYYMMDD(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return dias
}

function labelDiaCurto(yyyyMmDd: string): string {
  const [, m, d] = yyyyMmDd.split('-')
  return `${d}/${m}`
}

export function calcularFaturamentoPorDia(
  lancamentos: LancamentoFinanceiro[],
  intervalo: IntervaloPeriodo
): PontoFaturamentoDia[] {
  const dias = listarDiasIntervalo(intervalo.inicio, intervalo.fim)
  const mapaValor = new Map(dias.map((d) => [d, 0]))
  const mapaQtd = new Map(dias.map((d) => [d, 0]))
  for (const l of lancamentos) {
    if (!isPagamentoOsAtivo(l) || !l.pago) continue
    const dia = (l.data ?? '').slice(0, 10)
    if (!mapaValor.has(dia)) continue
    mapaValor.set(dia, (mapaValor.get(dia) ?? 0) + Number(l.valor ?? 0))
    mapaQtd.set(dia, (mapaQtd.get(dia) ?? 0) + 1)
  }
  return dias.map((data) => ({
    data,
    label: labelDiaCurto(data),
    valor: Math.round((mapaValor.get(data) ?? 0) * 100) / 100,
    quantidade: mapaQtd.get(data) ?? 0,
  }))
}

export function calcularFormasPagamentoPeriodo(
  lancamentos: LancamentoFinanceiro[],
  intervalo: IntervaloPeriodo
): FormaPagamentoStat[] {
  const mapa = new Map<string, { valor: number; quantidade: number }>()
  for (const l of lancamentos) {
    if (!isPagamentoOsAtivo(l) || !l.pago) continue
    if (!dataNoPeriodo(l.data, intervalo)) continue
    const forma = String(l.forma_pagamento || 'outros').toLowerCase()
    const atual = mapa.get(forma) ?? { valor: 0, quantidade: 0 }
    mapa.set(forma, {
      valor: atual.valor + Number(l.valor ?? 0),
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

export function calcularPainelGestorInteligente(params: {
  dados: DadosMetricasDashboard
  intervalo: IntervaloPeriodo
  perfis: PerfilComissaoFuncionario[]
  configComissoes: ComissoesConfigOficina
  comissaoEmAbertoTotal?: number
  openByEmployee?: Map<string, number>
  caixa?: { sessao: SessaoCaixa | null; resumo: ResumoCaixa | null }
  /** Vendas balcão (Supabase) — merge em faturamento/recebido/a receber/formas/peças */
  vendasBalcao?: VendaBalcao[]
}): PainelGestorInteligente {
  const { dados, intervalo, perfis, configComissoes } = params
  const vendasBalcao = params.vendasBalcao ?? []
  const metricas = calcularMetricasDashboard(dados, intervalo)
  const fatOs = calcularFaturamentoPeriodo(dados.lancamentos, intervalo)
  const fatBalcao = totalVendasBalcaoPagas(vendasBalcao, intervalo)
  const faturamento = Math.round((fatOs + fatBalcao) * 100) / 100
  const recebidoOs = calcularRecebidoPeriodo(dados.lancamentos, intervalo)
  const totalRecebido = Math.round((recebidoOs + fatBalcao) * 100) / 100
  const pendentes = calcularPagamentosPendentes(dados.ordens, dados.lancamentos)
  const pendBalcao = totalVendasBalcaoAReceber(vendasBalcao)
  const aReceber = Math.round((pendentes.valorTotal + pendBalcao.valor) * 100) / 100
  const aReceberQtd = pendentes.quantidadeOs + pendBalcao.quantidade
  const osConcluidas =
    metricas.osFinalizadasPeriodo + metricas.osEntreguesPeriodo
  const ticketMedio =
    osConcluidas > 0 ? Math.round((fatOs / osConcluidas) * 100) / 100 : 0

  const mesCompetencia = intervalo.fim.slice(0, 7)
  const relatorioMes = calcularRelatorioComissoesMes(
    params.perfis,
    dados.ordens,
    dados.lancamentos,
    mesCompetencia,
    configComissoes
  )
  const comissaoLocal = Math.round(
    relatorioMes.reduce((a, r) => a + r.total_comissao, 0) * 100
  ) / 100
  const comissaoEmAberto =
    params.comissaoEmAbertoTotal != null
      ? params.comissaoEmAbertoTotal
      : comissaoLocal

  const funcionarios = calcularRankingFuncionarios(
    perfis,
    dados.ordens,
    dados.lancamentos,
    intervalo,
    configComissoes,
    params.openByEmployee
  )

  const osParadas = calcularOsParadas(dados.ordens, 5, 8)
  const osCanceladas = dados.ordens.filter((o) => o.status === 'cancelada').length

  const topServicos = metricas.topServicos.map((s) => ({
    nome: s.servico,
    quantidade: s.quantidade,
    valor: s.receita,
  }))
  const topPecasOs = metricas.topPecas.map((p) => ({
    nome: p.nome,
    quantidade: p.quantidade,
    valor: p.receita,
  }))
  const topPecas = mesclarTopPecas(
    topPecasOs,
    agregarPecasVendaBalcao(vendasBalcao, intervalo)
  )

  const faturamentoPorDia = mesclarFaturamentoPorDiaComBalcao(
    calcularFaturamentoPorDia(dados.lancamentos, intervalo),
    vendasBalcao,
    intervalo
  )
  const melhorDiaFaturamento =
    faturamentoPorDia.reduce<PontoFaturamentoDia | null>((best, p) => {
      if (p.valor <= 0.009) return best
      if (!best || p.valor > best.valor) return p
      return best
    }, null)

  const qtdOs = dados.lancamentos.filter(
    (l) => isPagamentoOsAtivo(l) && l.pago && dataNoPeriodo(l.data, intervalo)
  ).length
  const qtdBalcao = vendasBalcaoPagasNoPeriodo(vendasBalcao, intervalo).length
  const qtdPagamentosRecebidos = qtdOs + qtdBalcao

  const formasPagamento = mesclarFormasPagamentoComBalcao(
    calcularFormasPagamentoPeriodo(dados.lancamentos, intervalo),
    vendasBalcao,
    intervalo
  )

  const osStatusFatias: FatiaDonut[] = [
    { key: 'abertas', label: 'Abertas', valor: metricas.osAbertas, cor: '#38bdf8' },
    { key: 'finalizadas', label: 'Finalizadas', valor: osConcluidas, cor: '#34d399' },
    { key: 'a_receber', label: 'A receber', valor: aReceberQtd, cor: '#fbbf24' },
    { key: 'canceladas', label: 'Canceladas', valor: osCanceladas, cor: '#f87171' },
  ].filter((f) => f.valor > 0)

  const alertas = gerarAlertasInteligentes({
    estoqueBaixo: metricas.estoqueBaixo,
    osParadas,
    comissaoEmAberto,
    aReceber,
    aReceberQtd,
    aReceberOsQtd: pendentes.quantidadeOs,
    aReceberBalcaoQtd: pendBalcao.quantidade,
    osAbertas: metricas.osAbertas,
    caixa: params.caixa,
  })

  const insights = gerarInsights({
    topServicos,
    comissaoEmAberto,
    estoqueBaixo: metricas.estoqueBaixo,
    osParadas,
    aReceber,
    osAbertas: metricas.osAbertas,
    melhorDia: melhorDiaFaturamento,
  })

  const resumoTextos = insights.map((i) => i.texto)

  return {
    intervalo,
    faturamento,
    totalRecebido,
    aReceber,
    osAReceberQtd: aReceberQtd,
    osAbertas: metricas.osAbertas,
    osFinalizadas: osConcluidas,
    osCanceladas,
    ticketMedio,
    comissaoEmAberto,
    estoqueBaixo: metricas.estoqueBaixo,
    qtdPagamentosRecebidos,
    melhorDiaFaturamento,
    faturamentoPorDia,
    osStatusFatias,
    formasPagamento,
    topServicos,
    topPecas,
    funcionarios,
    osParadas,
    alertas,
    insights,
    resumoTextos,
    pecasBaixo: metricas.pecasBaixoLista.slice(0, 8),
  }
}

function gerarAlertasInteligentes(params: {
  estoqueBaixo: number
  osParadas: OsParadaInfo[]
  comissaoEmAberto: number
  aReceber: number
  aReceberQtd: number
  aReceberOsQtd?: number
  aReceberBalcaoQtd?: number
  osAbertas: number
  caixa?: { sessao: SessaoCaixa | null; resumo: ResumoCaixa | null }
}): AlertaGestor[] {
  const alertas: AlertaGestor[] = []

  if (params.aReceber > 0.009) {
    const partes: string[] = []
    if ((params.aReceberOsQtd ?? 0) > 0) {
      partes.push(`${params.aReceberOsQtd} OS`)
    }
    if ((params.aReceberBalcaoQtd ?? 0) > 0) {
      partes.push(`${params.aReceberBalcaoQtd} venda(s) balcão`)
    }
    alertas.push({
      id: 'a-receber',
      categoria: 'Atenção',
      severidade: params.aReceberQtd >= 5 ? 'critical' : 'warning',
      titulo: 'Há valores a receber',
      descricao: `${partes.join(' e ') || `${params.aReceberQtd} conta(s)`} · ${formatarMoeda(params.aReceber)}.`,
    })
  }

  if (params.estoqueBaixo > 0) {
    alertas.push({
      id: 'estoque-baixo',
      categoria: 'Estoque',
      severidade: params.estoqueBaixo >= 5 ? 'critical' : 'warning',
      titulo: 'Estoque: itens abaixo do mínimo',
      descricao: `${params.estoqueBaixo} peça(s) precisam de reposição.`,
    })
  }

  if (params.osAbertas > 0) {
    alertas.push({
      id: 'os-abertas',
      categoria: 'Operação',
      severidade: 'info',
      titulo: 'Operação: OS abertas neste momento',
      descricao: `${params.osAbertas} OS em andamento na oficina.`,
    })
  }

  if (params.osParadas.length > 0) {
    alertas.push({
      id: 'os-paradas',
      categoria: 'Operação',
      severidade: params.osParadas.length >= 3 ? 'critical' : 'warning',
      titulo: 'Operação: OS sem atualização recente',
      descricao: `${params.osParadas.length} OS paradas há 5 dias ou mais.`,
    })
  }

  if (params.comissaoEmAberto > 0.009) {
    alertas.push({
      id: 'comissao-aberta',
      categoria: 'Financeiro',
      severidade: 'warning',
      titulo: 'Financeiro: comissões em aberto',
      descricao: `Saldo de ${formatarMoeda(params.comissaoEmAberto)} com a equipe.`,
    })
  }

  const sessao = params.caixa?.sessao
  if (sessao?.status === 'closed' && sessao.difference != null && Math.abs(sessao.difference) > 0.009) {
    alertas.push({
      id: 'caixa-diferenca',
      categoria: 'Financeiro',
      severidade: 'critical',
      titulo: 'Financeiro: diferença no último caixa',
      descricao: `Diferença de ${formatarMoeda(sessao.difference)} no fechamento.`,
    })
  }

  if (alertas.length === 0) {
    alertas.push({
      id: 'ok',
      categoria: 'Oportunidade',
      severidade: 'info',
      titulo: 'Oportunidade: operação estável',
      descricao: 'Nenhum ponto crítico no momento. Bom momento para revisar metas.',
    })
  }

  return alertas
}

function gerarInsights(params: {
  topServicos: Array<{ nome: string; quantidade: number; valor: number }>
  comissaoEmAberto: number
  estoqueBaixo: number
  osParadas: OsParadaInfo[]
  aReceber: number
  osAbertas: number
  melhorDia: PontoFaturamentoDia | null
}): InsightGestor[] {
  const insights: InsightGestor[] = []

  if (params.topServicos[0]) {
    insights.push({
      id: 'servico',
      titulo: 'Serviço destaque',
      texto: `O serviço com maior venda foi ${params.topServicos[0].nome}.`,
      tom: 'success',
    })
  }
  if (params.estoqueBaixo > 0) {
    insights.push({
      id: 'estoque',
      titulo: 'Atenção no estoque',
      texto: `Existem ${params.estoqueBaixo} peça(s) abaixo do estoque mínimo.`,
      tom: 'warning',
    })
  } else {
    insights.push({
      id: 'estoque-ok',
      titulo: 'Estoque',
      texto: 'Nenhuma peça abaixo do estoque mínimo.',
      tom: 'info',
    })
  }
  if (params.aReceber > 0.009) {
    insights.push({
      id: 'receber',
      titulo: 'Saldo a receber',
      texto: `Há ${formatarMoeda(params.aReceber)} a receber.`,
      tom: 'warning',
    })
  }
  if (params.comissaoEmAberto > 0.009) {
    insights.push({
      id: 'comissao',
      titulo: 'Comissão em aberto',
      texto: `Há ${formatarMoeda(params.comissaoEmAberto)} em comissões em aberto.`,
      tom: 'warning',
    })
  }
  if (params.osParadas.length > 0) {
    insights.push({
      id: 'paradas',
      titulo: 'OS paradas',
      texto: `Há ${params.osParadas.length} OS sem atualização há mais de 5 dias.`,
      tom: 'warning',
    })
  } else {
    insights.push({
      id: 'paradas-ok',
      titulo: 'OS paradas',
      texto: 'Nenhuma OS está parada há mais de 5 dias.',
      tom: 'success',
    })
  }
  if (params.melhorDia) {
    insights.push({
      id: 'melhor-dia',
      titulo: 'Melhor dia',
      texto: `Melhor faturamento em ${params.melhorDia.label}: ${formatarMoeda(params.melhorDia.valor)}.`,
      tom: 'success',
    })
  }

  return insights.slice(0, 6)
}
