/**
 * F6B — Adapter Focus NFe (base técnica sem chamada externa).
 */

import {
  certificadoInformado,
  labelAmbienteDesejado,
  type FiscalConfigOficina,
} from '@/types/fiscal-config'
import type {
  FiscalProviderAdapter,
  FiscalProviderBuildContext,
  FiscalProviderHomologationStatus,
  FiscalValidacaoTecnicaResultado,
} from '../fiscal-provider.types'
import { buildFocusPayloadFromPreparation } from './focus-payload-builder.service'
import { logFocusInterno, sanitizeFocusPayloadForPreview } from './focus-sanitizer.service'
import type { FocusPayloadTecnico, FocusPreviaTecnica } from './focus.types'
import { validarFocusAntesDeEnviar } from './focus-validacao-tecnica.service'

export class FocusNfeAdapter implements FiscalProviderAdapter<FocusPayloadTecnico> {
  getProviderName(): string {
    return 'Focus NFe'
  }

  getProviderId() {
    return 'focus_nfe' as const
  }

  isConfigured(config: FiscalConfigOficina): boolean {
    return (
      config.provedor.nome === 'focus_nfe' &&
      config.ambiente_desejado === 'homologacao' &&
      config.provedor.token_configurado &&
      certificadoInformado(config)
    )
  }

  buildPayloadFromPreparation(ctx: FiscalProviderBuildContext): FocusPayloadTecnico {
    const payload = buildFocusPayloadFromPreparation({
      preparacao: ctx.preparacao,
      configuracao: ctx.configuracao,
      fiscalConfig: ctx.fiscalConfig,
      cliente: ctx.cliente,
    })
    logFocusInterno('payload_tecnico_montado', {
      origem: payload.origem,
      tipo: payload.tipo_documento_interno,
      produtos: payload.produtos.length,
      servicos: payload.servicos.length,
      emissao: 'desativada',
    })
    return payload
  }

  validateBeforeSend(
    payload: FocusPayloadTecnico,
    ctx: FiscalProviderBuildContext
  ): FiscalValidacaoTecnicaResultado {
    const resultado = validarFocusAntesDeEnviar({
      payload,
      preparacao: ctx.preparacao,
      fiscalConfig: ctx.fiscalConfig,
      configuracao: ctx.configuracao,
      cliente: ctx.cliente,
    })
    logFocusInterno('validacao_tecnica', {
      pronto: resultado.pronto_tecnicamente,
      bloqueios: resultado.bloqueios.length,
      alertas: resultado.alertas.length,
    })
    return resultado
  }

  sanitizeForPreview(payload: FocusPayloadTecnico): unknown {
    return sanitizeFocusPayloadForPreview(payload)
  }

  getHomologationStatus(config: FiscalConfigOficina): FiscalProviderHomologationStatus {
    const configurado = this.isConfigured(config)
    return {
      provider: this.getProviderName(),
      ambiente_desejado: labelAmbienteDesejado(config.ambiente_desejado),
      configurado,
      emissao_real: false,
      chamada_externa: 'desativada',
      mensagem: configurado
        ? 'Base técnica Focus preparada para futura homologação. Emissão ainda desativada.'
        : 'Complete provedor Focus, homologação, token marcado e certificado informado.',
    }
  }

  sendDisabled(): never {
    throw new Error('Emissão fiscal desativada nesta fase.')
  }
}

export const focusNfeAdapter = new FocusNfeAdapter()

/** Monta a prévia técnica completa em memória (sem API). */
export function montarPreviaTecnicaFocus(ctx: FiscalProviderBuildContext): FocusPreviaTecnica {
  const adapter = focusNfeAdapter
  const payload = adapter.buildPayloadFromPreparation(ctx)
  const validacao = adapter.validateBeforeSend(payload, ctx)
  const status = adapter.getHomologationStatus(ctx.fiscalConfig)

  return {
    provedor: 'Focus NFe',
    ambiente_desejado: status.ambiente_desejado,
    tipo_interno: payload.tipo_documento_label,
    status_emissao: 'Emissão desativada',
    chamada_externa: 'Desativada nesta fase',
    pronto_tecnicamente: validacao.pronto_tecnicamente,
    validacao,
    payload_sanitizado: adapter.sanitizeForPreview(payload),
    avisos: [
      'Prévia técnica interna. Não envia dados para a Focus. Não emite nota fiscal.',
      ...payload.avisos_documento,
    ],
  }
}
