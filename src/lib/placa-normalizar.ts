/** Remove espaços/hífen e converte para maiúsculas — comparação única de placas. */
export function normalizarPlaca(placa: string): string {
  return placa.trim().toUpperCase().replace(/[\s-]/g, '')
}

export function placasIguais(placaA: string, placaB: string): boolean {
  const a = normalizarPlaca(placaA)
  const b = normalizarPlaca(placaB)
  return a.length > 0 && a === b
}

/** Mínimo 3 caracteres normalizados para busca parcial enquanto digita. */
export function placaCorrespondeBusca(placaCadastrada: string, placaDigitada: string): boolean {
  const busca = normalizarPlaca(placaDigitada)
  if (busca.length < 3) return false
  const cadastro = normalizarPlaca(placaCadastrada)
  if (!cadastro) return false
  return cadastro === busca || cadastro.startsWith(busca)
}

/** Placa antiga: ABC1234 (3 letras + 4 dígitos). */
const PLACA_ANTIGA_RE = /^[A-Z]{3}\d{4}$/

/** Placa Mercosul: ABC1D23 (3 letras + 1 dígito + 1 letra + 2 dígitos). */
const PLACA_MERCOSUL_RE = /^[A-Z]{3}\d[A-Z]\d{2}$/

export const MSG_PLACA_INVALIDA_CONSULTA = 'Informe uma placa válida para consultar.'

/**
 * Valida placa brasileira (antiga ou Mercosul) após normalizar.
 * Não bloqueia cadastro manual — uso apenas para habilitar consulta.
 */
export function ehPlacaBrasileiraValida(placa: string): boolean {
  const n = normalizarPlaca(placa)
  if (n.length !== 7) return false
  return PLACA_ANTIGA_RE.test(n) || PLACA_MERCOSUL_RE.test(n)
}
