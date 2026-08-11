/**
 * F6B — Sanitização de payload Focus para prévia (sem segredos).
 */

const CHAVES_SENSIVEIS = [
  'token',
  'api_key',
  'apikey',
  'authorization',
  'senha',
  'password',
  'secret',
  'certificado',
  'certificate',
  'pfx',
  'a1',
  'chave_acesso',
  'chave_nfe',
  'protocolo',
  'numero_protocolo',
  'xml',
  'danfe',
]

function chaveSensivel(chave: string): boolean {
  const k = chave.toLowerCase()
  return CHAVES_SENSIVEIS.some((s) => k === s || k.includes(s))
}

function valorPareceSegredo(valor: unknown): boolean {
  if (typeof valor !== 'string') return false
  const v = valor.trim()
  if (!v) return false
  // Bloqueia strings que parecem XML autorizado / DANFE / chave 44 dígitos
  if (v.includes('<?xml') || v.includes('<nfeProc') || v.includes('<NFe')) return true
  if (/^\d{44}$/.test(v.replace(/\D/g, '')) && v.replace(/\D/g, '').length === 44) return true
  return false
}

/**
 * Remove campos sensíveis e valores que parecem XML/chave/protocolo.
 * Não altera o payload original (retorna cópia).
 */
export function sanitizeFocusPayloadForPreview(payload: unknown): unknown {
  return sanitizarValor(payload)
}

function sanitizarValor(valor: unknown): unknown {
  if (valor == null) return valor
  if (Array.isArray(valor)) return valor.map(sanitizarValor)
  if (typeof valor !== 'object') {
    if (valorPareceSegredo(valor)) return '[removido]'
    return valor
  }
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
    if (chaveSensivel(k)) {
      out[k] = '[omitido]'
      continue
    }
    out[k] = sanitizarValor(v)
  }
  return out
}

/** Log interno seguro — sem token/certificado/payload completo sensível. */
export function logFocusInterno(
  evento: string,
  meta?: Record<string, string | number | boolean | null | undefined>
): void {
  const seguro: Record<string, unknown> = { evento, fase: 'F6B' }
  if (meta) {
    for (const [k, v] of Object.entries(meta)) {
      if (chaveSensivel(k)) continue
      seguro[k] = v
    }
  }
  console.info('[BoxGestor Fiscal Focus]', seguro)
}
