/**
 * Edge Function: approval-link-get (Portal A2B hotfix)
 * Acesso: público (token no body/query). Usa service_role.
 * Retorna somente payload sanitizado. NÃO abre service_orders ao anon.
 *
 * A2 = enriquecimento opcional (logo/telefone/conversão).
 * Se A2 falhar, ainda retorna payload A1 — nunca 500 por campo extra.
 * Nunca loga token bruto nem payload completo.
 */

import {
  adminClient,
  handleOptions,
  hashToken,
  jsonResponse,
  montarPayloadSanitizado,
  type ApprovalLinkStatus,
  type PublicQuotePayload,
} from '../_shared/approval-common.ts'

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v.trim()
  )
}

/** Logo pública: http(s) ou data:image até o limite do sync interno (280k). */
const MAX_DATA_IMAGE_CHARS = 280_000

function extrairLogoPublicoSeguro(settingsMeta: Record<string, unknown> | null): string | null {
  if (!settingsMeta) return null
  if (settingsMeta.logo_removida_em && !settingsMeta.logo_url) return null
  const logo = settingsMeta.logo_url
  if (typeof logo !== 'string') return null
  const trim = logo.trim()
  if (!trim) return null
  if (/^https?:\/\//i.test(trim)) {
    if (trim.length > 2048) {
      console.error('portal_logo_skipped', 'http_too_long', Math.min(trim.length, 999999))
      return null
    }
    return trim
  }
  if (trim.startsWith('data:image/')) {
    if (trim.length > MAX_DATA_IMAGE_CHARS) {
      console.error('portal_logo_skipped', 'data_image_too_large', Math.min(trim.length, 999999))
      return null
    }
    return trim
  }
  console.error('portal_logo_skipped', 'unsupported_format', Math.min(trim.length, 999999))
  return null
}

function logEnrichmentFailed(reason: string) {
  console.error('portal_a2_enrichment_failed', reason.slice(0, 160))
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

    // —— Payload base A1 (obrigatório) ——
    const { data: os, error: osErr } = await admin
      .from('service_orders')
      .select(
        'id, number, discount, total_value, parts_value, labor_value, budget_date, budget_status, parts_used, customer_id, motorcycle_id, office_id, status'
      )
      .eq('id', link.service_order_id)
      .eq('office_id', link.office_id)
      .maybeSingle()

    if (osErr || !os) {
      return jsonResponse({ ok: false, erro: 'Orçamento indisponível.' }, 404)
    }

    const [{ data: office }, { data: customer }, { data: moto }] = await Promise.all([
      admin.from('offices').select('id, name, phone').eq('id', link.office_id).maybeSingle(),
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

    const vehicleLabel =
      [moto?.brand, moto?.model, moto?.year].filter(Boolean).join(' ') || 'Veículo'
    const notes =
      typeof craftMeta?.observacoes_orcamento === 'string'
        ? craftMeta.observacoes_orcamento
        : null
    const validUntil =
      typeof craftMeta?.data_previsao === 'string' ? craftMeta.data_previsao : null

    let payload: PublicQuotePayload = montarPayloadSanitizado({
      officeName: office?.name || 'Oficina',
      officeLogo: null,
      officePhone: null,
      officeWhatsapp: null,
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

    // —— Enriquecimento A2 (opcional; nunca derruba o portal) ——
    try {
      let officeLogo: string | null = null
      let officePhone: string | null = office?.phone ?? null
      let officeWhatsapp: string | null = null
      let converted = false
      let convertedOsNumber: number | null = null
      let convertedAt: string | null = null
      let generatedOsStatus: string | null = null
      let generatedOsExpected: string | null = null

      try {
        const { data: settings, error: settingsErr } = await admin
          .from('settings')
          .select('office_id, metadata')
          .eq('office_id', link.office_id)
          .maybeSingle()
        if (settingsErr) {
          logEnrichmentFailed(`settings:${settingsErr.message || 'query'}`)
        } else {
          const settingsMeta = asRecord(settings?.metadata)
          officeLogo = extrairLogoPublicoSeguro(settingsMeta)
          if (typeof settingsMeta?.whatsapp === 'string') {
            officeWhatsapp = settingsMeta.whatsapp
          }
        }
      } catch (e) {
        logEnrichmentFailed(
          `settings_throw:${e instanceof Error ? e.message : 'unknown'}`
        )
      }

      try {
        const osGeradaIdRaw =
          typeof craftMeta?.os_gerada_id === 'string' ? craftMeta.os_gerada_id.trim() : ''
        const osGeradaId = osGeradaIdRaw && isUuid(osGeradaIdRaw) ? osGeradaIdRaw : null
        const osGeradaNumeroMeta =
          craftMeta?.os_gerada_numero != null && Number(craftMeta.os_gerada_numero) > 0
            ? Number(craftMeta.os_gerada_numero)
            : null
        convertedAt =
          typeof craftMeta?.orcamento_convertido_em === 'string'
            ? craftMeta.orcamento_convertido_em
            : null
        const budgetConvertido = String(os.budget_status || '') === 'convertido'
        converted = Boolean(osGeradaId || osGeradaNumeroMeta || budgetConvertido)
        convertedOsNumber = osGeradaNumeroMeta

        if (osGeradaId || osGeradaNumeroMeta != null) {
          let geradaQuery = admin
            .from('service_orders')
            .select('id, number, status, parts_used, office_id')
            .eq('office_id', link.office_id)

          if (osGeradaId) {
            geradaQuery = geradaQuery.eq('id', osGeradaId)
          } else {
            geradaQuery = geradaQuery.eq('number', osGeradaNumeroMeta!)
          }

          const { data: osGeradaRows, error: geradaErr } = await geradaQuery.limit(1)
          if (geradaErr) {
            logEnrichmentFailed(`os_gerada:${geradaErr.message || 'query'}`)
          } else {
            const osGerada = Array.isArray(osGeradaRows) ? osGeradaRows[0] : osGeradaRows
            if (osGerada) {
              if (Number(osGerada.number) > 0) {
                convertedOsNumber = Number(osGerada.number)
              }
              generatedOsStatus =
                typeof osGerada.status === 'string' ? osGerada.status : null
              const metaGerada = asRecord(asRecord(osGerada.parts_used)?.craft_meta)
              if (typeof metaGerada?.data_previsao === 'string') {
                generatedOsExpected = metaGerada.data_previsao
              }
            }
          }
        }
      } catch (e) {
        logEnrichmentFailed(
          `conversion_throw:${e instanceof Error ? e.message : 'unknown'}`
        )
      }

      payload = montarPayloadSanitizado({
        officeName: office?.name || 'Oficina',
        officeLogo,
        officePhone,
        officeWhatsapp,
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
        converted,
        convertedOsNumber,
        convertedAt,
        generatedOsStatus,
        generatedOsExpectedDeliveryDate: generatedOsExpected,
      })
    } catch (e) {
      logEnrichmentFailed(e instanceof Error ? e.message : 'enrich_unknown')
      // mantém payload A1 já montado
    }

    if (status === 'pending') {
      try {
        await admin
          .from('approval_links')
          .update({ last_accessed_at: new Date().toISOString() })
          .eq('id', link.id)
      } catch {
        // não bloqueia leitura
      }

      return jsonResponse({ ok: true, dados: payload })
    }

    return jsonResponse(
      {
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
        dados: payload,
      },
      410
    )
  } catch (e) {
    console.error('[approval-link-get]', e instanceof Error ? e.message : 'internal')
    return jsonResponse({ ok: false, erro: 'Erro interno ao carregar orçamento.' }, 500)
  }
})
