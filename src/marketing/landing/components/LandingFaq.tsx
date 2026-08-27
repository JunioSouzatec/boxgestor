import { useId, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { FAQ_ITENS } from '@/marketing/landing/content/landing-content'

export function LandingFaq({
  itens = FAQ_ITENS,
  titulo = 'Perguntas frequentes',
}: {
  itens?: typeof FAQ_ITENS
  titulo?: string
}) {
  const baseId = useId()
  const [aberto, setAberto] = useState<number | null>(0)

  return (
    <section className="landing-section" aria-labelledby={`${baseId}-title`}>
      <div className="landing-container">
        <p className="landing-eyebrow">FAQ</p>
        <h2 id={`${baseId}-title`} className="landing-display mt-3 text-3xl text-white sm:text-4xl">
          {titulo}
        </h2>
        <div className="mt-8 space-y-3">
          {itens.map((item, index) => {
            const isOpen = aberto === index
            const panelId = `${baseId}-panel-${index}`
            const buttonId = `${baseId}-btn-${index}`
            return (
              <div key={item.pergunta} className="landing-card overflow-hidden">
                <h3>
                  <button
                    id={buttonId}
                    type="button"
                    className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-base font-semibold text-white"
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => setAberto(isOpen ? null : index)}
                  >
                    <span>{item.pergunta}</span>
                    <ChevronDown
                      className={`shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                      size={18}
                      aria-hidden
                    />
                  </button>
                </h3>
                {isOpen ? (
                  <div
                    id={panelId}
                    role="region"
                    aria-labelledby={buttonId}
                    className="border-t border-white/5 px-5 pb-5 pt-3 text-sm leading-relaxed text-[var(--lg-muted)]"
                  >
                    {item.resposta}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
