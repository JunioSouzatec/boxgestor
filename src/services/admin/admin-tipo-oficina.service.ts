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
  criou_settings?: boolean
}

const SETTINGS_PADRAO = {
  dark_theme: true,
  notifications: true,
  low_stock_alert: true,
  next_service_order_num: 1001,
} as const

function rpcIndisponivel(mensagem: string): boolean {
  return /admin_set_office_tipo_oficina|admin_get_office_tipo_oficina|function.*does not exist|Could not find the function/i.test(
    mensagem
  )
}

function montarMetadataTipo(
  existente: Record<string, unknown>,
  tipo: TipoOficina,
  email?: string
): Record<string, unknown> {
  return {
    ...existente,
    tipo_oficina: tipo,
    tipo_oficina_atualizado_em: new Date().toISOString(),
    tipo_oficina_atualizado_por: email?.trim() || 'admin',
  }
}

function formatarErroSalvarTipo(
  officeId: string,
  tipo: TipoOficina,
  erro: { message?: string }
): string {
  const detalhe = erro.message?.trim() || 'Erro desconhecido'
  return `Não foi possível salvar o tipo da oficina (office_id: ${officeId}, tipo: ${tipo}). ${detalhe}`
}

async function salvarTipoViaRpc(
  supabase: NonNullable<ReturnType<typeof getSupabaseClient>>,
  officeId: string,
  tipo: TipoOficina
): Promise<ResultadoAtualizarTipoOficina> {
  const { data, error } = await executarComTimeoutAdmin(
    'admin_set_office_tipo_oficina',
    async () =>
      supabase.rpc('admin_set_office_tipo_oficina', {
        p_office_id: officeId,
        p_tipo: tipo,
      } as never),
    ADMIN_GET_OFFICE_DETAILS_TIMEOUT_MS
  )

  if (error) {
    if (rpcIndisponivel(error.message)) {
      return { ok: false, mensagem: '__RPC_AUSENTE__' }
    }
    logErroAdmin('admin_set_office_tipo_oficina', error)
    return { ok: false, mensagem: formatarErroSalvarTipo(officeId, tipo, error) }
  }

  const payload = (data ?? {}) as {
    ok?: boolean
    tipo_oficina?: string
    criou_settings?: boolean
  }

  const tipoSalvo = normalizarTipoOficina(payload.tipo_oficina ?? tipo)
  const criou = payload.criou_settings === true

  return {
    ok: true,
    mensagem: criou
      ? 'Tipo da oficina salvo. Configurações criadas automaticamente.'
      : 'Tipo da oficina atualizado.',
    tipo_oficina: tipoSalvo,
    criou_settings: criou,
  }
}

/** Fallback quando a RPC admin ainda não foi aplicada — funciona na oficina do usuário logado. */
async function salvarTipoViaUpsertDireto(
  supabase: NonNullable<ReturnType<typeof getSupabaseClient>>,
  officeId: string,
  tipo: TipoOficina,
  email?: string
): Promise<ResultadoAtualizarTipoOficina> {
  const agora = new Date().toISOString()

  const loadResult = await executarComTimeoutAdmin(
    'settings_tipo_oficina_load',
    async () =>
      supabase
        .from('settings')
        .select('id, metadata, dark_theme, notifications, low_stock_alert, next_service_order_num')
        .eq('office_id', officeId)
        .maybeSingle(),
    ADMIN_GET_OFFICE_DETAILS_TIMEOUT_MS
  )

  if (loadResult.error) {
    logErroAdmin('settings_tipo_oficina_load', loadResult.error)
    return { ok: false, mensagem: formatarErroSalvarTipo(officeId, tipo, loadResult.error) }
  }

  const existente = loadResult.data as SettingsRow | null
  const metadataExistente = (existente?.metadata ?? {}) as Record<string, unknown>
  const metadataAtualizado = montarMetadataTipo(metadataExistente, tipo, email)
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
    'settings_tipo_oficina_upsert',
    async () =>
      supabase
        .from('settings')
        .upsert(payload as never, { onConflict: 'office_id' })
        .select('id')
        .maybeSingle(),
    ADMIN_GET_OFFICE_DETAILS_TIMEOUT_MS
  )

  if (saveResult.error) {
    logErroAdmin('settings_tipo_oficina_upsert', saveResult.error)
    return { ok: false, mensagem: formatarErroSalvarTipo(officeId, tipo, saveResult.error) }
  }

  if (!saveResult.data) {
    return {
      ok: false,
      mensagem: formatarErroSalvarTipo(officeId, tipo, {
        message: 'Settings não confirmado após upsert.',
      }),
    }
  }

  return {
    ok: true,
    mensagem: criouSettings
      ? 'Tipo da oficina salvo. Configurações criadas automaticamente.'
      : 'Tipo da oficina atualizado.',
    tipo_oficina: tipo,
    criou_settings: criouSettings,
  }
}

/**
 * Atualiza tipo_oficina em settings.metadata — somente Admin Sistema.
 * Cria settings automaticamente se não existir.
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

  const viaRpc = await salvarTipoViaRpc(supabase, officeId, tipoNormalizado)
  if (viaRpc.ok) {
    return viaRpc
  }
  if (viaRpc.mensagem !== '__RPC_AUSENTE__') {
    return viaRpc
  }

  console.warn(
    '[Admin BoxGestor] RPC admin_set_office_tipo_oficina não encontrada. Tentando upsert direto. Execute docs/supabase-admin-tipo-oficina.sql'
  )

  return salvarTipoViaUpsertDireto(supabase, officeId, tipoNormalizado, usuario?.email)
}

export async function carregarTipoOficinaAdmin(officeUuid: string): Promise<TipoOficina> {
  const supabase = getSupabaseClient()
  if (!supabase) return normalizarTipoOficina(undefined)

  const { data: rpcData, error: rpcError } = await supabase.rpc(
    'admin_get_office_tipo_oficina',
    { p_office_id: officeUuid } as never
  )

  if (!rpcError && typeof rpcData === 'string') {
    return normalizarTipoOficina(rpcData)
  }

  if (rpcError && !rpcIndisponivel(rpcError.message)) {
    logErroAdmin('admin_get_office_tipo_oficina', rpcError)
  }

  const { data } = await supabase
    .from('settings')
    .select('metadata')
    .eq('office_id', officeUuid)
    .maybeSingle()

  const metadata = ((data as SettingsRow | null)?.metadata ?? {}) as Record<string, unknown>
  return normalizarTipoOficina(metadata.tipo_oficina)
}

/** Sincroniza tipo_oficina no app local se a oficina alterada for a oficina logada. */
export function oficinaAlteradaEhAtual(
  officeUuid: string,
  officeIdLocal?: string,
  officeIdSessao?: string
): boolean {
  const alvo = officeUuid.trim().toLowerCase()
  if (!alvo) return false
  if (officeIdSessao?.trim().toLowerCase() === alvo) return true
  if (officeIdLocal?.trim().toLowerCase() === alvo) return true
  return false
}
