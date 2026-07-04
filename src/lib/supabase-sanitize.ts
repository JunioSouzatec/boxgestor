/** Converte valor para DATE do Postgres (YYYY-MM-DD) ou null */
export function sanitizarDataSupabase(valor?: string | null): string | null {
  if (!valor?.trim()) return null
  const limpo = valor.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(limpo)) return limpo
  if (limpo.includes('T')) return limpo.slice(0, 10)
  return null
}

/** Garante número finito para colunas NUMERIC/INTEGER */
export function sanitizarNumeroSupabase(valor: unknown, fallback = 0): number {
  const n = Number(valor)
  return Number.isFinite(n) ? n : fallback
}

/** Enum/texto opcional — null em vez de string vazia */
export function sanitizarTextoOpcionalSupabase(valor?: string | null): string | null {
  const t = valor?.trim()
  return t ? t : null
}

/** Texto NOT NULL — string vazia permitida */
export function sanitizarTextoObrigatorioSupabase(valor?: string | null, fallback = ''): string {
  return valor?.trim() ?? fallback
}

/** Valores aceitos pelo enum public.status_orcamento (inclui reprovado legado no banco). */
const STATUS_ORCAMENTO_SUPABASE = new Set([
  'rascunho',
  'enviado',
  'aguardando_aprovacao',
  'aprovado',
  'recusado',
  'convertido',
  'reprovado',
])

/** Enum status_orcamento — null se inválido ou vazio; persiste o status real. */
export function sanitizarStatusOrcamentoSupabase(valor?: string | null): string | null {
  const t = valor?.trim()
  if (!t || !STATUS_ORCAMENTO_SUPABASE.has(t)) return null
  return t
}
