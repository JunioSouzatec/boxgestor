import { createElement } from 'react'
import { ReciboDocumentoConteudo } from '@/components/os/ReciboDocumentoConteudo'
import '@/components/os/os-documento.css'
import {
  buildReciboDocumentoViewModel,
  type ReciboDocumentoViewModel,
} from '@/lib/recibo-documento'
import {
  exportarElementoComoPdf,
  gerarPdfBlobDeElemento,
  limparCapturaDocumento,
  montarDocumentoCaptura,
} from '@/services/pdf-capture.service'
import type { Cliente, LancamentoFinanceiro, Moto, Oficina, OrdemServico } from '@/types'

async function montarCapturaReciboPdf(
  os: OrdemServico,
  pagamento: LancamentoFinanceiro,
  cliente: Cliente,
  moto: Moto,
  oficina: Oficina,
  lancamentos: LancamentoFinanceiro[] = []
) {
  const dados = buildReciboDocumentoViewModel(os, pagamento, cliente, moto, oficina, lancamentos)
  const filename = `recibo-os-${os.numero}-craft.pdf`
  const captura = await montarDocumentoCaptura(
    createElement(ReciboDocumentoConteudo, { dados })
  )
  return { captura, filename }
}

export async function exportarReciboPdf(
  os: OrdemServico,
  pagamento: LancamentoFinanceiro,
  cliente: Cliente,
  moto: Moto,
  oficina: Oficina,
  lancamentos: LancamentoFinanceiro[] = []
): Promise<void> {
  const { captura, filename } = await montarCapturaReciboPdf(
    os,
    pagamento,
    cliente,
    moto,
    oficina,
    lancamentos
  )

  try {
    await exportarElementoComoPdf(captura.elemento, filename, { compacto: true })
  } finally {
    limparCapturaDocumento(captura)
  }
}

/** Gera blob do recibo para download/compartilhamento manual (WhatsApp). */
export async function gerarReciboPdfArquivo(
  os: OrdemServico,
  pagamento: LancamentoFinanceiro,
  cliente: Cliente,
  moto: Moto,
  oficina: Oficina,
  lancamentos: LancamentoFinanceiro[] = []
): Promise<{ blob: Blob; filename: string }> {
  const { captura, filename } = await montarCapturaReciboPdf(
    os,
    pagamento,
    cliente,
    moto,
    oficina,
    lancamentos
  )
  try {
    const blob = await gerarPdfBlobDeElemento(captura.elemento, { compacto: true })
    return { blob, filename }
  } finally {
    limparCapturaDocumento(captura)
  }
}

export { buildReciboDocumentoViewModel }
export type { ReciboDocumentoViewModel }
