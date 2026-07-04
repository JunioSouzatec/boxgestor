import { ehDocumentoOrcamento } from '@/lib/os-modo-documento'
import { ehAdminSistema } from '@/lib/craft-admin'
import {
  osVisivelParaUsuario,
  podeAcessarModuloUsuario,
  type PermissoesContext,
} from '@/services/auth/permissions'
import { getLabelStatusOS } from '@/types/labels'
import type { AuthUser } from '@/types/auth'
import type { OrdemServico } from '@/types'

export interface MontarMensagemWhatsAppOsInput {
  os: OrdemServico
  nomeCliente: string
  nomeOficina: string
  veiculoLabel: string
  placa: string
  valorFormatado?: string
}

export function nomeArquivoPdfOs(os: Pick<OrdemServico, 'modo_documento' | 'numero'>): string {
  return ehDocumentoOrcamento(os)
    ? `orcamento-${os.numero}-craft.pdf`
    : `ordem-servico-${os.numero}-craft.pdf`
}

export function montarMensagemWhatsAppOs({
  os,
  nomeCliente,
  nomeOficina,
  veiculoLabel,
  placa,
  valorFormatado,
}: MontarMensagemWhatsAppOsInput): string {
  const ehOrcamento = ehDocumentoOrcamento(os)
  const linhas: string[] = [
    ehOrcamento
      ? `Olá, ${nomeCliente}. Segue o orçamento solicitado.`
      : `Olá, ${nomeCliente}. Segue a ordem de serviço.`,
    '',
    `${ehOrcamento ? 'Orçamento' : 'Ordem de Serviço'} #${os.numero} — ${nomeOficina}`,
    `Veículo: ${veiculoLabel} - Placa ${placa}`,
  ]

  if (ehOrcamento) {
    if (valorFormatado) {
      linhas.push(`Valor estimado: ${valorFormatado}`)
    }
    linhas.push('', 'Por favor, confira e nos informe se aprova a execução do serviço.')
  } else {
    linhas.push(`Status: ${getLabelStatusOS(os.status)}`)
    if (valorFormatado) {
      linhas.push(`Valor total: ${valorFormatado}`)
    }
    linhas.push('', 'Segue o documento para conferência.')
  }

  return linhas.join('\n')
}

export function rotuloBotaoEnviarWhatsAppOs(os: Pick<OrdemServico, 'modo_documento'>): string {
  return ehDocumentoOrcamento(os) ? 'Enviar orçamento' : 'Enviar OS'
}

export function podeEnviarWhatsAppOs(
  user: AuthUser | null | undefined,
  os: OrdemServico,
  config?: PermissoesContext
): boolean {
  if (!user) return false
  if (!podeAcessarModuloUsuario(user, 'ordens_servico', config)) return false
  if (!osVisivelParaUsuario(os, user, config)) return false
  if (ehAdminSistema(user)) return true
  if (user.papel === 'dono') return true
  if (user.papel === 'gerente' || user.papel === 'recepcao') return true
  return false
}

export function suportaCompartilharArquivos(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function'
  )
}

export async function compartilharArquivoNativo(input: {
  file: File
  title: string
  text: string
}): Promise<boolean> {
  if (!suportaCompartilharArquivos()) return false
  const shareData: ShareData = { files: [input.file], title: input.title, text: input.text }
  if (!navigator.canShare!(shareData)) return false
  await navigator.share(shareData)
  return true
}
