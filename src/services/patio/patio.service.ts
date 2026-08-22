/**
 * Pátio A1 — classificação visual das OS por etapa (somente leitura).
 * Não altera status. Não altera regras de negócio. Sem migration.
 */

import type { Cliente, LancamentoFinanceiro, Moto, OrdemServico } from '@/types'
import type { StatusOS } from '@/types/enums'
import { getLabelStatusOS } from '@/types/labels'
import { entidadeFoiExcluida } from '@/lib/entidade-ativa'
import { ehDocumentoOrcamento } from '@/lib/os-modo-documento'
import { formatarMoeda } from '@/lib/utils'
import { checklistPossuiRespostas } from '@/services/checklist-modelo.service'
import { calcularPrioridadeAlerta } from '@/services/comunicacao/alertas-comunicacao.service'
import { obterDataEntradaOS } from '@/services/os-datas.service'
import { montarItemListagemOS } from '@/services/os-listagem.service'

export type EtapaPatio =
  | 'aguardando_entrada'
  | 'em_diagnostico'
  | 'aguardando_aprovacao'
  | 'aguardando_peca'
  | 'em_servico'
  | 'pronto_para_entrega'
  | 'entregue_finalizada'
  | 'outras'

export type FiltroRapidoPatio =
  | 'todas'
  | 'em_servico'
  | 'atrasadas'
  | 'hoje'
  | 'pagamento_pendente'
  | 'aguardando_aprovacao'
  | 'prontas'

export interface ColunaPatioDef {
  id: EtapaPatio
  titulo: string
  /** Conta no "total no pátio" (veículos ainda na oficina). */
  contaNoPatio: boolean
}

export const COLUNAS_PATIO: ColunaPatioDef[] = [
  { id: 'aguardando_entrada', titulo: 'Aguardando entrada', contaNoPatio: true },
  { id: 'em_diagnostico', titulo: 'Em diagnóstico', contaNoPatio: true },
  { id: 'aguardando_aprovacao', titulo: 'Aguardando aprovação', contaNoPatio: true },
  { id: 'aguardando_peca', titulo: 'Aguardando peça', contaNoPatio: true },
  { id: 'em_servico', titulo: 'Em serviço', contaNoPatio: true },
  { id: 'pronto_para_entrega', titulo: 'Pronto para entrega', contaNoPatio: true },
  { id: 'entregue_finalizada', titulo: 'Entregue / Finalizada', contaNoPatio: false },
  { id: 'outras', titulo: 'Outras / Sem etapa', contaNoPatio: false },
]

/** Mapeamento visual — não altera o status salvo da OS. */
export function mapearStatusParaEtapaPatio(status: StatusOS): EtapaPatio {
  switch (status) {
    case 'recebida':
      return 'aguardando_entrada'
    case 'em_diagnostico':
      return 'em_diagnostico'
    case 'aguardando_aprovacao':
      return 'aguardando_aprovacao'
    case 'aguardando_peca':
      return 'aguardando_peca'
    case 'em_servico':
      return 'em_servico'
    case 'pronto_para_retirada':
      return 'pronto_para_entrega'
    case 'finalizada':
    case 'entregue':
      return 'entregue_finalizada'
    default:
      return 'outras'
  }
}

export interface BadgePatio {
  id: string
  label: string
  variante: 'danger' | 'warning' | 'info' | 'success' | 'muted'
}

export interface CardPatioOS {
  id: string
  numero: number
  clienteNome: string
  veiculoLabel: string
  placa?: string
  status: StatusOS
  statusLabel: string
  etapa: EtapaPatio
  dataEntrada: string
  dataPrevisao?: string
  valorTotal: number
  valorTotalLabel: string
  valorPendente: number
  valorPendenteLabel: string
  responsavel?: string
  badges: BadgePatio[]
  atrasada: boolean
  venceHoje: boolean
  pagamentoPendente: boolean
  aguardandoAprovacao: boolean
  checklistPendente: boolean
  pronta: boolean
}

export interface ResumoPatio {
  totalNoPatio: number
  emServico: number
  atrasadas: number
  prontas: number
  pagamentoPendente: number
  aguardandoAprovacao: number
}

