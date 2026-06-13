import { createElement } from 'react'
import { ReciboDocumentoConteudo } from '@/components/os/ReciboDocumentoConteudo'
import '@/components/os/os-documento.css'
import {
  buildReciboDocumentoViewModel,
  type ReciboDocumentoViewModel,
} from '@/lib/recibo-documento'
import {
  exportarElementoComoPdf,
  limparCapturaDocumento,
  montarDocumentoCaptura,
} from '@/services/pdf-capture.service'
import type { Cliente, LancamentoFinanceiro, Moto, Oficina, OrdemServico } from '@/types'

export async function exportarReciboPdf(
  os: OrdemServico,
  pagamento: LancamentoFinanceiro,
  cliente: Cliente,
  moto: Moto,
  oficina: Oficina
): Promise<void> {
  const dados = buildReciboDocumentoViewModel(os, pagamento, cliente, moto, oficina)
  const filename = `recibo-os-${os.numero}-craft.pdf`

  const { container, root, elemento } = await montarDocumentoCaptura(
    createElement(ReciboDocumentoConteudo, { dados })
  )

  try {
    await exportarElementoComoPdf(elemento, filename)
  } finally {
    limparCapturaDocumento(container, root)
  }
}

export { buildReciboDocumentoViewModel }
export type { ReciboDocumentoViewModel }
