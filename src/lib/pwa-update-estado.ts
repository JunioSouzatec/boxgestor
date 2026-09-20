import { versaoAppAmigavel } from '@/lib/app-versao'

const VERSAO_SOLICITADA_KEY = 'boxgestor:versao-atualizacao-solicitada'

let confirmacaoConsumidaNestaSessao = false

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
