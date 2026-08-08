/**
 * Detalhe de preparação fiscal F4A — somente leitura/validação.
 */
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatarMoeda, formatarData } from '@/lib/utils'
import type { PreparacaoNotaFiscal } from '@/types/fiscal-preparacao'
import { obterDadosFiscaisOficina } from '@/types/fiscal'
import type { ConfiguracaoOficina } from '@/types/oficina'
import { labelRegimeTributarioFiscal } from '@/services/fiscal/fiscal-format.helpers'
import { Loader2 } from 'lucide-react'

/** Aviso geral / pendência de atenção — âmbar legível em claro e escuro. */
const CLASSE_AVISO_AMBAR =
  'rounded-md border border-amber-600/50 bg-amber-100 px-3 py-2 text-xs text-amber-950 dark:border-amber-400/70 dark:bg-amber-950/70 dark:text-amber-50'

/** Pendência crítica — vermelho legível em claro e escuro. */
const CLASSE_PENDENCIA_CRITICA =
  'rounded-md border border-red-600/50 bg-red-100 px-3 py-2 text-xs text-red-950 dark:border-red-400/70 dark:bg-red-950/70 dark:text-red-50'

interface PreparacaoNotaDetalheProps {
  aberto: boolean
  onFechar: () => void
  preparacao: PreparacaoNotaFiscal | null
  configuracao?: ConfiguracaoOficina | null
  /** F4B — salvar/atualizar rascunho (sem emissão). */
  onSalvarRascunho?: () => void | Promise<void>
  salvandoRascunho?: boolean
  mensagemRascunho?: string | null
  jaTemRascunho?: boolean
  /** F4C — abrir espelho de conferência (não emite). */
  onVerEspelho?: () => void
}

function BadgeStatus({ status, label }: { status: string; label: string }) {
  const ok = status === 'pronta_para_preparar'
  return (
    <Badge
      variant={ok ? 'success' : 'outline'}
      className={
        ok
          ? undefined
          : 'border-amber-600/50 bg-amber-100 text-amber-950 dark:border-amber-400/70 dark:bg-amber-950/60 dark:text-amber-50'
      }
    >
      {label}
    </Badge>
  )
}

