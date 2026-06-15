/**
 * Funções seguras para testar Supabase Auth de forma isolada.
 * Não altera VITE_CRAFT_AUTH nem o login local do app.
 */
import { getCraftAuthMode, obterModoAuthLabel, type CraftAuthMode } from '@/lib/craft-auth'
import { getSupabaseClient } from '@/lib/supabase'
import { setupNovaOficinaTrial } from '@/services/assinatura/setup-nova-oficina.service'
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from '@/lib/supabase-env'
import {
  profileParaAuthUser,
  traduzirErroAuth,
  type ProfileRow,
} from '@/services/auth/supabase-auth.mappers'
import type { ResultadoTesteSupabase } from '@/services/supabase-connection.service'
import type { SupabaseDatabase } from '@/types/supabase'
import type { Session, User } from '@supabase/supabase-js'

export type OfficeRow = SupabaseDatabase['public']['Tables']['offices']['Row']

export type SituacaoSupabaseAuth =
  | 'nao_configurado'
  | 'sem_usuario'
  | 'usuario_sem_profile'
  | 'profile_sem_oficina'
  | 'completo'

export interface SupabaseEnvStatus {
  urlOk: boolean
  anonKeyOk: boolean
  configurado: boolean
  host?: string
}

export interface SupabaseAuthEstado {
  env: SupabaseEnvStatus
  authMode: CraftAuthMode
  authModeLabel: string
  sessao: {
    existe: boolean
    expiraEm?: string
  }
  usuario: Pick<User, 'id' | 'email'> | null
  profile: ProfileRow | null
  office: OfficeRow | null
  situacao: SituacaoSupabaseAuth
  mensagemStatus: string
}

export interface CriarOficinaSupabaseInput {
  nome_oficina: string
  telefone: string
  cidade: string
  estado: string
  nome_responsavel?: string
  email?: string
}

export interface ContaTesteSupabaseInput {
  email: string
  senha: string
  nome_responsavel?: string
}

export interface ResultadoOperacaoAuth {
  ok: boolean
  mensagem: string
  detalhe?: string
  estado?: SupabaseAuthEstado
}

/** Modo de auth do app (local ou supabase) — não confundir com sessão Supabase de teste */
export function getAuthMode(): CraftAuthMode {
  return getCraftAuthMode()
}

export function verificarEnvSupabase(): SupabaseEnvStatus {
  const urlOk = Boolean(supabaseUrl?.trim())
  const anonKeyOk = Boolean(supabaseAnonKey?.trim())
  let host: string | undefined
  if (urlOk) {
    try {
      host = new URL(supabaseUrl!.trim()).hostname
    } catch {
      host = supabaseUrl!.trim().slice(0, 32)
    }
  }
  return {
    urlOk,
    anonKeyOk,
    configurado: isSupabaseConfigured(),
    host,
  }
}

export async function getCurrentSupabaseSession(): Promise<Session | null> {
  const supabase = getSupabaseClient()
  if (!supabase) return null
  try {
    const { data, error } = await supabase.auth.getSession()
    if (error) {
      console.warn('[Supabase Auth Teste] Erro ao obter sessão:', error.message)
      return null
    }
    return data.session ?? null
  } catch (e) {
    console.warn('[Supabase Auth Teste] Falha ao obter sessão:', e)
    return null
  }
}

export async function getCurrentSupabaseUser(): Promise<User | null> {
  const session = await getCurrentSupabaseSession()
  return session?.user ?? null
}

export async function getCurrentProfile(userId?: string): Promise<ProfileRow | null> {
  const supabase = getSupabaseClient()
  if (!supabase) return null

  const id = userId ?? (await getCurrentSupabaseUser())?.id
  if (!id) return null

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (error) {
      console.warn('[Supabase Auth Teste] Erro ao buscar profile:', error.message)
      return null
    }

    return (data as ProfileRow | null) ?? null
  } catch (e) {
    console.warn('[Supabase Auth Teste] Falha ao buscar profile:', e)
    return null
  }
}

export async function getCurrentOffice(officeId?: string): Promise<OfficeRow | null> {
  const supabase = getSupabaseClient()
  if (!supabase) return null

  const id = officeId ?? (await getCurrentProfile())?.office_id
  if (!id?.trim()) return null

  try {
    const { data, error } = await supabase
      .from('offices')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (error) {
      console.warn('[Supabase Auth Teste] Erro ao buscar oficina:', error.message)
      return null
    }

    return (data as OfficeRow | null) ?? null
  } catch (e) {
    console.warn('[Supabase Auth Teste] Falha ao buscar oficina:', e)
    return null
  }
}

