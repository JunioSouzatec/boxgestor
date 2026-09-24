/**
 * Lógica pura — notificação admin de nova oficina.
 * Usada pela Edge Function (Deno) e pelos testes (Node/tsx).
 * Sem secrets hardcoded; sem dependência de Deno/Node APIs além de TextEncoder.
 */

export const WEBHOOK_SECRET_HEADER = 'x-boxgestor-webhook-secret'
export const IDEMPOTENCY_PREFIX = 'boxgestor-nova-oficina'
export const META_EMAIL_EM = 'admin_nova_oficina_email_em'
export const META_EMAIL_ID = 'admin_nova_oficina_email_id'
export const META_TIPO_OFICINA = 'tipo_oficina'
export const FALLBACK = 'Não informado'
export const EMAIL_TIMEZONE = 'America/Sao_Paulo'

export const EMAIL_SUBJECT = 'Nova oficina cadastrada no BoxGestor'

export type OfficesInsertPayload = {
  type: string
  table: string
  schema?: string
  record: Record<string, unknown> | null
  old_record?: unknown
}

export type OfficeNotifyData = {
  office_id: string
  nome_oficina: string
  responsavel: string
  email: string
  telefone: string
  tipo: string
  plan_tier: string
  trial_started_at: string
  trial_ends_at: string
  created_at: string
}

export type SettingsRow = {
  metadata: Record<string, unknown> | null
}

export type OfficeBundle = {
  office: Record<string, unknown> | null
  owner: Record<string, unknown> | null
  settings: SettingsRow | null
}

export type ProcessDeps = {
  nowIso: () => string
  sleep: (ms: number) => Promise<void>
  loadOfficeBundle: (officeId: string) => Promise<OfficeBundle>
  markNotified: (
    officeId: string,
    metadata: Record<string, unknown>,
  ) => Promise<void>
  sendResend: (input: {
    idempotencyKey: string
    from: string
    to: string
    subject: string
    html: string
  }) => Promise<{ id: string }>
  getEnv: (key: string) => string | undefined
  log: (message: string, detail?: unknown) => void
}

export type ProcessResult =
  | { ok: true; status: 200; already_notified: true; office_id: string }
  | { ok: true; status: 200; sent: true; office_id: string; email_id: string }
  | { ok: false; status: number; error: string; retryable?: boolean }

const TIPO_LABEL: Record<string, string> = {
  motos: 'Oficina de motos',
  carros: 'Oficina de carros',
  mista: 'Oficina geral / mista',
}

/**
 * Tentativas curtas: cobre race office/owner/settings e gravarTipoOficinaNoCadastro
 * (~centenas de ms após INSERT), sem espera longa.
 */
export const READ_RETRY_DELAYS_MS = [0, 150, 350, 600, 900] as const

/** Comparação em tempo constante para secrets (mesmo comprimento). */
export function secretsMatch(
  expected: string | undefined | null,
  provided: string | undefined | null,
): boolean {
  if (!expected || !provided) return false
  const a = utf8(expected)
  const b = utf8(provided)
  if (a.length !== b.length) {
    let pad = 0
    for (let i = 0; i < a.length; i++) pad |= a[i]!
    void pad
    return false
  }
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!
  return diff === 0
}

function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s)
}

export function buildIdempotencyKey(officeId: string): string {
  return `${IDEMPOTENCY_PREFIX}/${officeId.trim()}`
}

export function displayOrFallback(value: unknown): string {
  if (value === null || value === undefined) return FALLBACK
  const s = String(value).trim()
  return s || FALLBACK
}

export function formatTipoOficina(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) return FALLBACK
  const key = raw.trim().toLowerCase()
  return TIPO_LABEL[key] ?? displayOrFallback(raw)
}

/**
 * Formata ISO em DD/MM/YYYY HH:mm no fuso America/Sao_Paulo
 * (independente do timezone do runtime Deno/Node).
 */
export function formatDateTimeBr(iso: unknown): string {
  if (typeof iso !== 'string' || !iso.trim()) return FALLBACK
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return FALLBACK

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: EMAIL_TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d)

  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? ''

  const day = get('day')
  const month = get('month')
  const year = get('year')
  let hour = get('hour')
  const minute = get('minute')
  // Alguns runtimes usam "24" para meia-noite em hour12:false
  if (hour === '24') hour = '00'

  if (!day || !month || !year || !hour || !minute) return FALLBACK
  return `${day}/${month}/${year} ${hour}:${minute}`
}

