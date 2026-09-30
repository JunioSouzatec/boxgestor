/**
 * Edge Function: approval-link-respond (A2.5 — parcial)
 * Acesso: público via token. Usa service_role.
 *
 * - Aprova (total), parcial ou recusa o link (uma vez).
 * - NÃO altera status operacional da OS (service_orders.status).
 * - NÃO converte orçamento em OS.
 * - NÃO mexe em financeiro/estoque/caixa/pagamento.
 *
 * Envs: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (ou SUPABASE_SECRET_KEYS).
 *
 * Deploy:
 *   supabase functions deploy approval-link-respond
 */

import {
  adminClient,
  asRecord,
  aplicarApprovalPatchOs,
  catalogarItensOsParaAprovacao,
  handleOptions,
  hashToken,
  idsEventosAprovacaoPorLink,
  jsonResponse,
  type OsItemCatalogo,
} from '../_shared/approval-common.ts'

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

type Action = 'approve' | 'reject' | 'partial'
type Decision = 'approved' | 'rejected'

type ItemDecisionInput = {
  item_key?: string
  decision?: string
}

type ItemDecisionSaved = {
  item_key: string
  tipo: 'service' | 'part'
  descricao: string
  quantidade: number
  valor_unitario: number
  subtotal: number
  decision: Decision
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function montarDecisoes(
  catalogo: OsItemCatalogo[],
  action: Action,
  rawItems: ItemDecisionInput[] | undefined
): { ok: true; items: ItemDecisionSaved[]; approvalType: 'total' | 'partial' | 'rejected' } | {
  ok: false
  erro: string
} {
  const byKey = new Map(catalogo.map((i) => [i.item_key, i]))

  if (action === 'approve') {
    const items: ItemDecisionSaved[] = catalogo.map((i) => ({
      ...i,
      decision: 'approved',
    }))
    return { ok: true, items, approvalType: 'total' }
  }

  if (action === 'reject') {
    const items: ItemDecisionSaved[] = catalogo.map((i) => ({
      ...i,
      decision: 'rejected',
    }))
    return { ok: true, items, approvalType: 'rejected' }
  }

  // partial
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return { ok: false, erro: 'Envie a seleção de itens para aprovação parcial.' }
  }

  const decisoes = new Map<string, Decision>()
  for (const raw of rawItems) {
    const key = typeof raw.item_key === 'string' ? raw.item_key.trim() : ''
    const dec = raw.decision === 'approved' || raw.decision === 'rejected' ? raw.decision : null
    if (!key || !dec) {
      return { ok: false, erro: 'Cada item precisa de item_key e decision (approved|rejected).' }
    }
    if (!byKey.has(key)) {
      return { ok: false, erro: 'Item inválido na seleção.' }
    }
    decisoes.set(key, dec)
  }

  // Exigir decisão para todos os itens do orçamento
  for (const item of catalogo) {
    if (!decisoes.has(item.item_key)) {
      return { ok: false, erro: 'Todos os itens precisam de decisão na aprovação parcial.' }
    }
  }

  // Rejeitar chaves extras (já filtrado por byKey.has)
  const items: ItemDecisionSaved[] = catalogo.map((i) => ({
    ...i,
    decision: decisoes.get(i.item_key)!,
  }))

  const allApproved = items.every((i) => i.decision === 'approved')
  const allRejected = items.every((i) => i.decision === 'rejected')
  if (allApproved) return { ok: true, items, approvalType: 'total' }
  if (allRejected) return { ok: true, items, approvalType: 'rejected' }
  return { ok: true, items, approvalType: 'partial' }
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
      action?: Action
      response_name?: string
      response_note?: string
      items_decision?: ItemDecisionInput[]
    }

    const token = body.token?.trim() || ''
    const action = body.action
    const responseName = body.response_name?.trim() || ''
    const responseNote = body.response_note?.trim() || ''

    if (!token || token.length < 32) {
      return jsonResponse({ ok: false, erro: 'Token inválido.' }, 400)
    }
    if (action !== 'approve' && action !== 'reject' && action !== 'partial') {
      return jsonResponse({ ok: false, erro: 'action deve ser approve, reject ou partial.' }, 400)
    }
    if ((action === 'approve' || action === 'partial') && responseName.length < 2) {
      return jsonResponse({ ok: false, erro: 'Informe o nome do aprovador.' }, 400)
    }
    if (action === 'reject' && responseName.length < 2) {
      return jsonResponse({ ok: false, erro: 'Informe o nome.' }, 400)
    }

    const tokenHash = await hashToken(token)
    const admin = adminClient()

    const { data: link, error: linkErr } = await admin
      .from('approval_links')
      .select('id, office_id, service_order_id, status, expires_at, metadata')
      .eq('token_hash', tokenHash)
      .maybeSingle()

    if (linkErr || !link) {
      return jsonResponse({ ok: false, erro: 'Link não encontrado.' }, 404)
    }

    if (link.status !== 'pending') {
      if (link.status === 'expired') {
        return jsonResponse({ ok: false, erro: 'Este link expirou.', status: 'expired' }, 410)
      }
      return jsonResponse(
        { ok: false, erro: 'Este link já foi respondido ou cancelado.', status: link.status },
        409
      )
    }

    const linkMeta = asRecord(link.metadata) || {}
    const portalModeRaw =
      (typeof linkMeta.portal_mode === 'string' && linkMeta.portal_mode) ||
      (typeof linkMeta.link_purpose === 'string' && linkMeta.link_purpose) ||
      ''
    const portalModeNorm = portalModeRaw.trim().toLowerCase()
    if (
      portalModeNorm === 'service_tracking' ||
      portalModeNorm === 'photos' ||
      portalModeNorm === 'tracking' ||
      portalModeNorm === 'acompanhamento'
    ) {
      return jsonResponse(
        {
          ok: false,
          erro: 'Este link é só para acompanhamento e não aceita aprovação.',
          status: 'pending',
          portal_mode: 'service_tracking',
        },
        403
      )
    }

    const { data: os } = await admin
      .from('service_orders')
      .select('id, parts_used, budget_status, total_value')
      .eq('id', link.service_order_id)
      .eq('office_id', link.office_id)
      .maybeSingle()

    if (!os) {
      return jsonResponse({ ok: false, erro: 'Orçamento indisponível.' }, 404)
    }

    const catalogo = catalogarItensOsParaAprovacao(os.parts_used)
    const montado = montarDecisoes(catalogo, action, body.items_decision)
    if (!montado.ok) {
      return jsonResponse({ ok: false, erro: montado.erro }, 400)
    }

    const { items, approvalType } = montado
    const totalApproved = round2(
      items.filter((i) => i.decision === 'approved').reduce((s, i) => s + i.subtotal, 0)
    )
    const totalRejected = round2(
      items.filter((i) => i.decision === 'rejected').reduce((s, i) => s + i.subtotal, 0)
    )
    // Aprovação total: usar total da OS (inclui desconto). Parcial: soma dos itens (sem confiar no cliente).
    const totalApprovedFinal =
      approvalType === 'total'
        ? round2(Number(os.total_value) || totalApproved)
        : approvalType === 'rejected'
          ? 0
          : totalApproved
    const totalRejectedFinal = approvalType === 'total' ? 0 : totalRejected

    const agora = new Date().toISOString()
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('cf-connecting-ip') ||
      null
    const ua = req.headers.get('user-agent') || null

    const linkStatus = approvalType === 'rejected' ? 'rejected' : 'approved'
    const linkMetadata = {
      approval_type: approvalType,
      items_decision: items,
      total_approved: totalApprovedFinal,
      total_rejected: totalRejectedFinal,
      responded_at: agora,
    }

    const partsUsed = asRecord(os.parts_used) || { pecas: [], craft_meta: {} }
    const craftMeta = asRecord(partsUsed.craft_meta) || {}
    const aprovacao = asRecord(craftMeta.aprovacao_cliente) || {}

    const qtdAprov = items.filter((i) => i.decision === 'approved').length
    const qtdRec = items.filter((i) => i.decision === 'rejected').length

    const tipoEvento =
      approvalType === 'rejected'
        ? 'recusado'
        : approvalType === 'partial'
          ? 'aprovado_parcial'
          : 'aprovado'

    const idsEvt = idsEventosAprovacaoPorLink(String(link.id))

    const aprovacaoPatch = {
      link_publico: 'ativo',
      canal_ultimo: 'link_publico',
      status:
        approvalType === 'rejected'
          ? 'recusado'
          : approvalType === 'partial'
            ? 'aprovado_parcialmente'
            : 'aprovado',
      respondido_em: agora,
      cliente_nome: responseName || aprovacao.cliente_nome || null,
      cliente_observacao: approvalType === 'rejected' ? null : responseNote || null,
      motivo_recusa: approvalType === 'rejected' ? responseNote || null : null,
      approval_type: approvalType,
      items_decision: items,
      total_approved: totalApprovedFinal,
      total_rejected: totalRejectedFinal,
    }

    const evento = {
      id: idsEvt.eventoId,
      tipo: tipoEvento,
      em: agora,
      cliente_nome: responseName || undefined,
      observacao: responseNote || undefined,
      canal: 'link_publico',
    }

    const tituloHist =
      approvalType === 'rejected'
        ? 'Orçamento recusado pelo cliente (link público)'
        : approvalType === 'partial'
          ? 'Orçamento aprovado parcialmente pelo link'
          : 'Orçamento aprovado pelo cliente (link público)'

    const historico = {
      id: idsEvt.historicoId,
      tipo:
        approvalType === 'rejected'
          ? 'recusa_orcamento'
          : approvalType === 'partial'
            ? 'aprovacao_orcamento_parcial'
            : 'aprovacao_orcamento',
      titulo: tituloHist,
      data_hora: agora,
      detalhe: [
        responseName ? `Nome: ${responseName}` : null,
        responseNote ? `Obs.: ${responseNote}` : null,
        approvalType === 'partial'
          ? `Itens: ${qtdAprov} aprovado(s), ${qtdRec} recusado(s)`
          : null,
        approvalType !== 'rejected'
          ? `Total aprovado: R$ ${totalApprovedFinal.toFixed(2)}`
          : null,
        approvalType === 'partial' || approvalType === 'rejected'
          ? `Total recusado: R$ ${totalRejectedFinal.toFixed(2)}`
          : null,
        'Status operacional da OS não foi alterado automaticamente.',
      ]
        .filter(Boolean)
        .join(' · '),
    }

    // Enum budget_status não tem aprovado_parcialmente → usa aprovado + approval_type no meta.
    const budgetStatus = approvalType === 'rejected' ? 'recusado' : 'aprovado'

    // Uma RPC: lock do link + merge da OS + fechamento do link, na mesma transação.
    const osPatch = await aplicarApprovalPatchOs(admin, {
      officeId: link.office_id,
      serviceOrderId: os.id,
      linkId: link.id,
      kind: 'client_response',
      budgetStatus,
      aprovacaoPatch,
      evento,
      historico,
      tokenHash,
      linkStatus,
      responseName,
      responseNote: responseNote || null,
      responseIp: ip,
      responseUserAgent: ua,
      linkMetadata,
    })

    if (!osPatch.ok) {
      console.error('[approval-link-respond] patch OS:', osPatch.erro)
      return jsonResponse(
        { ok: false, erro: 'Não foi possível gravar a aprovação na OS.' },
        500
      )
    }

    if (osPatch.status === 'already_responded' || osPatch.status === 'already_applied') {
      return jsonResponse(
        {
          ok: false,
          erro: 'Este link já foi respondido ou cancelado.',
          status: osPatch.linkStatus || 'pending',
        },
        409
      )
    }

    if (osPatch.status === 'expired') {
      return jsonResponse({ ok: false, erro: 'Este link expirou.', status: 'expired' }, 410)
    }

    if (osPatch.status === 'invalid_link' && osPatch.reason === 'tracking') {
      return jsonResponse(
        {
          ok: false,
          erro: 'Este link é só para acompanhamento e não aceita aprovação.',
          status: 'pending',
          portal_mode: 'service_tracking',
        },
        403
      )
    }

    if (osPatch.status === 'not_found' || osPatch.status === 'invalid_link') {
      return jsonResponse(
        {
          ok: false,
          erro: osPatch.reason === 'service_order' ? 'Orçamento indisponível.' : 'Link não encontrado.',
        },
        404
      )
    }

    if (osPatch.status !== 'applied') {
      return jsonResponse({ ok: false, erro: 'Não foi possível registrar a resposta.' }, 409)
    }

    const message =
      approvalType === 'rejected'
        ? 'Orçamento recusado. A oficina foi informada.'
        : approvalType === 'partial'
          ? 'Aprovação parcial registrada. A oficina foi informada.'
          : 'Orçamento aprovado. A oficina foi informada.'

    return jsonResponse({
      ok: true,
      status: osPatch.linkStatus || linkStatus,
      approval_type: approvalType,
      total_approved: totalApprovedFinal,
      total_rejected: totalRejectedFinal,
      message,
      revision: osPatch.revision,
    })
  } catch (e) {
    console.error('[approval-link-respond]', e instanceof Error ? e.message : e)
    return jsonResponse({ ok: false, erro: 'Erro interno ao registrar resposta.' }, 500)
  }
})
