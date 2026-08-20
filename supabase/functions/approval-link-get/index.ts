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
  montarTrackingPublico,
  resolverPortalModePublico,
  type ApprovalLinkStatus,
  type PublicQuotePayload,
  type PublicQuotePhotoItem,
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

const PORTAL_PHOTO_TTL_SECONDS = 600
const PORTAL_PHOTO_LIMIT = 20
const SERVICE_ORDER_PHOTOS_BUCKET = 'service-order-photos'

function logPortalPhotoFailed(reason: string) {
  console.error('portal_a3_photo_failed', reason.slice(0, 120))
}

/**
 * Fotos opt-in para o portal. Nunca inclui storage_path no retorno.
 * Aceita vários service_order_id (orçamento + OS convertida).
 * Falha parcial não derruba o portal.
 */
async function carregarFotosPortalSanitizadas(
  admin: ReturnType<typeof adminClient>,
  officeId: string,
  serviceOrderIds: string[]
): Promise<PublicQuotePhotoItem[]> {
  const ids = [...new Set(serviceOrderIds.map((id) => id.trim()).filter(Boolean))]
  if (ids.length === 0) return []

  try {
    const { data: rows, error } = await admin
      .from('service_order_photos')
      .select('id, caption, photo_type, created_at, sort_order, storage_path')
      .eq('office_id', officeId)
      .in('service_order_id', ids)
      .eq('include_in_portal', true)
      .is('deleted_at', null)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(PORTAL_PHOTO_LIMIT)

    if (error) {
      logPortalPhotoFailed(`list:${error.message || 'query'}`)
      return []
    }

    const fotos: PublicQuotePhotoItem[] = []
    const vistos = new Set<string>()
    for (const row of rows ?? []) {
      const id = typeof row.id === 'string' ? row.id : ''
      const path = typeof row.storage_path === 'string' ? row.storage_path.trim() : ''
      if (!id || !path || vistos.has(id)) continue
      vistos.add(id)

      try {
        const { data: signed, error: signErr } = await admin.storage
          .from(SERVICE_ORDER_PHOTOS_BUCKET)
          .createSignedUrl(path, PORTAL_PHOTO_TTL_SECONDS)

        if (signErr || !signed?.signedUrl) {
          logPortalPhotoFailed(`sign:${id.slice(0, 8)}`)
          continue
        }

        fotos.push({
          id,
          signed_url: signed.signedUrl,
          caption:
            typeof row.caption === 'string' && row.caption.trim()
              ? row.caption.trim()
              : null,
          type:
            typeof row.photo_type === 'string' && row.photo_type.trim()
              ? row.photo_type.trim()
              : null,
          created_at:
            typeof row.created_at === 'string' ? row.created_at : null,
          sort_order:
            typeof row.sort_order === 'number' ? row.sort_order : null,
        })
      } catch {
        logPortalPhotoFailed(`sign_throw:${id.slice(0, 8)}`)
      }
    }

    return fotos
  } catch (e) {
    logPortalPhotoFailed(
      `list_throw:${e instanceof Error ? e.message : 'unknown'}`
    )
    return []
  }
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
        'id, office_id, service_order_id, status, expires_at, response_name, response_note, metadata'
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
        'id, number, discount, total_value, parts_value, labor_value, budget_date, budget_status, parts_used, customer_id, motorcycle_id, office_id, status, updated_at'
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
    const linkMeta = asRecord(link.metadata)
    const modoDocumento =
      typeof craftMeta?.modo_documento === 'string' ? craftMeta.modo_documento : null
    const budgetStatus =
      typeof os.budget_status === 'string' ? os.budget_status : null

    let portalMode = resolverPortalModePublico({
      linkMetadata: linkMeta,
      converted: false,
      modoDocumento,
      budgetStatus,
    })

    let tipoOficinaPortal: string | null = null

    const trackingInicial =
      portalMode === 'service_tracking'
        ? montarTrackingPublico({
            statusCodigo: typeof os.status === 'string' ? os.status : null,
            tipoOficina: tipoOficinaPortal,
            previsaoEntrega: validUntil,
            atualizadoEm: typeof os.updated_at === 'string' ? os.updated_at : null,
          })
        : null

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
      portalMode,
      generatedOsStatus:
        portalMode === 'service_tracking' && typeof os.status === 'string'
          ? os.status
          : null,
      tracking: trackingInicial,
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
          if (typeof settingsMeta?.tipo_oficina === 'string') {
            tipoOficinaPortal = settingsMeta.tipo_oficina
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

      portalMode = resolverPortalModePublico({
        linkMetadata: linkMeta,
        converted,
        modoDocumento,
        budgetStatus,
      })

      const statusOperacional =
        portalMode === 'service_tracking' && typeof os.status === 'string'
          ? os.status
          : generatedOsStatus

      const statusParaTracking =
        portalMode === 'service_tracking'
          ? (generatedOsStatus && converted
              ? generatedOsStatus
              : typeof os.status === 'string'
                ? os.status
                : null)
          : null

      const previsaoTracking =
        generatedOsExpected || validUntil || null

      const tracking =
        portalMode === 'service_tracking'
          ? montarTrackingPublico({
              statusCodigo: statusParaTracking,
              tipoOficina: tipoOficinaPortal,
              previsaoEntrega: previsaoTracking,
              atualizadoEm: typeof os.updated_at === 'string' ? os.updated_at : null,
            })
          : null

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
        generatedOsStatus: statusOperacional,
        generatedOsExpectedDeliveryDate: generatedOsExpected,
        portalMode,
        tracking,
      })
    } catch (e) {
      logEnrichmentFailed(e instanceof Error ? e.message : 'enrich_unknown')
      // mantém payload A1 já montado
    }

    // —— Fotos A3 (opt-in; nunca derruba o portal) ——
    // Inclui fotos do documento do link e, se houver, da OS gerada na conversão.
    if (status !== 'expired' && status !== 'revoked') {
      try {
        const photoOrderIds: string[] = [os.id]
        const osGeradaIdRaw =
          typeof craftMeta?.os_gerada_id === 'string' ? craftMeta.os_gerada_id.trim() : ''
        if (osGeradaIdRaw && isUuid(osGeradaIdRaw) && osGeradaIdRaw !== os.id) {
          photoOrderIds.push(osGeradaIdRaw)
        }
        const photos = await carregarFotosPortalSanitizadas(
          admin,
          link.office_id,
          photoOrderIds
        )
        if (photos.length > 0) {
          payload = { ...payload, photos }
        }
      } catch (e) {
        logPortalPhotoFailed(
          `attach:${e instanceof Error ? e.message : 'unknown'}`
        )
      }
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
