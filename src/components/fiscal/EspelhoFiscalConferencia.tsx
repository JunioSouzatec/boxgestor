/**
 * F4C — Modal Espelho fiscal para conferência (NÃO é nota fiscal).
 */
import { useMemo } from 'react'
import { Printer } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatarMoeda } from '@/lib/utils'
import {
  formatarCepExibicao,
  formatarCnpjExibicao,
} from '@/types/fiscal'
import { formatarCpfExibicao } from '@/types/fiscal-cliente'
import type { Cliente } from '@/types/cliente'
import type { ConfiguracaoOficina } from '@/types/oficina'
import type { Peca } from '@/types/peca'
import type { FiscalDraft } from '@/types/fiscal-draft'
import type { PreparacaoNotaFiscal } from '@/types/fiscal-preparacao'
import { labelRegimeTributarioFiscal } from '@/services/fiscal/fiscal-format.helpers'
import {
  imprimirEspelhoFiscalConferencia,
  montarEspelhoFiscalConferencia,
} from '@/services/fiscal/fiscal-espelho.service'

const CLASSE_AVISO_VERMELHO =
  'rounded-md border-2 border-red-600/70 bg-red-100 px-3 py-3 text-center text-sm font-bold text-red-950 dark:border-red-400/80 dark:bg-red-950/80 dark:text-red-50'

const CLASSE_AVISO_AMBAR =
  'rounded-md border border-amber-600/50 bg-amber-100 px-3 py-2 text-xs text-amber-950 dark:border-amber-400/70 dark:bg-amber-950/70 dark:text-amber-50'

interface EspelhoFiscalConferenciaProps {
  aberto: boolean
  onFechar: () => void
  preparacao: PreparacaoNotaFiscal | null
  configuracao?: ConfiguracaoOficina | null
  cliente?: Cliente | null
  pecas?: Peca[]
  draft?: FiscalDraft | null
  onErroImpressao?: (mensagem: string) => void
}

function enderecoCurto(end?: {
  logradouro?: string
  numero?: string
  bairro?: string
  cidade?: string
  uf?: string
  cep?: string
}): string {
  if (!end) return '—'
  const partes = [
    [end.logradouro, end.numero].filter(Boolean).join(', '),
    end.bairro,
    [end.cidade, end.uf].filter(Boolean).join('/'),
    end.cep ? `CEP ${formatarCepExibicao(end.cep)}` : '',
  ].filter(Boolean)
  return partes.length ? partes.join(' · ') : '—'
}

