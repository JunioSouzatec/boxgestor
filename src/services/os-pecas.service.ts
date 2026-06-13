import { gerarId } from '@/lib/utils'
import type { OrdemServico, PecaUtilizada } from '@/types/ordem-servico'
import type { Peca } from '@/types/peca'
import type { ServicoOSItem } from '@/types/servico-catalogo'

export function normalizarPecaUtilizada(
  peca: Partial<PecaUtilizada> & Pick<PecaUtilizada, 'nome' | 'quantidade' | 'valor_unitario'>
): PecaUtilizada {
  return {
    linha_id: peca.linha_id ?? peca.peca_id ?? gerarId(),
    peca_id: peca.peca_id,
    nome: peca.nome,
    codigo: peca.codigo,
    quantidade: peca.quantidade,
    valor_unitario: peca.valor_unitario,
    observacao: peca.observacao,
    manual: peca.manual ?? !peca.peca_id,
  }
}

export function normalizarPecasUtilizadasOS(pecas?: PecaUtilizada[]): PecaUtilizada[] {
  return (pecas ?? []).map((p) =>
    normalizarPecaUtilizada({
      ...p,
      linha_id: p.linha_id ?? p.peca_id ?? gerarId(),
      manual: p.manual ?? !p.peca_id,
    })
  )
}

export function calcularValorPecasUtilizadas(pecas: PecaUtilizada[]): number {
  return pecas.reduce((acc, p) => acc + p.quantidade * p.valor_unitario, 0)
}

export function criarPecaUtilizadaDeEstoque(peca: Peca, quantidade = 1): PecaUtilizada {
  return normalizarPecaUtilizada({
    peca_id: peca.id,
    nome: peca.nome,
    codigo: peca.codigo,
    quantidade,
    valor_unitario: peca.preco_venda,
    manual: false,
  })
}

export function criarPecaUtilizadaManual(input: {
  nome: string
  codigo?: string
  quantidade: number
  valor_unitario: number
  observacao?: string
}): PecaUtilizada {
  return normalizarPecaUtilizada({
    ...input,
    manual: true,
  })
}

export function atualizarPecaUtilizadaNaLista(
  pecas: PecaUtilizada[],
  linhaId: string,
  patch: Partial<PecaUtilizada>
): PecaUtilizada[] {
  return pecas.map((p) => (p.linha_id === linhaId ? { ...p, ...patch } : p))
}

export function removerPecaUtilizadaDaLista(
  pecas: PecaUtilizada[],
  linhaId: string
): PecaUtilizada[] {
  return pecas.filter((p) => p.linha_id !== linhaId)
}

export function mesclarPecasSugeridas(
  atuais: PecaUtilizada[],
  sugeridas: ServicoOSItem['pecas_sugeridas']
): PecaUtilizada[] {
  if (!sugeridas?.length) return atuais

  let resultado = [...atuais]
  for (const ps of sugeridas) {
    const existente = resultado.find((p) => p.peca_id === ps.peca_id && !p.manual)
    if (existente) {
      resultado = resultado.map((p) =>
        p.linha_id === existente.linha_id
          ? { ...p, quantidade: p.quantidade + ps.quantidade }
          : p
      )
    } else {
      resultado.push(
        normalizarPecaUtilizada({
          peca_id: ps.peca_id,
          nome: ps.nome,
          quantidade: ps.quantidade,
          valor_unitario: ps.valor_unitario,
          manual: false,
        })
      )
    }
  }
  return resultado
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
    demanda.set(pu.peca_id, { nome: pu.nome, qtd: atual.qtd + pu.quantidade })
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
