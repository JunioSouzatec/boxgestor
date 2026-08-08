/**
 * RC2 Venda Balcão A2 — baixa de estoque (separada da OS).
 * Idempotente via chave_idempotencia `counter-sale:{saleId}:{pecaId}`.
 * Não altera ajustarEstoqueOsParaDemanda nem importação XML.
 */
import { getDataLocalHoje } from '@/lib/data-local'
import { uuidFromSeed } from '@/lib/id-deterministico'
import { stampCreate } from '@/services/migration.service'
import type { CraftDatabase } from '@/types/database'
import type { MovimentacaoEstoque, UsuarioMovimentacao } from '@/types/movimentacao-estoque'
import type { Peca } from '@/types/peca'

export interface ItemBaixaVendaBalcao {
  peca_id: string
  peca_nome: string
  quantity: number
  unit_price: number
  sale_item_id?: string
}

export interface ResultadoBaixaItemVendaBalcao {
  peca_id: string
  peca_nome: string
  quantity: number
  stock_before: number
  stock_after: number
  ja_baixado: boolean
  movimento_id: string
}

export interface ResultadoBaixaVendaBalcao {
  db: CraftDatabase
  itens: ResultadoBaixaItemVendaBalcao[]
  jaCompleta: boolean
}

export function chaveIdempotenciaVendaBalcao(saleId: string, pecaId: string): string {
  return `counter-sale:${saleId}:${pecaId}`
}

export function idMovimentoVendaBalcao(saleId: string, pecaId: string): string {
  return uuidFromSeed(chaveIdempotenciaVendaBalcao(saleId, pecaId))
}

function movimentoJaExiste(
  movs: MovimentacaoEstoque[],
  saleId: string,
  pecaId: string
): MovimentacaoEstoque | undefined {
  const chave = chaveIdempotenciaVendaBalcao(saleId, pecaId)
  const idDet = idMovimentoVendaBalcao(saleId, pecaId)
  return movs.find(
    (m) =>
      m.id === idDet ||
      m.chave_idempotencia === chave ||
      (m.tipo === 'saida' &&
        m.peca_id === pecaId &&
        (m.observacao?.includes(`counter-sale:${saleId}`) ||
          m.observacao?.includes(`venda-balcao:${saleId}`)))
  )
}

/**
 * Baixa estoque local para uma venda balcão concluída.
 * Se a chave já existir, não baixa de novo (idempotente).
 */
