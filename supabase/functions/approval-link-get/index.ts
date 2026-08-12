/**
 * Edge Function: approval-link-get (A2.1B)
 * Acesso: público (token no body/query). Usa service_role.
 * Retorna somente payload sanitizado. NÃO abre service_orders ao anon.
 *
 * Envs: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (ou SUPABASE_SECRET_KEYS).
 * Ver: ../_shared/APPROVAL_LINKS_ENV.md
 *
 * Deploy (após autorização + migration):
 *   supabase functions deploy approval-link-get
 */

import {
  adminClient,
  handleOptions,
  hashToken,
  jsonResponse,
  montarPayloadSanitizado,
  type ApprovalLinkStatus,
} from '../_shared/approval-common.ts'

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

Deno.serve(async (req) => {
  const opt = handleOptions(req)
  if (opt) return opt

  if (req.method !== 'GET' && req.method !== 'POST') {
    return jsonResponse({ ok: false, erro: 'Método não permitido.' }, 405)
  }

  try {
    let token = ''
    if (req.method === 'GET') {
      const url = new URL(req.url)
      token = url.searchParams.get('token')?.trim() || ''
    } else {
      const body = (await req.json().catch(() => ({}))) as { token?: string }
      token = body.token?.trim() || ''
    }

    if (!token || token.length < 32) {
      return jsonResponse({ ok: false, erro: 'Token inválido.' }, 400)
    }

    const tokenHash = await hashToken(token)
    const admin = adminClient()

    const { data: link, error: linkErr } = await admin
      .from('approval_links')
      .select(
        'id, office_id, service_order_id, status, expires_at, response_name, response_note'
      )
      .eq('token_hash', tokenHash)
      .maybeSingle()

    if (linkErr || !link) {
      return jsonResponse({ ok: false, erro: 'Link não encontrado.' }, 404)
    }

    const now = Date.now()
    const expiresAt = new Date(link.expires_at).getTime()
    let status = link.status as ApprovalLinkStatus

    if (status === 'pending' && expiresAt <= now) {
      status = 'expired'
      await admin
        .from('approval_links')
        .update({ status: 'expired' })
        .eq('id', link.id)
        .eq('status', 'pending')
    }

    if (status !== 'pending') {
      return jsonResponse({
        ok: false,
        erro:
          status === 'approved'
            ? 'Este orçamento já foi aprovado.'
            : status === 'rejected'
              ? 'Este orçamento já foi recusado.'
              : status === 'revoked'
                ? 'Este link foi cancelado pela oficina.'
                : 'Este link expirou.',
        status,
      }, 410)
    }

    const { data: os, error: osErr } = await admin
      .from('service_orders')
      .select(
        'id, number, discount, total_value, parts_value, labor_value, budget_date, parts_used, customer_id, motorcycle_id, office_id'
      )
      .eq('id', link.service_order_id)
      .eq('office_id', link.office_id)
      .maybeSingle()

    if (osErr || !os) {
      return jsonResponse({ ok: false, erro: 'Orçamento indisponível.' }, 404)
    }

    const [{ data: office }, { data: customer }, { data: moto }] = await Promise.all([
      admin.from('offices').select('id, name').eq('id', link.office_id).maybeSingle(),
      admin
        .from('customers')
        .select('id, name')
        .eq('id', os.customer_id)
        .eq('office_id', link.office_id)
        .maybeSingle(),
      admin
        .from('motorcycles')
        .select('id, brand, model, year, plate')
        .eq('id', os.motorcycle_id)
        .eq('office_id', link.office_id)
        .maybeSingle(),
    ])

    const partsUsed = asRecord(os.parts_used)
    const craftMeta = asRecord(partsUsed?.craft_meta)
    const pecasRaw = Array.isArray(partsUsed?.pecas) ? partsUsed!.pecas : []
    const servicosRaw = Array.isArray(craftMeta?.servicos_itens)
      ? craftMeta!.servicos_itens
      : []

    const services = (servicosRaw as unknown[]).map((s) => {
      const r = asRecord(s) || {}
      return {
        name: String(r.nome || r.name || 'Serviço'),
        labor_value: Number(r.valor_mao_obra ?? r.labor_value ?? 0) || 0,
      }
    })

    const parts = (pecasRaw as unknown[]).map((p) => {
      const r = asRecord(p) || {}
      return {
        name: String(r.nome || r.name || 'Peça'),
        quantity: Number(r.quantidade ?? r.quantity ?? 0) || 0,
        unit_price: Number(r.valor_unitario ?? r.unit_price ?? 0) || 0,
      }
    })

    const vehicleLabel = [moto?.brand, moto?.model, moto?.year].filter(Boolean).join(' ') || 'Veículo'
    const notes =
      typeof craftMeta?.observacoes_orcamento === 'string'
        ? craftMeta.observacoes_orcamento
        : null
    const validUntil =
      typeof craftMeta?.data_previsao === 'string' ? craftMeta.data_previsao : null

    await admin
      .from('approval_links')
      .update({ last_accessed_at: new Date().toISOString() })
      .eq('id', link.id)

    const payload = montarPayloadSanitizado({
      officeName: office?.name || 'Oficina',
      officeLogo: null,
      osNumber: os.number,
      customerName: customer?.name || 'Cliente',
      vehicleLabel,
      plate: moto?.plate ?? null,
      services,
      parts,
      discount: Number(os.discount) || 0,
      total: Number(os.total_value) || 0,
      notes,
      validUntil,
      status,
      expiresAt: link.expires_at,
    })

    return jsonResponse({ ok: true, dados: payload })
  } catch (e) {
    console.error('[approval-link-get]', e instanceof Error ? e.message : e)
    return jsonResponse({ ok: false, erro: 'Erro interno ao carregar orçamento.' }, 500)
  }
})
