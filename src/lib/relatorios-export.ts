import { exportarRelatorioPdfReal } from '@/services/relatorio-pdf.service'
import { formatarMoeda } from '@/lib/utils'
import type { gerarRelatoriosCompletos } from '@/services/relatorios.service'

type RelatoriosCompletos = ReturnType<typeof gerarRelatoriosCompletos>

function linhaCsv(cols: (string | number)[]): string {
  return cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')
}

export function exportarRelatorioCsv(
  relatorios: RelatoriosCompletos,
  nomeOficina: string,
  labelVeiculos = 'Motos'
): void {
  const { intervalo, faturamento, os, clientes, motos, estoque, financeiro } = relatorios
  const cabecalhoOficina = nomeOficina.trim() || 'Oficina'
  const linhas: string[] = [
    linhaCsv([`${cabecalhoOficina} — Relatórios`, intervalo.label, `${intervalo.inicio} a ${intervalo.fim}`]),
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
    linhaCsv([`${labelVeiculos} — Mais serviços`, 'Serviços', 'Valor']),
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
  a.download = `relatorio-${cabecalhoOficina.replace(/\s+/g, '-').toLowerCase()}-${intervalo.inicio}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export interface ExportarRelatorioPdfOpcoes {
  relatorios: RelatoriosCompletos
  nomeOficina: string
  logoUrl?: string
}

/** Gera PDF real A4 via jsPDF + html2canvas (download direto, UTF-8 correto). */
export async function exportarRelatorioPdf(opcoes: ExportarRelatorioPdfOpcoes): Promise<void> {
  await exportarRelatorioPdfReal({
    nomeOficina: opcoes.nomeOficina,
    logoUrl: opcoes.logoUrl,
    relatorios: opcoes.relatorios,
  })
}
