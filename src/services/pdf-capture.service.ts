import type { ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'

export const PDF_A4_LARGURA_PX = 794
export const PDF_ESCALA_CAPTURA = 2.5
export const PDF_MARGEM_MM = 12
export const PDF_PAGINA_LARGURA_MM = 210
export const PDF_PAGINA_ALTURA_MM = 297
export const PDF_CONTEUDO_LARGURA_MM = PDF_PAGINA_LARGURA_MM - PDF_MARGEM_MM * 2
export const PDF_CONTEUDO_ALTURA_MM = PDF_PAGINA_ALTURA_MM - PDF_MARGEM_MM * 2

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

function aplicarEstilosCaptura(doc: Document): void {
  doc.documentElement.style.background = '#ffffff'
  doc.body.style.background = '#ffffff'
  doc.body.style.color = '#111827'
  doc.body.style.margin = '0'
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
    'left:0',
    'top:0',
    `width:${PDF_A4_LARGURA_PX}px`,
    'background:#ffffff',
    'color:#111827',
    'z-index:-9999',
    'opacity:0',
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

  return { container, root, elemento }
}

export function limparCapturaDocumento(container: HTMLDivElement, root: Root): void {
  root.unmount()
  if (container.parentNode) {
    container.parentNode.removeChild(container)
  }
}

interface BlocoPagina {
  top: number
  bottom: number
  inteiro: boolean
}

/** Coleta blocos para quebra de página respeitando data-pdf-bloco e data-pdf-inteira. */
function coletarBlocosPagina(elemento: HTMLElement): BlocoPagina[] {
  const rootTop = elemento.getBoundingClientRect().top
  const blocos: BlocoPagina[] = []

  const registrar = (el: Element | null) => {
    if (!(el instanceof HTMLElement)) return
    const r = el.getBoundingClientRect()
    if (r.height < 0.5) return
    blocos.push({
      top: r.top - rootTop,
      bottom: r.bottom - rootTop,
      inteiro: el.dataset.pdfInteira === '1',
    })
  }

  elemento.querySelectorAll('[data-pdf-bloco]').forEach((el) => registrar(el))

  if (blocos.length === 0) {
    blocos.push({ top: 0, bottom: elemento.scrollHeight, inteiro: false })
  }

  return blocos.sort((a, b) => a.top - b.top)
}

/**
 * Calcula fatias contínuas do documento em altura máxima de uma página A4.
 * Quebra apenas antes de blocos marcados como inteiros (valores, checklist, assinaturas).
 */
function calcularFatiasPagina(
  alturaTotalPx: number,
  blocos: BlocoPagina[],
  alturaPaginaPx: number
): { y: number; h: number }[] {
  if (alturaTotalPx <= alturaPaginaPx + 0.5) {
    return [{ y: 0, h: alturaTotalPx }]
  }

  const quebrasObrigatorias = new Set<number>([0, alturaTotalPx])
  let inicioPaginaVirtual = 0

  for (const bloco of blocos) {
    if (!bloco.inteiro) continue

    const alturaBloco = bloco.bottom - bloco.top
    if (alturaBloco <= 0.5 || alturaBloco > alturaPaginaPx) continue

    const conteudoAntes = bloco.top - inicioPaginaVirtual
    const espacoRestante = alturaPaginaPx - conteudoAntes

    if (conteudoAntes > 0 && espacoRestante < alturaBloco - 1) {
      quebrasObrigatorias.add(bloco.top)
      inicioPaginaVirtual = bloco.top
    }
  }

  const quebras = [...quebrasObrigatorias].sort((a, b) => a - b)
  const fatias: { y: number; h: number }[] = []

  for (let i = 0; i < quebras.length - 1; i++) {
    let y = quebras[i]
    const fimSegmento = quebras[i + 1]
    while (y < fimSegmento - 0.5) {
      const h = Math.min(alturaPaginaPx, fimSegmento - y)
      fatias.push({ y, h })
      y += h
    }
  }

  if (!fatias.length) {
    let y = 0
    while (y < alturaTotalPx - 0.5) {
      const h = Math.min(alturaPaginaPx, alturaTotalPx - y)
      fatias.push({ y, h })
      y += h
    }
  }

  return fatias
}

function extrairSubCanvas(
  canvas: HTMLCanvasElement,
  yPx: number,
  hPx: number,
  escala: number
): HTMLCanvasElement {
  const sy = Math.max(0, Math.round(yPx * escala))
  const sh = Math.min(Math.round(hPx * escala), canvas.height - sy)
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
    onclone: (doc) => aplicarEstilosCaptura(doc),
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
    const imgData = sub.toDataURL('image/jpeg', 0.94)
    pdf.addImage(imgData, 'JPEG', PDF_MARGEM_MM, PDF_MARGEM_MM, PDF_CONTEUDO_LARGURA_MM, alturaMm)
  })

  pdf.save(filename)
}

export async function exportarElementoComoPdf(
  elemento: HTMLElement,
  filename: string,
  opcoes?: { compacto?: boolean }
): Promise<void> {
  const alturaTotalPx = elemento.scrollHeight
  const alturaPaginaPx =
    (PDF_CONTEUDO_ALTURA_MM / PDF_CONTEUDO_LARGURA_MM) * PDF_A4_LARGURA_PX

  const blocos = coletarBlocosPagina(elemento)
  const canvas = await capturarDocumentoCompleto(elemento)

  if (opcoes?.compacto && alturaTotalPx <= alturaPaginaPx * 1.02) {
    salvarCanvasPaginas(canvas, [{ y: 0, h: alturaTotalPx }], filename)
    return
  }

  const fatias = calcularFatiasPagina(alturaTotalPx, blocos, alturaPaginaPx)
  salvarCanvasPaginas(canvas, fatias, filename)
}

export async function capturarElementoComoCanvas(elemento: HTMLElement): Promise<HTMLCanvasElement> {
  return capturarDocumentoCompleto(elemento)
}

export function coletarBlocosDocumentoPdf(elemento: HTMLElement): HTMLElement[] {
  return Array.from(elemento.querySelectorAll('[data-pdf-bloco]')).filter(
    (el): el is HTMLElement => el instanceof HTMLElement
  )
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
  const root = blocos[0]?.closest('.os-documento')
  if (root instanceof HTMLElement) {
    await exportarElementoComoPdf(root, filename)
    return
  }
  if (blocos[0]) await exportarElementoComoPdf(blocos[0], filename)
}