export function PreparacaoNotaDetalhe({
  aberto,
  onFechar,
  preparacao,
  configuracao,
  onSalvarRascunho,
  salvandoRascunho,
  mensagemRascunho,
  jaTemRascunho,
  onVerEspelho,
}: PreparacaoNotaDetalheProps) {
  if (!preparacao) return null
  const oficina = obterDadosFiscaisOficina(configuracao)
  const bloqueantes = preparacao.pendencias.filter((p) => p.severidade === 'bloqueante')
  const avisosPend = preparacao.pendencias.filter((p) => p.severidade === 'aviso')

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="pr-8">Preparação — {preparacao.origem_label}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm text-foreground">
          <div className="flex flex-wrap items-center gap-2">
            <BadgeStatus status={preparacao.status} label={preparacao.status_label} />
            <Badge variant="outline" className="border-border text-muted-foreground">
              Emissão não ativa
            </Badge>
          </div>

          <p className={`${CLASSE_AVISO_AMBAR} sm:text-sm`}>
            Esta tela ainda não emite nota fiscal. Ela apenas valida dados da oficina, cliente e
            itens para preparação futura. Revise as configurações fiscais iniciais com o
            contador. No dia a dia, use esta tela para conferência interna — a emissão ainda
            não está ativa.
          </p>

          <div className="grid gap-2 sm:grid-cols-2 rounded-lg border border-border bg-card/40 p-3">
            <div>
              <p className="text-muted-foreground">Cliente</p>
              <p className="font-medium">{preparacao.cliente_nome || '—'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Data</p>
              <p className="font-medium">
                {preparacao.data ? formatarData(preparacao.data) : '—'}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Valor</p>
              <p className="font-medium">{formatarMoeda(preparacao.valor_total)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Status financeiro</p>
              <p className="font-medium">{preparacao.status_financeiro_label}</p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-muted-foreground">Tipo sugerido (orientação)</p>
              <p className="font-medium">{preparacao.tipo_sugerido_label}</p>
            </div>
          </div>

          <section className="space-y-2">
            <h3 className="font-semibold">1. Emitente / Oficina</h3>
            <div className="rounded-md border border-border p-3 grid gap-1 sm:grid-cols-2">
              <p>
                <span className="text-muted-foreground">CNPJ: </span>
                {oficina.cnpj || '—'}
              </p>
              <p>
                <span className="text-muted-foreground">Razão social: </span>
                {oficina.razao_social || '—'}
              </p>
              <p>
                <span className="text-muted-foreground">Regime: </span>
                {labelRegimeTributarioFiscal(oficina.regime_tributario)}
              </p>
              <p>
                <span className="text-muted-foreground">Cidade/UF: </span>
                {[oficina.endereco?.cidade, oficina.endereco?.uf].filter(Boolean).join(' / ') ||
                  '—'}
              </p>
              <p className="sm:col-span-2 text-xs text-muted-foreground">
                {preparacao.oficina_ok ? 'Dados básicos da oficina OK.' : 'Oficina com pendências.'}
              </p>
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold">2. Cliente / Destinatário</h3>
            <div className="rounded-md border border-border p-3">
              {preparacao.consumidor_nao_identificado ? (
                <p>Consumidor não identificado</p>
              ) : (
                <p className="font-medium">{preparacao.cliente_nome}</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                {preparacao.cliente_ok
                  ? 'Sem pendências bloqueantes de cliente.'
                  : 'Cliente com pendências bloqueantes.'}
              </p>
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold">3. Produtos</h3>
            {preparacao.produtos.length === 0 ? (
              <p className="text-muted-foreground text-xs">Nenhum produto nesta origem.</p>
            ) : (
              <ul className="space-y-2">
                {preparacao.produtos.map((p) => (
                  <li key={p.chave} className="rounded-md border border-border p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="font-medium">{p.nome}</p>
                      <Badge variant={p.fiscal_basico_ok ? 'success' : 'outline'}>
                        {p.fiscal_basico_ok ? 'Fiscal básico OK' : 'Fiscal incompleto'}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Qtd {p.quantidade} · {formatarMoeda(p.valor_total)} · NCM {p.ncm || '—'} · Und{' '}
                      {p.unidade_fiscal || '—'} · Origem {p.origem_mercadoria || '—'}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold">4. Serviços</h3>
            {preparacao.servicos.length === 0 ? (
              <p className="text-muted-foreground text-xs">Nenhum serviço nesta origem.</p>
            ) : (
              <ul className="space-y-2">
                {preparacao.servicos.map((s) => (
                  <li key={s.chave} className="rounded-md border border-border p-3">
                    <p className="font-medium">{s.nome}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatarMoeda(s.valor)}
                      {s.codigo_servico_municipal_pendente
                        ? ' · Código municipal pendente (NFS-e futura)'
                        : ''}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold">5. Pagamento</h3>
            <div className="rounded-md border border-border p-3 grid gap-1 sm:grid-cols-2">
              <p>
                <span className="text-muted-foreground">Status: </span>
                {preparacao.status_financeiro_label}
              </p>
              <p>
                <span className="text-muted-foreground">Forma: </span>
                {preparacao.forma_pagamento || '—'}
              </p>
              <p>
                <span className="text-muted-foreground">Desconto: </span>
                {formatarMoeda(preparacao.desconto ?? 0)}
              </p>
              <p>
                <span className="text-muted-foreground">Total: </span>
                {formatarMoeda(preparacao.valor_total)}
              </p>
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold">6. Pendências</h3>
            {preparacao.pendencias.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Nenhuma pendência encontrada nos critérios básicos desta fase.
              </p>
            ) : (
              <div className="space-y-3">
                {bloqueantes.length > 0 && (
                  <ul className="space-y-1">
                    {bloqueantes.map((p) => (
                      <li key={p.id} className={CLASSE_PENDENCIA_CRITICA}>
                        {p.mensagem}
                      </li>
                    ))}
                  </ul>
                )}
                {avisosPend.length > 0 && (
                  <ul className="space-y-1">
                    {avisosPend.map((p) => (
                      <li key={p.id} className={CLASSE_AVISO_AMBAR}>
                        {p.mensagem}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold">7. Próximos passos</h3>
            <ul className="list-disc pl-5 text-xs text-muted-foreground space-y-1">
              <li>Completar dados fiscais da oficina, clientes e produtos nas telas já existentes.</li>
              <li>
                Revisar configurações fiscais iniciais (CFOP, CST/CSOSN, código municipal) com o
                contador; consulte-o em dúvidas, rejeições ou mudanças fiscais.
              </li>
              <li>A emissão, XML, DANFE e numeração virão em fases futuras — ainda não ativas.</li>
              {preparacao.avisos.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </section>

          <div className="flex flex-wrap justify-end gap-2">
            {onVerEspelho ? (
              <Button type="button" variant="secondary" onClick={onVerEspelho}>
                Ver espelho
              </Button>
            ) : null}
            {onSalvarRascunho ? (
              <Button
                onClick={() => void onSalvarRascunho()}
                disabled={Boolean(salvandoRascunho)}
              >
                {salvandoRascunho ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Salvando…
                  </>
                ) : jaTemRascunho ? (
                  'Atualizar rascunho'
                ) : (
                  'Salvar rascunho'
                )}
              </Button>
            ) : null}
            <Button variant="outline" onClick={onFechar}>
              Fechar
            </Button>
          </div>
          {mensagemRascunho ? (
            <p className={`${CLASSE_AVISO_AMBAR} sm:text-sm`}>{mensagemRascunho}</p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
