import { getSupabaseClient } from '@/lib/supabase'
import { ehAdminSistema } from '@/lib/craft-admin'
import {
  ADMIN_GET_OFFICE_DETAILS_TIMEOUT_MS,
  executarComTimeoutAdmin,
  logErroAdmin,
} from '@/lib/admin-env'
import { assinaturaService } from '@/services/assinatura/assinatura.service'
import type { SettingsRow } from '@/services/supabase-sync/reverse-mappers'
import { normalizarExtraUsersCount } from '@/types/plano'
import type { AuthUser } from '@/types/auth'

export interface ResultadoAtualizarExtraUsers {
  ok: boolean
  mensagem: string
  extra_users_count?: number
  criou_settings?: boolean
}

const SETTINGS_PADRAO = {
  dark_theme: true,
  notifications: true,
  low_stock_alert: true,
  next_service_order_num: 1001,
} as const

function rpcIndisponivel(mensagem: string): boolean {
  return /admin_set_office_extra_users_count|admin_get_office_extra_users_count|function.*does not exist|Could not find the function/i.test(
    mensagem
  )
}

function montarMetadataExtraUsers(
  existente: Record<string, unknown>,
  count: number,
  email?: string
): Record<string, unknown> {
  return {
    ...existente,
    extra_users_count: count,
    extra_users_atualizado_em: new Date().toISOString(),
    extra_users_atualizado_por: email?.trim() || 'admin',
  }
}

function formatarErroSalvar(officeId: string, count: number, erro: { message?: string }): string {
  const detalhe = erro.message?.trim() || 'Erro desconhecido'
  return `Não foi possível salvar usuários extras (office_id: ${officeId}, extras: ${count}). ${detalhe}`
}

async function salvarViaRpc(
  supabase: NonNullable<ReturnType<typeof getSupabaseClient>>,
  officeId: string,
  count: number
): Promise<ResultadoAtualizarExtraUsers> {
  const { data, error } = await executarComTimeoutAdmin(
    'admin_set_office_extra_users_count',
    async () =>
      supabase.rpc('admin_set_office_extra_users_count', {
        p_office_id: officeId,
        p_count: count,
      } as never),
    ADMIN_GET_OFFICE_DETAILS_TIMEOUT_MS
  )

  if (error) {
    if (rpcIndisponivel(error.message)) {
      return { ok: false, mensagem: '__RPC_AUSENTE__' }
    }
    logErroAdmin('admin_set_office_extra_users_count', error)
    return { ok: false, mensagem: formatarErroSalvar(officeId, count, error) }
  }

  const payload = (data ?? {}) as {
    ok?: boolean
    extra_users_count?: number
    criou_settings?: boolean
  }

  const extraSalvo = normalizarExtraUsersCount(payload.extra_users_count ?? count)

  return {
    ok: true,
    mensagem: payload.criou_settings
      ? 'Usuários extras salvos. Configurações criadas automaticamente.'
      : 'Usuários extras atualizados.',
    extra_users_count: extraSalvo,
    criou_settings: payload.criou_settings === true,
  }
}

