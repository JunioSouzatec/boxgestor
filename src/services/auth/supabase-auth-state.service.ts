import { MSG } from '@/lib/mensagens-usuario'
import { oficinaEstaArquivada } from '@/lib/craft-office-archive'
import { ehAdminSistema } from '@/lib/craft-admin'
import { getSupabaseClient } from '@/lib/supabase'
import {
  getCurrentOffice,
  getCurrentProfile,
} from '@/services/auth/supabase-auth-safe.service'
import {
  profileParaAuthUser,
  traduzirErroAuth,
  type ProfileRow,
} from '@/services/auth/supabase-auth.mappers'
import type { AuthSession } from '@/types/auth'
import type { PapelUsuario } from '@/types/auth'
import { getRotaInicial } from '@/services/auth/permissions'
import type { Session } from '@supabase/supabase-js'

export type EstadoAutenticacao =
  | 'carregando'
  | 'nao_autenticado'
  | 'sem_perfil'
  | 'sem_oficina'
  | 'oficina_arquivada'
  | 'pronto'
  | 'erro'

export interface AvaliacaoEstadoSupabase {
  estado: EstadoAutenticacao
  authSession: AuthSession | null
  profile: ProfileRow | null
  email: string | null
  mensagemUsuario: string
  erro?: string
}

function mensagemPorEstado(estado: EstadoAutenticacao): string {
  switch (estado) {
    case 'nao_autenticado':
      return 'Nenhum usuário logado.'
    case 'sem_perfil':
      return 'Usuário sem perfil. Complete o cadastro da oficina.'
    case 'sem_oficina':
      return 'Usuário sem oficina vinculada. Crie sua oficina para continuar.'
    case 'oficina_arquivada':
      return MSG.oficinaArquivada
    case 'pronto':
      return 'Sessão válida.'
    case 'erro':
      return 'Erro ao carregar autenticação.'
    default:
      return 'Carregando…'
  }
}

export function getRotaPorEstadoAuth(
  estado: EstadoAutenticacao,
  papel?: PapelUsuario
): string {
  switch (estado) {
    case 'sem_perfil':
      return '/completar-cadastro'
    case 'sem_oficina':
      return '/criar-oficina'
    case 'pronto':
      return getRotaInicial(papel ?? 'recepcao')
    case 'oficina_arquivada':
      return '/'
    case 'nao_autenticado':
    case 'erro':
    default:
      return '/login'
  }
}

export async function avaliarEstadoSupabase(
  session: Session | null
): Promise<AvaliacaoEstadoSupabase> {
  if (!session?.user?.id) {
    return {
      estado: 'nao_autenticado',
      authSession: null,
      profile: null,
      email: null,
      mensagemUsuario: mensagemPorEstado('nao_autenticado'),
    }
  }

  const email = session.user.email ?? null

  try {
    const profile = await getCurrentProfile(session.user.id)

    if (!profile) {
      return {
        estado: 'sem_perfil',
        authSession: null,
        profile: null,
        email,
        mensagemUsuario: mensagemPorEstado('sem_perfil'),
      }
    }

    if (!profile.office_id?.trim()) {
      return {
        estado: 'sem_oficina',
        authSession: null,
        profile,
        email,
        mensagemUsuario: mensagemPorEstado('sem_oficina'),
      }
    }

    const office = await getCurrentOffice(profile.office_id)
    if (!office) {
      return {
        estado: 'sem_oficina',
        authSession: null,
        profile,
        email,
        mensagemUsuario: mensagemPorEstado('sem_oficina'),
      }
    }

    if (profile.active === false) {
      return {
        estado: 'erro',
        authSession: null,
        profile,
        email,
        mensagemUsuario: 'Sua conta está inativa. Entre em contato com o administrador.',
        erro: 'conta_inativa',
      }
    }

    const authUser = profileParaAuthUser(profile, email ?? '')

    if (oficinaEstaArquivada(office) && !ehAdminSistema(authUser)) {
      const authSession: AuthSession = {
        user: authUser,
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_at: new Date((session.expires_at ?? 0) * 1000).toISOString(),
      }
      return {
        estado: 'oficina_arquivada',
        authSession,
        profile,
        email,
        mensagemUsuario: MSG.oficinaArquivada,
        erro: 'oficina_arquivada',
      }
    }

    const authSession: AuthSession = {
      user: authUser,
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: new Date((session.expires_at ?? 0) * 1000).toISOString(),
    }

    return {
      estado: 'pronto',
      authSession,
      profile,
      email,
      mensagemUsuario: mensagemPorEstado('pronto'),
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro desconhecido'
    console.error('[Craft Auth] Erro ao avaliar estado Supabase:', e)
    return {
      estado: 'erro',
      authSession: null,
      profile: null,
      email,
      mensagemUsuario: traduzirErroAuth(msg),
      erro: msg,
    }
  }
}

export async function obterSessaoSupabaseAtual(): Promise<Session | null> {
  const supabase = getSupabaseClient()
  if (!supabase) return null
  try {
    const { data, error } = await supabase.auth.getSession()
    if (error) {
      console.warn('[Craft Auth] getSession:', error.message)
      return null
    }
    return data.session ?? null
  } catch (e) {
    console.warn('[Craft Auth] Falha getSession:', e)
    return null
  }
}
