/** Variáveis de ambiente Supabase — sem dependências circulares */

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl?.trim() && supabaseAnonKey?.trim())
}
