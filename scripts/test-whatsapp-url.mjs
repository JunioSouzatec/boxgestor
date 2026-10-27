/**
 * Testes direcionados do helper de WhatsApp (sem vitest).
 * Replica a lógica pura de whatsapp.service.ts (normalização + URL por plataforma)
 * para validar desktop/mobile, encode e o edge case do DDD 55.
 *
 * Além disso faz uma verificação ESTÁTICA do arquivo real para garantir que a
 * abertura usa nova aba com noopener,noreferrer e NÃO navega a aba atual.
 *
 * Rodar: node scripts/test-whatsapp-url.mjs
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

function normalizarTelefoneWhatsApp(telefone) {
  const digits = telefone.replace(/\D/g, '')
  if (digits.length === 0) return ''
  if (digits.length === 10 || digits.length === 11) return `55${digits}`
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    return digits
  }
  return digits
}

function resolverNumero(telefone) {
  const raw = telefone?.trim()
  if (!raw) return ''
  const numero = normalizarTelefoneWhatsApp(raw)
  return /^55\d{10,11}$/.test(numero) ? numero : ''
}

function buildWhatsAppUrl(telefone, mensagem, opts) {
  const text = encodeURIComponent(mensagem)
  const isMobile = opts?.isMobile ?? false
  const numero = resolverNumero(telefone)
  if (isMobile) {
    return numero ? `https://wa.me/${numero}?text=${text}` : `https://wa.me/?text=${text}`
  }
  return numero
    ? `https://web.whatsapp.com/send?phone=${numero}&text=${text}`
    : `https://web.whatsapp.com/send?text=${text}`
}

let passados = 0
function assert(cond, msg) {
  if (!cond) throw new Error(`FALHOU: ${msg}`)
  passados++
}
function eq(a, b, msg) {
  assert(a === b, `${msg}\n  esperado: ${b}\n  obtido:   ${a}`)
}

// A. desktop + telefone → web.whatsapp.com/send?phone=
eq(
  buildWhatsAppUrl('38999990000', 'oi', { isMobile: false }),
  'https://web.whatsapp.com/send?phone=5538999990000&text=oi',
  'A: desktop + telefone usa web.whatsapp.com/send?phone='
)

// B. mobile + telefone → wa.me/<numero>
eq(
  buildWhatsAppUrl('38999990000', 'oi', { isMobile: true }),
  'https://wa.me/5538999990000?text=oi',
  'B: mobile + telefone usa wa.me/<numero>'
)

// C. desktop sem telefone → web.whatsapp.com/send?text=
eq(
  buildWhatsAppUrl(null, 'oi', { isMobile: false }),
  'https://web.whatsapp.com/send?text=oi',
  'C: desktop sem telefone usa web.whatsapp.com/send?text='
)

// D. mobile sem telefone → wa.me/?text=
eq(
  buildWhatsAppUrl('', 'oi', { isMobile: true }),
  'https://wa.me/?text=oi',
  'D: mobile sem telefone usa wa.me/?text='
)

// E. acentos/emoji/quebra de linha corretamente encoded
{
  const msg = 'Olá 👋\nServiço pronto!'
  const esperadoText = encodeURIComponent(msg)
  eq(
    buildWhatsAppUrl('38999990000', msg, { isMobile: false }),
    `https://web.whatsapp.com/send?phone=5538999990000&text=${esperadoText}`,
    'E: encode de acentos/emoji/quebra de linha'
  )
  assert(esperadoText.includes('%0A'), 'E: quebra de linha vira %0A')
  assert(esperadoText.includes('%F0%9F%91%8B'), 'E: emoji encodado')
}

// F. +55 (38) 99999-0000 → 5538999990000
eq(resolverNumero('+55 (38) 99999-0000'), '5538999990000', 'F: +55 (38) 99999-0000')

// G. 38999990000 → 5538999990000
eq(resolverNumero('38999990000'), '5538999990000', 'G: 38999990000')

// H. (38) 99999-0000 → 5538999990000
eq(resolverNumero('(38) 99999-0000'), '5538999990000', 'H: (38) 99999-0000')

// I. (55) 99999-0000 → 5555999990000
eq(resolverNumero('(55) 99999-0000'), '5555999990000', 'I: (55) 99999-0000 (DDD 55)')

// J. +55 (55) 99999-0000 → 5555999990000 (sem duplicar DDI)
eq(resolverNumero('+55 (55) 99999-0000'), '5555999990000', 'J: +55 (55) 99999-0000')

// K/L são comportamentais (window.open _blank + noopener,noreferrer e fallback),
// garantidos por inspeção do helper abrirWhatsApp; aqui validamos só a URL de destino.
assert(
  buildWhatsAppUrl('38999990000', 'x', { isMobile: false }).startsWith('https://web.whatsapp.com/send'),
  'K: desktop aponta para web.whatsapp.com/send (nunca wa.me/api.whatsapp.com)'
)
assert(
  !buildWhatsAppUrl('38999990000', 'x', { isMobile: false }).includes('api.whatsapp.com'),
  'K: desktop não usa api.whatsapp.com'
)

// ==================================================
// Verificação ESTÁTICA do arquivo real de produção.
// Garante que abrirWhatsApp usa nova aba segura e NÃO navega a aba atual.
// ==================================================
{
  const __dirname = dirname(fileURLToPath(import.meta.url))
  const servicePath = join(
    __dirname,
    '..',
    'src',
    'services',
    'comunicacao',
    'whatsapp.service.ts'
  )
  const src = readFileSync(servicePath, 'utf8')

  // Remove comentários de bloco e de linha para checar apenas CÓDIGO real.
  const codigo = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')

  assert(/window\.open\(/.test(codigo), 'ESTÁTICO: existe window.open no código')
  assert(/'_blank'/.test(codigo), "ESTÁTICO: existe '_blank' no código")
  assert(
    /'noopener,noreferrer'/.test(codigo),
    "ESTÁTICO: existe 'noopener,noreferrer' no código"
  )
  assert(
    !/window\.location\.href/.test(codigo),
    'ESTÁTICO: NÃO existe window.location.href (sem fallback que navega a aba do WhatsApp)'
  )
  assert(
    !/location\.href\s*=/.test(codigo),
    'ESTÁTICO: NÃO existe atribuição a location.href'
  )
  assert(
    !/location\.(assign|replace)\s*\(/.test(codigo),
    'ESTÁTICO: NÃO existe location.assign/replace para WhatsApp'
  )
}

console.log(`OK — ${passados} asserções passaram.`)
