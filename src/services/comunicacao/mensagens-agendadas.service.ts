import { gerarId } from '@/lib/utils'
import { getDataLocalHoje, formatarDataLocalYYYYMMDD } from '@/lib/data-local'
import type {
  CriarMensagemAgendadaInput,
  FiltroMensagensAgendadas,
  MensagemAgendada,
  MensagemAgendadaComStatus,
  ResumoMensagensAgendadas,
  StatusMensagemAgendadaExibicao,
} from '@/types/mensagem-agendada'

export const MENSAGENS_AGENDADAS_STORAGE_KEY = 'craft_mensagens_agendadas_v1'

interface MensagensAgendadasStore {
  version: 1
  offices: Record<string, MensagemAgendada[]>
}

function loadStore(): MensagensAgendadasStore {
  try {
    const raw = localStorage.getItem(MENSAGENS_AGENDADAS_STORAGE_KEY)
    if (raw) return JSON.parse(raw) as MensagensAgendadasStore
  } catch {
    /* seed */
  }
  return { version: 1, offices: {} }
}

function saveStore(store: MensagensAgendadasStore): void {
  localStorage.setItem(MENSAGENS_AGENDADAS_STORAGE_KEY, JSON.stringify(store))
}

export function dataLocalDeAgendamento(iso: string): string {
  return formatarDataLocalYYYYMMDD(new Date(iso))
}

export function ehAgendamentoParaHoje(
  mensagem: MensagemAgendada,
  hoje = getDataLocalHoje()
): boolean {
  return mensagem.status === 'pendente' && dataLocalDeAgendamento(mensagem.agendado_para) === hoje
}

export function ehAgendamentoFuturo(
  mensagem: MensagemAgendada,
  hoje = getDataLocalHoje()
): boolean {
  return mensagem.status === 'pendente' && dataLocalDeAgendamento(mensagem.agendado_para) > hoje
}

export function calcularStatusExibicaoMensagemAgendada(
  mensagem: MensagemAgendada,
  agora: Date = new Date()
): StatusMensagemAgendadaExibicao {
  if (mensagem.status === 'enviada' || mensagem.status === 'cancelada') {
    return mensagem.status
  }
  const agendado = new Date(mensagem.agendado_para)
  if (agendado.getTime() < agora.getTime()) return 'atrasada'
  return 'pendente'
}

export function enriquecerMensagemAgendada(
  mensagem: MensagemAgendada,
  agora: Date = new Date()
): MensagemAgendadaComStatus {
  return {
    ...mensagem,
    status_exibicao: calcularStatusExibicaoMensagemAgendada(mensagem, agora),
  }
}

export function listarMensagensAgendadas(
  officeId: string,
  agora: Date = new Date()
): MensagemAgendadaComStatus[] {
  const store = loadStore()
  return (store.offices[officeId] ?? [])
    .map((m) => enriquecerMensagemAgendada(m, agora))
    .sort((a, b) => a.agendado_para.localeCompare(b.agendado_para))
}

export function calcularResumoMensagensAgendadas(
  officeId: string,
  agora: Date = new Date()
): ResumoMensagensAgendadas {
  const hoje = getDataLocalHoje()
  const todas = listarMensagensAgendadas(officeId, agora)

  const pendentes = todas.filter((m) => m.status === 'pendente')
  const paraHoje = pendentes.filter((m) => ehAgendamentoParaHoje(m, hoje))
  const atrasadas = pendentes.filter((m) => m.status_exibicao === 'atrasada')
  const proximas = pendentes.filter((m) => ehAgendamentoFuturo(m, hoje))
  const enviadas = todas.filter((m) => m.status === 'enviada')
  const canceladas = todas.filter((m) => m.status === 'cancelada')

  return {
    paraHoje,
    atrasadas,
    proximas,
    enviadas,
    canceladas,
    totalPendentesHoje: paraHoje.length,
    totalAtrasadas: atrasadas.length,
  }
}

