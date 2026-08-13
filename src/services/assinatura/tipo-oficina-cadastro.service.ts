/**
 * Grava tipo_oficina no cadastro (settings.metadata).
 * Sem migration: owner atualiza a própria settings via RLS.
 * Não substitui o fluxo Admin Sistema de alteração posterior.
 */
import { getSupabaseClient } from '@/lib/supabase'
import { normalizarTipoOficina, type TipoOficina } from '@/types/tipo-oficina'

export async function gravarTipoOficinaNoCadastro(
  officeId: string,
  tipo: TipoOficina | string | undefined
): Promise<void> {
  const tipoNormalizado = normalizarTipoOficina(tipo)
  const supabase = getSupabaseClient()
  if (!supabase || !officeId.trim()) return

  try {
    const { data } = await supabase
      .from('settings')
      .select('metadata')
      .eq('office_id', officeId)
      .maybeSingle()

    const metadata = {
      ...(((data as { metadata?: Record<string, unknown> } | null)?.metadata ??
        {}) as Record<string, unknown>),
      tipo_oficina: tipoNormalizado,
      tipo_oficina_origem: 'cadastro',
      tipo_oficina_atualizado_em: new Date().toISOString(),
    }

    await supabase
      .from('settings')
      .update({ metadata, updated_at: new Date().toISOString() } as never)
      .eq('office_id', officeId)
  } catch (err) {
    console.warn('[BoxGestor] Não foi possível gravar tipo_oficina no cadastro remoto', err)
  }
}
