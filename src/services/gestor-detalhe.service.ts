/**
 * RC2 Gestor Inteligente Fase 2 — montagem de drilldown (somente leitura).
 * Não altera OS, caixa, estoque, comissão ou pagamentos.
 */
import type {
  Cliente,
  Fornecedor,
  LancamentoFinanceiro,
  Moto,
  OrdemServico,
  Peca,
} from '@/types'
import type { ComissoesConfigOficina, PerfilComissaoFuncionario } from '@/types/comissoes'
import { getLabelFormaPagamento, getLabelStatusOS } from '@/types/labels'
import { isPagamentoOsAtivo } from '@/services/pagamentos/payment-active.helpers'
import { listarContasReceber } from '@/services/os-pagamento.service'
import { calcularTotalGeralDeCampos } from '@/services/os-financeiro.service'
import {
  osConcluidaNoPeriodo,
  type DadosMetricasDashboard,
} from '@/services/dashboard-metrics.service'
import { listarOsComissaoFuncionario } from '@/services/comissoes/comissoes.service'
import { dataNoPeriodo, type IntervaloPeriodo } from '@/services/relatorios.service'
import { formatarData, formatarMoeda } from '@/lib/utils'
import { getDataLocalHoje } from '@/lib/data-local'
import { osContaComoOperacional } from '@/lib/os-modo-documento'
import type {
  FatiaDonut,
  FormaPagamentoStat,
  FuncionarioGestorStat,
  PainelGestorInteligente,
  PontoFaturamentoDia,
} from '@/services/gestor-inteligente.service'

const OS_ABERTAS = [
  'recebida',
  'em_diagnostico',
  'aguardando_aprovacao',
  'em_servico',
  'pronto_para_retirada',
  'aguardando_peca',
] as const

export type GestorDetalheTipo =
  | 'faturamento'
  | 'recebido'
  | 'a_receber'
  | 'os_abertas'
  | 'os_finalizadas'
  | 'estoque_baixo'
  | 'comissao_aberta'
  | 'evolucao_faturamento'
  | 'formas_pagamento'
  | 'status_os'
  | 'servico'
  | 'peca'
  | 'funcionario'

export interface GestorDetalheResumo {
  label: string
  valor: string
}

export interface GestorDetalheLinha {
  id: string
  titulo: string
  subtitulo?: string
  valor?: string
  meta?: string
  badge?: string
  osId?: string
}

export interface GestorDetalheView {
  tipo: GestorDetalheTipo
  titulo: string
  descricao?: string
  resumos: GestorDetalheResumo[]
  linhas: GestorDetalheLinha[]
  faturamentoPorDia?: PontoFaturamentoDia[]
  formasPagamento?: FormaPagamentoStat[]
  osStatusFatias?: FatiaDonut[]
  rankingBarras?: Array<{ nome: string; quantidade: number; valor: number }>
}

export interface GestorDetalheContexto {
  painel: PainelGestorInteligente
  dados: DadosMetricasDashboard
  fornecedores?: Fornecedor[]
  perfis: PerfilComissaoFuncionario[]
  configComissoes: ComissoesConfigOficina
  filtroNome?: string
  filtroFuncionarioId?: string
  filtroStatusKey?: string
}

function safeMoeda(n: number): string {
  if (!Number.isFinite(n)) return formatarMoeda(0)
  return formatarMoeda(n)
}

function nomeCliente(clientes: Cliente[], id: string): string {
  return clientes.find((c) => c.id === id)?.nome?.trim() || 'Cliente'
}

function labelMoto(motos: Moto[], id: string): string {
  const m = motos.find((x) => x.id === id)
  if (!m) return 'Veículo'
  const placa = m.placa?.trim()
  const modelo = [m.marca, m.modelo].filter(Boolean).join(' ')
  if (placa && modelo) return `${placa} · ${modelo}`
  return placa || modelo || 'Veículo'
}

