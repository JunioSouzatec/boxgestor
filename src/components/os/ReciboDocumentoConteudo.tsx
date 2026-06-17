import type { ReactNode } from 'react'
import { LogoOficinaDocumento } from '@/components/os/LogoOficinaDocumento'
import {
  formatarLinhaHistoricoRecibo,
  type ReciboDocumentoViewModel,
} from '@/lib/recibo-documento'
import './os-documento.css'

interface ReciboDocumentoConteudoProps {
  dados: ReciboDocumentoViewModel
}

function Campo({ label, valor }: { label: string; valor: string }) {
  return (
    <p className="os-documento-campo">
      <span className="os-documento-campo-texto-inline">
        {label}: {valor}
      </span>
    </p>
  )
}

function Secao({ titulo, children, inteira }: { titulo: string; children: ReactNode; inteira?: boolean }) {
  return (
    <section
      data-pdf-bloco={inteira ? 'secao-inteira' : undefined}
      data-pdf-inteira={inteira ? '1' : undefined}
      className={`os-documento-secao${inteira ? ' os-documento-secao-inteira' : ''}`}
    >
      <h3 className="os-documento-secao-titulo">{titulo}</h3>
      {children}
    </section>
  )
}

export function ReciboDocumentoConteudo({ dados }: ReciboDocumentoConteudoProps) {
  const {
    titulo,
    textoRodape,
    oficina,
    os,
    cliente,
    moto,
    financeiro,
    pagamentoAtual,
    historicoPagamentos,
    totais,
    servicosResumo,
    pecasItens,
    assinaturas,
  } = dados

  return (
    <article className="os-documento os-documento-compact">
      <header className="os-documento-header" data-pdf-bloco="header">
        <div className="os-documento-header-esq">
          <LogoOficinaDocumento logoUrl={oficina.logoUrl} nome={oficina.nome} tamanho="md" />
          <div className="os-documento-header-info">
            <h1 className="os-documento-nome">{oficina.nome}</h1>
            {oficina.nomeFantasia && (
              <p className="os-documento-fantasia">{oficina.nomeFantasia}</p>
            )}
            {oficina.cnpj && <p className="os-documento-meta">CNPJ: {oficina.cnpj}</p>}
            {oficina.enderecoLinhas.map((linha) => (
              <p key={linha} className="os-documento-meta">
                {linha}
              </p>
            ))}
          </div>
        </div>
        <div className="os-documento-os-box">
          <p className="os-documento-os-num">{titulo}</p>
          <p className="os-documento-os-sub">OS #{os.numero}</p>
          <p className="os-documento-os-sub">Data: {pagamentoAtual.data}</p>
        </div>
      </header>

      <Secao titulo="Recebemos de">
        <Campo label="Cliente" valor={cliente.nome} />
        <Campo label="Moto" valor={`${moto.marca} ${moto.modelo} — Placa ${moto.placa}`} />
      </Secao>

      <Secao titulo="Informações financeiras" inteira>
        <div className="os-documento-valores">
          <div className="os-documento-valores-linha">
            <span>Valor total da OS</span>
            <span>{financeiro.valorTotalOs}</span>
          </div>
          <div className="os-documento-valores-linha">
            <span>Valor pago neste recibo</span>
            <span>{financeiro.valorPagoNesteRecibo}</span>
          </div>
          <div className="os-documento-valores-linha">
            <span>Total já pago</span>
            <span>{financeiro.totalJaPago}</span>
          </div>
          <div className="os-documento-valores-linha">
            <span>Saldo restante</span>
            <span>{financeiro.saldoRestante}</span>
          </div>
          <div className="os-documento-valores-linha">
            <span>Status</span>
            <span>{dados.statusFinanceiroLabel}</span>
          </div>
        </div>
      </Secao>

      <Secao titulo="Pagamento deste recibo">
        <div className="os-documento-valores">
          <div className="os-documento-valores-linha">
            <span>Forma de pagamento</span>
            <span>{pagamentoAtual.forma}</span>
          </div>
          {pagamentoAtual.parcelamento && (
            <div className="os-documento-valores-linha">
              <span>Parcelamento</span>
              <span>{pagamentoAtual.parcelamento}</span>
            </div>
          )}
          {pagamentoAtual.pagamentoAvista && (
            <div className="os-documento-valores-linha">
              <span>Pagamento</span>
              <span>{pagamentoAtual.pagamentoAvista}</span>
            </div>
          )}
          <div className="os-documento-valores-linha">
            <span>Data do pagamento</span>
            <span>{pagamentoAtual.data}</span>
          </div>
        </div>
        {pagamentoAtual.observacao && (
          <p className="os-documento-texto os-documento-obs">
            Observação: {pagamentoAtual.observacao}
          </p>
        )}
      </Secao>

      {historicoPagamentos.length > 0 && (
        <Secao titulo="Histórico de pagamentos">
          <ul className="os-documento-lista-recibo">
            {historicoPagamentos.map((item, index) => (
              <li key={`${item.data}-${item.valor}-${index}`}>
                {formatarLinhaHistoricoRecibo(item)}
                {item.detalhe && item.observacao && (
                  <span className="os-documento-lista-obs">Obs.: {item.observacao}</span>
                )}
              </li>
            ))}
          </ul>
        </Secao>
      )}

      <Secao titulo="Composição da OS">
        {(pecasItens?.length ?? 0) > 0 && (
          <div className="os-documento-subsecao">
            <p className="os-documento-subsecao-titulo">Peças/produtos</p>
            <ul className="os-documento-lista-recibo">
              {pecasItens.map((item, index) => (
                <li key={index}>
                  {item.linha}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="os-documento-valores">
          <div className="os-documento-valores-linha">
            <span>Total serviços (mão de obra)</span>
            <span>{totais.servicos}</span>
          </div>
          <div className="os-documento-valores-linha">
            <span>Total peças/produtos</span>
            <span>{totais.pecas}</span>
          </div>
          {totais.temAdicional && (
            <div className="os-documento-valores-linha">
              <span>Valores adicionais</span>
              <span>{totais.adicional}</span>
            </div>
          )}
          <div className="os-documento-valores-linha">
            <span>Desconto</span>
            <span>{totais.desconto}</span>
          </div>
        </div>
      </Secao>

      <Secao titulo="Referente a">
        <p className="os-documento-texto">{servicosResumo}</p>
      </Secao>

      <div className="os-documento-declaracao-final">
        <p className="os-documento-texto os-documento-declaracao-texto">{textoRodape}</p>
      </div>

      <div
        className="os-documento-assinaturas-bloco"
        data-pdf-bloco="assinaturas"
        data-pdf-inteira="1"
      >
        <table className="os-documento-assinaturas-tabela">
          <tbody>
            <tr>
              <td>
                <div className="os-documento-assinatura-traco" aria-hidden="true" />
                <div className="os-documento-assinatura-nome">{assinaturas.clienteNome}</div>
                <p className="os-documento-assinatura-legenda">Assinatura do cliente</p>
              </td>
              <td>
                <div className="os-documento-assinatura-traco" aria-hidden="true" />
                <div className="os-documento-assinatura-nome">{assinaturas.oficinaNome}</div>
                <p className="os-documento-assinatura-legenda">Assinatura da oficina</p>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </article>
  )
}
