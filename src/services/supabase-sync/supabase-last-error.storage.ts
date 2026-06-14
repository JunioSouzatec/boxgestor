const STORAGE_KEY = 'craft_ultimo_erro_supabase'

export interface PayloadErroServiceOrder {
  office_id?: string
  customer_id?: string
  motorcycle_id?: string
  os_local_id?: string
  os_numero?: number
  current_office_id?: string | null
}

export interface UltimoErroSupabase {
  mensagem: string
  entidade?: string
  codigo?: string
  em: string
  /** Detalhes quando o erro envolve service_orders */
  service_order?: PayloadErroServiceOrder
  erro_tecnico?: string
}

export function registrarUltimoErroSupabase(erro: Omit<UltimoErroSupabase, 'em'>): void {
  try {
    const payload: UltimoErroSupabase = { ...erro, em: new Date().toISOString() }
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    /* ignore */
  }
}

export function obterUltimoErroSupabase(): UltimoErroSupabase | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as UltimoErroSupabase
  } catch {
    return null
  }
}

export function limparUltimoErroSupabase(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
