import {
  gerarEmailInterno,
  gerarSlugOficinaInterno,
  identificadorPareceEmail,
  normalizarCodigoAcessoOficina,
  normalizarLoginInterno,
  validarCodigoAcessoOficina,
  validarLoginInterno,
  validarSenhaInterna,
  extrairLoginDeEmailInterno,
} from '@/lib/internal-user'
import { isModoAuthSupabaseAtivo } from '@/lib/craft-auth'
import { requireSupabaseClient } from '@/lib/supabase'
import {
  papeisDisponiveisParaAtribuir,
  podeGerenciarUsuario,
} from '@/services/auth/permissions'
import { traduzirErroAuth } from '@/services/auth/supabase-auth.mappers'
import type { AuthUser, LoginInput, UsuarioInternoInput } from '@/types/auth'
import { PAPEIS_CONVITE } from '@/services/auth/convites.service'

export class InternalUserEdgeFunctionUnavailableError extends Error {
  constructor(message?: string) {
    super(
      message ??
        'Criação de usuário interno requer a Edge Function internal-user-admin no Supabase. ' +
          'Execute docs/supabase-internal-users.sql e faça deploy da função. ' +
          'Enquanto isso, use convite por e-mail ou o modo demo local.'
    )
    this.name = 'InternalUserEdgeFunctionUnavailableError'
  }
}

/**
 * Fallback de slug a partir do nome (só quando ainda não há código oficial).
 * Nas telas, preferir `obterCodigoAcessoOficina` / `config.office_slug`.
 */
export function officeSlugParaOficina(officeId: string, nomeOficina?: string): string {
  return gerarSlugOficinaInterno(officeId, nomeOficina)
}

/**
 * Código oficial passado pelas telas (já normalizado) ou fallback pelo nome.
 * NÃO regenera a partir do nome se o código oficial já foi informado.
 */
export function resolverSlugCriacaoUsuarioInterno(
  officeId: string,
  codigoAcessoOficina?: string,
  nomeOficinaFallback?: string
): string {
  const doCodigo = normalizarCodigoAcessoOficina(codigoAcessoOficina ?? '')
  if (doCodigo.length >= 3 && !validarCodigoAcessoOficina(doCodigo)) {
    return doCodigo
  }
  return officeSlugParaOficina(officeId, nomeOficinaFallback)
}

const MSG_CODIGO_ACESSO_INSEGURO =
  'Não foi possível atualizar o código de acesso com segurança. Tente novamente.'

/**
 * Atualiza de forma centralizada (Edge Function):
 * settings.metadata.office_slug + profiles.office_slug + offices.slug.
 * A edge lê valores antigos, aplica, revalida e faz rollback se falhar.
 */
export async function sincronizarCodigoAcessoOficinaSupabase(
  officeId: string,
  codigoAcesso: string
): Promise<{ atualizados: number; office_slug: string }> {
  const codigo = normalizarCodigoAcessoOficina(codigoAcesso)
  const erro = validarCodigoAcessoOficina(codigo)
  if (erro) throw new Error(erro)

  if (!isModoAuthSupabaseAtivo()) {
    const local = sincronizarCodigoAcessoOficinaLocal(officeId, codigo)
    return { ...local, office_slug: codigo }
  }

  const supabase = requireSupabaseClient()
  const { data, error } = await supabase.functions.invoke('internal-user-admin', {
    body: {
      action: 'update_office_access_code',
      office_id: officeId,
      office_slug: codigo,
    },
  })

  const payload = data as {
    error?: string
    ok?: boolean
    atualizados?: number
    office_slug?: string
  } | null

  if (payload?.error) {
    if (payload.error.toLowerCase().includes('já está em uso')) {
      throw new Error('Este código já está em uso. Escolha outro.')
    }
    throw new Error(
      payload.error.toLowerCase().includes('segurança')
        ? MSG_CODIGO_ACESSO_INSEGURO
        : payload.error
    )
  }

  if (!error && payload?.ok) {
    const officeSlug = normalizarCodigoAcessoOficina(payload.office_slug ?? codigo)
    const consistente = await revalidarCodigoAcessoOficinaConsistente(officeId, officeSlug)
    if (!consistente) {
      throw new Error(MSG_CODIGO_ACESSO_INSEGURO)
    }
    return { atualizados: payload.atualizados ?? 0, office_slug: officeSlug }
  }

  // Sem fallback parcial (evita divergência config ↔ profiles ↔ offices)
  tratarRespostaEdgeFunction(error, data, MSG_CODIGO_ACESSO_INSEGURO)
  throw new Error(MSG_CODIGO_ACESSO_INSEGURO)
}

/**
 * Confirma que settings.metadata.office_slug, offices.slug e profiles internos
 * batem com o código esperado após o save.
 */
