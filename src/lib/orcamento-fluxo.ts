import type { StatusOrcamento } from '@/types/enums'
import type { OrdemServico } from '@/types/ordem-servico'
import { ehDocumentoOrcamento } from '@/lib/os-modo-documento'
import {
  metaTemRespostaCliente,
  orcamentoStatusPendente,
  statusOrcamentoDeAprovacaoMeta,
  tipoAprovacaoDeMeta,
} from '@/lib/orcamento-aprovacao-estado'

/** Resposta do cliente (link/manual) já registrada. */
export function orcamentoJaTemRespostaCliente(
  os: Pick<OrdemServico, 'modo_documento' | 'status_orcamento' | 'aprovacao_cliente'>
): boolean {
  if (!ehDocumentoOrcamento(os)) return false
  const st = normalizarStatusOrcamentoCarregado(os.status_orcamento)
  if (st === 'aprovado' || st === 'recusado' || st === 'convertido') return true
  return metaTemRespostaCliente(os.aprovacao_cliente)
}

/**
 * Status efetivo do fluxo de orçamento.
 * Prioriza resposta em aprovacao_cliente (link) sobre status_orcamento local defasado.
 */
export function obterStatusOrcamentoEfetivo(
  os: Pick<OrdemServico, 'modo_documento' | 'status_orcamento' | 'aprovacao_cliente'>
): StatusOrcamento | undefined {
  if (!ehDocumentoOrcamento(os)) return undefined

  const stAtual = normalizarStatusOrcamentoCarregado(os.status_orcamento)
  if (stAtual === 'convertido') return 'convertido'

  const derivado = statusOrcamentoDeAprovacaoMeta(os.aprovacao_cliente)
  if (derivado) return derivado

  if (metaTemRespostaCliente(os.aprovacao_cliente)) {
    const tipo = tipoAprovacaoDeMeta(os.aprovacao_cliente)
    if (tipo === 'rejected') return 'recusado'
    return 'aprovado'
  }

  return stAtual ?? 'rascunho'
}

export function orcamentoEstaPendente(status?: StatusOrcamento): boolean {
  return orcamentoStatusPendente(status)
}

export function podeAprovarOrcamento(os: OrdemServico): boolean {
  if (!ehDocumentoOrcamento(os)) return false
  if (orcamentoJaTemRespostaCliente(os)) return false
  return orcamentoEstaPendente(obterStatusOrcamentoEfetivo(os))
}

export function podeRecusarOrcamento(os: OrdemServico): boolean {
  if (!ehDocumentoOrcamento(os)) return false
  if (orcamentoJaTemRespostaCliente(os)) return false
  return orcamentoEstaPendente(obterStatusOrcamentoEfetivo(os))
}

export function podeConverterOrcamentoEmOS(os: OrdemServico): boolean {
  if (!ehDocumentoOrcamento(os)) return false
  const st = obterStatusOrcamentoEfetivo(os)
  // Parcial também fica como aprovado no enum — oficina decide converter manualmente.
  return st === 'aprovado'
}

export function patchAprovarOrcamento(): Pick<OrdemServico, 'status_orcamento'> {
  return { status_orcamento: 'aprovado' }
}

export function patchRecusarOrcamento(): Pick<OrdemServico, 'status_orcamento'> {
  return { status_orcamento: 'recusado' }
}

const STATUS_ORCAMENTO_OFICIAIS: StatusOrcamento[] = [
  'rascunho',
  'enviado',
  'aguardando_aprovacao',
  'aprovado',
  'recusado',
  'convertido',
]

/** Normaliza valor vindo do Supabase (ex.: reprovado legado → recusado). */
export function normalizarStatusOrcamentoCarregado(
  valor?: string | null
): StatusOrcamento | undefined {
  if (!valor?.trim()) return undefined
  const t = valor.trim()
  if (t === 'reprovado') return 'recusado'
  return STATUS_ORCAMENTO_OFICIAIS.includes(t as StatusOrcamento)
    ? (t as StatusOrcamento)
    : undefined
}

/** Marca como enviado ao cliente (WhatsApp etc.). */
export function patchMarcarOrcamentoEnviado(
  os: Pick<OrdemServico, 'modo_documento' | 'status_orcamento' | 'aprovacao_cliente'>
): Pick<OrdemServico, 'status_orcamento'> | null {
  if (!ehDocumentoOrcamento(os)) return null
  if (orcamentoJaTemRespostaCliente(os)) return null
  const status = obterStatusOrcamentoEfetivo(os)
  if (status === 'rascunho' || status === 'aguardando_aprovacao') {
    return { status_orcamento: 'enviado' }
  }
  return null
}

export type FiltroTipoDocumentoOS =
  | 'todos'
  | 'os'
  | 'orcamento'
  | 'orcamento_pendente'
  | 'orcamento_aprovado'
  | 'orcamento_convertido'

export const FILTROS_TIPO_DOCUMENTO: { value: FiltroTipoDocumentoOS; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'os', label: 'Apenas OS' },
  { value: 'orcamento', label: 'Apenas Orçamentos' },
  { value: 'orcamento_pendente', label: 'Orçamentos pendentes' },
  { value: 'orcamento_aprovado', label: 'Orçamentos aprovados' },
  { value: 'orcamento_convertido', label: 'Orçamentos convertidos' },
]

export function orcamentoEstaConvertido(
  os: Pick<OrdemServico, 'modo_documento' | 'status_orcamento' | 'aprovacao_cliente'>
): boolean {
  return ehDocumentoOrcamento(os) && obterStatusOrcamentoEfetivo(os) === 'convertido'
}

export function passaFiltroTipoDocumento(
  os: OrdemServico,
  filtro?: FiltroTipoDocumentoOS
): boolean {
  const ehOrc = ehDocumentoOrcamento(os)
  const convertido = orcamentoEstaConvertido(os)

  if (!filtro || filtro === 'todos') {
    return !convertido
  }

  if (filtro === 'os') return !ehOrc
  if (filtro === 'orcamento') return ehOrc
  if (filtro === 'orcamento_pendente') {
    return ehOrc && orcamentoEstaPendente(obterStatusOrcamentoEfetivo(os))
  }
  if (filtro === 'orcamento_aprovado') {
    return ehOrc && obterStatusOrcamentoEfetivo(os) === 'aprovado'
  }
  if (filtro === 'orcamento_convertido') {
    return convertido
  }
  return true
}
