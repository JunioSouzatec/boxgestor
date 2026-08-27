/** Mock visual coerente com o BoxGestor — dados claramente de exemplo. */
export function LandingDeviceShowcase() {
  return (
    <div className="relative mx-auto w-full max-w-3xl" aria-hidden="true">
      <p className="mb-3 text-center text-xs uppercase tracking-[0.14em] text-[var(--lg-muted)]">
        Demonstração visual · dados de exemplo
      </p>

      <div className="relative">
        {/* Desktop */}
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#111114] shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
          <div className="flex items-center gap-2 border-b border-white/5 px-4 py-3">
            <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
            <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
            <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
            <span className="ml-3 rounded-md bg-white/5 px-3 py-1 text-[10px] text-[var(--lg-muted)]">
              app.boxgestor · pátio
            </span>
          </div>
          <div className="grid gap-3 p-4 sm:grid-cols-[140px_1fr]">
            <div className="hidden space-y-2 rounded-xl bg-black/30 p-3 sm:block">
              {['Dashboard', 'Pátio', 'OS', 'Estoque', 'Caixa'].map((item, i) => (
                <div
                  key={item}
                  className={`rounded-lg px-3 py-2 text-xs ${
                    i === 1
                      ? 'bg-[var(--lg-orange-soft)] text-[var(--lg-orange)]'
                      : 'text-[var(--lg-muted)]'
                  }`}
                >
                  {item}
                </div>
              ))}
            </div>
            <div className="space-y-3">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-xs text-[var(--lg-muted)]">Hoje na oficina</p>
                  <p className="landing-display text-xl text-white">Pátio operacional</p>
                </div>
                <span className="rounded-full bg-[var(--lg-orange-soft)] px-3 py-1 text-[10px] font-semibold text-[var(--lg-orange)]">
                  Exemplo
                </span>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                {[
                  { label: 'Em andamento', value: '08' },
                  { label: 'Aguardando peça', value: '03' },
                  { label: 'Prontas', value: '05' },
                ].map((card) => (
                  <div
                    key={card.label}
                    className="rounded-xl border border-white/5 bg-white/[0.03] p-3"
                  >
                    <p className="text-[10px] text-[var(--lg-muted)]">{card.label}</p>
                    <p className="landing-display mt-1 text-2xl text-white">{card.value}</p>
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                {['OS-1042 · Revisão completa', 'OS-1043 · Troca de pastilhas', 'ORC-331 · Diagnóstico'].map(
                  (linha, idx) => (
                    <div
                      key={linha}
                      className="flex items-center justify-between rounded-xl border border-white/5 bg-black/20 px-3 py-2.5"
                    >
                      <span className="text-xs text-white/90">{linha}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] ${
                          idx === 2
                            ? 'bg-white/10 text-[var(--lg-muted)]'
                            : 'bg-[var(--lg-orange-soft)] text-[var(--lg-orange)]'
                        }`}
                      >
                        {idx === 2 ? 'Orçamento' : 'OS'}
                      </span>
                    </div>
                  )
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Phone */}
        <div className="absolute -bottom-8 right-2 w-[42%] max-w-[180px] overflow-hidden rounded-[1.4rem] border border-white/15 bg-[#0d0d10] shadow-[0_20px_50px_rgba(0,0,0,0.55)] sm:right-6 sm:max-w-[200px]">
          <div className="mx-auto mt-2 h-1.5 w-16 rounded-full bg-white/15" />
          <div className="space-y-2 p-3 pb-4">
            <p className="text-[10px] text-[var(--lg-muted)]">Aprovação por link</p>
            <p className="landing-display text-sm text-white">Orçamento #331</p>
            <div className="rounded-lg bg-white/[0.04] p-2 text-[10px] text-[var(--lg-muted)]">
              Cliente visualiza e responde no celular
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <div className="rounded-lg bg-[var(--lg-orange)] px-2 py-2 text-center text-[10px] font-semibold text-black">
                Aprovar
              </div>
              <div className="rounded-lg border border-white/10 px-2 py-2 text-center text-[10px] text-white">
                Parcial
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
