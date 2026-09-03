import { LandingSeo } from '@/marketing/landing/components/LandingSeo'
import { LandingCtaButton } from '@/marketing/landing/components/LandingCtaButton'
import {
  linkEntrarSistema,
  linkTestarBoxGestor,
  linkWhatsAppComercial,
} from '@/marketing/landing/lib/landing-links'
import { LandingFaq } from '@/marketing/landing/components/LandingFaq'
import { LANDING_LINKS } from '@/marketing/landing/content/landing-content'

export default function LandingContatoPage() {
  const whatsapp = linkWhatsAppComercial()
  const testar = linkTestarBoxGestor()
  const entrar = linkEntrarSistema()
  const temWhatsApp = Boolean(LANDING_LINKS.whatsappNumero.trim())
  const temEmail = Boolean(LANDING_LINKS.suporteEmail.trim())

  return (
    <>
      <LandingSeo title="Contato | BoxGestor" />
      <section className="landing-section">
        <div className="landing-container max-w-3xl">
          <p className="landing-eyebrow">Contato</p>
          <h1 className="landing-display mt-3 text-4xl text-white sm:text-5xl">
            Fale sobre a sua oficina
          </h1>
          <p className="mt-4 text-[var(--lg-muted)]">
            Suporte direto com o fundador na fase inicial e atendimento próximo durante a
            implantação, em horários combinados.
          </p>

          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            <article className="landing-card p-6">
              <h2 className="font-semibold text-white">E-mail</h2>
              {temEmail ? (
                <>
                  <p className="mt-2 text-sm text-[var(--lg-muted)]">Canal de suporte</p>
                  <a
                    className="mt-4 inline-block text-[var(--lg-orange)] hover:underline"
                    href={`mailto:${LANDING_LINKS.suporteEmail}`}
                  >
                    {LANDING_LINKS.suporteEmail}
                  </a>
                </>
              ) : (
                <p className="mt-2 text-sm text-[var(--lg-muted)]">
                  Contato comercial em breve. Quando o e-mail oficial estiver ativo, ele aparece
                  aqui.
                </p>
              )}
            </article>

            <article id="whatsapp" className="landing-card scroll-mt-24 p-6">
              <h2 className="font-semibold text-white">WhatsApp</h2>
              {temWhatsApp ? (
                <>
                  <p className="mt-2 text-sm text-[var(--lg-muted)]">
                    Conversa direta pelo WhatsApp comercial.
                  </p>
                  <div className="mt-4">
                    <LandingCtaButton href={whatsapp.href} external variant="primary">
                      Abrir WhatsApp
                    </LandingCtaButton>
                  </div>
                </>
              ) : (
                <p className="mt-2 text-sm text-[var(--lg-muted)]">
                  Número oficial ainda não configurado. Enquanto isso, use o teste de 15 dias ou
                  aguarde o canal comercial.
                </p>
              )}
            </article>
          </div>

          <div className="landing-card mt-8 p-6">
            <h2 className="font-semibold text-white">Quer testar agora?</h2>
            <p className="mt-2 text-sm text-[var(--lg-muted)]">
              Crie sua conta e use o BoxGestor por 15 dias, sem cartão de crédito.
            </p>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <LandingCtaButton {...testar} variant="primary">
                Testar por 15 dias
              </LandingCtaButton>
              <LandingCtaButton {...entrar} variant="ghost">
                Já tenho conta — Entrar
              </LandingCtaButton>
            </div>
          </div>
        </div>
      </section>

      <LandingFaq titulo="Dúvidas frequentes" />
    </>
  )
}
