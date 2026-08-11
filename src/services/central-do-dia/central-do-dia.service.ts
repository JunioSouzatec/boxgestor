/**
 * Central do Dia A1 — agregação operacional diária (somente leitura).
 * Sem migration. Não altera OS/status/pagamento/estoque/caixa/comunicação.
 */

import type { Agendamento } from '@/types/agendamento'
import type { Peca } from '@/types/peca'
import type { SessaoCaixa } from '@/types/caixa'
import {
  diasEntreDatasLocais,
  extrairDataBrasilYYYYMMDD,
  getDataLocalHoje,
} from '@/lib/data-local'
import { entidadeFoiExcluida } from '@/lib/entidade-ativa'
import { rotaVisualizarOs } from '@/lib/rota-os'
import { obterCaixaConfig } from '@/types/caixa-config'
import type { ConfiguracaoOficina } from '@/types/oficina'
import type { CardPatioOS } from '@/services/patio/patio.service'
import type { ResumoAlertasComunicacao } from '@/types/alerta-comunicacao'
import type { ResumoMensagensAgendadas } from '@/types/mensagem-agendada'

export type PrioridadeCentral = 'critico' | 'atencao' | 'normal'
export type TipoItemCentral =
  | 'os'
  | 'pagamento'
  | 'comunicacao'
  | 'agenda'
  | 'estoque'
  | 'caixa'

export type FiltroTipoCentral = 'todos' | TipoItemCentral
export type FiltroPrioridadeCentral = 'todos' | PrioridadeCentral

export interface ResumoCentralDoDia {
  osParaHoje: number
  osAtrasadas: number
  prontas: number
  pagamentosPendentes: number
  agendamentosHoje: number
  comunicacoesPendentes: number
  estoqueBaixo: number
  caixaAberto: boolean | null
  caixaExigeAberto: boolean
}

export interface ItemPrioridadeCentral {
  id: string
  tipo: TipoItemCentral
  titulo: string
  descricao: string
  prioridade: PrioridadeCentral
  acaoLabel: string
  acaoTo: string
  busca: string
}

export interface ItemEstoqueBaixoCentral {
  id: string
  nome: string
  quantidade: number
  minimo: number
}

export interface ItemAgendaCentral {
  id: string
  horario: string
  clienteNome: string
  servico: string
  status: string
}

export interface CentralDoDiaDados {
  hoje: string
  resumo: ResumoCentralDoDia
  prioridades: ItemPrioridadeCentral[]
  osAtrasadas: CardPatioOS[]
  osParaHoje: CardPatioOS[]
  prontas: CardPatioOS[]
  pagamentosPendentes: CardPatioOS[]
  agendaHoje: ItemAgendaCentral[]
  estoqueBaixo: ItemEstoqueBaixoCentral[]
  comunicacao: {
    alertasVencidos: number
    alertasHoje: number
    alertasPendentes: number
    mensagensAtrasadas: number
    mensagensHoje: number
  }
  caixa: {
    aberto: boolean | null
    exigeAberto: boolean
    sessao: SessaoCaixa | null
  }
}

const LIMITE = 10

function noPatioAtivo(c: CardPatioOS): boolean {
  return c.etapa !== 'entregue_finalizada' && c.status !== 'cancelada'
}

export function listarEstoqueBaixoCentral(pecas: Peca[]): ItemEstoqueBaixoCentral[] {
  return pecas
    .filter((p) => {
      if (entidadeFoiExcluida(p) || p.ativo === false) return false
      const minimo = p.estoque_minimo ?? 0
      // Alinha ao resumo do estoque: zeradas + abaixo do mínimo
      return p.quantidade <= 0 || (p.quantidade > 0 && p.quantidade <= minimo)
    })
    .sort((a, b) => a.quantidade - b.quantidade)
    .slice(0, LIMITE)
    .map((p) => ({
      id: p.id,
      nome: p.nome,
      quantidade: p.quantidade,
      minimo: p.estoque_minimo ?? 0,
    }))
}

export function listarAgendaHojeCentral(
  agendamentos: Agendamento[],
  clientes: Array<{ id: string; nome: string }>,
  hoje = getDataLocalHoje()
): ItemAgendaCentral[] {
  return agendamentos
    .filter((a) => a.data === hoje && a.status !== 'cancelado')
    .sort((a, b) => (a.horario || '').localeCompare(b.horario || ''))
    .slice(0, LIMITE)
    .map((a) => ({
      id: a.id,
      horario: a.horario || '—',
      clienteNome: clientes.find((c) => c.id === a.cliente_id)?.nome || 'Cliente',
      servico: a.servico || 'Agendamento',
      status: a.status,
    }))
}

