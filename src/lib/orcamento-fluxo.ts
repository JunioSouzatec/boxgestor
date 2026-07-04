import type { StatusOrcamento } from '@/types/enums'
import type { OrdemServico } from '@/types/ordem-servico'
import { ehDocumentoOrcamento } from '@/lib/os-modo-documento'

/** Status efetivo do fluxo de orçamento (fallback: rascunho). */
export function obterStatusOrcamentoEfetivo(
  os: Pick<OrdemServico, 'modo_documento' | 'status_orcamento'>
): StatusOrcamento | undefined {
  if (!ehDocumentoOrcamento(os)) return undefined
  return normalizarStatusOrcamentoCarregado(os.status_orcamento) ?? 'rascunho'
}

export function orcamentoEstaPendente(status?: StatusOrcamento): boolean {
  return (
    status === 'rascunho' ||
    status === 'enviado' ||
    status === 'aguardando_aprovacao'
  )
}

export function podeAprovarOrcamento(os: OrdemServico): boolean {
  if (!ehDocumentoOrcamento(os)) return false
  return orcamentoEstaPendente(obterStatusOrcamentoEfetivo(os))
}

export function podeRecusarOrcamento(os: OrdemServico): boolean {
  if (!ehDocumentoOrcamento(os)) return false
  return orcamentoEstaPendente(obterStatusOrcamentoEfetivo(os))
}

export function podeConverterOrcamentoEmOS(os: OrdemServico): boolean {
  return ehDocumentoOrcamento(os) && obterStatusOrcamentoEfetivo(os) === 'aprovado'
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
  os: Pick<OrdemServico, 'modo_documento' | 'status_orcamento'>
): Pick<OrdemServico, 'status_orcamento'> | null {
  if (!ehDocumentoOrcamento(os)) return null
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

export const FILTROS_TIPO_DOCUMENTO: { value: FiltroTipoDocumentoOS; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'os', label: 'Apenas OS' },
  { value: 'orcamento', label: 'Apenas Orçamentos' },
  { value: 'orcamento_pendente', label: 'Orçamentos pendentes' },
  { value: 'orcamento_aprovado', label: 'Orçamentos aprovados' },
]

export function passaFiltroTipoDocumento(
  os: OrdemServico,
  filtro?: FiltroTipoDocumentoOS
): boolean {
  if (!filtro || filtro === 'todos') return true
  const ehOrc = ehDocumentoOrcamento(os)
  if (filtro === 'os') return !ehOrc
  if (filtro === 'orcamento') return ehOrc
  if (filtro === 'orcamento_pendente') {
    return ehOrc && orcamentoEstaPendente(obterStatusOrcamentoEfetivo(os))
  }
  if (filtro === 'orcamento_aprovado') {
    return ehOrc && obterStatusOrcamentoEfetivo(os) === 'aprovado'
  }
  return true
}
