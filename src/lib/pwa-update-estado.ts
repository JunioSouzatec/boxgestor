const VERSAO_SOLICITADA_KEY = 'boxgestor:versao-atualizacao-solicitada'

export function marcarVersaoAtualizacaoSolicitada(versao: string): void {
  const valor = versao.trim()
  if (!valor || typeof sessionStorage === 'undefined') return
  sessionStorage.setItem(VERSAO_SOLICITADA_KEY, valor)
}

export function obterVersaoAtualizacaoSolicitada(): string | null {
  if (typeof sessionStorage === 'undefined') return null
  return sessionStorage.getItem(VERSAO_SOLICITADA_KEY)
}

export function limparVersaoAtualizacaoSolicitada(): void {
  if (typeof sessionStorage === 'undefined') return
  sessionStorage.removeItem(VERSAO_SOLICITADA_KEY)
}

/** Não reexibe o aviso da mesma versão depois do clique explícito em Atualizar agora. */
export function deveExibirAvisoNovaVersao(
  currentVersion: string,
  remoteVersion: string | null,
  versaoSolicitada: string | null = obterVersaoAtualizacaoSolicitada()
): boolean {
  if (!remoteVersion) return false
  if (remoteVersion === currentVersion) return false
  if (versaoSolicitada && versaoSolicitada === remoteVersion) return false
  return true
}
