/**
 * Edge Function: approval-link-create (A2.1B)
 * Acesso: authenticated (Bearer do usuário).
 * Gera token bruto (retorna 1x na URL) e persiste somente token_hash.
 *
 * Envs necessárias (nunca commitar valores):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY  (ou SUPABASE_SECRET_KEYS JSON)
 *   SUPABASE_ANON_KEY          (ou SUPABASE_PUBLISHABLE_KEYS JSON) — valida sessão
 *   PUBLIC_APP_URL             — origem do front (ex.: https://boxgestor.vercel.app)
 *
 * Deploy (após autorização + migration aplicada):
 *   supabase functions deploy approval-link-create
 *
 * NÃO alterar status operacional da OS.
 * NÃO converter orçamento.
 * NÃO abrir service_orders para anon.
 * NÃO salvar token/token_hash/URL com token em craft_meta.
 */

import {
  adminClient,
  gerarTokenBruto,
  handleOptions,
  hashToken,
  jsonResponse,
  mesclarAprovacaoClienteNoPartsUsed,
  resolverServiceOrderDaOficina,
  userClient,
} from '../_shared/approval-common.ts'

Deno.serve(async (req) => {
  const opt = handleOptions(req)
  if (opt) return opt

  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, erro: 'Método não permitido.' }, 405)
  }

  try {
    const authHeader = req.headers.get('Authorization') || ''
    if (!authHeader.startsWith('Bearer ')) {
      return jsonResponse({ ok: false, erro: 'Não autenticado.' }, 401)
    }

    const body = (await req.json().catch(() => ({}))) as {
      service_order_id?: string
      service_order_number?: number | string
      validity_days?: number
      expires_at?: string
    }

    const serviceOrderRef = body.service_order_id?.trim()
    if (!serviceOrderRef) {
      return jsonResponse({ ok: false, erro: 'service_order_id obrigatório.' }, 400)
    }

    const userSb = userClient(authHeader)
    const { data: userData, error: userErr } = await userSb.auth.getUser()
    if (userErr || !userData.user) {
      return jsonResponse({ ok: false, erro: 'Sessão inválida.' }, 401)
    }

    const admin = adminClient()
    const { data: profile, error: profileErr } = await admin
      .from('profiles')
      .select('id, office_id, active, role, full_name')
      .eq('id', userData.user.id)
      .maybeSingle()

    if (profileErr || !profile?.office_id || profile.active === false) {
      return jsonResponse({ ok: false, erro: 'Perfil/oficina inválidos.' }, 403)
    }

    let os = await resolverServiceOrderDaOficina(
      admin,
      profile.office_id,
      serviceOrderRef
    )

    // Fallback: número da OS (útil quando id local do front ≠ craft_meta.local_id)
    if (!os && body.service_order_number != null) {
      const num = String(body.service_order_number).trim()
      if (/^\d+$/.test(num)) {
        os = await resolverServiceOrderDaOficina(admin, profile.office_id, num)
      }
    }

    if (!os) {
      return jsonResponse(
        { ok: false, erro: 'OS não encontrada para esta oficina.' },
        404
      )
    }

    const validityDays = Math.min(Math.max(Number(body.validity_days) || 7, 1), 60)
    const expiresAt = body.expires_at?.trim()
      ? new Date(body.expires_at)
      : new Date(Date.now() + validityDays * 24 * 60 * 60 * 1000)

    if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
      return jsonResponse({ ok: false, erro: 'expires_at inválido.' }, 400)
    }

    // Revoga links pending anteriores da mesma OS (não apaga histórico).
    await admin
      .from('approval_links')
      .update({ status: 'revoked', revoked_at: new Date().toISOString() })
      .eq('office_id', profile.office_id)
      .eq('service_order_id', os.id)
      .eq('status', 'pending')

    const tokenBruto = gerarTokenBruto()
    const tokenHash = await hashToken(tokenBruto)
    const agora = new Date().toISOString()
    const geradoPor =
      (typeof profile.full_name === 'string' && profile.full_name.trim()) ||
      userData.user.email ||
      'Usuário'

    const { data: link, error: insertErr } = await admin
      .from('approval_links')
      .insert({
        office_id: profile.office_id,
        service_order_id: os.id,
        token_hash: tokenHash,
        status: 'pending',
        expires_at: expiresAt.toISOString(),
        created_by: userData.user.id,
        metadata: {
          os_number: os.number,
          validity_days: validityDays,
          created_via: 'approval-link-create',
          // Sem token / hash / URL
        },
      })
      .select('id, status, expires_at, created_at')
      .single()

    if (insertErr || !link) {
      return jsonResponse(
        { ok: false, erro: insertErr?.message || 'Falha ao criar link.' },
        500
      )
    }

    // Histórico + craft_meta leve (sem token bruto / hash / URL)
    const partsUsedAtualizado = mesclarAprovacaoClienteNoPartsUsed(os.parts_used, {
      link_id: link.id,
      gerado_em: agora,
      expira_em: link.expires_at,
      gerado_por: geradoPor,
      gerado_por_id: userData.user.id,
      historicoTitulo: 'Link seguro de aprovação gerado',
      historicoDetalhe: `Link ${link.id} · expira em ${link.expires_at}. Token não é armazenado na OS.`,
    })

    const { error: osUpdErr } = await admin
      .from('service_orders')
      .update({ parts_used: partsUsedAtualizado })
      .eq('id', os.id)
      .eq('office_id', profile.office_id)

    if (osUpdErr) {
      console.error('[approval-link-create] histórico OS:', osUpdErr.message)
      // Link já criado; não falhar a resposta por meta (cliente ainda recebe URL)
    }

    const origin = Deno.env.get('PUBLIC_APP_URL')?.trim() || ''
    const path = `/aprovar-orcamento/${tokenBruto}`
    const url = origin ? `${origin.replace(/\/$/, '')}${path}` : path

    return jsonResponse({
      ok: true,
      link_id: link.id,
      status: link.status,
      expires_at: link.expires_at,
      created_at: link.created_at,
      service_order_id: os.id,
      url,
      notice:
        'Guarde o link agora. O token não fica salvo no banco e não será exibido de novo.',
    })
  } catch (e) {
    console.error('[approval-link-create]', e instanceof Error ? e.message : e)
    return jsonResponse({ ok: false, erro: 'Erro interno ao criar link.' }, 500)
  }
})
