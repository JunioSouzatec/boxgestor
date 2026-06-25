import { CadastroRequerConfirmacaoEmailError } from '@/lib/cadastro-errors'
import { getAppUrl } from '@/lib/app-url'
import { getSupabaseClient, requireSupabaseClient } from '@/lib/supabase'
import { setupNovaOficinaTrial } from '@/services/assinatura/setup-nova-oficina.service'
import {
  lancarSeRequerConfirmacaoEmail,
  montarSignupMetadata,
  validarCadastroPublico,
} from '@/services/auth/cadastro-publico.service'
import {
  papeisDisponiveisParaAtribuir,
  podeGerenciarUsuario,
} from '@/services/auth/permissions'
import {
  supabaseConvitesService,
} from '@/services/auth/supabase-convites.service'
import type { ConviteInput, ConviteUsuario } from '@/services/auth/convites.service'
import { MSG } from '@/lib/mensagens-usuario'
import { getRotaPorEstadoAuth } from '@/services/auth/supabase-auth-state.service'
import type { IAuthService } from '@/services/auth/auth.types'
import {
  profileParaAuthUser,
  papelParaSupabaseRole,
  traduzirErroAuth,
  type ProfileRow,
} from '@/services/auth/supabase-auth.mappers'
import {
  criarUsuarioInternoSupabase,
  officeSlugParaOficina,
  redefinirSenhaInternoSupabase,
  resolverEmailParaLogin,
} from '@/services/auth/internal-users.service'
import type {
  AuthSession,
  AuthUser,
  CadastroOficinaInput,
  LoginInput,
  UsuarioInput,
  UsuarioInternoInput,
  UsuarioUpdateInput,
} from '@/types/auth'
import type { Session } from '@supabase/supabase-js'

export interface AceitarConviteResult {
  session: AuthSession | null
  redirectTo: string
  requerConfirmacaoEmail?: boolean
}

export class SupabaseAuthService implements IAuthService {
  private cachedSession: AuthSession | null = null

  getSession(): AuthSession | null {
    return this.cachedSession
  }

  setCachedSession(session: AuthSession | null): void {
    this.cachedSession = session
  }

  async resolveSessionFromSupabase(session: Session | null): Promise<AuthSession | null> {
    if (!session?.user) {
      this.cachedSession = null
      return null
    }

    const supabase = getSupabaseClient()
    if (!supabase) return null

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .maybeSingle()

    if (error) {
      console.error('[Craft Auth] Erro ao buscar profile:', error)
      throw new Error(traduzirErroAuth(error.message))
    }

    if (!profile) {
      this.cachedSession = null
      return null
    }

    const row = profile as ProfileRow
    if (row.active === false) {
      throw new Error('Sua conta está inativa. Entre em contato com o administrador.')
    }

    const authSession: AuthSession = {
      user: profileParaAuthUser(row, session.user.email ?? ''),
      access_token: session.access_token,
      expires_at: new Date((session.expires_at ?? 0) * 1000).toISOString(),
    }

    this.cachedSession = authSession
    return authSession
  }