export function montarCentralDoDia(input: {
  cardsPatio: CardPatioOS[]
  agendamentos: Agendamento[]
  clientes: Array<{ id: string; nome: string }>
  pecas: Peca[]
  configuracao?: ConfiguracaoOficina | null
  resumoAlertas?: ResumoAlertasComunicacao | null
  resumoMensagens?: ResumoMensagensAgendadas | null
  caixaSessao?: SessaoCaixa | null
  caixaCarregado?: boolean
}): CentralDoDiaDados {
  const hoje = getDataLocalHoje()
  const ativos = input.cardsPatio.filter(noPatioAtivo)

  const osAtrasadas = ativos
    .filter((c) => c.atrasada)
    .sort((a, b) => (a.dataPrevisao || '').localeCompare(b.dataPrevisao || ''))

  const osParaHoje = ativos
    .filter((c) => {
      if (c.venceHoje) return true
      const entrada = c.dataEntrada ? extrairDataBrasilYYYYMMDD(c.dataEntrada) : ''
      return entrada === hoje
    })
    .sort((a, b) => {
      if (a.venceHoje !== b.venceHoje) return a.venceHoje ? -1 : 1
      return b.numero - a.numero
    })

  const prontas = ativos.filter((c) => c.pronta)
  const pagamentosPendentes = ativos
    .filter((c) => c.pagamentoPendente)
    .sort((a, b) => b.valorPendente - a.valorPendente)

  const agendaHoje = listarAgendaHojeCentral(input.agendamentos, input.clientes, hoje)
  const estoqueBaixo = listarEstoqueBaixoCentral(input.pecas)
  const caixaCfg = obterCaixaConfig(input.configuracao)
  const exigeAberto = caixaCfg.exigir_caixa_aberto_pagamentos
  const caixaAberto =
    input.caixaCarregado === false
      ? null
      : Boolean(input.caixaSessao && input.caixaSessao.status === 'open')

  const alertasVencidos = input.resumoAlertas?.vencidos ?? 0
  const alertasHoje = input.resumoAlertas?.hoje ?? 0
  const alertasPendentes = input.resumoAlertas?.pendentes ?? 0
  const mensagensAtrasadas = input.resumoMensagens?.totalAtrasadas ?? 0
  const mensagensHoje = input.resumoMensagens?.paraHoje?.length ?? 0
  const comunicacoesPendentes =
    alertasPendentes + mensagensAtrasadas + mensagensHoje

  const resumo: ResumoCentralDoDia = {
    osParaHoje: osParaHoje.length,
    osAtrasadas: osAtrasadas.length,
    prontas: prontas.length,
    pagamentosPendentes: pagamentosPendentes.length,
    agendamentosHoje: agendaHoje.length,
    comunicacoesPendentes,
    estoqueBaixo: estoqueBaixo.length,
    caixaAberto,
    caixaExigeAberto: exigeAberto,
  }

  const prioridades: ItemPrioridadeCentral[] = []

  for (const c of osAtrasadas.slice(0, 5)) {
    const dias =
      c.dataPrevisao != null
        ? Math.max(1, diasEntreDatasLocais(c.dataPrevisao, hoje))
        : 1
    prioridades.push({
      id: `os-atrasada-${c.id}`,
      tipo: 'os',
      titulo: `OS #${c.numero} atrasada`,
      descricao: `${c.clienteNome} · ${c.veiculoLabel}${c.placa ? ` · ${c.placa}` : ''} · ${dias} dia(s)`,
      prioridade: 'critico',
      acaoLabel: 'Abrir OS',
      acaoTo: rotaVisualizarOs({ id: c.id }),
      busca: `${c.numero} ${c.clienteNome} ${c.veiculoLabel} ${c.placa || ''}`,
    })
  }

  for (const c of osParaHoje.filter((x) => x.venceHoje).slice(0, 5)) {
    prioridades.push({
      id: `os-hoje-${c.id}`,
      tipo: 'os',
      titulo: `OS #${c.numero} prevista para hoje`,
      descricao: `${c.clienteNome} · ${c.veiculoLabel}${c.placa ? ` · ${c.placa}` : ''}`,
      prioridade: 'atencao',
      acaoLabel: 'Abrir OS',
      acaoTo: rotaVisualizarOs({ id: c.id }),
      busca: `${c.numero} ${c.clienteNome} ${c.veiculoLabel} ${c.placa || ''}`,
    })
  }

  for (const c of pagamentosPendentes.slice(0, 4)) {
    prioridades.push({
      id: `pag-${c.id}`,
      tipo: 'pagamento',
      titulo: `Pagamento pendente · OS #${c.numero}`,
      descricao: `${c.clienteNome} · saldo ${c.valorPendenteLabel}`,
      prioridade: c.atrasada ? 'critico' : 'atencao',
      acaoLabel: 'Abrir OS',
      acaoTo: rotaVisualizarOs({ id: c.id }),
      busca: `${c.numero} ${c.clienteNome} ${c.veiculoLabel} pagamento`,
    })
  }

  if (alertasVencidos > 0 || mensagensAtrasadas > 0) {
    prioridades.push({
      id: 'com-vencidas',
      tipo: 'comunicacao',
      titulo: 'Comunicações vencidas',
      descricao: `${alertasVencidos} alerta(s) · ${mensagensAtrasadas} mensagem(ns) atrasada(s)`,
      prioridade: 'critico',
      acaoLabel: 'Abrir Comunicação',
      acaoTo: '/comunicacao',
      busca: 'comunicacao mensagem alerta vencido',
    })
  } else if (alertasHoje > 0 || mensagensHoje > 0) {
    prioridades.push({
      id: 'com-hoje',
      tipo: 'comunicacao',
      titulo: 'Comunicações de hoje',
      descricao: `${alertasHoje} alerta(s) · ${mensagensHoje} mensagem(ns)`,
      prioridade: 'atencao',
      acaoLabel: 'Abrir Comunicação',
      acaoTo: '/comunicacao',
      busca: 'comunicacao mensagem alerta hoje',
    })
  }

  for (const a of agendaHoje.slice(0, 4)) {
    prioridades.push({
      id: `agenda-${a.id}`,
      tipo: 'agenda',
      titulo: `Agendamento ${a.horario}`,
      descricao: `${a.clienteNome} · ${a.servico}`,
      prioridade: 'normal',
      acaoLabel: 'Abrir Agenda',
      acaoTo: '/agenda?data=hoje',
      busca: `${a.clienteNome} ${a.servico} agenda`,
    })
  }

  for (const e of estoqueBaixo.slice(0, 3)) {
    prioridades.push({
      id: `est-${e.id}`,
      tipo: 'estoque',
      titulo: `Estoque baixo · ${e.nome}`,
      descricao: `${e.quantidade} un. (mín. ${e.minimo})`,
      prioridade: e.quantidade <= 0 ? 'critico' : 'atencao',
      acaoLabel: 'Abrir Estoque',
      acaoTo: '/estoque?baixo=1',
      busca: `${e.nome} estoque`,
    })
  }

  if (caixaAberto === false && exigeAberto) {
    prioridades.push({
      id: 'caixa-fechado',
      tipo: 'caixa',
      titulo: 'Caixa fechado',
      descricao: 'Configuração exige caixa aberto para pagamentos.',
      prioridade: 'atencao',
      acaoLabel: 'Abrir Caixa',
      acaoTo: '/caixa',
      busca: 'caixa fechado',
    })
  }

  const ordemPrio: Record<PrioridadeCentral, number> = {
    critico: 0,
    atencao: 1,
    normal: 2,
  }
  prioridades.sort((a, b) => ordemPrio[a.prioridade] - ordemPrio[b.prioridade])

  return {
    hoje,
    resumo,
    prioridades: prioridades.slice(0, 20),
    osAtrasadas: osAtrasadas.slice(0, LIMITE),
    osParaHoje: osParaHoje.slice(0, LIMITE),
    prontas: prontas.slice(0, LIMITE),
    pagamentosPendentes: pagamentosPendentes.slice(0, LIMITE),
    agendaHoje,
    estoqueBaixo,
    comunicacao: {
      alertasVencidos,
      alertasHoje,
      alertasPendentes,
      mensagensAtrasadas,
      mensagensHoje,
    },
    caixa: {
      aberto: caixaAberto,
      exigeAberto,
      sessao: input.caixaSessao ?? null,
    },
  }
}

