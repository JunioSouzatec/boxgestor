/** Revision remota quando a sessão de edição do dialog começou (base CAS). */
export function normalizarRevisionBaseEdicao(revision: unknown): number | null {
  return typeof revision === 'number' && Number.isFinite(revision) ? revision : null
}

/** expected_revision para RPC: prioriza base congelada da sessão de edição. */
export function expectedRevisionParaCas(
  revisionBaseEdicao: number | null,
  osFallback?: { revision?: number | null }
): number | null {
  if (revisionBaseEdicao !== null) return revisionBaseEdicao
  return normalizarRevisionBaseEdicao(osFallback?.revision)
}

/**
 * Enquanto o dialog de OS está aberto, não adotar revision mais nova do storage
 * para a OS que está sendo editada (merge fresh em atualizarOS).
 */
export function revisionOrdemServicoAposMergeFresh(
  dialogOsAberto: boolean,
  osEmAtualizacaoId: string,
  osListaId: string,
  revisionLocal: number | undefined,
  revisionRemota: number | undefined
): number | undefined {
  if (dialogOsAberto && osEmAtualizacaoId === osListaId) {
    return revisionLocal ?? revisionRemota
  }
  return revisionRemota ?? revisionLocal
}
