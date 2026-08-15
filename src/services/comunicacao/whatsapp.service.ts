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

/**
 * URL wa.me com texto preenchido.
 * Sem telefone válido → abre WhatsApp só com a mensagem (usuário escolhe o contato).
 */
export function buildWhatsAppUrl(telefone: string | null | undefined, mensagem: string): string {
  const text = encodeURIComponent(mensagem)
  const raw = telefone?.trim()
  if (!raw) {
    return `https://wa.me/?text=${text}`
  }
  try {
    const { numero } = resolverTelefoneWhatsAppCliente(raw)
    return `https://wa.me/${numero}?text=${text}`
  } catch {
    return `https://wa.me/?text=${text}`
  }
}

/**
 * Abre WhatsApp Web/app com mensagem pronta.
 * Deve ser chamado de forma síncrona no clique (sem await antes),
 * senão o navegador bloqueia a nova aba.
 */
export function abrirWhatsAppWeb(telefone: string | null | undefined, mensagem: string): void {
  const url = buildWhatsAppUrl(telefone, mensagem)
  const win = window.open(url, '_blank', 'noopener,noreferrer')
  if (!win) {
    // Fallback se popup bloqueado: navega na mesma aba
    window.location.href = url
  }
}