export function alreadyNotified(metadata: Record<string, unknown> | null | undefined): boolean {
  const em = metadata?.[META_EMAIL_EM]
  return typeof em === 'string' && em.trim().length > 0
}

export function hasTipoOficinaMetadata(
  metadata: Record<string, unknown> | null | undefined,
): boolean {
  const raw = metadata?.[META_TIPO_OFICINA]
  return typeof raw === 'string' && raw.trim().length > 0
}

/**
 * Preserva metadata existente e adiciona marcadores de envio.
 * Não remove chaves anteriores.
 */
export function mergeEmailMarker(
  existing: Record<string, unknown> | null | undefined,
  sentAtIso: string,
  emailId: string,
): Record<string, unknown> {
  return {
    ...(existing ?? {}),
    [META_EMAIL_EM]: sentAtIso,
    [META_EMAIL_ID]: emailId,
  }
}

export function parseOfficesInsertPayload(body: unknown): {
  ok: true
  officeId: string
  record: Record<string, unknown>
} | { ok: false; error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Payload inválido.' }
  }
  const p = body as Record<string, unknown>
  if (p.type !== 'INSERT') {
    return { ok: false, error: 'type deve ser INSERT.' }
  }
  if (p.table !== 'offices') {
    return { ok: false, error: 'table deve ser offices.' }
  }
  const record = p.record
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    return { ok: false, error: 'record ausente.' }
  }
  const rec = record as Record<string, unknown>
  const id = typeof rec.id === 'string' ? rec.id.trim() : ''
  if (!id) {
    return { ok: false, error: 'record.id ausente.' }
  }
  return { ok: true, officeId: id, record: rec }
}

/** Office + owner + settings existem (ainda pode faltar tipo_oficina). */
export function isOfficeBundleComplete(bundle: OfficeBundle): boolean {
  return Boolean(bundle.office?.id && bundle.owner?.id && bundle.settings)
}

/** Completo para e-mail com tipo: estrutura + metadata.tipo_oficina. */
export function isOfficeBundleReadyForNotify(bundle: OfficeBundle): boolean {
  if (!isOfficeBundleComplete(bundle)) return false
  return hasTipoOficinaMetadata(bundle.settings?.metadata ?? null)
}

