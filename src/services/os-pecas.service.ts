import { gerarId } from '@/lib/utils'
import type { OrdemServico, PecaUtilizada } from '@/types/ordem-servico'
import type { Peca, CategoriaPeca } from '@/types/peca'
import type { ServicoOSItem } from '@/types/servico-catalogo'
import {
  inferirUnidadePorCategoria,
  normalizarUnidadePeca,
  type UnidadePecaOS,
} from '@/types/unidade-peca'
import { getLabelCategoriaPeca } from '@/types/peca'

export function inferirUnidadeDaPeca(peca: Peca): UnidadePecaOS {
  return normalizarUnidadePeca(
    peca.unidade ?? inferirUnidadePorCategoria(peca.categoria ?? 'outros')
  )
}

export function normalizarPecaUtilizada(
  peca: Partial<PecaUtilizada> & Pick<PecaUtilizada, 'nome' | 'quantidade' | 'valor_unitario'>
): PecaUtilizada {
  const qtd = typeof peca.quantidade === 'number' && !Number.isNaN(peca.quantidade) ? peca.quantidade : 1
  const valor = typeof peca.valor_unitario === 'number' && !Number.isNaN(peca.valor_unitario) ? peca.valor_unitario : 0
  const custo =
    typeof peca.custo_unitario === 'number' &&
    Number.isFinite(peca.custo_unitario) &&
    peca.custo_unitario >= 0
      ? peca.custo_unitario
      : undefined

  return {
    linha_id: peca.linha_id ?? gerarId(),
    peca_id: peca.peca_id,
    nome: peca.nome?.trim() || 'Peça',
    codigo: peca.codigo,
    quantidade: qtd,
    quantidade_baixada:
      typeof peca.quantidade_baixada === 'number' && !Number.isNaN(peca.quantidade_baixada)
        ? Math.max(0, peca.quantidade_baixada)
        : peca.quantidade_baixada,
    unidade: normalizarUnidadePeca(peca.unidade),
    custo_unitario: custo,
    valor_unitario: valor,
    observacao: peca.observacao,
    manual: peca.manual ?? !peca.peca_id,
    pendencia_compra: peca.pendencia_compra,
    servico_item_id: peca.servico_item_id,
    sugestao_id: peca.sugestao_id,
  }
}

export function normalizarPecasUtilizadasOS(pecas?: PecaUtilizada[]): PecaUtilizada[] {
  return (pecas ?? []).map((p) =>
    normalizarPecaUtilizada({
      ...p,
      linha_id: p.linha_id ?? gerarId(),
      manual: p.manual ?? !p.peca_id,
    })
  )
}

export function calcularValorPecasUtilizadas(pecas: PecaUtilizada[]): number {
  return pecas.reduce((acc, p) => acc + (p.quantidade ?? 0) * (p.valor_unitario ?? 0), 0)
}

export function criarPecaUtilizadaDeEstoque(
  peca: Peca,
  quantidade = 1,
  extras?: {
    unidade?: UnidadePecaOS | string
    observacao?: string
    servico_item_id?: string
    sugestao_id?: string
    valor_unitario?: number
    pendencia_compra?: boolean
  }
): PecaUtilizada {
  const unidade = normalizarUnidadePeca(extras?.unidade ?? inferirUnidadeDaPeca(peca))
  const qtd = typeof quantidade === 'number' && quantidade > 0 ? quantidade : 1

  return normalizarPecaUtilizada({
    peca_id: peca.id,
    nome: peca.nome ?? 'Peça',
    codigo: peca.codigo,
    quantidade: qtd,
    unidade,
    valor_unitario: extras?.valor_unitario ?? peca.preco_venda ?? 0,
    observacao: extras?.observacao,
    manual: false,
    servico_item_id: extras?.servico_item_id,
    sugestao_id: extras?.sugestao_id,
    pendencia_compra: extras?.pendencia_compra,
  })
}

export function criarPecaUtilizadaManual(input: {
  nome: string
  codigo?: string
  quantidade: number
  unidade?: UnidadePecaOS | string
  custo_unitario: number
  valor_unitario: number
  observacao?: string
}): PecaUtilizada {
  return normalizarPecaUtilizada({
    ...input,
    unidade: normalizarUnidadePeca(input.unidade),
    manual: true,
  })
}

export interface ValidacaoAdicaoPecaEstoque {
  valido: boolean
  mensagem?: string
}

