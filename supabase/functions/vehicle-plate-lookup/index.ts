/**
 * Edge Function: vehicle-plate-lookup (Etapa 2B + 4L)
 *
 * Integração preparada com API PLACAS v3 (/basico/{placa}).
 * Etapa 4L + 5E.52: consulta real comercial via PLATE_LOOKUP_REAL_OFFICES (allowlist).
 * PLATE_LOOKUP_ENABLED=true bloqueia todo o endpoint (simulação, piloto e comercial).
 * Piloto técnico (PLATE_LOOKUP_REAL_PILOT) permanece isolado.
 *
 * Dry-run (reserva + cancelamento):
 * - Só se SUPABASE_URL for o host Homolog e PLATE_LOOKUP_DRY_RUN === "true"
 *   (secret/env de backend; ignorar body/query/header do cliente).
 * - begin com JWT do usuário; finalize com service_role (clientes separados).
 *
 * Simulação de sucesso (Homolog + oficina fictícia + ZZZ9Z99 ou ZZZ9Z98):
 * - Secret backend PLATE_LOOKUP_SIMULATE === "true". Cliente não ativa.
 * - PLATE_LOOKUP_ENABLED=true bloqueia simulação e modo real.
 * - finalize success + api_called=false; sem consumo; sem fornecedor.
 *
 * Simulação not_found (Homolog + oficina fictícia + ZZZ9Z00):
 * - Mesmos gates. finalize not_found + api_called=false.
 * - HTTP 404 PLATE_LOOKUP_SIMULATED_NOT_FOUND; sem dados de veículo.
 *
 * Simulação timeout (Homolog + oficina fictícia + ZZZ8Z99):
 * - Mesmos gates. finalize timeout + api_called=false.
 * - HTTP 503 PLATE_LOOKUP_SIMULATED_TIMEOUT; sem dados de veículo.
 *
 * Simulação api_error (Homolog + oficina fictícia + ZZZ7Z99):
 * - Mesmos gates. finalize api_error + api_called=false.
 * - HTTP 503 PLATE_LOOKUP_SIMULATED_ERROR; sem dados de veículo.
 *
 * - Auth JWT + profile.active + office_id (via RLS)
 * - Somente Homologação (ref cqnktgouczyrxkkeusio)
 * - Secret: API_PLACAS_TOKEN (server-side; nunca logar/retornar)
 */

import { adminClient, handleOptions, jsonResponse, userClient } from '../_shared/approval-common.ts'
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

/** Ref do projeto Supabase Homolog — bloqueia uso acidental em Produção. */
const HOMOLOG_PROJECT_REF = 'cqnktgouczyrxkkeusio'

const ENV_API_PLACAS_TOKEN = 'API_PLACAS_TOKEN'
const ENV_PLATE_LOOKUP_ENABLED = 'PLATE_LOOKUP_ENABLED'
/** Backend-only. Nunca ler de body/query/header. */
const ENV_PLATE_LOOKUP_DRY_RUN = 'PLATE_LOOKUP_DRY_RUN'
/** Backend-only. Sucesso fictício só na oficina de teste Homolog. */
const ENV_PLATE_LOOKUP_SIMULATE = 'PLATE_LOOKUP_SIMULATE'
/** Backend-only. Piloto de consulta real (não substitui PLATE_LOOKUP_ENABLED). */
const ENV_PLATE_LOOKUP_REAL_PILOT = 'PLATE_LOOKUP_REAL_PILOT'
/** Backend-only. Placa única autorizada no piloto real (normalizada). */
const ENV_PLATE_LOOKUP_REAL_PILOT_PLACA = 'PLATE_LOOKUP_REAL_PILOT_PLACA'
/**
 * Backend-only. Chave de idempotência fixa do piloto (autorização persistente via UNIQUE office+key).
 * Não vem do cliente.
 */
const ENV_PLATE_LOOKUP_REAL_PILOT_AUTH_KEY = 'PLATE_LOOKUP_REAL_PILOT_AUTHORIZATION_KEY'
/**
 * Backend-only. Lista de office_id (UUID) autorizados para consulta real comercial.
 * Separador: vírgula, ponto-e-vírgula ou espaço. Ausente/vazio/inválido = modo comercial desligado.
 * Não substitui PLATE_LOOKUP_ENABLED (que continua bloqueando o ambiente inteiro quando true).
 */
const ENV_PLATE_LOOKUP_REAL_OFFICES = 'PLATE_LOOKUP_REAL_OFFICES'

const HOMOLOG_SUPABASE_HOST = `${HOMOLOG_PROJECT_REF}.supabase.co`

/** URL base fixa — não aceitar URLs do cliente. */
const API_PLACAS_V3_BASE = 'https://wdapi2.com.br/v3'

const FETCH_TIMEOUT_MS = 15_000

const MSG_NAO_AUTH = 'Não autenticado.'
const MSG_SESSAO = 'Sessão inválida.'
const MSG_PERFIL = 'Perfil ou oficina inválidos.'
const MSG_PRODUCAO_BLOQUEADA =
  'Consulta por placa não está habilitada neste ambiente.'
const MSG_PLACA_OBRIGATORIA = 'Informe a placa no corpo da requisição.'
const MSG_PLACA_INVALIDA = 'Placa inválida. Use formato antigo ou Mercosul.'
const MSG_INTEGRACAO_INDISPONIVEL = 'Consulta por placa ainda não está ativa.'
const MSG_PLACA_NAO_ENCONTRADA = 'Nenhum veículo encontrado para esta placa.'
const MSG_ERRO_INTERNO = 'Consulta por placa indisponível no momento.'
const MSG_SERVICO_INDISPONIVEL =
  'Serviço de consulta por placa temporariamente indisponível.'
const MSG_MODO_REAL_BLOQUEADO =
  'Consulta real por placa ainda não está liberada neste ambiente.'
const MSG_IDEMPOTENCY_INVALID =
  'Chave de idempotência inválida. Use 1 a 128 caracteres (letras, números, . _ : -).'
const MSG_QUOTA_EXCEDIDA =
  'A franquia de consultas por placa deste ciclo foi atingida.'
const MSG_TRIAL_EXPIRADO = 'O período de trial da oficina expirou.'
const MSG_RATE_LIMIT =
  'Limite temporário de consultas atingido. Tente novamente em alguns minutos.'
const MSG_OVERAGE_CONSENT =
  'É necessário o aceite de cobrança excedente para continuar neste ciclo.'
const MSG_BEGIN_FALHOU = 'Não foi possível reservar a consulta. Tente novamente.'
const MSG_FINALIZE_PENDENTE =
  'A reserva foi criada, mas a liberação não foi confirmada. Repita a mesma requisição com a mesma chave de idempotência.'
const MSG_RESERVA_EXPIRADA =
  'Esta tentativa expirou. Envie uma nova chave de idempotência para uma nova reserva.'
const MSG_REPLAY_INCOMPATIVEL =
  'Esta chave de idempotência já foi usada e não pode iniciar um dry-run.'
const MSG_DRY_RUN_CONFIG =
  'Dry-run de consulta por placa indisponível no momento.'
const MSG_API_JA_INICIADA =
  'Esta consulta já registrou início de chamada externa e não pode ser cancelada como dry-run.'
const MSG_ESTADO_INCERTO =
  'O estado da reserva não permite concluir o dry-run. Não inicie uma nova tentativa.'
const MSG_REPLAY_SIM_INCOMPATIVEL =
  'Esta chave de idempotência já foi usada e não corresponde a uma simulação confirmada.'
const MSG_SIMULACAO_PENDENTE =
  'A reserva foi criada, mas a simulação não foi confirmada. Não inicie uma nova tentativa.'
const MSG_SIMULACAO_CONFIG =
  'Simulação de consulta por placa indisponível no momento.'
const MSG_REAL_PILOT_CONFIG =
  'Piloto de consulta real indisponível no momento.'
const MSG_REAL_PILOT_JA_USADO =
  'O piloto de consulta real já registrou chamada ao fornecedor nesta oficina.'
const MSG_REAL_PILOT_INCERTO =
  'Há uma tentativa de consulta real em aberto. Não inicie outra chamada.'
const MSG_REAL_PILOT_BLOQUEADO =
  'Consulta real por placa indisponível neste ambiente.'
const MSG_REAL_COMMERCIAL_CONFIG =
  'Consulta real por placa indisponível no momento.'
const MSG_REAL_COMMERCIAL_OFFICE_DENIED =
  'Consulta real por placa não está liberada para esta oficina.'
const MSG_REAL_COMMERCIAL_INCERTO =
  'Há uma tentativa de consulta em aberto. Não inicie outra chamada.'

const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9._:-]{1,128}$/
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const RESULT_CODE_DRY_RUN = 'homolog_edge_dry_run_no_api'
const RESULT_CODE_SIMULATE = 'homolog_edge_simulate_no_api'
const RESULT_CODE_SIMULATE_NOT_FOUND = 'homolog_edge_simulate_not_found'
const RESULT_CODE_SIMULATE_TIMEOUT = 'homolog_edge_simulate_timeout'
const RESULT_CODE_SIMULATE_API_ERROR = 'homolog_edge_simulate_api_error'
const RESULT_SOURCE_SIMULATE = 'plate-lookup-edge-simulate'
const RESULT_SOURCE_REAL_PILOT = 'plate-lookup-edge-real-pilot'
const RESULT_SOURCE_REAL_COMMERCIAL = 'plate-lookup-edge-real-commercial'
const RESULT_CODE_REAL_OK = 'PLATE_LOOKUP_OK'
const RESULT_SCENARIO_NOT_FOUND = 'not_found'
const RESULT_SCENARIO_TIMEOUT = 'timeout'
const RESULT_SCENARIO_API_ERROR = 'api_error'

const SIMULATE_OFFICE_ID = '486d31e8-3bad-4c6b-95c0-3a5757b6066b'
const SIMULATE_PLACA = 'ZZZ9Z99'
/** Segundo sucesso simulado — placa ausente do cadastro fictício da oficina de teste. */
const SIMULATE_PLACA_SUCESSO_2 = 'ZZZ9Z98'
const SIMULATE_PLACA_NOT_FOUND = 'ZZZ9Z00'
const SIMULATE_PLACA_TIMEOUT = 'ZZZ8Z99'
const SIMULATE_PLACA_API_ERROR = 'ZZZ7Z99'

const PLACA_ANTIGA_RE = /^[A-Z]{3}\d{4}$/
const PLACA_MERCOSUL_RE = /^[A-Z]{3}\d[A-Z]\d{2}$/

/** Resposta normalizada para o frontend (Etapa 3+). */
type DadosVeiculoConsultaResposta = {
  placa: string
  marca?: string
  modelo?: string
  ano?: number
  cor?: string
  municipio?: string
  uf?: string
  combustivel?: string
  fonte: 'api_placas' | 'simulacao_homolog'
}

type ProfileRow = {
  id: string
  office_id: string
  active: boolean | null
  role: string | null
}

type ResultadoConsultaApi =
  | { ok: true; dados: DadosVeiculoConsultaResposta }
  | { ok: false; httpStatus: number; code: string; message: string }

function normalizarPlaca(placa: string): string {
  return placa.trim().toUpperCase().replace(/[\s-]/g, '')
}

function ehPlacaBrasileiraValida(placa: string): boolean {
  const n = normalizarPlaca(placa)
  if (n.length !== 7) return false
  return PLACA_ANTIGA_RE.test(n) || PLACA_MERCOSUL_RE.test(n)
}

/** Host Homolog exato + HTTPS. Recusa substring, subdomínio extra e URL inválida. */
export function homologUrlAutorizada(raw: string | undefined | null): boolean {
  const url = raw?.trim() ?? ''
  if (!url) return false
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && parsed.hostname === HOMOLOG_SUPABASE_HOST
  } catch {
    return false
  }
}

function ambienteHomologAutorizado(): boolean {
  return homologUrlAutorizada(Deno.env.get('SUPABASE_URL'))
}

export function consultaExternaHabilitada(): boolean {
  return Deno.env.get(ENV_PLATE_LOOKUP_ENABLED)?.trim() === 'true'
}

/** Dry-run só por env de backend + mesmo gate Homolog. Cliente não ativa. */
function dryRunHabilitado(): boolean {
  return (
    ambienteHomologAutorizado() &&
    Deno.env.get(ENV_PLATE_LOOKUP_DRY_RUN)?.trim() === 'true'
  )
}

/** Dados fictícios fixos por placa de sucesso — nunca apresentados como consulta real. */
export function dadosVeiculoSimulado(
  placaNorm: string
): DadosVeiculoConsultaResposta | null {
  if (placaNorm === SIMULATE_PLACA) {
    return {
      placa: SIMULATE_PLACA,
      marca: 'SIMULADO',
      modelo: 'VEICULO FICTICIO',
      ano: 2020,
      cor: 'CINZA',
      municipio: 'HOMOLOG',
      uf: 'SP',
      combustivel: 'FLEX',
      fonte: 'simulacao_homolog',
    }
  }
  if (placaNorm === SIMULATE_PLACA_SUCESSO_2) {
    return {
      placa: SIMULATE_PLACA_SUCESSO_2,
      marca: 'SIMULADO',
      modelo: 'VEICULO FICTICIO 2',
      ano: 2021,
      cor: 'AZUL',
      municipio: 'HOMOLOG',
      uf: 'SP',
      combustivel: 'FLEX',
      fonte: 'simulacao_homolog',
    }
  }
  return null
}

export function cenarioSimulacao(
  placaNorm: string
): 'success' | 'not_found' | 'timeout' | 'api_error' | null {
  if (placaNorm === SIMULATE_PLACA || placaNorm === SIMULATE_PLACA_SUCESSO_2) {
    return 'success'
  }
  if (placaNorm === SIMULATE_PLACA_NOT_FOUND) return 'not_found'
  if (placaNorm === SIMULATE_PLACA_TIMEOUT) return 'timeout'
  if (placaNorm === SIMULATE_PLACA_API_ERROR) return 'api_error'
  return null
}

/**
 * Simulação só no backend Homolog, oficina fictícia e placa autorizada.
 * ENABLED=true bloqueia. Cliente não ativa.
 */
export function simulacaoPermitida(opts: {
  homologUrl: string | undefined | null
  simulateEnv: string | undefined | null
  enabledEnv: string | undefined | null
  officeId: string
  placaNorm: string
}): boolean {
  if (opts.enabledEnv?.trim() === 'true') return false
  return (
    homologUrlAutorizada(opts.homologUrl) &&
    opts.simulateEnv?.trim() === 'true' &&
    opts.officeId === SIMULATE_OFFICE_ID &&
    cenarioSimulacao(opts.placaNorm) !== null
  )
}

function simulacaoHabilitada(officeId: string, placaNorm: string): boolean {
  return simulacaoPermitida({
    homologUrl: Deno.env.get('SUPABASE_URL'),
    simulateEnv: Deno.env.get(ENV_PLATE_LOOKUP_SIMULATE),
    enabledEnv: Deno.env.get(ENV_PLATE_LOOKUP_ENABLED),
    officeId,
    placaNorm,
  })
}

/** Interpreta PLATE_LOOKUP_REAL_OFFICES. Sem UUID válido → null (modo comercial desligado). */
export function parseRealOfficesAllowlist(
  raw: string | undefined | null
): Set<string> | null {
  const text = raw?.trim() ?? ''
  if (!text) return null
  const parts = text.split(/[,;\s]+/).map((p) => p.trim()).filter(Boolean)
  if (parts.length === 0) return null
  const set = new Set<string>()
  for (const part of parts) {
    if (!UUID_RE.test(part)) return null
    set.add(part.toLowerCase())
  }
  return set.size > 0 ? set : null
}

export function officeIdNaAllowlistConsultaReal(
  officeId: string,
  allowlist: Set<string>
): boolean {
  const norm = officeId.trim().toLowerCase()
  if (!UUID_RE.test(norm)) return false
  return allowlist.has(norm)
}

/** Allowlist ativa e oficina autenticada fora da lista → negação explícita (não cai em DISABLED genérico). */
export function deveNegarConsultaRealOficinaForaAllowlist(officeId: string): boolean {
  if (!homologUrlAutorizada(Deno.env.get('SUPABASE_URL'))) return false
  const allowlist = parseRealOfficesAllowlist(
    Deno.env.get(ENV_PLATE_LOOKUP_REAL_OFFICES)
  )
  if (!allowlist) return false
  return !officeIdNaAllowlistConsultaReal(officeId, allowlist)
}

export type CandidatoConsultaRealComercial =
  | 'nao_candidato'
  | 'config_invalida'
  | 'executar'

