import type { Cliente, OrdemServico, Peca } from '@/types'
import { garantiaAtiva } from '@/services/ordem-servico.service'
import { calcularTotalGeralDeCampos } from '@/services/os-financeiro.service'
import { formatarMoeda } from '@/lib/utils'

export interface ServicoExecutadoStat {
  servico: string
  quantidade: number
  receita: number
}

export interface PecaUsadaStat {
  nome: string
  quantidade: number
  receita: number
}

export interface ClienteFrequenteStat {
  clienteId: string
  nome: string
  quantidade: number
  valorTotal: number
}

export interface AlertaOficina {
  id: string
  tipo: 'orcamento' | 'peca' | 'garantia' | 'estoque'
  titulo: string
  descricao: string
  severidade: 'info' | 'warning' | 'success'
}

const OS_CONCLUIDAS: OrdemServico['status'][] = ['finalizada', 'entregue']

function extrairServicos(texto: string): string[] {
  return texto
    .split(/[,;|\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2)
}

function extrairServicosDeOs(os: OrdemServico): { nome: string; receita: number }[] {
  if (os.servicos_itens?.length) {
    return os.servicos_itens.map((item) => ({
      nome: item.nome.trim(),
      receita: item.valor_mao_obra ?? 0,
    }))
  }

  const servicosTexto = os.servicos_executados?.trim() ?? ''
  if (!servicosTexto) return []

  const linhas = extrairServicos(servicosTexto)
  if (linhas.length === 0) return []

  const receitaPorServico = (os.valor_mao_obra ?? 0) / linhas.length
  return linhas.map((nome) => ({ nome, receita: receitaPorServico }))
}

export function calcularTopServicos(ordens: OrdemServico[], limite = 10): ServicoExecutadoStat[] {
  const mapa = new Map<string, { quantidade: number; receita: number; label: string }>()

  for (const os of ordens) {
    if (!OS_CONCLUIDAS.includes(os.status)) continue
    const servicos = extrairServicosDeOs(os)
    if (servicos.length === 0) continue

    for (const { nome, receita } of servicos) {
      const chave = nome.toLowerCase()
      const atual = mapa.get(chave) ?? { quantidade: 0, receita: 0, label: nome }
      mapa.set(chave, {
        label: atual.label || nome,
        quantidade: atual.quantidade + 1,
        receita: atual.receita + receita,
      })
    }
  }

  return [...mapa.values()]
    .map(({ label, quantidade, receita }) => ({
      servico: label.charAt(0).toUpperCase() + label.slice(1),
      quantidade,
      receita,
    }))
    .sort((a, b) => b.quantidade - a.quantidade || b.receita - a.receita)
    .slice(0, limite)
}

export function calcularTopPecasUsadas(ordens: OrdemServico[], limite = 10): PecaUsadaStat[] {
  const mapa = new Map<string, { nome: string; quantidade: number; receita: number }>()

  for (const os of ordens) {
    if (!OS_CONCLUIDAS.includes(os.status)) continue
    for (const pu of os.pecas_utilizadas ?? []) {
      const chave = (pu.peca_id ?? pu.nome).toLowerCase()
      const atual = mapa.get(chave) ?? { nome: pu.nome, quantidade: 0, receita: 0 }
      mapa.set(chave, {
        nome: pu.nome,
        quantidade: atual.quantidade + pu.quantidade,
        receita: atual.receita + pu.quantidade * pu.valor_unitario,
      })
    }
  }

  return [...mapa.values()]
    .sort((a, b) => b.quantidade - a.quantidade || b.receita - a.receita)
    .slice(0, limite)
}

export function calcularTopClientes(
  ordens: OrdemServico[],
  clientes: Cliente[],
  limite = 10
): ClienteFrequenteStat[] {
  const mapa = new Map<string, { quantidade: number; valorTotal: number }>()

  for (const os of ordens) {
    if (!OS_CONCLUIDAS.includes(os.status)) continue
    const atual = mapa.get(os.cliente_id) ?? { quantidade: 0, valorTotal: 0 }
    mapa.set(os.cliente_id, {
      quantidade: atual.quantidade + 1,
      valorTotal: atual.valorTotal + calcularTotalGeralDeCampos(os),
    })
  }

  return [...mapa.entries()]
    .map(([clienteId, stats]) => ({
      clienteId,
      nome: clientes.find((c) => c.id === clienteId)?.nome ?? 'Cliente',
      quantidade: stats.quantidade,
      valorTotal: stats.valorTotal,
    }))
    .sort((a, b) => b.quantidade - a.quantidade || b.valorTotal - a.valorTotal)
    .slice(0, limite)
}

export function calcularAlertasOficina(
  ordens: OrdemServico[],
  pecas: Peca[],
  getClienteNome: (id: string) => string
): AlertaOficina[] {
  const alertas: AlertaOficina[] = []

  for (const os of ordens) {
    if (os.status === 'aguardando_aprovacao' || os.status_orcamento === 'aguardando_aprovacao') {
      alertas.push({
        id: `orc-${os.id}`,
        tipo: 'orcamento',
        titulo: `OS #${os.numero} aguardando aprovação`,
        descricao: `${getClienteNome(os.cliente_id)} — ${formatarMoeda(calcularTotalGeralDeCampos(os))}`,
        severidade: 'warning',
      })
    }
    if (os.status === 'aguardando_peca') {
      alertas.push({
        id: `peca-${os.id}`,
        tipo: 'peca',
        titulo: `OS #${os.numero} aguardando peça`,
        descricao: getClienteNome(os.cliente_id),
        severidade: 'info',
      })
    }
    if (garantiaAtiva(os)) {
      alertas.push({
        id: `gar-${os.id}`,
        tipo: 'garantia',
        titulo: `Garantia ativa — OS #${os.numero}`,
        descricao: `Vence em ${os.data_vencimento_garantia} — ${getClienteNome(os.cliente_id)}`,
        severidade: 'success',
      })
    }
  }

  for (const peca of pecas.filter((p) => p.quantidade <= p.estoque_minimo)) {
    alertas.push({
      id: `est-${peca.id}`,
      tipo: 'estoque',
      titulo: `Estoque baixo: ${peca.nome}`,
      descricao: `${peca.quantidade} un. (mínimo ${peca.estoque_minimo})`,
      severidade: 'warning',
    })
  }

  return alertas
}

export function filtrarPorOffice<T extends { oficina_id: string; office_id?: string }>(
  items: T[],
  officeId: string
): T[] {
  return items.filter((item) => (item.office_id ?? item.oficina_id) === officeId)
}