function diasEmAberto(os: OrdemServico): number {
  const ref = (os.data_entrada ?? os.criado_em ?? '').slice(0, 10)
  if (!ref) return 0
  const hoje = new Date(`${getDataLocalHoje()}T12:00:00`)
  const d = new Date(`${ref}T12:00:00`)
  if (Number.isNaN(d.getTime())) return 0
  return Math.max(0, Math.floor((hoje.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)))
}

function extrairServicosOs(os: OrdemServico): Array<{ nome: string; receita: number }> {
  if (os.servicos_itens?.length) {
    return os.servicos_itens.map((item) => ({
      nome: item.nome.trim(),
      receita: Number(item.valor_mao_obra ?? 0) || 0,
    }))
  }
  const texto = os.servicos_executados?.trim() ?? ''
  if (!texto) return []
  const linhas = texto
    .split(/[,;|\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2)
  if (linhas.length === 0) return []
  const receita = (Number(os.valor_mao_obra ?? 0) || 0) / linhas.length
  return linhas.map((nome) => ({ nome, receita }))
}

function pagamentosPeriodo(
  lancamentos: LancamentoFinanceiro[],
  intervalo: IntervaloPeriodo
): LancamentoFinanceiro[] {
  return lancamentos
    .filter((l) => isPagamentoOsAtivo(l) && l.pago && dataNoPeriodo(l.data, intervalo))
    .sort((a, b) => (b.data ?? '').localeCompare(a.data ?? ''))
}

function linhasPagamentos(
  pagamentos: LancamentoFinanceiro[],
  ordens: OrdemServico[],
  clientes: Cliente[],
  motos: Moto[]
): GestorDetalheLinha[] {
  return pagamentos.slice(0, 80).map((l) => {
    const os = ordens.find((o) => o.id === l.ordem_servico_id)
    const cliente = os ? nomeCliente(clientes, os.cliente_id) : '—'
    const veiculo = os ? labelMoto(motos, os.moto_id) : ''
    return {
      id: l.id,
      titulo: os ? `OS #${os.numero}` : 'Pagamento OS',
      subtitulo: [cliente, veiculo].filter(Boolean).join(' · '),
      valor: safeMoeda(Number(l.valor ?? 0)),
      meta: `${formatarData((l.data ?? '').slice(0, 10))} · ${getLabelFormaPagamento(l.forma_pagamento)}`,
      osId: os?.id,
    }
  })
}

function emptyView(tipo: GestorDetalheTipo, titulo: string): GestorDetalheView {
  return {
    tipo,
    titulo,
    descricao:
      'Não há dados suficientes para detalhar este indicador no período selecionado.',
    resumos: [],
    linhas: [],
  }
}

export function construirDetalheGestor(
  tipo: GestorDetalheTipo,
  ctx: GestorDetalheContexto
): GestorDetalheView {
  const { painel, dados, fornecedores = [], perfis, configComissoes } = ctx
  const { clientes, motos, ordens, pecas, lancamentos } = dados
  const intervalo = painel.intervalo
  const operacionais = ordens.filter((o) => osContaComoOperacional(o))

  switch (tipo) {
    case 'faturamento':
    case 'evolucao_faturamento': {
      const pags = pagamentosPeriodo(lancamentos, intervalo)
      if (pags.length === 0 && painel.faturamento <= 0.009) {
        return emptyView(tipo, 'Evolução do faturamento no período')
      }
      return {
        tipo,
        titulo: 'Evolução do faturamento no período',
        descricao: 'Faturamento diário conforme o período selecionado.',
        resumos: [
          { label: 'Total do período', valor: safeMoeda(painel.faturamento) },
          { label: 'Recebido', valor: safeMoeda(painel.totalRecebido) },
          {
            label: 'Pagamentos',
            valor: String(painel.qtdPagamentosRecebidos),
          },
          {
            label: 'Melhor dia',
            valor: painel.melhorDiaFaturamento
              ? `${painel.melhorDiaFaturamento.label} · ${safeMoeda(painel.melhorDiaFaturamento.valor)}`
              : '—',
          },
        ],
        faturamentoPorDia: painel.faturamentoPorDia,
        linhas: [
          ...painel.faturamentoPorDia
            .filter((p) => p.valor > 0.009)
            .slice()
            .reverse()
            .map((p) => ({
              id: `dia-${p.data}`,
              titulo: formatarData(p.data),
              subtitulo: `${p.quantidade} pagamento${p.quantidade === 1 ? '' : 's'}`,
              valor: safeMoeda(p.valor),
              badge:
                painel.melhorDiaFaturamento?.data === p.data
                  ? 'Melhor dia no período'
                  : 'Dia',
              meta: 'Faturamento do dia',
            })),
          ...linhasPagamentos(pags, ordens, clientes, motos).map((l) => ({
            ...l,
            badge: l.badge ?? 'Pagamento',
          })),
        ],
      }
    }

    case 'recebido':
    case 'formas_pagamento': {
      const pags = pagamentosPeriodo(lancamentos, intervalo)
      if (pags.length === 0) {
        return emptyView(tipo, 'Formas de pagamento')
      }
      return {
        tipo,
        titulo: tipo === 'recebido' ? 'Recebido no período' : 'Formas de pagamento',
        descricao: 'Distribuição dos pagamentos recebidos no período.',
        resumos: [
          { label: 'Total recebido', valor: safeMoeda(painel.totalRecebido) },
          { label: 'Pagamentos', valor: String(painel.qtdPagamentosRecebidos) },
          {
            label: 'Formas',
            valor: String(painel.formasPagamento.length),
          },
        ],
        formasPagamento: painel.formasPagamento,
        linhas: linhasPagamentos(pags, ordens, clientes, motos),
      }
    }

    case 'a_receber': {
      const contas = listarContasReceber(
        operacionais,
        lancamentos,
        (id) => nomeCliente(clientes, id),
        (id) => labelMoto(motos, id)
      )
      if (contas.length === 0) {
        return emptyView(tipo, 'A receber')
      }
      return {
        tipo,
        titulo: 'Valores a receber',
        descricao: 'OS com saldo pendente (visão atual da oficina).',
        resumos: [
          { label: 'Total a receber', valor: safeMoeda(painel.aReceber) },
          { label: 'OS pendentes', valor: String(painel.osAReceberQtd) },
        ],
        linhas: contas.slice(0, 80).map((c) => ({
          id: c.os.id,
          titulo: `OS #${c.os.numero}`,
          subtitulo: `${c.clienteNome} · ${c.motoLabel}`,
          valor: safeMoeda(c.valorPendente),
          meta: getLabelStatusOS(c.os.status),
          badge: getLabelStatusOS(c.os.status),
          osId: c.os.id,
        })),
      }
    }

    case 'os_abertas': {
      const lista = operacionais
        .filter((o) => (OS_ABERTAS as readonly string[]).includes(o.status))
        .sort((a, b) => diasEmAberto(b) - diasEmAberto(a))
      if (lista.length === 0) return emptyView(tipo, 'OS abertas')
      return {
        tipo,
        titulo: 'OS abertas',
        descricao: 'Ordens em andamento neste momento.',
        resumos: [
          { label: 'Total abertas', valor: String(lista.length) },
          {
            label: 'Paradas 5+ dias',
            valor: String(painel.osParadas.length),
          },
        ],
        linhas: lista.slice(0, 80).map((os) => ({
          id: os.id,
          titulo: `OS #${os.numero}`,
          subtitulo: `${nomeCliente(clientes, os.cliente_id)} · ${labelMoto(motos, os.moto_id)}`,
          meta: `${formatarData((os.data_entrada ?? os.criado_em ?? '').slice(0, 10))} · ${diasEmAberto(os)} dia(s)`,
          badge: getLabelStatusOS(os.status),
          valor: safeMoeda(calcularTotalGeralDeCampos(os)),
          osId: os.id,
        })),
      }
    }

    case 'os_finalizadas': {
      const lista = operacionais
        .filter((o) => osConcluidaNoPeriodo(o, intervalo))
        .sort((a, b) =>
          (b.data_saida ?? b.atualizado_em ?? '').localeCompare(
            a.data_saida ?? a.atualizado_em ?? ''
          )
        )
      if (lista.length === 0) return emptyView(tipo, 'OS finalizadas')
      return {
        tipo,
        titulo: 'OS finalizadas no período',
        descricao: 'OS finalizadas ou entregues no período selecionado.',
        resumos: [
          { label: 'Quantidade', valor: String(lista.length) },
          {
            label: 'Ticket médio',
            valor: safeMoeda(painel.ticketMedio),
          },
        ],
        linhas: lista.slice(0, 80).map((os) => ({
          id: os.id,
          titulo: `OS #${os.numero}`,
          subtitulo: `${nomeCliente(clientes, os.cliente_id)} · ${labelMoto(motos, os.moto_id)}`,
          valor: safeMoeda(calcularTotalGeralDeCampos(os)),
          meta: formatarData(
            (os.data_saida ?? os.atualizado_em ?? os.criado_em ?? '').slice(0, 10)
          ),
          badge: getLabelStatusOS(os.status),
          osId: os.id,
        })),
      }
    }

    case 'estoque_baixo': {
      const lista = pecas
        .filter((p) => p.ativo !== false && p.quantidade <= p.estoque_minimo)
        .sort((a, b) => a.quantidade - b.quantidade || a.nome.localeCompare(b.nome))
      if (lista.length === 0) return emptyView(tipo, 'Estoque baixo')
      return {
        tipo,
        titulo: 'Estoque baixo',
        descricao: 'Peças com quantidade igual ou abaixo do mínimo.',
        resumos: [
          { label: 'Itens em alerta', valor: String(lista.length) },
        ],
        linhas: lista.slice(0, 80).map((p: Peca) => {
          const forn = fornecedores.find((f) => f.id === p.fornecedor_id)
          const urgente = p.quantidade <= 0
          return {
            id: p.id,
            titulo: p.nome,
            subtitulo: forn?.nome
              ? `Fornecedor: ${forn.nome}`
              : p.codigo
                ? `Cód. ${p.codigo}`
                : undefined,
            valor: `${p.quantidade} / mín. ${p.estoque_minimo}`,
            badge: urgente ? 'Urgente' : 'Baixo',
            meta: urgente ? 'Sem estoque' : 'Abaixo do mínimo',
          }
        }),
      }
    }

    case 'comissao_aberta': {
      const funcs = painel.funcionarios
      if (funcs.length === 0 && painel.comissaoEmAberto <= 0.009) {
        return emptyView(tipo, 'Comissão em aberto')
      }
      return {
        tipo,
        titulo: 'Comissão em aberto',
        descricao: 'Saldo da oficina com a equipe (somente leitura).',
        resumos: [
          { label: 'Total em aberto', valor: safeMoeda(painel.comissaoEmAberto) },
          { label: 'Funcionários', valor: String(funcs.length) },
        ],
        linhas: funcs.map((f: FuncionarioGestorStat) => ({
          id: f.id,
          titulo: f.nome,
          subtitulo: `${f.quantidade_os} OS no período`,
          valor: safeMoeda(f.comissao_em_aberto),
          meta: `Gerada ${safeMoeda(f.comissao_gerada)}`,
          badge: f.comissao_em_aberto > 0.009 ? 'Em aberto' : 'Quitado',
        })),
      }
    }

    case 'status_os': {
      const key = ctx.filtroStatusKey
      if (key === 'a_receber') {
        return construirDetalheGestor('a_receber', ctx)
      }

      let linhas: GestorDetalheLinha[] = []
      if (key === 'abertas') {
        linhas = operacionais
          .filter((o) => (OS_ABERTAS as readonly string[]).includes(o.status))
          .slice(0, 60)
          .map((os) => ({
            id: os.id,
            titulo: `OS #${os.numero}`,
            subtitulo: `${nomeCliente(clientes, os.cliente_id)} · ${labelMoto(motos, os.moto_id)}`,
            badge: getLabelStatusOS(os.status),
            meta: `${diasEmAberto(os)} dia(s)`,
            osId: os.id,
          }))
      } else if (key === 'finalizadas') {
        linhas = operacionais
          .filter((o) => osConcluidaNoPeriodo(o, intervalo))
          .slice(0, 60)
          .map((os) => ({
            id: os.id,
            titulo: `OS #${os.numero}`,
            subtitulo: `${nomeCliente(clientes, os.cliente_id)} · ${labelMoto(motos, os.moto_id)}`,
            badge: getLabelStatusOS(os.status),
            valor: safeMoeda(calcularTotalGeralDeCampos(os)),
            osId: os.id,
          }))
      } else if (key === 'canceladas') {
        linhas = ordens
          .filter((o) => o.status === 'cancelada')
          .slice(0, 60)
          .map((os) => ({
            id: os.id,
            titulo: `OS #${os.numero}`,
            subtitulo: nomeCliente(clientes, os.cliente_id),
            badge: 'Cancelada',
            osId: os.id,
          }))
      } else {
        const abertas = operacionais
          .filter((o) => (OS_ABERTAS as readonly string[]).includes(o.status))
          .slice(0, 20)
        const fin = operacionais
          .filter((o) => osConcluidaNoPeriodo(o, intervalo))
          .slice(0, 20)
        linhas = [
          ...abertas.map((os) => ({
            id: `ab-${os.id}`,
            titulo: `OS #${os.numero}`,
            subtitulo: nomeCliente(clientes, os.cliente_id),
            badge: getLabelStatusOS(os.status),
            osId: os.id,
          })),
          ...fin.map((os) => ({
            id: `fi-${os.id}`,
            titulo: `OS #${os.numero}`,
            subtitulo: nomeCliente(clientes, os.cliente_id),
            badge: getLabelStatusOS(os.status),
            valor: safeMoeda(calcularTotalGeralDeCampos(os)),
            osId: os.id,
          })),
        ]
      }

      if (linhas.length === 0 && painel.osStatusFatias.length === 0) {
        return emptyView(tipo, 'Status das OS')
      }
      return {
        tipo,
        titulo: key
          ? `Status das OS · ${painel.osStatusFatias.find((f) => f.key === key)?.label ?? key}`
          : 'Status das OS',
        resumos: painel.osStatusFatias.map((f) => ({
          label: f.label,
          valor: String(f.valor),
        })),
        osStatusFatias: painel.osStatusFatias,
        linhas,
      }
    }

    case 'servico': {
      const nome = (ctx.filtroNome ?? '').trim()
      if (!nome) return emptyView(tipo, 'Serviço')
      const alvo = nome.toLowerCase()
      const concluidas = operacionais.filter((o) => osConcluidaNoPeriodo(o, intervalo))
      const linhas: GestorDetalheLinha[] = []
      let qtd = 0
      let valor = 0
      for (const os of concluidas) {
        const servicos = extrairServicosOs(os)
        const match = servicos.filter((s) => s.nome.toLowerCase() === alvo)
        if (match.length === 0) continue
        const receita = match.reduce((a, s) => a + s.receita, 0)
        qtd += match.length
        valor += receita
        linhas.push({
          id: os.id,
          titulo: `OS #${os.numero}`,
          subtitulo: `${nomeCliente(clientes, os.cliente_id)} · ${labelMoto(motos, os.moto_id)}`,
          valor: safeMoeda(receita),
          badge: getLabelStatusOS(os.status),
          osId: os.id,
        })
      }
      if (linhas.length === 0) return emptyView(tipo, nome)
      return {
        tipo,
        titulo: `Serviço · ${nome}`,
        descricao: 'OS do período em que este serviço apareceu.',
        resumos: [
          { label: 'Quantidade', valor: `${qtd}x` },
          { label: 'Valor total', valor: safeMoeda(valor) },
          { label: 'OS', valor: String(linhas.length) },
        ],
        linhas: linhas.slice(0, 80),
      }
    }

    case 'peca': {
      const nome = (ctx.filtroNome ?? '').trim()
      if (!nome) return emptyView(tipo, 'Peça')
      const alvo = nome.toLowerCase()
      const concluidas = operacionais.filter((o) => osConcluidaNoPeriodo(o, intervalo))
      const linhas: GestorDetalheLinha[] = []
      let qtd = 0
      let valor = 0
      for (const os of concluidas) {
        const pecasOs = (os.pecas_utilizadas ?? []).filter(
          (pu) => pu.nome.toLowerCase() === alvo
        )
        if (pecasOs.length === 0) continue
        const q = pecasOs.reduce((a, p) => a + Number(p.quantidade ?? 0), 0)
        const v = pecasOs.reduce(
          (a, p) => a + Number(p.quantidade ?? 0) * Number(p.valor_unitario ?? 0),
          0
        )
        qtd += q
        valor += v
        linhas.push({
          id: os.id,
          titulo: `OS #${os.numero}`,
          subtitulo: `${nomeCliente(clientes, os.cliente_id)} · ${labelMoto(motos, os.moto_id)}`,
          valor: safeMoeda(v),
          meta: `${q} un.`,
          badge: getLabelStatusOS(os.status),
          osId: os.id,
        })
      }
      if (linhas.length === 0) return emptyView(tipo, nome)
      return {
        tipo,
        titulo: `Peça · ${nome}`,
        descricao: 'OS do período em que esta peça saiu.',
        resumos: [
          { label: 'Quantidade', valor: `${qtd} un.` },
          { label: 'Valor total', valor: safeMoeda(valor) },
          { label: 'OS', valor: String(linhas.length) },
        ],
        linhas: linhas.slice(0, 80),
      }
    }

    case 'funcionario': {
      const id = ctx.filtroFuncionarioId
      const perfil = perfis.find((p) => p.id === id)
      const stat = painel.funcionarios.find((f) => f.id === id)
      if (!perfil || !stat) {
        return emptyView(tipo, 'Funcionário')
      }
      const mes = intervalo.fim.slice(0, 7)
      const detalhes = listarOsComissaoFuncionario(
        perfil,
        ordens,
        lancamentos,
        mes,
        configComissoes
      ).filter((d) => dataNoPeriodo(d.data_referencia, intervalo))
      return {
        tipo,
        titulo: `Produtividade · ${stat.nome}`,
        descricao: 'OS e comissão no período (somente leitura).',
        resumos: [
          { label: 'OS', valor: String(stat.quantidade_os) },
          { label: 'Comissão gerada', valor: safeMoeda(stat.comissao_gerada) },
          { label: 'Em aberto', valor: safeMoeda(stat.comissao_em_aberto) },
        ],
        linhas: detalhes.slice(0, 80).map((d) => {
          const os = ordens.find((o) => o.id === d.os_id)
          return {
            id: d.os_id,
            titulo: `OS #${d.numero}`,
            subtitulo: os
              ? `${nomeCliente(clientes, os.cliente_id)} · ${labelMoto(motos, os.moto_id)}`
              : formatarData(d.data_referencia),
            valor: safeMoeda(d.comissao),
            meta: formatarData(d.data_referencia),
            badge: os ? getLabelStatusOS(os.status) : undefined,
            osId: d.os_id,
          }
        }),
      }
    }

    default:
      return emptyView(tipo, 'Detalhe')
  }
}