/**
 * Modo comercial: Homolog + allowlist + token fornecedor.
 * Não usa PLATE_LOOKUP_ENABLED. office_id vem do perfil, nunca do body.
 */
export function classificarCandidatoConsultaRealComercial(
  officeId: string
): CandidatoConsultaRealComercial {
  if (!homologUrlAutorizada(Deno.env.get('SUPABASE_URL'))) {
    return 'nao_candidato'
  }
  const allowlist = parseRealOfficesAllowlist(
    Deno.env.get(ENV_PLATE_LOOKUP_REAL_OFFICES)
  )
  if (!allowlist) return 'nao_candidato'
  if (!officeIdNaAllowlistConsultaReal(officeId, allowlist)) {
    return 'nao_candidato'
  }
  if (!Deno.env.get(ENV_API_PLACAS_TOKEN)?.trim()) return 'config_invalida'
  return 'executar'
}

export type ComercialReservaRejeitada =
  | { rejected: false }
  | { rejected: true; code: string; message: string; releaseEventId?: string }

/** Piloto comercial: só franquia incluída; excedente pago bloqueado mesmo com consentimento prévio. */
export function avaliarReservaConsultaRealComercial(
  beginPayload: Record<string, unknown>
): ComercialReservaRejeitada {
  if (beginPayload.ok === false) {
    const code = asTexto(beginPayload.code) ?? ''
    if (code === 'NEEDS_OVERAGE_CONSENT') {
      return {
        rejected: true,
        code: 'TRIAL_QUOTA_EXCEEDED',
        message: MSG_QUOTA_EXCEDIDA,
      }
    }
    return { rejected: false }
  }
  const bucket = asTexto(beginPayload.reserve_bucket)
  if (bucket === 'overage') {
    const eventId = asEventId(beginPayload.event_id)
    return {
      rejected: true,
      code: 'TRIAL_QUOTA_EXCEEDED',
      message: MSG_QUOTA_EXCEDIDA,
      releaseEventId: eventId ?? undefined,
    }
  }
  return { rejected: false }
}

export function mensagemBeginConsultaRealComercial(
  code: string,
  fallback: string
): string {
  if (code === 'NEEDS_OVERAGE_CONSENT') return MSG_QUOTA_EXCEDIDA
  return fallback
}

type RpcErroMapeado = {
  httpStatus: number
  code: string
  message: string
}

type IdempotencyParse =
  | { ok: true; key: string; generated: boolean }
  | { ok: false }

function parseIdempotencyKey(raw: unknown): IdempotencyParse {
  if (raw == null || raw === '') {
    return { ok: true, key: crypto.randomUUID(), generated: true }
  }
  if (typeof raw !== 'string') return { ok: false }
  const key = raw.trim()
  if (!IDEMPOTENCY_KEY_RE.test(key)) return { ok: false }
  return { ok: true, key, generated: false }
}

function asTexto(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function asBool(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value
  return undefined
}

function asEventId(value: unknown): string | null {
  const t = asTexto(value)
  return t && UUID_RE.test(t) ? t : null
}

/**
 * Replay de evento já finalizado só é dry-run OK com confirmação explícita
 * da RPC. Campo ausente ≠ false / none.
 */
export function replayFinalizadoPermiteDryRun(
  payload: Record<string, unknown>
): boolean {
  return confirmacaoDryRunFinalizado(payload)
}

/** Replay já finalizado: exige outcome persistido. Ausente ≠ none/false/cancelled. */
export function confirmacaoDryRunFinalizado(
  payload: Record<string, unknown>
): boolean {
  return (
    asTexto(payload.status) === 'finalized' &&
    asTexto(payload.outcome) === 'cancelled' &&
    asTexto(payload.billing_kind) === 'none' &&
    asBool(payload.consumed) === false
  )
}

/**
 * Primeira finalização: contrato de finalize_event (sem outcome).
 * idempotent_replay=true não é primeira finalização.
 */
export function confirmacaoPrimeiraFinalizacaoDryRun(
  payload: Record<string, unknown>,
  eventIdReservado: string
): boolean {
  return (
    asBool(payload.ok) === true &&
    asEventId(payload.event_id) === eventIdReservado &&
    asTexto(payload.status) === 'finalized' &&
    asTexto(payload.billing_kind) === 'none' &&
    asBool(payload.consumed) === false &&
    asBool(payload.idempotent_replay) !== true
  )
}

/** Primeira finalização simulada: mesmo contrato explícito de finalize (sem outcome). */
export function confirmacaoPrimeiraFinalizacaoSimulada(
  payload: Record<string, unknown>,
  eventIdReservado: string
): boolean {
  return confirmacaoPrimeiraFinalizacaoDryRun(payload, eventIdReservado)
}

export type DecisaoReservaDryRun =
  | { acao: 'cancelar' }
  | { acao: 'bloquear'; code: string; message: string; httpStatus: number }

/**
 * Só cancela dry-run quando a RPC prova que a API não começou:
 * allow_api_call===true, ou reserved expirada (RESERVATION_EXPIRED).
 * Campo ausente não é tratado como seguro.
 */
export function decidirCancelamentoDryRun(
  payload: Record<string, unknown>
): DecisaoReservaDryRun {
  const status = asTexto(payload.status)
  const allowApiCall = asBool(payload.allow_api_call)
  const apiCalled = asBool(payload.api_called)
  const blockedReason = asTexto(payload.api_call_blocked_reason)

  if (status !== 'reserved') {
    return {
      acao: 'bloquear',
      code: 'EVENT_STATE_UNKNOWN',
      message: MSG_ESTADO_INCERTO,
      httpStatus: 409,
    }
  }

  if (apiCalled === true || blockedReason === 'API_ALREADY_STARTED') {
    return {
      acao: 'bloquear',
      code: 'API_ALREADY_STARTED',
      message: MSG_API_JA_INICIADA,
      httpStatus: 409,
    }
  }

  if (allowApiCall === true) {
    return { acao: 'cancelar' }
  }

  if (blockedReason === 'RESERVATION_EXPIRED') {
    return { acao: 'cancelar' }
  }

  return {
    acao: 'bloquear',
    code: 'EVENT_STATE_UNKNOWN',
    message: MSG_ESTADO_INCERTO,
    httpStatus: 409,
  }
}

export function mapearErroBegin(message: string): RpcErroMapeado {
  const m = message.toLowerCase()
  if (m.includes('trial expired')) {
    return { httpStatus: 403, code: 'TRIAL_EXPIRED', message: MSG_TRIAL_EXPIRADO }
  }
  if (m.includes('trial quota exceeded')) {
    return { httpStatus: 403, code: 'TRIAL_QUOTA_EXCEEDED', message: MSG_QUOTA_EXCEDIDA }
  }
  if (m.includes('rate limit exceeded')) {
    return { httpStatus: 429, code: 'RATE_LIMIT', message: MSG_RATE_LIMIT }
  }
  if (m.includes('idempotency_key conflict')) {
    return { httpStatus: 409, code: 'IDEMPOTENCY_CONFLICT', message: MSG_REPLAY_INCOMPATIVEL }
  }
  if (m.includes('invalid plate')) {
    return { httpStatus: 400, code: 'PLATE_INVALID', message: MSG_PLACA_INVALIDA }
  }
  if (
    m.includes('profile') ||
    m.includes('office') ||
    m.includes('not authenticated')
  ) {
    return { httpStatus: 403, code: 'PROFILE_INVALID', message: MSG_PERFIL }
  }
  if (m.includes('idempotency_key required')) {
    return { httpStatus: 400, code: 'IDEMPOTENCY_INVALID', message: MSG_IDEMPOTENCY_INVALID }
  }
  return { httpStatus: 503, code: 'PLATE_LOOKUP_BEGIN_FAILED', message: MSG_BEGIN_FALHOU }
}

async function rpcBegin(
  userSb: SupabaseClient,
  placaNorm: string,
  idempotencyKey: string
): Promise<
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; mapped: RpcErroMapeado }
> {
  const { data, error } = await userSb.rpc('plate_lookup_begin', {
    p_placa: placaNorm,
    p_idempotency_key: idempotencyKey,
  })
  if (error) {
    return { ok: false, mapped: mapearErroBegin(error.message || '') }
  }
  const payload = asRecord(data)
  if (!payload) {
    return {
      ok: false,
      mapped: {
        httpStatus: 503,
        code: 'PLATE_LOOKUP_BEGIN_FAILED',
        message: MSG_BEGIN_FALHOU,
      },
    }
  }
  return { ok: true, payload }
}

async function rpcFinalizeCancelled(
  eventId: string
): Promise<
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; reason: 'config' | 'rpc' }
> {
  let privileged: SupabaseClient
  try {
    privileged = adminClient()
  } catch {
    return { ok: false, reason: 'config' }
  }

  const { data, error } = await privileged.rpc('plate_lookup_finalize_event', {
    p_event_id: eventId,
    p_outcome: 'cancelled',
    p_api_called: false,
    p_result_code: RESULT_CODE_DRY_RUN,
    p_api_provider_request_id: null,
    p_result_payload: {
      source: 'plate-lookup-edge-dry-run',
      note: 'no vendor call',
    },
  })
  if (error) return { ok: false, reason: 'rpc' }
  const payload = asRecord(data)
  if (!payload) return { ok: false, reason: 'rpc' }
  return { ok: true, payload }
}

async function rpcFinalizeSimulado(
  eventId: string,
  dados: DadosVeiculoConsultaResposta
): Promise<
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; reason: 'config' | 'rpc' }
> {
  let privileged: SupabaseClient
  try {
    privileged = adminClient()
  } catch {
    return { ok: false, reason: 'config' }
  }

  const { data, error } = await privileged.rpc('plate_lookup_finalize_event', {
    p_event_id: eventId,
    p_outcome: 'success',
    p_api_called: false,
    p_result_code: RESULT_CODE_SIMULATE,
    p_api_provider_request_id: null,
    p_result_payload: {
      source: RESULT_SOURCE_SIMULATE,
      note: 'simulated success, no vendor call',
      simulacao: true,
      dados,
    },
  })
  if (error) return { ok: false, reason: 'rpc' }
  const payload = asRecord(data)
  if (!payload) return { ok: false, reason: 'rpc' }
  return { ok: true, payload }
}

function respostaSimulacaoOk(
  dados: DadosVeiculoConsultaResposta,
  eventId: string,
  idempotencyKey: string,
  idempotentReplay: boolean
): Record<string, unknown> {
  return {
    ok: true,
    code: 'PLATE_LOOKUP_SIMULATED_OK',
    simulacao: true,
    event_id: eventId,
    status: 'finalized',
    billing_kind: 'none',
    consumed: false,
    idempotent_replay: idempotentReplay,
    idempotency_key: idempotencyKey,
    api_called: false,
    chamada_externa: 'desativada',
    dados,
  }
}

function respostaReplaySimBloqueado(idempotencyKey: string): Response {
  return jsonResponse(
    {
      ok: false,
      code: 'IDEMPOTENCY_REPLAY_BLOCKED',
      message: MSG_REPLAY_SIM_INCOMPATIVEL,
      erro: MSG_REPLAY_SIM_INCOMPATIVEL,
      idempotency_key: idempotencyKey,
    },
    409
  )
}

async function executarSimulacaoSucesso(
  userSb: SupabaseClient,
  placaNorm: string,
  idempotencyKey: string,
  requestId: string
): Promise<Response> {
  const begin = await rpcBegin(userSb, placaNorm, idempotencyKey)
  if (!begin.ok) {
    console.info(
      `[vehicle-plate-lookup] request_id=${requestId} code=${begin.mapped.code}`
    )
    return jsonResponse(
      {
        ok: false,
        code: begin.mapped.code,
        message: begin.mapped.message,
        erro: begin.mapped.message,
        idempotency_key: idempotencyKey,
      },
      begin.mapped.httpStatus
    )
  }

  const beginPayload = begin.payload
  if (beginPayload.ok === false) {
    const code = asTexto(beginPayload.code) ?? 'PLATE_LOOKUP_BEGIN_DENIED'
    if (code === 'IDEMPOTENCY_PLATE_MISMATCH') {
      console.info(
        `[vehicle-plate-lookup] request_id=${requestId} code=IDEMPOTENCY_PLATE_MISMATCH`
      )
      return respostaReplaySimBloqueado(idempotencyKey)
    }
    const message =
      code === 'NEEDS_OVERAGE_CONSENT' ? MSG_OVERAGE_CONSENT : MSG_BEGIN_FALHOU
    const httpStatus = code === 'NEEDS_OVERAGE_CONSENT' ? 403 : 409
    console.info(`[vehicle-plate-lookup] request_id=${requestId} code=${code}`)
    return jsonResponse(
      {
        ok: false,
        code,
        message,
        erro: message,
        idempotency_key: idempotencyKey,
      },
      httpStatus
    )
  }

  const eventId = asEventId(beginPayload.event_id)
  const status = asTexto(beginPayload.status)
  const replay = asBool(beginPayload.idempotent_replay) === true

  if (!eventId || !status) {
    console.info(
      `[vehicle-plate-lookup] request_id=${requestId} code=PLATE_LOOKUP_BEGIN_FAILED`
    )
    return jsonResponse(
      {
        ok: false,
        code: 'PLATE_LOOKUP_BEGIN_FAILED',
        message: MSG_BEGIN_FALHOU,
        erro: MSG_BEGIN_FALHOU,
        idempotency_key: idempotencyKey,
      },
      503
    )
  }

  if (replay && status === 'finalized') {
    if (!provaOrigemReplaySimulado(beginPayload)) {
      console.info(
        `[vehicle-plate-lookup] request_id=${requestId} code=IDEMPOTENCY_REPLAY_BLOCKED`
      )
      return respostaReplaySimBloqueado(idempotencyKey)
    }

    let replayPayload: Record<string, unknown> = beginPayload
    if (asBool(beginPayload.consumed) === undefined) {
      const dadosReplay = dadosVeiculoSimulado(placaNorm)
      if (!dadosReplay) {
        console.info(
          `[vehicle-plate-lookup] request_id=${requestId} code=IDEMPOTENCY_REPLAY_BLOCKED`
        )
        return respostaReplaySimBloqueado(idempotencyKey)
      }
      const confirm = await rpcFinalizeSimulado(eventId, dadosReplay)
      if (!confirm.ok) {
        console.info(
          `[vehicle-plate-lookup] request_id=${requestId} code=IDEMPOTENCY_REPLAY_BLOCKED`
        )
        return respostaReplaySimBloqueado(idempotencyKey)
      }
      replayPayload = {
        status: confirm.payload.status ?? beginPayload.status,
        outcome: beginPayload.outcome,
        billing_kind: confirm.payload.billing_kind,
        consumed: confirm.payload.consumed,
        result_code: beginPayload.result_code,
        result_payload:
          confirm.payload.result_payload ?? beginPayload.result_payload,
      }
    }

    if (!confirmacaoReplaySimulado(replayPayload)) {
      console.info(
        `[vehicle-plate-lookup] request_id=${requestId} code=IDEMPOTENCY_REPLAY_BLOCKED`
      )
      return respostaReplaySimBloqueado(idempotencyKey)
    }

    const dados = dadosSimuladosPersistidos(replayPayload)
    if (!dados) {
      console.info(
        `[vehicle-plate-lookup] request_id=${requestId} code=IDEMPOTENCY_REPLAY_BLOCKED`
      )
      return respostaReplaySimBloqueado(idempotencyKey)
    }
    console.info(
      `[vehicle-plate-lookup] request_id=${requestId} code=PLATE_LOOKUP_SIMULATED_REPLAY`
    )
    return jsonResponse(respostaSimulacaoOk(dados, eventId, idempotencyKey, true))
  }

  if (replay && status !== 'reserved') {
    const expired =
      status === 'expired_released' ||
      asTexto(beginPayload.api_call_blocked_reason) === 'RESERVATION_EXPIRED'
    const code = expired ? 'RESERVATION_EXPIRED' : 'IDEMPOTENCY_REPLAY_BLOCKED'
    console.info(`[vehicle-plate-lookup] request_id=${requestId} code=${code}`)
    return jsonResponse(
      {
        ok: false,
        code,
        message: expired ? MSG_RESERVA_EXPIRADA : MSG_REPLAY_SIM_INCOMPATIVEL,
        erro: expired ? MSG_RESERVA_EXPIRADA : MSG_REPLAY_SIM_INCOMPATIVEL,
        idempotency_key: idempotencyKey,
      },
      409
    )
  }

  if (status !== 'reserved') {
    console.info(
      `[vehicle-plate-lookup] request_id=${requestId} code=PLATE_LOOKUP_BEGIN_FAILED`
    )
    return jsonResponse(
      {
        ok: false,
        code: 'PLATE_LOOKUP_BEGIN_FAILED',
        message: MSG_BEGIN_FALHOU,
        erro: MSG_BEGIN_FALHOU,
        idempotency_key: idempotencyKey,
      },
      503
    )
  }

  const decisao = decidirCancelamentoDryRun(beginPayload)
  if (decisao.acao === 'bloquear') {
    console.info(
      `[vehicle-plate-lookup] request_id=${requestId} code=${decisao.code}`
    )
    return jsonResponse(
      {
        ok: false,
        code: decisao.code,
        message: decisao.message,
        erro: decisao.message,
        idempotency_key: idempotencyKey,
      },
      decisao.httpStatus
    )
  }

  const dados = dadosVeiculoSimulado(placaNorm)
  if (!dados) {
    console.info(
      `[vehicle-plate-lookup] request_id=${requestId} code=PLATE_LOOKUP_BEGIN_FAILED`
    )
    return jsonResponse(
      {
        ok: false,
        code: 'PLATE_LOOKUP_BEGIN_FAILED',
        message: MSG_BEGIN_FALHOU,
        erro: MSG_BEGIN_FALHOU,
        idempotency_key: idempotencyKey,
      },
      503
    )
  }
  const finalize = await rpcFinalizeSimulado(eventId, dados)
  if (!finalize.ok) {
    console.info(
      `[vehicle-plate-lookup] request_id=${requestId} code=PLATE_LOOKUP_FINALIZE_PENDING`
    )
    return respostaFinalizeIncerto(
      eventId,
      idempotencyKey,
      finalize.reason === 'config' ? MSG_SIMULACAO_CONFIG : MSG_SIMULACAO_PENDENTE,
      undefined
    )
  }

  if (!confirmacaoPrimeiraFinalizacaoSimulada(finalize.payload, eventId)) {
    console.info(
      `[vehicle-plate-lookup] request_id=${requestId} code=PLATE_LOOKUP_FINALIZE_PENDING`
    )
    return respostaFinalizeIncerto(
      eventId,
      idempotencyKey,
      MSG_SIMULACAO_PENDENTE,
      asTexto(finalize.payload.status)
    )
  }

  console.info(
    `[vehicle-plate-lookup] request_id=${requestId} code=PLATE_LOOKUP_SIMULATED_OK`
  )
  return jsonResponse(respostaSimulacaoOk(dados, eventId, idempotencyKey, false))
}

