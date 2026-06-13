import { getCraftPersistenceMode, getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase'

export type ResultadoTesteSupabase =
  | { ok: true; mensagem: string; detalhe?: string }
  | { ok: false; mensagem: string; detalhe?: string; codigo?: string }

/** Erros que indicam que o servidor respondeu (RLS sem login, por exemplo) */
function erroIndicaServidorAlcancavel(codigo?: string, mensagem?: string): boolean {
  const msg = (mensagem ?? '').toLowerCase()
  return (
    codigo === '42501' ||
    codigo === 'PGRST301' ||
    codigo === '401' ||
    msg.includes('permission') ||
    msg.includes('row-level security') ||
    msg.includes('jwt')
  )
}

/**
 * Teste leve de conexão — não exige login nem grava dados.
 * Com RLS ativo e sem políticas, um "permission denied" ainda confirma que o Supabase respondeu.
 */
export async function testarConexaoSupabase(): Promise<ResultadoTesteSupabase> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return {
      ok: false,
      mensagem: 'Sem conexão com a internet. Verifique sua rede e tente novamente.',
    }
  }

  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      mensagem: 'Supabase não configurado.',
      detalhe: 'Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY em .env.local e reinicie o app.',
    }
  }

  const supabase = getSupabaseClient()
  if (!supabase) {
    return {
      ok: false,
      mensagem: 'Não foi possível inicializar o cliente Supabase.',
    }
  }

  try {
    const { error } = await supabase.from('settings').select('id').limit(1)

    if (!error) {
      return {
        ok: true,
        mensagem: 'Conexão com Supabase estabelecida com sucesso.',
        detalhe: 'O banco respondeu e a tabela settings está acessível.',
      }
    }

    if (erroIndicaServidorAlcancavel(error.code, error.message)) {
      return {
        ok: true,
        mensagem: 'Supabase conectado.',
        detalhe:
          'O servidor respondeu corretamente. O acesso às tabelas está protegido por RLS até o login ser ativado — isso é esperado.',
      }
    }

    if (error.code === '42P01') {
      return {
        ok: false,
        mensagem: 'Tabela settings não encontrada.',
        detalhe: 'Execute docs/supabase-schema.sql no SQL Editor do Supabase.',
        codigo: error.code,
      }
    }

    return {
      ok: false,
      mensagem: 'Não foi possível validar a conexão com o Supabase.',
      detalhe: error.message,
      codigo: error.code,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido'
    return {
      ok: false,
      mensagem: 'Falha ao contactar o Supabase.',
      detalhe: msg,
    }
  }
}

export function obterModoPersistenciaLabel(): string {
  return getCraftPersistenceMode() === 'supabase' ? 'Supabase' : 'Local (localStorage)'
}

export function obterUrlSupabaseMascarada(): string | undefined {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim()
  if (!url) return undefined
  try {
    const parsed = new URL(url)
    return parsed.hostname
  } catch {
    return url.slice(0, 32) + '…'
  }
}