export function validarAdicaoPecaEstoque(input: {
  peca_id?: string
  quantidade?: string | number
  unidade?: string
}): ValidacaoAdicaoPecaEstoque {
  if (!input.peca_id?.trim()) {
    return { valido: false, mensagem: 'Selecione uma peça do estoque.' }
  }
  const qtdStr = String(input.quantidade ?? '').trim()
  if (!qtdStr) {
    return { valido: false, mensagem: 'Informe a quantidade utilizada.' }
  }
  const n = parseFloat(qtdStr.replace(',', '.'))
  if (Number.isNaN(n) || n <= 0) {
    return { valido: false, mensagem: 'Quantidade deve ser maior que zero.' }
  }
  if (input.unidade && !normalizarUnidadePeca(input.unidade)) {
    return { valido: false, mensagem: 'Unidade de medida inválida. Verifique o cadastro da peça.' }
  }
  return { valido: true }
}

export function atualizarPecaUtilizadaNaLista(
  pecas: PecaUtilizada[],
  linhaId: string,
  patch: Partial<PecaUtilizada>
): PecaUtilizada[] {
  return pecas.map((p) => {
    if (p.linha_id !== linhaId) return p
    const merged = { ...p, ...patch }
    if (patch.unidade !== undefined) {
      merged.unidade = normalizarUnidadePeca(patch.unidade)
    }
    return merged
  })
}

export function removerPecaUtilizadaDaLista(
  pecas: PecaUtilizada[],
  linhaId: string
): PecaUtilizada[] {
  return pecas.filter((p) => p.linha_id !== linhaId)
}

export function mesclarPecasSugeridas(
  atuais: PecaUtilizada[],
  sugeridas: ServicoOSItem['pecas_sugeridas'],
  pecasEstoque: Peca[] = []
): PecaUtilizada[] {
  if (!sugeridas?.length) return atuais

  let resultado = [...atuais]
  for (const ps of sugeridas) {
    const pecaRef = ps.peca_referencia_id
      ? pecasEstoque.find((p) => p.id === ps.peca_referencia_id)
      : undefined
    if (!pecaRef) continue

    const existente = resultado.find((p) => p.peca_id === pecaRef.id && !p.manual)
    if (existente) {
      resultado = resultado.map((p) =>
        p.linha_id === existente.linha_id
          ? { ...p, quantidade: p.quantidade + ps.quantidade }
          : p
      )
    } else {
      resultado.push(
        criarPecaUtilizadaDeEstoque(pecaRef, ps.quantidade, {
          unidade: ps.unidade,
          sugestao_id: ps.id,
        })
      )
    }
  }
  return resultado
}

export function filtrarPecasEstoqueParaSugestao(
  pecas: Peca[],
  sugestao: {
    categoria_peca?: CategoriaPeca
    descricao?: string
  }
): Peca[] {
  const ativas = pecas.filter((p) => p.ativo !== false)
  if (sugestao.categoria_peca) {
    const filtradas = ativas.filter((p) => (p.categoria ?? 'outros') === sugestao.categoria_peca)
    if (filtradas.length) return filtradas
  }
  const termo = sugestao.descricao?.toLowerCase() ?? ''
  if (termo.includes('óleo') || termo.includes('oleo')) {
    const oleos = ativas.filter((p) => p.categoria === 'oleo')
    if (oleos.length) return oleos
  }
  if (termo.includes('filtro')) {
    const filtros = ativas.filter((p) => p.categoria === 'filtro')
    if (filtros.length) return filtros
  }
  if (
    termo.includes('arrefecimento') ||
    termo.includes('radiador') ||
    termo.includes('coolant') ||
    termo.includes('refrigera')
  ) {
    const arref = ativas.filter((p) => p.categoria === 'arrefecimento')
    if (arref.length) return arref
  }
  return ativas
}

export function rotuloPecaEstoqueOS(peca: Peca): string {
  const cat = getLabelCategoriaPeca(peca.categoria ?? 'outros')
  const un = normalizarUnidadePeca(peca.unidade ?? inferirUnidadeDaPeca(peca))
  return `${peca.nome} · ${cat} · ${un} · estoque: ${peca.quantidade ?? 0}`
}

export function sincronizarValorPecasForm<
  T extends Pick<OrdemServico, 'pecas_utilizadas' | 'valor_pecas'>
>(form: T): T {
  return {
    ...form,
    valor_pecas: calcularValorPecasUtilizadas(form.pecas_utilizadas ?? []),
  }
}

export interface AlertaEstoquePeca {
  peca_id: string
  nome: string
  necessario: number
  disponivel: number
}

/** Agrupa quantidade de peças do estoque usadas na OS (ignora manual). */
export function agregarDemandaEstoquePecas(
  pecasUtilizadas: PecaUtilizada[]
): Map<string, { nome: string; qtd: number }> {
  const demanda = new Map<string, { nome: string; qtd: number }>()
  for (const pu of pecasUtilizadas) {
    if (!pu.peca_id || pu.manual) continue
    const atual = demanda.get(pu.peca_id) ?? { nome: pu.nome, qtd: 0 }
    demanda.set(pu.peca_id, { nome: pu.nome, qtd: atual.qtd + (pu.quantidade ?? 0) })
  }
  return demanda
}

