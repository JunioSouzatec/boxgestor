export type OrigemSyncComunicacao = 'supabase' | 'local' | 'merge'

export interface LogSyncComunicacaoInfo {
  supabase?: number
  local?: number
  aposMerge?: number
  origem: OrigemSyncComunicacao
  updatedAtExemplo?: string
}

export interface LogSyncConfigInfo {
  origem: 'supabase' | 'local' | 'merge' | 'cache'
  updatedAtRemoto?: string
  updatedAtLocal?: string
  temLogo?: boolean
  temAparencia?: boolean
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
    updatedAtExemplo: info.updatedAtExemplo,
  })
}

export function logSyncConfigDev(info: LogSyncConfigInfo): void {
  if (!import.meta.env.DEV) return
  console.info('[Craft Comunicação sync:config]', {
    origem: info.origem,
    updatedAtRemoto: info.updatedAtRemoto,
    updatedAtLocal: info.updatedAtLocal,
    temLogo: info.temLogo,
    temAparencia: info.temAparencia,
  })
}
