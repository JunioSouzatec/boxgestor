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
    <p className="os-documento-campo">
      <strong>{label}</strong>
      {valor}
    </p>
  )
}

function Secao({ titulo, children, className }: { titulo: string; children: ReactNode; className?: string }) {
  return (
    <section className={className ? `os-documento-secao ${className}` : 'os-documento-secao'}>
      <h3 className="os-documento-secao-titulo">{titulo}</h3>
      {children}
    </section>
  )
}

export function OsDocumentoConteudo({ dados }: OsDocumentoConteudoProps) {
  const { oficina, os, cliente, moto, servico, valores, garantia, assinaturas } = dados

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
          <p className="os-documento-os-num">OS #{os.numero}</p>
          <p className="os-documento-os-sub">Data de entrada: {os.entrada}</p>
          <p className="os-documento-os-sub">
            Previsão de entrega: {os.previsao ?? '—'}
          </p>
          <p className="os-documento-os-sub">Data de saída: {os.saida ?? '—'}</p>
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
          <Campo label="Ano" valor={String(moto.ano)} />
          <Campo label="Placa" valor={moto.placa} />
          <Campo label="Cor" valor={moto.cor} />
          <Campo label="KM entrada" valor={moto.kmEntrada} />
          <Campo label="KM saída" valor={moto.kmSaida} />
          <Campo label="Chassi" valor={moto.chassi} />
        </div>
      </Secao>

      <Secao titulo="Serviço">
        <p className="os-documento-campo">
          <strong>Defeito relatado</strong>
        </p>
        <p className="os-documento-texto">{servico.defeito}</p>

        {servico.diagnostico && (
          <>
            <p className="os-documento-campo" style={{ marginTop: 8 }}>
              <strong>Diagnóstico</strong>
            </p>
            <p className="os-documento-texto">{servico.diagnostico}</p>
          </>
        )}

        {servico.servicos.length > 0 && (
          <>
            <p className="os-documento-campo" style={{ marginTop: 8 }}>
              <strong>Serviços executados</strong>
            </p>
            <table className="os-documento-tabela">
              <thead>
                <tr>
                  <th>Serviço</th>
                  <th className="num">Mão de obra</th>
                </tr>
              </thead>
              <tbody>
                {servico.servicos.map((s, i) => (
                  <tr key={`${s.nome}-${i}`}>
                    <td>
                      {s.nome}
                      {s.descricao ? ` — ${s.descricao}` : ''}
                    </td>
                    <td className="num">{s.maoObra}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {!servico.servicos.length && servico.executados && (
          <>
            <p className="os-documento-campo" style={{ marginTop: 8 }}>
              <strong>Serviços executados</strong>
            </p>
            <p className="os-documento-texto">{servico.executados}</p>
          </>
        )}

        {servico.checklist.length > 0 && (
          <>
            <p className="os-documento-campo" style={{ marginTop: 10 }}>
              <strong>Checklist de entrada</strong>
            </p>
            <table className="os-documento-tabela">
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
                  <tr key={`${item.categoria}-${item.item}`}>
                    <td>{item.categoria}</td>
                    <td>{item.item}</td>
                    <td>{item.resposta}</td>
                    <td>{item.observacao ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {servico.checklistObservacoes && (
          <p className="os-documento-texto" style={{ marginTop: 6 }}>
            <strong>Obs. checklist:</strong> {servico.checklistObservacoes}
          </p>
        )}

        {servico.pecas.length > 0 && (
          <>
            <p className="os-documento-campo" style={{ marginTop: 10 }}>
              <strong>Peças/produtos utilizados</strong>
            </p>
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
                  <tr key={`${p.nome}-${i}`}>
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
            <p className="os-documento-campo" style={{ marginTop: 6, textAlign: 'right' }}>
              <strong>Total peças/produtos:</strong> {valores.pecas}
            </p>
          </>
        )}

        {servico.fotos.length > 0 && (
          <>
            <p className="os-documento-campo" style={{ marginTop: 10 }}>
              <strong>Fotos antes/depois</strong>
            </p>
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
          </>
        )}
      </Secao>

      <Secao titulo="Valores" className="os-documento-secao-inteira">
        <div className="os-documento-valores">
          <div className="os-documento-valores-linha">
            <span>Peças/produtos</span>
            <span>{valores.pecas}</span>
          </div>
          <div className="os-documento-valores-linha">
            <span>Mão de obra</span>
            <span>{valores.maoObra}</span>
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
            <span>Total</span>
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
                <div key={`${item.forma}-${index}`} style={{ marginTop: index === 0 ? 8 : 12 }}>
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
                  <div className="os-documento-valores-linha">
                    <span>Total</span>
                    <span>{item.total}</span>
                  </div>
                </div>
              ))}
              <div className="os-documento-valores-linha" style={{ marginTop: 8 }}>
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
            <p className="os-documento-texto" style={{ marginTop: 6 }}>
              {garantia.observacoes}
            </p>
          )}
        </Secao>
      )}

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

      <footer className="os-documento-rodape">
        Declaro estar ciente dos serviços descritos nesta Ordem de Serviço e autorizo a execução
        conforme orçamento aprovado.
      </footer>
    </article>
  )
}
