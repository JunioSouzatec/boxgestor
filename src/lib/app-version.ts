/** Versão e build injetados em vite.config.ts */
export const APP_VERSION = import.meta.env.VITE_APP_VERSION ?? '0.0.0'

declare const __APP_BUILD_TIME__: string

export const APP_BUILD_TIME =
  typeof __APP_BUILD_TIME__ !== 'undefined' ? __APP_BUILD_TIME__ : ''

export function formatarVersaoApp(): string {
  if (!APP_BUILD_TIME) return `v${APP_VERSION}`
  const data = new Date(APP_BUILD_TIME)
  if (Number.isNaN(data.getTime())) return `v${APP_VERSION}`
  const dataFmt = data.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  return `v${APP_VERSION} · ${dataFmt}`
}
