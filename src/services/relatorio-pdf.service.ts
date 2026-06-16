import { createElement } from 'react'
import {
  RelatorioDocumentoConteudo,
  type RelatorioDocumentoViewModel,
} from '@/components/relatorios/RelatorioDocumentoConteudo'
import '@/components/os/os-documento.css'
import {
  exportarElementoComoPdf,
  limparCapturaDocumento,
  montarDocumentoCaptura,
} from '@/services/pdf-capture.service'
import type { gerarRelatoriosCompletos } from '@/services/relatorios.service'

type RelatoriosCompletos = ReturnType<typeof gerarRelatoriosCompletos>

export interface ExportarRelatorioPdfOpcoes {
  nomeOficina: string
  logoUrl?: string
  relatorios: RelatoriosCompletos
}

function montarViewModel(opcoes: ExportarRelatorioPdfOpcoes): RelatorioDocumentoViewModel {
  const { intervalo } = opcoes.relatorios
  const agora = new Date()
  return {
    nomeOficina: opcoes.nomeOficina.trim() || 'Oficina',
    logoUrl: opcoes.logoUrl,
    periodoLabel: intervalo.label,
    periodoInicio: intervalo.inicio,
    periodoFim: intervalo.fim,
    emitidoEm: agora.toLocaleString('pt-BR'),
    relatorios: opcoes.relatorios,
  }
}

export async function exportarRelatorioPdfReal(opcoes: ExportarRelatorioPdfOpcoes): Promise<void> {
  const dados = montarViewModel(opcoes)
  const slug = dados.nomeOficina.replace(/\s+/g, '-').toLowerCase().slice(0, 40)
  const filename = `relatorio-${slug}-${dados.periodoInicio}.pdf`

  const { container, root, elemento } = await montarDocumentoCaptura(
    createElement(RelatorioDocumentoConteudo, { dados })
  )

  try {
    await exportarElementoComoPdf(elemento, filename)
  } finally {
    limparCapturaDocumento(container, root)
  }
}
