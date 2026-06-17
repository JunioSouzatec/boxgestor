import type { ReactNode } from 'react'
import './os-documento.css'
import { LogoOficinaDocumento } from '@/components/os/LogoOficinaDocumento'
import type { OsDocumentoViewModel } from '@/lib/os-documento'

interface OsDocumentoConteudoProps {
  dados: OsDocumentoViewModel
}

function Campo({ label, valor }: { label: string; valor?: string | null }) {
  if (!valor) return null
  return (
    <div className="os-documento-campo">
      <span className="os-documento-campo-label">{label}:</span>
      <span className="os-documento-campo-valor">{valor}</span>
    </div>
  )
}

function Secao({
  titulo,
  children,
  inteira,
  id,
}: {
  titulo: string
  children: ReactNode
  inteira?: boolean
  id?: string
}) {
  return (
    <section
      id={id}
      data-pdf-bloco="secao"
      data-pdf-inteira={inteira ? '1' : undefined}
      className={`os-documento-secao${inteira ? ' os-documento-secao-inteira' : ''}`}
    >
      <h3 className="os-documento-secao-titulo">{titulo}</h3>
      {children}
    </section>
  )
}

export function OsDocumentoConteudo({ dados }: OsDocumentoConteudoProps) {
  const { oficina, os, cliente, moto, servico, valores, garantia, assinaturas } = dados

  return (
    <article className="os-documento">
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
            {oficina.contatoLinhas.map((linha) => (
              <p key={linha} className="os-documento-meta">
                {linha}
              </p>
            ))}
          </div>
        </div>
        <div className="os-documento-os-box">
          <p className="os-documento-os-num">OS #{os.numero}</p>
          <p className="os-documento-os-sub">Entrada: {os.entrada}</p>
          <p className="os-documento-os-sub">Previsão: {os.previsao ?? '—'}</p>
          <p className="os-documento-os-sub">Saída: {os.saida ?? '—'}</p>
          <p className="os-documento-os-sub">Status: {os.status}</p>
          {os.statusOrcamento && (
            <p className="os-documento-os-sub">Orçamento: {os.statusOrcamento}</p>
          )}
          {os.responsavel && (
            <p className="os-documento-os-sub">Responsável: {os.responsavel}</p>
          )}
        </div>
      </header>

      <Secao titulo="Dados do cliente">
        <div className="os-documento-grid">
          <Campo label="Nome" valor={cliente.nome} />
          <Campo label="Telefone" valor={cliente.telefone} />
          <Campo label="WhatsApp" valor={cliente.whatsapp} />
          <Campo label="CPF" valor={cliente.cpf} />
          <Campo label="Endereço" valor={cliente.endereco} />
        </div>
      </Secao>

      <Secao titulo="Dados da moto">
        <div className="os-documento-grid">
          <Campo label="Marca" valor={moto.marca} />
          <Campo label="Modelo" valor={moto.modelo} />
          <Campo label="Ano" valor={moto.ano ? String(moto.ano) : undefined} />
          <Campo label="Placa" valor={moto.placa} />
          <Campo label="Cor" valor={moto.cor} />
          <Campo label="KM entrada" valor={moto.kmEntrada} />
          <Campo label="KM saída" valor={moto.kmSaida} />
          <Campo label="Chassi" valor={moto.chassi} />
        </div>
      </Secao>

      <Secao titulo="Serviço">
        <div className="os-documento-bloco-texto">
          <span className="os-documento-campo-label">Defeito relatado:</span>
          <p className="os-documento-texto">{servico.defeito || '—'}</p>
        </div>

        {servico.diagnostico && (
          <div className="os-documento-bloco-texto">
            <span className="os-documento-campo-label">Diagnóstico:</span>
            <p className="os-documento-texto">{servico.diagnostico}</p>
          </div>
        )}

        {servico.servicos.length > 0 && (
          <div className="os-documento-subsecao">
            <p className="os-documento-subsecao-titulo">Serviços executados</p>
            <table className="os-documento-tabela">
              <thead>
                <tr>
                  <th>Serviço</th>
                  <th className="num">Mão de obra</th>
                </tr>
              </thead>
              <tbody>
                {servico.servicos.map((s, i) => (
                  <tr key={`${s.nome}-${i}`} data-pdf-bloco="linha">
                    <td>
                      {s.nome}
                      {s.descricao ? ` — ${s.descricao}` : ''}
                    </td>
                    <td className="num">{s.maoObra}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!servico.servicos.length && servico.executados && (
          <div className="os-documento-bloco-texto">
            <span className="os-documento-campo-label">Serviços executados:</span>
            <p className="os-documento-texto">{servico.executados}</p>
          </div>
        )}

        {servico.checklist.length > 0 && (
          <div className="os-documento-subsecao">
            <p className="os-documento-subsecao-titulo">Checklist de entrada</p>
            <table className="os-documento-tabela os-documento-tabela-checklist">
              <thead>
                <tr>
                  <th>Categoria</th>
                  <th>Item</th>
                  <th>Resposta</th>
                  <th>Observação</th>
                </tr>
              </thead>
              <tbody>
                {servico.checklist.map((item) => (
                  <tr key={`${item.categoria}-${item.item}`} data-pdf-bloco="linha">
                    <td>{item.categoria}</td>
                    <td>{item.item}</td>
                    <td>{item.resposta}</td>
                    <td>{item.observacao ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {servico.checklistObservacoes && (
          <p className="os-documento-texto os-documento-obs">
            <span className="os-documento-campo-label">Obs. checklist:</span>{' '}
            {servico.checklistObservacoes}
          </p>
        )}

        {servico.fotos.length > 0 && (
          <div className="os-documento-subsecao">
            <p className="os-documento-subsecao-titulo">Fotos antes/depois</p>
            <div className="os-documento-fotos">
              {servico.fotos.map((foto, i) => (
                <div key={`${foto.url}-${i}`} className="os-documento-foto">
                  <img src={foto.url} alt={`${foto.tipo} ${i + 1}`} />
                  <div className="os-documento-foto-legenda">
                    {foto.tipo}
                    {foto.descricao ? ` — ${foto.descricao}` : ''}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Secao>

      {servico.pecas.length > 0 && (
        <Secao titulo="Peças/produtos">
          <table className="os-documento-tabela">
            <thead>
              <tr>
                <th>Peça/produto</th>
                <th className="num">Qtd</th>
                <th className="num">Unitário</th>
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {servico.pecas.map((p, i) => (
                <tr key={`${p.nome}-${i}`} data-pdf-bloco="linha">
                  <td>
                    {p.nome}
                    {p.codigo ? ` (${p.codigo})` : ''}
                    {p.observacao ? ` — ${p.observacao}` : ''}
                  </td>
                  <td className="num">{p.qtd}</td>
                  <td className="num">{p.unitario}</td>
                  <td className="num">{p.subtotal}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="os-documento-total-linha">
            <span>Total peças/produtos:</span>
            <strong>{valores.pecas}</strong>
          </p>
        </Secao>
      )}

      <Secao titulo="Valores" inteira>
        <div className="os-documento-valores">
          <div className="os-documento-valores-linha">
            <span>Total serviços (mão de obra)</span>
            <span>{valores.maoObra}</span>
          </div>
          <div className="os-documento-valores-linha">
            <span>Total peças/produtos</span>
            <span>{valores.pecas}</span>
          </div>
          {valores.temAdicional && (
            <div className="os-documento-valores-linha">
              <span>Valores adicionais</span>
              <span>{valores.adicional}</span>
            </div>
          )}
          <div className="os-documento-valores-linha">
            <span>Desconto</span>
            <span>{valores.desconto}</span>
          </div>
          <div className="os-documento-valores-total">
            <span>Total da OS</span>
            <span>{valores.total}</span>
          </div>
          <div className="os-documento-valores-linha">
            <span>Valor pago</span>
            <span>{valores.valorPago}</span>
          </div>
          <div className="os-documento-valores-linha">
            <span>Valor pendente</span>
            <span>{valores.valorPendente}</span>
          </div>
          {valores.pagamento && (
            <>
              {valores.pagamento.itens.map((item, index) => (
                <div key={`${item.forma}-${index}`} className="os-documento-pagamento-item">
                  <div className="os-documento-valores-linha">
                    <span>Forma de pagamento</span>
                    <span>{item.forma}</span>
                  </div>
                  {item.parcelamento && (
                    <div className="os-documento-valores-linha">
                      <span>Parcelamento</span>
                      <span>{item.parcelamento}</span>
                    </div>
                  )}
                  {item.pagamento && (
                    <div className="os-documento-valores-linha">
                      <span>Pagamento</span>
                      <span>{item.pagamento}</span>
                    </div>
                  )}
                </div>
              ))}
              <div className="os-documento-valores-linha">
                <span>Status pagamento</span>
                <span>{valores.pagamento.status}</span>
              </div>
            </>
          )}
        </div>
      </Secao>

      {(garantia.dias || garantia.vencimento || garantia.observacoes) && (
        <Secao titulo="Garantia">
          <div className="os-documento-grid">
            <Campo label="Dias de garantia" valor={garantia.dias} />
            <Campo label="Vencimento" valor={garantia.vencimento} />
          </div>
          {garantia.observacoes && (
            <p className="os-documento-texto os-documento-obs">{garantia.observacoes}</p>
          )}
        </Secao>
      )}

      <div className="os-documento-assinaturas" data-pdf-bloco="assinaturas" data-pdf-inteira="1">
        <div>
          <div className="os-documento-assinatura-linha">{assinaturas.clienteNome}</div>
          <p className="os-documento-assinatura-legenda">Assinatura do cliente</p>
        </div>
        <div>
          <div className="os-documento-assinatura-linha">{assinaturas.oficinaNome}</div>
          <p className="os-documento-assinatura-legenda">Assinatura da oficina</p>
        </div>
      </div>

      <footer className="os-documento-rodape" data-pdf-bloco="rodape">
        Declaro estar ciente dos serviços descritos nesta Ordem de Serviço e autorizo a execução
        conforme orçamento aprovado.
      </footer>
    </article>
  )
}
