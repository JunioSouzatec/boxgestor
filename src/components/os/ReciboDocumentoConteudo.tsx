import { LogoOficinaDocumento } from '@/components/os/LogoOficinaDocumento'
import {
  formatarLinhaHistoricoRecibo,
  type ReciboDocumentoViewModel,
} from '@/lib/recibo-documento'
import './os-documento.css'

interface ReciboDocumentoConteudoProps {
  dados: ReciboDocumentoViewModel
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
      <header className="os-documento-header">
        <div className="os-documento-header-esq">
          <LogoOficinaDocumento logoUrl={oficina.logoUrl} nome={oficina.nome} tamanho="lg" />
          <div>
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
            {oficina.contatoLinhas.map((linha) => (
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

      <section className="os-documento-secao">
        <h3 className="os-documento-secao-titulo">Recebemos de</h3>
        <p className="os-documento-campo">
          <strong>Cliente:</strong> {cliente.nome}
        </p>
        <p className="os-documento-campo">
          <strong>Moto:</strong> {moto.marca} {moto.modelo} — Placa {moto.placa}
        </p>
      </section>

      <section className="os-documento-secao os-documento-secao-inteira">
        <h3 className="os-documento-secao-titulo">Informações financeiras</h3>
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
      </section>

      <section className="os-documento-secao">
        <h3 className="os-documento-secao-titulo">Pagamento deste recibo</h3>
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
            <span>Valor pago neste recibo</span>
            <span>{financeiro.valorPagoNesteRecibo}</span>
          </div>
          <div className="os-documento-valores-linha">
            <span>Data do pagamento</span>
            <span>{pagamentoAtual.data}</span>
          </div>
        </div>
        {pagamentoAtual.observacao && (
          <p className="os-documento-campo">
            <strong>Observação:</strong> {pagamentoAtual.observacao}
          </p>
        )}
      </section>

      {historicoPagamentos.length > 0 && (
        <section className="os-documento-secao">
          <h3 className="os-documento-secao-titulo">Histórico de pagamentos</h3>
          <ul className="os-documento-lista" style={{ margin: 0, padding: 0, listStyle: 'none' }}>
            {historicoPagamentos.map((item, index) => (
              <li
                key={`${item.data}-${item.valor}-${index}`}
                className="os-documento-texto"
                style={{ marginBottom: 6 }}
              >
                {formatarLinhaHistoricoRecibo(item)}
                {item.detalhe && item.observacao && (
                  <span style={{ display: 'block', fontSize: 9, color: '#71717a', marginTop: 2 }}>
                    Obs.: {item.observacao}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="os-documento-secao">
        <h3 className="os-documento-secao-titulo">Composição da OS</h3>
        {(pecasItens?.length ?? 0) > 0 && (
          <>
            <p className="os-documento-campo" style={{ marginBottom: 6 }}>
              <strong>Peças/produtos:</strong>
            </p>
            <ul className="os-documento-lista" style={{ margin: '0 0 8px', padding: 0, listStyle: 'none' }}>
              {pecasItens.map((item, index) => (
                <li key={index} className="os-documento-texto" style={{ marginBottom: 4 }}>
                  {item.linha}
                </li>
              ))}
            </ul>
          </>
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
      </section>

      <section className="os-documento-secao">
        <h3 className="os-documento-secao-titulo">Referente a</h3>
        <p className="os-documento-texto">{servicosResumo}</p>
      </section>

      <p className="os-documento-texto" style={{ marginTop: 8, fontStyle: 'italic' }}>
        {textoRodape}
      </p>

      <div className="os-documento-assinaturas">
        <div>
          <div className="os-documento-assinatura-linha">{assinaturas.clienteNome}</div>
          <p style={{ textAlign: 'center', margin: '4px 0 0', fontSize: 9, color: '#71717a' }}>
            Assinatura do cliente
          </p>
        </div>
        <div>
          <div className="os-documento-assinatura-linha">{assinaturas.oficinaNome}</div>
          <p style={{ textAlign: 'center', margin: '4px 0 0', fontSize: 9, color: '#71717a' }}>
            Assinatura da oficina
          </p>
        </div>
      </div>
    </article>
  )
}
