import { LogoOficinaDocumento } from '@/components/os/LogoOficinaDocumento'
import type { ReciboDocumentoViewModel } from '@/lib/recibo-documento'
import './os-documento.css'

interface ReciboDocumentoConteudoProps {
  dados: ReciboDocumentoViewModel
}

export function ReciboDocumentoConteudo({ dados }: ReciboDocumentoConteudoProps) {
  const { oficina, os, cliente, moto, pagamento, servicosResumo, assinaturas } = dados

  return (
    <article className="os-documento">
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
          <p className="os-documento-os-num">RECIBO</p>
          <p className="os-documento-os-sub">OS #{os.numero}</p>
          <p className="os-documento-os-sub">Data: {pagamento.data}</p>
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

      <section className="os-documento-secao">
        <h3 className="os-documento-secao-titulo">Pagamento</h3>
        <div className="os-documento-valores">
          <div className="os-documento-valores-linha">
            <span>Forma de pagamento</span>
            <span>{pagamento.forma}</span>
          </div>
          {pagamento.parcelamento && (
            <div className="os-documento-valores-linha">
              <span>Parcelamento</span>
              <span>{pagamento.parcelamento}</span>
            </div>
          )}
          {pagamento.pagamentoLabel && (
            <div className="os-documento-valores-linha">
              <span>Pagamento</span>
              <span>{pagamento.pagamentoLabel}</span>
            </div>
          )}
          <div className="os-documento-valores-linha">
            <span>Total</span>
            <span>{pagamento.valor}</span>
          </div>
          <div className="os-documento-valores-linha">
            <span>Data do pagamento</span>
            <span>{pagamento.data}</span>
          </div>
        </div>
        {pagamento.observacao && (
          <p className="os-documento-campo">
            <strong>Observação:</strong> {pagamento.observacao}
          </p>
        )}
      </section>

      <section className="os-documento-secao">
        <h3 className="os-documento-secao-titulo">Referente a</h3>
        <p className="os-documento-texto">{servicosResumo}</p>
      </section>

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
