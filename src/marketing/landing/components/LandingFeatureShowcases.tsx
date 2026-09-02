import {
  BarChart3,
  CalendarRange,
  CheckCircle2,
  Eye,
  FileText,
  Link2,
  Lock,
  Shield,
  Upload,
} from 'lucide-react'
import { LandingCtaButton } from '@/marketing/landing/components/LandingCtaButton'
import {
  DemoTag,
  LandingDeviceShowcase,
} from '@/marketing/landing/components/LandingDeviceShowcase'
import { linkTestarBoxGestor } from '@/marketing/landing/lib/landing-links'
import {
  MODULO_FISCAL,
  PORTAL_SECAO,
  RELATORIOS_SECAO,
} from '@/marketing/landing/content/landing-content'

export function LandingRelatoriosShowcase() {
  return (
    <section className="landing-section landing-section-alt">
      <div className="landing-container landing-split">
        <div>
          <p className="landing-eyebrow">Relatórios</p>
          <h2 className="landing-display mt-3 text-3xl text-white sm:text-4xl lg:text-[2.75rem]">
            Informações que <span className="landing-accent">geram decisões.</span>
          </h2>
          <p className="mt-4 text-[var(--lg-muted)]">{RELATORIOS_SECAO.texto}</p>
          <ul className="mt-7 space-y-4">
            {RELATORIOS_SECAO.destaques.map((item) => (
              <li key={item.titulo} className="flex gap-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--lg-orange-soft)] text-[var(--lg-orange)]">
                  {item.icone === 'filter' ? (
                    <CalendarRange size={17} />
                  ) : item.icone === 'pdf' ? (
                    <FileText size={17} />
                  ) : (
                    <BarChart3 size={17} />
                  )}
                </span>
                <div>
                  <p className="font-semibold text-white">{item.titulo}</p>
                  <p className="text-sm text-[var(--lg-muted)]">{item.descricao}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <LandingDeviceShowcase variant="relatorios" />
      </div>

      <div className="landing-container mt-10">
        <div className="landing-pillars">
          {RELATORIOS_SECAO.pilares.map((p) => (
            <div key={p} className="landing-benefit-card">
              <CheckCircle2 size={18} className="text-[var(--lg-orange)]" aria-hidden />
              <h3>{p}</h3>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export function LandingFiscalShowcase() {
  return (
    <section className="landing-section">
      <div className="landing-container landing-split">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="landing-eyebrow">Módulo Fiscal</p>
            <span className="landing-badge">{MODULO_FISCAL.status}</span>
          </div>
          <h2 className="landing-display mt-3 text-3xl text-white sm:text-4xl">
            Módulo fiscal <span className="landing-accent">em preparação</span> — adicional e
            separado dos planos.
          </h2>
          <p className="mt-4 text-[var(--lg-muted)]">{MODULO_FISCAL.descricao}</p>
          <ul className="mt-6 space-y-3">
            {MODULO_FISCAL.objetivos.map((item) => (
              <li key={item} className="flex gap-2 text-sm text-[var(--lg-muted)]">
                <FileText size={16} className="mt-0.5 text-[var(--lg-orange)]" aria-hidden />
                {item}
              </li>
            ))}
            <li className="flex gap-2 text-sm text-[var(--lg-orange)]">
              <CalendarRange size={16} className="mt-0.5" aria-hidden />
              Módulo em desenvolvimento — prévia conceitual
            </li>
          </ul>
          <p className="mt-4 text-xs text-[var(--lg-muted)]">{MODULO_FISCAL.subtitulo}</p>
        </div>

        <div className="relative" aria-hidden="true">
          <div className="mb-3 flex justify-center sm:justify-start">
            <DemoTag label="Prévia do módulo — dados de exemplo" />
          </div>
          <div className="landing-laptop">
            <div className="landing-laptop-bezel">
              <div className="landing-laptop-screen">
                <div className="flex items-center justify-between border-b border-white/5 px-3 py-2">
                  <div>
                    <p className="text-sm font-semibold text-white">Fiscal</p>
                    <p className="text-[10px] text-[var(--lg-muted)]">Prévia do módulo</p>
                  </div>
                  <span className="landing-badge">Em desenvolvimento</span>
                </div>
                <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3">
                  {[
                    { l: 'Rascunho', i: FileText },
                    { l: 'Conferir', i: Eye },
                    { l: 'Organizar', i: Shield },
                    { l: 'Relatórios', i: BarChart3 },
                    { l: 'Evolução', i: Upload },
                  ].map(({ l, i: Icon }) => (
                    <div
                      key={l}
                      className="rounded-lg border border-white/5 bg-black/35 px-3 py-3 text-center"
                    >
                      <Icon size={15} className="mx-auto text-[var(--lg-orange)]" />
                      <p className="mt-2 text-[11px] text-white/90">{l}</p>
                    </div>
                  ))}
                </div>
                <p className="border-t border-white/5 px-3 py-2 text-[10px] text-[var(--lg-muted)]">
                  Funcionalidades poderão mudar até a versão final. Não representa emissão pronta.
                </p>
              </div>
            </div>
            <div className="landing-laptop-base" />
          </div>
        </div>
      </div>

      <div className="landing-container mt-10">
        <div className="landing-card grid gap-6 p-6 sm:grid-cols-[1fr_auto] sm:items-center">
          <div>
            <p className="text-sm text-[var(--lg-muted)]">
              O módulo fiscal está <span className="font-semibold text-white">em desenvolvimento</span>{' '}
              e vem aí para <span className="landing-accent">simplificar ainda mais</span> sua
              rotina.
            </p>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {MODULO_FISCAL.objetivos.map((item) => (
                <li key={item} className="flex gap-2 text-sm text-[var(--lg-muted)]">
                  <CheckCircle2 size={15} className="mt-0.5 text-[var(--lg-orange)]" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <LandingCtaButton to={linkTestarBoxGestor()} variant="primary">
            Testar por 15 dias
          </LandingCtaButton>
        </div>
      </div>
    </section>
  )
}

export function LandingPortalShowcase() {
  return (
    <section className="landing-section landing-section-alt">
      <div className="landing-container landing-split">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="landing-eyebrow">Portal do Cliente</p>
            <span className="landing-badge">{PORTAL_SECAO.status}</span>
          </div>
          <h2 className="landing-display mt-3 text-3xl text-white sm:text-4xl">
            Um portal exclusivo <span className="landing-accent">para seus clientes.</span>
          </h2>
          <p className="mt-4 text-[var(--lg-muted)]">{PORTAL_SECAO.texto}</p>

          <div className="mt-7 grid gap-5 sm:grid-cols-2">
            <div className="landing-card p-4">
              <p className="text-sm font-semibold text-white">Disponível hoje</p>
              <ul className="mt-3 space-y-2">
                {PORTAL_SECAO.disponivelHoje.map((i) => (
                  <li key={i} className="flex gap-2 text-sm text-[var(--lg-muted)]">
                    <Link2 size={15} className="mt-0.5 text-[var(--lg-orange)]" aria-hidden />
                    {i}
                  </li>
                ))}
              </ul>
            </div>
            <div className="landing-card p-4">
              <p className="text-sm font-semibold text-white">Em desenvolvimento</p>
              <ul className="mt-3 space-y-2">
                {PORTAL_SECAO.emDesenvolvimento.map((i) => (
                  <li key={i} className="flex gap-2 text-sm text-[var(--lg-muted)]">
                    <Eye size={15} className="mt-0.5 text-[var(--lg-orange)]" aria-hidden />
                    {i}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="relative" aria-hidden="true">
          <div className="mb-3 flex justify-center">
            <DemoTag label="Prévia conceitual — em desenvolvimento" />
          </div>
          <div className="landing-device-stage max-w-none">
            <div className="landing-laptop">
              <div className="landing-laptop-bezel">
                <div className="landing-laptop-screen p-3">
                  <p className="text-xs text-[var(--lg-muted)]">Olá, João Silva!</p>
                  <p className="mt-1 text-sm font-semibold text-white">
                    Acompanhe veículos e serviços
                  </p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <div className="rounded-lg border border-white/5 bg-white/[0.03] p-3">
                      <p className="text-[10px] text-[var(--lg-muted)]">Veículo</p>
                      <p className="mt-1 text-xs text-white">Honda CG 160</p>
                      <span className="mt-2 inline-flex rounded-full bg-emerald-500/15 px-2 py-0.5 text-[9px] text-emerald-300">
                        Em andamento
                      </span>
                    </div>
                    <div className="rounded-lg border border-white/5 bg-white/[0.03] p-3">
                      <p className="text-[10px] text-[var(--lg-muted)]">Orçamento</p>
                      <p className="mt-1 text-xs text-white">#1257</p>
                      <span className="mt-2 inline-flex rounded-full bg-[var(--lg-orange-soft)] px-2 py-0.5 text-[9px] text-[var(--lg-orange)]">
                        Aguardando aprovação
                      </span>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-2 text-[10px] text-[var(--lg-muted)]">
                    <Lock size={12} />
                    Acesso por link · visão conceitual
                  </div>
                </div>
              </div>
              <div className="landing-laptop-base" />
            </div>
            <div className="landing-phone">
              <div className="landing-phone-notch" />
              <div className="space-y-1.5 p-2.5 pb-3">
                <p className="text-[9px] text-[var(--lg-muted)]">Portal</p>
                <p className="text-[11px] font-semibold text-white">Meus serviços</p>
                <div className="rounded-md border border-white/5 bg-white/[0.03] px-2 py-1.5 text-[9px] text-[var(--lg-muted)]">
                  Orçamento · aprovação
                </div>
                <div className="rounded-md border border-white/5 bg-white/[0.03] px-2 py-1.5 text-[9px] text-[var(--lg-muted)]">
                  OS · em andamento
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="landing-container mt-10">
        <div className="landing-pillars">
          {PORTAL_SECAO.pilares.map((p) => (
            <div key={p} className="landing-benefit-card">
              <Shield size={18} className="text-[var(--lg-orange)]" aria-hidden />
              <h3>{p}</h3>
            </div>
          ))}
        </div>
        <p className="mt-6 text-center text-sm text-[var(--lg-muted)]">
          Estamos preparando uma experiência moderna, prática e segura para os seus clientes.
        </p>
      </div>
    </section>
  )
}

export function LandingComunicacaoShowcase() {
  return (
    <section className="landing-section">
      <div className="landing-container landing-split">
        <div>
          <p className="landing-eyebrow">Comunicação</p>
          <h2 className="landing-display mt-3 text-3xl text-white sm:text-4xl">
            Comunique-se melhor,{' '}
            <span className="landing-accent">tenha mais resultados.</span>
          </h2>
          <p className="mt-4 text-[var(--lg-muted)]">
            O BoxGestor prepara mensagem, link e PDF para você abrir o WhatsApp e enviar ao cliente
            — envio manual, sem automação.
            — de forma simples e profissional.
          </p>
          <ul className="mt-6 space-y-3">
            {[
              'Mensagens prontas e personalizadas',
              'Compartilhamento pelo WhatsApp',
              'Orçamentos e informações preparados para envio',
              'Comunicação organizada na rotina da oficina',
            ].map((item) => (
              <li key={item} className="flex gap-2 text-sm text-[var(--lg-muted)]">
                <CheckCircle2 size={16} className="mt-0.5 text-[var(--lg-orange)]" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
          <p className="mt-5 text-xs text-[var(--lg-muted)]">
            Sem envio automático. Sem leitura/resposta rastreada. Você envia pelo WhatsApp.
          </p>
        </div>
        <LandingDeviceShowcase variant="comunicacao" />
      </div>
    </section>
  )
}
