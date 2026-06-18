import { registerSW } from 'virtual:pwa-register'

let atualizarPwa: ((reloadPage?: boolean) => Promise<void>) | undefined

export function iniciarRegistroPwa(): void {
  atualizarPwa = registerSW({
    immediate: true,
    onNeedRefresh() {
      window.dispatchEvent(new CustomEvent('craft:pwa-update'))
    },
    onOfflineReady() {
      console.info('[Craft PWA] App pronto para uso offline.')
    },
  })
}

export function recarregarPwaComNovaVersao(): void {
  void atualizarPwa?.(true)
}
