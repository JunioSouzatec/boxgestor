import { validarCadastroPublico } from '@/services/auth/cadastro-publico.service'
import {
  papeisDisponiveisParaAtribuir,
  podeGerenciarUsuario,
} from '@/services/auth/permissions'
import type { IAuthService } from '@/services/auth/auth.types'
import type {
  AuthSession,
  AuthUser,
  CadastroOficinaInput,
  LoginInput,
  UsuarioInput,
  UsuarioUpdateInput,
} from '@/types/auth'
import { OFFICE_ID } from '@/types/base'
import { setupNovaOficinaTrial } from '@/services/assinatura/setup-nova-oficina.service'
import { CREDENCIAIS_ADMIN_LOCAL, enriquecerUsuarioAdmin } from '@/lib/craft-admin'
import { gerarId } from '@/lib/utils'
import {
  convitesService,
  type ConviteInput,
  type ConviteUsuario,
} from '@/services/auth/convites.service'
import {
  officeSlugParaOficina,
  resolverEmailParaLogin,
  validarUsuarioInternoInput,
} from '@/services/auth/internal-users.service'
import {
  gerarEmailInterno,
  normalizarLoginInterno,
} from '@/lib/internal-user'
import type { UsuarioInternoInput } from '@/types/auth'

export const AUTH_STORAGE_KEY = 'craft_auth_v1'

/** Credenciais demo — vinculadas aos dados existentes da oficina Craft */
export const DEMO_CREDENTIALS = {
  email: 'demo@craft.com',
  senha: 'craft123',
} as const

interface StoredUser extends AuthUser {
  /** Hash simulado — substituir por Supabase Auth */
  password_hash: string
}

interface AuthStore {
  users: StoredUser[]
  session: AuthSession | null
  reset_tokens: { email: string; token: string; expires_at: string }[]
}

function hashSenha(senha: string): string {
  return btoa(unescape(encodeURIComponent(senha)))
}

function normalizarUsuario(user: StoredUser): StoredUser {
  return { ...user, ativo: user.ativo ?? true }
}

function carregarStore(): AuthStore {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY)
    if (raw) {
      const store = JSON.parse(raw) as AuthStore
      store.users = store.users.map(normalizarUsuario)
      if (store.session?.user) {
        store.session.user = normalizarUsuario(store.session.user as StoredUser)
      }
      return store
    }
  } catch {
    /* seed abaixo */
  }

  const agora = new Date().toISOString()
  const demoUser: StoredUser = {
    id: 'user-demo-001',
    email: DEMO_CREDENTIALS.email,
    nome: 'Administrador Demo',
    office_id: OFFICE_ID,
    papel: 'dono',
    ativo: true,
    password_hash: hashSenha(DEMO_CREDENTIALS.senha),
    created_at: agora,
    updated_at: agora,
  }

  const adminSistemaUser: StoredUser = {
    id: 'user-admin-sistema-001',
    email: CREDENCIAIS_ADMIN_LOCAL.email,
    nome: 'Admin BoxGestor',
    office_id: OFFICE_ID,
    papel: 'dono',
    admin_sistema: true,
    ativo: true,
    password_hash: hashSenha(CREDENCIAIS_ADMIN_LOCAL.senha),
    created_at: agora,
    updated_at: agora,
  }

  const store: AuthStore = { users: [demoUser, adminSistemaUser], session: null, reset_tokens: [] }
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(store))
  return store
}

function salvarStore(store: AuthStore): void {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(store))
}

function criarSessao(user: AuthUser): AuthSession {
  const expires = new Date()
  expires.setDate(expires.getDate() + 7)
  return {
    user,
    access_token: `local_${gerarId()}`,
    expires_at: expires.toISOString(),
  }
}

function toAuthUser(stored: StoredUser): AuthUser {
  const { password_hash: _, ...user } = stored
  return enriquecerUsuarioAdmin(user)
}

