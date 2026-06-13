import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import { OsDocumentoConteudo } from '@/components/os/OsDocumentoConteudo'
import '@/components/os/os-documento.css'
import { buildOsDocumentoViewModel, type OsDocumentoViewModel } from '@/lib/os-documento'
import { garantirChecklistPadrao } from '@/services/checklist-modelo.service'
import { OFFICE_ID } from '@/types/base'
import type { Cliente, LancamentoFinanceiro, ModeloChecklist, Moto, Oficina, OrdemServico } from '@/types'

/** Largura A4 em px (~96dpi) para layout estável na captura */
const A4_LARGURA_PX = 794
const MARGEM_MM = 12
const PAGINA_LARGURA_MM = 210
const PAGINA_ALTURA_MM = 297
const CONTEUDO_LARGURA_MM = PAGINA_LARGURA_MM - MARGEM_MM * 2
const CONTEUDO_ALTURA_MM = PAGINA_ALTURA_MM - MARGEM_MM * 2

function aguardarRender(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })
}

function aguardarImagens(element: HTMLElement): Promise<void> {
  const imagens = Array.from(element.querySelectorAll('img'))
  if (!imagens.length) return Promise.resolve()

  return Promise.all(
    imagens.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) {
            resolve()
            return
          }
          img.onload = () => resolve()
          img.onerror = () => resolve()
        })
    )
  ).then(() => undefined)
}

async function montarDocumentoCaptura(
  dados: OsDocumentoViewModel
): Promise<{ container: HTMLDivElement; root: Root; elemento: HTMLElement }> {
  const container = document.createElement('div')
  container.setAttribute('aria-hidden', 'true')
  container.style.cssText = [
    'position:fixed',
    'left:-10000px',
    'top:0',
    `width:${A4_LARGURA_PX}px`,
    'background:#ffffff',
    'z-index:-1',
    'pointer-events:none',
    'overflow:visible',
  ].join(';')
  document.body.appendChild(container)

  const root = createRoot(container)
  root.render(createElement(OsDocumentoConteudo, { dados }))

  await aguardarRender()
  await document.fonts.ready

  const elemento = container.querySelector('.os-documento')
  if (!elemento || !(elemento instanceof HTMLElement)) {
    root.unmount()
    document.body.removeChild(container)
    throw new Error('Não foi possível montar o documento da OS para exportação.')
  }

  await aguardarImagens(elemento)

  return { container, root, elemento }
}

function limparCaptura(container: HTMLDivElement, root: Root): void {
  root.unmount()
  if (container.parentNode) {
    container.parentNode.removeChild(container)
  }
}

function canvasParaPdfMultipagina(canvas: HTMLCanvasElement, filename: string): void {
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  })

  const imgData = canvas.toDataURL('image/jpeg', 0.92)
  const alturaTotalMm = (canvas.height * CONTEUDO_LARGURA_MM) / canvas.width

  let offsetY = 0
  let pagina = 0

  while (offsetY < alturaTotalMm - 0.5) {
    if (pagina > 0) pdf.addPage()
    pdf.addImage(
      imgData,
      'JPEG',
      MARGEM_MM,
      MARGEM_MM - offsetY,
      CONTEUDO_LARGURA_MM,
      alturaTotalMm
    )
    offsetY += CONTEUDO_ALTURA_MM
    pagina++
  }

  pdf.save(filename)
}

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

  const { container, root, elemento } = await montarDocumentoCaptura(dados)

  try {
    const canvas = await html2canvas(elemento, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      scrollX: 0,
      scrollY: 0,
      width: elemento.scrollWidth,
      height: elemento.scrollHeight,
      windowWidth: A4_LARGURA_PX,
    })

    canvasParaPdfMultipagina(canvas, filename)
  } finally {
    limparCaptura(container, root)
  }
}

export { buildOsDocumentoViewModel }
