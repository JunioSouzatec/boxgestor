/**
 * Edge Function: approval-link-create (A2.1B + A3 tracking)
 * Acesso: authenticated (Bearer do usuário).
 * Gera token bruto (retorna 1x na URL) e persiste somente token_hash.
 *
 * portal_mode (metadata):
 *   - approval (default): orçamento com botões de aprovação
 *   - service_tracking: acompanhamento/fotos da OS (sem pedir aprovação)
 *
 * NÃO alterar status operacional da OS.
 * NÃO converter orçamento.
 * NÃO abrir service_orders para anon.
 * NÃO salvar token/token_hash/URL com token em craft_meta.
 */

import {
  adminClient,
  asRecord,
  gerarTokenBruto,
  handleOptions,
  hashToken,
  jsonResponse,
  mesclarAprovacaoClienteNoPartsUsed,
  resolverServiceOrderDaOficina,
  userClient,
  type PortalPublicMode,
} from '../_shared/approval-common.ts'

function normalizarPortalMode(raw: unknown): PortalPublicMode {
  const v = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
  if (
    v === 'service_tracking' ||
    v === 'photos' ||
    v === 'tracking' ||
    v === 'acompanhamento'
  ) {
    return 'service_tracking'
  }
  return 'approval'
}

function modoDoLinkMetadata(metadata: unknown): PortalPublicMode {
  const meta = asRecord(metadata) || {}
  return normalizarPortalMode(meta.portal_mode ?? meta.link_purpose)
}

/** Approval: curto (orçamento). Tracking: longo (acompanhamento da OS). */
const VALIDITY_APPROVAL_DEFAULT_DAYS = 7
const VALIDITY_APPROVAL_MAX_DAYS = 60
const VALIDITY_TRACKING_DEFAULT_DAYS = 180
const VALIDITY_TRACKING_MAX_DAYS = 180

function resolverValidityDays(
  portalMode: PortalPublicMode,
  raw?: number
): number {
  if (portalMode === 'service_tracking') {
    return Math.min(
      Math.max(Number(raw) || VALIDITY_TRACKING_DEFAULT_DAYS, 1),
      VALIDITY_TRACKING_MAX_DAYS
    )
  }
  return Math.min(
    Math.max(Number(raw) || VALIDITY_APPROVAL_DEFAULT_DAYS, 1),
    VALIDITY_APPROVAL_MAX_DAYS
  )
}

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
      portal_mode?: string
      link_purpose?: string
    }

    const serviceOrderRef = body.service_order_id?.trim()
    if (!serviceOrderRef) {
      return jsonResponse({ ok: false, erro: 'service_order_id obrigatório.' }, 400)
    }

    const portalMode = normalizarPortalMode(body.portal_mode ?? body.link_purpose)

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

    const validityDays = resolverValidityDays(portalMode, Number(body.validity_days))
    const expiresAt = body.expires_at?.trim()
      ? new Date(body.expires_at)
      : new Date(Date.now() + validityDays * 24 * 60 * 60 * 1000)

    if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
      return jsonResponse({ ok: false, erro: 'expires_at inválido.' }, 400)
    }

    // Cap de segurança: tracking não aceita expires_at > 180d; approval mantém ≤ 60d.
    const maxMs =
      (portalMode === 'service_tracking'
        ? VALIDITY_TRACKING_MAX_DAYS
        : VALIDITY_APPROVAL_MAX_DAYS) *
      24 *
      60 *
      60 *
      1000
    if (expiresAt.getTime() - Date.now() > maxMs + 60_000) {
      return jsonResponse(
        {
          ok: false,
          erro:
            portalMode === 'service_tracking'
              ? 'expires_at excede o máximo de 180 dias para acompanhamento.'
              : 'expires_at excede o máximo de 60 dias para aprovação.',
        },
        400
      )
    }

    // Revoga apenas links pending do MESMO portal_mode (não mistura aprovação ↔ acompanhamento).
    // Links tracking curtos anteriores: ao gerar de novo, revoga e cria longo (180d).
    // Token bruto não é reutilizável (só hash no banco) — sempre gera URL nova.
    const { data: pendingLinks } = await admin
      .from('approval_links')
      .select('id, metadata, expires_at, status')
      .eq('office_id', profile.office_id)
      .eq('service_order_id', os.id)
      .eq('status', 'pending')

    const idsParaRevogar = (pendingLinks ?? [])
      .filter((row) => modoDoLinkMetadata(row.metadata) === portalMode)
      .map((row) => row.id)
      .filter(Boolean)

    if (idsParaRevogar.length > 0) {
      await admin
        .from('approval_links')
        .update({ status: 'revoked', revoked_at: new Date().toISOString() })
        .in('id', idsParaRevogar)
        .eq('status', 'pending')
    }

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
          portal_mode: portalMode,
          link_purpose: portalMode,
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

    const historicoTitulo =
      portalMode === 'service_tracking'
        ? 'Link de acompanhamento do portal gerado'
        : 'Link seguro de aprovação gerado'
    const historicoDetalhe =
      portalMode === 'service_tracking'
        ? `Link de acompanhamento ${link.id} · expira em ${link.expires_at}. Token não é armazenado na OS.`
        : `Link ${link.id} · expira em ${link.expires_at}. Token não é armazenado na OS.`

    // Histórico + craft_meta leve (sem token bruto / hash / URL)
    const partsUsedAtualizado = mesclarAprovacaoClienteNoPartsUsed(os.parts_used, {
      link_id: link.id,
      gerado_em: agora,
      expira_em: link.expires_at,
      gerado_por: geradoPor,
      gerado_por_id: userData.user.id,
      historicoTitulo,
      historicoDetalhe,
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
    const path =
      portalMode === 'service_tracking'
        ? `/portal/${tokenBruto}`
        : `/aprovar-orcamento/${tokenBruto}`
    const url = origin ? `${origin.replace(/\/$/, '')}${path}` : path

    return jsonResponse({
      ok: true,
      link_id: link.id,
      status: link.status,
      expires_at: link.expires_at,
      created_at: link.created_at,
      service_order_id: os.id,
      portal_mode: portalMode,
      url,
      notice:
        'Guarde o link agora. O token não fica salvo no banco e não será exibido de novo.',
    })
  } catch (e) {
    console.error('[approval-link-create]', e instanceof Error ? e.message : e)
    return jsonResponse({ ok: false, erro: 'Erro interno ao criar link.' }, 500)
  }
})
