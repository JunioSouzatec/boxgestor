/**
 * Edge Function: notify-admin-nova-oficina
 *
 * Destino de Database Webhook (INSERT public.offices).
 * Envia 1 e-mail admin via Resend; não bloqueia o cadastro (assíncrono).
 *
 * Secrets (Dashboard → Edge Functions → Secrets):
 *   ADMIN_OFFICE_WEBHOOK_SECRET
 *   RESEND_API_KEY
 *   ADMIN_NOTIFY_TO
 *   ADMIN_NOTIFY_FROM
 *   (+ SUPABASE_URL / service role automáticos)
 *
 * NUNCA logar API keys. Deploy Homolog primeiro — ver docs/notify-admin-nova-oficina.md
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import {
  WEBHOOK_SECRET_HEADER,
  processNovaOficinaNotify,
  type ProcessDeps,
  type SettingsRow,
} from './logic.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-boxgestor-webhook-secret',
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function parseSupabaseKeyEnv(raw: string | undefined): string | null {
  const trimmed = raw?.trim()
  if (!trimmed) return null
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return trimmed
  try {
    const parsed: unknown = JSON.parse(trimmed)
    if (typeof parsed === 'string' && parsed.trim()) return parsed.trim()
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const obj = parsed as Record<string, unknown>
      if (typeof obj.default === 'string' && obj.default.trim()) return obj.default.trim()
      for (const value of Object.values(obj)) {
        if (typeof value === 'string' && value.trim()) return value.trim()
      }
    }
  } catch {
    /* ignore */
  }
  return null
}

function getServiceRoleKey(): string | null {
  return (
    parseSupabaseKeyEnv(Deno.env.get('SUPABASE_SECRET_KEYS')) ||
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim() ||
    null
  )
}

function adminClient() {
  const url = Deno.env.get('SUPABASE_URL')?.trim()
  const key = getServiceRoleKey()
  if (!url || !key) {
    throw new Error('SUPABASE_URL / service role key não configurados.')
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function createDeps(): ProcessDeps {
  const sb = adminClient()

  return {
    nowIso: () => new Date().toISOString(),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    getEnv: (key) => Deno.env.get(key) ?? undefined,
    log: (message, detail) => {
      if (detail !== undefined) console.error(message, detail)
      else console.error(message)
    },
    async loadOfficeBundle(officeId) {
      const { data: office } = await sb
        .from('offices')
        .select(
          'id, name, phone, plan_tier, trial_started_at, trial_ends_at, created_at',
        )
        .eq('id', officeId)
        .maybeSingle()

      const { data: owner } = await sb
        .from('profiles')
        .select('id, full_name, email, role, office_id')
        .eq('office_id', officeId)
        .eq('role', 'owner')
        .maybeSingle()

      const { data: settings } = await sb
        .from('settings')
        .select('office_id, metadata')
        .eq('office_id', officeId)
        .maybeSingle()

      return {
        office: (office as Record<string, unknown> | null) ?? null,
        owner: (owner as Record<string, unknown> | null) ?? null,
        settings: settings
          ? ({
              metadata:
                ((settings as { metadata?: Record<string, unknown> | null }).metadata ??
                  null) as Record<string, unknown> | null,
            } satisfies SettingsRow)
          : null,
      }
    },
    async markNotified(officeId, metadata) {
      const { error } = await sb
        .from('settings')
        .update({
          metadata,
          updated_at: new Date().toISOString(),
        } as never)
        .eq('office_id', officeId)
      if (error) throw new Error(error.message)
    },
    async sendResend(input) {
      const apiKey = Deno.env.get('RESEND_API_KEY')?.trim()
      if (!apiKey) throw new Error('RESEND_API_KEY ausente')

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': input.idempotencyKey,
        },
        body: JSON.stringify({
          from: input.from,
          to: [input.to],
          subject: input.subject,
          html: input.html,
        }),
      })

      const text = await res.text()
      let parsed: { id?: string; message?: string } = {}
      try {
        parsed = JSON.parse(text) as { id?: string; message?: string }
      } catch {
        /* ignore */
      }

      if (!res.ok || !parsed.id) {
        throw new Error(parsed.message || `Resend HTTP ${res.status}`)
      }
      return { id: parsed.id }
    },
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'Método não permitido.' }, 405)
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ ok: false, error: 'JSON inválido.' }, 400)
  }

  try {
    const result = await processNovaOficinaNotify(
      {
        secretHeader: req.headers.get(WEBHOOK_SECRET_HEADER),
        body,
      },
      createDeps(),
    )

    if (!result.ok) {
      return jsonResponse(
        {
          ok: false,
          error: result.error,
          retryable: result.retryable ?? false,
        },
        result.status,
      )
    }

    if ('already_notified' in result && result.already_notified) {
      return jsonResponse({
        ok: true,
        already_notified: true,
        office_id: result.office_id,
      })
    }

    return jsonResponse({
      ok: true,
      sent: true,
      office_id: result.office_id,
      email_id: result.email_id,
    })
  } catch (err) {
    console.error('[notify-admin-nova-oficina] erro não tratado', {
      message: err instanceof Error ? err.message : 'erro',
    })
    return jsonResponse({ ok: false, error: 'Erro interno.' }, 500)
  }
})
