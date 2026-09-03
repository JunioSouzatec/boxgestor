import { Check, Crown, Shield, User, Users } from 'lucide-react'
import { LandingSeo } from '@/marketing/landing/components/LandingSeo'
import { LandingCtaButton } from '@/marketing/landing/components/LandingCtaButton'
import { linkTestarBoxGestor } from '@/marketing/landing/lib/landing-links'
import { MODULO_FISCAL, PLANOS } from '@/marketing/landing/content/landing-content'

function formatPreco(valor: number) {
  return `R$ ${valor}`
}

export default function LandingPlanosPage() {
  return (
    <>
      <LandingSeo title="Planos | BoxGestor" />
      <section className="landing-section">
        <div className="landing-container">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="landing-eyebrow">Planos</p>
              <h1 className="landing-display mt-3 max-w-3xl text-4xl text-white sm:text-5xl">
                Escolha o plano ideal para sua oficina
              </h1>
              <p className="mt-4 max-w-2xl text-[var(--lg-muted)]">
                Do controle básico à gestão completa. Todos os planos são para uma oficina. Teste
                grátis por 15 dias, sem cartão de crédito.
              </p>
            </div>
            <div className="landing-card px-4 py-3 text-sm text-[var(--lg-muted)]">
              <Users size={16} className="mb-1 text-[var(--lg-orange)]" aria-hidden />
              Usuários adicionais conforme o plano contratado.
            </div>
          </div>

          <div className="landing-plan-grid mt-10">
            {PLANOS.map((plano) => (
              <article
                key={plano.id}
                data-tone={plano.tone}
                className="landing-card landing-plan-card flex flex-col"
              >
                {plano.badge ? (
                  <span className="landing-badge landing-badge-blue absolute -top-3 left-5">
                    ★ {plano.badge}
                  </span>
                ) : null}

                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/5">
                  {plano.tone === 'premium' ? (
                    <Crown size={18} className="text-[var(--lg-purple)]" aria-hidden />
                  ) : plano.tone === 'professional' ? (
                    <Users size={18} className="text-[var(--lg-blue)]" aria-hidden />
                  ) : (
                    <User size={18} className="text-[var(--lg-orange)]" aria-hidden />
                  )}
                </div>

                <h2 className="landing-display text-2xl uppercase tracking-wide text-white">
                  {plano.nome}
                </h2>
                <p className="mt-2 text-sm text-[var(--lg-muted)]">{plano.descricao}</p>
                <p className="mt-5">
                  <span className="landing-plan-price">{formatPreco(plano.preco)}</span>
                  <span className="text-[var(--lg-muted)]"> /mês</span>
                </p>
                <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1 text-xs text-[var(--lg-muted)]">
                  <User size={12} aria-hidden />
                  {plano.usuariosInclusos} usuário{plano.usuariosInclusos > 1 ? 's' : ''} incluído
                  {plano.usuariosInclusos > 1 ? 's' : ''}
                </p>

                <ul className="mt-6 flex-1 space-y-2">
                  {plano.itens.map((item) => (
                    <li key={item} className="flex gap-2 text-sm text-[var(--lg-muted)]">
                      <Check
                        size={15}
                        className={`mt-0.5 shrink-0 ${
                          plano.tone === 'professional'
                            ? 'text-[var(--lg-blue)]'
                            : plano.tone === 'premium'
                              ? 'text-[var(--lg-purple)]'
                              : 'text-[var(--lg-orange)]'
                        }`}
                        aria-hidden
                      />
                      <span>{item}</span>
                    </li>
                  ))}
                  {'itensFuturos' in plano && plano.itensFuturos
                    ? plano.itensFuturos.map((item) => (
                        <li key={item} className="flex gap-2 text-sm text-[var(--lg-muted)]/75">
                          <Check size={15} className="mt-0.5 shrink-0 text-white/25" aria-hidden />
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
                    Testar por 15 dias
                  </LandingCtaButton>
                </div>
              </article>
            ))}
          </div>

          <div className="landing-fiscal-band mt-10">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--lg-green)]/15">
                <Shield size={18} className="text-[var(--lg-green)]" aria-hidden />
              </span>
              <h2 className="landing-display text-2xl text-white">{MODULO_FISCAL.titulo}</h2>
              <span className="landing-badge">{MODULO_FISCAL.status}</span>
            </div>
            <p className="mt-2 text-sm text-[var(--lg-green)]">{MODULO_FISCAL.subtitulo}</p>
            <p className="mt-3 max-w-3xl text-sm text-[var(--lg-muted)]">{MODULO_FISCAL.descricao}</p>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {MODULO_FISCAL.objetivos.map((item) => (
                <li key={item} className="flex gap-2 text-sm text-[var(--lg-muted)]">
                  <Check size={15} className="mt-0.5 text-[var(--lg-green)]" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-[var(--lg-green)]">
              Fiscal adicional · Vendido separadamente quando disponível · Não incluso automaticamente
              nos planos
            </p>
          </div>

          <div className="landing-extras-bar mt-6">
            <p className="text-sm font-semibold text-white">
              Usuários adicionais — adicione quantos precisar
            </p>
            {PLANOS.map((p) => (
              <p key={p.id} className="text-sm text-[var(--lg-muted)]">
                + {formatPreco(p.usuarioExtra)} /mês{' '}
                <span className="text-white/80">({p.nome})</span>
              </p>
            ))}
            <p className="text-xs text-[var(--lg-muted)]">
              Os usuários adicionais têm os mesmos acessos do plano contratado.
            </p>
          </div>

          <p className="mt-8 text-center text-xs text-[var(--lg-muted)]">
            Preços por oficina. Todos os planos incluem atualizações e melhorias contínuas.
          </p>
        </div>
      </section>
    </>
  )
}
