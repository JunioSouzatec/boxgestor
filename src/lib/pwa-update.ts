import { registerSW } from 'virtual:pwa-register'

const APP_SW_CACHE_VERSION = 'boxgestor-rc1-sync-v3'

let atualizarPwa: ((reloadPage?: boolean) => Promise<void>) | undefined
let atualizacaoPwaPendente = false
let autoApplyTimer: ReturnType<typeof setTimeout> | undefined

export function iniciarRegistroPwa(): void {
  atualizarPwa = registerSW({
    immediate: true,
    onNeedRefresh() {
      atualizacaoPwaPendente = true
      window.dispatchEvent(
        new CustomEvent('craft:pwa-update', { detail: { version: APP_SW_CACHE_VERSION } })
      )
      // Não exige limpar cache: aplica automaticamente em alguns segundos se o usuário não interagir
      clearTimeout(autoApplyTimer)
      autoApplyTimer = setTimeout(() => {
        if (atualizacaoPwaPendente) {
          aplicarAtualizacaoPwaSePendente()
        }
      }, 12_000)
    },
    onOfflineReady() {
      console.info('[Craft PWA] App pronto para uso offline.', APP_SW_CACHE_VERSION)
    },
  })

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        aplicarAtualizacaoPwaSePendente()
      }
    })
  }
}

export function recarregarPwaComNovaVersao(): void {
  atualizacaoPwaPendente = false
  clearTimeout(autoApplyTimer)
  void atualizarPwa?.(true)
}

/** Aplica SW novo ao voltar ao app — evita bundle/PWA desatualizado no RC1. */
export function aplicarAtualizacaoPwaSePendente(): void {
  if (!atualizacaoPwaPendente) return
  atualizacaoPwaPendente = false
  clearTimeout(autoApplyTimer)
  void atualizarPwa?.(true)
}

export function obterVersaoCachePwa(): string {
  return APP_SW_CACHE_VERSION
}
