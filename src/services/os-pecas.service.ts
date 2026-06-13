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

  return {
    linha_id: peca.linha_id ?? gerarId(),
    peca_id: peca.peca_id,
    nome: peca.nome?.trim() || 'Peça',
    codigo: peca.codigo,
    quantidade: qtd,
    unidade: normalizarUnidadePeca(peca.unidade),
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

export function verificarEstoqueInsuficiente(
  pecasUtilizadas: PecaUtilizada[],
  estoque: Peca[]
): AlertaEstoquePeca[] {
  const demanda = new Map<string, { nome: string; qtd: number }>()

  for (const pu of pecasUtilizadas) {
    if (!pu.peca_id || pu.manual) continue
    const atual = demanda.get(pu.peca_id) ?? { nome: pu.nome, qtd: 0 }
    demanda.set(pu.peca_id, { nome: pu.nome, qtd: atual.qtd + (pu.quantidade ?? 0) })
  }

  const alertas: AlertaEstoquePeca[] = []
  for (const [pecaId, { nome, qtd }] of demanda) {
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
