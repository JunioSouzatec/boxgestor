/**
 * Gráficos SVG/CSS do Gestor Inteligente — sem biblioteca externa.
 * Tooltips: hover (desktop) e toque (celular).
 */
import { useRef, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn, formatarData, formatarMoeda } from '@/lib/utils'
import type {
  FatiaDonut,
  FormaPagamentoStat,
  FuncionarioGestorStat,
  InsightGestor,
  AlertaGestor,
  PontoFaturamentoDia,
} from '@/services/gestor-inteligente.service'
import {
  ChartTooltip,
  CHART_TOOLTIP_HIDDEN,
  posicaoTooltipRelativa,
  type ChartTooltipState,
} from '@/components/gestor-inteligente/ChartTooltip'

export function GestorMetricCard({
  titulo,
  valor,
  icone: Icone,
  detalhe,
  tom = 'default',
  monetario = false,
  onAbrirDetalhe,
}: {
  titulo: string
  valor: number | string
  icone: LucideIcon
  detalhe?: string
  tom?: 'default' | 'success' | 'warning' | 'info'
  monetario?: boolean
  onAbrirDetalhe?: () => void
}) {
  const valorExibido =
    monetario && typeof valor === 'number' ? formatarMoeda(valor) : valor
  const tomCls = {
    default: 'from-zinc-900/80 via-zinc-900/40 to-primary/10 border-border',
    success: 'from-emerald-950/40 via-zinc-900/30 to-emerald-900/10 border-emerald-800/40',
    warning: 'from-amber-950/40 via-zinc-900/30 to-amber-900/10 border-amber-800/40',
    info: 'from-sky-950/40 via-zinc-900/30 to-sky-900/10 border-sky-800/40',
  }[tom]
  const iconCls = {
    default: 'bg-primary/15 text-primary',
    success: 'bg-emerald-500/15 text-emerald-400',
    warning: 'bg-amber-500/15 text-amber-400',
    info: 'bg-sky-500/15 text-sky-400',
  }[tom]

  return (
    <div
      role={onAbrirDetalhe ? 'button' : undefined}
      tabIndex={onAbrirDetalhe ? 0 : undefined}
      onClick={onAbrirDetalhe}
      onKeyDown={
        onAbrirDetalhe
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onAbrirDetalhe()
              }
            }
          : undefined
      }
      className={cn(
        'relative overflow-hidden rounded-2xl border bg-gradient-to-br p-5 shadow-sm',
        tomCls,
        onAbrirDetalhe &&
          'cursor-pointer transition-transform hover:scale-[1.01] hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50'
      )}
    >
      <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/5" />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-300">
            {titulo}
          </p>
          <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight text-zinc-50 sm:text-3xl">
            {valorExibido}
          </p>
          {detalhe ? (
            <p className="mt-1.5 text-xs text-zinc-400">{detalhe}</p>
          ) : null}
        </div>
        <div className={cn('rounded-xl p-3', iconCls)}>
          <Icone className="h-6 w-6" />
        </div>
      </div>
    </div>
  )
}

function useChartTooltip() {
  const ref = useRef<HTMLDivElement>(null)
  const [tip, setTip] = useState<ChartTooltipState>(CHART_TOOLTIP_HIDDEN)

  function show(text: string, clientX: number, clientY: number) {
    if (!text.trim()) {
      setTip(CHART_TOOLTIP_HIDDEN)
      return
    }
    const pos = posicaoTooltipRelativa(ref.current, clientX, clientY)
    setTip({ visible: true, text, x: pos.x, y: pos.y })
  }

  function hide() {
    setTip(CHART_TOOLTIP_HIDDEN)
  }

  return { ref, tip, show, hide }
}

