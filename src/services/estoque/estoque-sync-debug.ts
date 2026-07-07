export type OrigemSyncEstoque = 'supabase' | 'local' | 'merge'

export interface LogSyncEstoqueInfo {
  supabase?: number
  local?: number
  aposMerge?: number
  origem: OrigemSyncEstoque
  updatedAtExemplo?: string
}

export function logSyncEstoqueDev(
  entidade: 'pecas' | 'fornecedores' | 'movimentacoes',
  info: LogSyncEstoqueInfo
): void {
  if (!import.meta.env.DEV) return
  console.info(`[Craft Estoque sync:${entidade}]`, {
    carregadosSupabase: info.supabase ?? 0,
    carregadosLocalStorage: info.local ?? 0,
    aposMerge: info.aposMerge ?? 0,
    origemUsada: info.origem,
    updatedAtExemplo: info.updatedAtExemplo,
  })
}
