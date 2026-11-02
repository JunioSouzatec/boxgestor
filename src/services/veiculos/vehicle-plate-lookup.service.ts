/**
 * Consulta básica por placa via Edge Function autenticada.
 * Não preenche formulário, não salva veículo e não chama o fornecedor.
 * office_id / simulate / dry_run / enabled nunca são enviados.
 */

import { getSupabaseClient } from '@/lib/supabase'
import { supabaseUrl as supabaseUrlEnv } from '@/lib/supabase-env'
import {
  ehPlacaBrasileiraValida,
  MSG_PLACA_INVALIDA_CONSULTA,
  normalizarPlaca,
} from '@/lib/placa-normalizar'

const HOMOLOG_SUPABASE_HOST = 'cqnktgouczyrxkkeusio.supabase.co'
const EDGE_FUNCTION = 'vehicle-plate-lookup'
const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9._:-]{1,128}$/

export const MSG_CONSULTA_PLACA_INATIVA = 'Consulta por placa ainda não está ativa.'

export const MSG_CONSULTA_PLACA_PREPARACAO =
  'Consulta por placa em preparação. Em breve o BoxGestor poderá preencher automaticamente os dados básicos do veículo.'

export const MSG_CONSULTA_PLACA_SESSAO =
  'Faça login novamente para consultar a placa.'

export const MSG_CONSULTA_PLACA_PROJETO =
  'Consulta por placa só está liberada no ambiente de Homologação.'

export const MSG_CONSULTA_PLACA_IDEMPOTENCY =
  'Chave de idempotência inválida. Use 1 a 128 caracteres (letras, números, . _ : -).'

export const MSG_CONSULTA_PLACA_REDE =
  'Não foi possível conectar ao serviço de consulta. Tente novamente.'

export const MSG_CONSULTA_PLACA_INVALIDA = 'A resposta da consulta é inválida ou incompleta.'

export type FonteConsultaPlaca = 'api_placas' | 'simulacao_homolog'

/** Campos efetivamente devolvidos pela Edge em sucesso. */
export interface DadosBasicosVeiculoConsulta {
  placa: string
  marca?: string
  modelo?: string
  ano?: number
  cor?: string
  municipio?: string
  uf?: string
  combustivel?: string
  fonte: FonteConsultaPlaca
}

/** Campos do formulário que a consulta poderá preencher no futuro. */
export type CamposVeiculoParaConsulta = Partial<{
  marca: string
  modelo: string
  ano: number
  cor: string
  combustivel: string
  chassi: string
  motor: string
  tipo_veiculo: string
}>

export type ConsultaPlacaCode =
  | 'PLATE_LOOKUP_SIMULATED_OK'
  | 'PLATE_LOOKUP_SIMULATED_NOT_FOUND'
  | 'PLATE_LOOKUP_SIMULATED_TIMEOUT'
  | 'PLATE_LOOKUP_SIMULATED_ERROR'
  | 'PLATE_LOOKUP_FINALIZE_PENDING'
  | 'TRIAL_QUOTA_EXCEEDED'
  | 'PLATE_LOOKUP_DISABLED'
  | 'PLATE_LOOKUP_REAL_MODE_BLOCKED'
  | 'IDEMPOTENCY_REPLAY_BLOCKED'
  | 'IDEMPOTENCY_PLATE_MISMATCH'
  | 'IDEMPOTENCY_INVALID'
  | 'PLATE_INVALID'
  | 'PLATE_LOOKUP_UNAUTHENTICATED'
  | 'PLATE_LOOKUP_PROJECT_BLOCKED'
  | 'PLATE_LOOKUP_NETWORK_ERROR'
  | 'PLATE_LOOKUP_INVALID_RESPONSE'
  | 'PLATE_LOOKUP_UNKNOWN'

export type ConsultaPlacaMetadados = {
  event_id?: string
  idempotency_key?: string
  idempotent_replay?: boolean
  simulacao?: boolean
  consumed?: boolean
  billing_kind?: string
  chamada_externa?: string
}

export type ConsultaPlacaSucesso = ConsultaPlacaMetadados & {
  ok: true
  code: 'PLATE_LOOKUP_SIMULATED_OK'
  dados: DadosBasicosVeiculoConsulta
  idempotency_key: string
  simulacao: boolean
}

