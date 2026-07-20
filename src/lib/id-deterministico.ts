/**
 * UUID determinístico (formato RFC) a partir de uma seed estável.
 * Usado para idempotência de movimentos OS (mesmo delta = mesmo id em PC/celular).
 */
export function uuidFromSeed(seed: string): string {
  const bytes = new Uint8Array(16)
  let h1 = 2166136261
  let h2 = 2166136261 ^ 0x9e3779b9

  for (let i = 0; i < seed.length; i++) {
    const c = seed.charCodeAt(i)
    h1 ^= c
    h1 = Math.imul(h1, 16777619)
    h2 ^= c + i * 131
    h2 = Math.imul(h2, 2246822519)
  }

  for (let i = 0; i < 8; i++) {
    bytes[i] = (h1 >>> (i * 4)) & 0xff
    bytes[8 + i] = (h2 >>> (i * 4)) & 0xff
  }

  // versão 4 / variante RFC 4122 (só formatamente válido)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80

  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** Chave estável de um delta de estoque por OS/peça. */
export function chaveIdempotenciaDeltaOS(
  osId: string,
  pecaId: string,
  de: number,
  para: number
): string {
  const a = Math.round(de * 1000) / 1000
  const b = Math.round(para * 1000) / 1000
  return `os-delta:${osId}:${pecaId}:${a}->${b}`
}

export function idMovimentoDeltaOS(
  osId: string,
  pecaId: string,
  de: number,
  para: number
): string {
  return uuidFromSeed(chaveIdempotenciaDeltaOS(osId, pecaId, de, para))
}
