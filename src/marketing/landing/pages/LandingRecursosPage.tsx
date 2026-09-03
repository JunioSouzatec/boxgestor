import {
  CalendarDays,
  ClipboardCheck,
  FileText,
  Link2,
  MessageCircle,
  Package,
  Shield,
  Users,
  Wallet,
  Wrench,
  BarChart3,
  Camera,
} from 'lucide-react'
import { LandingSeo } from '@/marketing/landing/components/LandingSeo'
import { LandingCtaButton } from '@/marketing/landing/components/LandingCtaButton'
import { LandingDeviceShowcase } from '@/marketing/landing/components/LandingDeviceShowcase'
import { linkTestarBoxGestor } from '@/marketing/landing/lib/landing-links'
import {
  RECURSOS_DETALHADOS,
  landingPath,
  type StatusRecurso,
} from '@/marketing/landing/content/landing-content'

const ICONES: Record<string, typeof Wrench> = {
  patio: Wrench,
  'clientes-veiculos': Users,
  orcamentos: FileText,
  aprovacao: Link2,
  os: ClipboardCheck,
  'fotos-checklist': Camera,
  agenda: CalendarDays,
  estoque: Package,
  financeiro: Wallet,
  equipe: Users,
  comunicacao: MessageCircle,
  relatorios: BarChart3,
  portal: Users,
  fiscal: Shield,
}

const DESTAQUE_IDS = new Set([
  'orcamentos',
  'aprovacao',
  'os',
  'fotos-checklist',
  'estoque',
  'financeiro',
  'agenda',
  'clientes-veiculos',
  'equipe',
  'comunicacao',
])

function badgeStatus(status: StatusRecurso) {
  switch (status) {
    case 'em_desenvolvimento':
      return { label: 'Em desenvolvimento', className: 'landing-badge' }
    case 'adicional':
      return { label: 'Em desenvolvimento', className: 'landing-badge' }
    case 'futuro':
      return { label: 'Em evolução', className: 'landing-badge-muted' }
    default:
      return null
  }
}

export default function LandingRecursosPage() {
  const principais = RECURSOS_DETALHADOS.filter((r) => r.status === 'disponivel')
  const especiais = RECURSOS_DETALHADOS.filter(
    (r) => r.status === 'em_desenvolvimento' || r.status === 'adicional'
  )
  const destacados = principais.filter((r) => DESTAQUE_IDS.has(r.id))
  const demais = principais.filter((r) => !DESTAQUE_IDS.has(r.id))

  return (
    <>
      <LandingSeo title="Recursos | BoxGestor" />
      <section className="landing-section">
        <div className="landing-container landing-split">
          <div>
            <p className="landing-eyebrow">Recursos</p>
            <h1 className="landing-display mt-3 max-w-3xl text-4xl text-white sm:text-5xl">
              Tudo o que sua oficina precisa,{' '}
              <span className="landing-accent">em um só sistema.</span>
            </h1>
            <p className="mt-4 max-w-2xl text-[var(--lg-muted)]">
              Módulos alinhados ao BoxGestor real. Recursos em desenvolvimento aparecem com aviso
              claro.
            </p>
          </div>
          <LandingDeviceShowcase compact />
        </div>

        <div className="landing-container mt-12">
          <div className="landing-grid-features landing-grid-recursos">
            {destacados.map((r, idx) => {
              const Icon = ICONES[r.id] ?? Wrench
              const featured = idx === 0
              return (
                <article
                  key={r.id}
                  id={r.id}
                  className={`landing-card landing-recurso-card scroll-mt-24 ${
                    featured ? 'landing-recurso-featured' : ''
                  }`}
                >
                  <div>
                    <div className="icon-wrap">
                      <Icon size={16} aria-hidden />
                    </div>
                    <h2 className="text-lg font-semibold text-white">{r.titulo}</h2>
                    <p className="mt-2 text-sm leading-relaxed text-[var(--lg-muted)]">
                      {r.descricao}
                    </p>
                  </div>
                  <div className="preview">
                    <div className="preview-pane">
                      <div className="mb-2 flex gap-1">
                        <span className="rounded bg-[var(--lg-orange-soft)] px-1.5 py-0.5 text-[8px] text-[var(--lg-orange)]">
                          UI
                        </span>
                        <span className="rounded bg-white/5 px-1.5 py-0.5 text-[8px] text-[var(--lg-muted)]">
                          exemplo
                        </span>
                      </div>
                      <div className="h-1.5 w-3/4 rounded bg-[var(--lg-orange)]/35" />
                      <div className="mt-1.5 h-1.5 w-1/2 rounded bg-white/10" />
                      <div className="mt-2 grid grid-cols-3 gap-1">
                        <span className="h-6 rounded bg-white/[0.04]" />
                        <span className="h-6 rounded bg-white/[0.04]" />
                        <span className="h-6 rounded bg-[var(--lg-orange)]/20" />
                      </div>
                    </div>
                  </div>
                </article>
              )
            })}
            {demais.map((r) => {
              const Icon = ICONES[r.id] ?? Wrench
              return (
                <article key={r.id} id={r.id} className="landing-card landing-recurso-card scroll-mt-24">
                  <div className="icon-wrap">
                    <Icon size={16} aria-hidden />
                  </div>
                  <h2 className="text-base font-semibold text-white">{r.titulo}</h2>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--lg-muted)]">{r.descricao}</p>
                </article>
              )
            })}
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {especiais.map((r) => {
              const badge = badgeStatus(r.status)
              return (
                <article key={r.id} id={r.id} className="landing-card scroll-mt-24 p-6">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-semibold text-white">{r.titulo}</h2>
                    {badge ? (
                      <span className={`landing-badge ${badge.className}`}>{badge.label}</span>
                    ) : null}
                  </div>
                  {r.id === 'fiscal' ? (
                    <p className="mt-2 text-xs text-[var(--lg-orange)]">Adicional para qualquer plano</p>
                  ) : null}
                  <p className="mt-3 text-sm leading-relaxed text-[var(--lg-muted)]">{r.descricao}</p>
                </article>
              )
            })}
          </div>

          <p className="mt-10 flex items-center justify-center gap-2 text-center text-sm text-[var(--lg-muted)]">
            <Shield size={14} className="text-[var(--lg-orange)]" aria-hidden />
            Recursos em constante evolução para acompanhar a rotina da sua oficina.
          </p>

          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <LandingCtaButton {...linkTestarBoxGestor()} variant="primary">
              Teste grátis por 15 dias
            </LandingCtaButton>
            <LandingCtaButton to={landingPath('planos')} variant="ghost">
              Ver planos
            </LandingCtaButton>
          </div>
        </div>
      </section>
    </>
  )
}
