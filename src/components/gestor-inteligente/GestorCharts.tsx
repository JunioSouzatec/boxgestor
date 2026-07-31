/**
 * Gráficos SVG/CSS do Gestor Inteligente — sem biblioteca externa.
 */
import type { LucideIcon } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn, formatarMoeda } from '@/lib/utils'
import type {
  FatiaDonut,
  FormaPagamentoStat,
  InsightGestor,
  AlertaGestor,
  PontoFaturamentoDia,
} from '@/services/gestor-inteligente.service'

export function GestorMetricCard({
  titulo,
  valor,
  icone: Icone,
  detalhe,
  tom = 'default',
  monetario = false,
}: {
  titulo: string
  valor: number | string
  icone: LucideIcon
  detalhe?: string
  tom?: 'default' | 'success' | 'warning' | 'info'
  monetario?: boolean
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
      className={cn(
        'relative overflow-hidden rounded-2xl border bg-gradient-to-br p-5 shadow-sm',
        tomCls
      )}
    >
      <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/5" />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {titulo}
          </p>
          <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight sm:text-3xl">
            {valorExibido}
          </p>
          {detalhe ? (
            <p className="mt-1.5 text-xs text-muted-foreground">{detalhe}</p>
          ) : null}
        </div>
        <div className={cn('rounded-xl p-3', iconCls)}>
          <Icone className="h-6 w-6" />
        </div>
      </div>
    </div>
  )
}

export function AreaChartCard({
  titulo,
  pontos,
  total,
  melhorDia,
}: {
  titulo: string
  pontos: PontoFaturamentoDia[]
  total: number
  melhorDia: PontoFaturamentoDia | null
}) {
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

  const line = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ')
  const area =
    coords.length > 0
      ? `${line} L ${coords[coords.length - 1].x.toFixed(1)} ${h - padY} L ${coords[0].x.toFixed(1)} ${h - padY} Z`
      : ''

  const labels =
    pontos.length <= 10
      ? pontos
      : pontos.filter((_, i) => i === 0 || i === pontos.length - 1 || i % Math.ceil(pontos.length / 6) === 0)

  return (
    <Card className="overflow-hidden border-border/80 bg-card/60">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <CardTitle className="text-base">{titulo}</CardTitle>
            <p className="mt-1 text-2xl font-bold tabular-nums">{formatarMoeda(total)}</p>
          </div>
          {melhorDia ? (
            <p className="text-xs text-muted-foreground">
              Melhor dia: {melhorDia.label} · {formatarMoeda(melhorDia.valor)}
            </p>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        {!usable ? (
          <EmptyChart />
        ) : (
          <>
            <svg viewBox={`0 0 ${w} ${h}`} className="h-40 w-full" role="img" aria-label={titulo}>
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
                <circle
                  key={c.data}
                  cx={c.x}
                  cy={c.y}
                  r={c.valor === max ? 4 : 2.5}
                  fill={c.valor === max ? '#fbbf24' : '#f59e0b'}
                />
              ))}
            </svg>
            <div className="mt-1 flex justify-between gap-1 text-[10px] text-muted-foreground">
              {labels.map((p) => (
                <span key={p.data}>{p.label}</span>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

export function DonutChartCard({
  titulo,
  fatias,
}: {
  titulo: string
  fatias: FatiaDonut[]
}) {
  const total = fatias.reduce((a, f) => a + f.valor, 0)
  const r = 42
  const c = 2 * Math.PI * r
  let offset = 0

  return (
    <Card className="border-border/80 bg-card/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{titulo}</CardTitle>
      </CardHeader>
      <CardContent>
        {total <= 0 ? (
          <EmptyChart />
        ) : (
          <div className="flex flex-col items-center gap-4 sm:flex-row">
            <svg viewBox="0 0 120 120" className="h-40 w-40 shrink-0" role="img" aria-label={titulo}>
              <circle cx="60" cy="60" r={r} fill="none" stroke="#27272a" strokeWidth="14" />
              {fatias.map((f) => {
                const len = (f.valor / total) * c
                const dash = `${len} ${c - len}`
                const el = (
                  <circle
                    key={f.key}
                    cx="60"
                    cy="60"
                    r={r}
                    fill="none"
                    stroke={f.cor}
                    strokeWidth="14"
                    strokeDasharray={dash}
                    strokeDashoffset={-offset}
                    transform="rotate(-90 60 60)"
                    strokeLinecap="butt"
                  />
                )
                offset += len
                return el
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
                <li key={f.key} className="flex items-center justify-between gap-2">
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
}: {
  titulo: string
  itens: Array<{ nome: string; quantidade: number; valor: number }>
  modo?: 'valor' | 'quantidade'
}) {
  const max = Math.max(...itens.map((i) => (modo === 'valor' ? i.valor : i.quantidade)), 0)

  return (
    <Card className="border-border/80 bg-card/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{titulo}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {itens.length === 0 || max <= 0 ? (
          <EmptyChart />
        ) : (
          itens.map((item, idx) => {
            const metrica = modo === 'valor' ? item.valor : item.quantidade
            const ratio = metrica / max
            const destaque = idx === 0
            return (
              <div
                key={`${item.nome}-${idx}`}
                className={cn(
                  'rounded-xl border p-3',
                  destaque
                    ? 'border-primary/40 bg-primary/5 shadow-sm'
                    : 'border-border/50 bg-muted/10'
                )}
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
                    {item.quantidade}x · {formatarMoeda(item.valor)}
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
          })
        )}
      </CardContent>
    </Card>
  )
}

export function FormasPagamentoChart({
  titulo,
  itens,
}: {
  titulo: string
  itens: FormaPagamentoStat[]
}) {
  const max = Math.max(...itens.map((i) => i.valor), 0)
  return (
    <Card className="border-border/80 bg-card/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{titulo}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {itens.length === 0 || max <= 0 ? (
          <EmptyChart />
        ) : (
          itens.map((item) => (
            <div key={item.forma} className="space-y-1">
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
          ))
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
          <p className="mt-1.5 text-sm font-medium leading-snug">{i.texto}</p>
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
            <p className="font-medium">{a.titulo}</p>
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
