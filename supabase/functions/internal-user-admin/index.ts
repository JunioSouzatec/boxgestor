// BoxGestor — Edge Function: administração segura de usuários internos
// Deploy: supabase functions deploy internal-user-admin
// Secrets (Dashboard → Edge Functions): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// NUNCA coloque service_role no front-end Vite.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const PAPEL_MAP: Record<string, string> = {
  gerente: 'admin',
  mecanico: 'mecanico',
  recepcao: 'recepcionista',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    if (!supabaseUrl || !serviceKey) {
      return json({ error: 'Edge Function misconfigured' }, 500)
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return json({ error: 'Não autenticado' }, 401)
    }

    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: authHeader } },
    })
    const adminClient = createClient(supabaseUrl, serviceKey)

    const body = await req.json()
    const action = body.action as string

    if (action === 'ping') {
      return json({ ok: true })
    }

    const { data: authData, error: authError } = await userClient.auth.getUser()
    if (authError || !authData.user) {
      return json({ error: 'Não autenticado' }, 401)
    }

    const { data: requesterProfile, error: profileError } = await userClient
      .from('profiles')
      .select('*')
      .eq('id', authData.user.id)
      .maybeSingle()

    if (profileError || !requesterProfile) {
      return json({ error: 'Perfil não encontrado' }, 403)
    }

    if (requesterProfile.role !== 'owner' || requesterProfile.active === false) {
      return json({ error: 'Somente o dono da oficina pode gerenciar usuários internos' }, 403)
    }

    if (action === 'create') {
      const officeId = String(body.office_id ?? '')
      if (officeId !== requesterProfile.office_id) {
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
        user: {
          id: profile.id,
          email: profile.email,
          nome: profile.full_name,
          office_id: profile.office_id,
          papel,
          ativo: profile.active,
          login_username: profile.login_username,
          interno: true,
          office_slug: profile.office_slug,
          must_change_password: profile.must_change_password,
          created_by: profile.created_by,
          created_at: profile.created_at,
          updated_at: profile.updated_at,
        },
      })
    }

    if (action === 'reset_password') {
      const officeId = String(body.office_id ?? '')
      const userId = String(body.user_id ?? '')
      const senha = String(body.senha ?? '')

      if (officeId !== requesterProfile.office_id) {
        return json({ error: 'Oficina inválida' }, 403)
      }
      if (senha.length < 6) {
        return json({ error: 'Senha inválida' }, 400)
      }

      const { data: alvo } = await adminClient
        .from('profiles')
        .select('id, is_internal, office_id')
        .eq('id', userId)
        .maybeSingle()

      if (!alvo || alvo.office_id !== officeId || !alvo.is_internal) {
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

    return json({ error: 'Ação inválida' }, 400)
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Erro interno' }, 500)
  }
})

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
