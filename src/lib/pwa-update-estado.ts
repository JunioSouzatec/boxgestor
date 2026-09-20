import { versaoAppAmigavel } from '@/lib/app-versao'

const VERSAO_SOLICITADA_KEY = 'boxgestor:versao-atualizacao-solicitada'

let confirmacaoConsumidaNestaSessao = false

/** Snapshot reativo para IdentidadeBoxGestor (waiting ≠ toast já anunciado). */
export type PwaUpdateUiSnapshot = {
  checking: boolean
  hasWaiting: boolean
}

let pwaUpdateUi: PwaUpdateUiSnapshot = { checking: false, hasWaiting: false }
const pwaUpdateUiListeners = new Set<() => void>()

export function obterPwaUpdateUiSnapshot(): PwaUpdateUiSnapshot {
  return pwaUpdateUi
}

export function subscribePwaUpdateUi(onStoreChange: () => void): () => void {
  pwaUpdateUiListeners.add(onStoreChange)
  return () => {
    pwaUpdateUiListeners.delete(onStoreChange)
  }
}

export function setPwaUpdateUi(partial: Partial<PwaUpdateUiSnapshot>): void {
  const next: PwaUpdateUiSnapshot = {
    checking: partial.checking ?? pwaUpdateUi.checking,
    hasWaiting: partial.hasWaiting ?? pwaUpdateUi.hasWaiting,
  }
  if (
    next.checking === pwaUpdateUi.checking &&
    next.hasWaiting === pwaUpdateUi.hasWaiting
  ) {
    return
  }
  pwaUpdateUi = next
  pwaUpdateUiListeners.forEach((listener) => listener())
}

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

/** Banner some só quando a versão atual já é a remota — não após clique incompleto. */
export function deveExibirAvisoNovaVersao(
  currentVersion: string,
  remoteVersion: string | null
): boolean {
  if (!remoteVersion) return false
  if (remoteVersion === currentVersion) return false
  return true
}

export function deveExibirConfirmacaoAtualizacao(
  currentVersion: string,
  versaoSolicitada: string | null = obterVersaoAtualizacaoSolicitada()
): boolean {
  if (confirmacaoConsumidaNestaSessao) return false
  if (!versaoSolicitada) return false
  return versaoSolicitada === currentVersion
}

/** Consome a marca uma vez: sucesso só após reload da versão pedida, não em F5. */
export function consumirConfirmacaoAtualizacao(currentVersion: string): boolean {
  if (!deveExibirConfirmacaoAtualizacao(currentVersion)) return false
  confirmacaoConsumidaNestaSessao = true
  limparVersaoAtualizacaoSolicitada()
  return true
}

export function versaoAppCurta(version: string, builtAt?: string): string {
  return versaoAppAmigavel(version, builtAt)
}

export function mensagemBoxGestorAtualizado(version: string, builtAt?: string): string {
  return `BoxGestor atualizado com sucesso.\nVersão atual: ${versaoAppAmigavel(version, builtAt)}`
}

/** Só para testes. */
export function resetarConfirmacaoAtualizacaoParaTeste(): void {
  confirmacaoConsumidaNestaSessao = false
  limparVersaoAtualizacaoSolicitada()
}

/** Só para testes. */
export function resetarPwaUpdateUiParaTeste(): void {
  pwaUpdateUi = { checking: false, hasWaiting: false }
  pwaUpdateUiListeners.clear()
}
