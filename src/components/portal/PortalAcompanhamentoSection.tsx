/**
 * A4.1 — Status atual + progresso por etapas no portal (service_tracking).
 * Consome apenas o bloco sanitizado `tracking` do payload público.
 */
import { Check, Circle, Clock3, Package } from 'lucide-react'
import type { PublicServiceTracking, PublicTrackingStep } from '@/types/approval-link'

function formatarDataHoraCurta(iso?: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) {
    if (/^\d{4}-\d{2}-\d{2}/.test(iso)) {
      const [y, m, day] = iso.slice(0, 10).split('-')
      return `${day}/${m}/${y}`
    }
    return null
  }
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatarDataCurta(iso?: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) {
    if (/^\d{4}-\d{2}-\d{2}/.test(iso)) {
      const [y, m, day] = iso.slice(0, 10).split('-')
      return `${day}/${m}/${y}`
    }
    return null
  }
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export function PortalAcompanhamentoSection({
  tracking,
  fallbackStatus,
  fallbackPrevisao,
}: {
  tracking?: PublicServiceTracking | null
  /** Fallback se Edge antiga ainda não enviar tracking. */
  fallbackStatus?: string | null
  fallbackPrevisao?: string | null
}) {
  const statusPublico =
    tracking?.status_publico?.trim() ||
    fallbackStatus?.trim() ||
    'Em acompanhamento'
  const descricao = tracking?.descricao?.trim() || null
  const previsaoFmt =
    formatarDataCurta(tracking?.previsao_entrega) ||
    formatarDataCurta(fallbackPrevisao)
  const atualizadoFmt = formatarDataHoraCurta(tracking?.atualizado_em)
  const progresso: PublicTrackingStep[] = Array.isArray(tracking?.progresso)
    ? tracking!.progresso!
    : []
  const avisos = Array.isArray(tracking?.avisos) ? tracking!.avisos! : []

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-emerald-400/25 bg-gradient-to-br from-emerald-950/50 to-sky-950/30 p-4 shadow-lg shadow-black/10">
        <div className="mb-2 flex items-center gap-2 text-emerald-200/90">
          <Package className="h-4 w-4 shrink-0" aria-hidden />
          <p className="text-[11px] font-medium uppercase tracking-[0.12em]">
            Status atual
          </p>
        </div>
        <h2 className="text-xl font-semibold leading-tight text-slate-50">
          {statusPublico}
        </h2>
        {descricao ? (
          <p className="mt-1.5 text-sm text-slate-300">{descricao}</p>
        ) : null}
        <dl className="mt-3 grid gap-2 text-sm">
          {previsaoFmt ? (
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-slate-400">Previsão de entrega</dt>
              <dd className="font-medium text-emerald-100">{previsaoFmt}</dd>
            </div>
          ) : null}
          {atualizadoFmt ? (
            <div className="flex items-baseline justify-between gap-3">
              <dt className="flex items-center gap-1.5 text-slate-400">
                <Clock3 className="h-3.5 w-3.5" aria-hidden />
                Última atualização
              </dt>
              <dd className="font-medium text-slate-200">{atualizadoFmt}</dd>
            </div>
          ) : null}
        </dl>
      </section>

      {progresso.length > 0 ? (
        <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 shadow-lg shadow-black/10">
          <h2 className="mb-4 text-sm font-semibold tracking-wide text-slate-100">
            Progresso do serviço
          </h2>
          <ol className="relative space-y-0">
            {progresso.map((step, idx) => {
              const isLast = idx === progresso.length - 1
              const concluida = Boolean(step.concluida)
              const atual = Boolean(step.atual)
              return (
                <li key={step.etapa || String(idx)} className="relative flex gap-3 pb-5 last:pb-0">
                  {!isLast ? (
                    <span
                      className={`absolute left-[11px] top-6 h-[calc(100%-8px)] w-px ${
                        concluida ? 'bg-emerald-400/50' : 'bg-white/15'
                      }`}
                      aria-hidden
                    />
                  ) : null}
                  <span
                    className={`relative z-[1] flex h-6 w-6 shrink-0 items-center justify-center rounded-full ring-2 ${
                      atual
                        ? 'bg-emerald-500 text-white ring-emerald-300/60'
                        : concluida
                          ? 'bg-emerald-600/80 text-white ring-emerald-500/40'
                          : 'bg-slate-800 text-slate-500 ring-white/15'
                    }`}
                    aria-current={atual ? 'step' : undefined}
                  >
                    {concluida && !atual ? (
                      <Check className="h-3.5 w-3.5" strokeWidth={3} />
                    ) : (
                      <Circle
                        className={`h-2.5 w-2.5 ${atual ? 'fill-current' : ''}`}
                      />
                    )}
                  </span>
                  <div className="min-w-0 pt-0.5">
                    <p
                      className={`text-sm font-medium ${
                        atual
                          ? 'text-emerald-100'
                          : concluida
                            ? 'text-slate-200'
                            : 'text-slate-500'
                      }`}
                    >
                      {step.titulo}
                      {atual ? (
                        <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-emerald-300/90">
                          Atual
                        </span>
                      ) : null}
                    </p>
                    {step.descricao ? (
                      <p className="mt-0.5 text-xs text-slate-400">{step.descricao}</p>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ol>
        </section>
      ) : null}

      {avisos.length > 0 ? (
        <div className="space-y-2">
          {avisos.map((aviso, i) => (
            <p
              key={`${i}-${aviso.slice(0, 24)}`}
              className="rounded-xl border border-sky-400/25 bg-sky-950/30 px-3 py-2.5 text-sm text-sky-50"
            >
              {aviso}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  )
}