export function EspelhoFiscalConferencia({
  aberto,
  onFechar,
  preparacao,
  configuracao,
  cliente,
  pecas,
  draft,
  onErroImpressao,
}: EspelhoFiscalConferenciaProps) {
  const vm = useMemo(() => {
    if (!preparacao) return null
    return montarEspelhoFiscalConferencia({
      preparacao,
      configuracao,
      cliente,
      pecas,
      draft,
    })
  }, [preparacao, configuracao, cliente, pecas, draft])

  if (!preparacao || !vm) return null

  function imprimir() {
    try {
      imprimirEspelhoFiscalConferencia(vm!)
    } catch (e) {
      const msg =
        e instanceof Error && e.message.trim()
          ? e.message
          : 'Não foi possível abrir a impressão. Verifique se o navegador bloqueou pop-ups.'
      onErroImpressao?.(msg)
    }
  }

  const docCli =
    vm.cliente.fiscal.tipo_pessoa === 'juridica'
      ? formatarCnpjExibicao(vm.cliente.fiscal.cnpj) || '—'
      : formatarCpfExibicao(vm.cliente.fiscal.cpf) ||
        formatarCnpjExibicao(vm.cliente.fiscal.cnpj) ||
        '—'

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle className="pr-8">Espelho fiscal para conferência</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm text-foreground">
          <div className={CLASSE_AVISO_VERMELHO}>
            NÃO É NOTA FISCAL
            <p className="mt-1 text-xs font-semibold opacity-90">
              Documento sem validade fiscal. Use apenas para conferência antes da
              emissão.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">Emissão não ativa</Badge>
            <Badge variant="outline">{vm.origem_label}</Badge>
            {vm.rascunho_id ? (
              <Badge variant="secondary">
                Rascunho · {vm.rascunho_status} · {vm.qtd_pendencias} pendência(s)
              </Badge>
            ) : null}
          </div>

          <p className="text-xs text-muted-foreground">
            Gerado em {vm.gerado_em}
            {vm.rascunho_atualizado_em
              ? ` · Última validação do rascunho: ${vm.rascunho_atualizado_em}`
              : ''}
          </p>

          <section className="space-y-1 rounded-lg border border-border p-3">
            <h3 className="font-semibold">1. Emitente / Oficina</h3>
            <p>CNPJ: {formatarCnpjExibicao(vm.oficina.cnpj) || '—'}</p>
            <p>Razão social: {vm.oficina.razao_social || '—'}</p>
            <p>Nome fantasia: {vm.oficina.nome_fantasia || '—'}</p>
            <p>Regime: {labelRegimeTributarioFiscal(vm.oficina.regime_tributario)}</p>
            <p className="break-words">Endereço: {enderecoCurto(vm.oficina.endereco)}</p>
            <p>
              Tel./e-mail:{' '}
              {[vm.oficina.telefone_fiscal, vm.oficina.email_fiscal].filter(Boolean).join(' · ') ||
                '—'}
            </p>
          </section>

          <section className="space-y-1 rounded-lg border border-border p-3">
            <h3 className="font-semibold">2. Cliente / Destinatário</h3>
            {vm.cliente.consumidor_nao_identificado ? (
              <>
                <p className="font-medium">Consumidor não identificado</p>
                <p className="text-xs text-muted-foreground">
                  Dados do destinatário não informados.
                </p>
              </>
            ) : (
              <>
                <p className="font-medium break-words">
                  {vm.cliente.nome ||
                    vm.cliente.fiscal.razao_social ||
                    vm.cliente.fiscal.nome_fantasia ||
                    '—'}
                </p>
                <p>CPF/CNPJ: {docCli}</p>
                <p>
                  IE / indicador:{' '}
                  {vm.cliente.fiscal.inscricao_estadual || '—'} ·{' '}
                  {vm.cliente.fiscal.indicador_ie || '—'}
                </p>
                <p className="break-words">
                  Endereço: {enderecoCurto(vm.cliente.fiscal.endereco)}
                </p>
                <p>
                  Contato:{' '}
                  {[vm.cliente.fiscal.telefone_fiscal, vm.cliente.fiscal.email_fiscal]
                    .filter(Boolean)
                    .join(' · ') || '—'}
                </p>
              </>
            )}
          </section>

          <section className="space-y-1 rounded-lg border border-border p-3">
            <h3 className="font-semibold">3. Tipo sugerido</h3>
            <p className="font-medium">{vm.tipo_sugerido_label}</p>
            {vm.tipo_sugerido === 'misto_servico_produto' ? (
              <p className="text-xs text-muted-foreground">
                OS mista: serviço + produto — pode exigir documentos separados.
              </p>
            ) : null}
            <p className={CLASSE_AVISO_AMBAR}>
              Consulte o contador na configuração inicial e em caso de dúvida sobre o tipo de
              documento. No uso normal, esta prévia serve para conferência interna.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold">4. Itens / produtos</h3>
            {vm.produtos.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhum produto.</p>
            ) : (
              <ul className="space-y-2">
                {vm.produtos.map((p) => (
                  <li
                    key={p.chave}
                    className="rounded-md border border-border p-3 break-words"
                  >
                    <div className="flex flex-wrap justify-between gap-2">
                      <div className="min-w-0 space-y-0.5">
                        {p.descricao_fiscal ? (
                          <>
                            <p className="font-medium">Descrição: {p.nome}</p>
                            <p className="text-xs text-muted-foreground">
                              Descrição fiscal: {p.descricao_fiscal}
                            </p>
                          </>
                        ) : (
                          <p className="font-medium">{p.nome}</p>
                        )}
                      </div>
                      <span className="tabular-nums">{formatarMoeda(p.valor_total)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Qtd {p.quantidade} {p.unidade_fiscal || ''} · Unit.{' '}
                      {formatarMoeda(p.valor_unitario)} · NCM {p.ncm || '—'} · CFOP{' '}
                      {p.cfop_padrao_venda || '—'} · CEST {p.cest || '—'} · Origem{' '}
                      {p.origem_mercadoria || '—'} · CST/CSOSN {p.cst_csosn || '—'}
                      {p.ean ? ` · EAN ${p.ean}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold">5. Serviços</h3>
            {vm.servicos.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhum serviço.</p>
            ) : (
              <ul className="space-y-2">
                {vm.servicos.map((s) => (
                  <li key={s.chave} className="rounded-md border border-border p-3 space-y-1">
                    <div className="flex flex-wrap justify-between gap-2">
                      <div className="min-w-0 space-y-0.5">
                        {s.descricao_fiscal ? (
                          <>
                            <p className="font-medium">Descrição: {s.nome}</p>
                            <p className="text-xs text-muted-foreground">
                              Descrição fiscal: {s.descricao_fiscal}
                            </p>
                          </>
                        ) : (
                          <p className="font-medium">{s.nome}</p>
                        )}
                      </div>
                      <span className="tabular-nums">{formatarMoeda(s.valor)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Qtd {s.quantidade ?? 1} · Total {formatarMoeda(s.valor)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Cód. municipal {s.codigo_municipal_servico || '—'} · LC 116{' '}
                      {s.item_lista_servico_lc116 || '—'} · Trib. municipal{' '}
                      {s.codigo_tributacao_municipal || '—'} · CNAE {s.cnae || '—'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Município {s.municipio_prestacao_padrao || '—'} · ISS informado{' '}
                      {s.aliquota_iss_informada != null ? `${s.aliquota_iss_informada}%` : '—'} ·
                      Retido {s.iss_retido || '—'} · Exigibilidade {s.exigibilidade_iss || '—'}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            {vm.servicos.length > 0 ? (
              <p className="text-[11px] text-muted-foreground">
                Dados de serviço preparados para futura NFS-e. A emissão ainda não está ativa.
              </p>
            ) : null}
          </section>

          <section className="space-y-1 rounded-lg border border-border p-3">
            <h3 className="font-semibold">6. Pagamento</h3>
            <p>Status: {vm.pagamento.status}</p>
            <p>Forma: {vm.pagamento.forma || '—'}</p>
            <p>Subtotal: {formatarMoeda(vm.pagamento.subtotal)}</p>
            <p>Desconto: {formatarMoeda(vm.pagamento.desconto)}</p>
            <p className="font-semibold">Total: {formatarMoeda(vm.pagamento.total)}</p>
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold">7. Pendências</h3>
            {vm.pendencias_criticas.length > 0 ? (
              <ul className="space-y-1">
                {vm.pendencias_criticas.map((p) => (
                  <li
                    key={p.id}
                    className="rounded-md border border-red-600/40 bg-red-100/80 px-2 py-1.5 text-xs text-red-950 dark:bg-red-950/60 dark:text-red-50"
                  >
                    {p.mensagem}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">Nenhuma pendência crítica.</p>
            )}
            {vm.pendencias_atencao.length > 0 ? (
              <ul className="space-y-1">
                {vm.pendencias_atencao.map((p) => (
                  <li key={p.id} className={`${CLASSE_AVISO_AMBAR}`}>
                    {p.mensagem}
                  </li>
                ))}
              </ul>
            ) : null}
            {vm.pendencias_info.length > 0 ? (
              <ul className="space-y-1">
                {vm.pendencias_info.map((a) => (
                  <li
                    key={a}
                    className="rounded-md border border-border bg-muted/40 px-2 py-1.5 text-xs text-muted-foreground"
                  >
                    {a}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          <section className="space-y-1 rounded-lg border border-border p-3">
            <h3 className="font-semibold">8. Próximos passos</h3>
            <ul className="list-disc pl-5 text-xs text-muted-foreground space-y-1">
              {vm.proximos_passos.map((passo) => (
                <li key={passo}>{passo}</li>
              ))}
            </ul>
            <p className="mt-2 text-xs font-medium text-muted-foreground">
              Emissão ainda não ativa.
            </p>
          </section>

          <p className="text-center text-[11px] font-semibold text-red-700 dark:text-red-300">
            Este documento não substitui NF-e, NFC-e, NFS-e, DANFE, XML autorizado ou
            qualquer documento fiscal oficial.
          </p>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end print:hidden">
            <Button type="button" variant="outline" onClick={onFechar}>
              Fechar
            </Button>
            <Button type="button" onClick={imprimir} className="print:hidden">
              <Printer className="h-4 w-4" />
              Imprimir conferência
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
