import type { Cliente } from '@/types/cliente'
import type { CraftDatabase } from '@/types/database'
import type { Moto } from '@/types/moto'
import type { OrdemServico } from '@/types/ordem-servico'

export function normalizarTelefoneCliente(valor: string): string {
  return valor.replace(/\D/g, '')
}

export function normalizarCpfCliente(valor?: string | null): string {
  return (valor ?? '').replace(/\D/g, '')
}

export function normalizarNomeCliente(valor: string): string {
  return valor.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Chave estável para detectar duplicados na mesma oficina */
export function chaveUnicidadeCliente(cliente: Cliente): string {
  const cpf = normalizarCpfCliente(cliente.cpf)
  if (cpf.length >= 11) return `cpf:${cpf}`

  const tel = normalizarTelefoneCliente(cliente.telefone)
  const nome = normalizarNomeCliente(cliente.nome)
  if (tel.length >= 8) return `tel:${tel}|nome:${nome}`

  return `id:${cliente.id}`
}

function pontuacaoCliente(
  cliente: Cliente,
  motos: Moto[],
  ordens: OrdemServico[]
): number {
  const qtdMotos = motos.filter((m) => m.cliente_id === cliente.id).length
  const qtdOs = ordens.filter((o) => o.cliente_id === cliente.id).length
  let score = qtdMotos * 10 + qtdOs * 5
  if (cliente.cpf?.trim()) score += 2
  if (cliente.endereco?.trim()) score += 1
  if (cliente.observacoes?.trim()) score += 1
  return score
}

function mesclarCamposCliente(principal: Cliente, outro: Cliente): Cliente {
  return {
    ...principal,
    nome: principal.nome?.trim() ? principal.nome : outro.nome,
    telefone: principal.telefone?.trim() ? principal.telefone : outro.telefone,
    cpf: principal.cpf?.trim() ? principal.cpf : outro.cpf,
    endereco: principal.endereco?.trim() ? principal.endereco : outro.endereco,
    observacoes: principal.observacoes?.trim() ? principal.observacoes : outro.observacoes,
    criado_em: principal.criado_em <= outro.criado_em ? principal.criado_em : outro.criado_em,
  }
}

export interface ResultadoDedupClientes {
  clientes: Cliente[]
  mapaIdAntigoParaCanonico: Map<string, string>
  removidos: number
}

export function deduplicarClientes(
  clientes: Cliente[],
  motos: Moto[] = [],
  ordens: OrdemServico[] = []
): ResultadoDedupClientes {
  const mapaIdAntigoParaCanonico = new Map<string, string>()
  const grupos = new Map<string, Cliente[]>()

  for (const c of clientes) {
    const chave = chaveUnicidadeCliente(c)
    const lista = grupos.get(chave) ?? []
    lista.push(c)
    grupos.set(chave, lista)
  }

  const clientesUnicos: Cliente[] = []
  let removidos = 0

  for (const lista of grupos.values()) {
    if (lista.length === 1) {
      clientesUnicos.push(lista[0]!)
      mapaIdAntigoParaCanonico.set(lista[0]!.id, lista[0]!.id)
      continue
    }

    const ordenados = [...lista].sort(
      (a, b) => pontuacaoCliente(b, motos, ordens) - pontuacaoCliente(a, motos, ordens)
    )
    let principal = ordenados[0]!
    for (const dup of ordenados.slice(1)) {
      principal = mesclarCamposCliente(principal, dup)
      mapaIdAntigoParaCanonico.set(dup.id, principal.id)
      removidos++
    }
    mapaIdAntigoParaCanonico.set(principal.id, principal.id)
    clientesUnicos.push(principal)
  }

  return { clientes: clientesUnicos, mapaIdAntigoParaCanonico, removidos }
}

export function remapearVinculosAposDedup(
  db: CraftDatabase,
  mapaIdAntigoParaCanonico: Map<string, string>
): CraftDatabase {
  if (mapaIdAntigoParaCanonico.size === 0) return db

  const resolver = (id: string) => mapaIdAntigoParaCanonico.get(id) ?? id

  return {
    ...db,
    motos: db.motos.map((m) => ({
      ...m,
      cliente_id: resolver(m.cliente_id),
    })),
    ordens_servico: db.ordens_servico.map((os) => ({
      ...os,
      cliente_id: resolver(os.cliente_id),
    })),
    agendamentos: db.agendamentos.map((a) =>
      a.cliente_id ? { ...a, cliente_id: resolver(a.cliente_id) } : a
    ),
  }
}

export function aplicarDedupClientesNoDatabase(db: CraftDatabase): {
  db: CraftDatabase
  removidos: number
} {
  const { clientes, mapaIdAntigoParaCanonico, removidos } = deduplicarClientes(
    db.clientes,
    db.motos,
    db.ordens_servico
  )
  const parcial: CraftDatabase = { ...db, clientes }
  const dbFinal = remapearVinculosAposDedup(parcial, mapaIdAntigoParaCanonico)
  return { db: dbFinal, removidos }
}

export interface GrupoDuplicadosClientes {
  chave: string
  principal: Cliente
  duplicados: Cliente[]
  motosPorCliente: Record<string, number>
  osPorCliente: Record<string, number>
}

export function detectarGruposDuplicadosClientes(
  clientes: Cliente[],
  motos: Moto[],
  ordens: OrdemServico[]
): GrupoDuplicadosClientes[] {
  const grupos = new Map<string, Cliente[]>()
  for (const c of clientes) {
    const chave = chaveUnicidadeCliente(c)
    grupos.set(chave, [...(grupos.get(chave) ?? []), c])
  }

  const resultado: GrupoDuplicadosClientes[] = []

  for (const [chave, lista] of grupos) {
    if (lista.length < 2) continue

    const ordenados = [...lista].sort(
      (a, b) => pontuacaoCliente(b, motos, ordens) - pontuacaoCliente(a, motos, ordens)
    )
    const principal = ordenados[0]!
    const duplicados = ordenados.slice(1)

    const motosPorCliente: Record<string, number> = {}
    const osPorCliente: Record<string, number> = {}
    for (const c of lista) {
      motosPorCliente[c.id] = motos.filter((m) => m.cliente_id === c.id).length
      osPorCliente[c.id] = ordens.filter((o) => o.cliente_id === c.id).length
    }

    resultado.push({ chave, principal, duplicados, motosPorCliente, osPorCliente })
  }

  return resultado
}

export function mesclarClientesDuplicadosNoDatabase(
  db: CraftDatabase,
  principalId: string,
  duplicadoIds: string[]
): CraftDatabase {
  const idsRemover = new Set(duplicadoIds.filter((id) => id !== principalId))
  if (idsRemover.size === 0) return db

  const mapa = new Map<string, string>()
  for (const id of idsRemover) mapa.set(id, principalId)

  const clientes = db.clientes
    .filter((c) => !idsRemover.has(c.id))
    .map((c) => (c.id === principalId ? c : c))

  const parcial: CraftDatabase = { ...db, clientes }
  return remapearVinculosAposDedup(parcial, mapa)
}
