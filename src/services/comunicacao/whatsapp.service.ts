/** Monta link wa.me — sem API paga */
export function normalizarTelefoneWhatsApp(telefone: string): string {
  const digits = telefone.replace(/\D/g, '')
  if (digits.length === 0) return ''
  if (digits.startsWith('55') && digits.length >= 12) return digits
  if (digits.length >= 10 && digits.length <= 11) return `55${digits}`
  return digits
}

export function buildWhatsAppUrl(telefone: string, mensagem: string): string {
  const numero = normalizarTelefoneWhatsApp(telefone)
  if (!numero) throw new Error('Telefone inválido para WhatsApp.')
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`
}

export function abrirWhatsAppWeb(telefone: string, mensagem: string): void {
  const url = buildWhatsAppUrl(telefone, mensagem)
  window.open(url, '_blank', 'noopener,noreferrer')
}
