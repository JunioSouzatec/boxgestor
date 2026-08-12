/**
 * Edge Function: approval-link-respond (A2.1B)
 * Acesso: público via token. Usa service_role.
 *
 * - Aprova ou recusa o link (uma vez).
 * - NÃO altera status operacional da OS (service_orders.status).
 * - NÃO converte orçamento em OS.
 * - NÃO mexe em financeiro/estoque/caixa/pagamento.
 *
 * Envs: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (ou SUPABASE_SECRET_KEYS).
 * Ver: ../_shared/APPROVAL_LINKS_ENV.md
 *
 * Deploy (após autorização + migration):
 *   supabase functions deploy approval-link-respond
 */

import {
  adminClient,
  handleOptions,
  hashToken,
  jsonResponse,
} from '../_shared/approval-common.ts'

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

Deno.serve(async (req) => {
  const opt = handleOptions(req)
  if (opt) return opt

  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, erro: 'Método não permitido.' }, 405)
  }

  try {
    const body = (await req.json().catch(() => ({}))) as {
      token?: string
      action?: 'approve' | 'reject'
      response_name?: string
      response_note?: string
    }

    const token = body.token?.trim() || ''
    const action = body.action
    const responseName = body.response_name?.trim() || ''
    const responseNote = body.response_note?.trim() || ''

    if (!token || token.length < 32) {
      return jsonResponse({ ok: false, erro: 'Token inválido.' }, 400)
    }
    if (action !== 'approve' && action !== 'reject') {
      return jsonResponse({ ok: false, erro: 'action deve ser approve ou reject.' }, 400)
    }
    if (action === 'approve' && responseName.length < 2) {
      return jsonResponse({ ok: false, erro: 'Informe o nome do aprovador.' }, 400)
    }

    const tokenHash = await hashToken(token)
    const admin = adminClient()

    const { data: link, error: linkErr } = await admin
      .from('approval_links')
      .select('id, office_id, service_order_id, status, expires_at')
      .eq('token_hash', tokenHash)
      .maybeSingle()

    if (linkErr || !link) {
      return jsonResponse({ ok: false, erro: 'Link não encontrado.' }, 404)
    }

    if (link.status !== 'pending') {
      return jsonResponse({ ok: false, erro: 'Este link já foi respondido ou cancelado.', status: link.status }, 409)
    }

    if (new Date(link.expires_at).getTime() <= Date.now()) {
      await admin
        .from('approval_links')
        .update({ status: 'expired' })
        .eq('id', link.id)
        .eq('status', 'pending')
      return jsonResponse({ ok: false, erro: 'Este link expirou.', status: 'expired' }, 410)
    }

    const agora = new Date().toISOString()
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('cf-connecting-ip') ||
      null
    const ua = req.headers.get('user-agent') || null

    const patchLink =
      action === 'approve'
        ? {
            status: 'approved',
            approved_at: agora,
            response_name: responseName,
            response_note: responseNote || null,
            response_ip: ip,
            response_user_agent: ua,
          }
        : {
            status: 'rejected',
            rejected_at: agora,
            response_name: responseName || null,
            response_note: responseNote || null,
            response_ip: ip,
            response_user_agent: ua,
          }

    const { data: updated, error: updErr } = await admin
      .from('approval_links')
      .update(patchLink)
      .eq('id', link.id)
      .eq('status', 'pending')
      .select('id, status')
      .maybeSingle()

    if (updErr || !updated) {
      return jsonResponse({ ok: false, erro: 'Não foi possível registrar a resposta.' }, 409)
    }

    // Atualiza craft_meta + budget_status na OS, sem tocar em status operacional.
    const { data: os } = await admin
      .from('service_orders')
      .select('id, parts_used, budget_status')
      .eq('id', link.service_order_id)
      .eq('office_id', link.office_id)
      .maybeSingle()

    if (os) {
      const partsUsed = asRecord(os.parts_used) || { pecas: [], craft_meta: {} }
      const craftMeta = asRecord(partsUsed.craft_meta) || {}
      const aprovacao = asRecord(craftMeta.aprovacao_cliente) || {}
      const eventos = Array.isArray(aprovacao.eventos) ? [...aprovacao.eventos] : []
      eventos.push({
        id: crypto.randomUUID(),
        tipo: action === 'approve' ? 'aprovado' : 'recusado',
        em: agora,
        cliente_nome: responseName || undefined,
        observacao: responseNote || undefined,
        canal: 'link_publico',
      })

      craftMeta.aprovacao_cliente = {
        ...aprovacao,
        link_publico: 'ativo',
        canal_ultimo: 'link_publico',
        respondido_em: agora,
        cliente_nome: responseName || aprovacao.cliente_nome || null,
        cliente_observacao: action === 'approve' ? responseNote || null : null,
        motivo_recusa: action === 'reject' ? responseNote || null : null,
        eventos: eventos.slice(-30),
      }

      const historico = Array.isArray(craftMeta.historico_eventos)
        ? [...craftMeta.historico_eventos]
        : []
      historico.push({
        id: crypto.randomUUID(),
        tipo: action === 'approve' ? 'aprovacao_orcamento' : 'recusa_orcamento',
        titulo:
          action === 'approve'
            ? 'Orçamento aprovado pelo cliente (link público)'
            : 'Orçamento recusado pelo cliente (link público)',
        data_hora: agora,
        detalhe: [
          responseName ? `Nome: ${responseName}` : null,
          responseNote ? `Obs.: ${responseNote}` : null,
          'Status operacional da OS não foi alterado automaticamente.',
        ]
          .filter(Boolean)
          .join(' · '),
      })
      craftMeta.historico_eventos = historico

      partsUsed.craft_meta = craftMeta

      await admin
        .from('service_orders')
        .update({
          parts_used: partsUsed,
          budget_status: action === 'approve' ? 'aprovado' : 'recusado',
          // NÃO atualiza `status` operacional da OS.
        })
        .eq('id', os.id)
        .eq('office_id', link.office_id)
    }

    return jsonResponse({
      ok: true,
      status: updated.status,
      message:
        action === 'approve'
          ? 'Orçamento aprovado. A oficina foi informada.'
          : 'Orçamento recusado. A oficina foi informada.',
    })
  } catch (e) {
    console.error('[approval-link-respond]', e instanceof Error ? e.message : e)
    return jsonResponse({ ok: false, erro: 'Erro interno ao registrar resposta.' }, 500)
  }
})
