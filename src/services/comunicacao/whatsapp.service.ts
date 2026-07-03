/** Monta link wa.me — sem API paga */
export function normalizarTelefoneWhatsApp(telefone: string): string {
  const digits = telefone.replace(/\D/g, '')
  if (digits.length === 0) return ''
  if (digits.startsWith('55') && digits.length >= 12) return digits
  if (digits.length >= 10 && digits.length <= 11) return `55${digits}`
  return digits
}

/** Valida telefone brasileiro para wa.me (55 + DDD + número). */
export function resolverTelefoneWhatsAppCliente(telefone?: string | null): {
  numero: string
  exibicao: string
} {
  const exibicao = telefone?.trim() ?? ''
  if (!exibicao) {
    throw new Error('Cliente sem WhatsApp cadastrado.')
  }
  const numero = normalizarTelefoneWhatsApp(exibicao)
  if (!/^55\d{10,11}$/.test(numero)) {
    throw new Error('WhatsApp do cliente inválido. Verifique o cadastro.')
  }
  return { numero, exibicao }
}

export function buildWhatsAppUrl(telefone: string, mensagem: string): string {
  const { numero } = resolverTelefoneWhatsAppCliente(telefone)
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`
}

export function abrirWhatsAppWeb(telefone: string, mensagem: string): void {
  const url = buildWhatsAppUrl(telefone, mensagem)
  window.open(url, '_blank', 'noopener,noreferrer')
}
