import { ArrowRight, CheckCircle2, Star } from 'lucide-react'
import { LandingSeo } from '@/marketing/landing/components/LandingSeo'
import { LandingCtaButton } from '@/marketing/landing/components/LandingCtaButton'
import { StepUiPreview } from '@/marketing/landing/components/LandingDeviceShowcase'
import { linkTestarBoxGestor } from '@/marketing/landing/lib/landing-links'
import {
  COMO_FUNCIONA_PASSOS,
  FLUXO_ROTINA,
  landingPath,
} from '@/marketing/landing/content/landing-content'

export default function LandingComoFuncionaPage() {
  const testar = linkTestarBoxGestor()

  return (
    <>
      <LandingSeo title="Como funciona | BoxGestor" />
      <section className="landing-section">
        <div className="landing-container">
          <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr] lg:items-end">
            <div>
              <p className="landing-eyebrow">Como funciona</p>
              <h1 className="landing-display mt-3 max-w-3xl text-4xl text-white sm:text-5xl">
                Comece a usar em poucos passos e transforme{' '}
                <span className="landing-accent">a rotina da sua oficina.</span>
              </h1>
            </div>
            <p className="text-[var(--lg-muted)]">
              O BoxGestor foi pensado para ser objetivo desde o primeiro dia. Organize a operação e
              acompanhe o andamento com mais clareza.
            </p>
          </div>

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

          <ol className="landing-steps mt-12">
            {COMO_FUNCIONA_PASSOS.map((passo) => (
              <li key={passo.passo} className="landing-card landing-step-card landing-recurso-card">
                <span className="landing-step-num">{passo.passo}</span>
                <h2 className="mt-4 text-lg font-semibold text-white">{passo.titulo}</h2>
                <p className="mt-2 text-sm text-[var(--lg-muted)]">{passo.descricao}</p>
                <div className="preview mt-4">
                  <StepUiPreview step={passo.passo as 1 | 2 | 3 | 4} />
                </div>
              </li>
            ))}
          </ol>

          <div className="landing-card mt-12 grid gap-6 p-6 sm:grid-cols-3 sm:p-8">
            <div className="flex gap-3">
              <Star size={18} className="mt-0.5 text-[var(--lg-orange)]" aria-hidden />
              <p className="text-sm text-[var(--lg-muted)]">
                Em poucos minutos você organiza sua oficina e passa a ter{' '}
                <span className="text-white">mais controle, agilidade e segurança.</span>
              </p>
            </div>
            <div className="flex gap-3">
              <CheckCircle2 size={18} className="mt-0.5 text-[var(--lg-orange)]" aria-hidden />
              <p className="text-sm text-[var(--lg-muted)]">
                Simples de começar. Fácil de usar. Completo para sua oficina.
              </p>
            </div>
            <div className="flex flex-col justify-center gap-2">
              <LandingCtaButton to={landingPath('planos')} variant="ghost">
                Escolha o plano ideal
              </LandingCtaButton>
              <LandingCtaButton {...testar} variant="primary">
                Testar BoxGestor
              </LandingCtaButton>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
