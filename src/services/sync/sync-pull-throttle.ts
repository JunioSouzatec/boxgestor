export const DEBOUNCE_REALTIME_MS = 2500
export const MIN_INTERVALO_PULL_MS = 12_000
export const THROTTLE_FOCUS_MS = 60_000

export function intervaloMinimoParaMotivo(motivo: string): number {
  if (motivo === 'visibility' || motivo === 'interval') return THROTTLE_FOCUS_MS
  // Realtime já tem debounce. O mínimo de 12s descartava UPDATE
  // logo após um INSERT/pull recente — a Agenda não rerenderizava sem F5.
  if (motivo === 'realtime') return 0
  return MIN_INTERVALO_PULL_MS
}

export function deveExecutarPullAgora(
  motivo: string,
  ultimoPullEm: number,
  agora: number,
  forcar: boolean
): boolean {
  if (forcar) return true
  const minMs = intervaloMinimoParaMotivo(motivo)
  if (minMs <= 0) return true
  return agora - ultimoPullEm >= minMs
}
