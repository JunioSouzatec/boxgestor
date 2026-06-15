import { getSupabaseClient } from '@/lib/supabase'
import {
  ADMIN_ARCHIVE_OFFICE_TIMEOUT_MS,
  executarComTimeoutAdmin,
  logErroAdmin,
  MENSAGEM_ERRO_ACAO_ADMIN,
  AdminRpcTimeoutError,
} from '@/lib/admin-env'
import { excluirOficinaLocal } from '@/services/assinatura/office-admin.service'

export async function arquivarOficinaSupabase(officeUuid: string): Promise<void> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase não configurado.')

  const { error } = await executarComTimeoutAdmin(
    'admin_archive_office',
    async () =>
      supabase.rpc('admin_archive_office', {
        p_office_id: officeUuid,
      } as never),
    ADMIN_ARCHIVE_OFFICE_TIMEOUT_MS
  )

  if (error) {
    logErroAdmin('admin_archive_office', error)
    throw new Error(error.message)
  }
}

export async function arquivarOficinaAdmin(officeId: string): Promise<{ ok: boolean; mensagem: string }> {
  try {
    await arquivarOficinaSupabase(officeId)
    excluirOficinaLocal(officeId)
    return {
      ok: true,
      mensagem:
        'Oficina arquivada no Supabase. Para reutilizar o mesmo e-mail, remova o usuário em Supabase Auth → Users.',
    }
  } catch (err) {
    console.error('Erro ao arquivar oficina admin:', err)
    if (err instanceof AdminRpcTimeoutError) {
      return { ok: false, mensagem: MENSAGEM_ERRO_ACAO_ADMIN }
    }
    return {
      ok: false,
      mensagem: err instanceof Error ? err.message : 'Não foi possível arquivar a oficina.',
    }
  }
}

export async function removerCacheLocalOficinaAdmin(officeId: string): Promise<{ ok: boolean; mensagem: string }> {
  return excluirOficinaLocal(officeId)
}
