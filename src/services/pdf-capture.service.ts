import type { ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'

/** Largura A4 a 96dpi — conteúdo ocupa 100% da área útil do PDF */
export const PDF_A4_LARGURA_PX = 794
export const PDF_ESCALA_CAPTURA = 2.5
export const PDF_MARGEM_MM = 10
export const PDF_PAGINA_LARGURA_MM = 210
export const PDF_PAGINA_ALTURA_MM = 297
export const PDF_CONTEUDO_LARGURA_MM = PDF_PAGINA_LARGURA_MM - PDF_MARGEM_MM * 2
export const PDF_CONTEUDO_ALTURA_MM = PDF_PAGINA_ALTURA_MM - PDF_MARGEM_MM * 2

const CLASSES_DOCUMENTO_PERMITIDAS = /^os-documento|^craft-pdf-isolate|^relatorio-pdf/

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
  el.style.setProperty('overflow', 'visible', 'important')

  if (el.classList.contains('os-documento')) {
    el.style.setProperty('background-color', '#ffffff', 'important')
    el.style.setProperty('color', '#111827', 'important')
    el.style.setProperty('width', `${PDF_A4_LARGURA_PX}px`, 'important')
    el.style.setProperty('max-width', `${PDF_A4_LARGURA_PX}px`, 'important')
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
      box-shadow: none !important;
      backdrop-filter: none !important;
      filter: none !important;
      overflow: visible !important;
    }
    .craft-pdf-isolate .os-documento {
      background: #ffffff !important;
      color: #111827 !important;
      width: ${PDF_A4_LARGURA_PX}px !important;
      max-width: ${PDF_A4_LARGURA_PX}px !important;
      padding: 0 8px !important;
      font-size: 12px !important;
      line-height: 1.4 !important;
    }
    .craft-pdf-isolate .os-documento-header {
      padding-bottom: 8px !important;
      margin-bottom: 10px !important;
    }
    .craft-pdf-isolate .os-documento-secao {
      margin-bottom: 10px !important;
    }
    .craft-pdf-isolate .os-documento-compact .os-documento-secao {
      margin-bottom: 6px !important;
    }
    .craft-pdf-isolate .os-documento-meta,
    .craft-pdf-isolate .os-documento-fantasia,
    .craft-pdf-isolate .os-documento-os-sub,
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
      padding: 4px 5px !important;
      font-size: 11px !important;
    }
    .craft-pdf-isolate .os-documento-tabela th {
      background: #f3f4f6 !important;
    }
    .craft-pdf-isolate .relatorio-pdf-cards {
      display: grid !important;
      grid-template-columns: 1fr 1fr !important;
      gap: 8px !important;
    }
    .craft-pdf-isolate .relatorio-pdf-card {
      border: 1px solid #e5e7eb !important;
      border-radius: 4px !important;
      padding: 8px 10px !important;
      background: #f9fafb !important;
    }
  `
  container.appendChild(style)
}

function forcarCoresInlineDocumento(root: HTMLElement): void {
  root.style.setProperty('background-color', '#ffffff', 'important')
  root.style.setProperty('color', '#111827', 'important')
  root.style.setProperty('width', `${PDF_A4_LARGURA_PX}px`, 'important')
  root.style.setProperty('overflow', 'visible', 'important')

  const todos = root.querySelectorAll('*')
  todos.forEach((node) => {
    if (!(node instanceof HTMLElement)) return

    node.style.setProperty('box-shadow', 'none', 'important')
    node.style.setProperty('overflow', 'visible', 'important')

    if (node.tagName === 'TH' || node.tagName === 'TD') {
      node.style.setProperty('border-color', '#e5e7eb', 'important')
      node.style.setProperty('color', '#111827', 'important')
    } else if (!node.classList.contains('os-documento-foto-legenda')) {
      node.style.setProperty('color', '#111827', 'important')
    }
  })
}

export function limparCapturaDocumento(container: HTMLDivElement, root: Root): void {
  root.unmount()
  if (container.parentNode) {
    container.parentNode.removeChild(container)
  }
}

interface RectBloco {
  top: number
  bottom: number
  atomico: boolean
}

/** Mede blocos atômicos para paginação inteligente (evita cortar seções). */
function medirBlocosAtomicos(elemento: HTMLElement): RectBloco[] {
  const rootTop = elemento.getBoundingClientRect().top
  const blocos: RectBloco[] = []

  const adicionar = (el: Element | null, atomico = true) => {
    if (!(el instanceof HTMLElement)) return
    const r = el.getBoundingClientRect()
    if (r.height < 1) return
    blocos.push({
      top: r.top - rootTop,
      bottom: r.bottom - rootTop,
      atomico,
    })
  }

  adicionar(elemento.querySelector('.os-documento-header'))

  elemento.querySelectorAll('.os-documento-secao').forEach((secao) => {
    if (!(secao instanceof HTMLElement)) return

    if (
      secao.classList.contains('os-documento-secao-inteira') ||
      secao.querySelector('.os-documento-valores-total')
    ) {
      adicionar(secao, true)
      return
    }

    const tabela = secao.querySelector('table.os-documento-tabela')
    const linhas = tabela ? Array.from(tabela.querySelectorAll('tbody tr')) : []

    if (linhas.length > 8 && tabela instanceof HTMLElement) {
      const titulo = secao.querySelector('.os-documento-secao-titulo')
      adicionar(titulo, true)

      const thead = tabela.querySelector('thead')
      const theadH = thead?.getBoundingClientRect().height ?? 0
      const GRUPO = 6
      for (let i = 0; i < linhas.length; i += GRUPO) {
        const first = linhas[i]
        const last = linhas[Math.min(i + GRUPO - 1, linhas.length - 1)]
        const r1 = first.getBoundingClientRect()
        const r2 = last.getBoundingClientRect()
        blocos.push({
          top: (i === 0 && thead ? r1.top - rootTop - theadH : r1.top) - rootTop,
          bottom: r2.bottom - rootTop,
          atomico: true,
        })
      }
      return
    }

    adicionar(secao, true)
  })

  adicionar(elemento.querySelector('.os-documento-assinaturas'))
  adicionar(elemento.querySelector('.os-documento-rodape'))

  if (blocos.length === 0) {
    blocos.push({ top: 0, bottom: elemento.scrollHeight, atomico: false })
  }

  return blocos.sort((a, b) => a.top - b.top)
}

function calcularFatiasPagina(
  alturaTotalPx: number,
  blocos: RectBloco[],
  alturaPaginaPx: number
): { y: number; h: number }[] {
  const paginas: { y: number; h: number }[] = []
  let pageStart = 0
  let pageUsed = 0

  for (const bloco of blocos) {
    const blockH = bloco.bottom - bloco.top
    const relTop = Math.max(bloco.top, pageStart)
    const relH = bloco.bottom - relTop

    if (blockH > alturaPaginaPx) {
      if (pageUsed > 0) {
        paginas.push({ y: pageStart, h: pageUsed })
        pageStart = bloco.top
        pageUsed = 0
      }
      let offset = bloco.top
      while (offset < bloco.bottom - 1) {
        const sliceH = Math.min(alturaPaginaPx, bloco.bottom - offset)
        paginas.push({ y: offset, h: sliceH })
        offset += sliceH
      }
      pageStart = offset
      pageUsed = 0
      continue
    }

    if (pageUsed + relH > alturaPaginaPx && pageUsed > 0) {
      paginas.push({ y: pageStart, h: pageUsed })
      pageStart = bloco.top
      pageUsed = blockH
    } else {
      if (pageUsed === 0) pageStart = bloco.top
      pageUsed = bloco.bottom - pageStart
    }
  }

  if (pageUsed > 0) {
    paginas.push({ y: pageStart, h: Math.min(pageUsed, alturaTotalPx - pageStart) })
  }

  if (paginas.length === 0) {
    paginas.push({ y: 0, h: Math.min(alturaTotalPx, alturaPaginaPx) })
  }

  return paginas
}

function extrairSubCanvas(
  canvas: HTMLCanvasElement,
  yPx: number,
  hPx: number,
  escala: number
): HTMLCanvasElement {
  const sy = Math.round(yPx * escala)
  const sh = Math.round(hPx * escala)
  const sub = document.createElement('canvas')
  sub.width = canvas.width
  sub.height = sh
  const ctx = sub.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, sub.width, sub.height)
  ctx.drawImage(canvas, 0, sy, canvas.width, sh, 0, 0, canvas.width, sh)
  return sub
}

async function capturarDocumentoCompleto(elemento: HTMLElement): Promise<HTMLCanvasElement> {
  forcarCoresInlineDocumento(elemento)

  return html2canvas(elemento, {
    scale: PDF_ESCALA_CAPTURA,
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false,
    scrollX: 0,
    scrollY: 0,
    width: PDF_A4_LARGURA_PX,
    height: elemento.scrollHeight,
    windowWidth: PDF_A4_LARGURA_PX,
    onclone: (doc) => sanitizarCloneDocumento(doc, '.os-documento'),
  })
}

function salvarCanvasPaginas(
  canvas: HTMLCanvasElement,
  fatias: { y: number; h: number }[],
  filename: string
): void {
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  })

  const pxPorMm = canvas.width / PDF_CONTEUDO_LARGURA_MM

  fatias.forEach((fatia, idx) => {
    if (idx > 0) pdf.addPage()
    const sub = extrairSubCanvas(canvas, fatia.y, fatia.h, PDF_ESCALA_CAPTURA)
    const alturaMm = sub.height / pxPorMm
    const imgData = sub.toDataURL('image/jpeg', 0.93)
    pdf.addImage(imgData, 'JPEG', PDF_MARGEM_MM, PDF_MARGEM_MM, PDF_CONTEUDO_LARGURA_MM, alturaMm)
  })

  pdf.save(filename)
}

export async function exportarElementoComoPdf(
  elemento: HTMLElement,
  filename: string,
  opcoes?: { compacto?: boolean }
): Promise<void> {
  const blocos = medirBlocosAtomicos(elemento)
  const canvas = await capturarDocumentoCompleto(elemento)

  const alturaTotalPx = elemento.scrollHeight
  const alturaPaginaPx =
    (PDF_CONTEUDO_ALTURA_MM / PDF_CONTEUDO_LARGURA_MM) * PDF_A4_LARGURA_PX

  if (opcoes?.compacto && alturaTotalPx <= alturaPaginaPx * 1.05) {
    salvarCanvasPaginas(canvas, [{ y: 0, h: alturaTotalPx }], filename)
    return
  }

  const fatias = calcularFatiasPagina(alturaTotalPx, blocos, alturaPaginaPx)
  salvarCanvasPaginas(canvas, fatias, filename)
}

/** @deprecated Mantido para compatibilidade interna */
export async function capturarElementoComoCanvas(elemento: HTMLElement): Promise<HTMLCanvasElement> {
  return capturarDocumentoCompleto(elemento)
}

export function coletarBlocosDocumentoPdf(elemento: HTMLElement): HTMLElement[] {
  const blocos: HTMLElement[] = []
  const header = elemento.querySelector('.os-documento-header')
  if (header instanceof HTMLElement) blocos.push(header)
  elemento.querySelectorAll('.os-documento-secao').forEach((el) => {
    if (el instanceof HTMLElement) blocos.push(el)
  })
  const assinaturas = elemento.querySelector('.os-documento-assinaturas')
  if (assinaturas instanceof HTMLElement) blocos.push(assinaturas)
  const rodape = elemento.querySelector('.os-documento-rodape')
  if (rodape instanceof HTMLElement) blocos.push(rodape)
  return blocos.length > 0 ? blocos : [elemento]
}

export function salvarCanvasComoPdfMultipagina(canvas: HTMLCanvasElement, filename: string): void {
  const alturaTotalPx = canvas.height / PDF_ESCALA_CAPTURA
  const alturaPaginaPx =
    (PDF_CONTEUDO_ALTURA_MM / PDF_CONTEUDO_LARGURA_MM) * PDF_A4_LARGURA_PX
  const fatias: { y: number; h: number }[] = []
  let y = 0
  while (y < alturaTotalPx - 0.5) {
    const h = Math.min(alturaPaginaPx, alturaTotalPx - y)
    fatias.push({ y, h })
    y += h
  }
  salvarCanvasPaginas(canvas, fatias, filename)
}

export async function salvarBlocosComoPdfAsync(
  blocos: HTMLElement[],
  filename: string
): Promise<void> {
  if (blocos.length === 0) return
  const root = blocos[0].closest('.os-documento')
  if (root instanceof HTMLElement) {
    await exportarElementoComoPdf(root, filename)
    return
  }
  await exportarElementoComoPdf(blocos[0], filename)
}