export interface FiltrosPatio {
  busca: string
  status: StatusOS | 'todos'
  responsavel: string | 'todos'
  rapido: FiltroRapidoPatio
}

export const FILTROS_PATIO_VAZIO: FiltrosPatio = {
  busca: '',
  status: 'todos',
  responsavel: 'todos',
  rapido: 'todas',
}

/** Limite de OS finalizadas/entregues exibidas (performance). */
const LIMITE_FINALIZADAS = 40

const ETAPAS_CONTA_NO_PATIO = new Set(
  COLUNAS_PATIO.filter((c) => c.contaNoPatio).map((c) => c.id)
)

/** Etapas que entram no contador “total no pátio”. */
export function etapaContaNoPatio(etapa: EtapaPatio): boolean {
  return ETAPAS_CONTA_NO_PATIO.has(etapa)
}

const INDICE_COLUNA_PATIO = new Map(COLUNAS_PATIO.map((c, i) => [c.id, i]))

type ClientesLookup = Cliente[] | Map<string, Cliente>
type MotosLookup = Moto[] | Map<string, Moto>

function mapaClientes(clientes: ClientesLookup): Map<string, Cliente> {
  if (clientes instanceof Map) return clientes
  const mapa = new Map<string, Cliente>()
  for (const c of clientes) mapa.set(c.id, c)
  return mapa
}

function mapaMotos(motos: MotosLookup): Map<string, Moto> {
  if (motos instanceof Map) return motos
  const mapa = new Map<string, Moto>()
  for (const m of motos) mapa.set(m.id, m)
  return mapa
}

function montarBadges(card: Omit<CardPatioOS, 'badges'>): BadgePatio[] {
  const badges: BadgePatio[] = []
  if (card.atrasada) badges.push({ id: 'atrasada', label: 'Atrasada', variante: 'danger' })
  if (card.venceHoje) badges.push({ id: 'hoje', label: 'Vence hoje', variante: 'warning' })
  if (card.aguardandoAprovacao) {
    badges.push({ id: 'aprovacao', label: 'Aguardando aprovação', variante: 'warning' })
  }
  if (card.pagamentoPendente) {
    badges.push({ id: 'pagamento', label: 'Pagamento pendente', variante: 'warning' })
  }
  if (card.checklistPendente) {
    badges.push({ id: 'checklist', label: 'Checklist pendente', variante: 'info' })
  }
  if (card.pronta) badges.push({ id: 'pronta', label: 'Pronta', variante: 'success' })
  return badges
}

export function montarCardPatioOS(
  os: OrdemServico,
  clientes: ClientesLookup,
  motos: MotosLookup,
  lancamentos: LancamentoFinanceiro[]
): CardPatioOS {
  const item = montarItemListagemOS(os, clientes, motos, lancamentos)
  const etapa = mapearStatusParaEtapaPatio(os.status)
  const prioridade = os.data_previsao
    ? calcularPrioridadeAlerta(os.data_previsao)
    : null
  const atrasada = prioridade === 'vencido' && etapa !== 'entregue_finalizada' && os.status !== 'cancelada'
  const venceHoje = prioridade === 'hoje' && etapa !== 'entregue_finalizada' && os.status !== 'cancelada'
  const pagamentoPendente = item.valorPendente > 0.009 && os.status !== 'cancelada'
  const aguardandoAprovacao = os.status === 'aguardando_aprovacao'
  const checklistItens = os.checklist_entrada?.itens
  const checklistPendente =
    etapa !== 'entregue_finalizada' &&
    os.status !== 'cancelada' &&
    Boolean(checklistItens?.length) &&
    !checklistPossuiRespostas(os.checklist_entrada as Parameters<typeof checklistPossuiRespostas>[0])
  const pronta = os.status === 'pronto_para_retirada'

  const base: Omit<CardPatioOS, 'badges'> = {
    id: os.id,
    numero: os.numero,
    clienteNome: item.clienteNome || 'Cliente',
    veiculoLabel: item.motoLabel || 'Veículo',
    placa: item.motoPlaca,
    status: os.status,
    statusLabel: getLabelStatusOS(os.status),
    etapa,
    dataEntrada: item.dataEntrada || obterDataEntradaOS(os),
    dataPrevisao: item.dataPrevisao || os.data_previsao,
    valorTotal: item.totalGeral,
    valorTotalLabel: formatarMoeda(item.totalGeral),
    valorPendente: item.valorPendente,
    valorPendenteLabel: formatarMoeda(item.valorPendente),
    responsavel: os.responsavel?.trim() || undefined,
    atrasada,
    venceHoje,
    pagamentoPendente,
    aguardandoAprovacao,
    checklistPendente,
    pronta,
  }

  return { ...base, badges: montarBadges(base) }
}