export function baixarEstoqueVendaBalcao(
  db: CraftDatabase,
  params: {
    saleId: string
    saleNumber?: number
    itens: ItemBaixaVendaBalcao[]
  },
  usuario: UsuarioMovimentacao,
  officeId: string
): ResultadoBaixaVendaBalcao {
  const movs = [...(db.movimentacoes_estoque ?? [])]
  let pecas = [...db.pecas]
  const resultados: ResultadoBaixaItemVendaBalcao[] = []
  let todosJa = true

  // Agrega quantidade por peça (evita duas linhas da mesma peça na mesma venda)
  const agregados = new Map<string, ItemBaixaVendaBalcao>()
  for (const item of params.itens) {
    const q = Math.round(Number(item.quantity) * 1000) / 1000
    if (!(q > 0) || !item.peca_id) continue
    const atual = agregados.get(item.peca_id)
    if (atual) {
      agregados.set(item.peca_id, {
        ...atual,
        quantity: Math.round((atual.quantity + q) * 1000) / 1000,
      })
    } else {
      agregados.set(item.peca_id, { ...item, quantity: q })
    }
  }

  for (const item of agregados.values()) {
    const existente = movimentoJaExiste(movs, params.saleId, item.peca_id)
    const pecaIdx = pecas.findIndex((p) => p.id === item.peca_id)
    const peca = pecaIdx >= 0 ? pecas[pecaIdx] : undefined

    if (existente) {
      const before =
        (peca?.quantidade ?? 0) + (existente.tipo === 'saida' ? existente.quantidade : 0)
      resultados.push({
        peca_id: item.peca_id,
        peca_nome: item.peca_nome || peca?.nome || 'Peça',
        quantity: existente.quantidade,
        stock_before: Math.round(before * 1000) / 1000,
        stock_after: peca?.quantidade ?? 0,
        ja_baixado: true,
        movimento_id: existente.id,
      })
      continue
    }

    if (!peca) {
      throw new Error(`Peça não encontrada no estoque: ${item.peca_nome || item.peca_id}`)
    }

    const stockBefore = Number(peca.quantidade) || 0
    if (item.quantity > stockBefore + 0.0005) {
      throw new Error(
        `Quantidade indisponível em estoque para "${peca.nome}". Disponível: ${stockBefore}.`
      )
    }

    const stockAfter = Math.round((stockBefore - item.quantity) * 1000) / 1000
    const chave = chaveIdempotenciaVendaBalcao(params.saleId, item.peca_id)
    const movId = idMovimentoVendaBalcao(params.saleId, item.peca_id)
    const labelNum =
      params.saleNumber != null ? `#${params.saleNumber}` : params.saleId.slice(0, 8)

    const mov = stampCreate(
      {
        id: movId,
        peca_id: peca.id,
        peca_nome: peca.nome,
        tipo: 'saida' as const,
        quantidade: item.quantity,
        valor_unitario: item.unit_price,
        valor_total: Math.round(item.quantity * item.unit_price * 100) / 100,
        data: getDataLocalHoje(),
        chave_idempotencia: chave,
        motivo: 'Venda balcão',
        observacao: `Venda balcão ${labelNum} · counter-sale:${params.saleId}${
          item.sale_item_id ? ` · item:${item.sale_item_id}` : ''
        }`,
        usuario_id: usuario.id,
        usuario_nome: usuario.nome,
        oficina_id: officeId,
        office_id: officeId,
      } satisfies MovimentacaoEstoque,
      officeId
    )

    movs.push(mov)
    const pecaAtualizada: Peca = { ...peca, quantidade: Math.max(0, stockAfter) }
    pecas = pecas.map((p, i) => (i === pecaIdx ? pecaAtualizada : p))
    todosJa = false

    resultados.push({
      peca_id: peca.id,
      peca_nome: peca.nome,
      quantity: item.quantity,
      stock_before: stockBefore,
      stock_after: Math.max(0, stockAfter),
      ja_baixado: false,
      movimento_id: movId,
    })
  }

  return {
    db: {
      ...db,
      pecas,
      movimentacoes_estoque: movs,
    },
    itens: resultados,
    jaCompleta: todosJa && resultados.length > 0,
  }
}

export function chaveIdempotenciaEstornoVendaBalcao(saleId: string, pecaId: string): string {
  return `counter-sale-cancel:${saleId}:${pecaId}`
}

export function idMovimentoEstornoVendaBalcao(saleId: string, pecaId: string): string {
  return uuidFromSeed(chaveIdempotenciaEstornoVendaBalcao(saleId, pecaId))
}

function movimentoEstornoJaExiste(
  movs: MovimentacaoEstoque[],
  saleId: string,
  pecaId: string
): MovimentacaoEstoque | undefined {
  const chave = chaveIdempotenciaEstornoVendaBalcao(saleId, pecaId)
  const idDet = idMovimentoEstornoVendaBalcao(saleId, pecaId)
  return movs.find(
    (m) =>
      m.id === idDet ||
      m.chave_idempotencia === chave ||
      ((m.tipo === 'entrada' || m.tipo === 'devolucao') &&
        m.peca_id === pecaId &&
        (m.observacao?.includes(`counter-sale-cancel:${saleId}`) ||
          m.observacao?.includes(`venda-balcao-cancel:${saleId}`)))
  )
}

export interface ResultadoEstornoItemVendaBalcao {
  peca_id: string
  peca_nome: string
  quantity: number
  stock_before: number
  stock_after: number
  ja_estornado: boolean
  movimento_id: string
}

export interface ResultadoEstornoVendaBalcao {
  db: CraftDatabase
  itens: ResultadoEstornoItemVendaBalcao[]
  jaCompleta: boolean
}

/**
 * Devolve estoque ao cancelar venda balcão.
 * Idempotente via `counter-sale-cancel:{saleId}:{pecaId}`.
 * Não altera baixa de OS nem XML de compra.
 */
