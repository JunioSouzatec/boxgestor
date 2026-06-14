import { dadosIniciais } from '@/data/seed'
import { migrateDatabase } from '@/services/database-migration.service'
import { getSupabaseClient, requireSupabaseClient } from '@/lib/supabase'
import { localCraftRepository } from '@/services/repository/local.repository'
import { assinaturaService } from '@/services/assinatura/assinatura.service'
import {
  papeisDisponiveisParaAtribuir,
  podeGerenciarUsuario,
} from '@/services/auth/permissions'
import type { IAuthService } from '@/services/auth/auth.types'
import {
  profileParaAuthUser,
  papelParaSupabaseRole,
  traduzirErroAuth,
  type ProfileRow,
} from '@/services/auth/supabase-auth.mappers'
import type {
  AuthSession,
  AuthUser,
  CadastroOficinaInput,
  LoginInput,
  UsuarioInput,
  UsuarioUpdateInput,
} from '@/types/auth'
import type { CraftDatabase } from '@/types/database'
import type { Session } from '@supabase/supabase-js'

function criarDatabaseVazia(officeId: string, config: CraftDatabase['configuracao']): CraftDatabase {
  const base = structuredClone(dadosIniciais)
  return migrateDatabase({
    ...base,
    clientes: [],
    motos: [],
    ordens_servico: [],
    pecas: [],
    fornecedores: [],
    movimentacoes_estoque: [],
    lancamentos: [],
    agendamentos: [],
    proximo_numero_os: 1001,
    configuracao: {
      ...config,
      id: officeId,
      oficina_id: officeId,
      office_id: officeId,
    },
  })
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
    const { data, error } = await supabase.auth.signInWithPassword({
      email: input.email.trim().toLowerCase(),
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
    if (input.senha.length < 6) {
      throw new Error('A senha deve ter pelo menos 6 caracteres.')
    }

    const supabase = requireSupabaseClient()
    const email = input.email.trim().toLowerCase()

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password: input.senha,
      options: {
        data: { full_name: input.nome_responsavel.trim() },
      },
    })

    if (signUpError) throw new Error(traduzirErroAuth(signUpError.message))
    if (!signUpData.user?.id) {
      throw new Error('Não foi possível criar a conta. Tente novamente.')
    }

    const endereco =
      input.endereco?.trim() ||
      [input.cidade?.trim(), input.estado?.trim()].filter(Boolean).join(' - ') ||
      '—'

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
    const configuracao: CraftDatabase['configuracao'] = {
      id: officeIdStr,
      oficina_id: officeIdStr,
      office_id: officeIdStr,
      nome: input.nome_oficina.trim(),
      endereco,
      cidade: input.cidade?.trim() || undefined,
      estado: input.estado?.trim() || undefined,
      telefone: input.telefone.trim(),
      whatsapp: input.whatsapp?.trim() || input.telefone.trim(),
      cnpj: input.cnpj?.trim() || undefined,
      preferencias: {
        tema_escuro: true,
        notificacoes: true,
        alerta_estoque_baixo: true,
      },
    }

    const database = criarDatabaseVazia(officeIdStr, configuracao)
    localCraftRepository.salvar(officeIdStr, database)
    assinaturaService.definirPlano(officeIdStr, 'free')

    if (!signUpData.session) {
      throw new Error(
        'Conta criada! Verifique seu e-mail para confirmar o cadastro e depois faça login.'
      )
    }

    const resolved = await this.resolveSessionFromSupabase(signUpData.session)
    if (!resolved) {
      throw new Error('Conta criada. Faça login após confirmar seu e-mail.')
    }

    return resolved
  }

  async requestPasswordReset(email: string): Promise<void> {
    const supabase = requireSupabaseClient()
    const redirectTo = `${window.location.origin}/login`
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

  async criarUsuario(requester: AuthUser, input: UsuarioInput): Promise<AuthUser> {
    if (!podeGerenciarUsuario(requester.papel, 'criar')) {
      throw new Error('Você não tem permissão para adicionar usuários.')
    }

    if (!papeisDisponiveisParaAtribuir(requester.papel).includes(input.papel)) {
      throw new Error('Você não pode atribuir este cargo.')
    }

    const supabase = requireSupabaseClient()

    const { data: settings } = await supabase
      .from('settings')
      .select('id, metadata')
      .eq('office_id', requester.office_id)
      .maybeSingle()

    const settingsRow = settings as { id: string; metadata: Record<string, unknown> } | null
    const metadata = settingsRow?.metadata ?? {}
    const convites = (metadata.pending_user_invites as unknown[]) ?? []

    const novoConvite = {
      id: crypto.randomUUID(),
      email: input.email.trim().toLowerCase(),
      nome: input.nome.trim(),
      papel: input.papel,
      criado_em: new Date().toISOString(),
      criado_por: requester.id,
    }

    if (settingsRow?.id) {
      await supabase
        .from('settings')
        .update({
          metadata: {
            ...metadata,
            pending_user_invites: [...convites, novoConvite],
          },
        } as never)
        .eq('id', settingsRow.id)
    }

    return {
      id: novoConvite.id,
      email: novoConvite.email,
      nome: novoConvite.nome,
      office_id: requester.office_id,
      papel: input.papel,
      ativo: input.ativo,
      created_at: novoConvite.criado_em,
      updated_at: novoConvite.criado_em,
    }
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