export type ConsultaPlacaFalha = ConsultaPlacaMetadados & {
  ok: false
  code: ConsultaPlacaCode | string
  message: string
}

export type ConsultaPlacaResultado = ConsultaPlacaSucesso | ConsultaPlacaFalha

export type ConsultaPlacaInvokeResult = {
  data: unknown
  error: unknown
}

export type ConsultaPlacaCliente = {
  auth: {
    getSession: () => Promise<{
      data: { session: { access_token?: string } | null }
    }>
  }
  functions: {
    invoke: (
      nome: string,
      opcoes: { body: { placa: string; idempotency_key: string } }
    ) => Promise<ConsultaPlacaInvokeResult>
  }
}

/** Injeção só para testes locais. Produção usa o cliente singleton. */
export type ConsultaPlacaDeps = {
  getClient?: () => ConsultaPlacaCliente | null
  getSupabaseUrl?: () => string | undefined | null
}

export function homologFrontendUrlAutorizada(raw: string | undefined | null): boolean {
  const url = raw?.trim() ?? ''
  if (!url) return false
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && parsed.hostname === HOMOLOG_SUPABASE_HOST
  } catch {
    return false
  }
}

export function ehIdempotencyKeyConsultaValida(raw: string): boolean {
  return IDEMPOTENCY_KEY_RE.test(raw)
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function asTexto(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function asBool(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function falha(
  code: ConsultaPlacaFalha['code'],
  message: string,
  extra?: ConsultaPlacaMetadados
): ConsultaPlacaFalha {
  return { ok: false, code, message, ...extra }
}

function metadadosDe(payload: Record<string, unknown>, keyFallback?: string): ConsultaPlacaMetadados {
  return {
    event_id: asTexto(payload.event_id),
    idempotency_key: asTexto(payload.idempotency_key) ?? keyFallback,
    idempotent_replay: asBool(payload.idempotent_replay),
    simulacao: asBool(payload.simulacao),
    consumed: asBool(payload.consumed),
    billing_kind: asTexto(payload.billing_kind),
    chamada_externa: asTexto(payload.chamada_externa),
  }
}

export function extrairDadosVeiculoConsulta(
  raw: unknown,
  placaEsperada: string
): DadosBasicosVeiculoConsulta | null {
  const stored = asRecord(raw)
  if (!stored) return null
  const placa = asTexto(stored.placa) ? normalizarPlaca(String(stored.placa)) : ''
  if (placa !== placaEsperada) return null
  const fonte = asTexto(stored.fonte)
  if (fonte !== 'api_placas' && fonte !== 'simulacao_homolog') return null

  const dados: DadosBasicosVeiculoConsulta = { placa, fonte }
  const marca = asTexto(stored.marca)
  const modelo = asTexto(stored.modelo)
  const cor = asTexto(stored.cor)
  const municipio = asTexto(stored.municipio)
  const uf = asTexto(stored.uf)
  const combustivel = asTexto(stored.combustivel)
  if (marca) dados.marca = marca
  if (modelo) dados.modelo = modelo
  if (cor) dados.cor = cor
  if (municipio) dados.municipio = municipio
  if (uf) dados.uf = uf
  if (combustivel) dados.combustivel = combustivel
  if (typeof stored.ano === 'number' && Number.isFinite(stored.ano)) {
    dados.ano = Math.floor(stored.ano)
  }
  return dados
}

async function lerCorpoHttpError(error: unknown): Promise<Record<string, unknown> | null> {
  if (!error || typeof error !== 'object') return null
  const ctx = (error as { context?: unknown }).context
  if (!ctx || typeof ctx !== 'object') return null
  const maybeJson = (ctx as { json?: () => Promise<unknown> }).json
  if (typeof maybeJson !== 'function') return asRecord(ctx)
  try {
    const clone =
      typeof (ctx as Response).clone === 'function' ? (ctx as Response).clone() : ctx
    const parsed = await (clone as { json: () => Promise<unknown> }).json()
    return asRecord(parsed)
  } catch {
    return null
  }
}

function mensagemPorCodigo(code: string, fallback?: string): string {
  switch (code) {
    case 'PLATE_LOOKUP_SIMULATED_NOT_FOUND':
      return 'Nenhum veículo encontrado para esta placa.'
    case 'PLATE_LOOKUP_SIMULATED_TIMEOUT':
      return 'Serviço de consulta por placa temporariamente indisponível.'
    case 'PLATE_LOOKUP_SIMULATED_ERROR':
      return 'Consulta por placa indisponível no momento.'
    case 'PLATE_LOOKUP_FINALIZE_PENDING':
      return 'A reserva foi criada, mas a confirmação não chegou. Repita com a mesma chave.'
    case 'TRIAL_QUOTA_EXCEEDED':
      return 'A franquia de consultas por placa deste ciclo foi atingida.'
    case 'PLATE_LOOKUP_DISABLED':
      return MSG_CONSULTA_PLACA_INATIVA
    case 'PLATE_LOOKUP_REAL_MODE_BLOCKED':
      return 'Consulta real por placa ainda não está liberada neste ambiente.'
    case 'IDEMPOTENCY_REPLAY_BLOCKED':
    case 'IDEMPOTENCY_PLATE_MISMATCH':
      return 'Esta chave de idempotência já foi usada e não pode repetir esta consulta.'
    case 'PLATE_LOOKUP_UNAUTHENTICATED':
      return MSG_CONSULTA_PLACA_SESSAO
    case 'PLATE_LOOKUP_PROJECT_BLOCKED':
      return MSG_CONSULTA_PLACA_PROJETO
    case 'PLATE_LOOKUP_NETWORK_ERROR':
      return MSG_CONSULTA_PLACA_REDE
    case 'PLATE_INVALID':
      return MSG_PLACA_INVALIDA_CONSULTA
    case 'IDEMPOTENCY_INVALID':
      return MSG_CONSULTA_PLACA_IDEMPOTENCY
    default:
      return fallback || MSG_CONSULTA_PLACA_INVALIDA
  }
}

function ehErroRede(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const nome = asTexto((error as { name?: unknown }).name) ?? ''
  const msg = (asTexto((error as { message?: unknown }).message) ?? '').toLowerCase()
  return (
    nome === 'FunctionsFetchError' ||
    msg.includes('failed to fetch') ||
    msg.includes('network') ||
    msg.includes('failed to send')
  )
}

function ehErroHttpFunctions(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const nome = asTexto((error as { name?: unknown }).name) ?? ''
  const msg = (asTexto((error as { message?: unknown }).message) ?? '').toLowerCase()
  return nome === 'FunctionsHttpError' || msg.includes('non-2xx')
}

export function interpretarRespostaConsultaPlaca(
  payload: Record<string, unknown> | null,
  placaNorm: string,
  idempotencyKey: string,
  fallbackCode = 'PLATE_LOOKUP_UNKNOWN'
): ConsultaPlacaResultado {
  if (!payload) {
    return falha(fallbackCode, mensagemPorCodigo(fallbackCode), {
      idempotency_key: idempotencyKey,
    })
  }

  const meta = metadadosDe(payload, idempotencyKey)
  const code = asTexto(payload.code) ?? fallbackCode
  const message = asTexto(payload.message) ?? asTexto(payload.erro)

  if (code === 'PLATE_LOOKUP_SIMULATED_OK' && payload.ok === true) {
    const dados = extrairDadosVeiculoConsulta(payload.dados, placaNorm)
    if (!dados) {
      return falha('PLATE_LOOKUP_INVALID_RESPONSE', MSG_CONSULTA_PLACA_INVALIDA, meta)
    }
    return {
      ok: true,
      code: 'PLATE_LOOKUP_SIMULATED_OK',
      dados,
      event_id: meta.event_id,
      idempotency_key: meta.idempotency_key ?? idempotencyKey,
      idempotent_replay: meta.idempotent_replay,
      simulacao: meta.simulacao === true || dados.fonte === 'simulacao_homolog',
      consumed: meta.consumed,
      billing_kind: meta.billing_kind,
      chamada_externa: meta.chamada_externa,
    }
  }

  if (code === 'PLATE_LOOKUP_SIMULATED_OK') {
    return falha('PLATE_LOOKUP_INVALID_RESPONSE', MSG_CONSULTA_PLACA_INVALIDA, meta)
  }

  return falha(code, mensagemPorCodigo(code, message), meta)
}

/**
 * Invoca a Edge Function com JWT da sessão.
 * A idempotency_key deve ser criada e reutilizada pelo chamador (botão).
 * Este serviço não gera chave nova.
 */
export async function consultarPlacaVeiculo(
  placa: string,
  idempotencyKey: string,
  deps: ConsultaPlacaDeps = {}
): Promise<ConsultaPlacaResultado> {
  const getUrl = deps.getSupabaseUrl ?? (() => supabaseUrlEnv)
  if (!homologFrontendUrlAutorizada(getUrl())) {
    return falha('PLATE_LOOKUP_PROJECT_BLOCKED', MSG_CONSULTA_PLACA_PROJETO)
  }

  if (!ehPlacaBrasileiraValida(placa)) {
    return falha('PLATE_INVALID', MSG_PLACA_INVALIDA_CONSULTA)
  }

  if (!ehIdempotencyKeyConsultaValida(idempotencyKey)) {
    return falha('IDEMPOTENCY_INVALID', MSG_CONSULTA_PLACA_IDEMPOTENCY)
  }

  const placaNorm = normalizarPlaca(placa)
  const getClient = deps.getClient ?? (() => getSupabaseClient() as ConsultaPlacaCliente | null)
  const supabase = getClient()
  if (!supabase) {
    return falha('PLATE_LOOKUP_UNAUTHENTICATED', MSG_CONSULTA_PLACA_SESSAO)
  }

  const sessao = await supabase.auth.getSession()
  if (!sessao.data.session?.access_token) {
    return falha('PLATE_LOOKUP_UNAUTHENTICATED', MSG_CONSULTA_PLACA_SESSAO, {
      idempotency_key: idempotencyKey,
    })
  }

  let data: unknown
  let error: unknown
  try {
    const invoked = await supabase.functions.invoke(EDGE_FUNCTION, {
      body: {
        placa: placaNorm,
        idempotency_key: idempotencyKey,
      },
    })
    data = invoked.data
    error = invoked.error
  } catch (e) {
    if (ehErroRede(e)) {
      return falha('PLATE_LOOKUP_NETWORK_ERROR', MSG_CONSULTA_PLACA_REDE, {
        idempotency_key: idempotencyKey,
      })
    }
    return falha('PLATE_LOOKUP_UNKNOWN', MSG_CONSULTA_PLACA_INVALIDA, {
      idempotency_key: idempotencyKey,
    })
  }

  const corpoData = asRecord(data)
  const corpoErro = await lerCorpoHttpError(error)
  const payload = corpoData ?? corpoErro

  if (error) {
    if (ehErroRede(error) && !payload) {
      return falha('PLATE_LOOKUP_NETWORK_ERROR', MSG_CONSULTA_PLACA_REDE, {
        idempotency_key: idempotencyKey,
      })
    }

    const msgErro = asTexto((error as { message?: unknown }).message) ?? ''
    const status =
      typeof (error as { context?: { status?: unknown } }).context?.status === 'number'
        ? (error as { context: { status: number } }).context.status
        : undefined

    if ((status === 401 || status === 403) && !asTexto(payload?.code)) {
      return falha('PLATE_LOOKUP_UNAUTHENTICATED', MSG_CONSULTA_PLACA_SESSAO, {
        idempotency_key: idempotencyKey,
      })
    }

    if (ehErroHttpFunctions(error) || payload) {
      return interpretarRespostaConsultaPlaca(
        payload,
        placaNorm,
        idempotencyKey,
        asTexto(payload?.code) ?? 'PLATE_LOOKUP_UNKNOWN'
      )
    }

    if (msgErro.toLowerCase().includes('jwt') || msgErro.toLowerCase().includes('auth')) {
      return falha('PLATE_LOOKUP_UNAUTHENTICATED', MSG_CONSULTA_PLACA_SESSAO, {
        idempotency_key: idempotencyKey,
      })
    }

    return falha('PLATE_LOOKUP_UNKNOWN', MSG_CONSULTA_PLACA_INVALIDA, {
      idempotency_key: idempotencyKey,
    })
  }

  return interpretarRespostaConsultaPlaca(payload, placaNorm, idempotencyKey)
}