export async function revalidarCodigoAcessoOficinaConsistente(
  officeId: string,
  codigoEsperado: string
): Promise<boolean> {
  const codigo = normalizarCodigoAcessoOficina(codigoEsperado)
  if (!codigo) return false

  try {
    const supabase = requireSupabaseClient()

    const [settingsRes, officeRes, profilesRes] = await Promise.all([
      supabase.from('settings').select('metadata').eq('office_id', officeId).maybeSingle(),
      supabase.from('offices').select('slug').eq('id', officeId).maybeSingle(),
      supabase
        .from('profiles')
        .select('office_slug')
        .eq('office_id', officeId)
        .eq('is_internal', true),
    ])

    if (settingsRes.error || profilesRes.error) {
      console.warn('[BoxGestor] Revalidação código acesso falhou na leitura', {
        settings: settingsRes.error?.message,
        office: officeRes.error?.message,
        profiles: profilesRes.error?.message,
      })
      return false
    }

    const metaSlug = normalizarCodigoAcessoOficina(
      String(
        ((settingsRes.data as { metadata?: Record<string, unknown> | null } | null)?.metadata
          ?.office_slug as string | undefined) ?? ''
      )
    )
    if (metaSlug !== codigo) return false

    // offices.slug: se legível, precisa bater; se RLS bloquear a leitura, não falha sozinho
    if (!officeRes.error) {
      const officeSlug = normalizarCodigoAcessoOficina(
        String((officeRes.data as { slug?: string } | null)?.slug ?? '')
      )
      if (officeSlug && officeSlug !== codigo) return false
    }

    const profiles = (profilesRes.data ?? []) as Array<{ office_slug?: string | null }>
    if (profiles.length === 0) {
      // Oficina sem usuários internos: settings (+ offices quando legível) basta
      return true
    }

    return profiles.every(
      (p) => normalizarCodigoAcessoOficina(String(p.office_slug ?? '')) === codigo
    )
  } catch (err) {
    console.warn('[BoxGestor] Revalidação código acesso:', err)
    return false
  }
}

function sincronizarCodigoAcessoOficinaLocal(
  officeId: string,
  codigo: string
): { atualizados: number } {
  const raw = localStorage.getItem('craft_auth_v1')
  if (!raw) return { atualizados: 0 }

  const store = JSON.parse(raw) as {
    users: Array<{
      office_id: string
      interno?: boolean
      office_slug?: string
      updated_at?: string
    }>
  }

  const emUso = store.users.some(
    (u) =>
      u.office_id !== officeId &&
      u.office_slug?.toLowerCase() === codigo &&
      u.interno
  )
  if (emUso) {
    throw new Error('Este código já está em uso. Escolha outro.')
  }

  let atualizados = 0
  const agora = new Date().toISOString()
  for (const u of store.users) {
    if (u.office_id === officeId && u.interno) {
      u.office_slug = codigo
      u.updated_at = agora
      atualizados += 1
    }
  }
  localStorage.setItem('craft_auth_v1', JSON.stringify(store))
  return { atualizados }
}

export async function resolverEmailParaLogin(input: LoginInput): Promise<string> {
  const identificador = input.email.trim()
  if (!identificador) throw new Error('Informe usuário ou e-mail.')

  if (identificadorPareceEmail(identificador)) {
    return identificador.toLowerCase()
  }

  const username = normalizarLoginInterno(identificador)
  const codigo = input.codigo_oficina?.trim().toLowerCase() || null

  if (!isModoAuthSupabaseAtivo()) {
    return resolverEmailLoginLocal(username, codigo)
  }

  const supabase = requireSupabaseClient()
  const { data, error } = await supabase.rpc('resolve_internal_login_email', {
    p_identifier: username,
    p_office_slug: codigo,
  } as never)

  if (error) {
    const msg = error.message.toLowerCase()
    if (msg.includes('ambiguous') || msg.includes('office code')) {
      throw new Error(
        'Este usuário existe em mais de uma oficina. Informe o código da oficina.'
      )
    }
    if (msg.includes('not found') || msg.includes('login not found')) {
      throw new Error('Usuário/e-mail ou senha incorretos.')
    }
    if (msg.includes('function') && msg.includes('does not exist')) {
      throw new Error(
        'Login interno ainda não está configurado no Supabase. Execute docs/supabase-internal-users.sql.'
      )
    }
    throw new Error(traduzirErroAuth(error.message))
  }

  const email = String(data ?? '').trim().toLowerCase()
  if (!email) throw new Error('Usuário/e-mail ou senha incorretos.')
  return email
}

function resolverEmailLoginLocal(username: string, officeSlug: string | null): string {
  const raw = localStorage.getItem('craft_auth_v1')
  if (!raw) throw new Error('Usuário/e-mail ou senha incorretos.')

  const store = JSON.parse(raw) as {
    users: Array<{
      email: string
      login_username?: string
      interno?: boolean
      office_slug?: string
      ativo?: boolean
    }>
  }

  const candidatos = store.users.filter((u) => {
    if (u.ativo === false) return false
    const login = u.login_username?.toLowerCase() || ''
    return login === username || u.email.split('@')[0]?.toLowerCase() === username
  })

  if (candidatos.length === 0) {
    throw new Error('Usuário/e-mail ou senha incorretos.')
  }

  if (candidatos.length > 1 && !officeSlug) {
    throw new Error(
      'Este usuário existe em mais de uma oficina. Informe o código da oficina.'
    )
  }

  const escolhido =
    officeSlug != null
      ? candidatos.find((u) => u.office_slug?.toLowerCase() === officeSlug) ?? candidatos[0]
      : candidatos[0]

  return escolhido.email.toLowerCase()
}

