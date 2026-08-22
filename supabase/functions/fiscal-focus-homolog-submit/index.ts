/**
 * Edge Function: fiscal-focus-homolog-submit (F6C.1 — skeleton)
 *
 * Homologação fiscal Focus NFe — SEM chamada externa nesta etapa.
 *
 * - Auth JWT + profile.active + office_id
 * - Módulo fiscal adicional: settings.metadata.modulo_fiscal_adicional_ativo
 * - Ambiente: somente homologação (fiscal_config.ambiente_desejado)
 * - Secret: FOCUS_NFE_HOMOLOG_TOKEN (verificar presença; nunca logar/retornar)
 * - NÃO chama homologacao.focusnfe.com.br nem api.focusnfe.com.br
 * - NÃO emite nota / NÃO salva banco / NÃO altera caixa/estoque/financeiro
 */

import {
  adminClient,
  handleOptions,
  jsonResponse,
  userClient,
} from '../_shared/approval-common.ts'

const MSG_NAO_AUTH = 'Não autenticado.'
const MSG_SESSAO = 'Sessão inválida.'
const MSG_PERFIL = 'Perfil/oficina inválidos.'
const MSG_MODULO =
  'Módulo Fiscal adicional não está ativo para esta oficina.'
const MSG_AMBIENTE =
  'Homologação fiscal exige ambiente configurado como homologação.'
const MSG_PRODUCAO_BLOQUEADA =
  'Produção fiscal bloqueada nesta etapa. Use somente homologação.'
const MSG_TOKEN_AUSENTE = 'Homologação fiscal ainda não configurada.'
const MSG_ERRO_INTERNO = 'Homologação fiscal indisponível no momento.'

function asRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  return v as Record<string, unknown>
}

function officeIdParaLog(officeId: string): string {
  const id = officeId.trim()
  if (id.length < 8) return '****'
  return `${id.slice(0, 4)}…${id.slice(-4)}`
}

function moduloFiscalAdicionalAtivo(metadata: Record<string, unknown>): boolean {
  const v = metadata.modulo_fiscal_adicional_ativo
  return v === true || v === 'true' || v === 1 || v === '1'
}

/**
 * Ambiente desejado: fiscal_config (F6A) com fallback legado metadata.fiscal.ambiente (F2).
 */
function resolverAmbienteDesejado(
  metadata: Record<string, unknown>
): 'homologacao' | 'producao' | 'desconhecido' {
  const fiscalConfig = asRecord(metadata.fiscal_config)
  const ambienteCfg = fiscalConfig?.ambiente_desejado
  if (ambienteCfg === 'homologacao' || ambienteCfg === 'producao') {
    return ambienteCfg
  }

  const fiscal = asRecord(metadata.fiscal)
  const ambienteLegado = fiscal?.ambiente
  if (ambienteLegado === 'homologacao' || ambienteLegado === 'producao') {
    return ambienteLegado
  }

  return 'desconhecido'
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
      return jsonResponse({ ok: false, erro: MSG_NAO_AUTH }, 401)
    }

    const userSb = userClient(authHeader)
    const { data: userData, error: userErr } = await userSb.auth.getUser()
    if (userErr || !userData.user) {
      return jsonResponse({ ok: false, erro: MSG_SESSAO }, 401)
    }

    const admin = adminClient()
    const { data: profile, error: profileErr } = await admin
      .from('profiles')
      .select('id, office_id, active, role')
      .eq('id', userData.user.id)
      .maybeSingle()

    if (profileErr || !profile?.office_id || profile.active === false) {
      return jsonResponse({ ok: false, erro: MSG_PERFIL }, 403)
    }

    const officeId = String(profile.office_id)

    // Confirma que a oficina existe (sem campos sensíveis)
    const { data: office, error: officeErr } = await admin
      .from('offices')
      .select('id')
      .eq('id', officeId)
      .maybeSingle()

    if (officeErr || !office?.id) {
      return jsonResponse({ ok: false, erro: MSG_PERFIL }, 403)
    }

    const { data: settings, error: settingsErr } = await admin
      .from('settings')
      .select('metadata')
      .eq('office_id', officeId)
      .maybeSingle()

    if (settingsErr) {
      console.warn(
        `[fiscal-focus-homolog-submit] settings erro office=${officeIdParaLog(officeId)}`
      )
      return jsonResponse({ ok: false, erro: MSG_ERRO_INTERNO }, 503)
    }

    const metadata = asRecord(settings?.metadata) || {}

    if (!moduloFiscalAdicionalAtivo(metadata)) {
      console.info(
        `[fiscal-focus-homolog-submit] modulo fiscal inativo office=${officeIdParaLog(officeId)}`
      )
      return jsonResponse(
        {
          ok: false,
          code: 'FISCAL_ADDON_INACTIVE',
          message: MSG_MODULO,
          erro: MSG_MODULO,
        },
        403
      )
    }

    const ambiente = resolverAmbienteDesejado(metadata)
    if (ambiente === 'producao') {
      console.info(
        `[fiscal-focus-homolog-submit] producao bloqueada office=${officeIdParaLog(officeId)}`
      )
      return jsonResponse(
        {
          ok: false,
          code: 'FISCAL_PRODUCTION_BLOCKED',
          message: MSG_PRODUCAO_BLOQUEADA,
          erro: MSG_PRODUCAO_BLOQUEADA,
        },
        403
      )
    }
    if (ambiente !== 'homologacao') {
      console.info(
        `[fiscal-focus-homolog-submit] ambiente invalido office=${officeIdParaLog(officeId)}`
      )
      return jsonResponse(
        {
          ok: false,
          code: 'FISCAL_AMBIENTE_NAO_HOMOLOGACAO',
          message: MSG_AMBIENTE,
          erro: MSG_AMBIENTE,
        },
        403
      )
    }

    // Verifica presença do secret — nunca loga/retorna o valor
    const homologToken = Deno.env.get('FOCUS_NFE_HOMOLOG_TOKEN')?.trim()
    if (!homologToken) {
      console.warn(
        `[fiscal-focus-homolog-submit] FOCUS_NFE_HOMOLOG_TOKEN ausente office=${officeIdParaLog(officeId)}`
      )
      return jsonResponse(
        {
          ok: false,
          code: 'FOCUS_HOMOLOG_TOKEN_MISSING',
          message: MSG_TOKEN_AUSENTE,
          erro: MSG_TOKEN_AUSENTE,
        },
        503
      )
    }

    // F6C.1 — skeleton: sem fetch Focus, sem Basic Auth ativo, sem persistência
    console.info(
      `[fiscal-focus-homolog-submit] skeleton ok office=${officeIdParaLog(officeId)} mode=homolog_skeleton`
    )

    return jsonResponse({
      ok: true,
      mode: 'homolog_skeleton',
      message:
        'Homologação fiscal preparada. Chamada externa ainda desativada nesta etapa.',
      next_step: 'F6C.2',
      ambiente: 'homologacao',
      chamada_externa: 'desativada',
      emissao: 'desativada',
    })
  } catch (e) {
    console.error(
      '[fiscal-focus-homolog-submit] erro interno',
      e instanceof Error ? e.message : 'unknown'
    )
    return jsonResponse({ ok: false, erro: MSG_ERRO_INTERNO }, 503)
  }
})
