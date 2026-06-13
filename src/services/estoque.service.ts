import { gerarId } from '@/lib/utils'
import { stampCreate } from '@/services/migration.service'
import type { CraftDatabase } from '@/types/database'
import type {
  AjusteEstoqueInput,
  EntradaEstoqueInput,
  MovimentacaoEstoque,
  UsuarioMovimentacao,
} from '@/types/movimentacao-estoque'
import type { OrdemServico } from '@/types/ordem-servico'
import type { Peca } from '@/types/peca'
import {
  inferirUnidadePorCategoria,
  normalizarUnidadePeca,
} from '@/types/unidade-peca'
import type { StatusOS } from '@/types/enums'

export interface ResumoEstoque {
  pecasBaixo: Peca[]
  pecasZeradas: Peca[]
  valorTotalEstoque: number
  lucroEstimadoEstoque: number
  pecasMaisUsadas: { peca_id: string; nome: string; quantidade: number }[]
}

export interface PecaComLucro {
  pecaId: string
  nome: string
  lucroUnitario: number
  lucroTotal: number
}

function criarMovimentacao(
  officeId: string,
  dados: Omit<MovimentacaoEstoque, 'id' | 'oficina_id' | 'office_id' | 'created_at' | 'valor_total'> & {
    valor_unitario: number
    quantidade: number
  }
): MovimentacaoEstoque {
  return stampCreate(
    {
      ...dados,
      id: gerarId(),
      oficina_id: officeId,
      office_id: officeId,
      valor_total: dados.quantidade * dados.valor_unitario,
    },
    officeId
  )
}

export function normalizarPeca(p: Peca): Peca {
  const categoria = p.categoria ?? 'outros'
  return {
    ...p,
    ativo: p.ativo ?? true,
    categoria,
    unidade: normalizarUnidadePeca(p.unidade ?? inferirUnidadePorCategoria(categoria)),
  }
}

export function calcularResumoEstoque(
  pecas: Peca[],
  movimentacoes: MovimentacaoEstoque[],
  ordens: OrdemServico[]
): ResumoEstoque {
  const ativas = pecas.filter((p) => p.ativo !== false)
  const pecasBaixo = ativas.filter((p) => p.quantidade > 0 && p.quantidade <= p.estoque_minimo)
  const pecasZeradas = ativas.filter((p) => p.quantidade <= 0)

  const valorTotalEstoque = ativas.reduce((acc, p) => acc + p.custo * p.quantidade, 0)
  const lucroEstimadoEstoque = ativas.reduce(
    (acc, p) => acc + (p.preco_venda - p.custo) * p.quantidade,
    0
  )

  const usoMap = new Map<string, { nome: string; qtd: number }>()
  for (const m of movimentacoes.filter((mv) => mv.tipo === 'saida')) {
    const atual = usoMap.get(m.peca_id) ?? { nome: m.peca_nome, qtd: 0 }
    usoMap.set(m.peca_id, { nome: m.peca_nome, qtd: atual.qtd + m.quantidade })
  }
  if (usoMap.size === 0) {
    for (const os of ordens.filter((o) => ['finalizada', 'entregue'].includes(o.status))) {
      for (const pu of os.pecas_utilizadas ?? []) {
        if (!pu.peca_id) continue
        const atual = usoMap.get(pu.peca_id) ?? { nome: pu.nome, qtd: 0 }
        usoMap.set(pu.peca_id, { nome: pu.nome, qtd: atual.qtd + pu.quantidade })
      }
    }
  }

  const pecasMaisUsadas = [...usoMap.entries()]
    .map(([peca_id, v]) => ({ peca_id, nome: v.nome, quantidade: v.qtd }))
    .sort((a, b) => b.quantidade - a.quantidade)
    .slice(0, 5)

  return {
    pecasBaixo,
    pecasZeradas,
    valorTotalEstoque,
    lucroEstimadoEstoque,
    pecasMaisUsadas,
  }
}

