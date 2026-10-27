/**
 * Detecção de plataforma — sem dependências externas.
 *
 * Objetivo: distinguir dispositivo móvel REAL (celular/tablet) de desktop,
 * inclusive notebook com tela sensível ao toque (que NÃO deve ser mobile).
 */

/**
 * true em celular/tablet real.
 *
 * Regras:
 * - Android / iPhone / iPod no user-agent → mobile.
 * - iPadOS 13+ se apresenta como "Macintosh"; só é tratado como mobile
 *   quando há múltiplos pontos de toque (iPad real), evitando Mac desktop.
 * - iPad antigo (UA explícito) ou token genérico "Mobile" → mobile.
 * - Notebook touchscreen (Windows/Mac sem UA mobile) → desktop.
 */
export function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false

  const ua = navigator.userAgent || ''

  if (/Android|iPhone|iPod/i.test(ua)) return true

  // iPadOS 13+ finge ser Mac; confirma por toque múltiplo.
  const maxTouch =
    typeof navigator.maxTouchPoints === 'number' ? navigator.maxTouchPoints : 0
  if (/Macintosh/i.test(ua) && maxTouch > 1) return true

  // iPad antigo ou user-agent móvel genérico.
  if (/iPad|Mobile/i.test(ua)) return true

  return false
}
