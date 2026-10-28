import type { Cliente } from '@/types/cliente'
import type { Moto } from '@/types/moto'

export const LIMITE_RESULTADOS_BUSCA_CLIENTE = 25

export function normalizarTextoBusca(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .trim()
}

function somenteDigitos(valor: string): string {
  return valor.replace(/\D/g, '')
}

export interface ClienteBuscaItem {
  id: string
  nome: string
  telefone: string
  placa?: string
}

/**
 * Filtra clientes já carregados (sem chamada de rede).
 * Casa nome (acentos ignorados), telefone (dígitos) e placa do veículo.
 */
export function filtrarClientesAgenda(
  clientes: Cliente[],
  motos: Moto[],
  query: string,
  limite = LIMITE_RESULTADOS_BUSCA_CLIENTE
): ClienteBuscaItem[] {
  const q = normalizarTextoBusca(query)
  const qDigitos = somenteDigitos(query)

  const placasPorCliente = new Map<string, string[]>()
  for (const m of motos) {
    const lista = placasPorCliente.get(m.cliente_id) ?? []
    if (m.placa) lista.push(m.placa)
    placasPorCliente.set(m.cliente_id, lista)
  }

  if (!q && !qDigitos) {
    return clientes.slice(0, limite).map((c) => ({
      id: c.id,
      nome: c.nome,
      telefone: c.telefone,
      placa: placasPorCliente.get(c.id)?.[0],
    }))
  }

  const achados: ClienteBuscaItem[] = []
  for (const c of clientes) {
    const nome = normalizarTextoBusca(c.nome)
    const tel = somenteDigitos(c.telefone)
    const placas = placasPorCliente.get(c.id) ?? []
    const placaOk = placas.some((p) => normalizarTextoBusca(p).includes(q))
    const nomeOk = q ? nome.includes(q) : false
    const telOk = qDigitos.length >= 2 && tel.includes(qDigitos)
    if (!nomeOk && !telOk && !placaOk) continue
    achados.push({
      id: c.id,
      nome: c.nome,
      telefone: c.telefone,
      placa: placas.find((p) => normalizarTextoBusca(p).includes(q)) ?? placas[0],
    })
    if (achados.length >= limite) break
  }
  return achados
}
