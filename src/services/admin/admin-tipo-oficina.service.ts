import { getSupabaseClient } from '@/lib/supabase'
import { ehAdminSistema } from '@/lib/craft-admin'
import {
  ADMIN_GET_OFFICE_DETAILS_TIMEOUT_MS,
  executarComTimeoutAdmin,
  logErroAdmin,
} from '@/lib/admin-env'
import type { SettingsRow } from '@/services/supabase-sync/reverse-mappers'
import { normalizarTipoOficina, type TipoOficina } from '@/types/tipo-oficina'
import type { AuthUser } from '@/types/auth'

export interface ResultadoAtualizarTipoOficina {
  ok: boolean
  mensagem: string
  tipo_oficina?: TipoOficina
}

/**
 * Atualiza tipo_oficina em settings.metadata — somente Admin Sistema.
 * Respeita office_id (UUID Supabase).
 */
export async function atualizarTipoOficinaAdmin(
  officeUuid: string,
  tipo: TipoOficina,
  usuario: AuthUser | null | undefined
): Promise<ResultadoAtualizarTipoOficina> {
  if (!ehAdminSistema(usuario)) {
    return { ok: false, mensagem: 'Somente o Administrador do Sistema pode alterar o tipo da oficina.' }
  }

  const supabase = getSupabaseClient()
  if (!supabase) {
    return { ok: false, mensagem: 'Supabase não configurado.' }
  }

  const tipoNormalizado = normalizarTipoOficina(tipo)
  const officeId = officeUuid.trim()
  if (!officeId) {
    return { ok: false, mensagem: 'Oficina inválida.' }
  }

  const loadResult = await executarComTimeoutAdmin(
    'settings_tipo_oficina_load',
    async () =>
      supabase
        .from('settings')
        .select('id, metadata')
        .eq('office_id', officeId)
        .maybeSingle(),
    ADMIN_GET_OFFICE_DETAILS_TIMEOUT_MS
  )

  const settingsRow = loadResult.data as { id: string; metadata: Record<string, unknown> | null } | null
  const loadError = loadResult.error

  if (loadError) {
    logErroAdmin('settings_tipo_oficina_load', loadError)
    return { ok: false, mensagem: loadError.message }
  }

  if (!settingsRow?.id) {
    return { ok: false, mensagem: 'Configurações da oficina não encontradas no Supabase.' }
  }

  const metadataExistente = (settingsRow.metadata ?? {}) as Record<string, unknown>
  const metadataAtualizado = {
    ...metadataExistente,
    tipo_oficina: tipoNormalizado,
    tipo_oficina_atualizado_em: new Date().toISOString(),
    tipo_oficina_atualizado_por: usuario?.email ?? 'admin',
  }

  const updateResult = await executarComTimeoutAdmin(
    'settings_tipo_oficina_save',
    async () =>
      supabase
        .from('settings')
        .update({
          metadata: metadataAtualizado,
          updated_at: new Date().toISOString(),
        } as never)
        .eq('id', settingsRow.id)
        .eq('office_id', officeId),
    ADMIN_GET_OFFICE_DETAILS_TIMEOUT_MS
  )

  if (updateResult.error) {
    logErroAdmin('settings_tipo_oficina_save', updateResult.error)
    return { ok: false, mensagem: updateResult.error.message }
  }

  return {
    ok: true,
    mensagem: 'Tipo da oficina atualizado.',
    tipo_oficina: tipoNormalizado,
  }
}

export async function carregarTipoOficinaAdmin(officeUuid: string): Promise<TipoOficina> {
  const supabase = getSupabaseClient()
  if (!supabase) return normalizarTipoOficina(undefined)

  const { data } = await supabase
    .from('settings')
    .select('metadata')
    .eq('office_id', officeUuid)
    .maybeSingle()

  const metadata = ((data as SettingsRow | null)?.metadata ?? {}) as Record<string, unknown>
  return normalizarTipoOficina(metadata.tipo_oficina)
}