export function filtrarPrioridadesCentral(
  itens: ItemPrioridadeCentral[],
  opts: {
    busca: string
    prioridade: FiltroPrioridadeCentral
    tipo: FiltroTipoCentral
  }
): ItemPrioridadeCentral[] {
  const q = opts.busca.trim().toLowerCase()
  return itens.filter((i) => {
    if (opts.prioridade !== 'todos' && i.prioridade !== opts.prioridade) return false
    if (opts.tipo !== 'todos' && i.tipo !== opts.tipo) return false
    if (!q) return true
    return i.busca.toLowerCase().includes(q) || i.titulo.toLowerCase().includes(q)
  })
}

export function filtrarCardsOsCentral(
  cards: CardPatioOS[],
  busca: string
): CardPatioOS[] {
  const q = busca.trim().toLowerCase()
  if (!q) return cards
  const placaQ = q.replace(/[^a-z0-9]/gi, '')
  return cards.filter((c) => {
    const hay = `${c.numero} ${c.clienteNome} ${c.veiculoLabel} ${c.placa || ''}`.toLowerCase()
    const placa = (c.placa || '').replace(/[^a-z0-9]/gi, '').toLowerCase()
    return hay.includes(q) || (placaQ.length > 0 && placa.includes(placaQ))
  })
}

export function labelPrioridadeCentral(p: PrioridadeCentral): string {
  switch (p) {
    case 'critico':
      return 'Crítico'
    case 'atencao':
      return 'Atenção'
    default:
      return 'Normal'
  }
}

export function diasAtrasoOs(card: CardPatioOS, hoje = getDataLocalHoje()): number {
  if (!card.dataPrevisao || !card.atrasada) return 0
  return Math.max(1, diasEntreDatasLocais(card.dataPrevisao, hoje))
}