export function filtrarMensagensAgendadas(
  mensagens: MensagemAgendadaComStatus[],
  filtro: FiltroMensagensAgendadas
): MensagemAgendadaComStatus[] {
  const hoje = getDataLocalHoje()
  switch (filtro) {
    case 'hoje':
      return mensagens.filter((m) => ehAgendamentoParaHoje(m, hoje))
    case 'atrasadas':
      return mensagens.filter((m) => m.status_exibicao === 'atrasada')
    case 'proximas':
      return mensagens.filter((m) => ehAgendamentoFuturo(m, hoje))
    case 'enviadas':
      return mensagens.filter((m) => m.status === 'enviada')
    case 'canceladas':
      return mensagens.filter((m) => m.status === 'cancelada')
    case 'todas':
    default:
      return mensagens
  }
}

export function criarMensagemAgendada(
  officeId: string,
  input: CriarMensagemAgendadaInput
): MensagemAgendada {
  const store = loadStore()
  if (!store.offices[officeId]) store.offices[officeId] = []

  const registro: MensagemAgendada = {
    id: gerarId(),
    office_id: officeId,
    status: 'pendente',
    created_at: new Date().toISOString(),
    ...input,
  }

  store.offices[officeId].unshift(registro)
  saveStore(store)
  return registro
}

export function marcarMensagemAgendadaEnviada(
  officeId: string,
  id: string
): MensagemAgendada | undefined {
  const store = loadStore()
  const lista = store.offices[officeId]
  if (!lista) return undefined
  const item = lista.find((m) => m.id === id)
  if (!item || item.status !== 'pendente') return item
  item.status = 'enviada'
  item.enviado_em = new Date().toISOString()
  item.updated_at = new Date().toISOString()
  saveStore(store)
  return item
}

export function cancelarMensagemAgendada(
  officeId: string,
  id: string
): MensagemAgendada | undefined {
  const store = loadStore()
  const lista = store.offices[officeId]
  if (!lista) return undefined
  const item = lista.find((m) => m.id === id)
  if (!item || item.status !== 'pendente') return item
  item.status = 'cancelada'
  item.updated_at = new Date().toISOString()
  saveStore(store)
  return item
}

/** Cancela mensagens agendadas pendentes vinculadas à OS. */
export function cancelarMensagensAgendadasDaOs(
  officeId: string,
  os: { id: string; numero?: number }
): number {
  const store = loadStore()
  const lista = store.offices[officeId]
  if (!lista) return 0
  let count = 0
  const agora = new Date().toISOString()
  for (const item of lista) {
    if (item.status !== 'pendente') continue
    const vinculado =
      item.ordem_servico_id === os.id ||
      (os.numero != null &&
        item.ordem_servico_numero != null &&
        Number(item.ordem_servico_numero) === Number(os.numero))
    if (!vinculado) continue
    item.status = 'cancelada'
    item.updated_at = agora
    count++
  }
  if (count > 0) saveStore(store)
  return count
}

export function adiarMensagemAgendada(
  officeId: string,
  id: string,
  novaDataHora: string
): MensagemAgendada | undefined {
  const store = loadStore()
  const lista = store.offices[officeId]
  if (!lista) return undefined
  const item = lista.find((m) => m.id === id)
  if (!item || item.status !== 'pendente') return item
  item.agendado_para = novaDataHora
  item.updated_at = new Date().toISOString()
  saveStore(store)
  return item
}

export function limparMensagensAgendadasPorOffice(officeId: string): void {
  const store = loadStore()
  delete store.offices[officeId]
  saveStore(store)
}

export function combinarDataHoraAgendamento(data: string, hora: string): string {
  const [h, min] = hora.split(':').map((v) => Number(v))
  const base = new Date(`${data}T00:00:00`)
  base.setHours(Number.isFinite(h) ? h : 9, Number.isFinite(min) ? min : 0, 0, 0)
  return base.toISOString()
}

export function sugerirDataRevisaoFutura(dias = 180): string {
  const d = new Date()
  d.setDate(d.getDate() + dias)
  return formatarDataLocalYYYYMMDD(d)
}