function calcularSituacao(
  env: SupabaseEnvStatus,
  usuario: User | null,
  profile: ProfileRow | null,
  office: OfficeRow | null
): { situacao: SituacaoSupabaseAuth; mensagemStatus: string } {
  if (!env.configurado) {
    return {
      situacao: 'nao_configurado',
      mensagemStatus: 'Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY em .env.local.',
    }
  }
  if (!usuario) {
    return {
      situacao: 'sem_usuario',
      mensagemStatus: 'Nenhum usuário Supabase logado.',
    }
  }
  if (!profile) {
    return {
      situacao: 'usuario_sem_profile',
      mensagemStatus: 'Usuário sem perfil. Criar perfil.',
    }
  }
  if (!profile.office_id?.trim() || !office) {
    return {
      situacao: 'profile_sem_oficina',
      mensagemStatus: 'Usuário sem oficina. Criar oficina.',
    }
  }
  return {
    situacao: 'completo',
    mensagemStatus: 'Usuário, perfil e oficina vinculados corretamente.',
  }
}

export async function carregarEstadoSupabaseAuth(): Promise<SupabaseAuthEstado> {
  const env = verificarEnvSupabase()
  const authMode = getAuthMode()
  const session = await getCurrentSupabaseSession()
  const usuario = session?.user ?? null
  const profile = usuario ? await getCurrentProfile(usuario.id) : null
  const office = profile?.office_id
    ? await getCurrentOffice(profile.office_id)
    : null
  const { situacao, mensagemStatus } = calcularSituacao(env, usuario, profile, office)

  return {
    env,
    authMode,
    authModeLabel: obterModoAuthLabel(),
    sessao: {
      existe: Boolean(session),
      expiraEm: session?.expires_at
        ? new Date(session.expires_at * 1000).toLocaleString('pt-BR')
        : undefined,
    },
    usuario: usuario
      ? { id: usuario.id, email: usuario.email ?? undefined }
      : null,
    profile,
    office,
    situacao,
    mensagemStatus,
  }
}

export async function testarConexaoSupabaseAuth(): Promise<ResultadoTesteSupabase> {
  const env = verificarEnvSupabase()
  if (!env.urlOk) {
    return {
      ok: false,
      mensagem: 'VITE_SUPABASE_URL não definida.',
      detalhe: 'Adicione a URL do projeto em .env.local e reinicie o servidor.',
    }
  }
  if (!env.anonKeyOk) {
    return {
      ok: false,
      mensagem: 'VITE_SUPABASE_ANON_KEY não definida.',
      detalhe: 'Adicione a chave anon em .env.local e reinicie o servidor.',
    }
  }

  const supabase = getSupabaseClient()
  if (!supabase) {
    return { ok: false, mensagem: 'Não foi possível inicializar o cliente Supabase.' }
  }

  try {
    const { data, error } = await supabase.auth.getSession()
    if (error) {
      return {
        ok: false,
        mensagem: 'Supabase Auth não respondeu corretamente.',
        detalhe: traduzirErroAuth(error.message),
      }
    }

    return {
      ok: true,
      mensagem: 'Supabase Auth conectado.',
      detalhe: data.session
        ? `Sessão ativa para ${data.session.user.email ?? data.session.user.id}.`
        : 'Nenhuma sessão ativa — normal antes do login de teste.',
    }
  } catch (err) {
    return {
      ok: false,
      mensagem: 'Falha ao contactar Supabase Auth.',
      detalhe: err instanceof Error ? err.message : 'Erro desconhecido',
    }
  }
}