  async login(input: LoginInput): Promise<AuthSession> {
    const supabase = requireSupabaseClient()
    const email = await resolverEmailParaLogin(input)
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: input.senha,
    })

    if (error) throw new Error(traduzirErroAuth(error.message))

    const resolved = await this.resolveSessionFromSupabase(data.session)
    if (!resolved) {
      this.cachedSession = null
      throw new Error(
        'Perfil não encontrado. Complete o cadastro da oficina em /completar-cadastro.'
      )
    }

    return resolved
  }

  async logout(): Promise<void> {
    const supabase = getSupabaseClient()
    if (supabase) await supabase.auth.signOut()
    this.cachedSession = null
  }

  async register(input: CadastroOficinaInput): Promise<AuthSession> {
    validarCadastroPublico(input)

    const supabase = requireSupabaseClient()
    const email = input.email.trim().toLowerCase()

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password: input.senha,
      options: {
        emailRedirectTo: getAppUrl('/login'),
        data: {
          full_name: input.nome_responsavel.trim(),
          craft_signup: montarSignupMetadata(input),
        },
      },
    })

    if (signUpError) throw new Error(traduzirErroAuth(signUpError.message))
    if (!signUpData.user?.id) {
      throw new Error('Não foi possível criar a conta. Tente novamente.')
    }

    if (!signUpData.session) {
      lancarSeRequerConfirmacaoEmail(signUpData.session, email)
    }

    const { data: officeId, error: rpcError } = await supabase.rpc(
      'create_office_for_new_user',
      {
        p_office_name: input.nome_oficina.trim(),
        p_phone: input.telefone.trim(),
        p_city: input.cidade?.trim() ?? '',
        p_state: input.estado?.trim() ?? '',
        p_full_name: input.nome_responsavel.trim(),
        p_email: email,
      } as never
    )

    if (rpcError) {
      console.error('[Craft Auth] Erro ao criar oficina:', rpcError)
      throw new Error(
        rpcError.message.includes('profile already exists')
          ? 'Esta conta já possui uma oficina vinculada.'
          : `Não foi possível criar a oficina: ${traduzirErroAuth(rpcError.message)}. Execute docs/supabase-auth-rls.sql no Supabase.`
      )
    }

    const officeIdStr = String(officeId)
    setupNovaOficinaTrial(officeIdStr, { ...input, email })

    const resolved = await this.resolveSessionFromSupabase(signUpData.session!)
    if (!resolved) {
      throw new CadastroRequerConfirmacaoEmailError(email)
    }

    return resolved
  }

  async requestPasswordReset(email: string): Promise<void> {
    const supabase = requireSupabaseClient()
    const redirectTo = getAppUrl('/login')
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo,
    })
    if (error) throw new Error(traduzirErroAuth(error.message))
  }

  listarUsuariosOficina(officeId: string): AuthUser[] {
    void officeId
    return this.cachedSession
      ? []
      : []
  }

  async listarUsuariosOficinaAsync(officeId: string): Promise<AuthUser[]> {
    const supabase = getSupabaseClient()
    if (!supabase) return []

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('office_id', officeId)
      .order('full_name')

    if (error) {
      console.error('[Craft Auth] Erro ao listar usuários:', error)
      return []
    }

    return (data as ProfileRow[]).map((p) =>
      profileParaAuthUser(p, p.email?.trim() || '—')
    )
  }

  async criarUsuario(_requester: AuthUser, _input: UsuarioInput): Promise<AuthUser> {
    throw new Error('Use prepararConvite para adicionar membros da equipe.')
  }

  async prepararConvite(
    requester: AuthUser,
    input: ConviteInput,
    nomeOficina?: string
  ): Promise<ConviteUsuario> {
    if (!podeGerenciarUsuario(requester.papel, 'criar')) {
      throw new Error('Você não tem permissão para convidar usuários.')
    }
    if (!papeisDisponiveisParaAtribuir(requester.papel).includes(input.papel)) {
      throw new Error('Você não pode atribuir este cargo.')
    }

    const email = input.email.trim().toLowerCase()
    const usuarios = await this.listarUsuariosOficinaAsync(requester.office_id)
    if (usuarios.some((u) => u.email.toLowerCase() === email)) {
      throw new Error('Este e-mail já pertence a um usuário da oficina.')
    }

    return supabaseConvitesService.criarConvite(requester.office_id, input, {
      criado_por: requester.id,
      nome_oficina: nomeOficina,
    })
  }

  async listarConvitesPendentes(officeId: string): Promise<ConviteUsuario[]> {
    return supabaseConvitesService.listarPendentes(officeId)
  }

  async cancelarConvite(requester: AuthUser, conviteId: string): Promise<void> {
    if (!podeGerenciarUsuario(requester.papel, 'criar')) {
      throw new Error('Você não tem permissão para cancelar convites.')
    }
    await supabaseConvitesService.cancelarConvite(requester.office_id, conviteId)
  }

  private async executarAceiteConvite(token: string): Promise<void> {
    const supabase = requireSupabaseClient()
    const { error } = await supabase.rpc('accept_user_invite', { p_token: token } as never)

    if (error) {
      const msg = error.message.toLowerCase()
      if (msg.includes('email mismatch')) {
        throw new Error(MSG.conviteEmailDiferente)
      }
      if (
        msg.includes('invite not available') ||
        msg.includes('invite expired') ||
        msg.includes('invite not found')
      ) {
        throw new Error(MSG.conviteIndisponivel)
      }
      if (msg.includes('profile other office')) {
        throw new Error('Esta conta já está vinculada a outra oficina.')
      }
      if (import.meta.env.DEV) console.error('[Craft Auth] accept_user_invite:', error)
      throw new Error('Não foi possível aceitar o convite.')
    }
  }

  async aceitarConvite(token: string, senha: string): Promise<AceitarConviteResult> {
    const supabase = requireSupabaseClient()
    const convite = await supabaseConvitesService.obterPorToken(token)

    if (!convite || convite.status !== 'pendente') {
      throw new Error(MSG.conviteIndisponivel)
    }

    const { data: sessionData } = await supabase.auth.getSession()
    const sbSession = sessionData.session

    if (!senha && sbSession) {
      const emailAuth = sbSession.user.email?.trim().toLowerCase()
      if (emailAuth !== convite.email.toLowerCase()) {
        throw new Error(MSG.conviteEmailDiferente)
      }

      await this.executarAceiteConvite(token)
      const resolved = await this.resolveSessionFromSupabase(sbSession)
      if (!resolved) {
        throw new Error('Não foi possível concluir o aceite do convite.')
      }

      return {
        session: resolved,
        redirectTo: getRotaPorEstadoAuth('pronto', resolved.user.papel),
      }
    }

    if (senha) {
      if (senha.length < 6) {
        throw new Error('A senha deve ter pelo menos 6 caracteres.')
      }

      const { data, error } = await supabase.auth.signUp({
        email: convite.email,
        password: senha,
        options: {
          data: { full_name: convite.nome },
        },
      })

      if (error) throw new Error(traduzirErroAuth(error.message))
      if (!data.user?.id) {
        throw new Error('Não foi possível criar a conta. Tente novamente.')
      }

      if (!data.session) {
        return {
          session: null,
          redirectTo: `/login?convite=${token}&email=${encodeURIComponent(convite.email)}`,
          requerConfirmacaoEmail: true,
        }
      }

      await this.executarAceiteConvite(token)
      const resolved = await this.resolveSessionFromSupabase(data.session)
      if (!resolved) {
        return {
          session: null,
          redirectTo: `/login?convite=${token}&email=${encodeURIComponent(convite.email)}`,
          requerConfirmacaoEmail: true,
        }
      }

      return {
        session: resolved,
        redirectTo: getRotaPorEstadoAuth('pronto', resolved.user.papel),
      }
    }

    throw new Error('Informe uma senha para criar sua conta.')
  }

  async atualizarUsuario(
    requester: AuthUser,
    userId: string,
    patch: UsuarioUpdateInput
  ): Promise<AuthUser> {
    const supabase = requireSupabaseClient()

    const { data: alvo, error: fetchError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .eq('office_id', requester.office_id)
      .maybeSingle()

    if (fetchError || !alvo) throw new Error('Usuário não encontrado.')

    const profile = alvo as ProfileRow
    const authUser = profileParaAuthUser(profile, profile.email ?? '')

    if (!podeGerenciarUsuario(requester.papel, 'editar', authUser)) {
      throw new Error('Você não tem permissão para editar este usuário.')
    }

    if (patch.papel && !papeisDisponiveisParaAtribuir(requester.papel).includes(patch.papel)) {
      throw new Error('Você não pode atribuir este cargo.')
    }

    const update: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }
    if (patch.nome) update.full_name = patch.nome.trim()
    if (patch.papel) update.role = papelParaSupabaseRole(patch.papel)
    if (patch.ativo !== undefined) update.active = patch.ativo
    if (patch.email) update.email = patch.email.trim().toLowerCase()

    const { data: updated, error } = await supabase
      .from('profiles')
      .update(update as never)
      .eq('id', userId)
      .select('*')
      .single()

    if (error) throw new Error(traduzirErroAuth(error.message))

    if (requester.id === userId) {
      await this.resolveSessionFromSupabase(
        (await supabase.auth.getSession()).data.session
      )
    }

    return profileParaAuthUser(updated as ProfileRow, patch.email ?? authUser.email)
  }

  async criarUsuarioInterno(
    requester: AuthUser,
    input: UsuarioInternoInput,
    nomeOficina?: string
  ): Promise<AuthUser> {
    const slug = officeSlugParaOficina(requester.office_id, nomeOficina)
    return criarUsuarioInternoSupabase(requester, input, slug)
  }

  async redefinirSenhaInterno(
    requester: AuthUser,
    userId: string,
    novaSenha: string
  ): Promise<void> {
    await redefinirSenhaInternoSupabase(requester, userId, novaSenha)
  }

  async excluirUsuario(requester: AuthUser, userId: string): Promise<void> {
    if (requester.id === userId) {
      throw new Error('Você não pode excluir sua própria conta.')
    }

    const supabase = requireSupabaseClient()

    const { data: alvo } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .eq('office_id', requester.office_id)
      .maybeSingle()

    if (!alvo) throw new Error('Usuário não encontrado.')

    const authUser = profileParaAuthUser(alvo as ProfileRow, '')

    if (!podeGerenciarUsuario(requester.papel, 'excluir', authUser)) {
      throw new Error('Você não tem permissão para excluir este usuário.')
    }

    const desativar = { active: false, updated_at: new Date().toISOString() }
    const { error } = await supabase
      .from('profiles')
      .update(desativar as never)
      .eq('id', userId)

    if (error) throw new Error(traduzirErroAuth(error.message))
  }
}

export const supabaseAuthService = new SupabaseAuthService()
