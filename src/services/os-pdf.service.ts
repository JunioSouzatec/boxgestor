import { createElement } from 'react'
import { OsPrintDocument } from '@/components/os/OsPrintDocument'
import '@/components/os/os-documento.css'
import { buildOsDocumentoViewModel, type OsDocumentoViewModel } from '@/lib/os-documento'
import {
  exportarElementoComoPdf,
  gerarPdfBlobDeElemento,
  limparCapturaDocumento,
  montarDocumentoCaptura,
} from '@/services/pdf-capture.service'
import { garantirChecklistPadrao } from '@/services/checklist-modelo.service'
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
  const dados = buildOsDocumentoViewModel(
    os,
    cliente,
    moto,
    oficina,
    lancamentos,
    modelosSeguros,
    officeId
  )
  const filename = nomeArquivoPdfOs(os)
  const captura = await montarDocumentoCaptura(createElement(OsPrintDocument, { dados }))
  return { filename, captura, dados }
}

export { buildOsDocumentoViewModel }
export type { OsDocumentoViewModel }