export function registrarEntradaEstoque(
  db: CraftDatabase,
  input: EntradaEstoqueInput,
  usuario: UsuarioMovimentacao,
  officeId: string
): CraftDatabase {
  const peca = db.pecas.find((p) => p.id === input.peca_id)
  if (!peca) return db

  const fornecedor = input.fornecedor_id
    ? db.fornecedores.find((f) => f.id === input.fornecedor_id)
    : undefined

  const mov = criarMovimentacao(officeId, {
    peca_id: peca.id,
    peca_nome: peca.nome,
    tipo: 'entrada',
    quantidade: input.quantidade,
    valor_unitario: input.custo_unitario,
    data: input.data_compra,
    fornecedor_id: fornecedor?.id,
    fornecedor_nome: fornecedor?.nome,
    numero_nota: input.numero_nota,
    observacao: input.observacao,
    usuario_id: usuario.id,
    usuario_nome: usuario.nome,
  })

  const pecas = db.pecas.map((p) =>
    p.id === peca.id
      ? { ...p, quantidade: p.quantidade + input.quantidade, custo: input.custo_unitario }
      : p
  )

  return {
    ...db,
    pecas,
    movimentacoes_estoque: [...(db.movimentacoes_estoque ?? []), mov],
  }
}

export function registrarAjusteEstoque(
  db: CraftDatabase,
  input: AjusteEstoqueInput,
  usuario: UsuarioMovimentacao,
  officeId: string
): CraftDatabase {
  const peca = db.pecas.find((p) => p.id === input.peca_id)
  if (!peca || !input.motivo.trim()) return db

  const diff = input.quantidade_nova - peca.quantidade
  if (diff === 0) return db

  const mov = criarMovimentacao(officeId, {
    peca_id: peca.id,
    peca_nome: peca.nome,
    tipo: 'ajuste',
    quantidade: Math.abs(diff),
    valor_unitario: peca.custo,
    data: new Date().toISOString().slice(0, 10),
    motivo: input.motivo,
    observacao: input.observacao,
    usuario_id: usuario.id,
    usuario_nome: usuario.nome,
  })

  const pecas = db.pecas.map((p) =>
    p.id === peca.id ? { ...p, quantidade: Math.max(0, input.quantidade_nova) } : p
  )

  return {
    ...db,
    pecas,
    movimentacoes_estoque: [...(db.movimentacoes_estoque ?? []), mov],
  }
}

export function registrarSaidaOS(
  db: CraftDatabase,
  os: OrdemServico,
  usuario: UsuarioMovimentacao,
  officeId: string
): CraftDatabase {
  let pecas = db.pecas
  const movimentacoes = [...(db.movimentacoes_estoque ?? [])]

  for (const pu of os.pecas_utilizadas ?? []) {
    if (!pu.peca_id || pu.manual) continue
    const peca = pecas.find((p) => p.id === pu.peca_id)
    if (!peca) continue

    movimentacoes.push(
      criarMovimentacao(officeId, {
        peca_id: peca.id,
        peca_nome: peca.nome,
        tipo: 'saida',
        quantidade: pu.quantidade,
        valor_unitario: pu.valor_unitario,
        data: new Date().toISOString().slice(0, 10),
        ordem_servico_id: os.id,
        ordem_servico_numero: os.numero,
        observacao: pu.pendencia_compra ? 'Saída com pendência de compra' : undefined,
        usuario_id: usuario.id,
        usuario_nome: usuario.nome,
      })
    )

    pecas = pecas.map((p) =>
      p.id === pu.peca_id
        ? { ...p, quantidade: Math.max(0, p.quantidade - pu.quantidade) }
        : p
    )
  }

  const ordens_servico = db.ordens_servico.map((o) =>
    o.id === os.id ? { ...o, estoque_baixado: true } : o
  )

  return { ...db, pecas, movimentacoes_estoque: movimentacoes, ordens_servico }
}