/** Diferença entre peças antes e depois (positivo = mais saída, negativo = devolução). */
export function calcularDeltaDemandaEstoque(
  pecasAnteriores: PecaUtilizada[],
  pecasNovas: PecaUtilizada[]
): Map<string, number> {
  const antes = agregarDemandaEstoquePecas(pecasAnteriores)
  const depois = agregarDemandaEstoquePecas(pecasNovas)
  const ids = new Set([...antes.keys(), ...depois.keys()])
  const delta = new Map<string, number>()
  for (const id of ids) {
    const diff = (depois.get(id)?.qtd ?? 0) - (antes.get(id)?.qtd ?? 0)
    if (Math.abs(diff) > 0.0001) delta.set(id, diff)
  }
  return delta
}

/**
 * Quanto já saiu do estoque para esta linha.
 * Preferência: quantidade_baixada persistida — não confiar só na quantidade visível.
 */
export function obterQuantidadeJaBaixada(
  pu: PecaUtilizada,
  osJaBaixada: boolean
): number {
  if (!pu.peca_id || pu.manual) return 0
  if (typeof pu.quantidade_baixada === 'number' && !Number.isNaN(pu.quantidade_baixada)) {
    return Math.max(0, pu.quantidade_baixada)
  }
  // Migração RC1: OS já baixada sem campo → assume quantidade era o baixado
  return osJaBaixada ? Math.max(0, pu.quantidade ?? 0) : 0
}

/** Agrega baseline já baixado por peca_id (sync-safe entre dispositivos). */
export function agregarQuantidadeJaBaixada(
  pecas: PecaUtilizada[],
  osJaBaixada: boolean
): Map<string, { nome: string; qtd: number }> {
  const mapa = new Map<string, { nome: string; qtd: number }>()
  for (const pu of pecas ?? []) {
    if (!pu.peca_id || pu.manual) continue
    const qtd = obterQuantidadeJaBaixada(pu, osJaBaixada)
    if (qtd <= 0) continue
    const atual = mapa.get(pu.peca_id) ?? { nome: pu.nome, qtd: 0 }
    mapa.set(pu.peca_id, { nome: pu.nome || atual.nome, qtd: atual.qtd + qtd })
  }
  return mapa
}

/**
 * Delta = demanda nova (quantidade) − baseline já baixado (quantidade_baixada).
 * Não usa só a quantidade anterior da OS — evita baseline stale entre PC/celular.
 */
export function calcularDeltaPorBaselineBaixada(
  pecasAnteriores: PecaUtilizada[],
  pecasNovas: PecaUtilizada[],
  osJaBaixada: boolean
): Map<string, number> {
  const antes = agregarQuantidadeJaBaixada(pecasAnteriores, osJaBaixada)
  const depois = agregarDemandaEstoquePecas(pecasNovas)
  const ids = new Set([...antes.keys(), ...depois.keys()])
  const delta = new Map<string, number>()
  for (const id of ids) {
    const diff = (depois.get(id)?.qtd ?? 0) - (antes.get(id)?.qtd ?? 0)
    if (Math.abs(diff) > 0.0001) delta.set(id, diff)
  }
  return delta
}

/** Atualiza quantidade_baixada nas linhas após baixa/delta/estorno. */
export function aplicarBaselineBaixadaNasPecas(
  pecas: PecaUtilizada[],
  baixado: boolean
): PecaUtilizada[] {
  return (pecas ?? []).map((pu) => {
    if (!pu.peca_id || pu.manual) {
      return { ...pu, quantidade_baixada: 0 }
    }
    return {
      ...pu,
      quantidade_baixada: baixado ? Math.max(0, pu.quantidade ?? 0) : 0,
    }
  })
}

function pecaTemPendenciaCompra(pecasUtilizadas: PecaUtilizada[], pecaId: string): boolean {
  return pecasUtilizadas.some((p) => p.peca_id === pecaId && p.pendencia_compra)
}

