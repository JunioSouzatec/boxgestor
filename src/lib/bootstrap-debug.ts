/**
 * Logs temporários de diagnóstico do fluxo pós-login (dev only).
 * Remover quando o bootstrap estiver estável em produção.
 */
export function logBootstrap(
  evento: string,
  payload: Record<string, unknown>
): void {
  if (!import.meta.env.DEV) return
  console.info(`[BoxGestor Bootstrap] ${evento}`, payload)
}

export function logBootstrapReset(
  motivo: string,
  payload: Record<string, unknown>
): void {
  if (!import.meta.env.DEV) return
  console.warn(`[BoxGestor Bootstrap] RESET — ${motivo}`, payload)
}
