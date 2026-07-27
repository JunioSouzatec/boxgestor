/**
 * Configurações simples de caixa (Fase 3B1).
 * Persistido em settings.metadata.caixa_config — sem migration.
 * Caixa por operador fica fora desta fase.
 */

export interface CaixaConfigOficina {
  /** Se true, pagamentos reais exigem caixa aberto (exceto dono/admin/gerente com motivo). */
  exigir_caixa_aberto_pagamentos: boolean
}

export const CAIXA_CONFIG_PADRAO: CaixaConfigOficina = {
  exigir_caixa_aberto_pagamentos: false,
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export function normalizarCaixaConfig(
  raw?: Partial<CaixaConfigOficina> | null | unknown
): CaixaConfigOficina {
  if (!isRecord(raw)) return { ...CAIXA_CONFIG_PADRAO }
  return {
    exigir_caixa_aberto_pagamentos: raw.exigir_caixa_aberto_pagamentos === true,
  }
}

export function obterCaixaConfig(
  configuracao?: { caixa_config?: CaixaConfigOficina | null } | null | unknown
): CaixaConfigOficina {
  if (!isRecord(configuracao)) return { ...CAIXA_CONFIG_PADRAO }
  return normalizarCaixaConfig(configuracao.caixa_config)
}
