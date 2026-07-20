import { entidadeFoiExcluida } from '@/lib/entidade-ativa'
import { ehDocumentoOrcamento } from '@/lib/os-modo-documento'
import { gerarId, getDataLocalHoje } from '@/lib/utils'
import { stampCreate, stampUpdate } from '@/services/migration.service'
import type { CraftDatabase } from '@/types/database'
import type {
  AjusteEstoqueInput,
  EntradaEstoqueInput,
  MovimentacaoEstoque,
  UsuarioMovimentacao,
} from '@/types/movimentacao-estoque'
import {
  aplicarBaselineBaixadaNasPecas,
  agregarDemandaEstoquePecas,
  agregarQuantidadeJaBaixada,
} from '@/services/os-pecas.service'
import { chaveIdempotenciaDeltaOS, idMovimentoDeltaOS } from '@/lib/id-deterministico'
import { statusExigeBaixaEstoque } from '@/services/os-status.service'
import type { OrdemServico } from '@/types/ordem-servico'
import type { Peca } from '@/types/peca'
import {
  inferirUnidadePorCategoria,
  normalizarUnidadePeca,
} from '@/types/unidade-peca'

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
    id?: string
  }
): MovimentacaoEstoque {
  return stampCreate(
    {
      ...dados,
      id: dados.id ?? gerarId(),
      oficina_id: officeId,
      office_id: officeId,
      valor_total: dados.quantidade * dados.valor_unitario,
    },
    officeId
  )
}

/** Saídas − devoluções já registradas para a OS/peça (fonte de verdade entre dispositivos). */
export function movimentoRelacionadoOS(
  m: MovimentacaoEstoque,
  os: Pick<OrdemServico, 'id' | 'numero'>
): boolean {
  if (m.ordem_servico_id && m.ordem_servico_id === os.id) return true
  if (
    m.ordem_servico_numero != null &&
    os.numero != null &&
    Number(m.ordem_servico_numero) === Number(os.numero)
  ) {
    return true
  }
  return false
}

export function saldoLiquidoBaixaOS(
  movimentacoes: MovimentacaoEstoque[] | undefined,
  os: Pick<OrdemServico, 'id' | 'numero'>,
  pecaId: string
): number {
  let saldo = 0
  for (const m of movimentacoes ?? []) {
    if (!movimentoRelacionadoOS(m, os) || m.peca_id !== pecaId) continue
    if (m.tipo === 'saida') saldo += m.quantidade
    else if (m.tipo === 'devolucao') saldo -= m.quantidade
  }
  return Math.max(0, Math.round(saldo * 1000) / 1000)
}

function movimentoComChaveExiste(
  movimentacoes: MovimentacaoEstoque[],
  chave: string,
  idDeterministico: string
): boolean {
  return movimentacoes.some(
    (m) => m.id === idDeterministico || m.chave_idempotencia === chave
  )
}

/**
 * Baseline já baixado.
 * Se já existem movimentos da OS para a peça → movimentos são a verdade.
 * Senão → quantidade_baixada / migração pela quantidade da OS.
 */
