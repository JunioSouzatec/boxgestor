import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  DIAS_SEMANA,
  ehDiaAtual,
  ehDiaSelecionado,
  ehMesReferencia,
  formatarDataISO,
  mesAnterior,
  mesProximo,
  obterDiasDoMes,
  obterTituloMes,
} from '@/lib/calendario'

interface CalendarioMensalProps {
  mesReferencia: Date
  onMesChange: (mes: Date) => void
  diaSelecionado: string
  onSelecionarDia: (data: string) => void
  contagemPorDia: Record<string, number>
}

export function CalendarioMensal({
  mesReferencia,
  onMesChange,
  diaSelecionado,
  onSelecionarDia,
  contagemPorDia,
}: CalendarioMensalProps) {
  const dias = obterDiasDoMes(mesReferencia)
  const titulo = obterTituloMes(mesReferencia)

  return (
    <div className="select-none">
      <div className="mb-4 flex items-center justify-between">
        <Button
          variant="outline"
          size="icon"
          onClick={() => onMesChange(mesAnterior(mesReferencia))}
          aria-label="Mês anterior"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h3 className="text-base font-semibold capitalize">{titulo}</h3>
        <Button
          variant="outline"
          size="icon"
          onClick={() => onMesChange(mesProximo(mesReferencia))}
          aria-label="Próximo mês"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {DIAS_SEMANA.map((dia) => (
          <div
            key={dia}
            className="py-2 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground"
          >
            {dia}
          </div>
        ))}

        {dias.map((dia) => {
          const dataISO = formatarDataISO(dia)
          const qtd = contagemPorDia[dataISO] ?? 0
          const noMes = ehMesReferencia(dia, mesReferencia)
          const hoje = ehDiaAtual(dia)
          const selecionado = ehDiaSelecionado(dia, diaSelecionado)

          return (
            <button
              key={dataISO}
              type="button"
              onClick={() => onSelecionarDia(dataISO)}
              className={cn(
                'relative flex aspect-square flex-col items-center justify-center rounded-lg text-sm transition-all cursor-pointer',
                !noMes && 'text-muted-foreground/40',
                noMes && 'hover:bg-muted/60',
                selecionado && 'bg-primary/15 ring-2 ring-primary/60',
                hoje && !selecionado && 'ring-1 ring-primary/40',
                hoje && selecionado && 'ring-2 ring-primary'
              )}
              aria-label={`${dataISO}${qtd > 0 ? `, ${qtd} agendamento(s)` : ''}`}
              aria-pressed={selecionado}
            >
              <span
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-full font-medium',
                  hoje && 'bg-primary text-primary-foreground',
                  selecionado && !hoje && 'text-primary'
                )}
              >
                {dia.getDate()}
              </span>
              {qtd > 0 && (
                <span className="mt-0.5 flex gap-0.5">
                  {Array.from({ length: Math.min(qtd, 3) }).map((_, i) => (
                    <span
                      key={i}
                      className={cn(
                        'h-1 w-1 rounded-full',
                        selecionado ? 'bg-primary' : 'bg-amber-400'
                      )}
                    />
                  ))}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
