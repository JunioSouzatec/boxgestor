// BoxGestor — Edge Function: administração segura de usuários internos
// Deploy: supabase functions deploy internal-user-admin
//
// Variáveis (automáticas ou secrets no Dashboard → Edge Functions):
//   SUPABASE_URL
//   SUPABASE_SECRET_KEYS (JSON, novo) ou SUPABASE_SERVICE_ROLE_KEY (legado)
//   SUPABASE_PUBLISHABLE_KEYS (JSON, novo) ou SUPABASE_ANON_KEY (legado)
//
// NUNCA coloque secret/service_role no front-end Vite.

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const PAPEL_MAP: Record<string, string> = {
  gerente: 'admin',
  mecanico: 'mecanico',
  recepcao: 'recepcionista',
}

const ROLE_TO_PAPEL: Record<string, string> = {
  admin: 'gerente',
  mecanico: 'mecanico',
  recepcionista: 'recepcao',
}

/** Extrai chave de JSON Supabase (default → primeira string) ou retorna null. */
function parseSupabaseKeyEnv(raw: string | undefined): string | null {
  const trimmed = raw?.trim()
  if (!trimmed) return null

  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return trimmed
  }

  try {
    const parsed: unknown = JSON.parse(trimmed)
    if (typeof parsed === 'string' && parsed.trim()) {
      return parsed.trim()
    }
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const obj = parsed as Record<string, unknown>
      if (typeof obj.default === 'string' && obj.default.trim()) {
        return obj.default.trim()
      }
      for (const value of Object.values(obj)) {
        if (typeof value === 'string' && value.trim()) {
          return value.trim()
        }
      }
    }
  } catch {
    /* JSON inválido — tentar legado abaixo */
  }

  return null
}

function getSupabaseAdminKey(): string | null {
  const fromSecrets = parseSupabaseKeyEnv(Deno.env.get('SUPABASE_SECRET_KEYS'))
  if (fromSecrets) return fromSecrets

  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim()
  return legacy || null
}

