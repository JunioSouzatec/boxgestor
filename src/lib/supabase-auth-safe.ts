/**
 * Reexportações das funções seguras de teste Supabase Auth.
 * Use estas funções para inspecionar auth/profile/office sem alterar o modo local do app.
 */
export {
  getAuthMode,
  verificarEnvSupabase,
  getCurrentSupabaseSession,
  getCurrentSupabaseUser,
  getCurrentProfile,
  getCurrentOffice,
  carregarEstadoSupabaseAuth,
  testarConexaoSupabaseAuth,
  criarContaTesteSupabase,
  entrarContaTesteSupabase,
  sairContaSupabase,
  ensureProfileForUser,
  ensureOfficeForUser,
  verificarPerfilSupabase,
  verificarOficinaSupabase,
  type SupabaseAuthEstado,
  type SupabaseEnvStatus,
  type SituacaoSupabaseAuth,
  type CriarOficinaSupabaseInput,
  type ContaTesteSupabaseInput,
  type ResultadoOperacaoAuth,
  type OfficeRow,
} from '@/services/auth/supabase-auth-safe.service'