export function listarCardsPatio(input: {
  ordens: OrdemServico[]
  clientes: Cliente[]
  motos: Moto[]
  lancamentos: LancamentoFinanceiro[]
}): CardPatioOS[] {
  const clientesPorId = mapaClientes(input.clientes)
  const motosPorId = mapaMotos(input.motos)
  const ativos = input.ordens.filter(
    (os) => !entidadeFoiExcluida(os) && !ehDocumentoOrcamento(os) && os.status !== 'cancelada'
  )

  const cards = ativos.map((os) =>
    montarCardPatioOS(os, clientesPorId, motosPorId, input.lancamentos)
  )

  // Limita finalizadas/entregues recentes para não pesar o mobile.
  const noPatio = cards.filter((c) => c.etapa !== 'entregue_finalizada')
  const finalizadas = cards
    .filter((c) => c.etapa === 'entregue_finalizada')
    .sort((a, b) => (b.dataEntrada || '').localeCompare(a.dataEntrada || ''))
    .slice(0, LIMITE_FINALIZADAS)

  return [...noPatio, ...finalizadas]
}

export function filtrarCardsPatio(cards: CardPatioOS[], filtros: FiltrosPatio): CardPatioOS[] {
  const busca = filtros.busca.trim().toLowerCase()
  const placaBusca = busca.replace(/[^a-z0-9]/gi, '')

  return cards.filter((c) => {
    if (filtros.status !== 'todos' && c.status !== filtros.status) return false
    if (filtros.responsavel !== 'todos') {
      const resp = (c.responsavel || '').trim().toLowerCase()
      if (resp !== filtros.responsavel.trim().toLowerCase()) return false
    }
    if (busca) {
      const hay = `${c.numero} ${c.clienteNome} ${c.veiculoLabel} ${c.placa || ''}`.toLowerCase()
      const placaHay = (c.placa || '').replace(/[^a-z0-9]/gi, '').toLowerCase()
      if (!hay.includes(busca) && !(placaBusca && placaHay.includes(placaBusca))) {
        return false
      }
    }
    switch (filtros.rapido) {
      case 'em_servico':
        return c.etapa === 'em_servico'
      case 'atrasadas':
        return c.atrasada
      case 'hoje':
        return c.venceHoje
      case 'pagamento_pendente':
        return c.pagamentoPendente
      case 'aguardando_aprovacao':
        return c.aguardandoAprovacao
      case 'prontas':
        return c.pronta
      default:
        return true
    }
  })
}

export function patioTemFiltroAtivo(filtros: FiltrosPatio): boolean {
  return (
    filtros.rapido !== 'todas' ||
    filtros.status !== 'todos' ||
    filtros.responsavel !== 'todos' ||
    Boolean(filtros.busca.trim())
  )
}

export function labelFiltroAtivoPatio(filtros: FiltrosPatio): string | null {
  if (!patioTemFiltroAtivo(filtros)) return null
  const partes: string[] = []
  if (filtros.rapido !== 'todas') {
    const labels: Record<Exclude<FiltroRapidoPatio, 'todas'>, string> = {
      em_servico: 'Em serviço',
      atrasadas: 'Atrasadas',
      hoje: 'Vence hoje',
      pagamento_pendente: 'Pagamento pendente',
      aguardando_aprovacao: 'Aguardando aprovação',
      prontas: 'Prontas',
    }
    partes.push(labels[filtros.rapido])
  }
  if (filtros.status !== 'todos') {
    partes.push(`Status OS: ${getLabelStatusOS(filtros.status)}`)
  }
  if (filtros.responsavel !== 'todos') {
    partes.push(`Responsável: ${filtros.responsavel}`)
  }
  if (filtros.busca.trim()) {
    partes.push(`Busca: “${filtros.busca.trim()}”`)
  }
  return partes.join(' · ')
}

