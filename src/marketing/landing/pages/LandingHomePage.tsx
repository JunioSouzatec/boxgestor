import {
  BarChart3,
  CheckCircle2,
  Clock3,
  Eye,
  LayoutGrid,
  MessageCircle,
  Monitor,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { LandingCtaButton } from '@/marketing/landing/components/LandingCtaButton'
import {
  linkTestarBoxGestor,
  linkWhatsAppComercial,
} from '@/marketing/landing/lib/landing-links'
import { LandingDeviceShowcase, StepUiPreview } from '@/marketing/landing/components/LandingDeviceShowcase'
import { LandingFaq } from '@/marketing/landing/components/LandingFaq'
import {
  LandingComunicacaoShowcase,
  LandingFiscalShowcase,
  LandingPortalShowcase,
  LandingRelatoriosShowcase,
} from '@/marketing/landing/components/LandingFeatureShowcases'
import { LandingSeo } from '@/marketing/landing/components/LandingSeo'
import {
  BENEFICIOS_HOME,
  CTA_FINAL,
  COMO_FUNCIONA_PASSOS,
  DIFERENCIAIS,
  HERO,
  LANDING_BRAND,
  PROBLEMAS,
  RECURSOS_PRINCIPAIS,
  SEGURANCA,
  SOBRE,
  SOLUCAO_FECHAMENTO,
  landingPath,
} from '@/marketing/landing/content/landing-content'

const iconesBeneficio = [LayoutGrid, Clock3, BarChart3, Eye]

export default function LandingHomePage() {
  const whatsapp = linkWhatsAppComercial()
  const testar = linkTestarBoxGestor()

  return (
    <>
      <LandingSeo title={LANDING_BRAND.title} />

      <section className="landing-hero">
        <div className="landing-container-wide landing-hero-grid">
          <div className="landing-fade-up max-w-xl lg:max-w-none lg:pr-4">
            <h1 className="landing-display text-[2.35rem] leading-[1.05] text-white sm:text-5xl lg:text-[3.55rem]">
              {HERO.tituloAntes}{' '}
              <span className="landing-accent">{HERO.tituloDestaque}</span>
            </h1>
            <p className="mt-5 max-w-lg text-base leading-relaxed text-[var(--lg-muted)] sm:text-lg">
              {HERO.texto}
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <LandingCtaButton {...testar} variant="primary" className="min-h-12 px-6">
                <Monitor size={17} aria-hidden />
                Testar por 15 dias
              </LandingCtaButton>
              <LandingCtaButton
                href={whatsapp.href}
                external={whatsapp.external}
                variant="ghost"
                className="min-h-12 px-6"
              >
                <MessageCircle size={17} aria-hidden />
                Falar sobre minha oficina
              </LandingCtaButton>
            </div>
            <ul className="mt-8 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:gap-5">
              {HERO.destaques.map((item) => (
                <li
                  key={item}
                  className="inline-flex items-center gap-2 text-sm text-[var(--lg-muted)]"
                >
                  <CheckCircle2 size={16} className="text-[var(--lg-orange)]" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
            <p className="mt-6 text-xs text-[var(--lg-muted)]">
              Teste grátis por 15 dias · Sem cartão de crédito
            </p>
          </div>

          <div className="landing-fade-up" style={{ animationDelay: '90ms' }}>
            <LandingDeviceShowcase />
          </div>
        </div>
        <div className="landing-hero-glow" aria-hidden />
      </section>

      <div className="landing-container">
        <div className="landing-benefits">
          {BENEFICIOS_HOME.map((b, i) => {
            const Icon = iconesBeneficio[i] ?? LayoutGrid
            return (
              <article key={b.titulo} className="landing-benefit-card">
                <Icon size={20} className="text-[var(--lg-orange)]" aria-hidden />
                <h3>{b.titulo}</h3>
                <p>{b.descricao}</p>
              </article>
            )
          })}
        </div>
      </div>

      <section className="landing-section">
        <div className="landing-container landing-split">
          <div>
            <p className="landing-eyebrow">O desafio</p>
            <h2 className="landing-display mt-3 text-3xl text-white sm:text-4xl">
              A rotina da oficina sem um sistema central
            </h2>
            <ul className="mt-6 space-y-3">
              {PROBLEMAS.map((item) => (
                <li
                  key={item}
                  className="flex gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3 text-sm text-[var(--lg-muted)]"
                >
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[var(--lg-orange)]" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="landing-card relative overflow-hidden p-6 sm:p-8">
            <div
              className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-[var(--lg-orange)]/15 blur-3xl"
              aria-hidden
            />
            <p className="landing-eyebrow">A solução</p>
            <h2 className="landing-display mt-3 text-3xl text-white">BoxGestor</h2>
            <p className="mt-4 text-[var(--lg-muted)]">
              Um sistema pensado para a operação real da oficina: do atendimento ao financeiro,
              com fluxo entre módulos e acesso no computador e no celular.
            </p>
            <p className="mt-6 text-lg font-semibold text-white">{SOLUCAO_FECHAMENTO}</p>
          </div>
        </div>
      </section>

      <section className="landing-section landing-section-alt">
        <div className="landing-container">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="landing-eyebrow">Recursos</p>
              <h2 className="landing-display mt-3 text-3xl text-white sm:text-4xl">
                Tudo o que sua oficina precisa,{' '}
                <span className="landing-accent">em um só sistema.</span>
              </h2>
            </div>
            <LandingCtaButton to={landingPath('recursos')} variant="ghost">
              Ver todos os recursos
            </LandingCtaButton>
          </div>
          <div className="landing-grid-features landing-grid-recursos mt-10">
            {RECURSOS_PRINCIPAIS.map((r) => (
              <article key={r.id} className="landing-card landing-recurso-card">
                <div className="icon-wrap">
                  <LayoutGrid size={16} aria-hidden />
                </div>
                <h3 className="text-base font-semibold text-white">{r.titulo}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--lg-muted)]">{r.descricao}</p>
                <div className="preview">
                  <div className="preview-pane">
                    <div className="h-1.5 w-2/3 rounded bg-[var(--lg-orange)]/40" />
                    <div className="mt-1.5 h-1.5 w-1/2 rounded bg-white/10" />
                    <div className="mt-2 flex gap-1">
                      <span className="h-5 flex-1 rounded bg-white/[0.04]" />
                      <span className="h-5 flex-1 rounded bg-white/[0.04]" />
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-section">
        <div className="landing-container">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="landing-eyebrow">Como funciona</p>
              <h2 className="landing-display mt-3 max-w-2xl text-3xl text-white sm:text-4xl">
                Comece a usar em poucos passos e transforme{' '}
                <span className="landing-accent">a rotina da sua oficina.</span>
              </h2>
            </div>
            <Link
              to={landingPath('como-funciona')}
              className="text-sm font-semibold text-[var(--lg-orange)] hover:underline"
            >
              Ver fluxo completo
            </Link>
          </div>
          <ol className="landing-steps mt-10">
            {COMO_FUNCIONA_PASSOS.map((passo) => (
              <li key={passo.passo} className="landing-card landing-step-card landing-recurso-card">
                <span className="landing-step-num">{passo.passo}</span>
                <h3 className="mt-3 font-semibold text-white">{passo.titulo}</h3>
                <p className="mt-2 text-sm text-[var(--lg-muted)]">{passo.descricao}</p>
                <div className="preview mt-4">
                  <StepUiPreview step={passo.passo as 1 | 2 | 3 | 4} />
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <LandingComunicacaoShowcase />
      <LandingRelatoriosShowcase />

      <section className="landing-section">
        <div className="landing-container">
          <p className="landing-eyebrow">Diferenciais</p>
          <h2 className="landing-display mt-3 max-w-2xl text-3xl text-white sm:text-4xl">
            Recursos que fazem diferença na rotina
          </h2>
          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {DIFERENCIAIS.map((d) => (
              <article key={d.titulo} className="landing-card p-5">
                <div className="mb-3 h-px w-10 bg-[var(--lg-orange)]" />
                <h3 className="font-semibold text-white">{d.titulo}</h3>
                <p className="mt-2 text-sm text-[var(--lg-muted)]">{d.descricao}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <LandingPortalShowcase />
      <LandingFiscalShowcase />

      <section className="landing-section landing-section-alt">
        <div className="landing-container text-center">
          <p className="landing-eyebrow justify-center">Gestão</p>
          <h2 className="landing-display mt-3 text-3xl text-white sm:text-5xl">
            Mais controle.
            <br />
            Mais eficiência.
            <br />
            <span className="landing-accent">Mais resultados.</span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-[var(--lg-muted)]">{SOBRE.escolha}</p>
          <div className="mt-8">
            <LandingCtaButton to={landingPath('planos')} variant="primary">
              Ver planos
            </LandingCtaButton>
          </div>
        </div>
      </section>

      <section className="landing-section">
        <div className="landing-container landing-split">
          <div>
            <p className="landing-eyebrow">Segurança</p>
            <h2 className="landing-display mt-3 text-3xl text-white">{SEGURANCA.titulo}</h2>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {SEGURANCA.itens.map((item) => (
              <li
                key={item}
                className="flex items-start gap-2 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3 text-sm text-[var(--lg-muted)]"
              >
                <CheckCircle2 size={16} className="mt-0.5 text-[var(--lg-orange)]" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <LandingFaq />

      <section className="landing-section border-t border-white/5">
        <div className="landing-container">
          <div className="landing-card relative overflow-hidden px-6 py-12 text-center sm:px-10 sm:py-16">
            <div
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(255,122,0,0.18),_transparent_58%)]"
              aria-hidden
            />
            <div className="relative">
              <h2 className="landing-display text-3xl text-white sm:text-4xl">{CTA_FINAL.titulo}</h2>
              <p className="mx-auto mt-4 max-w-2xl text-[var(--lg-muted)]">{CTA_FINAL.texto}</p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <LandingCtaButton {...testar} variant="primary" className="min-h-12 px-7">
                  {CTA_FINAL.botao}
                </LandingCtaButton>
                <LandingCtaButton to={landingPath('contato')} variant="ghost">
                  {CTA_FINAL.botaoSecundario}
                </LandingCtaButton>
              </div>
              <p className="mt-4 text-xs text-[var(--lg-muted)]">Sem cartão de crédito</p>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
