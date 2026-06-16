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

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="os-documento-secao">
      <h3 className="os-documento-secao-titulo">{titulo}</h3>
      {children}
    </section>
  )
}

function LinhaResumo({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="os-documento-valores-linha">
      <span>{label}</span>
      <span>{valor}</span>
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
    <article className="os-documento">
      <header className="os-documento-header">
        <div className="os-documento-header-esq">
          <LogoOficinaDocumento logoUrl={dados.logoUrl} nome={dados.nomeOficina} tamanho="lg" />
          <div>
            <h1 className="os-documento-nome">{dados.nomeOficina}</h1>
            <p className="os-documento-meta">Relatório da oficina</p>
            <p className="os-documento-meta">
              Período: {dados.periodoLabel} ({formatarData(dados.periodoInicio)} —{' '}
              {formatarData(dados.periodoFim)})
            </p>
            <p className="os-documento-meta">Emitido em: {dados.emitidoEm}</p>
          </div>
        </div>
        <div className="os-documento-os-box">
          <p className="os-documento-os-num">Relatório</p>
          <p className="os-documento-os-sub">BoxGestor</p>
        </div>
      </header>

      <Secao titulo="Resumo financeiro">
        <div className="os-documento-valores">
          <LinhaResumo label="Receitas" valor={formatarMoeda(faturamento.receitas)} />
          <LinhaResumo label="Despesas" valor={formatarMoeda(faturamento.despesas)} />
          <div className="os-documento-valores-total">
            <span>Lucro estimado</span>
            <span>{formatarMoeda(faturamento.lucro)}</span>
          </div>
        </div>
      </Secao>

      <Secao titulo="Ordens de serviço">
        <div className="os-documento-grid">
          <p className="os-documento-campo">
            <strong>Abertas</strong>
            {os.abertas}
          </p>
          <p className="os-documento-campo">
            <strong>Finalizadas</strong>
            {os.finalizadas}
          </p>
          <p className="os-documento-campo">
            <strong>Canceladas</strong>
            {os.canceladas}
          </p>
          <p className="os-documento-campo">
            <strong>Ticket médio</strong>
            {formatarMoeda(os.ticketMedio)}
          </p>
        </div>
      </Secao>

      <Secao titulo="Contas a receber e a pagar">
        <div className="os-documento-valores">
          <LinhaResumo label="Contas a receber" valor={formatarMoeda(financeiro.totalReceber)} />
          <LinhaResumo label="Contas a pagar" valor={formatarMoeda(financeiro.totalPagar)} />
        </div>
      </Secao>

      <Secao titulo="Serviços mais executados">
        <TabelaSimples
          colunas={['Serviço', 'Quantidade']}
          linhas={servicosCatalogo.maisExecutados.slice(0, 10).map((s) => [
            s.nome,
            String(s.quantidade),
          ])}
        />
      </Secao>

      <Secao titulo="Clientes mais frequentes">
        <TabelaSimples
          colunas={['Cliente', 'Visitas', 'Total']}
          linhas={clientes.topFrequentes.slice(0, 10).map((c) => [
            c.nome,
            String(c.quantidade),
            formatarMoeda(c.valorTotal),
          ])}
        />
      </Secao>

      <footer className="os-documento-rodape">Gerado pelo BoxGestor</footer>
    </article>
  )
}
