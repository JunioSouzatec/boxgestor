export interface SyncErro {
  entidade: string
  id?: string
  mensagem: string
}

export interface ContagemSyncEnviados {
  office: number
  settings: number
  customers: number
  motorcycles: number
  service_orders: number
  total: number
}

export interface ResultadoSincronizacaoSupabase {
  ok: boolean
  mensagem: string
  inicioEm: string
  fimEm: string
  enviados: ContagemSyncEnviados
  erros: SyncErro[]
}