export async function criarContaTesteSupabase(
  input: ContaTesteSupabaseInput
): Promise<ResultadoOperacaoAuth> {
  const supabase = getSupabaseClient()
  if (!supabase) {
    return { ok: false, mensagem: 'Supabase não configurado.' }
  }

  const email = input.email.trim().toLowerCase()
  if (!email || input.senha.length < 6) {
    return { ok: false, mensagem: 'Informe e-mail válido e senha com pelo menos 6 caracteres.' }
  }

  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password: input.senha,
      options: {
        data: { full_name: input.nome_responsavel?.trim() || 'Usuário Teste' },
      },
    })

    if (error) {
      return { ok: false, mensagem: traduzirErroAuth(error.message) }
    }

    if (!data.user?.id) {
      return { ok: false, mensagem: 'Não foi possível criar a conta de teste.' }
    }

    const estado = await carregarEstadoSupabaseAuth()

    if (!data.session) {
      return {
        ok: true,
        mensagem:
          'Conta criada! Se a confirmação de e-mail estiver ativa no Supabase, confirme antes de entrar.',
        detalhe: `ID: ${data.user.id}`,
        estado,
      }
    }

    return {
      ok: true,
      mensagem: 'Conta de teste criada e sessão Supabase iniciada.',
      detalhe: `E-mail: ${email}`,
      estado,
    }
  } catch (e) {
    return {
      ok: false,
      mensagem: 'Erro ao criar conta de teste.',
      detalhe: e instanceof Error ? e.message : undefined,
    }
  }
}

export async function entrarContaTesteSupabase(
  input: Pick<ContaTesteSupabaseInput, 'email' | 'senha'>
): Promise<ResultadoOperacaoAuth> {
  const supabase = getSupabaseClient()
  if (!supabase) {
    return { ok: false, mensagem: 'Supabase não configurado.' }
  }

  const email = input.email.trim().toLowerCase()
  if (!email || !input.senha) {
    return { ok: false, mensagem: 'Informe e-mail e senha.' }
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: input.senha,
    })

    if (error) {
      return { ok: false, mensagem: traduzirErroAuth(error.message) }
    }

    if (!data.session?.user) {
      return { ok: false, mensagem: 'Login não retornou sessão válida.' }
    }

    const estado = await carregarEstadoSupabaseAuth()
    const profile = estado.profile
    const detalhe = profile
      ? `Perfil: ${profile.full_name} (${profileParaAuthUser(profile, email).papel})`
      : 'Login OK — perfil ainda não criado. Use "Criar oficina" abaixo.'

    return {
      ok: true,
      mensagem: 'Login Supabase realizado com sucesso.',
      detalhe,
      estado,
    }
  } catch (e) {
    return {
      ok: false,
      mensagem: 'Erro ao entrar com conta de teste.',
      detalhe: e instanceof Error ? e.message : undefined,
    }
  }
}

export async function sairContaSupabase(): Promise<ResultadoOperacaoAuth> {
  const supabase = getSupabaseClient()
  if (!supabase) {
    return { ok: false, mensagem: 'Supabase não configurado.' }
  }

  try {
    const { error } = await supabase.auth.signOut()
    if (error) {
      return { ok: false, mensagem: traduzirErroAuth(error.message) }
    }

    const estado = await carregarEstadoSupabaseAuth()
    return {
      ok: true,
      mensagem: 'Sessão Supabase encerrada. O login local do app não foi alterado.',
      estado,
    }
  } catch (e) {
    return {
      ok: false,
      mensagem: 'Erro ao sair da conta Supabase.',
      detalhe: e instanceof Error ? e.message : undefined,
    }
  }
}

export async function ensureProfileForUser(options?: {
  userId?: string
  fullName?: string
  email?: string
}): Promise<{ ok: boolean; profile?: ProfileRow; mensagem: string }> {
  const user = options?.userId
    ? { id: options.userId }
    : await getCurrentSupabaseUser()

  if (!user?.id) {
    return { ok: false, mensagem: 'Nenhum usuário Supabase logado.' }
  }

  const existing = await getCurrentProfile(user.id)
  if (existing) {
    return { ok: true, profile: existing, mensagem: 'Perfil encontrado.' }
  }

  void options?.fullName
  void options?.email

  return {
    ok: false,
    mensagem:
      'Usuário sem perfil. Crie a oficina abaixo — o perfil (cargo Dono) será criado automaticamente.',
  }
}