export function obterBaselineJaBaixadaOS(
  db: CraftDatabase,
  osAnterior: OrdemServico | undefined,
  os: Pick<OrdemServico, 'id' | 'numero'>,
  pecaId: string
): number {
  const movs = db.movimentacoes_estoque ?? []
  const temMovimento = movs.some(
    (m) =>
      movimentoRelacionadoOS(m, os) &&
      m.peca_id === pecaId &&
      (m.tipo === 'saida' || m.tipo === 'devolucao')
  )
  if (temMovimento) {
    return saldoLiquidoBaixaOS(movs, os, pecaId)
  }
  if (!osAnterior) return 0
  return (
    agregarQuantidadeJaBaixada(
      osAnterior.pecas_utilizadas ?? [],
      Boolean(osAnterior.estoque_baixado)
    ).get(pecaId)?.qtd ?? 0
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
  const ativas = pecas.filter((p) => !entidadeFoiExcluida(p))
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
  for (const os of ordens.filter(
    (o) => !ehDocumentoOrcamento(o) && statusExigeBaixaEstoque(o.status)
  )) {
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
    data: getDataLocalHoje(),
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

/**
 * Ajusta estoque da OS até a demanda desejada (mapa peca_id → qtd).
 * Idempotente: baseline = movimentos / quantidade_baixada; IDs determinísticos.
 */
export function ajustarEstoqueOsParaDemanda(
  db: CraftDatabase,
  os: OrdemServico,
  osAnterior: OrdemServico | undefined,
  demandaDesejada: Map<string, { nome: string; qtd: number; valor_unitario: number }>,
  usuario: UsuarioMovimentacao,
  officeId: string,
  opcoes?: { marcarBaixado?: boolean }
): CraftDatabase {
  // Corrige movimentos antigos cujo ordem_servico_id virou UUID do Supabase
  const movimentacoes = (db.movimentacoes_estoque ?? []).map((m) => {
    if (!movimentoRelacionadoOS(m, os)) return m
    if (m.ordem_servico_id === os.id) return m
    return { ...m, ordem_servico_id: os.id, ordem_servico_numero: os.numero }
  })
  db = { ...db, movimentacoes_estoque: movimentacoes }

  let pecas = db.pecas
  const pecaIds = new Set<string>([
    ...demandaDesejada.keys(),
    ...[...(osAnterior?.pecas_utilizadas ?? []), ...(os.pecas_utilizadas ?? [])]
      .filter((p) => p.peca_id && !p.manual)
      .map((p) => p.peca_id!),
  ])

  // Também inclui peças que só existem em movimentos desta OS
  for (const m of movimentacoes) {
    if (movimentoRelacionadoOS(m, os) && m.peca_id) pecaIds.add(m.peca_id)
  }

  const movWork = [...movimentacoes]

  for (const pecaId of pecaIds) {
    const desejado = demandaDesejada.get(pecaId)?.qtd ?? 0
    const jaBaixado = obterBaselineJaBaixadaOS(db, osAnterior, os, pecaId)
    const jaNosMovsLocais = saldoLiquidoBaixaOS(movWork, os, pecaId)
    const baseline = Math.max(jaBaixado, jaNosMovsLocais)
    const diff = Math.round((desejado - baseline) * 1000) / 1000
    if (Math.abs(diff) < 0.0001) continue

    const peca = pecas.find((p) => p.id === pecaId)
    if (!peca) continue

    const linhaRef =
      os.pecas_utilizadas?.find((p) => p.peca_id === pecaId && !p.manual) ??
      osAnterior?.pecas_utilizadas?.find((p) => p.peca_id === pecaId && !p.manual)
    const valorUnit =
      demandaDesejada.get(pecaId)?.valor_unitario ??
      linhaRef?.valor_unitario ??
      peca.preco_venda
    const de = baseline
    const para = desejado
    const chave = chaveIdempotenciaDeltaOS(os.id, pecaId, de, para)
    const idMov = idMovimentoDeltaOS(os.id, pecaId, de, para)

    if (movimentoComChaveExiste(movWork, chave, idMov)) {
      continue
    }

    if (diff > 0) {
      movWork.push(
        criarMovimentacao(officeId, {
          id: idMov,
          chave_idempotencia: chave,
          peca_id: peca.id,
          peca_nome: peca.nome,
          tipo: 'saida',
          quantidade: diff,
          valor_unitario: valorUnit,
          data: getDataLocalHoje(),
          ordem_servico_id: os.id,
          ordem_servico_numero: os.numero,
          motivo: `Saída por OS #${os.numero}`,
          observacao:
            de === 0
              ? `Saída por OS #${os.numero}`
              : `Saída por OS #${os.numero} (ajuste +${diff})`,
          usuario_id: usuario.id,
          usuario_nome: usuario.nome,
        })
      )
      pecas = pecas.map((p) =>
        p.id === pecaId
          ? stampUpdate({ ...p, quantidade: Math.max(0, p.quantidade - diff) })
          : p
      )
    } else {
      const qtdDev = Math.abs(diff)
      movWork.push(
        criarMovimentacao(officeId, {
          id: idMov,
          chave_idempotencia: chave,
          peca_id: peca.id,
          peca_nome: peca.nome,
          tipo: 'devolucao',
          quantidade: qtdDev,
          valor_unitario: valorUnit,
          data: getDataLocalHoje(),
          ordem_servico_id: os.id,
          ordem_servico_numero: os.numero,
          motivo: para === 0 ? 'Devolução' : 'Ajuste OS',
          observacao:
            para === 0
              ? `Devolução por OS #${os.numero}`
              : `Devolução por OS #${os.numero} (ajuste -${qtdDev})`,
          usuario_id: usuario.id,
          usuario_nome: usuario.nome,
        })
      )
      pecas = pecas.map((p) =>
        p.id === pecaId ? stampUpdate({ ...p, quantidade: p.quantidade + qtdDev }) : p
      )
    }
  }

  const marcarBaixado =
    opcoes?.marcarBaixado ?? demandaDesejada.size > 0
  const ordens_servico = db.ordens_servico.map((o) =>
    o.id === os.id
      ? {
          ...o,
          estoque_baixado: marcarBaixado,
          pecas_utilizadas: aplicarBaselineBaixadaNasPecas(
            os.pecas_utilizadas ?? o.pecas_utilizadas ?? [],
            marcarBaixado
          ),
        }
      : o
  )

  return { ...db, pecas, movimentacoes_estoque: movWork, ordens_servico }
}

export function demandaDesejadaDaOS(
  os: OrdemServico
): Map<string, { nome: string; qtd: number; valor_unitario: number }> {
  const mapa = new Map<string, { nome: string; qtd: number; valor_unitario: number }>()
  for (const pu of os.pecas_utilizadas ?? []) {
    if (!pu.peca_id || pu.manual) continue
    const atual = mapa.get(pu.peca_id) ?? {
      nome: pu.nome,
      qtd: 0,
      valor_unitario: pu.valor_unitario,
    }
    mapa.set(pu.peca_id, {
      nome: pu.nome || atual.nome,
      qtd: atual.qtd + (pu.quantidade ?? 0),
      valor_unitario: pu.valor_unitario || atual.valor_unitario,
    })
  }
  return mapa
}

export function registrarSaidaOS(
  db: CraftDatabase,
  os: OrdemServico,
  usuario: UsuarioMovimentacao,
  officeId: string
): CraftDatabase {
  return ajustarEstoqueOsParaDemanda(
    db,
    os,
    undefined,
    demandaDesejadaDaOS(os),
    usuario,
    officeId,
    { marcarBaixado: true }
  )
}

export function registrarDevolucaoOS(
  db: CraftDatabase,
  os: OrdemServico,
  usuario: UsuarioMovimentacao,
  officeId: string
): CraftDatabase {
  return ajustarEstoqueOsParaDemanda(
    db,
    os,
    os,
    new Map(),
    usuario,
    officeId,
    { marcarBaixado: false }
  )
}

export { statusExigeBaixaEstoque } from '@/services/os-status.service'

export function deveBaixarEstoqueOS(
  os: OrdemServico,
  _osAnterior?: OrdemServico,
  db?: CraftDatabase
): boolean {
  if (ehDocumentoOrcamento(os)) return false
  if (!statusExigeBaixaEstoque(os.status)) return false
  if (os.estoque_baixado) return false
  if (db) {
    const demanda = agregarDemandaEstoquePecas(os.pecas_utilizadas ?? [])
    let tudoCoberto = demanda.size > 0
    for (const [pecaId, { qtd }] of demanda) {
      if (obterBaselineJaBaixadaOS(db, _osAnterior, os, pecaId) + 0.0001 < qtd) {
        tudoCoberto = false
        break
      }
    }
    if (tudoCoberto && demanda.size > 0) return false
  }
  return true
}

export function deveDevolverEstoqueOS(
  os: OrdemServico,
  osAnterior?: OrdemServico,
  db?: CraftDatabase
): boolean {
  const statusZera =
    os.status === 'cancelada' ||
    ehDocumentoOrcamento(os) ||
    (osAnterior != null &&
      statusExigeBaixaEstoque(osAnterior.status) &&
      !statusExigeBaixaEstoque(os.status))

  if (!statusZera) return false
  if (osAnterior?.estoque_baixado) return true
  if (db && saldoLiquidoBaixaOSAlguma(db, os)) return true
  return false
}

export function ajustarEstoqueDeltaOS(
  db: CraftDatabase,
  os: OrdemServico,
  osAnterior: OrdemServico,
  usuario: UsuarioMovimentacao,
  officeId: string
): CraftDatabase {
  const demanda = demandaDesejadaDaOS(os)
  return ajustarEstoqueOsParaDemanda(db, os, osAnterior, demanda, usuario, officeId, {
    marcarBaixado: demanda.size > 0,
  })
}

export function deveAjustarEstoqueDeltaOS(
  os: OrdemServico,
  osAnterior?: OrdemServico,
  db?: CraftDatabase
): boolean {
  if (ehDocumentoOrcamento(os)) return false
  if (!statusExigeBaixaEstoque(os.status)) return false
  if (!osAnterior?.estoque_baixado && !db) return false

  const demanda = demandaDesejadaDaOS(os)
  const ids = new Set<string>([
    ...demanda.keys(),
    ...agregarQuantidadeJaBaixada(osAnterior?.pecas_utilizadas ?? [], true).keys(),
  ])
  if (db) {
    for (const m of db.movimentacoes_estoque ?? []) {
      if (movimentoRelacionadoOS(m, os) && m.peca_id) ids.add(m.peca_id)
    }
  }

  for (const pecaId of ids) {
    const desejado = demanda.get(pecaId)?.qtd ?? 0
    const baseline = db
      ? obterBaselineJaBaixadaOS(db, osAnterior, os, pecaId)
      : agregarQuantidadeJaBaixada(osAnterior?.pecas_utilizadas ?? [], true).get(pecaId)?.qtd ?? 0
    if (Math.abs(desejado - baseline) > 0.0001) return true
  }

  if (osAnterior?.estoque_baixado) {
    const pecas = os.pecas_utilizadas ?? []
    return pecas.some(
      (p) =>
        p.peca_id &&
        !p.manual &&
        (p.quantidade_baixada ?? -1) !== (p.quantidade ?? 0)
    )
  }
  return false
}

export function processarEstoqueAoSalvarOS(
  db: CraftDatabase,
  os: OrdemServico,
  osAnterior: OrdemServico | undefined,
  usuario: UsuarioMovimentacao,
  officeId: string
): CraftDatabase {
  if (deveDevolverEstoqueOS(os, osAnterior, db)) {
    return ajustarEstoqueOsParaDemanda(
      db,
      os,
      osAnterior ?? os,
      new Map(),
      usuario,
      officeId,
      { marcarBaixado: false }
    )
  }

  if (ehDocumentoOrcamento(os)) return db
  if (!statusExigeBaixaEstoque(os.status)) return db

  const demanda = demandaDesejadaDaOS(os)
  return ajustarEstoqueOsParaDemanda(db, os, osAnterior, demanda, usuario, officeId, {
    marcarBaixado: demanda.size > 0,
  })
}

function saldoLiquidoBaixaOSAlguma(
  db: CraftDatabase,
  os: Pick<OrdemServico, 'id' | 'numero'>
): boolean {
  return (db.movimentacoes_estoque ?? []).some(
    (m) => movimentoRelacionadoOS(m, os) && (m.tipo === 'saida' || m.tipo === 'devolucao')
  )
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
