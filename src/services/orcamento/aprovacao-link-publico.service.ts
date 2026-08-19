/**
 * Cliente das Edge Functions de aprovação (A2.4).
 * - create: sessão autenticada (JWT do usuário)
 * - get / respond: públicos via token (sem abrir service_orders ao anon)
 * Nunca loga token bruto. Nunca persiste token/URL com token em craft_meta.
 */

import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase'
import { supabaseAnonKey, supabaseUrl } from '@/lib/supabase-env'
import {
  APROVACAO_LINK_PUBLICO_MSG_BLOQUEIO,
  aprovacaoLinkPublicoBackendAtivo,
} from '@/services/orcamento/aprovacao-link-publico.flags'
import type {
  ApprovalActionPublic,
  CriarApprovalLinkResultado,
  ItemDecisionPublicInput,
  PublicQuoteApprovalPayload,
} from '@/types/approval-link'

function maskTokenForDebug(token: string): string {
  if (!token || token.length < 12) return '(token)'
  return `${token.slice(0, 4)}…${token.slice(-3)}`
}

async function chamarFunctionPublica<T>(
  nome: 'approval-link-get' | 'approval-link-respond',
  body: Record<string, unknown>
): Promise<{ ok: boolean; http: number; json: T & { ok?: boolean; erro?: string; message?: string } }> {
  if (!isSupabaseConfigured() || !supabaseUrl || !supabaseAnonKey) {
    return {
      ok: false,
      http: 0,
      json: { ok: false, erro: 'Supabase não configurado.' } as T & {
        ok?: boolean
        erro?: string
      },
    }
  }

  const res = await fetch(`${supabaseUrl}/functions/v1/${nome}`, {
    method: 'POST',
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const json = (await res.json().catch(() => ({}))) as T & {
    ok?: boolean
    erro?: string
    message?: string
  }
  return { ok: res.ok && json.ok !== false, http: res.status, json }
}

export async function criarApprovalLinkPublico(input: {
  serviceOrderId: string
  serviceOrderNumber?: number
  validityDays?: number
  /** approval (default) | service_tracking (fotos/acompanhamento OS) */
  portalMode?: 'approval' | 'service_tracking'
}): Promise<CriarApprovalLinkResultado> {
  if (!aprovacaoLinkPublicoBackendAtivo()) {
    return { ok: false, erro: APROVACAO_LINK_PUBLICO_MSG_BLOQUEIO }
  }

  const supabase = getSupabaseClient()
  if (!supabase) {
    return { ok: false, erro: 'Supabase não configurado.' }
  }

  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.access_token) {
    return { ok: false, erro: 'Faça login para gerar o link seguro.' }
  }

  const validityDays = Math.min(Math.max(Number(input.validityDays) || 7, 1), 60)
  const portalMode = input.portalMode === 'service_tracking' ? 'service_tracking' : 'approval'

  const { data, error } = await supabase.functions.invoke('approval-link-create', {
    body: {
      service_order_id: input.serviceOrderId,
      service_order_number: input.serviceOrderNumber,
      validity_days: validityDays,
      portal_mode: portalMode,
      link_purpose: portalMode,
    },
  })

  const payload = data as {
    ok?: boolean
    erro?: string
    message?: string
    url?: string
    link_id?: string
    expires_at?: string
    notice?: string
  } | null

  if (error) {
    return {
      ok: false,
      erro: payload?.erro || error.message || 'Falha ao gerar link seguro.',
    }
  }

  if (!payload?.ok || !payload.url || !payload.link_id) {
    return {
      ok: false,
      erro: payload?.erro || payload?.message || 'Falha ao gerar link seguro.',
    }
  }

  return {
    ok: true,
    url: payload.url,
    link_id: payload.link_id,
    expires_at: payload.expires_at,
    notice: payload.notice,
  }
}

export async function obterOrcamentoPorTokenPublico(
  token: string
): Promise<{
  ok: boolean
  dados?: PublicQuoteApprovalPayload
  erro?: string
  status?: string
  http?: number
}> {
  if (!aprovacaoLinkPublicoBackendAtivo()) {
    return { ok: false, erro: APROVACAO_LINK_PUBLICO_MSG_BLOQUEIO }
  }

  const tokenTrim = token.trim()
  if (!tokenTrim || tokenTrim.length < 32) {
    return { ok: false, erro: 'Link inválido.' }
  }

  try {
    const { http, json } = await chamarFunctionPublica<{
      ok?: boolean
      dados?: PublicQuoteApprovalPayload
      erro?: string
      status?: string
    }>('approval-link-get', { token: tokenTrim })

    if (json.ok && json.dados) {
      return { ok: true, dados: json.dados, http }
    }

    return {
      ok: false,
      erro: json.erro || 'Não foi possível carregar o orçamento.',
      status: json.status,
      http,
      // A2: Edge pode devolver dados sanitizados mesmo em 410 (já respondido).
      dados: json.dados,
    }
  } catch {
    return { ok: false, erro: 'Falha de rede ao carregar o orçamento.' }
  }
}

export async function responderOrcamentoPorTokenPublico(input: {
  token: string
  action: ApprovalActionPublic
  responseName: string
  responseNote?: string
  itemsDecision?: ItemDecisionPublicInput[]
}): Promise<{
  ok: boolean
  erro?: string
  message?: string
  status?: string
  approval_type?: string
}> {
  if (!aprovacaoLinkPublicoBackendAtivo()) {
    return { ok: false, erro: APROVACAO_LINK_PUBLICO_MSG_BLOQUEIO }
  }

  const tokenTrim = input.token.trim()
  const nome = input.responseName.trim()
  if (!tokenTrim || tokenTrim.length < 32) {
    return { ok: false, erro: 'Link inválido.' }
  }
  if (nome.length < 2) {
    return { ok: false, erro: 'Informe o nome.' }
  }

  try {
    const { json } = await chamarFunctionPublica<{
      ok?: boolean
      erro?: string
      message?: string
      status?: string
      approval_type?: string
    }>('approval-link-respond', {
      token: tokenTrim,
      action: input.action,
      response_name: nome,
      response_note: input.responseNote?.trim() || '',
      items_decision: input.itemsDecision ?? [],
    })

    if (json.ok) {
      return {
        ok: true,
        message: json.message,
        status: json.status,
        approval_type: json.approval_type,
      }
    }

    return {
      ok: false,
      erro: json.erro || 'Não foi possível registrar a resposta.',
      status: json.status,
    }
  } catch {
    return { ok: false, erro: 'Falha de rede ao enviar a resposta.' }
  }
}

export function montarUrlAprovarOrcamento(tokenBruto: string): string {
  const path = `/aprovar-orcamento/${encodeURIComponent(tokenBruto)}`
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}${path}`
  }
  return path
}

/** URL pública do Portal do Cliente (A1). Mesmo token da aprovação. */
export function montarUrlPortalCliente(tokenBruto: string): string {
  const path = `/portal/${encodeURIComponent(tokenBruto)}`
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}${path}`
  }
  return path
}

/**
 * Reescreve URL de aprovação (Edge create) para o Portal A1.
 * Mantém compatibilidade: /aprovar-orcamento/:token → /portal/:token
 * Não loga nem altera o token.
 */
export function reescreverUrlAprovacaoParaPortal(url: string): string {
  const trim = url.trim()
  if (!trim) return trim
  return trim.replace(/\/aprovar-orcamento\//i, '/portal/')
}

/** Somente para mensagens de erro internas — nunca logar token completo. */
export function mascararTokenPublico(token: string): string {
  return maskTokenForDebug(token)
}
