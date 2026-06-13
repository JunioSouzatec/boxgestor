import { localCraftRepository } from '@/services/repository/local.repository'
import {
  extrairDadosFase1,
  persistirFase1NoSupabase,
} from '@/services/supabase-sync/supabase-phase1.persistence'
import { isSupabaseConfigured } from '@/lib/supabase'
import { OFFICE_ID } from '@/types/base'

export interface ResultadoMigracaoOficina {
  ok: boolean
  mensagem: string
  enviados?: number
  erros?: { entidade: string; mensagem: string }[]
}

/**
 * Envia dados locais para a office_id do usuário logado no Supabase.
 * Mantém backup local intacto.
 */
export async function migrarDadosLocaisParaOficinaSupabase(
  officeIdDestino: string,
  officeIdOrigem: string = OFFICE_ID
): Promise<ResultadoMigracaoOficina> {
  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      mensagem: 'Supabase não configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.',
    }
  }

  if (!officeIdDestino?.trim()) {
    return { ok: false, mensagem: 'Office ID do usuário não encontrado.' }
  }

  let dadosOrigem
  try {
    dadosOrigem = localCraftRepository.carregar(officeIdOrigem)
  } catch {
    return {
      ok: false,
      mensagem: `Nenhum backup local encontrado para migrar (origem: ${officeIdOrigem}).`,
    }
  }

  const fase1 = extrairDadosFase1(dadosOrigem)
  fase1.configuracao = {
    ...fase1.configuracao,
    id: officeIdDestino,
    office_id: officeIdDestino,
    oficina_id: officeIdDestino,
  }

  const resultado = await persistirFase1NoSupabase(officeIdDestino, fase1)

  if (resultado.ok) {
    const copiaLocal = {
      ...dadosOrigem,
      configuracao: fase1.configuracao,
    }
    localCraftRepository.salvar(officeIdDestino, copiaLocal)

    return {
      ok: true,
      mensagem: `Migração concluída: ${resultado.enviados} registro(s) enviados para sua oficina no Supabase. Backup local preservado.`,
      enviados: resultado.enviados,
    }
  }

  return {
    ok: false,
    mensagem: `Migração parcial ou com erro. ${resultado.erros[0]?.mensagem ?? 'Verifique o console.'}`,
    enviados: resultado.enviados,
    erros: resultado.erros,
  }
}
