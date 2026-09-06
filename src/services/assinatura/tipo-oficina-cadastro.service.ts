/**
 * Grava tipo_oficina no cadastro (settings.metadata).
 * Sem migration: owner atualiza a própria settings via RLS.
 * Não substitui o fluxo Admin Sistema de alteração posterior.
 */
import { getSupabaseClient } from '@/lib/supabase'
import { TIPOS_OFICINA, type TipoOficina } from '@/types/tipo-oficina'

const ERRO_CONFIGURACAO_OFICINA =
  'Não foi possível concluir a configuração da oficina. Tente novamente.'

function exigirTipoOficinaCadastro(tipo: unknown): TipoOficina {
  if (TIPOS_OFICINA.includes(tipo as TipoOficina)) return tipo as TipoOficina
  throw new Error(ERRO_CONFIGURACAO_OFICINA)
}

export async function gravarTipoOficinaNoCadastro(
  officeId: string,
  tipo: TipoOficina | string | undefined
): Promise<void> {
  const tipoValido = exigirTipoOficinaCadastro(tipo)
  const supabase = getSupabaseClient()
  if (!supabase || !officeId.trim()) {
    throw new Error(ERRO_CONFIGURACAO_OFICINA)
  }

  const { data: settings, error: loadError } = await supabase
    .from('settings')
    .select('metadata')
    .eq('office_id', officeId)
    .maybeSingle()

  if (loadError || !settings) {
    throw new Error(ERRO_CONFIGURACAO_OFICINA)
  }

  const metadata = {
    ...(((settings as { metadata?: Record<string, unknown> }).metadata ?? {}) as Record<
      string,
      unknown
    >),
    tipo_oficina: tipoValido,
    tipo_oficina_origem: 'cadastro',
    tipo_oficina_atualizado_em: new Date().toISOString(),
  }

  const { data: settingsAtualizado, error: updateError } = await supabase
    .from('settings')
    .update({ metadata, updated_at: new Date().toISOString() } as never)
    .eq('office_id', officeId)
    .select('metadata')
    .maybeSingle()

  const tipoPersistido = (
    settingsAtualizado as { metadata?: Record<string, unknown> } | null
  )?.metadata?.tipo_oficina

  if (updateError || !settingsAtualizado || tipoPersistido !== tipoValido) {
    throw new Error(ERRO_CONFIGURACAO_OFICINA)
  }
}
