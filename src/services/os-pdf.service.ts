import { createElement } from 'react'
import { OsPrintDocument } from '@/components/os/OsPrintDocument'
import '@/components/os/os-documento.css'
import {
  buildOsDocumentoViewModel,
  type OsDocumentoFotoOsPdf,
  type OsDocumentoViewModel,
} from '@/lib/os-documento'
import {
  exportarElementoComoPdf,
  gerarPdfBlobDeElemento,
  limparCapturaDocumento,
  montarDocumentoCaptura,
} from '@/services/pdf-capture.service'
import { garantirChecklistPadrao } from '@/services/checklist-modelo.service'
import { listarFotosOSParaPdf } from '@/services/os/service-order-photos.service'
import { nomeArquivoPdfOs } from '@/lib/whatsapp-os-mensagem'
import { OFFICE_ID } from '@/types/base'
import type { Cliente, LancamentoFinanceiro, ModeloChecklist, Moto, Oficina, OrdemServico } from '@/types'

export async function exportarOsPdf(
  os: OrdemServico,
  cliente: Cliente,
  moto: Moto,
  oficina: Oficina,
  lancamentos: LancamentoFinanceiro[] = [],
  modelos: ModeloChecklist[] = [],
  officeId: string = OFFICE_ID
): Promise<void> {
  const { filename, captura } = await montarCapturaOsPdf(
    os,
    cliente,
    moto,
    oficina,
    lancamentos,
    modelos,
    officeId
  )

  try {
    await exportarElementoComoPdf(captura.elemento, filename)
  } finally {
    limparCapturaDocumento(captura)
  }
}

export async function gerarOsPdfArquivo(
  os: OrdemServico,
  cliente: Cliente,
  moto: Moto,
  oficina: Oficina,
  lancamentos: LancamentoFinanceiro[] = [],
  modelos: ModeloChecklist[] = [],
  officeId: string = OFFICE_ID
): Promise<{ blob: Blob; filename: string }> {
  const { filename, captura } = await montarCapturaOsPdf(
    os,
    cliente,
    moto,
    oficina,
    lancamentos,
    modelos,
    officeId
  )

  try {
    const blob = await gerarPdfBlobDeElemento(captura.elemento)
    return { blob, filename }
  } finally {
    limparCapturaDocumento(captura)
  }
}

async function carregarFotosOsPdf(
  os: OrdemServico,
  officeId: string
): Promise<OsDocumentoFotoOsPdf[]> {
  const office = officeId?.trim()
  const serviceOrderId = os.id?.trim()
  if (!office || !serviceOrderId) return []

  try {
    const resultado = await listarFotosOSParaPdf({
      officeId: office,
      serviceOrderId,
      osNumero: os.numero,
    })

    if (!resultado.ok || !resultado.dados) {
      console.warn('[BoxGestor PDF] Falha ao listar fotos marcadas para o PDF', {
        officeId: office,
        serviceOrderId,
        osNumero: os.numero,
        erro: resultado.erro ?? 'sem dados',
      })
      return []
    }

    return resultado.dados.map((foto) => ({
      id: foto.id,
      photo_type: foto.photo_type,
      caption: foto.caption,
      created_at: foto.created_at,
      created_by_name: foto.created_by_name,
      data_url: foto.data_url,
    }))
  } catch (err) {
    console.warn('[BoxGestor PDF] Erro ao carregar fotos marcadas para o PDF', {
      officeId: office,
      serviceOrderId,
      osNumero: os.numero,
      erro: err instanceof Error ? err.message : err,
    })
    return []
  }
}

async function montarCapturaOsPdf(
  os: OrdemServico,
  cliente: Cliente,
  moto: Moto,
  oficina: Oficina,
  lancamentos: LancamentoFinanceiro[],
  modelos: ModeloChecklist[],
  officeId: string
) {
  const modelosSeguros = garantirChecklistPadrao(modelos, officeId)
  const dadosBase = buildOsDocumentoViewModel(
    os,
    cliente,
    moto,
    oficina,
    lancamentos,
    modelosSeguros,
    officeId
  )
  const fotosOsPdf = await carregarFotosOsPdf(os, officeId)
  const dados: OsDocumentoViewModel = {
    ...dadosBase,
    servico: {
      ...dadosBase.servico,
      fotosOsPdf,
    },
  }
  const filename = nomeArquivoPdfOs(os)
  const captura = await montarDocumentoCaptura(createElement(OsPrintDocument, { dados }))
  return { filename, captura, dados }
}

export { buildOsDocumentoViewModel }
export type { OsDocumentoViewModel }