async function rpcFinalizeSimuladoNotFound(
  eventId: string
): Promise<
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; reason: 'config' | 'rpc' }
> {
  let privileged: SupabaseClient
  try {
    privileged = adminClient()
  } catch {
    return { ok: false, reason: 'config' }
  }

  const { data, error } = await privileged.rpc('plate_lookup_finalize_event', {
    p_event_id: eventId,
    p_outcome: 'not_found',
    p_api_called: false,
    p_result_code: RESULT_CODE_SIMULATE_NOT_FOUND,
    p_api_provider_request_id: null,
    p_result_payload: {
      source: RESULT_SOURCE_SIMULATE,
      scenario: RESULT_SCENARIO_NOT_FOUND,
      note: 'simulated not_found, no vendor call',
      simulacao: true,
    },
  })
  if (error) return { ok: false, reason: 'rpc' }
  const payload = asRecord(data)
  if (!payload) return { ok: false, reason: 'rpc' }
  return { ok: true, payload }
}

export function respostaSimulacaoNotFound(
  eventId: string,
  idempotencyKey: string,
  idempotentReplay: boolean
): Record<string, unknown> {
  return {
    ok: false,
    code: 'PLATE_LOOKUP_SIMULATED_NOT_FOUND',
    simulacao: true,
    event_id: eventId,
    status: 'finalized',
    billing_kind: 'none',
    consumed: false,
    idempotent_replay: idempotentReplay,
    idempotency_key: idempotencyKey,
    api_called: false,
    chamada_externa: 'desativada',
    message: MSG_PLACA_NAO_ENCONTRADA,
    erro: MSG_PLACA_NAO_ENCONTRADA,
  }
}

async function executarSimulacaoNotFound(
  userSb: SupabaseClient,
  placaNorm: string,
  idempotencyKey: string,
  requestId: string
): Promise<Response> {
  const begin = await rpcBegin(userSb, placaNorm, idempotencyKey)
  if (!begin.ok) {
    console.info(
      `[vehicle-plate-lookup] request_id=${requestId} code=${begin.mapped.code}`
    )
    return jsonResponse(
      {
        ok: false,
        code: begin.mapped.code,
        message: begin.mapped.message,
        erro: begin.mapped.message,
        idempotency_key: idempotencyKey,
      },
      begin.mapped.httpStatus
    )
  }

  const beginPayload = begin.payload
  if (beginPayload.ok === false) {
    const code = asTexto(beginPayload.code) ?? 'PLATE_LOOKUP_BEGIN_DENIED'
    if (code === 'IDEMPOTENCY_PLATE_MISMATCH') {
      console.info(
        `[vehicle-plate-lookup] request_id=${requestId} code=IDEMPOTENCY_PLATE_MISMATCH`
      )
      return respostaReplaySimBloqueado(idempotencyKey)
    }
    const message =
      code === 'NEEDS_OVERAGE_CONSENT' ? MSG_OVERAGE_CONSENT : MSG_BEGIN_FALHOU
    const httpStatus = code === 'NEEDS_OVERAGE_CONSENT' ? 403 : 409
    console.info(`[vehicle-plate-lookup] request_id=${requestId} code=${code}`)
    return jsonResponse(
      {
        ok: false,
        code,
        message,
        erro: message,
        idempotency_key: idempotencyKey,
      },
      httpStatus
    )
  }

  const eventId = asEventId(beginPayload.event_id)
  const status = asTexto(beginPayload.status)
  const replay = asBool(beginPayload.idempotent_replay) === true

  if (!eventId || !status) {
    console.info(
      `[vehicle-plate-lookup] request_id=${requestId} code=PLATE_LOOKUP_BEGIN_FAILED`
    )
    return jsonResponse(
      {
        ok: false,
        code: 'PLATE_LOOKUP_BEGIN_FAILED',
        message: MSG_BEGIN_FALHOU,
        erro: MSG_BEGIN_FALHOU,
        idempotency_key: idempotencyKey,
      },
      503
    )
  }

  if (replay && status === 'finalized') {
    if (!provaOrigemReplaySimuladoNotFound(beginPayload)) {
      console.info(
        `[vehicle-plate-lookup] request_id=${requestId} code=IDEMPOTENCY_REPLAY_BLOCKED`
      )
      return respostaReplaySimBloqueado(idempotencyKey)
    }

    let replayPayload: Record<string, unknown> = beginPayload
    if (asBool(beginPayload.consumed) === undefined) {
      const confirm = await rpcFinalizeSimuladoNotFound(eventId)
      if (!confirm.ok) {
        console.info(
          `[vehicle-plate-lookup] request_id=${requestId} code=IDEMPOTENCY_REPLAY_BLOCKED`
        )
        return respostaReplaySimBloqueado(idempotencyKey)
      }
      replayPayload = {
        status: confirm.payload.status ?? beginPayload.status,
        outcome: beginPayload.outcome,
        billing_kind: confirm.payload.billing_kind,
        consumed: confirm.payload.consumed,
        result_code: beginPayload.result_code,
        result_payload:
          confirm.payload.result_payload ?? beginPayload.result_payload,
      }
    }

    if (!confirmacaoReplaySimuladoNotFound(replayPayload)) {
      console.info(
        `[vehicle-plate-lookup] request_id=${requestId} code=IDEMPOTENCY_REPLAY_BLOCKED`
      )
      return respostaReplaySimBloqueado(idempotencyKey)
    }

    console.info(
      `[vehicle-plate-lookup] request_id=${requestId} code=PLATE_LOOKUP_SIMULATED_NOT_FOUND_REPLAY`
    )
    return jsonResponse(
      respostaSimulacaoNotFound(eventId, idempotencyKey, true),
      404
    )
  }

  if (replay && status !== 'reserved') {
    const expired =
      status === 'expired_released' ||
      asTexto(beginPayload.api_call_blocked_reason) === 'RESERVATION_EXPIRED'
    const code = expired ? 'RESERVATION_EXPIRED' : 'IDEMPOTENCY_REPLAY_BLOCKED'
    console.info(`[vehicle-plate-lookup] request_id=${requestId} code=${code}`)
    return jsonResponse(
      {
        ok: false,
        code,
        message: expired ? MSG_RESERVA_EXPIRADA : MSG_REPLAY_SIM_INCOMPATIVEL,
        erro: expired ? MSG_RESERVA_EXPIRADA : MSG_REPLAY_SIM_INCOMPATIVEL,
        idempotency_key: idempotencyKey,
      },
      409
    )
  }

  if (status !== 'reserved') {
    console.info(
      `[vehicle-plate-lookup] request_id=${requestId} code=PLATE_LOOKUP_BEGIN_FAILED`
    )
    return jsonResponse(
      {
        ok: false,
        code: 'PLATE_LOOKUP_BEGIN_FAILED',
        message: MSG_BEGIN_FALHOU,
        erro: MSG_BEGIN_FALHOU,
        idempotency_key: idempotencyKey,
      },
      503
    )
  }

  const decisao = decidirCancelamentoDryRun(beginPayload)
  if (decisao.acao === 'bloquear') {
    console.info(
      `[vehicle-plate-lookup] request_id=${requestId} code=${decisao.code}`
    )
    return jsonResponse(
      {
        ok: false,
        code: decisao.code,
        message: decisao.message,
        erro: decisao.message,
        idempotency_key: idempotencyKey,
      },
      decisao.httpStatus
    )
  }

  const finalize = await rpcFinalizeSimuladoNotFound(eventId)
  if (!finalize.ok) {
    console.info(
      `[vehicle-plate-lookup] request_id=${requestId} code=PLATE_LOOKUP_FINALIZE_PENDING`
    )
    return respostaFinalizeIncerto(
      eventId,
      idempotencyKey,
      finalize.reason === 'config' ? MSG_SIMULACAO_CONFIG : MSG_SIMULACAO_PENDENTE,
      undefined
    )
  }

  if (!confirmacaoPrimeiraFinalizacaoSimulada(finalize.payload, eventId)) {
    console.info(
      `[vehicle-plate-lookup] request_id=${requestId} code=PLATE_LOOKUP_FINALIZE_PENDING`
    )
    return respostaFinalizeIncerto(
      eventId,
      idempotencyKey,
      MSG_SIMULACAO_PENDENTE,
      asTexto(finalize.payload.status)
    )
  }

  console.info(
    `[vehicle-plate-lookup] request_id=${requestId} code=PLATE_LOOKUP_SIMULATED_NOT_FOUND`
  )
  return jsonResponse(
    respostaSimulacaoNotFound(eventId, idempotencyKey, false),
    404
  )
}

async function rpcFinalizeSimuladoTimeout(
  eventId: string
): Promise<
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; reason: 'config' | 'rpc' }
> {
  let privileged: SupabaseClient
  try {
    privileged = adminClient()
  } catch {
    return { ok: false, reason: 'config' }
  }

  const { data, error } = await privileged.rpc('plate_lookup_finalize_event', {
    p_event_id: eventId,
    p_outcome: 'timeout',
    p_api_called: false,
    p_result_code: RESULT_CODE_SIMULATE_TIMEOUT,
    p_api_provider_request_id: null,
    p_result_payload: {
      source: RESULT_SOURCE_SIMULATE,
      scenario: RESULT_SCENARIO_TIMEOUT,
      note: 'simulated timeout, no vendor call',
      simulacao: true,
    },
  })
  if (error) return { ok: false, reason: 'rpc' }
  const payload = asRecord(data)
  if (!payload) return { ok: false, reason: 'rpc' }
  return { ok: true, payload }
}

export function respostaSimulacaoTimeout(
  eventId: string,
  idempotencyKey: string,
  idempotentReplay: boolean
): Record<string, unknown> {
  return {
    ok: false,
    code: 'PLATE_LOOKUP_SIMULATED_TIMEOUT',
    simulacao: true,
    event_id: eventId,
    status: 'finalized',
    billing_kind: 'none',
    consumed: false,
    idempotent_replay: idempotentReplay,
    idempotency_key: idempotencyKey,
    api_called: false,
    chamada_externa: 'desativada',
    message: MSG_SERVICO_INDISPONIVEL,
    erro: MSG_SERVICO_INDISPONIVEL,
  }
}

async function executarSimulacaoTimeout(
  userSb: SupabaseClient,
  placaNorm: string,
  idempotencyKey: string,
  requestId: string
): Promise<Response> {
  const begin = await rpcBegin(userSb, placaNorm, idempotencyKey)
  if (!begin.ok) {
    console.info(
      `[vehicle-plate-lookup] request_id=${requestId} code=${begin.mapped.code}`
    )
    return jsonResponse(
      {
        ok: false,
        code: begin.mapped.code,
        message: begin.mapped.message,
        erro: begin.mapped.message,
        idempotency_key: idempotencyKey,
      },
      begin.mapped.httpStatus
    )
  }

  const beginPayload = begin.payload
  if (beginPayload.ok === false) {
    const code = asTexto(beginPayload.code) ?? 'PLATE_LOOKUP_BEGIN_DENIED'
    if (code === 'IDEMPOTENCY_PLATE_MISMATCH') {
      console.info(
        `[vehicle-plate-lookup] request_id=${requestId} code=IDEMPOTENCY_PLATE_MISMATCH`
      )
      return respostaReplaySimBloqueado(idempotencyKey)
    }
    const message =
      code === 'NEEDS_OVERAGE_CONSENT' ? MSG_OVERAGE_CONSENT : MSG_BEGIN_FALHOU
    const httpStatus = code === 'NEEDS_OVERAGE_CONSENT' ? 403 : 409
    console.info(`[vehicle-plate-lookup] request_id=${requestId} code=${code}`)
    return jsonResponse(
      {
        ok: false,
        code,
        message,
        erro: message,
        idempotency_key: idempotencyKey,
      },
      httpStatus
    )
  }

  const eventId = asEventId(beginPayload.event_id)
  const status = asTexto(beginPayload.status)
  const replay = asBool(beginPayload.idempotent_replay) === true

  if (!eventId || !status) {
    console.info(
      `[vehicle-plate-lookup] request_id=${requestId} code=PLATE_LOOKUP_BEGIN_FAILED`
    )
    return jsonResponse(
      {
        ok: false,
        code: 'PLATE_LOOKUP_BEGIN_FAILED',
        message: MSG_BEGIN_FALHOU,
        erro: MSG_BEGIN_FALHOU,
        idempotency_key: idempotencyKey,
      },
      503
    )
  }

  if (replay && status === 'finalized') {
    if (!provaOrigemReplaySimuladoTimeout(beginPayload)) {
      console.info(
        `[vehicle-plate-lookup] request_id=${requestId} code=IDEMPOTENCY_REPLAY_BLOCKED`
      )
      return respostaReplaySimBloqueado(idempotencyKey)
    }

    let replayPayload: Record<string, unknown> = beginPayload
    if (asBool(beginPayload.consumed) === undefined) {
      const confirm = await rpcFinalizeSimuladoTimeout(eventId)
      if (!confirm.ok) {
        console.info(
          `[vehicle-plate-lookup] request_id=${requestId} code=IDEMPOTENCY_REPLAY_BLOCKED`
        )
        return respostaReplaySimBloqueado(idempotencyKey)
      }
      replayPayload = {
        status: confirm.payload.status ?? beginPayload.status,
        outcome: beginPayload.outcome,
        billing_kind: confirm.payload.billing_kind,
        consumed: confirm.payload.consumed,
        result_code: beginPayload.result_code,
        result_payload:
          confirm.payload.result_payload ?? beginPayload.result_payload,
      }
    }

    if (!confirmacaoReplaySimuladoTimeout(replayPayload)) {
      console.info(
        `[vehicle-plate-lookup] request_id=${requestId} code=IDEMPOTENCY_REPLAY_BLOCKED`
      )
      return respostaReplaySimBloqueado(idempotencyKey)
    }

    console.info(
      `[vehicle-plate-lookup] request_id=${requestId} code=PLATE_LOOKUP_SIMULATED_TIMEOUT_REPLAY`
    )
    return jsonResponse(
      respostaSimulacaoTimeout(eventId, idempotencyKey, true),
      503
    )
  }

  if (replay && status !== 'reserved') {
    const expired =
      status === 'expired_released' ||
      asTexto(beginPayload.api_call_blocked_reason) === 'RESERVATION_EXPIRED'
    const code = expired ? 'RESERVATION_EXPIRED' : 'IDEMPOTENCY_REPLAY_BLOCKED'
    console.info(`[vehicle-plate-lookup] request_id=${requestId} code=${code}`)
    return jsonResponse(
      {
        ok: false,
        code,
        message: expired ? MSG_RESERVA_EXPIRADA : MSG_REPLAY_SIM_INCOMPATIVEL,
        erro: expired ? MSG_RESERVA_EXPIRADA : MSG_REPLAY_SIM_INCOMPATIVEL,
        idempotency_key: idempotencyKey,
      },
      409
    )
  }

  if (status !== 'reserved') {
    console.info(
      `[vehicle-plate-lookup] request_id=${requestId} code=PLATE_LOOKUP_BEGIN_FAILED`
    )
    return jsonResponse(
      {
        ok: false,
        code: 'PLATE_LOOKUP_BEGIN_FAILED',
        message: MSG_BEGIN_FALHOU,
        erro: MSG_BEGIN_FALHOU,
        idempotency_key: idempotencyKey,
      },
      503
    )
  }

  const decisao = decidirCancelamentoDryRun(beginPayload)
  if (decisao.acao === 'bloquear') {
    console.info(
      `[vehicle-plate-lookup] request_id=${requestId} code=${decisao.code}`
    )
    return jsonResponse(
      {
        ok: false,
        code: decisao.code,
        message: decisao.message,
        erro: decisao.message,
        idempotency_key: idempotencyKey,
      },
      decisao.httpStatus
    )
  }

  const finalize = await rpcFinalizeSimuladoTimeout(eventId)
  if (!finalize.ok) {
    console.info(
      `[vehicle-plate-lookup] request_id=${requestId} code=PLATE_LOOKUP_FINALIZE_PENDING`
    )
    return respostaFinalizeIncerto(
      eventId,
      idempotencyKey,
      finalize.reason === 'config' ? MSG_SIMULACAO_CONFIG : MSG_SIMULACAO_PENDENTE,
      undefined
    )
  }

  if (!confirmacaoPrimeiraFinalizacaoSimulada(finalize.payload, eventId)) {
    console.info(
      `[vehicle-plate-lookup] request_id=${requestId} code=PLATE_LOOKUP_FINALIZE_PENDING`
    )
    return respostaFinalizeIncerto(
      eventId,
      idempotencyKey,
      MSG_SIMULACAO_PENDENTE,
      asTexto(finalize.payload.status)
    )
  }

  console.info(
    `[vehicle-plate-lookup] request_id=${requestId} code=PLATE_LOOKUP_SIMULATED_TIMEOUT`
  )
  return jsonResponse(
    respostaSimulacaoTimeout(eventId, idempotencyKey, false),
    503
  )
}