function sincronizarSessao(store: AuthStore, userId: string): void {
  if (store.session?.user.id === userId) {
    const stored = store.users.find((u) => u.id === userId)
    if (stored) store.session = criarSessao(toAuthUser(stored))
  }
}

export class LocalAuthService implements IAuthService {
  getSession(): AuthSession | null {
    const store = carregarStore()
    if (!store.session) return null
    if (new Date(store.session.expires_at) < new Date()) {
      store.session = null
      salvarStore(store)
      return null
    }

    const stored = store.users.find((u) => u.id === store.session!.user.id)
    if (!stored || !stored.ativo) {
      store.session = null
      salvarStore(store)
      return null
    }

    store.session.user = toAuthUser(stored)
    return store.session
  }

  async login(input: LoginInput): Promise<AuthSession> {
    const store = carregarStore()
    const email = await resolverEmailParaLogin(input)
    const user = store.users.find((u) => u.email.toLowerCase() === email)

    if (!user || user.password_hash !== hashSenha(input.senha)) {
      throw new Error('Usuário/e-mail ou senha incorretos.')
    }

    if (!user.ativo) {
      throw new Error('Sua conta está inativa. Entre em contato com o administrador.')
    }

    const session = criarSessao(toAuthUser(user))
    store.session = session
    salvarStore(store)
    return session
  }

  async logout(): Promise<void> {
    const store = carregarStore()
    store.session = null
    salvarStore(store)
  }

  async register(input: CadastroOficinaInput): Promise<AuthSession> {
    validarCadastroPublico(input)

    const store = carregarStore()
    const email = input.email.trim().toLowerCase()

    if (store.users.some((u) => u.email.toLowerCase() === email)) {
      throw new Error('Este e-mail já possui cadastro. Faça login para continuar.')
    }

    const officeId = gerarId()
    const agora = new Date().toISOString()

    const newUser: StoredUser = {
      id: gerarId(),
      email,
      nome: input.nome_responsavel.trim(),
      office_id: officeId,
      papel: 'dono',
      ativo: true,
      password_hash: hashSenha(input.senha),
      created_at: agora,
      updated_at: agora,
    }

    setupNovaOficinaTrial(officeId, { ...input, email })

    store.users.push(newUser)
    const session = criarSessao(toAuthUser(newUser))
    store.session = session
    salvarStore(store)
    return session
  }

  async requestPasswordReset(email: string): Promise<void> {
    const store = carregarStore()
    const normalized = email.trim().toLowerCase()
    const user = store.users.find((u) => u.email.toLowerCase() === normalized)

    if (!user) return

    const token = gerarId()
    const expires = new Date()
    expires.setHours(expires.getHours() + 1)

    store.reset_tokens = store.reset_tokens.filter((t) => t.email !== normalized)
    store.reset_tokens.push({
      email: normalized,
      token,
      expires_at: expires.toISOString(),
    })
    salvarStore(store)

    console.info('[Craft Auth simulado] Token de recuperação:', token)
  }

  listarUsuariosOficina(officeId: string): AuthUser[] {
    const store = carregarStore()
    return store.users
      .filter((u) => u.office_id === officeId)
      .map(toAuthUser)
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  }

  async criarUsuario(requester: AuthUser, input: UsuarioInput): Promise<AuthUser> {
    if (!podeGerenciarUsuario(requester.papel, 'criar')) {
      throw new Error('Você não tem permissão para adicionar usuários.')
    }

    if (!papeisDisponiveisParaAtribuir(requester.papel).includes(input.papel)) {
      throw new Error('Você não pode atribuir este cargo.')
    }

    const store = carregarStore()
    const email = input.email.trim().toLowerCase()

    if (store.users.some((u) => u.email.toLowerCase() === email)) {
      throw new Error('Este e-mail já está cadastrado.')
    }

    if (input.senha.length < 6) {
      throw new Error('A senha deve ter pelo menos 6 caracteres.')
    }

    const agora = new Date().toISOString()
    const newUser: StoredUser = {
      id: gerarId(),
      email,
      nome: input.nome.trim(),
      office_id: requester.office_id,
      papel: input.papel,
      ativo: input.ativo,
      password_hash: hashSenha(input.senha),
      created_at: agora,
      updated_at: agora,
    }

    store.users.push(newUser)
    salvarStore(store)
    return toAuthUser(newUser)
  }

