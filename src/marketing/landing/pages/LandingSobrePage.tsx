import { LandingSeo } from '@/marketing/landing/components/LandingSeo'
import { LandingCtaButton } from '@/marketing/landing/components/LandingCtaButton'
import { linkTestarBoxGestor } from '@/marketing/landing/lib/landing-links'
import { LANDING_BRAND, SOBRE } from '@/marketing/landing/content/landing-content'

export default function LandingSobrePage() {
  return (
    <>
      <LandingSeo title="Sobre | BoxGestor" />
      <section className="landing-section">
        <div className="landing-container max-w-3xl">
          <p className="landing-eyebrow">Sobre</p>
          <h1 className="landing-display mt-3 text-4xl text-white sm:text-5xl">{SOBRE.titulo}</h1>
          <p className="mt-6 text-lg leading-relaxed text-[var(--lg-muted)]">{SOBRE.texto}</p>
          <p className="landing-display mt-8 text-2xl text-white sm:text-3xl">
            {SOBRE.posicionamento.split('.').slice(0, 2).join('.')}.
            <br />
            <span className="landing-accent">
              {SOBRE.posicionamento.split('.').slice(2).join('.').trim()}
            </span>
          </p>
          <p className="mt-4 text-[var(--lg-muted)]">{SOBRE.escolha}</p>
          <p className="mt-2 text-sm uppercase tracking-[0.14em] text-[var(--lg-muted)]">
            {LANDING_BRAND.slogan}
          </p>

          <ul className="mt-10 flex flex-wrap gap-2">
            {SOBRE.pilares.map((pilar) => (
              <li
                key={pilar}
                className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-white"
              >
                {pilar}
              </li>
            ))}
          </ul>

          <div className="landing-card mt-12 p-6">
            <h2 className="text-lg font-semibold text-white">Posicionamento</h2>
            <p className="mt-3 text-sm leading-relaxed text-[var(--lg-muted)]">
              Fácil de usar, completo e profissional — feito para a rotina real da oficina, com
              organização e controle em um único sistema.
            </p>
            <div className="mt-6">
              <LandingCtaButton {...linkTestarBoxGestor()} variant="primary">
                Testar BoxGestor
              </LandingCtaButton>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
