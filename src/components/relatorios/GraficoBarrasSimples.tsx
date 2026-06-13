interface GraficoBarrasItem {
  label: string
  valor: number
  cor?: string
}

interface GraficoBarrasSimplesProps {
  titulo?: string
  itens: GraficoBarrasItem[]
  formatarValor?: (v: number) => string
  altura?: number
}

export function GraficoBarrasSimples({
  titulo,
  itens,
  formatarValor = (v) => String(v),
  altura = 160,
}: GraficoBarrasSimplesProps) {
  const max = Math.max(...itens.map((i) => i.valor), 1)

  return (
    <div>
      {titulo && <p className="mb-3 text-sm font-medium text-muted-foreground">{titulo}</p>}
      <div className="flex items-end gap-2" style={{ height: altura }}>
        {itens.map((item) => {
          const pct = (item.valor / max) * 100
          return (
            <div key={item.label} className="flex min-w-0 flex-1 flex-col items-center gap-2">
              <span className="text-[10px] font-medium text-muted-foreground">
                {formatarValor(item.valor)}
              </span>
              <div
                className="w-full rounded-t-md bg-primary/80 transition-all"
                style={{
                  height: `${Math.max(pct, item.valor > 0 ? 4 : 0)}%`,
                  backgroundColor: item.cor,
                }}
                title={`${item.label}: ${formatarValor(item.valor)}`}
              />
              <span className="truncate text-[10px] text-muted-foreground">{item.label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

interface GraficoComparativoProps {
  titulo?: string
  serie: { label: string; receitas: number; despesas: number }[]
  formatarValor?: (v: number) => string
}

export function GraficoComparativoFinanceiro({
  titulo,
  serie,
  formatarValor = (v) => String(v),
}: GraficoComparativoProps) {
  const max = Math.max(...serie.flatMap((s) => [s.receitas, s.despesas]), 1)

  return (
    <div>
      {titulo && <p className="mb-3 text-sm font-medium text-muted-foreground">{titulo}</p>}
      <div className="space-y-3">
        {serie.map((ponto) => (
          <div key={ponto.label}>
            <div className="mb-1 flex justify-between text-xs text-muted-foreground">
              <span>{ponto.label}</span>
              <span>
                {formatarValor(ponto.receitas)} / {formatarValor(ponto.despesas)}
              </span>
            </div>
            <div className="flex h-3 gap-0.5 overflow-hidden rounded-full bg-muted">
              <div
                className="bg-emerald-500/80 transition-all"
                style={{ width: `${(ponto.receitas / max) * 100}%` }}
                title={`Receitas: ${formatarValor(ponto.receitas)}`}
              />
              <div
                className="bg-red-500/60 transition-all"
                style={{ width: `${(ponto.despesas / max) * 100}%` }}
                title={`Despesas: ${formatarValor(ponto.despesas)}`}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-500" /> Receitas
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-red-500/80" /> Despesas
        </span>
      </div>
    </div>
  )
}