  async criarUsuarioInterno(
    requester: AuthUser,
    input: UsuarioInternoInput,
    nomeOficina?: string
  ): Promise<AuthUser> {
    if (!podeGerenciarUsuario(requester.papel, 'criar')) {
      throw new Error('Você não tem permissão para adicionar usuários.')
    }
    if (!papeisDisponiveisParaAtribuir(requester.papel).includes(input.papel)) {
      throw new Error('Você não pode atribuir este cargo.')
    }

    const erro = validarUsuarioInternoInput(input)
    if (erro) throw new Error(erro)

    const store = carregarStore()
    const officeSlug = officeSlugParaOficina(requester.office_id, nomeOficina)
    const login = normalizarLoginInterno(input.login_username)
    const email = gerarEmailInterno(login, officeSlug)

    if (store.users.some((u) => u.email.toLowerCase() === email)) {
      throw new Error('Este usuário já está cadastrado nesta oficina.')
    }
    if (
      store.users.some(
        (u) =>
          u.office_id === requester.office_id &&
          u.login_username?.toLowerCase() === login
      )
    ) {
      throw new Error('Este login já está em uso na oficina.')
    }

    const agora = new Date().toISOString()
    const newUser: StoredUser = {
      id: gerarId(),
      email,
      nome: input.nome.trim(),
      office_id: requester.office_id,
      papel: input.papel,
      ativo: input.ativo,
      login_username: login,
      interno: true,
      office_slug: officeSlug,
      must_change_password: true,
      created_by: requester.id,
      password_hash: hashSenha(input.senha),
      created_at: agora,
      updated_at: agora,
    }

    store.users.push(newUser)
    salvarStore(store)
    return toAuthUser(newUser)
  }

  async redefinirSenhaInterno(
    requester: AuthUser,
    userId: string,
    novaSenha: string,
    nomeOficina?: string
  ): Promise<void> {
    void nomeOficina
    const store = carregarStore()
    const index = store.users.findIndex(
      (u) => u.id === userId && u.office_id === requester.office_id
    )
    if (index === -1) throw new Error('Usuário não encontrado.')

    const alvo = toAuthUser(store.users[index])
    if (!podeGerenciarUsuario(requester.papel, 'editar', alvo)) {
      throw new Error('Você não tem permissão para redefinir a senha.')
    }
    if (!alvo.interno) {
      throw new Error('Redefinição rápida disponível apenas para usuários internos.')
    }
    if (novaSenha.length < 6) throw new Error('A senha deve ter pelo menos 6 caracteres.')

    store.users[index].password_hash = hashSenha(novaSenha)
    store.users[index].must_change_password = true
    store.users[index].updated_at = new Date().toISOString()
    salvarStore(store)
  }

  async atualizarUsuario(
    requester: AuthUser,
    userId: string,
    patch: UsuarioUpdateInput
  ): Promise<AuthUser> {
    const store = carregarStore()
    const index = store.users.findIndex(
      (u) => u.id === userId && u.office_id === requester.office_id
    )

    if (index === -1) throw new Error('Usuário não encontrado.')

    const alvo = toAuthUser(store.users[index])

    if (!podeGerenciarUsuario(requester.papel, 'editar', alvo)) {
      throw new Error('Você não tem permissão para editar este usuário.')
    }

    if (patch.papel && !papeisDisponiveisParaAtribuir(requester.papel).includes(patch.papel)) {
      throw new Error('Você não pode atribuir este cargo.')
    }

    if (patch.email) {
      const email = patch.email.trim().toLowerCase()
      if (
        store.users.some((u) => u.id !== userId && u.email.toLowerCase() === email)
      ) {
        throw new Error('Este e-mail já está em uso.')
      }
      store.users[index].email = email
    }

    if (patch.nome) store.users[index].nome = patch.nome.trim()
    if (patch.papel) store.users[index].papel = patch.papel
    if (patch.ativo !== undefined) store.users[index].ativo = patch.ativo
    if (patch.senha) {
      if (patch.senha.length < 6) throw new Error('A senha deve ter pelo menos 6 caracteres.')
      store.users[index].password_hash = hashSenha(patch.senha)
    }

    store.users[index].updated_at = new Date().toISOString()
    if (patch.must_change_password !== undefined) {
      store.users[index].must_change_password = patch.must_change_password
    }
    sincronizarSessao(store, userId)
    salvarStore(store)
    return toAuthUser(store.users[index])
  }

