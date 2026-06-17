import type { ReactNode } from 'react'
import '@/components/os/os-documento.css'
import { LogoOficinaDocumento } from '@/components/os/LogoOficinaDocumento'
import { formatarMoeda, formatarData } from '@/lib/utils'
import type { gerarRelatoriosCompletos } from '@/services/relatorios.service'

type RelatoriosCompletos = ReturnType<typeof gerarRelatoriosCompletos>

export interface RelatorioDocumentoViewModel {
  nomeOficina: string
  logoUrl?: string
  periodoLabel: string
  periodoInicio: string
  periodoFim: string
  emitidoEm: string
  relatorios: RelatoriosCompletos
}

function Secao({ titulo, children, inteira }: { titulo: string; children: ReactNode; inteira?: boolean }) {
  return (
    <section
      data-pdf-bloco="secao"
      data-pdf-inteira={inteira ? '1' : undefined}
      className={`os-documento-secao relatorio-pdf-secao${inteira ? ' os-documento-secao-inteira' : ''}`}
    >
      <h3 className="os-documento-secao-titulo">{titulo}</h3>
      {children}
    </section>
  )
}

function CardResumo({ label, valor, destaque }: { label: string; valor: string; destaque?: boolean }) {
  return (
    <div className={`relatorio-pdf-card${destaque ? ' relatorio-pdf-card-destaque' : ''}`}>
      <p style={{ margin: 0, fontSize: 10, color: '#6b7280', textTransform: 'uppercase' }}>{label}</p>
      <p style={{ margin: '4px 0 0', fontSize: destaque ? 16 : 14, fontWeight: 700 }}>{valor}</p>
    </div>
  )
}

function TabelaSimples({
  colunas,
  linhas,
}: {
  colunas: string[]
  linhas: string[][]
}) {
  if (linhas.length === 0) {
    return <p className="os-documento-texto">Sem dados no período.</p>
  }
  return (
    <table className="os-documento-tabela">
      <thead>
        <tr>
          {colunas.map((c) => (
            <th key={c}>{c}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {linhas.map((linha, i) => (
          <tr key={i}>
            {linha.map((cel, j) => (
              <td key={j} className={j > 0 ? 'num' : undefined}>
                {cel}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function RelatorioDocumentoConteudo({ dados }: { dados: RelatorioDocumentoViewModel }) {
  const { relatorios } = dados
  const { faturamento, os, financeiro, clientes, servicosCatalogo } = relatorios

  return (
    <article className="os-documento relatorio-pdf">
      <header className="os-documento-header os-documento-header-compact" data-pdf-bloco="header">
        <div className="os-documento-header-esq">
          <LogoOficinaDocumento logoUrl={dados.logoUrl} nome={dados.nomeOficina} tamanho="md" />
          <div>
            <h1 className="os-documento-nome">{dados.nomeOficina}</h1>
            <p className="os-documento-meta">Relatório da oficina — BoxGestor</p>
            <p className="os-documento-meta">
              {dados.periodoLabel}: {formatarData(dados.periodoInicio)} a {formatarData(dados.periodoFim)}
            </p>
            <p className="os-documento-meta">Emitido em {dados.emitidoEm}</p>
          </div>
        </div>
      </header>

      <Secao titulo="Resumo financeiro" inteira>
        <div className="relatorio-pdf-cards">
          <CardResumo label="Receitas" valor={formatarMoeda(faturamento.receitas)} />
          <CardResumo label="Despesas" valor={formatarMoeda(faturamento.despesas)} />
          <CardResumo label="Lucro estimado" valor={formatarMoeda(faturamento.lucro)} destaque />
          <CardResumo label="Ticket médio OS" valor={formatarMoeda(os.ticketMedio)} />
        </div>
      </Secao>

      <Secao titulo="Ordens de serviço">
        <div className="relatorio-pdf-cards">
          <CardResumo label="Abertas" valor={String(os.abertas)} />
          <CardResumo label="Finalizadas" valor={String(os.finalizadas)} />
          <CardResumo label="Canceladas" valor={String(os.canceladas)} />
          <CardResumo label="Contas a receber" valor={formatarMoeda(financeiro.totalReceber)} />
          <CardResumo label="Contas a pagar" valor={formatarMoeda(financeiro.totalPagar)} />
        </div>
      </Secao>

      <Secao titulo="Serviços mais executados">
        <TabelaSimples
          colunas={['Serviço', 'Quantidade']}
          linhas={servicosCatalogo.maisExecutados.slice(0, 12).map((s) => [
            s.nome,
            String(s.quantidade),
          ])}
        />
      </Secao>

      <Secao titulo="Clientes mais frequentes">
        <TabelaSimples
          colunas={['Cliente', 'Visitas', 'Total gasto']}
          linhas={clientes.topFrequentes.slice(0, 12).map((c) => [
            c.nome,
            String(c.quantidade),
            formatarMoeda(c.valorTotal),
          ])}
        />
      </Secao>

      <footer className="os-documento-rodape" data-pdf-bloco="rodape">Gerado pelo BoxGestor</footer>
    </article>
  )
}