async function rpcFinalizeSimuladoApiError(
  eventId: string
): Promise<
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; reason: 'config' | 'rpc' }
> {
  let privileged: SupabaseClient
  try {
    privileged = adminClient()
  } catch {
    return { ok: false, reason: 'config' }
  }

  const { data, error } = await privileged.rpc('plate_lookup_finalize_event', {
    p_event_id: eventId,
    p_outcome: 'api_error',
    p_api_called: false,
    p_result_code: RESULT_CODE_SIMULATE_API_ERROR,
    p_api_provider_request_id: null,
    p_result_payload: {
      source: RESULT_SOURCE_SIMULATE,
      scenario: RESULT_SCENARIO_API_ERROR,
      note: 'simulated api_error, no vendor call',
      simulacao: true,
    },
  })
  if (error) return { ok: false, reason: 'rpc' }
  const payload = asRecord(data)
  if (!payload) return { ok: false, reason: 'rpc' }
  return { ok: true, payload }
}

export function respostaSimulacaoApiError(
  eventId: string,
  idempotencyKey: string,
  idempotentReplay: boolean
): Record<string, unknown> {
  return {
    ok: false,
    code: 'PLATE_LOOKUP_SIMULATED_ERROR',
    simulacao: true,
    event_id: eventId,
    status: 'finalized',
    billing_kind: 'none',
    consumed: false,
    idempotent_replay: idempotentReplay,
    idempotency_key: idempotencyKey,
    api_called: false,
    chamada_externa: 'desativada',
    message: MSG_ERRO_INTERNO,
    erro: MSG_ERRO_INTERNO,
  }
}

async function executarSimulacaoApiError(
  userSb: SupabaseClient,
  placaNorm: string,
  idempotencyKey: string,
  requestId: string
): Promise<Response> {
  const begin = await rpcBegin(userSb, placaNorm, idempotencyKey)
  if (!begin.ok) {
    console.info(
      `[vehicle-plate-lookup] request_id=${requestId} code=${begin.mapped.code}`
    )
    return jsonResponse(
      {
        ok: false,
        code: begin.mapped.code,
        message: begin.mapped.message,
        erro: begin.mapped.message,
        idempotency_key: idempotencyKey,
      },
      begin.mapped.httpStatus
    )
  }

  const beginPayload = begin.payload
  if (beginPayload.ok === false) {
    const code = asTexto(beginPayload.code) ?? 'PLATE_LOOKUP_BEGIN_DENIED'
    if (code === 'IDEMPOTENCY_PLATE_MISMATCH') {
      console.info(
        `[vehicle-plate-lookup] request_id=${requestId} code=IDEMPOTENCY_PLATE_MISMATCH`
      )
      return respostaReplaySimBloqueado(idempotencyKey)
    }
    const message =
      code === 'NEEDS_OVERAGE_CONSENT' ? MSG_OVERAGE_CONSENT : MSG_BEGIN_FALHOU
    const httpStatus = code === 'NEEDS_OVERAGE_CONSENT' ? 403 : 409
    console.info(`[vehicle-plate-lookup] request_id=${requestId} code=${code}`)
    return jsonResponse(
      {
        ok: false,
        code,
        message,
        erro: message,
        idempotency_key: idempotencyKey,
      },
      httpStatus
    )
  }

  const eventId = asEventId(beginPayload.event_id)
  const status = asTexto(beginPayload.status)
  const replay = asBool(beginPayload.idempotent_replay) === true

  if (!eventId || !status) {
    console.info(
      `[vehicle-plate-lookup] request_id=${requestId} code=PLATE_LOOKUP_BEGIN_FAILED`
    )
    return jsonResponse(
      {
        ok: false,
        code: 'PLATE_LOOKUP_BEGIN_FAILED',
        message: MSG_BEGIN_FALHOU,
        erro: MSG_BEGIN_FALHOU,
        idempotency_key: idempotencyKey,
      },
      503
    )
  }

  if (replay && status === 'finalized') {
    if (!provaOrigemReplaySimuladoApiError(beginPayload)) {
      console.info(
        `[vehicle-plate-lookup] request_id=${requestId} code=IDEMPOTENCY_REPLAY_BLOCKED`
      )
      return respostaReplaySimBloqueado(idempotencyKey)
    }

    let replayPayload: Record<string, unknown> = beginPayload
    if (asBool(beginPayload.consumed) === undefined) {
      const confirm = await rpcFinalizeSimuladoApiError(eventId)
      if (!confirm.ok) {
        console.info(
          `[vehicle-plate-lookup] request_id=${requestId} code=IDEMPOTENCY_REPLAY_BLOCKED`
        )
        return respostaReplaySimBloqueado(idempotencyKey)
      }
      replayPayload = {
        status: confirm.payload.status ?? beginPayload.status,
        outcome: beginPayload.outcome,
        billing_kind: confirm.payload.billing_kind,
        consumed: confirm.payload.consumed,
        result_code: beginPayload.result_code,
        result_payload:
          confirm.payload.result_payload ?? beginPayload.result_payload,
      }
    }

    if (!confirmacaoReplaySimuladoApiError(replayPayload)) {
      console.info(
        `[vehicle-plate-lookup] request_id=${requestId} code=IDEMPOTENCY_REPLAY_BLOCKED`
      )
      return respostaReplaySimBloqueado(idempotencyKey)
    }

    console.info(
      `[vehicle-plate-lookup] request_id=${requestId} code=PLATE_LOOKUP_SIMULATED_ERROR_REPLAY`
    )
    return jsonResponse(
      respostaSimulacaoApiError(eventId, idempotencyKey, true),
      503
    )
  }

  if (replay && status !== 'reserved') {
    const expired =
      status === 'expired_released' ||
      asTexto(beginPayload.api_call_blocked_reason) === 'RESERVATION_EXPIRED'
    const code = expired ? 'RESERVATION_EXPIRED' : 'IDEMPOTENCY_REPLAY_BLOCKED'
    console.info(`[vehicle-plate-lookup] request_id=${requestId} code=${code}`)
    return jsonResponse(
      {
        ok: false,
        code,
        message: expired ? MSG_RESERVA_EXPIRADA : MSG_REPLAY_SIM_INCOMPATIVEL,
        erro: expired ? MSG_RESERVA_EXPIRADA : MSG_REPLAY_SIM_INCOMPATIVEL,
        idempotency_key: idempotencyKey,
      },
      409
    )
  }

  if (status !== 'reserved') {
    console.info(
      `[vehicle-plate-lookup] request_id=${requestId} code=PLATE_LOOKUP_BEGIN_FAILED`
    )
    return jsonResponse(
      {
        ok: false,
        code: 'PLATE_LOOKUP_BEGIN_FAILED',
        message: MSG_BEGIN_FALHOU,
        erro: MSG_BEGIN_FALHOU,
        idempotency_key: idempotencyKey,
      },
      503
    )
  }

  const decisao = decidirCancelamentoDryRun(beginPayload)
  if (decisao.acao === 'bloquear') {
    console.info(
      `[vehicle-plate-lookup] request_id=${requestId} code=${decisao.code}`
    )
    return jsonResponse(
      {
        ok: false,
        code: decisao.code,
        message: decisao.message,
        erro: decisao.message,
        idempotency_key: idempotencyKey,
      },
      decisao.httpStatus
    )
  }

  const finalize = await rpcFinalizeSimuladoApiError(eventId)
  if (!finalize.ok) {
    console.info(
      `[vehicle-plate-lookup] request_id=${requestId} code=PLATE_LOOKUP_FINALIZE_PENDING`
    )
    return respostaFinalizeIncerto(
      eventId,
      idempotencyKey,
      finalize.reason === 'config' ? MSG_SIMULACAO_CONFIG : MSG_SIMULACAO_PENDENTE,
      undefined
    )
  }

  if (!confirmacaoPrimeiraFinalizacaoSimulada(finalize.payload, eventId)) {
    console.info(
      `[vehicle-plate-lookup] request_id=${requestId} code=PLATE_LOOKUP_FINALIZE_PENDING`
    )
    return respostaFinalizeIncerto(
      eventId,
      idempotencyKey,
      MSG_SIMULACAO_PENDENTE,
      asTexto(finalize.payload.status)
    )
  }

  console.info(
    `[vehicle-plate-lookup] request_id=${requestId} code=PLATE_LOOKUP_SIMULATED_ERROR`
  )
  return jsonResponse(
    respostaSimulacaoApiError(eventId, idempotencyKey, false),
    503
  )
}

function respostaDryRunOk(
  payload: Record<string, unknown>,
  idempotencyKey: string,
  idempotentReplay: boolean
): Record<string, unknown> {
  return {
    ok: true,
    code: 'PLATE_LOOKUP_DRY_RUN_OK',
    event_id: payload.event_id,
    status: payload.status,
    billing_kind: payload.billing_kind,
    consumed: asBool(payload.consumed),
    idempotent_replay: idempotentReplay,
    idempotency_key: idempotencyKey,
    api_called: false,
    chamada_externa: 'desativada',
  }
}

function respostaReplayBloqueado(idempotencyKey: string): Response {
  return jsonResponse(
    {
      ok: false,
      code: 'IDEMPOTENCY_REPLAY_BLOCKED',
      message: MSG_REPLAY_INCOMPATIVEL,
      erro: MSG_REPLAY_INCOMPATIVEL,
      idempotency_key: idempotencyKey,
    },
    409
  )
}

async function executarDryRunReservaCancelamento(
  userSb: SupabaseClient,
  placaNorm: string,
  idempotencyKey: string,
  requestId: string
): Promise<Response> {
  const begin = await rpcBegin(userSb, placaNorm, idempotencyKey)
  if (!begin.ok) {
    console.info(
      `[vehicle-plate-lookup] request_id=${requestId} code=${begin.mapped.code}`
    )
    return jsonResponse(
      {
        ok: false,
        code: begin.mapped.code,
        message: begin.mapped.message,
        erro: begin.mapped.message,
        idempotency_key: idempotencyKey,
      },
      begin.mapped.httpStatus
    )
  }

  const beginPayload = begin.payload
  if (beginPayload.ok === false) {
    const code = asTexto(beginPayload.code) ?? 'PLATE_LOOKUP_BEGIN_DENIED'
    const message =
      code === 'NEEDS_OVERAGE_CONSENT' ? MSG_OVERAGE_CONSENT : MSG_BEGIN_FALHOU
    const httpStatus = code === 'NEEDS_OVERAGE_CONSENT' ? 403 : 409
    console.info(`[vehicle-plate-lookup] request_id=${requestId} code=${code}`)
    return jsonResponse(
      {
        ok: false,
        code,
        message,
        erro: message,
        idempotency_key: idempotencyKey,
      },
      httpStatus
    )
  }

  const eventId = asEventId(beginPayload.event_id)
  const status = asTexto(beginPayload.status)
  const replay = asBool(beginPayload.idempotent_replay) === true

  if (!eventId || !status) {
    console.info(
      `[vehicle-plate-lookup] request_id=${requestId} code=PLATE_LOOKUP_BEGIN_FAILED`
    )
    return jsonResponse(
      {
        ok: false,
        code: 'PLATE_LOOKUP_BEGIN_FAILED',
        message: MSG_BEGIN_FALHOU,
        erro: MSG_BEGIN_FALHOU,
        idempotency_key: idempotencyKey,
      },
      503
    )
  }

  if (replay && status === 'finalized') {
    const beginReplay: Record<string, unknown> = {
      event_id: eventId,
      status,
      outcome: beginPayload.outcome,
      billing_kind: beginPayload.billing_kind,
      consumed: beginPayload.consumed,
    }

    if (replayFinalizadoPermiteDryRun(beginReplay)) {
      console.info(
        `[vehicle-plate-lookup] request_id=${requestId} code=PLATE_LOOKUP_DRY_RUN_REPLAY`
      )
      return jsonResponse(respostaDryRunOk(beginReplay, idempotencyKey, true))
    }

    const beginPareceCancelamentoSemConsumo =
      asTexto(beginReplay.outcome) === 'cancelled' &&
      asTexto(beginReplay.billing_kind) === 'none' &&
      asBool(beginReplay.consumed) === undefined

    if (!beginPareceCancelamentoSemConsumo) {
      console.info(
        `[vehicle-plate-lookup] request_id=${requestId} code=IDEMPOTENCY_REPLAY_BLOCKED`
      )
      return respostaReplayBloqueado(idempotencyKey)
    }

    const confirm = await rpcFinalizeCancelled(eventId)
    const confirmado = confirm.ok
      ? {
          event_id: eventId,
          status: confirm.payload.status,
          outcome: beginReplay.outcome,
          billing_kind: confirm.payload.billing_kind,
          consumed: confirm.payload.consumed,
        }
      : null

    if (confirmado && replayFinalizadoPermiteDryRun(confirmado)) {
      console.info(
        `[vehicle-plate-lookup] request_id=${requestId} code=PLATE_LOOKUP_DRY_RUN_REPLAY`
      )
      return jsonResponse(respostaDryRunOk(confirmado, idempotencyKey, true))
    }

    console.info(
      `[vehicle-plate-lookup] request_id=${requestId} code=IDEMPOTENCY_REPLAY_BLOCKED`
    )
    return respostaReplayBloqueado(idempotencyKey)
  }

  if (replay && status !== 'reserved') {
    const expired =
      status === 'expired_released' ||
      asTexto(beginPayload.api_call_blocked_reason) === 'RESERVATION_EXPIRED'
    const code = expired ? 'RESERVATION_EXPIRED' : 'IDEMPOTENCY_REPLAY_BLOCKED'
    console.info(`[vehicle-plate-lookup] request_id=${requestId} code=${code}`)
    return jsonResponse(
      {
        ok: false,
        code,
        message: expired ? MSG_RESERVA_EXPIRADA : MSG_REPLAY_INCOMPATIVEL,
        erro: expired ? MSG_RESERVA_EXPIRADA : MSG_REPLAY_INCOMPATIVEL,
        idempotency_key: idempotencyKey,
      },
      409
    )
  }

  if (status !== 'reserved') {
    console.info(
      `[vehicle-plate-lookup] request_id=${requestId} code=PLATE_LOOKUP_BEGIN_FAILED`
    )
    return jsonResponse(
      {
        ok: false,
        code: 'PLATE_LOOKUP_BEGIN_FAILED',
        message: MSG_BEGIN_FALHOU,
        erro: MSG_BEGIN_FALHOU,
        idempotency_key: idempotencyKey,
      },
      503
    )
  }

  const decisao = decidirCancelamentoDryRun(beginPayload)
  if (decisao.acao === 'bloquear') {
    console.info(
      `[vehicle-plate-lookup] request_id=${requestId} code=${decisao.code}`
    )
    return jsonResponse(
      {
        ok: false,
        code: decisao.code,
        message: decisao.message,
        erro: decisao.message,
        idempotency_key: idempotencyKey,
      },
      decisao.httpStatus
    )
  }

  const finalize = await rpcFinalizeCancelled(eventId)
  if (!finalize.ok) {
    console.info(
      `[vehicle-plate-lookup] request_id=${requestId} code=PLATE_LOOKUP_FINALIZE_PENDING`
    )
    return respostaFinalizeIncerto(
      eventId,
      idempotencyKey,
      finalize.reason === 'config' ? MSG_DRY_RUN_CONFIG : MSG_FINALIZE_PENDENTE,
      undefined
    )
  }

  const fin = finalize.payload
  if (!confirmacaoPrimeiraFinalizacaoDryRun(fin, eventId)) {
    console.info(
      `[vehicle-plate-lookup] request_id=${requestId} code=PLATE_LOOKUP_FINALIZE_PENDING`
    )
    return respostaFinalizeIncerto(
      eventId,
      idempotencyKey,
      MSG_FINALIZE_PENDENTE,
      asTexto(fin.status)
    )
  }

  console.info(
    `[vehicle-plate-lookup] request_id=${requestId} code=PLATE_LOOKUP_DRY_RUN_OK`
  )
  return jsonResponse(
    respostaDryRunOk(
      {
        event_id: eventId,
        status: fin.status,
        billing_kind: fin.billing_kind,
        consumed: fin.consumed,
      },
      idempotencyKey,
      false
    )
  )
}