export function registrarDevolucaoOS(
  db: CraftDatabase,
  os: OrdemServico,
  usuario: UsuarioMovimentacao,
  officeId: string
): CraftDatabase {
  let pecas = db.pecas
  const movimentacoes = [...(db.movimentacoes_estoque ?? [])]

  for (const pu of os.pecas_utilizadas ?? []) {
    if (!pu.peca_id || pu.manual) continue
    const peca = pecas.find((p) => p.id === pu.peca_id)
    if (!peca) continue

    movimentacoes.push(
      criarMovimentacao(officeId, {
        peca_id: peca.id,
        peca_nome: peca.nome,
        tipo: 'devolucao',
        quantidade: pu.quantidade,
        valor_unitario: pu.valor_unitario,
        data: new Date().toISOString().slice(0, 10),
        ordem_servico_id: os.id,
        ordem_servico_numero: os.numero,
        motivo: 'Devolução',
        observacao: `OS #${os.numero} cancelada`,
        usuario_id: usuario.id,
        usuario_nome: usuario.nome,
      })
    )

    pecas = pecas.map((p) =>
      p.id === pu.peca_id ? { ...p, quantidade: p.quantidade + pu.quantidade } : p
    )
  }

  const ordens_servico = db.ordens_servico.map((o) =>
    o.id === os.id ? { ...o, estoque_baixado: false } : o
  )

  return { ...db, pecas, movimentacoes_estoque: movimentacoes, ordens_servico }
}

const STATUS_BAIXA: StatusOS[] = ['finalizada', 'entregue']

export function statusExigeBaixaEstoque(status: StatusOS): boolean {
  return STATUS_BAIXA.includes(status)
}

export function deveBaixarEstoqueOS(os: OrdemServico, osAnterior?: OrdemServico): boolean {
  if (os.estoque_baixado) return false
  if (!statusExigeBaixaEstoque(os.status)) return false
  if (osAnterior?.estoque_baixado) return false
  return true
}

export function deveDevolverEstoqueOS(os: OrdemServico, osAnterior?: OrdemServico): boolean {
  if (!osAnterior?.estoque_baixado) return false
  if (os.status !== 'cancelada') return false
  return true
}

export function processarEstoqueAoSalvarOS(
  db: CraftDatabase,
  os: OrdemServico,
  osAnterior: OrdemServico | undefined,
  usuario: UsuarioMovimentacao,
  officeId: string
): CraftDatabase {
  if (deveDevolverEstoqueOS(os, osAnterior)) {
    return registrarDevolucaoOS(db, osAnterior!, usuario, officeId)
  }
  if (deveBaixarEstoqueOS(os, osAnterior)) {
    return registrarSaidaOS(db, os, usuario, officeId)
  }
  return db
}

export function calcularFornecedoresMaisUtilizados(
  movimentacoes: MovimentacaoEstoque[]
): { fornecedor_id: string; nome: string; entradas: number; valor: number }[] {
  const mapa = new Map<string, { nome: string; entradas: number; valor: number }>()
  for (const m of movimentacoes.filter((mv) => mv.tipo === 'entrada' && mv.fornecedor_id)) {
    const id = m.fornecedor_id!
    const atual = mapa.get(id) ?? { nome: m.fornecedor_nome ?? id, entradas: 0, valor: 0 }
    mapa.set(id, {
      nome: atual.nome,
      entradas: atual.entradas + 1,
      valor: atual.valor + m.valor_total,
    })
  }
  return [...mapa.entries()]
    .map(([fornecedor_id, stats]) => ({ fornecedor_id, ...stats }))
    .sort((a, b) => b.valor - a.valor || b.entradas - a.entradas)
}

export function filtrarMovimentacoesPeriodo(
  movimentacoes: MovimentacaoEstoque[],
  inicio: string,
  fim: string
): MovimentacaoEstoque[] {
  return movimentacoes.filter((m) => m.data >= inicio && m.data <= fim)
}

export function calcularPecasComMaiorLucro(pecas: Peca[]): PecaComLucro[] {
  return pecas
    .map((p) => ({
      pecaId: p.id,
      nome: p.nome,
      lucroUnitario: p.preco_venda - p.custo,
      lucroTotal: (p.preco_venda - p.custo) * p.quantidade,
    }))
    .filter((p) => p.lucroUnitario > 0)
    .sort((a, b) => b.lucroTotal - a.lucroTotal)
}
