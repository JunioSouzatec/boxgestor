import { registerSW } from 'virtual:pwa-register'

const APP_SW_CACHE_VERSION = 'boxgestor-rc1-sync-v3'

let atualizarPwa: ((reloadPage?: boolean) => Promise<void>) | undefined

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

/** Atualiza e recarrega somente após ação explícita do usuário. */
export function recarregarPwaComNovaVersao(): void {
  void atualizarPwa?.(true)
}

export function obterVersaoCachePwa(): string {
  return APP_SW_CACHE_VERSION
}
