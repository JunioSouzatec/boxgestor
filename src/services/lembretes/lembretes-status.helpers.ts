import type {
  LembreteCliente,
  StatusFixoLembrete,
  StatusLembrete,
} from '@/types/lembrete'
import {
  lembreteStatusEncerrado,
  lembreteStatusRequerAcao,
  obterUltimaAcaoLembrete,
} from '@/types/lembrete'

const STATUS_APOS_PARA_FIXO: Partial<Record<StatusLembrete, StatusFixoLembrete>> = {
  enviado: 'enviado',
  concluido: 'concluido',
  cancelado: 'cancelado',
  falha_envio: 'falha_envio',
}

export function obterUpdatedAtLembrete(lembrete: LembreteCliente): string {
  const ultima = obterUltimaAcaoLembrete(lembrete)
  return lembrete.updated_at ?? ultima?.data ?? lembrete.created_at ?? ''
}

/** Deriva status_fixo a partir do histórico mais recente, se necessário. */
export function normalizarLembreteAposCarga(lembrete: LembreteCliente): LembreteCliente {
  const ultima = obterUltimaAcaoLembrete(lembrete)
  if (!ultima?.status_apos) return lembrete

  const fixoFromHist = STATUS_APOS_PARA_FIXO[ultima.status_apos]
  if (!fixoFromHist) return lembrete

  if (!lembrete.status_fixo) {
    return { ...lembrete, status_fixo: fixoFromHist }
  }

  if (lembreteStatusEncerrado(ultima.status_apos) || ultima.status_apos === 'enviado') {
    const histData = ultima.data
    const fixoData = lembrete.updated_at ?? lembrete.created_at ?? ''
    if (!fixoData || histData >= fixoData) {
      return { ...lembrete, status_fixo: fixoFromHist }
    }
  }

  return lembrete
}

export function calcularStatusLembreteComHistorico(
  lembrete: LembreteCliente,
  calcularPorData: (l: LembreteCliente) => StatusLembrete
): StatusLembrete {
  const normalizado = normalizarLembreteAposCarga(lembrete)

  if (normalizado.status_fixo) {
    const map: Record<StatusFixoLembrete, StatusLembrete> = {
      enviado: 'enviado',
      concluido: 'concluido',
      cancelado: 'cancelado',
      falha_envio: 'falha_envio',
      contatado: 'enviado',
    }
    return map[normalizado.status_fixo] ?? calcularPorData(normalizado)
  }

  const ultima = obterUltimaAcaoLembrete(normalizado)
  if (ultima?.status_apos && !lembreteStatusRequerAcao(ultima.status_apos)) {
    return ultima.status_apos
  }

  return calcularPorData(normalizado)
}