  async excluirUsuario(requester: AuthUser, userId: string): Promise<void> {
    if (requester.id === userId) {
      throw new Error('Você não pode excluir sua própria conta.')
    }

    const store = carregarStore()
    const alvo = store.users.find(
      (u) => u.id === userId && u.office_id === requester.office_id
    )

    if (!alvo) throw new Error('Usuário não encontrado.')

    if (!podeGerenciarUsuario(requester.papel, 'excluir', toAuthUser(alvo))) {
      throw new Error('Você não tem permissão para excluir este usuário.')
    }

    store.users = store.users.filter((u) => u.id !== userId)
    salvarStore(store)
  }

  prepararConvite(
    requester: AuthUser,
    input: ConviteInput,
    nomeOficina?: string
  ): ConviteUsuario {
    if (!podeGerenciarUsuario(requester.papel, 'criar')) {
      throw new Error('Você não tem permissão para convidar usuários.')
    }
    if (!papeisDisponiveisParaAtribuir(requester.papel).includes(input.papel)) {
      throw new Error('Você não pode atribuir este cargo.')
    }

    const store = carregarStore()
    const email = input.email.trim().toLowerCase()
    if (store.users.some((u) => u.email.toLowerCase() === email)) {
      throw new Error('Este e-mail já pertence a um usuário da oficina.')
    }

    return convitesService.criarConvite(requester.office_id, input, {
      criado_por: requester.id,
      nome_oficina: nomeOficina,
    })
  }

  listarConvitesPendentes(officeId: string): ConviteUsuario[] {
    return convitesService.listarPendentes(officeId)
  }

  cancelarConvite(requester: AuthUser, conviteId: string): void {
    if (!podeGerenciarUsuario(requester.papel, 'criar')) {
      throw new Error('Você não tem permissão para cancelar convites.')
    }
    convitesService.cancelarConvite(requester.office_id, conviteId)
  }

  aceitarConvite(token: string, senha: string): AuthSession {
    const convite = convitesService.obterPorToken(token)
    if (!convite || convite.status !== 'pendente') {
      throw new Error('Convite inválido ou expirado.')
    }

    const store = carregarStore()
    const email = convite.email.toLowerCase()
    const existente = store.users.find((u) => u.email.toLowerCase() === email)

    if (existente) {
      if (existente.office_id !== convite.office_id) {
        throw new Error('Este e-mail já possui conta em outra oficina.')
      }
      convitesService.marcarAceito(token)
      return criarSessao(toAuthUser(existente))
    }

    if (!senha || senha.length < 6) {
      throw new Error('Informe uma senha com pelo menos 6 caracteres.')
    }

    const agora = new Date().toISOString()
    const newUser: StoredUser = {
      id: gerarId(),
      email,
      nome: convite.nome,
      office_id: convite.office_id,
      papel: convite.papel,
      ativo: true,
      password_hash: hashSenha(senha),
      created_at: agora,
      updated_at: agora,
    }

    store.users.push(newUser)
    salvarStore(store)
    convitesService.marcarAceito(token)

    return criarSessao(toAuthUser(newUser))
  }
}

export const localAuthService = new LocalAuthService()
