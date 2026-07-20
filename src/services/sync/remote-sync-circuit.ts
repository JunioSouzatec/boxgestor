/** Circuit breaker compartilhado — evita flood 401 em módulos secundários. */

const CIRCUIT_MS = 10 * 60 * 1000
const abertoAte = new Map<string, number>()

export function isErroAuthOuPermissao(mensagem: string | null | undefined): boolean {
  if (!mensagem) return false
  const m = mensagem.toLowerCase()
  return (
    m.includes('401') ||
    m.includes('unauthorized') ||
    m.includes('jwt') ||
    m.includes('permission denied') ||
    m.includes('not authenticated') ||
    m.includes('row-level security') ||
    (m.includes('session') && m.includes('expired'))
  )
}

export function abrirCircuitSyncModulo(modulo: string, officeId: string, motivo: string): void {
  const key = `${modulo}:${officeId}`
  abertoAte.set(key, Date.now() + CIRCUIT_MS)
  console.warn('[BoxGestor Sync][queue] circuit_open', {
    modulo,
    officeId,
    motivo: motivo.slice(0, 160),
  })
}

export function circuitSyncModuloAberto(modulo: string, officeId: string): boolean {
  const key = `${modulo}:${officeId}`
  const ate = abertoAte.get(key)
  if (!ate) return false
  if (Date.now() >= ate) {
    abertoAte.delete(key)
    return false
  }
  return true
}

export function fecharCircuitSyncModulo(modulo: string, officeId: string): void {
  abertoAte.delete(`${modulo}:${officeId}`)
}
