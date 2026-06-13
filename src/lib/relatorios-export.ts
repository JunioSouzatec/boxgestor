import { formatarMoeda } from '@/lib/utils'
import type { gerarRelatoriosCompletos } from '@/services/relatorios.service'

type RelatoriosCompletos = ReturnType<typeof gerarRelatoriosCompletos>

function linhaCsv(cols: (string | number)[]): string {
  return cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')
}

export function exportarRelatorioCsv(relatorios: RelatoriosCompletos): void {
  const { intervalo, faturamento, os, clientes, motos, estoque, financeiro } = relatorios
  const linhas: string[] = [
    linhaCsv(['Craft — Relatórios', intervalo.label, `${intervalo.inicio} a ${intervalo.fim}`]),
    '',
    linhaCsv(['Faturamento']),
    linhaCsv(['Receitas', formatarMoeda(faturamento.receitas)]),
    linhaCsv(['Despesas', formatarMoeda(faturamento.despesas)]),
    linhaCsv(['Lucro estimado', formatarMoeda(faturamento.lucro)]),
    '',
    linhaCsv(['Ordens de Serviço']),
    linhaCsv(['Abertas', os.abertas]),
    linhaCsv(['Finalizadas', os.finalizadas]),
    linhaCsv(['Canceladas', os.canceladas]),
    linhaCsv(['Ticket médio', formatarMoeda(os.ticketMedio)]),
    '',
    linhaCsv(['Clientes — Top gastos', 'Valor', 'Visitas']),
    ...clientes.topGastos.map((c) => linhaCsv([c.nome, formatarMoeda(c.valorTotal), c.quantidade])),
    '',
    linhaCsv(['Motos — Mais serviços', 'Serviços', 'Valor']),
    ...motos.maisServicos.map((m) =>
      linhaCsv([m.label, m.servicos, formatarMoeda(m.valorTotal)])
    ),
    '',
    linhaCsv(['Estoque — Valor total', formatarMoeda(estoque.valorTotalEstoque)]),
    linhaCsv(['Financeiro — A receber', formatarMoeda(financeiro.totalReceber)]),
    linhaCsv(['Financeiro — A pagar', formatarMoeda(financeiro.totalPagar)]),
  ]

  const blob = new Blob(['\uFEFF' + linhas.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `craft-relatorio-${intervalo.inicio}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export function exportarRelatorioPdf(relatorios: RelatoriosCompletos): void {
  const { intervalo, faturamento, os, financeiro } = relatorios
  const conteudo = [
    'CRAFT — RELATÓRIO DA OFICINA',
    `Período: ${intervalo.label} (${intervalo.inicio} a ${intervalo.fim})`,
    '',
    'FATURAMENTO',
    `Receitas: ${formatarMoeda(faturamento.receitas)}`,
    `Despesas: ${formatarMoeda(faturamento.despesas)}`,
    `Lucro estimado: ${formatarMoeda(faturamento.lucro)}`,
    '',
    'ORDENS DE SERVIÇO',
    `Abertas: ${os.abertas} | Finalizadas: ${os.finalizadas} | Canceladas: ${os.canceladas}`,
    `Ticket médio: ${formatarMoeda(os.ticketMedio)}`,
    '',
    'FINANCEIRO',
    `Contas a receber: ${formatarMoeda(financeiro.totalReceber)}`,
    `Contas a pagar: ${formatarMoeda(financeiro.totalPagar)}`,
    '',
    '— Exportação simulada. Integração PDF completa em versão futura.',
  ].join('\n')

  const blob = new Blob([conteudo], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `craft-relatorio-${intervalo.inicio}.txt`
  a.click()
  URL.revokeObjectURL(url)
}
