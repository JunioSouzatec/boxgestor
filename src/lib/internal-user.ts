const DOMINIO_INTERNO = 'boxgestor.local'

/** Normaliza login interno: minúsculas, sem espaços. */
export function normalizarLoginInterno(valor: string): string {
  return valor
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9._-]/g, '')
}

/** Slug estável da oficina para e-mail técnico interno. */
export function gerarSlugOficinaInterno(officeId: string, nomeOficina?: string): string {
  const base = (nomeOficina ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)

  if (base.length >= 3) return base
  return officeId.replace(/-/g, '').slice(0, 12).toLowerCase() || 'oficina'
}

export function gerarEmailInterno(login: string, officeSlug: string): string {
  const user = normalizarLoginInterno(login)
  const slug = officeSlug.trim().toLowerCase()
  return `${user}@${slug}.${DOMINIO_INTERNO}`
}

export function ehEmailInternoBoxGestor(email: string): boolean {
  return email.trim().toLowerCase().endsWith(`.${DOMINIO_INTERNO}`)
}

export function extrairLoginDeEmailInterno(email: string): string | null {
  if (!ehEmailInternoBoxGestor(email)) return null
  const partes = email.trim().toLowerCase().split('@')
  return partes[0] || null
}

export function identificadorPareceEmail(valor: string): boolean {
  return valor.includes('@')
}

export function validarLoginInterno(login: string): string | null {
  const norm = normalizarLoginInterno(login)
  if (norm.length < 3) return 'O usuário deve ter pelo menos 3 caracteres.'
  if (norm.length > 32) return 'O usuário deve ter no máximo 32 caracteres.'
  return null
}

export function validarSenhaInterna(senha: string): string | null {
  if (senha.length < 6) return 'A senha deve ter pelo menos 6 caracteres.'
  return null
}
