import { gerarId } from '@/lib/utils'
import { calcularValorTotalOS } from '@/types/labels'
import type { OrdemServico } from '@/types/ordem-servico'
import type { Peca } from '@/types/peca'
import type { RegraLembrete } from '@/types/lembrete'
import type {
  ServicoCatalogo,
  ServicoOSItem,
} from '@/types/servico-catalogo'

export function criarServicoOSItemDeCatalogo(
  servico: ServicoCatalogo,
  pecas: Peca[]
): ServicoOSItem {
  const pecas_sugeridas = servico.pecas_sugeridas
    .map((ps) => {
      const peca = pecas.find((p) => p.id === ps.peca_id)
      if (!peca) return null
      return {
        peca_id: peca.id,
        nome: peca.nome,
        quantidade: ps.quantidade,
        valor_unitario: peca.preco_venda,
      }
    })
    .filter((p): p is NonNullable<typeof p> => p !== null)

  return {
    id: gerarId(),
    servico_catalogo_id: servico.id,
    nome: servico.nome,
    descricao: servico.descricao,
    valor_mao_obra: servico.valor_mao_obra,
    tempo_estimado_minutos: servico.tempo_estimado_minutos,
    garantia_dias: servico.garantia_dias,
    observacoes: servico.observacoes_internas,
    pecas_sugeridas,
  }
}

export function sincronizarTotaisOSServicos<
  T extends Pick<
    OrdemServico,
    'servicos_itens' | 'valor_mao_obra' | 'servicos_executados' | 'dias_garantia'
  >
>(form: T): T {
  const servicos = form.servicos_itens ?? []
  const valor_mao_obra = servicos.reduce((acc, s) => acc + s.valor_mao_obra, 0)
  const servicos_executados = servicos.map((s) => s.nome).join('\n')
  const garantias = servicos.map((s) => s.garantia_dias ?? 0).filter((d) => d > 0)
  const maxGarantia = garantias.length ? Math.max(...garantias) : undefined

  return {
    ...form,
    valor_mao_obra,
    servicos_executados,
    dias_garantia: maxGarantia ?? form.dias_garantia,
  }
}

/** Adiciona serviço do catálogo sem alterar peças da OS */
export function aplicarServicoCatalogoNaOS<
  T extends Pick<
    OrdemServico,
    | 'servicos_itens'
    | 'valor_mao_obra'
    | 'servicos_executados'
    | 'dias_garantia'
  >
>(form: T, servico: ServicoCatalogo, pecas: Peca[]): T {
  const item = criarServicoOSItemDeCatalogo(servico, pecas)
  const servicos_itens = [...(form.servicos_itens ?? []), item]
  return sincronizarTotaisOSServicos({ ...form, servicos_itens })
}

export function removerServicoOSItem<
  T extends Pick<
    OrdemServico,
    | 'servicos_itens'
    | 'valor_mao_obra'
    | 'servicos_executados'
    | 'dias_garantia'
  >
>(form: T, itemId: string): T {
  const servicos_itens = (form.servicos_itens ?? []).filter((s) => s.id !== itemId)
  return sincronizarTotaisOSServicos({ ...form, servicos_itens })
}

export function atualizarServicoOSItem<
  T extends Pick<
    OrdemServico,
    | 'servicos_itens'
    | 'valor_mao_obra'
    | 'servicos_executados'
    | 'dias_garantia'
  >
>(form: T, itemId: string, patch: Partial<ServicoOSItem>): T {
  const servicos_itens = (form.servicos_itens ?? []).map((s) =>
    s.id === itemId ? { ...s, ...patch } : s
  )
  return sincronizarTotaisOSServicos({ ...form, servicos_itens })
}