export function buildNotifyData(bundle: {
  office: Record<string, unknown>
  owner: Record<string, unknown>
  settings: SettingsRow
}): OfficeNotifyData {
  const meta = (bundle.settings.metadata ?? {}) as Record<string, unknown>
  const officeId = String(bundle.office.id)
  return {
    office_id: officeId,
    nome_oficina: displayOrFallback(bundle.office.name),
    responsavel: displayOrFallback(bundle.owner.full_name),
    email: displayOrFallback(bundle.owner.email),
    telefone: displayOrFallback(bundle.office.phone),
    tipo: formatTipoOficina(meta[META_TIPO_OFICINA]),
    plan_tier: displayOrFallback(bundle.office.plan_tier),
    trial_started_at: formatDateTimeBr(bundle.office.trial_started_at),
    trial_ends_at: formatDateTimeBr(bundle.office.trial_ends_at),
    created_at: formatDateTimeBr(bundle.office.created_at),
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function buildEmailHtml(data: OfficeNotifyData): string {
  const row = (label: string, value: string) =>
    `<tr><td style="padding:6px 12px 6px 0;color:#64748b;vertical-align:top;white-space:nowrap;">${escapeHtml(label)}</td><td style="padding:6px 0;color:#0f172a;font-weight:500;">${escapeHtml(value)}</td></tr>`

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>${escapeHtml(EMAIL_SUBJECT)}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1f5f9;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
        <tr><td style="background:#0f172a;padding:20px 24px;">
          <div style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:0.02em;">BoxGestor</div>
          <div style="color:#94a3b8;font-size:13px;margin-top:4px;">Aviso administrativo</div>
        </td></tr>
        <tr><td style="padding:24px;">
          <h1 style="margin:0 0 16px;font-size:20px;color:#0f172a;">Nova oficina cadastrada</h1>
          <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;font-size:14px;line-height:1.45;">
            ${row('Oficina:', data.nome_oficina)}
            ${row('Responsável:', data.responsavel)}
            ${row('E-mail:', data.email)}
            ${row('Telefone:', data.telefone)}
            ${row('Tipo:', data.tipo)}
            ${row('Plano:', data.plan_tier)}
            ${row('Início do trial:', data.trial_started_at)}
            ${row('Fim do trial:', data.trial_ends_at)}
            ${row('Cadastro:', data.created_at)}
            ${row('Office ID:', data.office_id)}
          </table>
        </td></tr>
        <tr><td style="padding:12px 24px 20px;color:#94a3b8;font-size:12px;border-top:1px solid #e2e8f0;">
          Enviado automaticamente pelo BoxGestor. Não responda a este aviso se for caixa compartilhada.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

/**
 * Processa webhook INSERT offices → e-mail admin (Resend).
 * Não altera Auth/RPC/client; falha de e-mail é reportada para retry do webhook.
 */
export async function processNovaOficinaNotify(
  input: {
    secretHeader: string | null
    body: unknown
  },
  deps: ProcessDeps,
): Promise<ProcessResult> {
  const expectedSecret = deps.getEnv('ADMIN_OFFICE_WEBHOOK_SECRET')?.trim()
  if (!expectedSecret) {
    deps.log('[notify-admin-nova-oficina] ADMIN_OFFICE_WEBHOOK_SECRET ausente')
    return { ok: false, status: 500, error: 'Webhook secret não configurado.' }
  }
  if (!secretsMatch(expectedSecret, input.secretHeader)) {
    return { ok: false, status: 401, error: 'Não autorizado.' }
  }

  const parsed = parseOfficesInsertPayload(input.body)
  if (!parsed.ok) {
    return { ok: false, status: 400, error: parsed.error }
  }

  const { officeId } = parsed
  const idempotencyKey = buildIdempotencyKey(officeId)

  let bundle: OfficeBundle | null = null
  for (let i = 0; i < READ_RETRY_DELAYS_MS.length; i++) {
    const delay = READ_RETRY_DELAYS_MS[i]!
    if (delay > 0) await deps.sleep(delay)
    bundle = await deps.loadOfficeBundle(officeId)
    // Preferir sair cedo quando tipo_oficina já estiver em metadata.
    if (isOfficeBundleReadyForNotify(bundle)) break
  }

  if (!bundle || !isOfficeBundleComplete(bundle)) {
    deps.log('[notify-admin-nova-oficina] office incompleta após retries', { officeId })
    return {
      ok: false,
      status: 503,
      error: 'Office incompleta (owner/settings ainda não visíveis).',
      retryable: true,
    }
  }

  const metadata = (bundle.settings!.metadata ?? {}) as Record<string, unknown>
  if (alreadyNotified(metadata)) {
    return {
      ok: true,
      status: 200,
      already_notified: true,
      office_id: officeId,
    }
  }

  if (!hasTipoOficinaMetadata(metadata)) {
    deps.log(
      '[notify-admin-nova-oficina] tipo_oficina ausente após retries; fallback Não informado',
      { officeId },
    )
  }

  const apiKey = deps.getEnv('RESEND_API_KEY')?.trim()
  const to = deps.getEnv('ADMIN_NOTIFY_TO')?.trim()
  const from = deps.getEnv('ADMIN_NOTIFY_FROM')?.trim()
  if (!apiKey || !to || !from) {
    deps.log('[notify-admin-nova-oficina] secrets Resend/destinatário ausentes')
    return {
      ok: false,
      status: 500,
      error: 'Configuração de e-mail incompleta.',
    }
  }

  const data = buildNotifyData({
    office: bundle.office!,
    owner: bundle.owner!,
    settings: bundle.settings!,
  })
  const html = buildEmailHtml(data)

  let emailId: string
  try {
    const sent = await deps.sendResend({
      idempotencyKey,
      from,
      to,
      subject: EMAIL_SUBJECT,
      html,
    })
    emailId = sent.id
  } catch (err) {
    deps.log('[notify-admin-nova-oficina] falha Resend', {
      officeId,
      message: err instanceof Error ? err.message : 'erro',
    })
    return {
      ok: false,
      status: 502,
      error: 'Falha ao enviar e-mail administrativo.',
      retryable: true,
    }
  }

  const sentAt = deps.nowIso()
  const nextMeta = mergeEmailMarker(metadata, sentAt, emailId)
  try {
    await deps.markNotified(officeId, nextMeta)
  } catch (err) {
    // Envio já ocorreu; Idempotency-Key impede duplicidade no retry.
    deps.log('[notify-admin-nova-oficina] marker metadata falhou após envio', {
      officeId,
      message: err instanceof Error ? err.message : 'erro',
    })
  }

  return {
    ok: true,
    status: 200,
    sent: true,
    office_id: officeId,
    email_id: emailId,
  }
}