export function validarUsuarioInternoInput(input: UsuarioInternoInput): string | null {
  if (!input.nome.trim()) return 'Informe o nome do funcionário.'
  const erroLogin = validarLoginInterno(input.login_username)
  if (erroLogin) return erroLogin
  const erroSenha = validarSenhaInterna(input.senha)
  if (erroSenha) return erroSenha
  if (!PAPEIS_CONVITE.includes(input.papel)) {
    return 'Selecione um cargo válido para usuário interno.'
  }
  return null
}

function tratarRespostaEdgeFunction(
  error: { message?: string } | null,
  data: unknown,
  fallbackIndisponivel: string
): void {
  const payload = data as { error?: string } | null
  const msg = payload?.error ?? error?.message ?? ''

  if (
    msg.includes('SUPABASE_URL não encontrada') ||
    msg.includes('Admin key não encontrada') ||
    msg.includes('Publishable key não encontrada')
  ) {
    throw new Error(msg)
  }

  if (payload?.error) {
    if (payload.error.toLowerCase().includes('edge function')) {
      throw new InternalUserEdgeFunctionUnavailableError(payload.error)
    }
    throw new Error(payload.error)
  }

  if (error) {
    const lower = msg.toLowerCase()
    if (
      lower.includes('not found') ||
      lower.includes('function') ||
      lower.includes('404') ||
      lower.includes('failed to send')
    ) {
      throw new InternalUserEdgeFunctionUnavailableError(fallbackIndisponivel)
    }
    throw new Error(msg || fallbackIndisponivel)
  }
}

export async function criarUsuarioInternoSupabase(
  requester: AuthUser,
  input: UsuarioInternoInput,
  officeSlug: string
): Promise<AuthUser> {
  if (!podeGerenciarUsuario(requester.papel, 'criar')) {
    throw new Error('Você não tem permissão para criar usuários.')
  }
  if (!papeisDisponiveisParaAtribuir(requester.papel).includes(input.papel)) {
    throw new Error('Você não pode atribuir este cargo.')
  }

  const erro = validarUsuarioInternoInput(input)
  if (erro) throw new Error(erro)

  const login = normalizarLoginInterno(input.login_username)
  const email = gerarEmailInterno(login, officeSlug)

  const supabase = requireSupabaseClient()
  const { data, error } = await supabase.functions.invoke('internal-user-admin', {
    body: {
      action: 'create',
      office_id: requester.office_id,
      office_slug: officeSlug,
      nome: input.nome.trim(),
      login_username: login,
      email,
      senha: input.senha,
      papel: input.papel,
      ativo: input.ativo,
      created_by: requester.id,
    },
  })

  if (error || (data as { error?: string } | null)?.error) {
    tratarRespostaEdgeFunction(
      error,
      data,
      'Criação de usuário interno requer a Edge Function internal-user-admin implantada no Supabase.'
    )
  }

  const payload = data as { error?: string; user?: AuthUser } | null
  if (!payload?.user?.id) {
    throw new InternalUserEdgeFunctionUnavailableError()
  }

  return payload.user
}

export async function redefinirSenhaInternoSupabase(
  requester: AuthUser,
  userId: string,
  novaSenha: string
): Promise<void> {
  const erroSenha = validarSenhaInterna(novaSenha)
  if (erroSenha) throw new Error(erroSenha)

  const supabase = requireSupabaseClient()
  const { data, error } = await supabase.functions.invoke('internal-user-admin', {
    body: {
      action: 'reset_password',
      office_id: requester.office_id,
      user_id: userId,
      senha: novaSenha,
      must_change_password: true,
    },
  })

  if (error || (data as { error?: string } | null)?.error) {
    tratarRespostaEdgeFunction(
      error,
      data,
      'Redefinição de senha requer a Edge Function internal-user-admin implantada no Supabase.'
    )
  }
}

export async function definirAtivoUsuarioSupabase(
  requester: AuthUser,
  userId: string,
  ativo: boolean
): Promise<void> {
  if (!podeGerenciarUsuario(requester.papel, ativo ? 'ativar' : 'excluir')) {
    throw new Error('Você não tem permissão para gerenciar usuários.')
  }
  if (!ativo && requester.id === userId) {
    throw new Error('Você não pode desativar sua própria conta.')
  }

  const supabase = requireSupabaseClient()
  const { data, error } = await supabase.functions.invoke('internal-user-admin', {
    body: {
      action: 'set_active',
      office_id: requester.office_id,
      user_id: userId,
      active: ativo,
    },
  })

  if (error || (data as { error?: string } | null)?.error) {
    tratarRespostaEdgeFunction(
      error,
      data,
      'Desativação de usuário requer a Edge Function internal-user-admin implantada no Supabase.'
    )
  }
}

export function formatarIdentificadorUsuario(u: AuthUser): string {
  if (u.interno && u.login_username) return u.login_username
  if (u.interno) return extrairLoginDeEmailInterno(u.email) ?? u.email
  return u.email
}
