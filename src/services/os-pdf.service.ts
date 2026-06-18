import { createElement } from 'react'
import { OsPrintDocument } from '@/components/os/OsPrintDocument'
import '@/components/os/os-documento.css'
import { buildOsDocumentoViewModel, type OsDocumentoViewModel } from '@/lib/os-documento'
import {
  exportarElementoComoPdf,
  limparCapturaDocumento,
  montarDocumentoCaptura,
} from '@/services/pdf-capture.service'
import { garantirChecklistPadrao } from '@/services/checklist-modelo.service'
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
  const filename = `ordem-servico-${os.numero}-craft.pdf`

  const captura = await montarDocumentoCaptura(
    createElement(OsPrintDocument, { dados })
  )

  try {
    await exportarElementoComoPdf(captura.elemento, filename)
  } finally {
    limparCapturaDocumento(captura)
  }
}

export { buildOsDocumentoViewModel }
export type { OsDocumentoViewModel }
