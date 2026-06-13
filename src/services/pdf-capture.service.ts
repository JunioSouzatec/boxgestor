import type { ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'

export const PDF_A4_LARGURA_PX = 794
export const PDF_MARGEM_MM = 12
export const PDF_PAGINA_LARGURA_MM = 210
export const PDF_PAGINA_ALTURA_MM = 297
export const PDF_CONTEUDO_LARGURA_MM = PDF_PAGINA_LARGURA_MM - PDF_MARGEM_MM * 2
export const PDF_CONTEUDO_ALTURA_MM = PDF_PAGINA_ALTURA_MM - PDF_MARGEM_MM * 2

const CLASSES_DOCUMENTO_PERMITIDAS = /^os-documento|^craft-pdf-isolate/

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

function sanitizarElementoDocumento(el: HTMLElement): void {
  const classes = [...el.classList].filter((c) => CLASSES_DOCUMENTO_PERMITIDAS.test(c))
  el.className = classes.join(' ')

  el.style.setProperty('box-shadow', 'none', 'important')
  el.style.setProperty('backdrop-filter', 'none', 'important')
  el.style.setProperty('filter', 'none', 'important')

  if (el.classList.contains('os-documento')) {
    el.style.setProperty('background-color', '#ffffff', 'important')
    el.style.setProperty('color', '#111827', 'important')
  }
}

function sanitizarCloneDocumento(doc: Document, seletorRaiz: string): void {
  doc.documentElement.style.background = '#ffffff'
  doc.body.style.background = '#ffffff'
  doc.body.style.color = '#111827'
  doc.body.style.margin = '0'

  const root = doc.querySelector(seletorRaiz)
  if (!(root instanceof HTMLElement)) return

  const percorrer = (node: Element) => {
    if (node instanceof HTMLElement) {
      sanitizarElementoDocumento(node)
    }
    for (const filho of node.children) {
      percorrer(filho)
    }
  }

  percorrer(root)
}

export async function montarDocumentoCaptura(
  render: ReactElement,
  seletorRaiz = '.os-documento'
): Promise<{ container: HTMLDivElement; root: Root; elemento: HTMLElement }> {
  const container = document.createElement('div')
  container.className = 'craft-pdf-isolate'
  container.setAttribute('aria-hidden', 'true')
  container.style.cssText = [
    'position:fixed',
    'left:-10000px',
    'top:0',
    `width:${PDF_A4_LARGURA_PX}px`,
    'background:#ffffff',
    'color:#111827',
    'z-index:-1',
    'pointer-events:none',
    'overflow:visible',
    'font-family:Segoe UI, system-ui, sans-serif',
  ].join(';')
  document.body.appendChild(container)

  const root = createRoot(container)
  root.render(render)

  await aguardarRender()
  await document.fonts.ready

  const elemento = container.querySelector(seletorRaiz)
  if (!elemento || !(elemento instanceof HTMLElement)) {
    root.unmount()
    document.body.removeChild(container)
    throw new Error('Não foi possível montar o documento para exportação.')
  }

  await aguardarImagens(elemento)
  injetarResetCoresCaptura(container)
  forcarCoresInlineDocumento(elemento)

  return { container, root, elemento }
}

function injetarResetCoresCaptura(container: HTMLElement): void {
  const style = document.createElement('style')
  style.textContent = `
    .craft-pdf-isolate .os-documento,
    .craft-pdf-isolate .os-documento * {
      --background: #ffffff !important;
      --foreground: #111827 !important;
      --border: #e5e7eb !important;
      --muted-foreground: #374151 !important;
      --card: #ffffff !important;
      --card-foreground: #111827 !important;
      --primary: #111827 !important;
      --primary-foreground: #ffffff !important;
      box-shadow: none !important;
      backdrop-filter: none !important;
      filter: none !important;
      text-shadow: none !important;
    }
    .craft-pdf-isolate .os-documento {
      background: #ffffff !important;
      color: #111827 !important;
    }
    .craft-pdf-isolate .os-documento-meta,
    .craft-pdf-isolate .os-documento-fantasia,
    .craft-pdf-isolate .os-documento-os-sub,
    .craft-pdf-isolate .os-documento-campo strong,
    .craft-pdf-isolate .os-documento-rodape {
      color: #374151 !important;
    }
    .craft-pdf-isolate .os-documento-secao-titulo {
      color: #1f2937 !important;
      border-bottom-color: #e5e7eb !important;
    }
    .craft-pdf-isolate .os-documento-tabela th,
    .craft-pdf-isolate .os-documento-tabela td {
      border-color: #e5e7eb !important;
      color: #111827 !important;
    }
    .craft-pdf-isolate .os-documento-tabela th {
      background: #f3f4f6 !important;
    }
    .craft-pdf-isolate .os-documento-foto-legenda {
      background: #f3f4f6 !important;
      color: #374151 !important;
    }
    .craft-pdf-isolate .os-documento-logo-placeholder {
      background: #111827 !important;
      color: #ffffff !important;
    }
  `
  container.appendChild(style)
}

function forcarCoresInlineDocumento(root: HTMLElement): void {
  root.style.setProperty('background-color', '#ffffff', 'important')
  root.style.setProperty('color', '#111827', 'important')

  const todos = root.querySelectorAll('*')
  todos.forEach((node) => {
    if (!(node instanceof HTMLElement)) return

    const classes = [...node.classList].filter((c) => CLASSES_DOCUMENTO_PERMITIDAS.test(c))
    node.className = classes.join(' ')

    node.style.setProperty('box-shadow', 'none', 'important')
    node.style.setProperty('backdrop-filter', 'none', 'important')

    if (node.classList.contains('os-documento-meta') ||
        node.classList.contains('os-documento-fantasia') ||
        node.classList.contains('os-documento-os-sub') ||
        node.classList.contains('os-documento-rodape')) {
      node.style.setProperty('color', '#374151', 'important')
    } else if (node.classList.contains('os-documento-secao-titulo')) {
      node.style.setProperty('color', '#1f2937', 'important')
    } else if (node.classList.contains('os-documento-tabela') && node.tagName === 'TH') {
      node.style.setProperty('background-color', '#f3f4f6', 'important')
      node.style.setProperty('color', '#111827', 'important')
    } else if (node.classList.contains('os-documento-logo-placeholder')) {
      node.style.setProperty('background-color', '#111827', 'important')
      node.style.setProperty('color', '#ffffff', 'important')
    } else if (!node.classList.contains('os-documento-foto-legenda')) {
      node.style.setProperty('color', '#111827', 'important')
    }

    if (node.tagName === 'TH' || node.tagName === 'TD') {
      node.style.setProperty('border-color', '#e5e7eb', 'important')
    }
  })
}

export function limparCapturaDocumento(container: HTMLDivElement, root: Root): void {
  root.unmount()
  if (container.parentNode) {
    container.parentNode.removeChild(container)
  }
}

export async function capturarElementoComoCanvas(elemento: HTMLElement): Promise<HTMLCanvasElement> {
  forcarCoresInlineDocumento(elemento)

  return html2canvas(elemento, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false,
    scrollX: 0,
    scrollY: 0,
    width: elemento.scrollWidth,
    height: elemento.scrollHeight,
    windowWidth: PDF_A4_LARGURA_PX,
    onclone: (doc) => sanitizarCloneDocumento(doc, '.os-documento'),
  })
}

export function salvarCanvasComoPdfMultipagina(
  canvas: HTMLCanvasElement,
  filename: string
): void {
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  })

  const imgData = canvas.toDataURL('image/jpeg', 0.92)
  const alturaTotalMm = (canvas.height * PDF_CONTEUDO_LARGURA_MM) / canvas.width

  let offsetY = 0
  let pagina = 0

  while (offsetY < alturaTotalMm - 0.5) {
    if (pagina > 0) pdf.addPage()
    pdf.addImage(
      imgData,
      'JPEG',
      PDF_MARGEM_MM,
      PDF_MARGEM_MM - offsetY,
      PDF_CONTEUDO_LARGURA_MM,
      alturaTotalMm
    )
    offsetY += PDF_CONTEUDO_ALTURA_MM
    pagina++
  }

  pdf.save(filename)
}

export async function exportarElementoComoPdf(
  elemento: HTMLElement,
  filename: string
): Promise<void> {
  const canvas = await capturarElementoComoCanvas(elemento)
  salvarCanvasComoPdfMultipagina(canvas, filename)
}
