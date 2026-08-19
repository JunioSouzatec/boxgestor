import { ehDocumentoOrcamento } from '@/lib/os-modo-documento'
import { ehAdminSistema } from '@/lib/craft-admin'
import { adaptarTextoLembrete, obterTermosOficina } from '@/lib/termos-oficina'
import {
  osVisivelParaUsuario,
  podeAcessarModuloUsuario,
  type PermissoesContext,
} from '@/services/auth/permissions'
import { getLabelStatusOS } from '@/types/labels'
import type { AuthUser } from '@/types/auth'
import type { OrdemServico } from '@/types'

/** Tipos de envio manual ao cliente (WhatsApp). */
export type TipoEnvioCliente =
  | 'orcamento'
  | 'os'
  | 'veiculo_pronto'
  | 'fotos'
  | 'recibo'
  | 'link_aprovacao'

export interface MontarMensagemWhatsAppOsInput {
  os: OrdemServico
  nomeCliente: string
  nomeOficina: string
  veiculoLabel: string
  placa: string
  valorFormatado?: string
  tipoOficina?: unknown
  linkAprovacao?: string | null
}

export interface MontarMensagemEnvioClienteInput {
  tipo: TipoEnvioCliente
  nomeCliente: string
  veiculoLabel: string
  placa?: string
  tipoOficina?: unknown
  linkAprovacao?: string | null
  observacao?: string
  nomeOficina?: string
  numero?: number
  valorFormatado?: string
  statusLabel?: string
}

export function nomeArquivoPdfOs(os: Pick<OrdemServico, 'modo_documento' | 'numero'>): string {
  return ehDocumentoOrcamento(os)
    ? `boxgestor-orcamento-${os.numero}.pdf`
    : `boxgestor-os-${os.numero}.pdf`
}

export function rotuloTipoEnvioCliente(tipo: TipoEnvioCliente): string {
  switch (tipo) {
    case 'orcamento':
      return 'Orçamento'
    case 'os':
      return 'OS'
    case 'veiculo_pronto':
      return 'Veículo pronto'
    case 'fotos':
      return 'Fotos'
    case 'recibo':
      return 'Recibo'
    case 'link_aprovacao':
      return 'Portal do cliente'
  }
}

/**
 * Mensagens prontas do envio manual.
 * Usa "veículo" no texto base e adapta com termos-oficina (carro/moto/mista).
 */
export function montarMensagemEnvioCliente(input: MontarMensagemEnvioClienteInput): string {
  const termos = obterTermosOficina(input.tipoOficina)
  const nome = input.nomeCliente.trim() || 'cliente'
  const nomeVeiculo = input.veiculoLabel
    .trim()
    .replace(/^Não informad[oa]$/i, '')
  const placa = (input.placa ?? '').trim().replace(/^Não informad[oa]$/i, '')
  const veiculoComPlaca =
    nomeVeiculo && placa
      ? `${nomeVeiculo} (placa ${placa})`
      : nomeVeiculo || (placa ? `(placa ${placa})` : '')
  const trechoVeiculo = veiculoComPlaca
    ? `seu veículo ${veiculoComPlaca}`
    : termos.possessivoVeiculo
  const link = input.linkAprovacao?.trim() || ''
  const oficina = input.nomeOficina?.trim() || 'oficina'
  const numero = input.numero

  let textoBase: string
  switch (input.tipo) {
    case 'orcamento':
      textoBase = link
        ? `Olá, ${nome}. Para conferir e aprovar o orçamento do ${trechoVeiculo}, acesse o portal: ${link}`
        : `Olá, ${nome}. Segue o orçamento do ${trechoVeiculo}.`
      break
    case 'link_aprovacao':
      textoBase = link
        ? `Olá, ${nome}. Segue o portal do ${trechoVeiculo}. Você pode conferir o orçamento e aprovar pelo link: ${link}`
        : `Olá, ${nome}. Segue o orçamento do ${trechoVeiculo}. Confira os serviços e valores e nos avise se aprova.`
      break
    case 'os':
      textoBase = `Olá, ${nome}. Segue a ordem de serviço do ${trechoVeiculo}.`
      break
    case 'veiculo_pronto':
      textoBase = `Olá, ${nome}. ${trechoVeiculo.charAt(0).toUpperCase()}${trechoVeiculo.slice(1)} está pronto para retirada.`
      break
    case 'fotos':
      textoBase = link
        ? `Olá ${nome}. Aqui é da ${oficina}. Separamos algumas fotos do serviço do ${trechoVeiculo}. Você pode visualizar pelo link abaixo:\n${link}\nSe preferir, também podemos enviar as imagens por aqui no WhatsApp.`
        : `Olá ${nome}. Aqui é da ${oficina}. Separamos algumas fotos do serviço do ${trechoVeiculo}. Vamos enviar as imagens por aqui no WhatsApp para você acompanhar.`
      break
    case 'recibo':
      textoBase = `Olá, ${nome}. Segue o recibo referente ao serviço do ${trechoVeiculo}.`
      break
  }

  const linhas: string[] = [adaptarTextoLembrete(textoBase, termos)]

  if (numero != null && input.nomeOficina?.trim()) {
    if (input.tipo === 'fotos') {
      linhas.push('', `OS #${numero} — ${oficina}`)
    } else {
      const rotuloDoc =
        input.tipo === 'orcamento' || input.tipo === 'link_aprovacao'
          ? `Orçamento #${numero}`
          : `Ordem de Serviço #${numero}`
      linhas.push('', `${rotuloDoc} — ${oficina}`)
    }
  }

  if (input.statusLabel && input.tipo === 'os') {
    linhas.push(`Status: ${input.statusLabel}`)
  }
  if (
    input.valorFormatado &&
    (input.tipo === 'orcamento' ||
      input.tipo === 'os' ||
      input.tipo === 'link_aprovacao' ||
      input.tipo === 'recibo')
  ) {
    linhas.push(
      input.tipo === 'orcamento' || input.tipo === 'link_aprovacao'
        ? `Valor estimado: ${input.valorFormatado}`
        : `Valor: ${input.valorFormatado}`
    )
  }

  const obs = input.observacao?.trim()
  if (obs) {
    linhas.push('', obs)
  }

  return linhas.join('\n')
}

