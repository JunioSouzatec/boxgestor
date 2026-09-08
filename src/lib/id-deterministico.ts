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

const CASAS_DECIMAIS_DELTA_ESTOQUE = 3

/** Representação canônica, independente de locale: arredonda em 3 casas e remove zeros finais. */
export function formatarQuantidadeChaveEstoque(valor: number): string {
  const fator = 10 ** CASAS_DECIMAIS_DELTA_ESTOQUE
  const arredondado = Math.round(valor * fator) / fator
  return Object.is(arredondado, -0) ? '0' : String(arredondado)
}

export interface ChaveDeltaEstoque {
  osId: string
  pecaId: string
  de: number
  para: number
  canonica: string
}

/** Aceita também chaves legadas como `0.->2.` e devolve a forma canônica `0->2`. */
export function analisarChaveIdempotenciaDeltaOS(chave: string | undefined): ChaveDeltaEstoque | null {
  if (!chave) return null
  const match = chave.match(
    /^os-delta:([^:]+):([^:]+):([+-]?(?:\d+(?:\.\d*)?|\.\d+))->([+-]?(?:\d+(?:\.\d*)?|\.\d+))$/
  )
  if (!match) return null

  const de = Number(match[3])
  const para = Number(match[4])
  if (!Number.isFinite(de) || !Number.isFinite(para)) return null

  const osId = match[1]
  const pecaId = match[2]
  return {
    osId,
    pecaId,
    de,
    para,
    canonica: `os-delta:${osId}:${pecaId}:${formatarQuantidadeChaveEstoque(de)}->${formatarQuantidadeChaveEstoque(para)}`,
  }
}

/** Chave estável de um delta de estoque por OS/peça. */
export function chaveIdempotenciaDeltaOS(
  osId: string,
  pecaId: string,
  de: number,
  para: number
): string {
  const a = formatarQuantidadeChaveEstoque(de)
  const b = formatarQuantidadeChaveEstoque(para)
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