export function obterRegrasLembreteDeServicosOS(
  os: Pick<OrdemServico, 'servicos_itens'>,
  catalogo: ServicoCatalogo[],
  regras: RegraLembrete[]
): RegraLembrete[] {
  const ids = new Set<string>()
  const resultado: RegraLembrete[] = []

  for (const item of os.servicos_itens ?? []) {
    if (!item.servico_catalogo_id) continue
    const servico = catalogo.find((c) => c.id === item.servico_catalogo_id)
    const lembrete = servico?.lembrete
    if (!lembrete?.ativo) continue

    if (lembrete.regra_id) {
      const regra = regras.find((r) => r.id === lembrete.regra_id && r.ativo)
      if (regra && !ids.has(regra.id)) {
        ids.add(regra.id)
        resultado.push(regra)
      }
      continue
    }

    if (lembrete.prazo_dias || lembrete.prazo_meses || lembrete.km_retorno) {
      const virtualId = `cat-${servico!.id}`
      if (ids.has(virtualId)) continue
      ids.add(virtualId)
      resultado.push({
        id: virtualId,
        office_id: servico!.office_id ?? servico!.oficina_id ?? '',
        nome_regra: `Retorno — ${servico!.nome}`,
        servico_relacionado: servico!.nome,
        categoria: 'geral',
        prazo_dias: lembrete.prazo_dias ?? 0,
        prazo_meses: lembrete.prazo_meses ?? 0,
        km_retorno: lembrete.km_retorno,
        mensagem_padrao:
          lembrete.mensagem_padrao ??
          `Olá {{nome_cliente}}, está na hora de retornar para {{servico}} da sua {{moto}} ({{placa}}). {{nome_oficina}}`,
        ativo: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
    }
  }

  return resultado
}

export interface StatServicoCatalogo {
  servico_id?: string
  nome: string
  quantidade: number
  receita: number
  clientes: number
}

export function calcularStatsServicosCatalogo(
  ordens: OrdemServico[],
  catalogo: ServicoCatalogo[]
): StatServicoCatalogo[] {
  const mapa = new Map<string, StatServicoCatalogo>()
  const OS_OK: OrdemServico['status'][] = ['finalizada', 'entregue']

  for (const os of ordens) {
    if (!OS_OK.includes(os.status)) continue

    if (os.servicos_itens?.length) {
      for (const item of os.servicos_itens) {
        const chave = item.servico_catalogo_id ?? item.nome.toLowerCase()
        const atual = mapa.get(chave) ?? {
          servico_id: item.servico_catalogo_id,
          nome: item.nome,
          quantidade: 0,
          receita: 0,
          clientes: 0,
        }
        mapa.set(chave, {
          ...atual,
          quantidade: atual.quantidade + 1,
          receita: atual.receita + item.valor_mao_obra,
          clientes: atual.clientes + 1,
        })
      }
      continue
    }

    if (!os.servicos_executados?.trim()) continue
    const linhas = os.servicos_executados.split(/[,;|\n]/).map((s) => s.trim()).filter(Boolean)
    const receitaLinha = linhas.length ? os.valor_mao_obra / linhas.length : 0
    for (const linha of linhas) {
      const cat = catalogo.find((c) => c.nome.toLowerCase() === linha.toLowerCase())
      const chave = cat?.id ?? linha.toLowerCase()
      const atual = mapa.get(chave) ?? {
        servico_id: cat?.id,
        nome: cat?.nome ?? linha,
        quantidade: 0,
        receita: 0,
        clientes: 0,
      }
      mapa.set(chave, {
        ...atual,
        quantidade: atual.quantidade + 1,
        receita: atual.receita + receitaLinha,
        clientes: atual.clientes + 1,
      })
    }
  }

  return [...mapa.values()].sort((a, b) => b.quantidade - a.quantidade || b.receita - a.receita)
}

export function calcularValorTotalOSComServicos(
  valorPecas: number,
  valorMaoObra: number,
  desconto: number,
  valorAdicional = 0
): number {
  return calcularValorTotalOS(valorPecas, valorMaoObra, desconto, valorAdicional)
}
