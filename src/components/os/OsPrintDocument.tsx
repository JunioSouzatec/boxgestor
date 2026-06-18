import type { ReactNode } from 'react'
import './os-documento.css'
import { LogoOficinaDocumento } from '@/components/os/LogoOficinaDocumento'
import type { OsDocumentoViewModel } from '@/lib/os-documento'

interface OsPrintDocumentProps {
  dados: OsDocumentoViewModel
}

interface CampoItem {
  label: string
  valor?: string | null
}

function CampoCelula({ label, valor }: CampoItem) {
  if (!valor) return <td className="os-documento-campo-celula" />
  return (
    <td className="os-documento-campo-celula">
      <span className="os-documento-campo-texto">
        {label}: {valor}
      </span>
    </td>
  )
}

function TabelaCampos({ campos, colunas = 2 }: { campos: CampoItem[]; colunas?: 2 | 3 }) {
  const preenchidos = campos.filter((c) => c.valor)
  if (!preenchidos.length) return null

  const linhas: CampoItem[][] = []
  for (let i = 0; i < preenchidos.length; i += colunas) {
    linhas.push(preenchidos.slice(i, i + colunas))
  }

  return (
    <table className="os-documento-campos-tabela">
      <tbody>
        {linhas.map((linha, idx) => (
          <tr key={idx}>
            {linha.map((campo) => (
              <CampoCelula key={campo.label} label={campo.label} valor={campo.valor} />
            ))}
            {linha.length < colunas &&
              Array.from({ length: colunas - linha.length }).map((_, i) => (
                <td key={`vazio-${i}`} className="os-documento-campo-celula" />
              ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Secao({
  titulo,
  children,
  inteira,
  id,
  className,
  pdfBloco,
  pdfAlturaMinima,
}: {
  titulo: string
  children: ReactNode
  inteira?: boolean
  id?: string
  className?: string
  pdfBloco?: string
  pdfAlturaMinima?: number
}) {
  return (
    <section
      id={id}
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

function LinhaValor({ label, valor, destaque }: { label: string; valor: string; destaque?: boolean }) {
  return (
    <tr className={destaque ? 'os-documento-valores-total-linha' : undefined}>
      <td className="os-documento-valores-label">{label}</td>
      <td className="os-documento-valores-valor">{valor}</td>
    </tr>
  )
}

/** Template dedicado à impressão/PDF da Ordem de Serviço (A4). */
export function OsPrintDocument({ dados }: OsPrintDocumentProps) {
  const { oficina, os, cliente, moto, servico, valores, garantia, assinaturas, pagamentosRegistrados } =
    dados
  const mostrarChecklist = servico.checklist.length > 0

  return (
    <article className="pdf-a4 pdf-document os-documento os-documento-print">
      <header className="pdf-header os-documento-header" data-pdf-bloco="header">
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
                        {oficina.contatoLinhas.map((linha) => (
                          <p key={linha} className="os-documento-meta">
                            {linha}
                          </p>
                        ))}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
              <td className="os-documento-os-box">
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
              </td>
            </tr>
          </tbody>
        </table>
      </header>

      <Secao titulo="Dados do cliente">
        <TabelaCampos
          colunas={2}
          campos={[
            { label: 'Nome', valor: cliente.nome },
            { label: 'Telefone', valor: cliente.telefone },
            { label: 'WhatsApp', valor: cliente.whatsapp },
            { label: 'CPF', valor: cliente.cpf },
            { label: 'Endereço', valor: cliente.endereco },
          ]}
        />
      </Secao>

      <Secao titulo="Dados da moto">
        <TabelaCampos
          colunas={3}
          campos={[
            { label: 'Marca', valor: moto.marca },
            { label: 'Modelo', valor: moto.modelo },
            { label: 'Ano', valor: moto.ano ? String(moto.ano) : undefined },
            { label: 'Placa', valor: moto.placa },
            { label: 'Cor', valor: moto.cor },
            { label: 'KM entrada', valor: moto.kmEntrada },
            { label: 'KM saída', valor: moto.kmSaida },
            { label: 'Chassi', valor: moto.chassi },
          ]}
        />
      </Secao>

      <Secao titulo="Serviço">
        <p className="os-documento-texto-linha">
          <strong>Defeito relatado:</strong> {servico.defeito || '—'}
        </p>

        {servico.diagnostico && (
          <p className="os-documento-texto-linha">
            <strong>Diagnóstico:</strong> {servico.diagnostico}
          </p>
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
          </div>
        )}

        {!servico.servicos.length && servico.executados && (
          <p className="os-documento-texto-linha">
            <strong>Serviços executados:</strong> {servico.executados}
          </p>
        )}
      </Secao>

      {mostrarChecklist && (
        <div
          className="os-documento-secao os-documento-secao-inteira"
          data-pdf-bloco="checklist"
          data-pdf-inteira="1"
        >
          <h3 className="os-documento-secao-titulo">Checklist de entrada</h3>
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
                <tr key={`${item.categoria}-${item.item}`}>
                  <td>{item.categoria}</td>
                  <td>{item.item}</td>
                  <td>{item.resposta}</td>
                  <td>{item.observacao ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {servico.checklistObservacoes && (
            <p className="os-documento-texto os-documento-obs">
              <strong>Obs. checklist:</strong> {servico.checklistObservacoes}
            </p>
          )}
        </div>
      )}

      {servico.fotos.length > 0 && (
        <Secao titulo="Fotos antes/depois">
          <table className="os-documento-fotos-tabela">
            <tbody>
              {Array.from({ length: Math.ceil(servico.fotos.length / 3) }).map((_, rowIdx) => (
                <tr key={rowIdx}>
                  {servico.fotos.slice(rowIdx * 3, rowIdx * 3 + 3).map((foto, i) => (
                    <td key={`${foto.url}-${i}`} className="os-documento-foto-celula">
                      <div className="os-documento-foto">
                        <img src={foto.url} alt={`${foto.tipo} ${rowIdx * 3 + i + 1}`} />
                        <div className="os-documento-foto-legenda">
                          {foto.tipo}
                          {foto.descricao ? ` — ${foto.descricao}` : ''}
                        </div>
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Secao>
      )}

      {servico.pecas.length > 0 && (
        <Secao titulo="Peças/produtos">
          <table className="os-documento-tabela">
            <thead>
              <tr>
                <th>Peça/produto</th>
              </tr>
            </thead>
            <tbody>
              {servico.pecas.map((p, i) => (
                <tr key={`${p.nome}-${i}`}>
                  <td>{p.linha}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Secao>
      )}

      <Secao titulo="Valores" inteira>
        <table className="pdf-values os-documento-valores-tabela">
          <tbody>
            <LinhaValor label="Total serviços (mão de obra)" valor={valores.maoObra} />
            <LinhaValor label="Total peças/produtos" valor={valores.pecas} />
            {valores.temAdicional && (
              <LinhaValor label="Valores adicionais" valor={valores.adicional} />
            )}
            <LinhaValor label="Desconto" valor={valores.desconto} />
            <LinhaValor label="Total da OS" valor={valores.total} destaque />
            <LinhaValor label="Valor pago" valor={valores.valorPago} />
            <LinhaValor label="Valor pendente" valor={valores.valorPendente} />
            {valores.pagamento && (
              <LinhaValor label="Status pagamento" valor={valores.pagamento.status} />
            )}
          </tbody>
        </table>
      </Secao>

      {pagamentosRegistrados.length > 0 && (
        <Secao
          titulo="Pagamentos registrados"
          inteira
          pdfBloco="pagamentos"
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
              {pagamentosRegistrados.map((item, index) => (
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

      {(garantia.dias || garantia.vencimento || garantia.observacoes) && (
        <Secao titulo="Garantia" className="pdf-section-avoid-break">
          <TabelaCampos
            colunas={2}
            campos={[
              { label: 'Dias de garantia', valor: garantia.dias },
              { label: 'Vencimento', valor: garantia.vencimento },
            ]}
          />
          {garantia.observacoes && (
            <p className="os-documento-texto os-documento-obs">{garantia.observacoes}</p>
          )}
        </Secao>
      )}

      <div
        className="os-documento-fechamento pdf-signature-section"
        data-pdf-bloco="fechamento-os"
        data-pdf-inteira="1"
        data-pdf-altura-minima="140"
      >
        <div className="os-documento-declaracao-final os-documento-declaracao-os">
          <p className="os-documento-texto os-documento-declaracao-texto">
            Declaro estar ciente dos serviços descritos nesta Ordem de Serviço e autorizo a execução
            conforme orçamento aprovado.
          </p>
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
