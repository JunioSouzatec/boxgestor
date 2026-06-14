import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase'
import { obterContextoOfficeSupabase } from '@/lib/supabase-office-context'
import { deveUsarSupabaseAuth } from '@/services/auth/auth.factory'
import {
  formatarErroSupabaseParaUsuario,
  isErroRlsSupabase,
} from '@/services/supabase-sync/supabase-phase1.persistence'
import {
  mapearOffice,
  mapearSettings,
  SyncIdMap,
} from '@/services/supabase-sync/mappers'
import { registrarUltimoErroSupabase, limparUltimoErroSupabase } from '@/services/supabase-sync/supabase-last-error.storage'
import type { SyncErro } from '@/services/supabase-sync/supabase-sync.types'
import type { ConfiguracaoOficina } from '@/types/oficina'
import type { PostgrestError } from '@supabase/supabase-js'

export const MENSAGEM_SUCESSO_OFICINA_SUPABASE =
  'Dados da oficina salvos no Supabase com sucesso.'

export const MENSAGEM_FALLBACK_OFICINA =
  'Não foi possível salvar no Supabase. Os dados foram salvos localmente e serão sincronizados depois.'

export interface ResultadoSalvarOficinaSupabase {
  ok: boolean
  salvouSupabase: boolean
  mensagem: string
  erros: SyncErro[]
}

const MAX_LOGO_METADATA = 280_000

function logoParaMetadata(logoUrl?: string): string | null {
  if (!logoUrl?.trim()) return null
  if (logoUrl.length > MAX_LOGO_METADATA) return null
  return logoUrl.trim()
}

async function upsertSettings(
  settingsRow: Record<string, unknown>,
  officeUuid: string,
  erros: SyncErro[]
): Promise<boolean> {
  const supabase = getSupabaseClient()
  if (!supabase) return false

  const { data: existente } = await supabase
    .from('settings')
    .select('id, created_at')
    .eq('office_id', officeUuid)
    .maybeSingle()

  const remoto = existente as { id: string; created_at?: string } | null
  if (remoto?.id) {
    settingsRow.id = remoto.id
    if (remoto.created_at) settingsRow.created_at = remoto.created_at
  }

  const { error } = await supabase.from('settings').upsert(settingsRow as never, {
    onConflict: 'office_id',
  })

  if (error) {
    registrarUltimoErroSupabase({
      mensagem: error.message,
      entidade: 'settings',
      codigo: error.code,
    })
    erros.push({
      entidade: 'Configurações',
      id: officeUuid,
      mensagem: formatarErroSupabaseParaUsuario(error),
    })
    return false
  }

  return true
}

/**
 * Persiste explicitamente offices + settings da oficina logada.
 * Deve ser chamado apenas quando o usuário salva Dados da Oficina / Aparência.
 */
export async function persistirConfiguracaoOficinaNoSupabase(
  configuracao: ConfiguracaoOficina,
  proximoNumeroOs: number
): Promise<ResultadoSalvarOficinaSupabase> {
  const erros: SyncErro[] = []

  if (!isSupabaseConfigured() || !deveUsarSupabaseAuth()) {
    return {
      ok: true,
      salvouSupabase: false,
      mensagem: MENSAGEM_FALLBACK_OFICINA,
      erros: [],
    }
  }

  const contexto = await obterContextoOfficeSupabase(
    configuracao.office_id ?? configuracao.oficina_id ?? configuracao.id
  )

  if (!contexto?.officeUuid) {
    return {
      ok: false,
      salvouSupabase: false,
      mensagem: 'Usuário sem oficina vinculada no Supabase.',
      erros: [{ entidade: 'profile', mensagem: 'office_id não encontrado no profile' }],
    }
  }

  const supabase = getSupabaseClient()
  if (!supabase) {
    return {
      ok: false,
      salvouSupabase: false,
      mensagem: MENSAGEM_FALLBACK_OFICINA,
      erros: [{ entidade: 'conexão', mensagem: 'Cliente Supabase indisponível' }],
    }
  }

  const officeUuid = contexto.officeUuid
  const ids = new SyncIdMap()
  ids.seed(configuracao.id, officeUuid)
  ids.seed(configuracao.office_id ?? configuracao.id, officeUuid)

  const configComUuid: ConfiguracaoOficina = {
    ...configuracao,
    id: officeUuid,
    office_id: officeUuid,
    oficina_id: officeUuid,
  }

  try {
    const officeRow = await mapearOffice(configComUuid, ids)
    officeRow.id = officeUuid

    const { id: _id, created_at: _created, ...camposOffice } = officeRow
    const { error: officeError } = await supabase
      .from('offices')
      .update({
        ...camposOffice,
        updated_at: new Date().toISOString(),
      } as never)
      .eq('id', officeUuid)

    if (officeError) {
      registrarUltimoErroSupabase({
        mensagem: officeError.message,
        entidade: 'offices',
        codigo: officeError.code,
      })
      erros.push({
        entidade: 'Oficina',
        id: officeUuid,
        mensagem: formatarErroSupabaseParaUsuario(officeError),
      })
    }

    const settingsRow = await mapearSettings(configComUuid, proximoNumeroOs, ids)
    settingsRow.office_id = officeUuid
    const logoMeta = logoParaMetadata(configComUuid.logo_url)
    settingsRow.metadata = {
      ...(settingsRow.metadata as Record<string, unknown>),
      logo_url: logoMeta,
      possui_logo: Boolean(logoMeta ?? configComUuid.logo_url),
      sincronizado_em: new Date().toISOString(),
      origem: 'salvar_dados_oficina',
    }

    const settingsOk = await upsertSettings(settingsRow, officeUuid, erros)

    if (officeError && !settingsOk) {
      return {
        ok: false,
        salvouSupabase: false,
        mensagem: isErroRlsSupabase(officeError as PostgrestError)
          ? formatarErroSupabaseParaUsuario(officeError)
          : MENSAGEM_FALLBACK_OFICINA,
        erros,
      }
    }

    if (officeError || !settingsOk) {
      return {
        ok: false,
        salvouSupabase: false,
        mensagem: MENSAGEM_FALLBACK_OFICINA,
        erros,
      }
    }

    limparUltimoErroSupabase()
    return {
      ok: true,
      salvouSupabase: true,
      mensagem: MENSAGEM_SUCESSO_OFICINA_SUPABASE,
      erros: [],
    }
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : 'Erro ao salvar oficina'
    registrarUltimoErroSupabase({ mensagem, entidade: 'oficina' })
    return {
      ok: false,
      salvouSupabase: false,
      mensagem: MENSAGEM_FALLBACK_OFICINA,
      erros: [{ entidade: 'Oficina', mensagem }],
    }
  }
}