function respostaFinalizeIncerto(
  eventId: string,
  idempotencyKey: string,
  message: string,
  status: string | undefined
): Response {
  return jsonResponse(
    {
      ok: false,
      code: 'PLATE_LOOKUP_FINALIZE_PENDING',
      message,
      erro: message,
      event_id: eventId,
      ...(status ? { status } : {}),
      idempotency_key: idempotencyKey,
      reservation_release_confirmed: false,
    },
    503
  )
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

export function eventoPersisteSimulacao(
  payload: Record<string, unknown>
): boolean {
  const code = asTexto(payload.result_code)
  const stored = asRecord(payload.result_payload)
  const source = stored ? asTexto(stored.source) : undefined
  const scenario = stored ? asTexto(stored.scenario) : undefined
  if (
    code === RESULT_CODE_SIMULATE_NOT_FOUND ||
    code === RESULT_CODE_SIMULATE_TIMEOUT ||
    code === RESULT_CODE_SIMULATE_API_ERROR ||
    scenario === RESULT_SCENARIO_NOT_FOUND ||
    scenario === RESULT_SCENARIO_TIMEOUT ||
    scenario === RESULT_SCENARIO_API_ERROR
  ) {
    return false
  }
  return code === RESULT_CODE_SIMULATE || source === RESULT_SOURCE_SIMULATE
}

/** Só devolve dados se persistidos e marcados como simulação. Ausente ≠ inventar. */
export function dadosSimuladosPersistidos(
  payload: Record<string, unknown>
): DadosVeiculoConsultaResposta | null {
  const stored = asRecord(payload.result_payload)
  if (!stored) return null
  const dados = asRecord(stored.dados)
  if (!dados) return null
  if (asTexto(dados.fonte) !== 'simulacao_homolog') return null
  const placa = asTexto(dados.placa)
  if (!placa) return null
  const esperado = dadosVeiculoSimulado(placa)
  if (!esperado) return null
  if (asTexto(dados.marca) !== esperado.marca) return null
  if (asTexto(dados.modelo) !== esperado.modelo) return null
  const ano = typeof dados.ano === 'number' ? dados.ano : undefined
  const cor = asTexto(dados.cor)
  const municipio = asTexto(dados.municipio)
  const uf = asTexto(dados.uf)
  const combustivel = asTexto(dados.combustivel)
  if (
    ano !== esperado.ano ||
    cor !== esperado.cor ||
    municipio !== esperado.municipio ||
    uf !== esperado.uf ||
    combustivel !== esperado.combustivel
  ) {
    return null
  }
  return esperado
}

/**
 * Origem simulada persistida. Não usa consumed: begin não devolve esse campo.
 * billing_kind=none sozinho não basta.
 */
export function provaOrigemReplaySimulado(
  payload: Record<string, unknown>
): boolean {
  return (
    asTexto(payload.status) === 'finalized' &&
    asTexto(payload.outcome) === 'success' &&
    asTexto(payload.billing_kind) === 'none' &&
    eventoPersisteSimulacao(payload) &&
    dadosSimuladosPersistidos(payload) !== null
  )
}

/**
 * Replay só é SIMULATED_OK com consumed===false explícito.
 * Ausente ou true = bloqueio. Não tratar ausência como false.
 */
export function confirmacaoReplaySimulado(
  payload: Record<string, unknown>
): boolean {
  return (
    provaOrigemReplaySimulado(payload) &&
    asBool(payload.consumed) === false
  )
}

export function eventoPersisteSimulacaoNotFound(
  payload: Record<string, unknown>
): boolean {
  const code = asTexto(payload.result_code)
  const stored = asRecord(payload.result_payload)
  const source = stored ? asTexto(stored.source) : undefined
  const scenario = stored ? asTexto(stored.scenario) : undefined
  return (
    code === RESULT_CODE_SIMULATE_NOT_FOUND ||
    (source === RESULT_SOURCE_SIMULATE && scenario === RESULT_SCENARIO_NOT_FOUND)
  )
}

/**
 * Replay not_found: outcome e identificadores obrigatórios.
 * success/cancelled/dados de veículo = incompatível.
 */
export function provaOrigemReplaySimuladoNotFound(
  payload: Record<string, unknown>
): boolean {
  return (
    asTexto(payload.status) === 'finalized' &&
    asTexto(payload.outcome) === 'not_found' &&
    asTexto(payload.billing_kind) === 'none' &&
    eventoPersisteSimulacaoNotFound(payload) &&
    dadosSimuladosPersistidos(payload) === null
  )
}

export function confirmacaoReplaySimuladoNotFound(
  payload: Record<string, unknown>
): boolean {
  return (
    provaOrigemReplaySimuladoNotFound(payload) &&
    asBool(payload.consumed) === false
  )
}

export function eventoPersisteSimulacaoTimeout(
  payload: Record<string, unknown>
): boolean {
  const code = asTexto(payload.result_code)
  const stored = asRecord(payload.result_payload)
  const source = stored ? asTexto(stored.source) : undefined
  const scenario = stored ? asTexto(stored.scenario) : undefined
  return (
    code === RESULT_CODE_SIMULATE_TIMEOUT ||
    (source === RESULT_SOURCE_SIMULATE && scenario === RESULT_SCENARIO_TIMEOUT)
  )
}

/**
 * Replay timeout: outcome e identificadores obrigatórios.
 * success/cancelled/not_found/dados de veículo = incompatível.
 */
export function provaOrigemReplaySimuladoTimeout(
  payload: Record<string, unknown>
): boolean {
  return (
    asTexto(payload.status) === 'finalized' &&
    asTexto(payload.outcome) === 'timeout' &&
    asTexto(payload.billing_kind) === 'none' &&
    eventoPersisteSimulacaoTimeout(payload) &&
    dadosSimuladosPersistidos(payload) === null
  )
}

export function confirmacaoReplaySimuladoTimeout(
  payload: Record<string, unknown>
): boolean {
  return (
    provaOrigemReplaySimuladoTimeout(payload) &&
    asBool(payload.consumed) === false
  )
}

export function eventoPersisteSimulacaoApiError(
  payload: Record<string, unknown>
): boolean {
  const code = asTexto(payload.result_code)
  const stored = asRecord(payload.result_payload)
  const source = stored ? asTexto(stored.source) : undefined
  const scenario = stored ? asTexto(stored.scenario) : undefined
  return (
    code === RESULT_CODE_SIMULATE_API_ERROR ||
    (source === RESULT_SOURCE_SIMULATE && scenario === RESULT_SCENARIO_API_ERROR)
  )
}

/**
 * Replay api_error: outcome e identificadores obrigatórios.
 * success/cancelled/not_found/timeout/dados de veículo = incompatível.
 */
export function provaOrigemReplaySimuladoApiError(
  payload: Record<string, unknown>
): boolean {
  return (
    asTexto(payload.status) === 'finalized' &&
    asTexto(payload.outcome) === 'api_error' &&
    asTexto(payload.billing_kind) === 'none' &&
    eventoPersisteSimulacaoApiError(payload) &&
    dadosSimuladosPersistidos(payload) === null
  )
}

export function confirmacaoReplaySimuladoApiError(
  payload: Record<string, unknown>
): boolean {
  return (
    provaOrigemReplaySimuladoApiError(payload) &&
    asBool(payload.consumed) === false
  )
}

function textoOpcional(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const t = value.trim()
  return t.length > 0 ? t : undefined
}

function parseAno(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const n = Math.floor(value)
    if (n >= 1900 && n <= 2100) return n
    return undefined
  }
  if (typeof value === 'string') {
    const digits = value.trim().replace(/\D/g, '')
    if (!digits) return undefined
    const n = parseInt(digits.slice(0, 4), 10)
    if (n >= 1900 && n <= 2100) return n
  }
  return undefined
}

export type CandidatoPilotoReal = 'nao_candidato' | 'executar' | 'config_invalida'

export type EstadoAutorizacaoPiloto =
  | 'disponivel'
  | 'bloqueado_consumida'
  | 'bloqueado_incerta'

export type ConsultarApiFn = (
  placaNorm: string,
  requestId: string
) => Promise<ResultadoConsultaApi>

let consultarApiRealPilotImpl: ConsultarApiFn = (placaNorm, requestId) =>
  consultarApiPlacasBasico(placaNorm, requestId)

/** Somente testes locais — nunca expor ao cliente. */
export function __setConsultarApiRealPilotForTests(fn: ConsultarApiFn | null): void {
  consultarApiRealPilotImpl = fn ??
    ((placaNorm, requestId) => consultarApiPlacasBasico(placaNorm, requestId))
}

function chaveAutorizacaoPilotoReal(): string | null {
  const key = Deno.env.get(ENV_PLATE_LOOKUP_REAL_PILOT_AUTH_KEY)?.trim() ?? ''
  if (!key || !IDEMPOTENCY_KEY_RE.test(key)) return null
  return key
}

function placaAllowlistPilotoReal(): string | null {
  const raw = Deno.env.get(ENV_PLATE_LOOKUP_REAL_PILOT_PLACA)?.trim() ?? ''
  if (!raw) return null
  const norm = normalizarPlaca(raw)
  return ehPlacaBrasileiraValida(norm) ? norm : null
}

/**
 * Gates do piloto real (backend-only). Cliente não ativa.
 * PLATE_LOOKUP_ENABLED não autoriza o piloto.
 */
export function pilotoRealPermitido(opts: {
  homologUrl: string | undefined | null
  realPilotEnv: string | undefined | null
  apiTokenEnv: string | undefined | null
  pilotPlacaEnv: string | undefined | null
  pilotAuthKeyEnv: string | undefined | null
  officeId: string
  placaNorm: string
}): boolean {
  if (opts.realPilotEnv?.trim() !== 'true') return false
  if (opts.officeId !== SIMULATE_OFFICE_ID) return false
  const placaAuth = opts.pilotPlacaEnv?.trim()
    ? normalizarPlaca(opts.pilotPlacaEnv)
    : ''
  if (!placaAuth || opts.placaNorm !== placaAuth) return false
  if (!homologUrlAutorizada(opts.homologUrl)) return false
  if (!opts.apiTokenEnv?.trim()) return false
  const authKey = opts.pilotAuthKeyEnv?.trim() ?? ''
  if (!authKey || !IDEMPOTENCY_KEY_RE.test(authKey)) return false
  return true
}

function pilotoRealHabilitado(officeId: string, placaNorm: string): boolean {
  return pilotoRealPermitido({
    homologUrl: Deno.env.get('SUPABASE_URL'),
    realPilotEnv: Deno.env.get(ENV_PLATE_LOOKUP_REAL_PILOT),
    apiTokenEnv: Deno.env.get(ENV_API_PLACAS_TOKEN),
    pilotPlacaEnv: Deno.env.get(ENV_PLATE_LOOKUP_REAL_PILOT_PLACA),
    pilotAuthKeyEnv: Deno.env.get(ENV_PLATE_LOOKUP_REAL_PILOT_AUTH_KEY),
    officeId,
    placaNorm,
  })
}

/** Oficina/placa alinhadas ao piloto, mas secrets incompletos. */
export function classificarCandidatoPilotoReal(
  officeId: string,
  placaNorm: string
): CandidatoPilotoReal {
  if (Deno.env.get(ENV_PLATE_LOOKUP_REAL_PILOT)?.trim() !== 'true') {
    return 'nao_candidato'
  }
  if (officeId !== SIMULATE_OFFICE_ID) return 'nao_candidato'
  const allow = placaAllowlistPilotoReal()
  if (!allow || placaNorm !== allow) return 'nao_candidato'
  if (pilotoRealHabilitado(officeId, placaNorm)) return 'executar'
  return 'config_invalida'
}

export function eventoPersistePilotoReal(
  row: Record<string, unknown>
): boolean {
  const stored = asRecord(row.result_payload)
  if (stored && asTexto(stored.source) === RESULT_SOURCE_REAL_PILOT) return true
  return asTexto(row.result_code) === RESULT_CODE_REAL_OK &&
    stored?.pilot === true
}

export function avaliarEstadoAutorizacaoPiloto(
  rows: Record<string, unknown>[]
): EstadoAutorizacaoPiloto {
  for (const row of rows) {
    const status = asTexto(row.status)
    const apiCalled = asBool(row.api_called) === true
    if (status === 'reconciliation_pending') return 'bloqueado_incerta'
    if (status === 'reserved' && apiCalled) return 'bloqueado_incerta'
    if (apiCalled) return 'bloqueado_consumida'
  }
  return 'disponivel'
}

export function markApiStartedPermiteChamadaHttp(
  payload: Record<string, unknown>
): boolean {
  if (payload.ok === false) return false
  if (asBool(payload.idempotent_replay) === true) return false
  return asBool(payload.api_called) === true
}

export type AquisicaoPilotoVendorInterpretada =
  | { ok: true; acquired: true; eventId?: string }
  | { ok: true; acquired: false; blockCode: string; eventId?: string }
  | { ok: false; reason: 'invalid_payload' }

export function interpretarAquisicaoPilotoVendor(
  payload: Record<string, unknown> | null
): AquisicaoPilotoVendorInterpretada {
  if (!payload || payload.ok === false) {
    const blockCode = asTexto(payload?.code) ?? 'ACQUIRE_DENIED'
    return { ok: true, acquired: false, blockCode }
  }
  if (asBool(payload.acquired) === true) {
    return {
      ok: true,
      acquired: true,
      eventId: asTexto(payload.event_id),
    }
  }
  return {
    ok: true,
    acquired: false,
    blockCode: asTexto(payload.code) ?? 'VENDOR_GRANT_ALREADY_HELD',
    eventId: asTexto(payload.event_id),
  }
}

