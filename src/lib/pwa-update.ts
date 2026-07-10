import { registerSW } from 'virtual:pwa-register'

let atualizarPwa: ((reloadPage?: boolean) => Promise<void>) | undefined
let atualizacaoPwaPendente = false

export function iniciarRegistroPwa(): void {
  atualizarPwa = registerSW({
    immediate: true,
    onNeedRefresh() {
      atualizacaoPwaPendente = true
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

/** Aplica SW novo ao voltar ao app — evita bundle/PWA desatualizado no RC1. */
export function aplicarAtualizacaoPwaSePendente(): void {
  if (!atualizacaoPwaPendente) return
  atualizacaoPwaPendente = false
  void atualizarPwa?.(true)
}
