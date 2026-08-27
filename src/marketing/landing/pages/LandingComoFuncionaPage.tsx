import { ArrowRight } from 'lucide-react'
import { LandingSeo } from '@/marketing/landing/components/LandingSeo'
import { LandingCtaButton } from '@/marketing/landing/components/LandingCtaButton'
import { linkTestarBoxGestor } from '@/marketing/landing/lib/landing-links'
import {
  COMO_FUNCIONA_PASSOS,
  FLUXO_ROTINA,
} from '@/marketing/landing/content/landing-content'

export default function LandingComoFuncionaPage() {
  return (
    <>
      <LandingSeo title="Como funciona | BoxGestor" />
      <section className="landing-section">
        <div className="landing-container">
          <p className="landing-eyebrow">Como funciona</p>
          <h1 className="landing-display mt-3 max-w-3xl text-4xl text-white sm:text-5xl">
            A rotina real da oficina, conectada em um fluxo
          </h1>
          <p className="mt-4 max-w-2xl text-[var(--lg-muted)]">
            Do primeiro contato ao histórico do atendimento — com módulos que se conversam.
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-2">
            {FLUXO_ROTINA.map((etapa, index) => (
              <div key={etapa} className="flex items-center gap-2">
                <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-sm text-white">
                  {etapa}
                </span>
                {index < FLUXO_ROTINA.length - 1 ? (
                  <ArrowRight size={14} className="text-[var(--lg-orange)]" aria-hidden />
                ) : null}
              </div>
            ))}
          </div>

          <ol className="mt-12 grid gap-4 md:grid-cols-2">
            {COMO_FUNCIONA_PASSOS.map((passo) => (
              <li key={passo.passo} className="landing-card p-6">
                <span className="landing-display text-4xl text-[var(--lg-orange)]">
                  {String(passo.passo).padStart(2, '0')}
                </span>
                <h2 className="mt-3 text-xl font-semibold text-white">{passo.titulo}</h2>
                <p className="mt-2 text-sm text-[var(--lg-muted)]">{passo.descricao}</p>
              </li>
            ))}
          </ol>

          <div className="landing-card mt-12 p-6 sm:p-8">
            <h2 className="landing-display text-2xl text-white">Integração entre módulos</h2>
            <p className="mt-3 max-w-3xl text-[var(--lg-muted)]">
              Cliente e veículo alimentam o orçamento. A aprovação por link gera a OS. Peças e
              serviços entram no atendimento. Pagamentos e caixa fecham o ciclo. O histórico
              permanece disponível para próximos serviços — sem depender de papel ou planilha
              paralela.
            </p>
            <div className="mt-6">
              <LandingCtaButton to={linkTestarBoxGestor()} variant="primary">
                Testar BoxGestor
              </LandingCtaButton>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
