/**
 * F6B — Contrato genérico de provedor fiscal (sem chamada externa).
 * Métodos de envio/emissão ficam desativados nesta fase.
 */

import type { FiscalConfigOficina } from '@/types/fiscal-config'
import type { PreparacaoNotaFiscal } from '@/types/fiscal-preparacao'
import type { ConfiguracaoOficina } from '@/types/oficina'
import type { Cliente } from '@/types/cliente'

export type FiscalProviderId = 'focus_nfe' | 'outro' | 'nao_escolhido'

export interface FiscalProviderBuildContext {
  preparacao: PreparacaoNotaFiscal
  configuracao?: ConfiguracaoOficina | null
  fiscalConfig: FiscalConfigOficina
  cliente?: Cliente | null
}

export interface FiscalProviderHomologationStatus {
  provider: string
  ambiente_desejado: string
  configurado: boolean
  emissao_real: false
  chamada_externa: 'desativada'
  mensagem: string
}

/**
 * Adapter interno — não faz fetch/axios para provedor.
 */
export interface FiscalProviderAdapter<TPayload = unknown> {
  getProviderName(): string
  getProviderId(): FiscalProviderId
  isConfigured(config: FiscalConfigOficina): boolean
  buildPayloadFromPreparation(ctx: FiscalProviderBuildContext): TPayload
  validateBeforeSend(payload: TPayload, ctx: FiscalProviderBuildContext): FiscalValidacaoTecnicaResultado
  sanitizeForPreview(payload: TPayload): unknown
  getHomologationStatus(config: FiscalConfigOficina): FiscalProviderHomologationStatus
  /** Desativado na F6B — não chama API. */
  sendDisabled(): never
}

export type SeveridadeValidacaoTecnica = 'bloqueante' | 'alerta' | 'informativo'

export interface ItemValidacaoTecnica {
  id: string
  escopo: 'config' | 'oficina' | 'cliente' | 'produto' | 'servico' | 'documento' | 'geral'
  severidade: SeveridadeValidacaoTecnica
  mensagem: string
}

export interface FiscalValidacaoTecnicaResultado {
  pronto_tecnicamente: boolean
  bloqueios: ItemValidacaoTecnica[]
  alertas: ItemValidacaoTecnica[]
  informativos: ItemValidacaoTecnica[]
}