/** Compatível com o diálogo legado — usa templates novos + detalhes. */
export function montarMensagemWhatsAppOs({
  os,
  nomeCliente,
  nomeOficina,
  veiculoLabel,
  placa,
  valorFormatado,
  tipoOficina,
  linkAprovacao,
}: MontarMensagemWhatsAppOsInput): string {
  const ehOrcamento = ehDocumentoOrcamento(os)
  return montarMensagemEnvioCliente({
    tipo: ehOrcamento ? 'orcamento' : 'os',
    nomeCliente,
    veiculoLabel,
    placa,
    tipoOficina,
    linkAprovacao,
    nomeOficina,
    numero: os.numero,
    valorFormatado,
    statusLabel: ehOrcamento ? undefined : getLabelStatusOS(os.status),
  })
}

export function rotuloBotaoEnviarWhatsAppOs(_os?: Pick<OrdemServico, 'modo_documento'>): string {
  return 'Enviar ao cliente'
}

export function tipoEnvioPadraoParaOs(os: Pick<OrdemServico, 'modo_documento'>): TipoEnvioCliente {
  return ehDocumentoOrcamento(os) ? 'orcamento' : 'os'
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
  return compartilharArquivosNativos({
    files: [input.file],
    title: input.title,
    text: input.text,
  })
}

export async function compartilharArquivosNativos(input: {
  files: File[]
  title: string
  text: string
}): Promise<boolean> {
  if (!suportaCompartilharArquivos() || input.files.length === 0) return false
  const shareData: ShareData = {
    files: input.files,
    title: input.title,
    text: input.text,
  }
  if (!navigator.canShare!(shareData)) return false
  await navigator.share(shareData)
  return true
}

/** Resumo textual para histórico da OS (sem token/URL sensível). */
export function montarDetalheHistoricoEnvioCliente(input: {
  tipo: TipoEnvioCliente
  canal?: string
  incluiuLink: boolean
  /** PDF disponibilizado (baixado/checkbox) — não significa anexo automático. */
  pdfDisponibilizado: boolean
  fotosSelecionadas: number
  compartilhouNativo?: boolean
  observacao?: string
  mensagemPreview?: string
}): string {
  const partes = [
    `Canal: ${input.canal ?? 'whatsapp_manual'}`,
    `Tipo: ${rotuloTipoEnvioCliente(input.tipo)}`,
    `Assunto: ${
      input.tipo === 'fotos'
        ? 'fotos_os'
        : input.tipo === 'orcamento' || input.tipo === 'link_aprovacao'
          ? 'orcamento'
          : input.tipo === 'recibo'
            ? 'recibo'
            : input.tipo === 'veiculo_pronto'
              ? 'veiculo_pronto'
              : 'os'
    }`,
    `Link incluído: ${input.incluiuLink ? 'sim' : 'não'}`,
    `PDF disponibilizado: ${input.pdfDisponibilizado ? 'sim' : 'não'}`,
    `Fotos selecionadas: ${input.fotosSelecionadas}`,
  ]
  if (input.compartilhouNativo) {
    partes.push('Compartilhamento nativo acionado pelo usuário: sim')
  }
  if (input.tipo === 'fotos') {
    partes.push('Obs.: Fotos precisam ser anexadas manualmente no WhatsApp Web.')
  } else {
    partes.push(
      'Obs.: Fotos/PDF precisam ser anexados manualmente quando usado WhatsApp Web.'
    )
  }
  const obs = input.observacao?.trim()
  if (obs) partes.push(`Obs. manual: ${obs.slice(0, 200)}`)
  const preview = input.mensagemPreview?.trim()
  if (preview) {
    // Nunca persistir URL/token de aprovação no histórico.
    const semUrl = preview.replace(/https?:\/\/\S+/gi, '[link]')
    const curto = semUrl.length > 180 ? `${semUrl.slice(0, 177)}…` : semUrl
    partes.push(`Mensagem: ${curto}`)
  }
  return partes.join(' · ')
}
