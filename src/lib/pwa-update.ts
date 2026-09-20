import { registerSW } from 'virtual:pwa-register'
import {
  marcarVersaoAtualizacaoSolicitada,
} from '@/lib/pwa-update-estado'

export {
  consumirConfirmacaoAtualizacao,
  deveExibirAvisoNovaVersao,
  deveExibirConfirmacaoAtualizacao,
  limparVersaoAtualizacaoSolicitada,
  marcarVersaoAtualizacaoSolicitada,
  mensagemBoxGestorAtualizado,
  obterVersaoAtualizacaoSolicitada,
  versaoAppCurta,
} from '@/lib/pwa-update-estado'

const APP_SW_CACHE_VERSION = 'boxgestor-rc1-sync-v3'
const ESPERA_CONTROLLER_MS = 4_000
const ESPERA_WAITING_MS = 8_000
const POLL_WAITING_MS = 250
/** Intervalo moderado de descoberta enquanto o app está aberto e visível. */
const INTERVALO_VERIFICACAO_MS = 10 * 60 * 1000

let atualizarPwa: ((reloadPage?: boolean) => Promise<void>) | undefined
let recarregamentoEmAndamento = false
let registroPwaIniciado = false
let updateEmAndamento: Promise<void> | null = null
/**
 * Instância do ServiceWorker waiting já anunciada nesta sessão.
 * Referência de objeto — NÃO scriptURL (B e C costumam ser /sw.js).
 */
let ultimoWaitingAnunciado: ServiceWorker | null = null

/**
 * Dispara o toast inferior via craft:pwa-update.
 * Mesmo objeto waiting → no máximo um anúncio (respeita "Depois").
 * Nova instância waiting → pode anunciar de novo, mesmo com scriptURL idêntico.
 */
function avisarNovaVersaoDisponivel(waiting?: ServiceWorker | null): boolean {
  if (!waiting) return false
  if (waiting === ultimoWaitingAnunciado) return false
  ultimoWaitingAnunciado = waiting
  window.dispatchEvent(
    new CustomEvent('craft:pwa-update', { detail: { version: APP_SW_CACHE_VERSION } })
  )
  return true
}

/**
 * Descoberta de nova build: registration.update() sem skipWaiting e sem reload.
 * onNeedRefresh / waiting existente cuidam do toast.
 */
export async function verificarAtualizacaoPwa(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  if (navigator.onLine === false) return

  if (updateEmAndamento) return updateEmAndamento

  updateEmAndamento = (async () => {
    try {
      const registro = await navigator.serviceWorker.getRegistration()
      if (!registro) return

      if (registro.waiting) {
        avisarNovaVersaoDisponivel(registro.waiting)
      }

      try {
        await registro.update()
      } catch {
        /* offline / update indisponível */
      }

      if (registro.waiting) {
        avisarNovaVersaoDisponivel(registro.waiting)
      }
    } finally {
      updateEmAndamento = null
    }
  })()

  return updateEmAndamento
}

function onVisibilityChange(): void {
  if (document.visibilityState === 'visible') {
    void verificarAtualizacaoPwa()
  }
}

function onWindowFocus(): void {
  void verificarAtualizacaoPwa()
}

function onOnline(): void {
  void verificarAtualizacaoPwa()
}

function onIntervaloVerificacao(): void {
  if (document.visibilityState !== 'visible') return
  if (navigator.onLine === false) return
  void verificarAtualizacaoPwa()
}

function instalarListenersDescoberta(): void {
  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('focus', onWindowFocus)
  window.addEventListener('online', onOnline)
  window.setInterval(onIntervaloVerificacao, INTERVALO_VERIFICACAO_MS)
}

export function iniciarRegistroPwa(): void {
  if (!atualizarPwa) {
    atualizarPwa = registerSW({
      immediate: true,
      onNeedRefresh() {
        void navigator.serviceWorker.getRegistration().then((registro) => {
          avisarNovaVersaoDisponivel(registro?.waiting ?? null)
        })
      },
      onOfflineReady() {
        console.info('[Craft PWA] App pronto para uso offline.', APP_SW_CACHE_VERSION)
      },
    })
  }

  if (registroPwaIniciado) return
  registroPwaIniciado = true

  instalarListenersDescoberta()
  void verificarAtualizacaoPwa()
}

async function buscarVersaoRemota(): Promise<string | null> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return null
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) return null
    const data = (await res.json()) as { version?: string }
    const remota = typeof data.version === 'string' ? data.version.trim() : ''
    return remota || null
  } catch {
    return null
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

async function obterOuAguardarWaiting(): Promise<ServiceWorker | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null

  let registro: ServiceWorkerRegistration | undefined
  try {
    registro = await navigator.serviceWorker.getRegistration()
  } catch {
    return null
  }
  if (!registro) return null

  const waitingAtual = (): ServiceWorker | null => registro?.waiting ?? null
  if (waitingAtual()) return waitingAtual()

  try {
    await registro.update()
  } catch {
    /* offline / update indisponível */
  }
  if (waitingAtual()) return waitingAtual()

  if (atualizarPwa) {
    try {
      await atualizarPwa(false)
    } catch {
      /* skipWaiting sem reload — waiting pode ainda não existir */
    }
  }
  if (waitingAtual()) return waitingAtual()

  const installing = registro.installing
  if (installing) {
    await new Promise<void>((resolve) => {
      if (installing.state === 'installed' || installing.state === 'activated') {
        resolve()
        return
      }
      const finalizar = () => {
        installing.removeEventListener('statechange', onState)
        resolve()
      }
      const onState = () => {
        if (
          installing.state === 'installed' ||
          installing.state === 'activated' ||
          installing.state === 'redundant'
        ) {
          finalizar()
        }
      }
      installing.addEventListener('statechange', onState)
      window.setTimeout(finalizar, ESPERA_WAITING_MS)
    })
    if (waitingAtual()) return waitingAtual()
  }

  const inicio = Date.now()
  while (Date.now() - inicio < ESPERA_WAITING_MS) {
    await sleep(POLL_WAITING_MS)
    try {
      await registro.update()
    } catch {
      /* ignore */
    }
    if (waitingAtual()) return waitingAtual()
  }
  return waitingAtual()
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

async function ativarNovaVersaoPwa(versaoRemota?: string | null): Promise<void> {
  const remota = versaoRemota?.trim() || (await buscarVersaoRemota())
  if (remota) marcarVersaoAtualizacaoSolicitada(remota)

  const waiting = await obterOuAguardarWaiting()
  if (waiting) {
    const troca = esperarControllerChange()
    waiting.postMessage({ type: 'SKIP_WAITING' })
    await troca
    recarregarPaginaUmaVez()
    return
  }

  recarregarPaginaUmaVez()
}

/**
 * Rotina única de atualização (toast inferior).
 * SKIP_WAITING se houver waiting, espera controllerchange e recarrega uma vez.
 */
export function solicitarAtualizacaoApp(versaoRemota?: string | null): Promise<void> {
  if (recarregamentoEmAndamento) return Promise.resolve()
  recarregamentoEmAndamento = true
  return ativarNovaVersaoPwa(versaoRemota).catch(() => {
    recarregamentoEmAndamento = false
  })
}

/** Alias estável — mesmo fluxo de solicitarAtualizacaoApp. */
export function recarregarPwaComNovaVersao(versaoRemota?: string | null): void {
  void solicitarAtualizacaoApp(versaoRemota)
}

export function obterVersaoCachePwa(): string {
  return APP_SW_CACHE_VERSION
}
