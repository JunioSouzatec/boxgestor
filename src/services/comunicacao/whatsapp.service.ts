import { isMobileDevice } from '@/lib/plataforma'

/**
 * Normaliza telefone brasileiro para o formato DDI+DDD+número (ex.: 5538999990000).
 *
 * Regra não ambígua por comprimento:
 * - 10 ou 11 dígitos (nacional: DDD + número) → sempre prefixa DDI 55.
 * - 12 ou 13 dígitos começando com 55 → já tem DDI, mantém.
 * - Caso contrário, devolve os dígitos como estão (não adivinha internacional).
 *
 * Corrige o caso do DDD 55: `(55) 99999-0000` → `5555999990000` (sem duplicar DDI).
 */
export function normalizarTelefoneWhatsApp(telefone: string): string {
  const digits = telefone.replace(/\D/g, '')
  if (digits.length === 0) return ''
  if (digits.length === 10 || digits.length === 11) return `55${digits}`
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    return digits
  }
  return digits
}

/** Valida telefone brasileiro para WhatsApp (55 + DDD + número). */
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
 * URL do WhatsApp com texto preenchido, por plataforma.
 *
 * Desktop: `https://web.whatsapp.com/send?phone=<numero>&text=<texto>`
 *   (abre direto no WhatsApp Web, sem o redirect intermediário de api.whatsapp.com).
 * Mobile: `https://wa.me/<numero>?text=<texto>` (abre o app — comportamento preservado).
 *
 * Sem telefone válido → monta só com a mensagem (usuário escolhe o contato).
 *
 * `opts.isMobile` permite forçar a plataforma (testes); por padrão detecta o dispositivo.
 */
export function buildWhatsAppUrl(
  telefone: string | null | undefined,
  mensagem: string,
  opts?: { isMobile?: boolean }
): string {
  const text = encodeURIComponent(mensagem)
  const isMobile = opts?.isMobile ?? isMobileDevice()

  let numero = ''
  const raw = telefone?.trim()
  if (raw) {
    try {
      numero = resolverTelefoneWhatsAppCliente(raw).numero
    } catch {
      numero = ''
    }
  }

  if (isMobile) {
    return numero ? `https://wa.me/${numero}?text=${text}` : `https://wa.me/?text=${text}`
  }

  return numero
    ? `https://web.whatsapp.com/send?phone=${numero}&text=${text}`
    : `https://web.whatsapp.com/send?text=${text}`
}

/**
 * Abre o WhatsApp com a mensagem pronta, sempre em nova aba.
 * Deve ser chamado de forma síncrona no clique (sem await antes),
 * senão o navegador bloqueia a nova aba.
 *
 * Desktop → WhatsApp Web direto; Mobile → app via wa.me.
 *
 * IMPORTANTE: NÃO usa o retorno de `window.open` como indicador de popup
 * bloqueado. Com `noopener,noreferrer` esse retorno é `null` mesmo quando a
 * aba abre com sucesso. Por isso NÃO há fallback para `window.location.href`:
 * a aba atual do BoxGestor deve permanecer intacta em qualquer cenário.
 */
export function abrirWhatsApp(params: {
  telefone: string | null | undefined
  mensagem: string
}): void {
  const url = buildWhatsAppUrl(params.telefone, params.mensagem)
  window.open(url, '_blank', 'noopener,noreferrer')
}

/**
 * @deprecated Use `abrirWhatsApp({ telefone, mensagem })`.
 * Mantido como wrapper compatível com os consumidores existentes.
 */
export function abrirWhatsAppWeb(
  telefone: string | null | undefined,
  mensagem: string
): void {
  abrirWhatsApp({ telefone, mensagem })
}