/** Etapa visual prioritária do filtro rápido (ordenação de colunas, sem alterar OS). */
export function etapaPrioritariaDoFiltro(filtros: FiltrosPatio): EtapaPatio | null {
  switch (filtros.rapido) {
    case 'em_servico':
      return 'em_servico'
    case 'prontas':
      return 'pronto_para_entrega'
    case 'aguardando_aprovacao':
      return 'aguardando_aprovacao'
    default:
      break
  }
  if (filtros.status !== 'todos') {
    return mapearStatusParaEtapaPatio(filtros.status)
  }
  return null
}

/**
 * Ordenação visual das colunas:
 * 1) etapa do filtro rápido/status primeiro;
 * 2) em filtros transversais (atrasadas/pagamento), colunas com resultado primeiro;
 * 3) ordem padrão das etapas.
 */
export function ordenarColunasPatio(
  colunas: ColunaPatioDef[],
  porEtapa: Record<EtapaPatio, CardPatioOS[]>,
  filtros: FiltrosPatio
): ColunaPatioDef[] {
  const prioridade = etapaPrioritariaDoFiltro(filtros)
  const transversal =
    filtros.rapido === 'atrasadas' ||
    filtros.rapido === 'hoje' ||
    filtros.rapido === 'pagamento_pendente'

  return [...colunas].sort((a, b) => {
    if (prioridade) {
      if (a.id === prioridade && b.id !== prioridade) return -1
      if (b.id === prioridade && a.id !== prioridade) return 1
    }
    if (transversal) {
      const qa = porEtapa[a.id]?.length ?? 0
      const qb = porEtapa[b.id]?.length ?? 0
      if (qa > 0 && qb === 0) return -1
      if (qb > 0 && qa === 0) return 1
    }
    const ia = INDICE_COLUNA_PATIO.get(a.id) ?? 0
    const ib = INDICE_COLUNA_PATIO.get(b.id) ?? 0
    return ia - ib
  })
}

export function agruparCardsPorEtapa(
  cards: CardPatioOS[]
): Record<EtapaPatio, CardPatioOS[]> {
  const mapa = Object.fromEntries(COLUNAS_PATIO.map((c) => [c.id, [] as CardPatioOS[]])) as Record<
    EtapaPatio,
    CardPatioOS[]
  >
  for (const card of cards) {
    mapa[card.etapa].push(card)
  }
  // Ordena cada coluna: atrasadas primeiro, depois previsão, depois número
  for (const col of COLUNAS_PATIO) {
    mapa[col.id].sort((a, b) => {
      if (a.atrasada !== b.atrasada) return a.atrasada ? -1 : 1
      if (a.venceHoje !== b.venceHoje) return a.venceHoje ? -1 : 1
      const pa = a.dataPrevisao || '9999'
      const pb = b.dataPrevisao || '9999'
      if (pa !== pb) return pa.localeCompare(pb)
      return b.numero - a.numero
    })
  }
  return mapa
}

export function montarResumoPatio(cards: CardPatioOS[]): ResumoPatio {
  let totalNoPatio = 0
  let emServico = 0
  let atrasadas = 0
  let prontas = 0
  let pagamentoPendente = 0
  let aguardandoAprovacao = 0

  for (const c of cards) {
    const noPatio = ETAPAS_CONTA_NO_PATIO.has(c.etapa)
    if (noPatio) {
      totalNoPatio++
      if (c.atrasada) atrasadas++
      if (c.pagamentoPendente) pagamentoPendente++
    }
    if (c.etapa === 'em_servico') emServico++
    if (c.pronta) prontas++
    if (c.aguardandoAprovacao) aguardandoAprovacao++
  }

  return {
    totalNoPatio,
    emServico,
    atrasadas,
    prontas,
    pagamentoPendente,
    aguardandoAprovacao,
  }
}

export function listarResponsaveisPatio(cards: CardPatioOS[]): string[] {
  const set = new Set<string>()
  for (const c of cards) {
    if (c.responsavel?.trim()) set.add(c.responsavel.trim())
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'))
}
