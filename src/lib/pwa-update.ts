import { registerSW } from 'virtual:pwa-register'

export {
  deveExibirAvisoNovaVersao,
  limparVersaoAtualizacaoSolicitada,
  marcarVersaoAtualizacaoSolicitada,
  obterVersaoAtualizacaoSolicitada,
} from '@/lib/pwa-update-estado'

const APP_SW_CACHE_VERSION = 'boxgestor-rc1-sync-v3'
const ESPERA_CONTROLLER_MS = 4_000

let atualizarPwa: ((reloadPage?: boolean) => Promise<void>) | undefined
let recarregamentoEmAndamento = false

export function iniciarRegistroPwa(): void {
  atualizarPwa = registerSW({
    immediate: true,
    onNeedRefresh() {
      window.dispatchEvent(
        new CustomEvent('craft:pwa-update', { detail: { version: APP_SW_CACHE_VERSION } })
      )
    },
    onOfflineReady() {
      console.info('[Craft PWA] App pronto para uso offline.', APP_SW_CACHE_VERSION)
    },
  })
}

async function obterServiceWorkerWaiting(): Promise<ServiceWorker | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null
  try {
    const registro = await navigator.serviceWorker.getRegistration()
    if (!registro) return null
    if (registro.waiting) return registro.waiting
    try {
      await registro.update()
    } catch {
      /* offline / update indisponível */
    }
    return registro.waiting ?? null
  } catch {
    return null
  }
}

function esperarControllerChange(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      resolve(false)
      return
    }

    let concluido = false
    const finalizar = (ok: boolean) => {
      if (concluido) return
      concluido = true
      navigator.serviceWorker.removeEventListener('controllerchange', aoMudar)
      resolve(ok)
    }

    const aoMudar = () => finalizar(true)
    navigator.serviceWorker.addEventListener('controllerchange', aoMudar)

    window.setTimeout(() => finalizar(false), ESPERA_CONTROLLER_MS)
  })
}

function recarregarPaginaUmaVez(): void {
  if (typeof window === 'undefined') return
  window.location.reload()
}

/**
 * Ativa o worker waiting e recarrega só depois da troca de controlador,
 * ou no fallback explícito. Sem timer automático e sem loop.
 */
export function recarregarPwaComNovaVersao(): void {
  if (recarregamentoEmAndamento) return
  recarregamentoEmAndamento = true
  void ativarNovaVersaoPwa()
}

async function ativarNovaVersaoPwa(): Promise<void> {
  const waiting = await obterServiceWorkerWaiting()

  if (waiting) {
    const troca = esperarControllerChange()
    waiting.postMessage({ type: 'SKIP_WAITING' })
    await troca
    recarregarPaginaUmaVez()
    return
  }

  if (atualizarPwa) {
    await atualizarPwa(true)
    return
  }

  recarregarPaginaUmaVez()
}

export function obterVersaoCachePwa(): string {
  return APP_SW_CACHE_VERSION
}