export function AreaChartCard({
  titulo,
  subtitulo,
  pontos,
  total,
  melhorDia,
  onAbrirDetalhe,
}: {
  titulo: string
  subtitulo?: string
  pontos: PontoFaturamentoDia[]
  total: number
  melhorDia: PontoFaturamentoDia | null
  onAbrirDetalhe?: () => void
}) {
  const { ref, tip, show, hide } = useChartTooltip()
  const max = Math.max(...pontos.map((p) => p.valor), 0)
  const w = 320
  const h = 140
  const padX = 8
  const padY = 12
  const usable = pontos.length > 0 && max > 0

  const coords = usable
    ? pontos.map((p, i) => {
        const x =
          padX +
          (pontos.length === 1
            ? (w - padX * 2) / 2
            : (i / (pontos.length - 1)) * (w - padX * 2))
        const y = h - padY - (p.valor / max) * (h - padY * 2)
        return { x, y, ...p }
      })
    : []

  const line = coords
    .map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
    .join(' ')
  const area =
    coords.length > 0
      ? `${line} L ${coords[coords.length - 1].x.toFixed(1)} ${h - padY} L ${coords[0].x.toFixed(1)} ${h - padY} Z`
      : ''

  const labels =
    pontos.length <= 10
      ? pontos
      : pontos.filter(
          (_, i) =>
            i === 0 || i === pontos.length - 1 || i % Math.ceil(pontos.length / 6) === 0
        )

  function textoPonto(p: PontoFaturamentoDia): string {
    const partes = [
      formatarData(p.data),
      formatarMoeda(p.valor),
    ]
    if (p.quantidade > 0) {
      partes.push(`${p.quantidade} pagamento${p.quantidade === 1 ? '' : 's'}`)
    }
    if (melhorDia && melhorDia.data === p.data && p.valor > 0.009) {
      partes.push('Melhor dia no período')
    }
    return partes.join(' · ')
  }

  return (
    <Card
      className={cn(
        'overflow-hidden border-border/80 bg-card/60',
        onAbrirDetalhe && 'cursor-pointer transition-colors hover:border-primary/40'
      )}
      onClick={onAbrirDetalhe}
    >
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <CardTitle className="text-base">{titulo}</CardTitle>
            {subtitulo ? (
              <p className="mt-1 text-xs text-muted-foreground">{subtitulo}</p>
            ) : null}
            <p className="mt-1 text-2xl font-bold tabular-nums">{formatarMoeda(total)}</p>
          </div>
          {melhorDia ? (
            <p className="text-xs text-muted-foreground">
              Melhor dia no período: {melhorDia.label} · {formatarMoeda(melhorDia.valor)}
            </p>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        {!usable ? (
          <EmptyChart />
        ) : (
          <div
            ref={ref}
            className="relative"
            onMouseLeave={hide}
            onClick={(e) => e.stopPropagation()}
          >
            <ChartTooltip state={tip} />
            <svg viewBox={`0 0 ${w} ${h}`} className="h-40 w-full touch-none" role="img" aria-label={titulo}>
              <defs>
                <linearGradient id="gi-area" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.45" />
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.02" />
                </linearGradient>
              </defs>
              <path d={area} fill="url(#gi-area)" />
              <path
                d={line}
                fill="none"
                stroke="#f59e0b"
                strokeWidth="2.5"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {coords.map((c) => (
                <g key={c.data}>
                  <circle
                    cx={c.x}
                    cy={c.y}
                    r={c.valor === max && c.valor > 0 ? 4.5 : 3}
                    fill={c.valor === max && c.valor > 0 ? '#fbbf24' : '#f59e0b'}
                    className="pointer-events-none"
                  />
                  <circle
                    cx={c.x}
                    cy={c.y}
                    r={14}
                    fill="transparent"
                    className="cursor-pointer"
                    onMouseEnter={(e) => show(textoPonto(c), e.clientX, e.clientY)}
                    onMouseMove={(e) => show(textoPonto(c), e.clientX, e.clientY)}
                    onClick={(e) => {
                      e.preventDefault()
                      show(textoPonto(c), e.clientX, e.clientY)
                    }}
                    onTouchStart={(e) => {
                      const t = e.touches[0]
                      if (t) show(textoPonto(c), t.clientX, t.clientY)
                    }}
                  />
                </g>
              ))}
            </svg>
            <div className="mt-1 flex justify-between gap-1 text-[10px] text-muted-foreground">
              {labels.map((p) => (
                <span key={p.data}>{p.label}</span>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function DonutChartCard({
  titulo,
  fatias,
  onAbrirDetalhe,
  onFatiaClick,
}: {
  titulo: string
  fatias: FatiaDonut[]
  onAbrirDetalhe?: () => void
  onFatiaClick?: (key: string) => void
}) {
  const { ref, tip, show, hide } = useChartTooltip()
  const total = fatias.reduce((a, f) => a + f.valor, 0)
  const r = 42
  const c = 2 * Math.PI * r
  let offset = 0

  function textoFatia(f: FatiaDonut): string {
    const pct = total > 0 ? Math.round((f.valor / total) * 100) : 0
    return `${f.label} · ${f.valor} OS · ${pct}%`
  }

  return (
    <Card
      className={cn(
        'border-border/80 bg-card/60',
        onAbrirDetalhe && 'cursor-pointer transition-colors hover:border-primary/40'
      )}
      onClick={onAbrirDetalhe}
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{titulo}</CardTitle>
      </CardHeader>
      <CardContent>
        {total <= 0 ? (
          <EmptyChart />
        ) : (
          <div
            ref={ref}
            className="relative flex flex-col items-center gap-4 sm:flex-row"
            onMouseLeave={hide}
            onClick={(e) => e.stopPropagation()}
          >
            <ChartTooltip state={tip} />
            <svg viewBox="0 0 120 120" className="h-40 w-40 shrink-0 touch-none" role="img" aria-label={titulo}>
              <circle cx="60" cy="60" r={r} fill="none" stroke="#27272a" strokeWidth="14" />
              {fatias.map((f) => {
                const len = (f.valor / total) * c
                const dash = `${len} ${c - len}`
                const currentOffset = offset
                offset += len
                return (
                  <circle
                    key={f.key}
                    cx="60"
                    cy="60"
                    r={r}
                    fill="none"
                    stroke={f.cor}
                    strokeWidth="14"
                    strokeDasharray={dash}
                    strokeDashoffset={-currentOffset}
                    transform="rotate(-90 60 60)"
                    strokeLinecap="butt"
                    className="cursor-pointer"
                    style={{ pointerEvents: 'stroke' }}
                    onMouseEnter={(e) => show(textoFatia(f), e.clientX, e.clientY)}
                    onMouseMove={(e) => show(textoFatia(f), e.clientX, e.clientY)}
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      if (onFatiaClick) onFatiaClick(f.key)
                      else show(textoFatia(f), e.clientX, e.clientY)
                    }}
                    onTouchStart={(e) => {
                      const t = e.touches[0]
                      if (t) show(textoFatia(f), t.clientX, t.clientY)
                    }}
                  />
                )
              })}
              <text
                x="60"
                y="56"
                textAnchor="middle"
                fill="#fafafa"
                style={{ fontSize: 18, fontWeight: 700 }}
              >
                {total}
              </text>
              <text x="60" y="74" textAnchor="middle" fill="#a1a1aa" style={{ fontSize: 10 }}>
                OS
              </text>
            </svg>
            <ul className="w-full space-y-2 text-sm">
              {fatias.map((f) => (
                <li
                  key={f.key}
                  className="flex cursor-pointer items-center justify-between gap-2 rounded-md px-1 py-0.5 hover:bg-muted/40"
                  onMouseEnter={(e) => show(textoFatia(f), e.clientX, e.clientY)}
                  onMouseMove={(e) => show(textoFatia(f), e.clientX, e.clientY)}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (onFatiaClick) onFatiaClick(f.key)
                    else show(textoFatia(f), e.clientX, e.clientY)
                  }}
                  onTouchStart={(e) => {
                    const t = e.touches[0]
                    if (t) show(textoFatia(f), t.clientX, t.clientY)
                  }}
                >
                  <span className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: f.cor }} />
                    {f.label}
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {f.valor} · {Math.round((f.valor / total) * 100)}%
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function RankingBarList({
  titulo,
  itens,
  modo = 'valor',
  unidade = 'x',
  onItemClick,
}: {
  titulo: string
  itens: Array<{ nome: string; quantidade: number; valor: number }>
  modo?: 'valor' | 'quantidade'
  unidade?: 'x' | 'un.'
  onItemClick?: (item: { nome: string; quantidade: number; valor: number }) => void
}) {
  const { ref, tip, show, hide } = useChartTooltip()
  const max = Math.max(...itens.map((i) => (modo === 'valor' ? i.valor : i.quantidade)), 0)

  function textoItem(
    item: { nome: string; quantidade: number; valor: number },
    idx: number
  ): string {
    const qtd =
      unidade === 'un.'
        ? `${item.quantidade} un.`
        : `${item.quantidade}x`
    return `#${idx + 1} ${item.nome} · ${qtd} · ${formatarMoeda(item.valor)}`
  }

  return (
    <Card className="border-border/80 bg-card/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{titulo}</CardTitle>
      </CardHeader>
      <CardContent>
        {itens.length === 0 || max <= 0 ? (
          <EmptyChart />
        ) : (
          <div ref={ref} className="relative space-y-3" onMouseLeave={hide}>
            <ChartTooltip state={tip} />
            {itens.map((item, idx) => {
              const metrica = modo === 'valor' ? item.valor : item.quantidade
              const ratio = metrica / max
              const destaque = idx === 0
              return (
                <div
                  key={`${item.nome}-${idx}`}
                  className={cn(
                    'cursor-pointer rounded-xl border p-3 transition-colors',
                    destaque
                      ? 'border-primary/40 bg-primary/5 shadow-sm'
                      : 'border-border/50 bg-muted/10 hover:bg-muted/20'
                  )}
                  onMouseEnter={(e) => show(textoItem(item, idx), e.clientX, e.clientY)}
                  onMouseMove={(e) => show(textoItem(item, idx), e.clientX, e.clientY)}
                  onClick={() => {
                    if (onItemClick) onItemClick(item)
                    else hide()
                  }}
                  onTouchStart={(e) => {
                    const t = e.touches[0]
                    if (t) show(textoItem(item, idx), t.clientX, t.clientY)
                  }}
                >
                  <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
                    <span className="flex min-w-0 items-center gap-2 font-medium">
                      <span
                        className={cn(
                          'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
                          destaque
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground'
                        )}
                      >
                        #{idx + 1}
                      </span>
                      <span className="truncate">{item.nome}</span>
                    </span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {item.quantidade}
                      {unidade === 'un.' ? ' un.' : 'x'} · {formatarMoeda(item.valor)}
                    </span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all',
                        destaque ? 'bg-primary' : 'bg-primary/60'
                      )}
                      style={{ width: `${Math.max(6, Math.min(100, ratio * 100))}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function FormasPagamentoChart({
  titulo,
  itens,
  onAbrirDetalhe,
}: {
  titulo: string
  itens: FormaPagamentoStat[]
  onAbrirDetalhe?: () => void
}) {
  const { ref, tip, show, hide } = useChartTooltip()
  const max = Math.max(...itens.map((i) => i.valor), 0)
  const totalValor = itens.reduce((a, i) => a + i.valor, 0)

  function textoItem(item: FormaPagamentoStat): string {
    const pct = totalValor > 0 ? Math.round((item.valor / totalValor) * 100) : 0
    return `${item.label} · ${formatarMoeda(item.valor)} · ${item.quantidade} pagamento${item.quantidade === 1 ? '' : 's'} · ${pct}%`
  }

  return (
    <Card
      className={cn(
        'border-border/80 bg-card/60',
        onAbrirDetalhe && 'cursor-pointer transition-colors hover:border-primary/40'
      )}
      onClick={onAbrirDetalhe}
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{titulo}</CardTitle>
      </CardHeader>
      <CardContent>
        {itens.length === 0 || max <= 0 ? (
          <EmptyChart />
        ) : (
          <div
            ref={ref}
            className="relative space-y-3"
            onMouseLeave={hide}
            onClick={(e) => e.stopPropagation()}
          >
            <ChartTooltip state={tip} />
            {itens.map((item) => (
              <div
                key={item.forma}
                className="cursor-pointer space-y-1 rounded-md px-0.5 py-0.5 hover:bg-muted/20"
                onMouseEnter={(e) => show(textoItem(item), e.clientX, e.clientY)}
                onMouseMove={(e) => show(textoItem(item), e.clientX, e.clientY)}
                onClick={() => {
                  if (onAbrirDetalhe) onAbrirDetalhe()
                  else hide()
                }}
                onTouchStart={(e) => {
                  const t = e.touches[0]
                  if (t) show(textoItem(item), t.clientX, t.clientY)
                }}
              >
                <div className="flex justify-between gap-2 text-sm">
                  <span className="font-medium">{item.label}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {item.quantidade} · {formatarMoeda(item.valor)}
                  </span>
                </div>
                <div className="h-3 overflow-hidden rounded-md bg-muted">
                  <div
                    className="h-full rounded-md bg-sky-500/80"
                    style={{ width: `${Math.max(4, (item.valor / max) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function FuncionariosProdutividadeChart({
  funcionarios,
  onItemClick,
}: {
  funcionarios: FuncionarioGestorStat[]
  onItemClick?: (f: FuncionarioGestorStat) => void
}) {
  const { ref, tip, show, hide } = useChartTooltip()
  const maxFunc = Math.max(...funcionarios.map((f) => f.comissao_gerada), 0)

  function texto(f: FuncionarioGestorStat): string {
    return `${f.nome} · ${f.quantidade_os} OS · Gerada ${formatarMoeda(f.comissao_gerada)} · Em aberto ${formatarMoeda(f.comissao_em_aberto)}`
  }

  return (
    <Card className="border-border/80 bg-card/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Produtividade dos funcionários</CardTitle>
      </CardHeader>
      <CardContent>
        {funcionarios.length === 0 || maxFunc <= 0 ? (
          <EmptyChart />
        ) : (
          <div ref={ref} className="relative space-y-3" onMouseLeave={hide}>
            <ChartTooltip state={tip} />
            {funcionarios.map((f, idx) => (
              <div
                key={f.id}
                className="cursor-pointer rounded-xl border border-border/50 bg-muted/10 p-3 hover:bg-muted/20"
                onMouseEnter={(e) => show(texto(f), e.clientX, e.clientY)}
                onMouseMove={(e) => show(texto(f), e.clientX, e.clientY)}
                onClick={() => {
                  if (onItemClick) onItemClick(f)
                  else hide()
                }}
                onTouchStart={(e) => {
                  const t = e.touches[0]
                  if (t) show(texto(f), t.clientX, t.clientY)
                }}
              >
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 font-medium">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[11px] font-bold text-muted-foreground">
                      #{idx + 1}
                    </span>
                    {f.nome}
                  </span>
                  <Badge variant="outline">{f.quantidade_os} OS</Badge>
                </div>
                <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                  <span>Gerada {formatarMoeda(f.comissao_gerada)}</span>
                  <span>Em aberto {formatarMoeda(f.comissao_em_aberto)}</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-violet-500/80"
                    style={{
                      width: `${Math.max(6, Math.min(100, (f.comissao_gerada / maxFunc) * 100))}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function InsightCards({ insights }: { insights: InsightGestor[] }) {
  const tomCls = {
    default: 'border-border bg-muted/20',
    success: 'border-emerald-500/30 bg-emerald-500/5',
    warning: 'border-amber-500/30 bg-amber-500/5',
    info: 'border-sky-500/30 bg-sky-500/5',
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {insights.map((i) => (
        <div key={i.id} className={cn('rounded-xl border p-4', tomCls[i.tom])}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {i.titulo}
          </p>
          <p className="mt-1.5 text-sm font-medium leading-snug text-foreground">{i.texto}</p>
        </div>
      ))}
    </div>
  )
}

export function AlertCards({ alertas }: { alertas: AlertaGestor[] }) {
  return (
    <div className="space-y-2">
      {alertas.map((a) => (
        <div
          key={a.id}
          className={cn(
            'rounded-xl border px-4 py-3 text-sm',
            a.severidade === 'critical' && 'border-red-500/30 bg-red-500/5',
            a.severidade === 'warning' && 'border-amber-500/30 bg-amber-500/5',
            a.severidade === 'info' && 'border-border bg-muted/15'
          )}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-background/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {a.categoria}
            </span>
            <p className="font-medium text-foreground">{a.titulo}</p>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{a.descricao}</p>
        </div>
      ))}
    </div>
  )
}

function EmptyChart() {
  return (
    <div className="flex h-36 items-center justify-center rounded-xl border border-dashed border-border bg-muted/10 px-4 text-center text-sm text-muted-foreground">
      Ainda não há dados suficientes para este gráfico.
    </div>
  )
}