export function estornarEstoqueVendaBalcao(
  db: CraftDatabase,
  params: {
    saleId: string
    saleNumber?: number
    itens: ItemBaixaVendaBalcao[]
  },
  usuario: UsuarioMovimentacao,
  officeId: string
): ResultadoEstornoVendaBalcao {
  const movs = [...(db.movimentacoes_estoque ?? [])]
  let pecas = [...db.pecas]
  const resultados: ResultadoEstornoItemVendaBalcao[] = []
  let todosJa = true

  const agregados = new Map<string, ItemBaixaVendaBalcao>()
  for (const item of params.itens) {
    const q = Math.round(Number(item.quantity) * 1000) / 1000
    if (!(q > 0) || !item.peca_id) continue
    const atual = agregados.get(item.peca_id)
    if (atual) {
      agregados.set(item.peca_id, {
        ...atual,
        quantity: Math.round((atual.quantity + q) * 1000) / 1000,
      })
    } else {
      agregados.set(item.peca_id, { ...item, quantity: q })
    }
  }

  for (const item of agregados.values()) {
    const existente = movimentoEstornoJaExiste(movs, params.saleId, item.peca_id)
    const pecaIdx = pecas.findIndex((p) => p.id === item.peca_id)
    const peca = pecaIdx >= 0 ? pecas[pecaIdx] : undefined

    if (existente) {
      const before =
        (peca?.quantidade ?? 0) -
        (existente.tipo === 'entrada' || existente.tipo === 'devolucao'
          ? existente.quantidade
          : 0)
      resultados.push({
        peca_id: item.peca_id,
        peca_nome: item.peca_nome || peca?.nome || 'Peça',
        quantity: existente.quantidade,
        stock_before: Math.round(Math.max(0, before) * 1000) / 1000,
        stock_after: peca?.quantidade ?? 0,
        ja_estornado: true,
        movimento_id: existente.id,
      })
      continue
    }

    if (!peca) {
      throw new Error(`Peça não encontrada no estoque: ${item.peca_nome || item.peca_id}`)
    }

    // Só estorna se a baixa original existir (evita inventar estoque sem saída).
    const baixaOriginal = movimentoJaExiste(movs, params.saleId, item.peca_id)
    if (!baixaOriginal) {
      resultados.push({
        peca_id: peca.id,
        peca_nome: peca.nome,
        quantity: item.quantity,
        stock_before: Number(peca.quantidade) || 0,
        stock_after: Number(peca.quantidade) || 0,
        ja_estornado: true,
        movimento_id: '',
      })
      continue
    }

    const stockBefore = Number(peca.quantidade) || 0
    const stockAfter = Math.round((stockBefore + item.quantity) * 1000) / 1000
    const chave = chaveIdempotenciaEstornoVendaBalcao(params.saleId, item.peca_id)
    const movId = idMovimentoEstornoVendaBalcao(params.saleId, item.peca_id)
    const labelNum =
      params.saleNumber != null ? `#${params.saleNumber}` : params.saleId.slice(0, 8)

    const mov = stampCreate(
      {
        id: movId,
        peca_id: peca.id,
        peca_nome: peca.nome,
        tipo: 'devolucao' as const,
        quantidade: item.quantity,
        valor_unitario: item.unit_price,
        valor_total: Math.round(item.quantity * item.unit_price * 100) / 100,
        data: getDataLocalHoje(),
        chave_idempotencia: chave,
        motivo: 'Cancelamento venda balcão',
        observacao: `Estorno venda balcão ${labelNum} · counter-sale-cancel:${params.saleId}${
          item.sale_item_id ? ` · item:${item.sale_item_id}` : ''
        }`,
        usuario_id: usuario.id,
        usuario_nome: usuario.nome,
        oficina_id: officeId,
        office_id: officeId,
      } satisfies MovimentacaoEstoque,
      officeId
    )

    movs.push(mov)
    const pecaAtualizada: Peca = { ...peca, quantidade: Math.max(0, stockAfter) }
    pecas = pecas.map((p, i) => (i === pecaIdx ? pecaAtualizada : p))
    todosJa = false

    resultados.push({
      peca_id: peca.id,
      peca_nome: peca.nome,
      quantity: item.quantity,
      stock_before: stockBefore,
      stock_after: Math.max(0, stockAfter),
      ja_estornado: false,
      movimento_id: movId,
    })
  }

  return {
    db: {
      ...db,
      pecas,
      movimentacoes_estoque: movs,
    },
    itens: resultados,
    jaCompleta: todosJa && resultados.length > 0,
  }
}