export function decidirBloqueioAposAquisicaoNegada(blockCode: string): {
  httpStatus: number
  code: string
  message: string
} {
  switch (blockCode) {
    case 'VENDOR_GRANT_ALREADY_HELD':
      return {
        httpStatus: 409,
        code: 'REAL_PILOT_ALREADY_USED',
        message: MSG_REAL_PILOT_JA_USADO,
      }
    case 'EVENT_API_ALREADY_STARTED':
    case 'EVENT_RECONCILIATION_PENDING':
    case 'EVENT_NOT_ELIGIBLE':
    case 'RESERVATION_EXPIRED':
      return {
        httpStatus: 503,
        code: 'REAL_PILOT_UNCERTAIN',
        message: MSG_REAL_PILOT_INCERTO,
      }
    case 'PILOT_OFFICE_BLOCKED':
    case 'PLATE_MISMATCH':
    case 'PLATE_INVALID':
      return {
        httpStatus: 403,
        code: 'REAL_PILOT_BLOQUEADO',
        message: MSG_REAL_PILOT_BLOQUEADO,
      }
    case 'EVENT_NOT_FOUND':
      return {
        httpStatus: 503,
        code: 'REAL_PILOT_UNCERTAIN',
        message: MSG_REAL_PILOT_INCERTO,
      }
    default:
      return {
        httpStatus: 409,
        code: 'REAL_PILOT_ALREADY_USED',
        message: MSG_REAL_PILOT_JA_USADO,
      }
  }
}

/** Fetch ao fornecedor só com aquisição fresh + mark_api_started fresh (nunca replay). */
export function pilotoVendorFetchPermitido(
  aquisicao: AquisicaoPilotoVendorInterpretada,
  markPayload: Record<string, unknown>
): boolean {
  return (
    aquisicao.ok === true &&
    aquisicao.acquired === true &&
    markApiStartedPermiteChamadaHttp(markPayload)
  )
}

export function mapearResultadoApiParaFinalize(
  result: ResultadoConsultaApi,
  placaNorm: string,
  modo: 'pilot' | 'commercial' = 'pilot'
): {
  outcome: 'success' | 'not_found' | 'timeout' | 'api_error' | 'invalid'
  apiCalled: boolean
  resultCode: string
  resultPayload: Record<string, unknown> | null
  httpStatus: number
  responseCode: string
  dados?: DadosVeiculoConsultaResposta
} {
  const source =
    modo === 'commercial' ? RESULT_SOURCE_REAL_COMMERCIAL : RESULT_SOURCE_REAL_PILOT
  const metaPayload =
    modo === 'commercial'
      ? { source, commercial: true, simulacao: false }
      : { source, pilot: true, simulacao: false }

  if (result.ok) {
    return {
      outcome: 'success',
      apiCalled: true,
      resultCode: RESULT_CODE_REAL_OK,
      resultPayload: {
        ...metaPayload,
        dados: result.dados,
      },
      httpStatus: 200,
      responseCode: RESULT_CODE_REAL_OK,
      dados: result.dados,
    }
  }
  const code = result.code
  if (code === 'PLATE_NOT_FOUND') {
    return {
      outcome: 'not_found',
      apiCalled: true,
      resultCode: 'PLATE_NOT_FOUND',
      resultPayload: metaPayload,
      httpStatus: 404,
      responseCode: 'PLATE_NOT_FOUND',
    }
  }
  if (code === 'PLATE_INVALID') {
    return {
      outcome: 'invalid',
      apiCalled: true,
      resultCode: 'PLATE_INVALID',
      resultPayload: metaPayload,
      httpStatus: 400,
      responseCode: 'PLATE_INVALID',
    }
  }
  if (code === 'API_TIMEOUT') {
    return {
      outcome: 'timeout',
      apiCalled: true,
      resultCode: 'API_TIMEOUT',
      resultPayload: metaPayload,
      httpStatus: 503,
      responseCode: 'PLATE_LOOKUP_RECONCILIATION_PENDING',
    }
  }
  return {
    outcome: 'api_error',
    apiCalled: true,
    resultCode: code,
    resultPayload: metaPayload,
    httpStatus: result.httpStatus >= 400 && result.httpStatus < 600
      ? result.httpStatus
      : 503,
    responseCode: code === 'API_INVALID_RESPONSE'
      ? 'PLATE_LOOKUP_RECONCILIATION_PENDING'
      : code,
  }
}

export function dadosReaisPersistidos(
  payload: Record<string, unknown>
): DadosVeiculoConsultaResposta | null {
  const stored = asRecord(payload.result_payload)
  if (!stored) return null
  const dados = asRecord(stored.dados)
  if (!dados) return null
  const placa = asTexto(dados.placa)
  if (!placa) return null
  const fonte = asTexto(dados.fonte)
  const out: DadosVeiculoConsultaResposta = {
    placa,
    fonte: fonte === 'api_placas' ? 'api_placas' : 'api_placas',
  }
  const marca = asTexto(dados.marca)
  const modelo = asTexto(dados.modelo)
  const cor = asTexto(dados.cor)
  const municipio = asTexto(dados.municipio)
  const uf = asTexto(dados.uf)
  const combustivel = asTexto(dados.combustivel)
  const ano = parseAno(dados.ano)
  if (marca) out.marca = marca
  if (modelo) out.modelo = modelo
  if (cor) out.cor = cor
  if (municipio) out.municipio = municipio
  if (uf) out.uf = uf
  if (combustivel) out.combustivel = combustivel
  if (ano !== undefined) out.ano = ano
  return out
}

export function provaOrigemReplayPilotoReal(
  beginPayload: Record<string, unknown>
): boolean {
  const stored = asRecord(beginPayload.result_payload)
  if (stored && asTexto(stored.source) === RESULT_SOURCE_REAL_PILOT) return true
  return asTexto(beginPayload.result_code) === RESULT_CODE_REAL_OK
}

export function provaOrigemReplayConsultaRealComercial(
  beginPayload: Record<string, unknown>
): boolean {
  const stored = asRecord(beginPayload.result_payload)
  if (stored && asTexto(stored.source) === RESULT_SOURCE_REAL_COMMERCIAL) {
    return true
  }
  return (
    asTexto(beginPayload.result_code) === RESULT_CODE_REAL_OK &&
    asBool(stored?.commercial) === true
  )
}

export function confirmacaoReplayConsultaRealComercial(
  payload: Record<string, unknown>
): boolean {
  const status = asTexto(payload.status)
  if (status !== 'finalized' && status !== 'reconciliation_pending') {
    return false
  }
  if (!provaOrigemReplayConsultaRealComercial(payload)) return false
  return (
    asBool(payload.consumed) !== undefined ||
    asTexto(payload.billing_kind) !== undefined
  )
}

export function consultaRealComercialFetchPermitido(
  markPayload: Record<string, unknown>
): boolean {
  return markApiStartedPermiteChamadaHttp(markPayload)
}

export function confirmacaoReplayPilotoRealFinalizado(
  payload: Record<string, unknown>
): boolean {
  const status = asTexto(payload.status)
  if (status !== 'finalized' && status !== 'reconciliation_pending') {
    return false
  }
  if (!provaOrigemReplayPilotoReal(payload)) return false
  return asBool(payload.consumed) !== undefined ||
    asTexto(payload.billing_kind) !== undefined
}

export function confirmacaoPrimeiraFinalizacaoReal(
  fin: Record<string, unknown>,
  eventId: string
): boolean {
  const finEventId = asEventId(fin.event_id)
  if (!finEventId || finEventId !== eventId) return false
  const status = asTexto(fin.status)
  if (status !== 'finalized' && status !== 'reconciliation_pending') {
    return false
  }
  return asBool(fin.consumed) !== undefined ||
    asTexto(fin.billing_kind) !== undefined
}

function respostaRealOk(
  dados: DadosVeiculoConsultaResposta,
  fin: Record<string, unknown>,
  eventId: string,
  clientIdempotencyKey: string,
  idempotentReplay: boolean
): Record<string, unknown> {
  return {
    ok: true,
    code: RESULT_CODE_REAL_OK,
    simulacao: false,
    fonte: 'api_placas',
    event_id: eventId,
    status: asTexto(fin.status) ?? 'finalized',
    billing_kind: fin.billing_kind ?? 'none',
    consumed: asBool(fin.consumed) === true,
    idempotent_replay: idempotentReplay,
    idempotency_key: clientIdempotencyKey,
    api_called: true,
    chamada_externa: 'api_placas',
    dados,
  }
}

function respostaRealNotFound(
  fin: Record<string, unknown>,
  eventId: string,
  clientIdempotencyKey: string,
  idempotentReplay: boolean
): Record<string, unknown> {
  return {
    ok: false,
    code: 'PLATE_NOT_FOUND',
    simulacao: false,
    fonte: 'api_placas',
    event_id: eventId,
    status: asTexto(fin.status) ?? 'finalized',
    billing_kind: fin.billing_kind ?? 'none',
    consumed: asBool(fin.consumed) === true,
    idempotent_replay: idempotentReplay,
    idempotency_key: clientIdempotencyKey,
    api_called: true,
    chamada_externa: 'api_placas',
    message: MSG_PLACA_NAO_ENCONTRADA,
    erro: MSG_PLACA_NAO_ENCONTRADA,
  }
}

function respostaRealReconciliacao(
  fin: Record<string, unknown>,
  eventId: string,
  clientIdempotencyKey: string,
  code: string,
  message: string
): Record<string, unknown> {
  return {
    ok: false,
    code,
    simulacao: false,
    fonte: 'api_placas',
    event_id: eventId,
    status: asTexto(fin.status) ?? 'reconciliation_pending',
    billing_kind: fin.billing_kind ?? 'pending_reconciliation',
    consumed: asBool(fin.consumed) === true,
    idempotent_replay: false,
    idempotency_key: clientIdempotencyKey,
    api_called: true,
    chamada_externa: 'api_placas',
    message,
    erro: message,
    reservation_release_confirmed: false,
  }
}

function respostaPilotoBloqueado(
  code: string,
  message: string,
  clientIdempotencyKey: string,
  httpStatus: number
): Response {
  return jsonResponse(
    {
      ok: false,
      code,
      message,
      erro: message,
      idempotency_key: clientIdempotencyKey,
      chamada_externa: 'bloqueada',
    },
    httpStatus
  )
}

async function rpcAcquireRealPilotVendorCall(
  eventId: string,
  placaNorm: string
): Promise<
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; reason: 'config' | 'rpc' }
> {
  let privileged: SupabaseClient
  try {
    privileged = adminClient()
  } catch {
    return { ok: false, reason: 'config' }
  }
  const { data, error } = await privileged.rpc(
    'plate_lookup_acquire_real_pilot_vendor_call',
    {
      p_event_id: eventId,
      p_placa: placaNorm,
    }
  )
  if (error) return { ok: false, reason: 'rpc' }
  const payload = asRecord(data)
  if (!payload) return { ok: false, reason: 'rpc' }
  return { ok: true, payload }
}

async function rpcMarkApiStarted(
  eventId: string
): Promise<
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; reason: 'config' | 'rpc' }
> {
  let privileged: SupabaseClient
  try {
    privileged = adminClient()
  } catch {
    return { ok: false, reason: 'config' }
  }
  const { data, error } = await privileged.rpc('plate_lookup_mark_api_started', {
    p_event_id: eventId,
  })
  if (error) return { ok: false, reason: 'rpc' }
  const payload = asRecord(data)
  if (!payload) return { ok: false, reason: 'rpc' }
  return { ok: true, payload }
}

async function rpcFinalizePilotoReal(
  eventId: string,
  mapped: ReturnType<typeof mapearResultadoApiParaFinalize>
): Promise<
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; reason: 'config' | 'rpc' }
> {
  let privileged: SupabaseClient
  try {
    privileged = adminClient()
  } catch {
    return { ok: false, reason: 'config' }
  }
  const { data, error } = await privileged.rpc('plate_lookup_finalize_event', {
    p_event_id: eventId,
    p_outcome: mapped.outcome,
    p_api_called: mapped.apiCalled,
    p_result_code: mapped.resultCode,
    p_api_provider_request_id: null,
    p_result_payload: mapped.resultPayload,
  })
  if (error) return { ok: false, reason: 'rpc' }
  const payload = asRecord(data)
  if (!payload) return { ok: false, reason: 'rpc' }
  return { ok: true, payload }
}

export type RealPilotTestDeps = {
  rpcAcquire?: typeof rpcAcquireRealPilotVendorCall
  rpcBegin?: typeof rpcBegin
  rpcMark?: typeof rpcMarkApiStarted
  rpcFinalize?: typeof rpcFinalizePilotoReal
  consultarApi?: ConsultarApiFn
}