export async function ensureOfficeForUser(
  input: CriarOficinaSupabaseInput
): Promise<{
  ok: boolean
  officeId?: string
  profile?: ProfileRow
  office?: OfficeRow
  mensagem: string
}> {
  const supabase = getSupabaseClient()
  if (!supabase) {
    return { ok: false, mensagem: 'Supabase não configurado.' }
  }

  const user = await getCurrentSupabaseUser()
  if (!user) {
    return { ok: false, mensagem: 'Nenhum usuário Supabase logado.' }
  }

  if (!input.nome_oficina.trim()) {
    return { ok: false, mensagem: 'Informe o nome da oficina.' }
  }

  const profile = await getCurrentProfile(user.id)
  if (profile?.office_id) {
    const office = await getCurrentOffice(profile.office_id)
    if (office) {
      return {
        ok: true,
        officeId: profile.office_id,
        profile,
        office,
        mensagem: 'Oficina já vinculada a este usuário.',
      }
    }
    return {
      ok: false,
      mensagem:
        'Perfil existe, mas a oficina não foi encontrada. Verifique a tabela offices no Supabase.',
    }
  }

  const email = input.email?.trim() || user.email || ''
  const nome =
    input.nome_responsavel?.trim() ||
    (typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : '') ||
    'Responsável'

  try {
    const { data: officeId, error } = await supabase.rpc('create_office_for_new_user', {
      p_office_name: input.nome_oficina.trim(),
      p_phone: input.telefone.trim(),
      p_city: input.cidade.trim(),
      p_state: input.estado.trim(),
      p_full_name: nome,
      p_email: email,
    } as never)

    if (error) {
      const msg = error.message.includes('profile already exists')
        ? 'Perfil já existe. Use "Verificar perfil" e "Verificar oficina vinculada".'
        : traduzirErroAuth(error.message)
      return {
        ok: false,
        mensagem: `Não foi possível criar oficina: ${msg}. Execute docs/supabase-auth-rls.sql se a RPC não existir.`,
      }
    }

    const officeIdStr = String(officeId)
    const newProfile = await getCurrentProfile(user.id)
    const office = await getCurrentOffice(officeIdStr)

    setupNovaOficinaTrial(officeIdStr, {
      nome_oficina: input.nome_oficina.trim(),
      telefone: input.telefone.trim(),
      whatsapp: input.telefone.trim(),
      cidade: input.cidade.trim(),
      estado: input.estado.trim(),
      email: email,
    })

    return {
      ok: true,
      officeId: officeIdStr,
      profile: newProfile ?? undefined,
      office: office ?? undefined,
      mensagem: 'Oficina criada, perfil vinculado com cargo Dono (owner).',
    }
  } catch (e) {
    return {
      ok: false,
      mensagem: e instanceof Error ? `Erro ao criar oficina: ${e.message}` : 'Erro ao criar oficina.',
    }
  }
}

export async function verificarPerfilSupabase(): Promise<ResultadoOperacaoAuth> {
  const user = await getCurrentSupabaseUser()
  if (!user) {
    return {
      ok: false,
      mensagem: 'Nenhum usuário Supabase logado.',
      estado: await carregarEstadoSupabaseAuth(),
    }
  }

  const result = await ensureProfileForUser({
    userId: user.id,
    email: user.email,
  })

  const estado = await carregarEstadoSupabaseAuth()
  return {
    ok: result.ok,
    mensagem: result.mensagem,
    detalhe: result.profile
      ? `Cargo: ${profileParaAuthUser(result.profile, user.email ?? '').papel} · Office ID: ${result.profile.office_id}`
      : undefined,
    estado,
  }
}

export async function verificarOficinaSupabase(): Promise<ResultadoOperacaoAuth> {
  const user = await getCurrentSupabaseUser()
  if (!user) {
    return {
      ok: false,
      mensagem: 'Nenhum usuário Supabase logado.',
      estado: await carregarEstadoSupabaseAuth(),
    }
  }

  const profile = await getCurrentProfile(user.id)
  if (!profile) {
    return {
      ok: false,
      mensagem: 'Usuário sem perfil. Criar perfil.',
      estado: await carregarEstadoSupabaseAuth(),
    }
  }

  const office = await getCurrentOffice(profile.office_id)
  const estado = await carregarEstadoSupabaseAuth()

  if (!office) {
    return {
      ok: false,
      mensagem: 'Usuário sem oficina. Criar oficina.',
      estado,
    }
  }

  return {
    ok: true,
    mensagem: 'Oficina vinculada encontrada.',
    detalhe: `${office.name} · ${office.phone || 'sem telefone'} · ${office.address || '—'}`,
    estado,
  }
}
