import { LandingSeo } from '@/marketing/landing/components/LandingSeo'
import { LandingCtaButton } from '@/marketing/landing/components/LandingCtaButton'
import { linkTestarBoxGestor } from '@/marketing/landing/lib/landing-links'
import {
  RECURSOS_DETALHADOS,
  type StatusRecurso,
} from '@/marketing/landing/content/landing-content'

function badgeStatus(status: StatusRecurso) {
  switch (status) {
    case 'em_desenvolvimento':
      return { label: 'Em desenvolvimento', className: 'landing-badge-muted' }
    case 'adicional':
      return { label: 'Adicional', className: 'landing-badge' }
    case 'futuro':
      return { label: 'Em evolução', className: 'landing-badge-muted' }
    default:
      return null
  }
}

export default function LandingRecursosPage() {
  return (
    <>
      <LandingSeo title="Recursos | BoxGestor" />
      <section className="landing-section">
        <div className="landing-container">
          <p className="landing-eyebrow">Recursos</p>
          <h1 className="landing-display mt-3 max-w-3xl text-4xl text-white sm:text-5xl">
            Tudo o que a oficina precisa, organizado por módulo
          </h1>
          <p className="mt-4 max-w-2xl text-[var(--lg-muted)]">
            Lista alinhada ao BoxGestor real. Recursos em desenvolvimento aparecem com aviso
            claro — sem inventar disponibilidade.
          </p>

          <div className="mt-10 grid gap-4 md:grid-cols-2">
            {RECURSOS_DETALHADOS.map((r) => {
              const badge = badgeStatus(r.status)
              return (
                <article key={r.id} id={r.id} className="landing-card scroll-mt-24 p-6">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-semibold text-white">{r.titulo}</h2>
                    {badge ? (
                      <span className={`landing-badge ${badge.className}`}>{badge.label}</span>
                    ) : null}
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-[var(--lg-muted)]">
                    {r.descricao}
                  </p>
                </article>
              )
            })}
          </div>

          <div className="mt-12 flex flex-col gap-3 sm:flex-row">
            <LandingCtaButton to={linkTestarBoxGestor()} variant="primary">
              Teste grátis por 15 dias
            </LandingCtaButton>
            <LandingCtaButton to="/landing-preview/planos" variant="ghost">
              Ver planos
            </LandingCtaButton>
          </div>
        </div>
      </section>
    </>
  )
}
