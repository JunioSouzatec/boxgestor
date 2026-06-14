import { isErroRlsSupabase } from '@/services/supabase-sync/supabase-phase1.persistence'
import { MSG } from '@/lib/mensagens-usuario'
import type { PostgrestError } from '@supabase/supabase-js'

export type CodigoErroPagamento =
  | 'os_nao_sincronizada'
  | 'cliente_moto_invalido'
  | 'rls'
  | 'payload'
  | 'conexao'
  | 'desconhecido'

/** Mensagens técnicas — uso interno e diagnóstico */
export const MENSAGEM_CLIENTE_MOTO_PENDENTE =
  'Pagamento pendente: cliente ou moto da OS ainda não existe no Supabase.'

export const MENSAGEM_OS_NAO_SINCRONIZADA =
  'Pagamento pendente porque a OS correspondente ainda não existe no Supabase.'

export const MENSAGEM_RLS_PAGAMENTO =
  'Pagamento não salvo por política de segurança do Supabase.'

export const MENSAGEM_PAYLOAD_PAGAMENTO =
  'Pagamento não salvo por erro nos dados enviados.'

/** Mensagens exibidas ao usuário */
export const MENSAGEM_SUCESSO_PAGAMENTO = MSG.pagamentoRegistrado

export const MENSAGEM_DUPLICIDADE_EVITADA = MSG.pagamentoRegistrado

export const MENSAGEM_FALLBACK_PAGAMENTO = MSG.semConexao

export const MENSAGEM_SUCESSO_OS_E_PAGAMENTO = MSG.osSalva

export function classificarErroPagamento(
  error: PostgrestError | { message?: string; code?: string } | null,
  mensagemLocal?: string
): CodigoErroPagamento {
  if (
    mensagemLocal?.includes('OS ainda não') ||
    mensagemLocal?.includes('não está sincronizada') ||
    mensagemLocal?.includes('ainda não existe no Supabase')
  ) {
    return 'os_nao_sincronizada'
  }

  if (!error?.message && !mensagemLocal) return 'desconhecido'

  if (isErroRlsSupabase(error ?? { message: mensagemLocal ?? '' })) {
    return 'rls'
  }

  const msg = (error?.message ?? mensagemLocal ?? '').toLowerCase()
  const code = error?.code ?? ''

  if (code === '23503' && msg.includes('service_order')) {
    return 'os_nao_sincronizada'
  }

  if (
    code === '23503' &&
    (msg.includes('customer_id') || msg.includes('motorcycle_id'))
  ) {
    return 'cliente_moto_invalido'
  }

  if (
    code === '23514' ||
    code === '22P02' ||
    code === '23502' ||
    msg.includes('invalid input') ||
    msg.includes('violates check constraint')
  ) {
    return 'payload'
  }

  if (code === 'PGRST116' || msg.includes('network') || msg.includes('fetch')) {
    return 'conexao'
  }

  return 'desconhecido'
}

export function mensagemPagamentoParaUsuario(
  codigo: CodigoErroPagamento,
  tabela?: string
): string {
  switch (codigo) {
    case 'os_nao_sincronizada':
      return MSG.salveOsAntesPagamento
    case 'cliente_moto_invalido':
      return MSG.salveOsAntesPagamento
    case 'rls':
      return MSG.erroSalvar
    case 'payload':
      if (import.meta.env.DEV && tabela) {
        console.info('[Craft Supabase] Erro payload pagamento', { tabela })
      }
      return MSG.erroSalvar
    case 'conexao':
      return MSG.semConexao
    default:
      return MSG.erroSalvar
  }
}
