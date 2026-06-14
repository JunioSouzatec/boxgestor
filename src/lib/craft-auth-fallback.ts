/** Fallback runtime para voltar ao modo local sem alterar .env imediatamente */
export const CRAFT_FALLBACK_LOCAL_KEY = 'craft_force_local_v1'

export function isFallbackLocalAtivo(): boolean {
  try {
    return localStorage.getItem(CRAFT_FALLBACK_LOCAL_KEY) === 'true'
  } catch {
    return false
  }
}

export function ativarFallbackLocalStorage(): void {
  localStorage.setItem(CRAFT_FALLBACK_LOCAL_KEY, 'true')
}

export function limparFallbackLocalStorage(): void {
  localStorage.removeItem(CRAFT_FALLBACK_LOCAL_KEY)
}
