import type { ReactNode } from 'react'
import { LogoOficinaDocumento } from '@/components/os/LogoOficinaDocumento'
import type { ReciboDocumentoViewModel } from '@/lib/recibo-documento'
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

function Secao({
  titulo,
  children,
  inteira,
  className,
  pdfBloco,
  pdfAlturaMinima,
}: {
  titulo: string
  children: ReactNode
  inteira?: boolean
  className?: string
  pdfBloco?: string
  pdfAlturaMinima?: number
}) {
  return (
    <section
      data-pdf-bloco={pdfBloco ?? (inteira ? 'secao-inteira' : undefined)}
      data-pdf-inteira={inteira ? '1' : undefined}
      data-pdf-altura-minima={pdfAlturaMinima}
      className={`os-documento-secao pdf-section-avoid-break${inteira ? ' os-documento-secao-inteira' : ''}${className ? ` ${className}` : ''}`}
    >
      <h3 className="os-documento-secao-titulo">{titulo}</h3>
      {children}
    </section>
  )
}

export function ReciboDocumentoConteudo({ dados }: ReciboDocumentoConteudoProps) {
  const {
    titulo,
    tipoRecibo,
    textoRodape,
    oficina,
    os,
    cliente,
    moto,
    financeiro,
    pagamentoAtual,
    historicoPagamentos,
    totais,
    servicosTexto,
    pecasItens,
    assinaturas,
    statusFinanceiroLabel,
  } = dados

  const ehQuitacao = tipoRecibo === 'quitacao'

  return (
    <article className="pdf-document os-documento os-documento-compact os-documento-recibo">
      <header className="os-documento-header os-documento-recibo-header pdf-header" data-pdf-bloco="header">
        <table className="os-documento-header-tabela">
          <tbody>
            <tr>
              <td className="os-documento-header-esq">
                <table className="os-documento-header-inner">
                  <tbody>
                    <tr>
                      <td className="os-documento-header-logo">
                        <LogoOficinaDocumento
                          logoUrl={oficina.logoUrl}
                          nome={oficina.nome}
                          tamanho="md"
                        />
                      </td>
                      <td className="os-documento-header-info">
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
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
              <td className="os-documento-os-box os-documento-recibo-titulo-box">
                <p className="os-documento-os-num os-documento-recibo-titulo">{titulo}</p>
                <p className="os-documento-os-sub">OS #{os.numero}</p>
                <p className="os-documento-os-sub">Data: {pagamentoAtual.data}</p>
              </td>
            </tr>
          </tbody>
        </table>
      </header>

      <div className="os-documento-recibo-corpo">
      <Secao titulo="Recebemos de">
        <Campo label="Cliente" valor={cliente.nome} />
        <Campo label="Moto" valor={`${moto.marca} ${moto.modelo} — Placa ${moto.placa}`} />
      </Secao>

      <Secao titulo="Composição da OS">
        <div className="os-documento-subsecao">
          <p className="os-documento-subsecao-titulo">Serviços executados</p>
          {servicosTexto ? (
            <p className="os-documento-texto-linha">
              Serviços referentes à OS: {servicosTexto}
            </p>
          ) : (
            <p className="os-documento-texto-linha">—</p>
          )}
        </div>

        {(pecasItens?.length ?? 0) > 0 && (
          <div className="os-documento-subsecao">
            <p className="os-documento-subsecao-titulo">Peças/produtos</p>
            <ul className="os-documento-lista-recibo">
              {pecasItens.map((item, index) => (
                <li key={index}>{item.linha}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="os-documento-valores os-documento-valores-composicao">
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

      <Secao titulo="Informações financeiras" inteira>
        <div className="os-documento-valores">
          <div className="os-documento-valores-linha">
            <span>Valor total da OS</span>
            <span>{financeiro.valorTotalOs}</span>
          </div>
          {!ehQuitacao && (
            <div className="os-documento-valores-linha">
              <span>Valor pago neste recibo</span>
              <span>{financeiro.valorPagoNesteRecibo}</span>
            </div>
          )}
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
            <span>{statusFinanceiroLabel}</span>
          </div>
        </div>
      </Secao>

      {!ehQuitacao && (
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
            <div className="os-documento-valores-linha">
              <span>Valor</span>
              <span>{financeiro.valorPagoNesteRecibo}</span>
            </div>
          </div>
          {pagamentoAtual.observacao && (
            <p className="os-documento-texto os-documento-obs">
              Observação: {pagamentoAtual.observacao}
            </p>
          )}
        </Secao>
      )}

      {ehQuitacao && historicoPagamentos.length > 0 && (
        <Secao
          titulo="Pagamentos que compõem esta quitação"
          inteira
          pdfBloco="pagamentos-recibo"
          pdfAlturaMinima={118}
          className="pdf-payment-section"
        >
          <table className="os-documento-tabela os-documento-tabela-pagamentos">
            <thead>
              <tr>
                <th>Data</th>
                <th>Forma de pagamento</th>
                <th>Parcelamento</th>
                <th className="num">Valor</th>
                <th>Observação</th>
              </tr>
            </thead>
            <tbody>
              {historicoPagamentos.map((item, index) => (
                <tr key={`${item.data}-${item.valor}-${index}`}>
                  <td>{item.data}</td>
                  <td>{item.forma}</td>
                  <td>{item.parcelamento}</td>
                  <td className="num">{item.valor}</td>
                  <td>{item.observacao}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Secao>
      )}

      </div>

      <div
        className="os-documento-fechamento os-documento-recibo-fechamento pdf-signature-section pdf-signatures"
        data-pdf-bloco="fechamento-recibo"
        data-pdf-inteira="1"
        data-pdf-altura-minima="130"
      >
        <div className="os-documento-declaracao-final">
          <p className="os-documento-texto os-documento-declaracao-texto">{textoRodape}</p>
        </div>

        <div className="os-documento-assinaturas-bloco">
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
      </div>
    </article>
  )
}
