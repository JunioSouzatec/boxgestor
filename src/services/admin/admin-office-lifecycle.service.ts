import { getSupabaseClient } from '@/lib/supabase'
import { excluirOficinaLocal } from '@/services/assinatura/office-admin.service'

export async function arquivarOficinaSupabase(officeUuid: string): Promise<void> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase não configurado.')

  const { error } = await supabase.rpc('admin_archive_office', {
    p_office_id: officeUuid,
  } as never)

  if (error) throw new Error(error.message)
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
    return {
      ok: false,
      mensagem: err instanceof Error ? err.message : 'Não foi possível arquivar a oficina.',
    }
  }
}

export async function removerCacheLocalOficinaAdmin(officeId: string): Promise<{ ok: boolean; mensagem: string }> {
  return excluirOficinaLocal(officeId)
}
