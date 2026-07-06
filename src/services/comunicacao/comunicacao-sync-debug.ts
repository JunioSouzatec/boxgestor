export type OrigemSyncComunicacao = 'supabase' | 'local' | 'merge'

export interface LogSyncComunicacaoInfo {
  supabase?: number
  local?: number
  aposMerge?: number
  origem: OrigemSyncComunicacao
}

export function logSyncComunicacaoDev(
  entidade: 'alertas' | 'historico',
  info: LogSyncComunicacaoInfo
): void {
  if (!import.meta.env.DEV) return
  console.info(`[Craft Comunicação sync:${entidade}]`, {
    carregadosSupabase: info.supabase ?? 0,
    carregadosLocalStorage: info.local ?? 0,
    aposMerge: info.aposMerge ?? 0,
    origemUsada: info.origem,
  })
}