export async function executarConsultaRealPiloto(
  userSb: SupabaseClient,
  placaNorm: string,
  clientIdempotencyKey: string,
  requestId: string,
  officeId: string,
  deps?: RealPilotTestDeps
): Promise<Response> {
  const acquireRpc = deps?.rpcAcquire ?? rpcAcquireRealPilotVendorCall
  const beginRpc = deps?.rpcBegin ?? rpcBegin
  const markRpc = deps?.rpcMark ?? rpcMarkApiStarted
  const finalizeRpc = deps?.rpcFinalize ?? rpcFinalizePilotoReal
  const consultarApi = deps?.consultarApi ?? consultarApiRealPilotImpl

  const pilotAuthKey = chaveAutorizacaoPilotoReal()
  if (!pilotAuthKey || !pilotoRealHabilitado(officeId, placaNorm)) {
    return respostaPilotoBloqueado(
      'REAL_PILOT_CONFIG',
      MSG_REAL_PILOT_CONFIG,
      clientIdempotencyKey,
      503
    )
  }

  const begin = await beginRpc(userSb, placaNorm, pilotAuthKey)
  if (!begin.ok) {
    console.info(
      `[vehicle-plate-lookup] request_id=${requestId} code=${begin.mapped.code}`
    )
    return jsonResponse(
      {
        ok: false,
        code: begin.mapped.code,
        message: begin.mapped.message,
        erro: begin.mapped.message,
        idempotency_key: clientIdempotencyKey,
      },
      begin.mapped.httpStatus
    )
  }

  const beginPayload = begin.payload
  if (beginPayload.ok === false) {
    const code = asTexto(beginPayload.code) ?? 'PLATE_LOOKUP_BEGIN_DENIED'
    if (code === 'IDEMPOTENCY_PLATE_MISMATCH') {
      return respostaPilotoBloqueado(
        'REAL_PILOT_ALREADY_USED',
        MSG_REAL_PILOT_JA_USADO,
        clientIdempotencyKey,
        409
      )
    }
    const message =
      code === 'NEEDS_OVERAGE_CONSENT' ? MSG_OVERAGE_CONSENT : MSG_BEGIN_FALHOU
    const httpStatus = code === 'NEEDS_OVERAGE_CONSENT' ? 403 : 409
    console.info(`[vehicle-plate-lookup] request_id=${requestId} code=${code}`)
    return jsonResponse(
      {
        ok: false,
        code,
        message,
        erro: message,
        idempotency_key: clientIdempotencyKey,
      },
      httpStatus
    )
  }

  const eventId = asEventId(beginPayload.event_id)
  const status = asTexto(beginPayload.status)
  const replay = asBool(beginPayload.idempotent_replay) === true

  if (!eventId || !status) {
    return respostaPilotoBloqueado(
      'REAL_PILOT_UNCERTAIN',
      MSG_REAL_PILOT_INCERTO,
      clientIdempotencyKey,
      503
    )
  }

  if (replay && status === 'finalized') {
    if (!confirmacaoReplayPilotoRealFinalizado(beginPayload)) {
      return respostaPilotoBloqueado(
        'IDEMPOTENCY_REPLAY_BLOCKED',
        MSG_REPLAY_INCOMPATIVEL,
        clientIdempotencyKey,
        409
      )
    }
    const outcome = asTexto(beginPayload.outcome)
    if (outcome === 'success' || asTexto(beginPayload.result_code) === RESULT_CODE_REAL_OK) {
      const dados = dadosReaisPersistidos(beginPayload)
      if (!dados) {
        return respostaPilotoBloqueado(
          'IDEMPOTENCY_REPLAY_BLOCKED',
          MSG_REPLAY_INCOMPATIVEL,
          clientIdempotencyKey,
          409
        )
      }
      return jsonResponse(
        respostaRealOk(
          dados,
          beginPayload,
          eventId,
          clientIdempotencyKey,
          true
        )
      )
    }
    if (outcome === 'not_found') {
      return jsonResponse(
        respostaRealNotFound(
          beginPayload,
          eventId,
          clientIdempotencyKey,
          true
        ),
        404
      )
    }
    if (asTexto(beginPayload.status) === 'reconciliation_pending' ||
      asTexto(beginPayload.billing_kind) === 'pending_reconciliation') {
      return jsonResponse(
        respostaRealReconciliacao(
          beginPayload,
          eventId,
          clientIdempotencyKey,
          'PLATE_LOOKUP_RECONCILIATION_PENDING',
          MSG_REAL_PILOT_INCERTO
        ),
        503
      )
    }
    return respostaPilotoBloqueado(
      'IDEMPOTENCY_REPLAY_BLOCKED',
      MSG_REPLAY_INCOMPATIVEL,
      clientIdempotencyKey,
      409
    )
  }

  if (replay && status !== 'reserved') {
    const expired =
      status === 'expired_released' ||
      asTexto(beginPayload.api_call_blocked_reason) === 'RESERVATION_EXPIRED'
    const code = expired ? 'RESERVATION_EXPIRED' : 'REAL_PILOT_UNCERTAIN'
    const message = expired ? MSG_RESERVA_EXPIRADA : MSG_REAL_PILOT_INCERTO
    return jsonResponse(
      {
        ok: false,
        code,
        message,
        erro: message,
        idempotency_key: clientIdempotencyKey,
      },
      expired ? 409 : 503
    )
  }

  if (status !== 'reserved') {
    return respostaPilotoBloqueado(
      'REAL_PILOT_UNCERTAIN',
      MSG_REAL_PILOT_INCERTO,
      clientIdempotencyKey,
      503
    )
  }

  const decisaoReserva = decidirCancelamentoDryRun(beginPayload)
  if (decisaoReserva.acao === 'bloquear') {
    const code = decisaoReserva.code === 'API_ALREADY_STARTED'
      ? 'REAL_PILOT_UNCERTAIN'
      : decisaoReserva.code
    const message = decisaoReserva.code === 'API_ALREADY_STARTED'
      ? MSG_REAL_PILOT_INCERTO
      : decisaoReserva.message
    return jsonResponse(
      {
        ok: false,
        code,
        message,
        erro: message,
        idempotency_key: clientIdempotencyKey,
      },
      decisaoReserva.httpStatus
    )
  }

  const acquire = await acquireRpc(eventId, placaNorm)
  if (!acquire.ok) {
    console.info(
      `[vehicle-plate-lookup] request_id=${requestId} code=REAL_PILOT_ACQUIRE_FAILED`
    )
    return respostaPilotoBloqueado(
      'REAL_PILOT_UNCERTAIN',
      MSG_REAL_PILOT_INCERTO,
      clientIdempotencyKey,
      503
    )
  }

  const aquisicao = interpretarAquisicaoPilotoVendor(acquire.payload)
  if (!aquisicao.ok) {
    return respostaPilotoBloqueado(
      'REAL_PILOT_UNCERTAIN',
      MSG_REAL_PILOT_INCERTO,
      clientIdempotencyKey,
      503
    )
  }
  if (!aquisicao.acquired) {
    const bloqueio = decidirBloqueioAposAquisicaoNegada(aquisicao.blockCode)
    console.info(
      `[vehicle-plate-lookup] request_id=${requestId} code=${bloqueio.code}`
    )
    return jsonResponse(
      {
        ok: false,
        code: bloqueio.code,
        message: bloqueio.message,
        erro: bloqueio.message,
        idempotency_key: clientIdempotencyKey,
        chamada_externa: 'bloqueada',
      },
      bloqueio.httpStatus
    )
  }

  const mark = await markRpc(eventId)
  if (!mark.ok) {
    console.info(
      `[vehicle-plate-lookup] request_id=${requestId} code=REAL_PILOT_MARK_FAILED`
    )
    return respostaPilotoBloqueado(
      'REAL_PILOT_UNCERTAIN',
      MSG_REAL_PILOT_INCERTO,
      clientIdempotencyKey,
      503
    )
  }

  if (!pilotoVendorFetchPermitido(aquisicao, mark.payload)) {
    console.info(
      `[vehicle-plate-lookup] request_id=${requestId} code=REAL_PILOT_VENDOR_BLOCKED`
    )
    return respostaPilotoBloqueado(
      'REAL_PILOT_UNCERTAIN',
      MSG_REAL_PILOT_INCERTO,
      clientIdempotencyKey,
      503
    )
  }

  const apiResult = await consultarApi(placaNorm, requestId)
  const mapped = mapearResultadoApiParaFinalize(apiResult, placaNorm)

  const finalize = await finalizeRpc(eventId, mapped)
  if (!finalize.ok) {
    console.info(
      `[vehicle-plate-lookup] request_id=${requestId} code=PLATE_LOOKUP_FINALIZE_PENDING`
    )
    return respostaFinalizeIncerto(
      eventId,
      clientIdempotencyKey,
      MSG_REAL_PILOT_INCERTO,
      'reserved'
    )
  }

  const fin = finalize.payload
  if (!confirmacaoPrimeiraFinalizacaoReal(fin, eventId)) {
    return respostaFinalizeIncerto(
      eventId,
      clientIdempotencyKey,
      MSG_REAL_PILOT_INCERTO,
      asTexto(fin.status)
    )
  }

  const finStatus = asTexto(fin.status)
  if (finStatus === 'reconciliation_pending') {
    return jsonResponse(
      respostaRealReconciliacao(
        fin,
        eventId,
        clientIdempotencyKey,
        mapped.responseCode === 'PLATE_LOOKUP_RECONCILIATION_PENDING'
          ? 'PLATE_LOOKUP_RECONCILIATION_PENDING'
          : 'PLATE_LOOKUP_FINALIZE_PENDING',
        MSG_REAL_PILOT_INCERTO
      ),
      503
    )
  }

  if (mapped.outcome === 'success' && mapped.dados) {
    console.info(
      `[vehicle-plate-lookup] request_id=${requestId} code=${RESULT_CODE_REAL_OK}`
    )
    return jsonResponse(
      respostaRealOk(
        mapped.dados,
        fin,
        eventId,
        clientIdempotencyKey,
        replay
      )
    )
  }

  if (mapped.outcome === 'not_found') {
    return jsonResponse(
      respostaRealNotFound(fin, eventId, clientIdempotencyKey, replay),
      404
    )
  }

  return jsonResponse(
    respostaRealReconciliacao(
      fin,
      eventId,
      clientIdempotencyKey,
      mapped.responseCode,
      mensagemSeguraParaCodigo(mapped.resultCode)
    ),
    mapped.httpStatus >= 500 ? 503 : mapped.httpStatus
  )
}

function respostaComercialBloqueado(
  code: string,
  message: string,
  clientIdempotencyKey: string,
  httpStatus: number
): Response {
  return jsonResponse(
    {
      ok: false,
      code,
      message,
      erro: message,
      idempotency_key: clientIdempotencyKey,
      chamada_externa: 'bloqueada',
    },
    httpStatus
  )
}

export type RealComercialTestDeps = {
  rpcBegin?: typeof rpcBegin
  rpcMark?: typeof rpcMarkApiStarted
  rpcFinalize?: typeof rpcFinalizePilotoReal
  rpcCancel?: typeof rpcFinalizeCancelled
  consultarApi?: ConsultarApiFn
}

export async function executarConsultaRealComercial(
  userSb: SupabaseClient,
  placaNorm: string,
  clientIdempotencyKey: string,
  requestId: string,
  deps?: RealComercialTestDeps
): Promise<Response> {
  const beginRpc = deps?.rpcBegin ?? rpcBegin
  const markRpc = deps?.rpcMark ?? rpcMarkApiStarted
  const finalizeRpc = deps?.rpcFinalize ?? rpcFinalizePilotoReal
  const cancelRpc = deps?.rpcCancel ?? rpcFinalizeCancelled
  const consultarApi = deps?.consultarApi ?? consultarApiRealPilotImpl

  const begin = await beginRpc(userSb, placaNorm, clientIdempotencyKey)
  if (!begin.ok) {
    console.info(
      `[vehicle-plate-lookup] request_id=${requestId} code=${begin.mapped.code}`
    )
    return jsonResponse(
      {
        ok: false,
        code: begin.mapped.code,
        message: begin.mapped.message,
        erro: begin.mapped.message,
        idempotency_key: clientIdempotencyKey,
      },
      begin.mapped.httpStatus
    )
  }

  const beginPayload = begin.payload
  if (beginPayload.ok === false) {
    const code = asTexto(beginPayload.code) ?? 'PLATE_LOOKUP_BEGIN_DENIED'
    if (code === 'IDEMPOTENCY_PLATE_MISMATCH') {
      return respostaComercialBloqueado(
        'IDEMPOTENCY_PLATE_MISMATCH',
        MSG_REPLAY_INCOMPATIVEL,
        clientIdempotencyKey,
        409
      )
    }
    const message = mensagemBeginConsultaRealComercial(
      code,
      code === 'TRIAL_QUOTA_EXCEEDED' ? MSG_QUOTA_EXCEDIDA : MSG_BEGIN_FALHOU
    )
    const httpStatus =
      code === 'NEEDS_OVERAGE_CONSENT' || code === 'TRIAL_QUOTA_EXCEEDED'
        ? 403
        : 409
    console.info(`[vehicle-plate-lookup] request_id=${requestId} code=${code}`)
    return jsonResponse(
      {
        ok: false,
        code: code === 'NEEDS_OVERAGE_CONSENT' ? 'TRIAL_QUOTA_EXCEEDED' : code,
        message,
        erro: message,
        idempotency_key: clientIdempotencyKey,
      },
      httpStatus
    )
  }

  const comercialReserva = avaliarReservaConsultaRealComercial(beginPayload)
  if (comercialReserva.rejected) {
    if (comercialReserva.releaseEventId) {
      await cancelRpc(comercialReserva.releaseEventId)
    }
    console.info(
      `[vehicle-plate-lookup] request_id=${requestId} code=${comercialReserva.code}`
    )
    return jsonResponse(
      {
        ok: false,
        code: comercialReserva.code,
        message: comercialReserva.message,
        erro: comercialReserva.message,
        idempotency_key: clientIdempotencyKey,
      },
      403
    )
  }

  const eventId = asEventId(beginPayload.event_id)
  const status = asTexto(beginPayload.status)
  const replay = asBool(beginPayload.idempotent_replay) === true

  if (!eventId || !status) {
    return respostaComercialBloqueado(
      'PLATE_LOOKUP_BEGIN_FAILED',
      MSG_BEGIN_FALHOU,
      clientIdempotencyKey,
      503
    )
  }

  if (replay && status === 'finalized') {
    if (!confirmacaoReplayConsultaRealComercial(beginPayload)) {
      return respostaComercialBloqueado(
        'IDEMPOTENCY_REPLAY_BLOCKED',
        MSG_REPLAY_INCOMPATIVEL,
        clientIdempotencyKey,
        409
      )
    }
    const outcome = asTexto(beginPayload.outcome)
    if (outcome === 'success' || asTexto(beginPayload.result_code) === RESULT_CODE_REAL_OK) {
      const dados = dadosReaisPersistidos(beginPayload)
      if (!dados) {
        return respostaComercialBloqueado(
          'IDEMPOTENCY_REPLAY_BLOCKED',
          MSG_REPLAY_INCOMPATIVEL,
          clientIdempotencyKey,
          409
        )
      }
      return jsonResponse(
        respostaRealOk(dados, beginPayload, eventId, clientIdempotencyKey, true)
      )
    }
    if (outcome === 'not_found') {
      return jsonResponse(
        respostaRealNotFound(beginPayload, eventId, clientIdempotencyKey, true),
        404
      )
    }
    if (
      asTexto(beginPayload.status) === 'reconciliation_pending' ||
      asTexto(beginPayload.billing_kind) === 'pending_reconciliation'
    ) {
      return jsonResponse(
        respostaRealReconciliacao(
          beginPayload,
          eventId,
          clientIdempotencyKey,
          'PLATE_LOOKUP_RECONCILIATION_PENDING',
          MSG_REAL_COMMERCIAL_INCERTO
        ),
        503
      )
    }
    return respostaComercialBloqueado(
      'IDEMPOTENCY_REPLAY_BLOCKED',
      MSG_REPLAY_INCOMPATIVEL,
      clientIdempotencyKey,
      409
    )
  }

  if (replay && status !== 'reserved') {
    const expired =
      status === 'expired_released' ||
      asTexto(beginPayload.api_call_blocked_reason) === 'RESERVATION_EXPIRED'
    const code = expired ? 'RESERVATION_EXPIRED' : 'PLATE_LOOKUP_UNCERTAIN'
    const message = expired ? MSG_RESERVA_EXPIRADA : MSG_REAL_COMMERCIAL_INCERTO
    return jsonResponse(
      {
        ok: false,
        code,
        message,
        erro: message,
        idempotency_key: clientIdempotencyKey,
      },
      expired ? 409 : 503
    )
  }

  if (status !== 'reserved') {
    return respostaComercialBloqueado(
      'PLATE_LOOKUP_UNCERTAIN',
      MSG_REAL_COMMERCIAL_INCERTO,
      clientIdempotencyKey,
      503
    )
  }

  const decisaoReserva = decidirCancelamentoDryRun(beginPayload)
  if (decisaoReserva.acao === 'bloquear') {
    const code =
      decisaoReserva.code === 'API_ALREADY_STARTED'
        ? 'PLATE_LOOKUP_UNCERTAIN'
        : decisaoReserva.code
    const message =
      decisaoReserva.code === 'API_ALREADY_STARTED'
        ? MSG_REAL_COMMERCIAL_INCERTO
        : decisaoReserva.message
    return jsonResponse(
      {
        ok: false,
        code,
        message,
        erro: message,
        idempotency_key: clientIdempotencyKey,
      },
      decisaoReserva.httpStatus
    )
  }

  const mark = await markRpc(eventId)
  if (!mark.ok) {
    console.info(
      `[vehicle-plate-lookup] request_id=${requestId} code=REAL_COMMERCIAL_MARK_FAILED`
    )
    return respostaComercialBloqueado(
      'PLATE_LOOKUP_UNCERTAIN',
      MSG_REAL_COMMERCIAL_INCERTO,
      clientIdempotencyKey,
      503
    )
  }

  if (!consultaRealComercialFetchPermitido(mark.payload)) {
    console.info(
      `[vehicle-plate-lookup] request_id=${requestId} code=REAL_COMMERCIAL_VENDOR_BLOCKED`
    )
    return respostaComercialBloqueado(
      'PLATE_LOOKUP_UNCERTAIN',
      MSG_REAL_COMMERCIAL_INCERTO,
      clientIdempotencyKey,
      503
    )
  }

  const apiResult = await consultarApi(placaNorm, requestId)
  const mapped = mapearResultadoApiParaFinalize(apiResult, placaNorm, 'commercial')

  const finalize = await finalizeRpc(eventId, mapped)
  if (!finalize.ok) {
    console.info(
      `[vehicle-plate-lookup] request_id=${requestId} code=PLATE_LOOKUP_FINALIZE_PENDING`
    )
    return respostaFinalizeIncerto(
      eventId,
      clientIdempotencyKey,
      MSG_REAL_COMMERCIAL_INCERTO,
      'reserved'
    )
  }

  const fin = finalize.payload
  if (!confirmacaoPrimeiraFinalizacaoReal(fin, eventId)) {
    return respostaFinalizeIncerto(
      eventId,
      clientIdempotencyKey,
      MSG_REAL_COMMERCIAL_INCERTO,
      asTexto(fin.status)
    )
  }

  const finStatus = asTexto(fin.status)
  if (finStatus === 'reconciliation_pending') {
    return jsonResponse(
      respostaRealReconciliacao(
        fin,
        eventId,
        clientIdempotencyKey,
        mapped.responseCode === 'PLATE_LOOKUP_RECONCILIATION_PENDING'
          ? 'PLATE_LOOKUP_RECONCILIATION_PENDING'
          : 'PLATE_LOOKUP_FINALIZE_PENDING',
        MSG_REAL_COMMERCIAL_INCERTO
      ),
      503
    )
  }

  if (mapped.outcome === 'success' && mapped.dados) {
    console.info(
      `[vehicle-plate-lookup] request_id=${requestId} code=${RESULT_CODE_REAL_OK}`
    )
    return jsonResponse(
      respostaRealOk(mapped.dados, fin, eventId, clientIdempotencyKey, replay)
    )
  }

  if (mapped.outcome === 'not_found') {
    return jsonResponse(
      respostaRealNotFound(fin, eventId, clientIdempotencyKey, replay),
      404
    )
  }

  return jsonResponse(
    respostaRealReconciliacao(
      fin,
      eventId,
      clientIdempotencyKey,
      mapped.responseCode,
      mensagemSeguraParaCodigo(mapped.resultCode)
    ),
    mapped.httpStatus >= 500 ? 503 : mapped.httpStatus
  )
}

