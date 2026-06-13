import { formatarTelefone } from '@/lib/utils'
import type { Oficina } from '@/types'

export function formatarTelefoneOficina(telefone?: string): string | null {
  if (!telefone?.trim()) return null
  const numeros = telefone.replace(/\D/g, '')
  return numeros ? formatarTelefone(numeros) : telefone.trim()
}

export function formatarCidadeEstado(oficina: Pick<Oficina, 'cidade' | 'estado'>): string | null {
  const partes = [oficina.cidade?.trim(), oficina.estado?.trim()].filter(Boolean)
  return partes.length ? partes.join('/') : null
}

export function formatarCep(cep?: string): string | null {
  if (!cep?.trim()) return null
  const numeros = cep.replace(/\D/g, '')
  if (numeros.length === 8) return `${numeros.slice(0, 5)}-${numeros.slice(5)}`
  return cep.trim()
}

export function montarLinhasContatoOficina(oficina: Oficina): string[] {
  const linhas: string[] = []
  const tel = formatarTelefoneOficina(oficina.telefone)
  const zap = formatarTelefoneOficina(oficina.whatsapp ?? oficina.telefone)
  if (tel) linhas.push(`Tel: ${tel}`)
  if (zap) linhas.push(`WhatsApp: ${zap}`)
  if (oficina.email?.trim()) linhas.push(`E-mail: ${oficina.email.trim()}`)
  return linhas
}

export function montarLinhasEnderecoOficina(oficina: Oficina): string[] {
  const linhas: string[] = []
  if (oficina.endereco?.trim()) linhas.push(oficina.endereco.trim())
  if (oficina.bairro?.trim()) linhas.push(oficina.bairro.trim())
  const cidadeEstado = formatarCidadeEstado(oficina)
  if (cidadeEstado) linhas.push(cidadeEstado)
  const cep = formatarCep(oficina.cep)
  if (cep) linhas.push(`CEP: ${cep}`)
  return linhas
}
