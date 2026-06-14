import { dadosIniciais } from '@/data/seed'
import { migrateDatabase } from '@/services/database-migration.service'
import { localCraftRepository } from '@/services/repository/local.repository'
import { assinaturaService } from '@/services/assinatura/assinatura.service'
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
import type { CraftDatabase } from '@/types/database'
import { gerarId } from '@/lib/utils'

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
    email: 'admin@craft.com',
    nome: 'Admin Craft Sistema',
    office_id: OFFICE_ID,
    papel: 'dono',
    admin_sistema: true,
    ativo: true,
    password_hash: hashSenha('craft-admin'),
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
  return user
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
    const email = input.email.trim().toLowerCase()
    const user = store.users.find((u) => u.email.toLowerCase() === email)

    if (!user || user.password_hash !== hashSenha(input.senha)) {
      throw new Error('E-mail ou senha incorretos.')
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
    const store = carregarStore()
    const email = input.email.trim().toLowerCase()

    if (store.users.some((u) => u.email.toLowerCase() === email)) {
      throw new Error('Este e-mail já está cadastrado.')
    }

    if (input.senha.length < 6) {
      throw new Error('A senha deve ter pelo menos 6 caracteres.')
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

    const configuracao: CraftDatabase['configuracao'] = {
      id: officeId,
      oficina_id: officeId,
      office_id: officeId,
      nome: input.nome_oficina.trim(),
      endereco: input.endereco?.trim() || [input.cidade, input.estado].filter(Boolean).join(' - ') || '—',
      telefone: input.telefone.trim(),
      cnpj: input.cnpj?.trim() || undefined,
      preferencias: {
        tema_escuro: true,
        notificacoes: true,
        alerta_estoque_baixo: true,
      },
    }

    const database = criarDatabaseVazia(officeId, configuracao)
    localCraftRepository.salvar(officeId, database)
    assinaturaService.definirPlano(officeId, 'trial')

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
}

export const localAuthService = new LocalAuthService()
