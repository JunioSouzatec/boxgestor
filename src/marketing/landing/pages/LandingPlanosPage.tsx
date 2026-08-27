import { Check } from 'lucide-react'
import { LandingSeo } from '@/marketing/landing/components/LandingSeo'
import { LandingCtaButton } from '@/marketing/landing/components/LandingCtaButton'
import { linkTestarBoxGestor } from '@/marketing/landing/lib/landing-links'
import { MODULO_FISCAL, PLANOS } from '@/marketing/landing/content/landing-content'

function formatPreco(valor: number) {
  return `R$${valor}`
}

export default function LandingPlanosPage() {
  return (
    <>
      <LandingSeo title="Planos | BoxGestor" />
      <section className="landing-section">
        <div className="landing-container">
          <p className="landing-eyebrow">Planos</p>
          <h1 className="landing-display mt-3 max-w-3xl text-4xl text-white sm:text-5xl">
            Escolha o plano da sua oficina
          </h1>
          <p className="mt-4 max-w-2xl text-[var(--lg-muted)]">
            Todos os planos são para uma oficina. Usuários adicionais podem ser contratados à
            parte. Teste grátis por 15 dias, sem cartão de crédito.
          </p>

          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {PLANOS.map((plano) => (
              <article
                key={plano.id}
                className={`landing-card relative flex flex-col p-6 ${
                  plano.destaque ? 'border-[var(--lg-orange)]/50 ring-1 ring-[var(--lg-orange)]/40' : ''
                }`}
              >
                {plano.badge ? (
                  <span className="landing-badge absolute -top-3 left-6">{plano.badge}</span>
                ) : null}
                <h2 className="landing-display text-2xl text-white">{plano.nome}</h2>
                <p className="mt-2 text-sm text-[var(--lg-muted)]">{plano.descricao}</p>
                <p className="mt-5">
                  <span className="landing-display text-4xl text-white">
                    {formatPreco(plano.preco)}
                  </span>
                  <span className="text-[var(--lg-muted)]">/mês</span>
                </p>
                <p className="mt-2 text-sm text-[var(--lg-muted)]">
                  {plano.usuariosInclusos} usuário{plano.usuariosInclusos > 1 ? 's' : ''} incluído
                  {plano.usuariosInclusos > 1 ? 's' : ''}
                </p>
                <p className="text-sm text-[var(--lg-muted)]">
                  + {formatPreco(plano.usuarioExtra)}/mês por usuário adicional
                </p>

                <ul className="mt-6 flex-1 space-y-2.5">
                  {plano.itens.map((item) => (
                    <li key={item} className="flex gap-2 text-sm text-[var(--lg-muted)]">
                      <Check size={16} className="mt-0.5 shrink-0 text-[var(--lg-orange)]" aria-hidden />
                      <span>{item}</span>
                    </li>
                  ))}
                  {'itensFuturos' in plano && plano.itensFuturos
                    ? plano.itensFuturos.map((item) => (
                        <li key={item} className="flex gap-2 text-sm text-[var(--lg-muted)]/80">
                          <Check size={16} className="mt-0.5 shrink-0 text-white/30" aria-hidden />
                          <span>{item}</span>
                        </li>
                      ))
                    : null}
                </ul>

                <div className="mt-8">
                  <LandingCtaButton
                    to={linkTestarBoxGestor()}
                    variant={plano.destaque ? 'primary' : 'ghost'}
                    className="w-full"
                  >
                    Teste grátis por 15 dias
                  </LandingCtaButton>
                </div>
              </article>
            ))}
          </div>

          {/* Fiscal separado — não vinculado ao Premium */}
          <div className="landing-card mt-10 border-[var(--lg-orange)]/25 p-6 sm:p-8">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="landing-display text-2xl text-white">{MODULO_FISCAL.titulo}</h2>
              <span className="landing-badge">{MODULO_FISCAL.subtitulo}</span>
              <span className="landing-badge landing-badge-muted">{MODULO_FISCAL.status}</span>
            </div>
            <p className="mt-4 max-w-3xl text-[var(--lg-muted)]">{MODULO_FISCAL.descricao}</p>
            <p className="mt-2 text-sm text-white/90">{MODULO_FISCAL.precoLabel}</p>
            <ul className="mt-5 grid gap-2 sm:grid-cols-2">
              {MODULO_FISCAL.objetivos.map((item) => (
                <li key={item} className="flex gap-2 text-sm text-[var(--lg-muted)]">
                  <Check size={16} className="mt-0.5 shrink-0 text-[var(--lg-orange)]" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
            <ul className="mt-5 space-y-1 text-xs text-[var(--lg-muted)]">
              {MODULO_FISCAL.avisos.map((aviso) => (
                <li key={aviso}>• {aviso}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </>
  )
}