export function verificarEstoqueInsuficiente(
  pecasUtilizadas: PecaUtilizada[],
  estoque: Peca[]
): AlertaEstoquePeca[] {
  const demanda = agregarDemandaEstoquePecas(pecasUtilizadas)
  const alertas: AlertaEstoquePeca[] = []
  for (const [pecaId, { nome, qtd }] of demanda) {
    const linha = pecasUtilizadas.find((p) => p.peca_id === pecaId)
    let peca = estoque.find((p) => p.id === pecaId)
    if (!peca && linha) {
      const cod = linha.codigo?.trim().toLowerCase()
      if (cod) peca = estoque.find((p) => p.codigo?.trim().toLowerCase() === cod)
      if (!peca && linha.nome) {
        const n = linha.nome.trim().toLowerCase()
        peca = estoque.find((p) => p.nome?.trim().toLowerCase() === n)
      }
    }
    const disponivel = peca?.quantidade ?? 0
    if (qtd > disponivel) {
      alertas.push({
        peca_id: pecaId,
        nome: peca?.nome ?? nome,
        necessario: qtd,
        disponivel,
      })
    }
  }
  return alertas
}

/** Valida estoque para baixa inicial ou ajuste delta após OS já baixada. */
export function verificarEstoqueParaBaixaOS(
  pecasNovas: PecaUtilizada[],
  estoque: Peca[],
  osAnterior?: Pick<OrdemServico, 'pecas_utilizadas' | 'estoque_baixado'>,
  opcoes?: { vaiBaixar?: boolean }
): AlertaEstoquePeca[] {
  let demanda: Map<string, { nome: string; qtd: number }>

  if (osAnterior?.estoque_baixado) {
    const delta = calcularDeltaPorBaselineBaixada(
      osAnterior.pecas_utilizadas ?? [],
      pecasNovas,
      true
    )
    demanda = new Map()
    for (const [pecaId, diff] of delta) {
      if (diff <= 0) continue
      const ref = pecasNovas.find((p) => p.peca_id === pecaId)
      demanda.set(pecaId, { nome: ref?.nome ?? pecaId, qtd: diff })
    }
  } else if (opcoes?.vaiBaixar) {
    demanda = agregarDemandaEstoquePecas(pecasNovas)
  } else {
    return []
  }

  const alertas: AlertaEstoquePeca[] = []
  for (const [pecaId, { nome, qtd }] of demanda) {
    if (pecaTemPendenciaCompra(pecasNovas, pecaId)) continue
    const peca = estoque.find((p) => p.id === pecaId)
    const disponivel = peca?.quantidade ?? 0
    if (qtd > disponivel) {
      alertas.push({
        peca_id: pecaId,
        nome: peca?.nome ?? nome,
        necessario: qtd,
        disponivel,
      })
    }
  }
  return alertas
}

export function calcularLucroLinhaPeca(pu: PecaUtilizada, peca?: Peca): number {
  return calcularTotaisLinhaPeca(pu, peca).lucro
}

export interface TotaisLinhaPeca {
  venda: number
  custo: number
  lucro: number
  custoUnitarioEfetivo: number
  custoConhecido: boolean
}

/**
 * Regra financeira única para peças da OS.
 * Manual legada sem custo conhecido assume custo igual à venda (margem zero).
 */
export function calcularTotaisLinhaPeca(
  pu: PecaUtilizada,
  peca?: Pick<Peca, 'custo'>
): TotaisLinhaPeca {
  const quantidade = Math.max(0, Number(pu.quantidade) || 0)
  const valorUnitario = Math.max(0, Number(pu.valor_unitario) || 0)
  const manual = pu.manual === true || !pu.peca_id
  const custoManualConhecido =
    typeof pu.custo_unitario === 'number' &&
    Number.isFinite(pu.custo_unitario) &&
    pu.custo_unitario >= 0
  const custoEstoqueConhecido =
    !manual &&
    typeof peca?.custo === 'number' &&
    Number.isFinite(peca.custo) &&
    peca.custo > 0

  const custoUnitarioEfetivo = manual
    ? custoManualConhecido
      ? pu.custo_unitario!
      : valorUnitario
    : custoEstoqueConhecido
      ? Math.max(0, peca.custo)
      : 0

  const venda = quantidade * valorUnitario
  const custo = quantidade * custoUnitarioEfetivo
  return {
    venda,
    custo,
    lucro: venda - custo,
    custoUnitarioEfetivo,
    custoConhecido: manual ? custoManualConhecido : custoEstoqueConhecido,
  }
}

export function calcularLucroPecasOS(pecasUtilizadas: PecaUtilizada[], estoque: Peca[]): number {
  return (pecasUtilizadas ?? []).reduce((acc, pu) => {
    const peca = pu.peca_id ? estoque.find((p) => p.id === pu.peca_id) : undefined
    return acc + calcularLucroLinhaPeca(pu, peca)
  }, 0)
}

export function calcularLucroEstimadoOS(valorMaoObra: number, lucroPecas: number): number {
  return (valorMaoObra ?? 0) + lucroPecas
}
