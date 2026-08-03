/**
 * Modal de drilldown do Gestor Inteligente — somente leitura.
 */
import { Link } from 'react-router-dom'
import { ExternalLink, X } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { rotaVisualizarOs } from '@/lib/rota-os'
import {
  AreaChartCard,
  DonutChartCard,
  FormasPagamentoChart,
} from '@/components/gestor-inteligente/GestorCharts'
import type { GestorDetalheView } from '@/services/gestor-detalhe.service'

export function GestorDetalheModal({
  open,
  onOpenChange,
  detalhe,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  detalhe: GestorDetalheView | null
}) {
  const vazio =
    !detalhe ||
    (detalhe.linhas.length === 0 &&
      !detalhe.faturamentoPorDia?.some((p) => p.valor > 0.009) &&
      !(detalhe.formasPagamento?.length) &&
      !(detalhe.osStatusFatias?.length))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[min(96dvh,960px)] w-[min(100vw-1rem,56rem)] max-w-4xl flex-col gap-0 overflow-hidden p-0 lg:max-w-4xl"
        aria-describedby={undefined}
      >
        <DialogHeader className="shrink-0 border-b border-border bg-gradient-to-br from-zinc-950 via-zinc-900 to-primary/20 px-4 py-4 pr-12 text-left sm:px-6">
          <DialogTitle className="text-lg text-zinc-50 sm:text-xl">
            {detalhe?.titulo ?? 'Detalhe'}
          </DialogTitle>
          {detalhe?.descricao ? (
            <DialogDescription className="text-zinc-300">
              {detalhe.descricao}
            </DialogDescription>
          ) : (
            <DialogDescription className="sr-only">
              Detalhe somente leitura do indicador selecionado.
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
          {detalhe && detalhe.resumos.length > 0 ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {detalhe.resumos.map((r) => (
                <div
                  key={r.label}
                  className="rounded-xl border border-border/70 bg-muted/20 px-3 py-2.5"
                >
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {r.label}
                  </p>
                  <p className="mt-1 text-sm font-semibold tabular-nums text-foreground sm:text-base">
                    {r.valor}
                  </p>
                </div>
              ))}
            </div>
          ) : null}

          {detalhe?.faturamentoPorDia &&
          detalhe.faturamentoPorDia.some((p) => p.valor > 0.009) ? (
            <AreaChartCard
              titulo="Evolução do faturamento"
              subtitulo="Visão ampliada do período"
              pontos={detalhe.faturamentoPorDia}
              total={
                Math.round(
                  detalhe.faturamentoPorDia.reduce((a, p) => a + p.valor, 0) * 100
                ) / 100
              }
              melhorDia={
                detalhe.faturamentoPorDia.reduce<
                  (typeof detalhe.faturamentoPorDia)[number] | null
                >((best, p) => {
                  if (p.valor <= 0.009) return best
                  if (!best || p.valor > best.valor) return p
                  return best
                }, null)
              }
            />
          ) : null}

          {detalhe?.formasPagamento && detalhe.formasPagamento.length > 0 ? (
            <FormasPagamentoChart
              titulo="Distribuição por forma"
              itens={detalhe.formasPagamento}
            />
          ) : null}

          {detalhe?.osStatusFatias && detalhe.osStatusFatias.length > 0 ? (
            <DonutChartCard titulo="Resumo por status" fatias={detalhe.osStatusFatias} />
          ) : null}

          {vazio ? (
            <div className="rounded-xl border border-dashed border-border bg-muted/10 px-4 py-10 text-center text-sm text-muted-foreground">
              Não há dados suficientes para detalhar este indicador no período
              selecionado.
            </div>
          ) : (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground">Detalhamento</h3>
              <ul className="space-y-2">
                {detalhe!.linhas.map((linha) => (
                  <li
                    key={linha.id}
                    className="rounded-xl border border-border/60 bg-card/80 px-3 py-3 sm:px-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-foreground">{linha.titulo}</p>
                          {linha.badge ? (
                            <Badge variant="outline" className="text-[10px]">
                              {linha.badge}
                            </Badge>
                          ) : null}
                        </div>
                        {linha.subtitulo ? (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {linha.subtitulo}
                          </p>
                        ) : null}
                        {linha.meta ? (
                          <p className="mt-0.5 text-xs text-muted-foreground">{linha.meta}</p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1.5">
                        {linha.valor ? (
                          <p className="text-sm font-semibold tabular-nums">{linha.valor}</p>
                        ) : null}
                        {linha.osId ? (
                          <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" asChild>
                            <Link
                              to={rotaVisualizarOs({ id: linha.osId })}
                              onClick={() => onOpenChange(false)}
                            >
                              Abrir OS
                              <ExternalLink className="h-3 w-3" />
                            </Link>
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-border bg-background/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-auto"
            onClick={() => onOpenChange(false)}
          >
            <X className="mr-1.5 h-4 w-4" />
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