function getSupabasePublishableKey(): string | null {
  const fromPublishable = parseSupabaseKeyEnv(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS'))
  if (fromPublishable) return fromPublishable

  const legacy = Deno.env.get('SUPABASE_ANON_KEY')?.trim()
  return legacy || null
}

function getSupabaseUrl(): string | null {
  const url = Deno.env.get('SUPABASE_URL')?.trim()
  return url || null
}

async function isSystemAdminEmail(
  adminClient: SupabaseClient,
  email: string | undefined
): Promise<boolean> {
  const normalized = email?.trim().toLowerCase()
  if (!normalized) return false

  const { data, error } = await adminClient
    .from('system_admin_emails')
    .select('email')
    .eq('email', normalized)
    .maybeSingle()

  if (error) {
    console.warn('[internal-user-admin] system_admin_emails lookup failed')
    return false
  }

  return Boolean(data)
}

type RequesterProfile = {
  id: string
  office_id: string
  role: string
  active: boolean | null
  full_name?: string | null
  email?: string | null
}

async function podeGerenciarUsuariosInternos(
  adminClient: SupabaseClient,
  requester: RequesterProfile,
  authEmail: string | undefined
): Promise<boolean> {
  if (requester.active === false) return false
  if (requester.role === 'owner') return true
  return isSystemAdminEmail(adminClient, authEmail)
}

async function carregarPerfilInterno(
  adminClient: SupabaseClient,
  userId: string,
  officeId: string
) {
  const alvo = await carregarPerfilOficina(adminClient, userId, officeId)
  if (!alvo || !alvo.is_internal) return null
  return alvo
}

async function carregarPerfilOficina(
  adminClient: SupabaseClient,
  userId: string,
  officeId: string
) {
  const { data } = await adminClient
    .from('profiles')
    .select('id, is_internal, office_id, role, active, full_name, email')
    .eq('id', userId)
    .maybeSingle()

  if (!data || data.office_id !== officeId) {
    return null
  }

  return data
}

function profileToAuthUser(
  profile: Record<string, unknown>,
  papelFallback: string
): Record<string, unknown> {
  const role = String(profile.role ?? '')
  return {
    id: profile.id,
    email: profile.email,
    nome: profile.full_name,
    office_id: profile.office_id,
    papel: ROLE_TO_PAPEL[role] ?? papelFallback,
    ativo: profile.active,
    login_username: profile.login_username,
    interno: true,
    office_slug: profile.office_slug,
    must_change_password: profile.must_change_password,
    created_by: profile.created_by,
    created_at: profile.created_at,
    updated_at: profile.updated_at,
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = getSupabaseUrl()
    if (!supabaseUrl) {
      return json({ error: 'SUPABASE_URL não encontrada na Edge Function.' }, 500)
    }

    const adminKey = getSupabaseAdminKey()
    if (!adminKey) {
      return json(
        {
          error:
            'Admin key não encontrada na Edge Function. Verifique SUPABASE_SECRET_KEYS ou SUPABASE_SERVICE_ROLE_KEY.',
        },
        500
      )
    }

    const publishableKey = getSupabasePublishableKey()
    if (!publishableKey) {
      return json(
        {
          error:
            'Publishable key não encontrada na Edge Function. Verifique SUPABASE_PUBLISHABLE_KEYS ou SUPABASE_ANON_KEY.',
        },
        500
      )
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return json({ error: 'Não autenticado' }, 401)
    }

    const userClient = createClient(supabaseUrl, publishableKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const adminClient = createClient(supabaseUrl, adminKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const body = await req.json()
    const action = String(body.action ?? '')

    if (action === 'ping') {
      return json({ ok: true, configured: true })
    }

    const { data: authData, error: authError } = await userClient.auth.getUser()
    if (authError || !authData.user) {
      return json({ error: 'Não autenticado' }, 401)
    }

    const { data: requesterProfile, error: profileError } = await userClient
      .from('profiles')
      .select('id, office_id, role, active, full_name, email')
      .eq('id', authData.user.id)
      .maybeSingle()

    if (profileError || !requesterProfile) {
      return json({ error: 'Perfil não encontrado' }, 403)
    }

    const requester = requesterProfile as RequesterProfile
    const podeGerenciar = await podeGerenciarUsuariosInternos(
      adminClient,
      requester,
      authData.user.email
    )

    if (!podeGerenciar) {
      return json({ error: 'Somente o dono da oficina ou Admin Sistema pode gerenciar usuários internos' }, 403)
    }

    if (action === 'create') {
      const officeId = String(body.office_id ?? '')
      if (officeId !== requester.office_id) {
        return json({ error: 'Oficina inválida' }, 403)
      }

      const email = String(body.email ?? '').toLowerCase()
      const login = String(body.login_username ?? '').toLowerCase()
      const senha = String(body.senha ?? '')
      const nome = String(body.nome ?? '').trim()
      const papel = String(body.papel ?? 'mecanico')
      const officeSlug = String(body.office_slug ?? '')
      const ativo = body.ativo !== false

      if (!email || !login || senha.length < 6 || !nome) {
        return json({ error: 'Dados inválidos' }, 400)
      }

      const { data: created, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password: senha,
        email_confirm: true,
        user_metadata: { full_name: nome, internal_user: true },
      })

      if (createError || !created.user) {
        const msg = createError?.message ?? 'Erro ao criar usuário'
        return json({ error: msg.includes('already') ? 'Este usuário já existe.' : msg }, 400)
      }

      const role = PAPEL_MAP[papel] ?? 'mecanico'
      const now = new Date().toISOString()

      const { data: profile, error: insertError } = await adminClient
        .from('profiles')
        .upsert({
          id: created.user.id,
          office_id: officeId,
          full_name: nome,
          role,
          email,
          active: ativo,
          login_username: login,
          is_internal: true,
          office_slug: officeSlug,
          must_change_password: true,
          created_by: authData.user.id,
          created_at: now,
          updated_at: now,
        })
        .select('*')
        .single()

      if (insertError) {
        await adminClient.auth.admin.deleteUser(created.user.id)
        return json({ error: insertError.message }, 400)
      }

      if (officeSlug) {
        await adminClient.from('offices').update({ slug: officeSlug }).eq('id', officeId)
      }

      return json({
        user: profileToAuthUser(profile as Record<string, unknown>, papel),
      })
    }

    if (action === 'reset_password') {
      const officeId = String(body.office_id ?? '')
      const userId = String(body.user_id ?? '')
      const senha = String(body.senha ?? '')

      if (officeId !== requester.office_id) {
        return json({ error: 'Oficina inválida' }, 403)
      }
      if (senha.length < 6) {
        return json({ error: 'Senha inválida' }, 400)
      }

      const alvo = await carregarPerfilInterno(adminClient, userId, officeId)
      if (!alvo) {
        return json({ error: 'Usuário interno não encontrado' }, 404)
      }

      const { error: pwdError } = await adminClient.auth.admin.updateUserById(userId, {
        password: senha,
      })
      if (pwdError) return json({ error: pwdError.message }, 400)

      await adminClient
        .from('profiles')
        .update({
          must_change_password: body.must_change_password !== false,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId)

      return json({ ok: true })
    }

    if (action === 'set_active') {
      const officeId = String(body.office_id ?? requester.office_id)
      const userId = String(body.user_id ?? body.profile_id ?? '')
      const ativo =
        body.active !== undefined ? body.active !== false : body.ativo !== false

      if (!userId) {
        return json({ error: 'Informe o usuário' }, 400)
      }

      if (officeId !== requester.office_id) {
        return json({ error: 'Oficina inválida' }, 403)
      }

      if (!ativo && userId === authData.user.id) {
        return json({ error: 'Você não pode desativar sua própria conta.' }, 400)
      }

      const alvo = await carregarPerfilOficina(adminClient, userId, officeId)
      if (!alvo) {
        return json({ error: 'Usuário não encontrado nesta oficina.' }, 404)
      }

      if (!ativo && alvo.role === 'owner') {
        const { data: outrosDonos } = await adminClient
          .from('profiles')
          .select('id')
          .eq('office_id', officeId)
          .eq('role', 'owner')
          .eq('active', true)
          .neq('id', userId)
          .limit(1)

        if (!outrosDonos || outrosDonos.length === 0) {
          return json(
            { error: 'Não é possível desativar o último dono ativo da oficina.' },
            400
          )
        }
      }

      const { error: updateError } = await adminClient
        .from('profiles')
        .update({
          active: ativo,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId)

      if (updateError) return json({ error: updateError.message }, 400)

      return json({ ok: true, active: ativo, ativo })
    }

    if (action === 'update_role') {
      const officeId = String(body.office_id ?? '')
      const userId = String(body.user_id ?? '')
      const papel = String(body.papel ?? '')

      if (officeId !== requester.office_id) {
        return json({ error: 'Oficina inválida' }, 403)
      }

      const role = PAPEL_MAP[papel]
      if (!role) {
        return json({ error: 'Cargo inválido' }, 400)
      }

      const alvo = await carregarPerfilInterno(adminClient, userId, officeId)
      if (!alvo) {
        return json({ error: 'Usuário interno não encontrado' }, 404)
      }

      const { data: updated, error: updateError } = await adminClient
        .from('profiles')
        .update({
          role,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId)
        .select('*')
        .single()

      if (updateError) return json({ error: updateError.message }, 400)

      return json({
        ok: true,
        user: profileToAuthUser(updated as Record<string, unknown>, papel),
      })
    }

    return json({ error: 'Ação inválida' }, 400)
  } catch (e) {
    console.error('[internal-user-admin] Erro interno:', e instanceof Error ? e.message : e)
    return json({ error: e instanceof Error ? e.message : 'Erro interno' }, 500)
  }
})

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