async function salvarViaUpsertDireto(
  supabase: NonNullable<ReturnType<typeof getSupabaseClient>>,
  officeId: string,
  count: number,
  email?: string
): Promise<ResultadoAtualizarExtraUsers> {
  const agora = new Date().toISOString()

  const loadResult = await executarComTimeoutAdmin(
    'settings_extra_users_load',
    async () =>
      supabase
        .from('settings')
        .select('id, metadata, dark_theme, notifications, low_stock_alert, next_service_order_num')
        .eq('office_id', officeId)
        .maybeSingle(),
    ADMIN_GET_OFFICE_DETAILS_TIMEOUT_MS
  )

  if (loadResult.error) {
    logErroAdmin('settings_extra_users_load', loadResult.error)
    return { ok: false, mensagem: formatarErroSalvar(officeId, count, loadResult.error) }
  }

  const existente = loadResult.data as SettingsRow | null
  const metadataExistente = (existente?.metadata ?? {}) as Record<string, unknown>
  const metadataAtualizado = montarMetadataExtraUsers(metadataExistente, count, email)
  const criouSettings = !existente?.id

  const payload = {
    office_id: officeId,
    dark_theme: existente?.dark_theme ?? SETTINGS_PADRAO.dark_theme,
    notifications: existente?.notifications ?? SETTINGS_PADRAO.notifications,
    low_stock_alert: existente?.low_stock_alert ?? SETTINGS_PADRAO.low_stock_alert,
    next_service_order_num:
      existente?.next_service_order_num ?? SETTINGS_PADRAO.next_service_order_num,
    metadata: metadataAtualizado,
    updated_at: agora,
    ...(criouSettings ? { created_at: agora } : {}),
  }

  const saveResult = await executarComTimeoutAdmin(
    'settings_extra_users_upsert',
    async () =>
      supabase
        .from('settings')
        .upsert(payload as never, { onConflict: 'office_id' })
        .select('id')
        .maybeSingle(),
    ADMIN_GET_OFFICE_DETAILS_TIMEOUT_MS
  )

  if (saveResult.error) {
    logErroAdmin('settings_extra_users_upsert', saveResult.error)
    return { ok: false, mensagem: formatarErroSalvar(officeId, count, saveResult.error) }
  }

  if (!saveResult.data) {
    return {
      ok: false,
      mensagem: formatarErroSalvar(officeId, count, {
        message: 'Settings não confirmado após upsert.',
      }),
    }
  }

  return {
    ok: true,
    mensagem: criouSettings
      ? 'Usuários extras salvos. Configurações criadas automaticamente.'
      : 'Usuários extras atualizados.',
    extra_users_count: count,
    criou_settings: criouSettings,
  }
}

export async function carregarExtraUsersCountAdmin(officeUuid: string): Promise<number> {
  const supabase = getSupabaseClient()
  if (!supabase) return 0

  const id = officeUuid.trim()
  if (!id) return 0

  const { data: rpcData, error: rpcError } = await supabase.rpc(
    'admin_get_office_extra_users_count',
    { p_office_id: id } as never
  )

  if (!rpcError && (typeof rpcData === 'number' || typeof rpcData === 'string')) {
    return normalizarExtraUsersCount(rpcData)
  }

  if (rpcError) {
    logErroAdmin('admin_get_office_extra_users_count', rpcError)
    if (!rpcIndisponivel(rpcError.message) && /acesso negado/i.test(rpcError.message)) {
      console.warn(
        '[Admin BoxGestor] extra_users_count: is_system_admin() negou. Verifique system_admin_emails.'
      )
    }
  }

  const { data } = await supabase
    .from('settings')
    .select('metadata')
    .eq('office_id', id)
    .maybeSingle()

  const metadata = ((data as SettingsRow | null)?.metadata ?? {}) as Record<string, unknown>
  return normalizarExtraUsersCount(metadata.extra_users_count)
}

export async function atualizarExtraUsersCountAdmin(
  officeUuid: string,
  count: number,
  usuario: AuthUser | null | undefined
): Promise<ResultadoAtualizarExtraUsers> {
  if (!ehAdminSistema(usuario)) {
    return {
      ok: false,
      mensagem: 'Somente o Administrador do Sistema pode alterar usuários extras.',
    }
  }

  const supabase = getSupabaseClient()
  if (!supabase) {
    return { ok: false, mensagem: 'Supabase não configurado.' }
  }

  const officeId = officeUuid.trim()
  if (!officeId) {
    return { ok: false, mensagem: 'Oficina inválida.' }
  }

  const countNormalizado = normalizarExtraUsersCount(count)

  const viaRpc = await salvarViaRpc(supabase, officeId, countNormalizado)
  if (viaRpc.ok) {
    assinaturaService.definirExtraUsersCount(officeId, countNormalizado)
    return viaRpc
  }
  if (viaRpc.mensagem !== '__RPC_AUSENTE__') {
    return viaRpc
  }

  console.warn(
    '[Admin BoxGestor] RPC admin_set_office_extra_users_count não encontrada. Tentando upsert direto. Execute docs/supabase-admin-extra-users.sql'
  )

  const viaUpsert = await salvarViaUpsertDireto(
    supabase,
    officeId,
    countNormalizado,
    usuario?.email
  )
  if (viaUpsert.ok) {
    assinaturaService.definirExtraUsersCount(officeId, countNormalizado)
  }
  return viaUpsert
}