function mapearDadosBasicoApi(
  dados: Record<string, unknown>,
  placaNorm: string
): DadosVeiculoConsultaResposta {
  const out: DadosVeiculoConsultaResposta = {
    placa: placaNorm,
    fonte: 'api_placas',
  }

  const marca = textoOpcional(dados.marca)
  const modelo = textoOpcional(dados.modelo)
  const cor = textoOpcional(dados.cor)
  const municipio = textoOpcional(dados.municipio)
  const uf = textoOpcional(dados.uf)
  const combustivel = textoOpcional(dados.combustivel)
  const ano = parseAno(dados.ano)

  if (marca) out.marca = marca
  if (modelo) out.modelo = modelo
  if (cor) out.cor = cor
  if (municipio) out.municipio = municipio
  if (uf) out.uf = uf
  if (combustivel) out.combustivel = combustivel
  if (ano !== undefined) out.ano = ano

  return out
}

function mapearCodigoApiParaInterno(codigo: string | undefined, httpStatus: number): string {
  switch (codigo) {
    case 'placa_invalida':
      return 'PLATE_INVALID'
    case 'placa_nao_encontrada':
      return 'PLATE_NOT_FOUND'
    case 'saldo_insuficiente':
      return 'API_BILLING_BLOCKED'
    case 'nao_autorizado':
      return 'API_AUTH_ERROR'
    case 'servico_indisponivel':
    case 'erro_interno':
      return 'API_UNAVAILABLE'
    default:
      if (httpStatus === 404) return 'PLATE_NOT_FOUND'
      if (httpStatus === 402) return 'API_BILLING_BLOCKED'
      if (httpStatus === 401) return 'API_AUTH_ERROR'
      if (httpStatus >= 500) return 'API_UNAVAILABLE'
      return 'API_ERROR'
  }
}

function mensagemSeguraParaCodigo(code: string): string {
  switch (code) {
    case 'PLATE_INVALID':
      return MSG_PLACA_INVALIDA
    case 'PLATE_NOT_FOUND':
      return MSG_PLACA_NAO_ENCONTRADA
    case 'API_BILLING_BLOCKED':
    case 'API_AUTH_ERROR':
    case 'API_UNAVAILABLE':
    case 'API_TIMEOUT':
    case 'API_INVALID_RESPONSE':
    case 'API_ERROR':
    case 'API_CONFIG_MISSING':
      return MSG_SERVICO_INDISPONIVEL
    default:
      return MSG_ERRO_INTERNO
  }
}

function extrairErroEnvelope(payload: Record<string, unknown>): {
  codigo?: string
  message?: string
} {
  const codigo = textoOpcional(payload.codigo)
  const message = textoOpcional(payload.message)
  return { codigo, message }
}

function resultadoErroApi(
  httpStatus: number,
  code: string,
  _requestId: string
): ResultadoConsultaApi {
  return {
    ok: false,
    httpStatus,
    code,
    message: mensagemSeguraParaCodigo(code),
  }
}

async function consultarApiPlacasBasico(
  placaNorm: string,
  requestId: string
): Promise<ResultadoConsultaApi> {
  const token = Deno.env.get(ENV_API_PLACAS_TOKEN)?.trim()
  if (!token) {
    console.info(
      `[vehicle-plate-lookup] request_id=${requestId} code=API_CONFIG_MISSING`
    )
    return resultadoErroApi(503, 'API_CONFIG_MISSING', requestId)
  }

  const url = `${API_PLACAS_V3_BASE}/basico/${encodeURIComponent(placaNorm)}`

  let response: Response
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
  } catch (e) {
    const isTimeout =
      e instanceof DOMException
        ? e.name === 'TimeoutError'
        : e instanceof Error && e.name === 'TimeoutError'
    console.info(
      `[vehicle-plate-lookup] request_id=${requestId} code=${isTimeout ? 'API_TIMEOUT' : 'API_UNAVAILABLE'}`
    )
    return resultadoErroApi(
      503,
      isTimeout ? 'API_TIMEOUT' : 'API_UNAVAILABLE',
      requestId
    )
  }

  const rawText = await response.text()
  let payload: unknown
  try {
    payload = rawText ? JSON.parse(rawText) : null
  } catch {
    console.info(
      `[vehicle-plate-lookup] request_id=${requestId} code=API_INVALID_RESPONSE`
    )
    return resultadoErroApi(502, 'API_INVALID_RESPONSE', requestId)
  }

  const root = asRecord(payload)
  if (!root) {
    console.info(
      `[vehicle-plate-lookup] request_id=${requestId} code=API_INVALID_RESPONSE`
    )
    return resultadoErroApi(502, 'API_INVALID_RESPONSE', requestId)
  }

  if (root.error === true) {
    const { codigo } = extrairErroEnvelope(root)
    const code = mapearCodigoApiParaInterno(codigo, response.status)
    console.info(
      `[vehicle-plate-lookup] request_id=${requestId} code=${code} http=${response.status}`
    )
    const httpStatus =
      code === 'PLATE_NOT_FOUND'
        ? 404
        : code === 'PLATE_INVALID'
          ? 400
          : response.status >= 400 && response.status < 600
            ? response.status
            : 502
    return resultadoErroApi(httpStatus, code, requestId)
  }

  if (!response.ok) {
    const { codigo } = extrairErroEnvelope(root)
    const code = mapearCodigoApiParaInterno(codigo, response.status)
    console.info(
      `[vehicle-plate-lookup] request_id=${requestId} code=${code} http=${response.status}`
    )
    return resultadoErroApi(response.status, code, requestId)
  }

  const basico = asRecord(root.basico)
  if (!basico) {
    console.info(
      `[vehicle-plate-lookup] request_id=${requestId} code=API_INVALID_RESPONSE`
    )
    return resultadoErroApi(502, 'API_INVALID_RESPONSE', requestId)
  }

  if (basico.error === true) {
    const { codigo } = extrairErroEnvelope(basico)
    const code = mapearCodigoApiParaInterno(codigo, response.status)
    console.info(
      `[vehicle-plate-lookup] request_id=${requestId} code=${code} http=${response.status}`
    )
    return resultadoErroApi(
      code === 'PLATE_NOT_FOUND' ? 404 : 502,
      code,
      requestId
    )
  }

  const dados = asRecord(basico.dados)
  if (!dados) {
    console.info(
      `[vehicle-plate-lookup] request_id=${requestId} code=PLATE_NOT_FOUND`
    )
    return resultadoErroApi(404, 'PLATE_NOT_FOUND', requestId)
  }

  const mapeado = mapearDadosBasicoApi(dados, placaNorm)
  const temAlgumDado =
    mapeado.marca ||
    mapeado.modelo ||
    mapeado.ano !== undefined ||
    mapeado.cor ||
    mapeado.municipio ||
    mapeado.uf ||
    mapeado.combustivel

  if (!temAlgumDado) {
    console.info(
      `[vehicle-plate-lookup] request_id=${requestId} code=PLATE_NOT_FOUND`
    )
    return resultadoErroApi(404, 'PLATE_NOT_FOUND', requestId)
  }

  console.info(`[vehicle-plate-lookup] request_id=${requestId} code=PLATE_LOOKUP_OK`)
  return { ok: true, dados: mapeado }
}

export type VehiclePlateLookupHandlerDeps = {
  userClientFn?: (authHeader: string) => SupabaseClient
  executarComercial?: typeof executarConsultaRealComercial
}

/**
 * Handler POST (testável). Prioridade: ENABLED block → simulação → piloto técnico → comercial → dry-run → DISABLED.
 */
export async function handleVehiclePlateLookupRequest(
  req: Request,
  requestId = crypto.randomUUID(),
  deps?: VehiclePlateLookupHandlerDeps
): Promise<Response> {
  const createUserClient = deps?.userClientFn ?? userClient
  const runComercial = deps?.executarComercial ?? executarConsultaRealComercial

  const opt = handleOptions(req)
  if (opt) return opt

  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, erro: 'Método não permitido.' }, 405)
  }

  if (!ambienteHomologAutorizado()) {
    console.info(
      `[vehicle-plate-lookup] request_id=${requestId} code=PLATE_LOOKUP_PRODUCTION_BLOCKED`
    )
    return jsonResponse(
      {
        ok: false,
        code: 'PLATE_LOOKUP_PRODUCTION_BLOCKED',
        message: MSG_PRODUCAO_BLOQUEADA,
        erro: MSG_PRODUCAO_BLOQUEADA,
      },
      403
    )
  }

  try {
    const authHeader = req.headers.get('Authorization') || ''
    if (!authHeader.startsWith('Bearer ')) {
      return jsonResponse({ ok: false, erro: MSG_NAO_AUTH }, 401)
    }

    const userSb = createUserClient(authHeader)
    const { data: userData, error: userErr } = await userSb.auth.getUser()
    if (userErr || !userData.user) {
      return jsonResponse({ ok: false, erro: MSG_SESSAO }, 401)
    }

    const { data: profile, error: profileErr } = await userSb
      .from('profiles')
      .select('id, office_id, active, role')
      .eq('id', userData.user.id)
      .maybeSingle()

    const prof = profile as ProfileRow | null
    if (profileErr || !prof?.office_id || prof.active === false) {
      return jsonResponse({ ok: false, erro: MSG_PERFIL }, 403)
    }

    const officeId = String(prof.office_id)

    const { data: office, error: officeErr } = await userSb
      .from('offices')
      .select('id')
      .eq('id', officeId)
      .maybeSingle()

    if (officeErr || !office?.id) {
      return jsonResponse({ ok: false, erro: MSG_PERFIL }, 403)
    }

    const { data: membership, error: membershipErr } = await userSb
      .from('profiles')
      .select('id')
      .eq('id', userData.user.id)
      .eq('office_id', officeId)
      .maybeSingle()

    if (membershipErr || !membership?.id) {
      return jsonResponse({ ok: false, erro: MSG_PERFIL }, 403)
    }

    const body = (await req.json().catch(() => ({}))) as {
      placa?: string
      office_id?: string
      idempotency_key?: unknown
      dry_run?: unknown
      simulate?: unknown
      plate_lookup_dry_run?: unknown
      enabled?: unknown
    }

    if (
      body.office_id != null ||
      body.dry_run != null ||
      body.simulate != null ||
      body.plate_lookup_dry_run != null ||
      body.enabled != null
    ) {
      console.info(
        `[vehicle-plate-lookup] request_id=${requestId} code=IGNORED_UNTRUSTED_BODY_FIELD`
      )
    }

    const placaRaw = typeof body.placa === 'string' ? body.placa : ''
    if (!placaRaw.trim()) {
      return jsonResponse({ ok: false, erro: MSG_PLACA_OBRIGATORIA }, 400)
    }

    const placaNorm = normalizarPlaca(placaRaw)
    if (!ehPlacaBrasileiraValida(placaNorm)) {
      return jsonResponse(
        {
          ok: false,
          code: 'PLATE_INVALID',
          message: MSG_PLACA_INVALIDA,
          erro: MSG_PLACA_INVALIDA,
        },
        400
      )
    }

    if (consultaExternaHabilitada()) {
      console.info(
        `[vehicle-plate-lookup] request_id=${requestId} code=PLATE_LOOKUP_REAL_MODE_BLOCKED`
      )
      return jsonResponse(
        {
          ok: false,
          code: 'PLATE_LOOKUP_REAL_MODE_BLOCKED',
          message: MSG_MODO_REAL_BLOQUEADO,
          erro: MSG_MODO_REAL_BLOQUEADO,
          chamada_externa: 'bloqueada',
        },
        503
      )
    }

    if (simulacaoHabilitada(officeId, placaNorm)) {
      const parsedKey = parseIdempotencyKey(body.idempotency_key)
      if (!parsedKey.ok) {
        return jsonResponse(
          {
            ok: false,
            code: 'IDEMPOTENCY_INVALID',
            message: MSG_IDEMPOTENCY_INVALID,
            erro: MSG_IDEMPOTENCY_INVALID,
          },
          400
        )
      }
      if (cenarioSimulacao(placaNorm) === 'not_found') {
        return await executarSimulacaoNotFound(
          userSb,
          placaNorm,
          parsedKey.key,
          requestId
        )
      }
      if (cenarioSimulacao(placaNorm) === 'timeout') {
        return await executarSimulacaoTimeout(
          userSb,
          placaNorm,
          parsedKey.key,
          requestId
        )
      }
      if (cenarioSimulacao(placaNorm) === 'api_error') {
        return await executarSimulacaoApiError(
          userSb,
          placaNorm,
          parsedKey.key,
          requestId
        )
      }
      return await executarSimulacaoSucesso(
        userSb,
        placaNorm,
        parsedKey.key,
        requestId
      )
    }

    const candidatoPiloto = classificarCandidatoPilotoReal(officeId, placaNorm)
    if (candidatoPiloto === 'config_invalida') {
      console.info(
        `[vehicle-plate-lookup] request_id=${requestId} code=REAL_PILOT_CONFIG`
      )
      return jsonResponse(
        {
          ok: false,
          code: 'REAL_PILOT_CONFIG',
          message: MSG_REAL_PILOT_CONFIG,
          erro: MSG_REAL_PILOT_CONFIG,
          chamada_externa: 'bloqueada',
        },
        503
      )
    }
    if (candidatoPiloto === 'executar') {
      const parsedKey = parseIdempotencyKey(body.idempotency_key)
      if (!parsedKey.ok) {
        return jsonResponse(
          {
            ok: false,
            code: 'IDEMPOTENCY_INVALID',
            message: MSG_IDEMPOTENCY_INVALID,
            erro: MSG_IDEMPOTENCY_INVALID,
          },
          400
        )
      }
      return await executarConsultaRealPiloto(
        userSb,
        placaNorm,
        parsedKey.key,
        requestId,
        officeId
      )
    }

    const candidatoComercial = classificarCandidatoConsultaRealComercial(officeId)
    if (candidatoComercial === 'config_invalida') {
      console.info(
        `[vehicle-plate-lookup] request_id=${requestId} code=REAL_COMMERCIAL_CONFIG`
      )
      return jsonResponse(
        {
          ok: false,
          code: 'REAL_COMMERCIAL_CONFIG',
          message: MSG_REAL_COMMERCIAL_CONFIG,
          erro: MSG_REAL_COMMERCIAL_CONFIG,
          chamada_externa: 'bloqueada',
        },
        503
      )
    }
    if (candidatoComercial === 'executar') {
      const parsedKey = parseIdempotencyKey(body.idempotency_key)
      if (!parsedKey.ok) {
        return jsonResponse(
          {
            ok: false,
            code: 'IDEMPOTENCY_INVALID',
            message: MSG_IDEMPOTENCY_INVALID,
            erro: MSG_IDEMPOTENCY_INVALID,
          },
          400
        )
      }
      return await runComercial(userSb, placaNorm, parsedKey.key, requestId)
    }

    if (deveNegarConsultaRealOficinaForaAllowlist(officeId)) {
      console.info(
        `[vehicle-plate-lookup] request_id=${requestId} code=REAL_COMMERCIAL_OFFICE_DENIED`
      )
      return jsonResponse(
        {
          ok: false,
          code: 'REAL_COMMERCIAL_OFFICE_DENIED',
          message: MSG_REAL_COMMERCIAL_OFFICE_DENIED,
          erro: MSG_REAL_COMMERCIAL_OFFICE_DENIED,
          chamada_externa: 'bloqueada',
        },
        403
      )
    }

    if (dryRunHabilitado()) {
      const parsedKey = parseIdempotencyKey(body.idempotency_key)
      if (!parsedKey.ok) {
        return jsonResponse(
          {
            ok: false,
            code: 'IDEMPOTENCY_INVALID',
            message: MSG_IDEMPOTENCY_INVALID,
            erro: MSG_IDEMPOTENCY_INVALID,
          },
          400
        )
      }
      return await executarDryRunReservaCancelamento(
        userSb,
        placaNorm,
        parsedKey.key,
        requestId
      )
    }

    console.info(
      `[vehicle-plate-lookup] request_id=${requestId} code=PLATE_LOOKUP_DISABLED`
    )
    return jsonResponse(
      {
        ok: false,
        code: 'PLATE_LOOKUP_DISABLED',
        message: MSG_INTEGRACAO_INDISPONIVEL,
        erro: MSG_INTEGRACAO_INDISPONIVEL,
        chamada_externa: 'desativada',
      },
      503
    )
  } catch (e) {
    console.error(
      `[vehicle-plate-lookup] request_id=${requestId} code=INTERNAL_ERROR`
    )
    return jsonResponse({ ok: false, erro: MSG_ERRO_INTERNO }, 503)
  }
}

if (import.meta.main) {
  Deno.serve((req) => handleVehiclePlateLookupRequest(req))
}
