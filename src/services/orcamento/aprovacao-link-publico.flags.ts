/**
 * Feature flag A2.4 — link público real (Edge Functions + approval_links).
 * Ativado após migrations aplicadas e functions testadas (A2.3 / A2.3B).
 */
export const APROVACAO_LINK_PUBLICO_BACKEND_ATIVO: boolean = true

export const APROVACAO_LINK_PUBLICO_MSG_BLOQUEIO =
  'Link público indisponível no momento. Use prévia, PDF ou aprovação manual.'

export function aprovacaoLinkPublicoBackendAtivo(): boolean {
  return Boolean(APROVACAO_LINK_PUBLICO_BACKEND_ATIVO)
}
