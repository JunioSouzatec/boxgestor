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
