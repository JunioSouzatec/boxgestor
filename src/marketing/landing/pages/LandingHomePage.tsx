import {
  CheckCircle2,
  Smartphone,
  Wrench,
  ArrowRight,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { LandingCtaButton } from '@/marketing/landing/components/LandingCtaButton'
import {
  linkTestarBoxGestor,
  linkWhatsAppComercial,
} from '@/marketing/landing/lib/landing-links'
import { LandingDeviceShowcase } from '@/marketing/landing/components/LandingDeviceShowcase'
import { LandingFaq } from '@/marketing/landing/components/LandingFaq'
import { LandingSeo } from '@/marketing/landing/components/LandingSeo'
import {
  COMO_FUNCIONA_PASSOS,
  CTA_FINAL,
  DIFERENCIAIS,
  HERO,
  LANDING_BASE,
  LANDING_BRAND,
  PROBLEMAS,
  RECURSOS_PRINCIPAIS,
  SEGURANCA,
  SOLUCAO_FECHAMENTO,
} from '@/marketing/landing/content/landing-content'

const iconesDestaque = [Wrench, Smartphone, CheckCircle2]

export default function LandingHomePage() {
  const whatsapp = linkWhatsAppComercial()

  return (
    <>
      <LandingSeo title={LANDING_BRAND.title} />

      {/* HERO — uma composição */}
      <section className="relative overflow-hidden border-b border-white/5">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(255,122,0,0.18),_transparent_55%)]"
          aria-hidden
        />
        <div className="landing-container grid items-center gap-10 py-14 lg:grid-cols-[1.05fr_0.95fr] lg:py-20">
          <div className="landing-fade-up relative z-10 max-w-xl">
            <p className="landing-eyebrow">{LANDING_BRAND.name}</p>
            <h1 className="landing-display mt-4 text-4xl leading-[1.05] text-white sm:text-5xl lg:text-[3.35rem]">
              {HERO.titulo}
            </h1>
            <p className="mt-5 text-base leading-relaxed text-[var(--lg-muted)] sm:text-lg">
              {HERO.texto}
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <LandingCtaButton to={linkTestarBoxGestor()} variant="primary">
                Testar BoxGestor
              </LandingCtaButton>
              <LandingCtaButton
                href={whatsapp.href}
                external={whatsapp.external}
                variant="ghost"
              >
                Falar pelo WhatsApp
              </LandingCtaButton>
            </div>
            <ul className="mt-8 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-4">
              {HERO.destaques.map((item, i) => {
                const Icon = iconesDestaque[i] ?? CheckCircle2
                return (
                  <li
                    key={item}
                    className="inline-flex items-center gap-2 text-sm text-[var(--lg-muted)]"
                  >
                    <Icon size={16} className="text-[var(--lg-orange)]" aria-hidden />
                    {item}
                  </li>
                )
              })}
            </ul>
            <p className="mt-6 text-xs text-[var(--lg-muted)]">
              Teste grátis por 15 dias · Sem cartão de crédito
            </p>
          </div>

          <div className="landing-fade-up relative pb-10 lg:pb-4" style={{ animationDelay: '120ms' }}>
            <LandingDeviceShowcase />
          </div>
        </div>
      </section>

      {/* Problema → Solução */}
      <section className="landing-section">
        <div className="landing-container grid gap-10 lg:grid-cols-2">
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
          <div className="landing-card flex flex-col justify-center p-6 sm:p-8">
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

      {/* Recursos principais */}
      <section className="landing-section border-y border-white/5 bg-black/20">
        <div className="landing-container">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="landing-eyebrow">Recursos</p>
              <h2 className="landing-display mt-3 text-3xl text-white sm:text-4xl">
                O essencial da operação, em módulos claros
              </h2>
            </div>
            <LandingCtaButton to={`${LANDING_BASE}/recursos`} variant="ghost">
              Ver todos os recursos
              <ArrowRight size={16} aria-hidden />
            </LandingCtaButton>
          </div>
          <div className="landing-grid-features mt-10">
            {RECURSOS_PRINCIPAIS.map((r) => (
              <article key={r.id} className="landing-card p-5">
                <h3 className="text-base font-semibold text-white">{r.titulo}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--lg-muted)]">{r.descricao}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Demonstração */}
      <section className="landing-section">
        <div className="landing-container text-center">
          <p className="landing-eyebrow justify-center">Demonstração</p>
          <h2 className="landing-display mx-auto mt-3 max-w-2xl text-3xl text-white sm:text-4xl">
            Interface pensada para desktop e celular
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-[var(--lg-muted)]">
            Visual ilustrativo baseado na experiência real do BoxGestor. Os números abaixo são
            apenas exemplo.
          </p>
          <div className="mt-12 pb-8">
            <LandingDeviceShowcase />
          </div>
        </div>
      </section>

      {/* Diferenciais */}
      <section className="landing-section border-y border-white/5 bg-black/20">
        <div className="landing-container">
          <p className="landing-eyebrow">Diferenciais</p>
          <h2 className="landing-display mt-3 max-w-2xl text-3xl text-white sm:text-4xl">
            Recursos que fazem diferença na rotina
          </h2>
          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {DIFERENCIAIS.map((d) => (
              <article key={d.titulo} className="landing-card p-5">
                <h3 className="font-semibold text-white">{d.titulo}</h3>
                <p className="mt-2 text-sm text-[var(--lg-muted)]">{d.descricao}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Como funciona */}
      <section className="landing-section">
        <div className="landing-container">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="landing-eyebrow">Como funciona</p>
              <h2 className="landing-display mt-3 text-3xl text-white sm:text-4xl">
                Quatro passos para colocar a oficina sob controle
              </h2>
            </div>
            <Link
              to={`${LANDING_BASE}/como-funciona`}
              className="text-sm font-semibold text-[var(--lg-orange)] hover:underline"
            >
              Ver fluxo completo
            </Link>
          </div>
          <ol className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {COMO_FUNCIONA_PASSOS.map((passo) => (
              <li key={passo.passo} className="landing-card p-5">
                <span className="landing-display text-3xl text-[var(--lg-orange)]">
                  {String(passo.passo).padStart(2, '0')}
                </span>
                <h3 className="mt-3 font-semibold text-white">{passo.titulo}</h3>
                <p className="mt-2 text-sm text-[var(--lg-muted)]">{passo.descricao}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Planos teaser */}
      <section className="landing-section border-y border-white/5 bg-black/20">
        <div className="landing-container text-center">
          <p className="landing-eyebrow justify-center">Planos</p>
          <h2 className="landing-display mt-3 text-3xl text-white sm:text-4xl">
            Essencial, Profissional e Premium
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-[var(--lg-muted)]">
            Todos os planos são para uma oficina. Usuários adicionais podem ser contratados
            conforme o plano. O Módulo Fiscal é adicional e está em desenvolvimento.
          </p>
          <div className="mt-8">
            <LandingCtaButton to={`${LANDING_BASE}/planos`} variant="primary">
              Ver planos e preços
            </LandingCtaButton>
          </div>
        </div>
      </section>

      {/* Segurança */}
      <section className="landing-section">
        <div className="landing-container grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <p className="landing-eyebrow">Segurança</p>
            <h2 className="landing-display mt-3 text-3xl text-white">{SEGURANCA.titulo}</h2>
            <p className="mt-4 text-[var(--lg-muted)]">
              Práticas reais do produto — sem promessas absolutas.
            </p>
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

      {/* CTA final */}
      <section className="landing-section border-t border-white/5">
        <div className="landing-container">
          <div className="landing-card relative overflow-hidden px-6 py-10 text-center sm:px-10 sm:py-14">
            <div
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(255,122,0,0.16),_transparent_60%)]"
              aria-hidden
            />
            <div className="relative">
              <h2 className="landing-display text-3xl text-white sm:text-4xl">{CTA_FINAL.titulo}</h2>
              <p className="mx-auto mt-4 max-w-2xl text-[var(--lg-muted)]">{CTA_FINAL.texto}</p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <LandingCtaButton to={linkTestarBoxGestor()} variant="primary">
                  {CTA_FINAL.botao}
                </LandingCtaButton>
                <LandingCtaButton to={`${LANDING_BASE}/contato`} variant="ghost">
                  Falar com o time
                </LandingCtaButton>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
