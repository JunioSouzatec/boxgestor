/** Mockups HTML/CSS do produto — sempre com tag de demonstração. */

export function DemoTag({ label = 'Demonstração — dados de exemplo' }: { label?: string }) {
  return <span className="landing-demo-tag">{label}</span>
}

export function LandingDeviceShowcase({
  compact = false,
  variant = 'dashboard',
}: {
  compact?: boolean
  variant?: 'dashboard' | 'relatorios' | 'comunicacao'
}) {
  return (
    <div className="landing-device-stage" aria-hidden="true">
      {!compact ? (
        <div className="mb-3 flex justify-center">
          <DemoTag />
        </div>
      ) : null}

      <div className="landing-laptop">
        <div className="landing-laptop-bezel">
          <div className="landing-laptop-screen">
            <div className="landing-laptop-bar">
              <span className="h-2 w-2 rounded-full bg-white/25" />
              <span className="h-2 w-2 rounded-full bg-white/25" />
              <span className="h-2 w-2 rounded-full bg-white/25" />
              <span className="ml-2 rounded bg-white/5 px-2 py-0.5 text-[9px] text-[var(--lg-muted)]">
                BoxGestor · {variant === 'relatorios' ? 'relatórios' : variant === 'comunicacao' ? 'comunicação' : 'dashboard'}
              </span>
            </div>
            {variant === 'relatorios' ? <RelatoriosUi /> : variant === 'comunicacao' ? <ComunicacaoUi /> : <DashboardUi />}
          </div>
        </div>
        <div className="landing-laptop-base" />
      </div>

      <div className="landing-phone">
        <div className="landing-phone-notch" />
        {variant === 'comunicacao' ? <WhatsAppPhoneUi /> : <OsPhoneUi />}
      </div>
    </div>
  )
}

function DashboardUi() {
  return (
    <div className="grid gap-2 p-3 sm:grid-cols-[7.2rem_1fr]">
      <div className="hidden space-y-1 rounded-lg bg-black/40 p-2 sm:block">
        {['Dashboard', 'Pátio', 'OS', 'Estoque', 'Caixa', 'Relatórios'].map((item, i) => (
          <div
            key={item}
            className={`rounded-md px-2 py-1.5 text-[10px] ${
              i === 0 ? 'bg-[var(--lg-orange-soft)] text-[var(--lg-orange)]' : 'text-[var(--lg-muted)]'
            }`}
          >
            {item}
          </div>
        ))}
      </div>
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          {[
            { l: 'OS', v: '24' },
            { l: 'Orçamentos', v: '15' },
            { l: 'Serviços', v: '08' },
            { l: 'Recebimentos', v: 'R$ 12,5k', ok: true },
          ].map((c) => (
            <div key={c.l} className="rounded-lg border border-white/5 bg-white/[0.03] px-2 py-1.5">
              <p className="text-[9px] text-[var(--lg-muted)]">{c.l}</p>
              <p className={`landing-display text-sm ${c.ok ? 'text-emerald-400' : 'text-white'}`}>
                {c.v}
              </p>
            </div>
          ))}
        </div>
        <div className="grid gap-1.5 sm:grid-cols-2">
          <div className="rounded-lg border border-white/5 bg-black/30 p-2">
            <p className="text-[9px] text-[var(--lg-muted)]">Serviços por status</p>
            <div className="mt-2 flex items-center gap-3">
              <div
                className="h-12 w-12 rounded-full"
                style={{
                  background:
                    'conic-gradient(#ff7a00 0 35%, #3b82f6 35% 60%, #22c55e 60% 85%, #71717a 85% 100%)',
                }}
              />
              <div className="space-y-1 text-[9px] text-[var(--lg-muted)]">
                <p>Em andamento</p>
                <p>Aguardando</p>
                <p>Concluídos</p>
              </div>
            </div>
          </div>
          <div className="rounded-lg border border-white/5 bg-black/30 p-2">
            <p className="text-[9px] text-[var(--lg-muted)]">Recebimentos (7 dias)</p>
            <div className="mt-3 flex h-12 items-end gap-1">
              {[40, 55, 35, 70, 50, 82, 65].map((h, i) => (
                <span
                  key={i}
                  className="flex-1 rounded-t bg-gradient-to-t from-[var(--lg-orange)]/50 to-[var(--lg-orange)]"
                  style={{ height: `${h}%` }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function RelatoriosUi() {
  return (
    <div className="space-y-2 p-3">
      <div className="flex flex-wrap gap-1.5">
        {['Mês', 'Trimestre', 'Personalizado'].map((f, i) => (
          <span
            key={f}
            className={`rounded-md px-2 py-1 text-[9px] ${
              i === 0
                ? 'bg-[var(--lg-orange)] text-black font-semibold'
                : 'border border-white/10 text-[var(--lg-muted)]'
            }`}
          >
            {f}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {[
          { l: 'Faturamento', v: 'R$ 34,8k' },
          { l: 'Lucro estimado', v: 'R$ 12,1k', ok: true },
          { l: 'OS', v: '86' },
          { l: 'Ticket médio', v: 'R$ 405' },
        ].map((c) => (
          <div key={c.l} className="rounded-lg border border-white/5 bg-white/[0.03] px-2 py-1.5">
            <p className="text-[9px] text-[var(--lg-muted)]">{c.l}</p>
            <p className={`landing-display text-sm ${c.ok ? 'text-emerald-400' : 'text-white'}`}>
              {c.v}
            </p>
          </div>
        ))}
      </div>
      <div className="grid gap-1.5 sm:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-lg border border-white/5 bg-black/30 p-2">
          <p className="text-[9px] text-[var(--lg-muted)]">Faturamento × despesas</p>
          <svg viewBox="0 0 200 60" className="mt-2 h-14 w-full" aria-hidden>
            <polyline
              fill="none"
              stroke="#ff7a00"
              strokeWidth="2"
              points="0,45 30,38 60,42 90,28 120,32 150,18 180,22 200,12"
            />
            <polyline
              fill="none"
              stroke="#71717a"
              strokeWidth="1.5"
              points="0,50 30,48 60,46 90,44 120,40 150,38 180,36 200,34"
            />
          </svg>
        </div>
        <div className="rounded-lg border border-white/5 bg-black/30 p-2">
          <p className="text-[9px] text-[var(--lg-muted)]">Por tipo</p>
          <div
            className="mx-auto mt-2 h-12 w-12 rounded-full"
            style={{
              background: 'conic-gradient(#ff7a00 0 45%, #3b82f6 45% 70%, #22c55e 70% 100%)',
            }}
          />
        </div>
      </div>
    </div>
  )
}

function ComunicacaoUi() {
  return (
    <div className="grid gap-2 p-3 sm:grid-cols-[7rem_1fr]">
      <div className="hidden space-y-1 rounded-lg bg-black/40 p-2 sm:block">
        {['Modelos', 'Orçamento', 'OS pronta', 'Lembrete'].map((item, i) => (
          <div
            key={item}
            className={`rounded-md px-2 py-1.5 text-[10px] ${
              i === 1 ? 'bg-[var(--lg-orange-soft)] text-[var(--lg-orange)]' : 'text-[var(--lg-muted)]'
            }`}
          >
            {item}
          </div>
        ))}
      </div>
      <div className="space-y-2 rounded-lg border border-white/5 bg-black/25 p-2.5">
        <p className="text-[10px] font-semibold text-white">Mensagem preparada</p>
        <p className="text-[10px] leading-relaxed text-[var(--lg-muted)]">
          Olá! Segue o orçamento da sua moto. Você pode aprovar pelo link abaixo.
        </p>
        <div className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-1.5 text-[9px] text-[var(--lg-muted)]">
          Orçamento_OS_1257.pdf · link de aprovação
        </div>
        <div className="rounded-md bg-[var(--lg-orange)] px-2 py-1.5 text-center text-[10px] font-bold text-black">
          Abrir WhatsApp para enviar
        </div>
      </div>
    </div>
  )
}

function OsPhoneUi() {
  return (
    <div className="space-y-1.5 p-2.5 pb-3">
      <p className="text-[9px] text-[var(--lg-muted)]">Ordens de serviço</p>
      <p className="landing-display text-xs text-white">Lista do dia</p>
      {[
        { t: 'OS-1042', s: 'Aberta', c: 'text-[var(--lg-orange)] bg-[var(--lg-orange-soft)]' },
        { t: 'OS-1041', s: 'Andamento', c: 'text-amber-300 bg-amber-500/15' },
        { t: 'OS-1040', s: 'Concluída', c: 'text-emerald-300 bg-emerald-500/15' },
      ].map((row) => (
        <div
          key={row.t}
          className="flex items-center justify-between rounded-md border border-white/5 bg-white/[0.03] px-2 py-1.5"
        >
          <span className="text-[9px] text-white/90">{row.t}</span>
          <span className={`rounded-full px-1.5 py-0.5 text-[8px] ${row.c}`}>{row.s}</span>
        </div>
      ))}
    </div>
  )
}

function WhatsAppPhoneUi() {
  return (
    <div className="space-y-1.5 bg-[#0b1410] p-2.5 pb-3">
      <p className="text-[9px] text-emerald-200/70">WhatsApp · envio manual</p>
      <div className="rounded-lg rounded-tl-sm bg-[#005c4b] px-2 py-1.5 text-[9px] text-white/95">
        Olá! Segue o orçamento. Pode aprovar pelo link.
      </div>
      <div className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-[8px] text-[var(--lg-muted)]">
        📎 Orçamento_OS_1257.pdf
      </div>
      <p className="text-[8px] text-[var(--lg-muted)]">BoxGestor prepara · você envia</p>
    </div>
  )
}

export function StepUiPreview({ step }: { step: 1 | 2 | 3 | 4 }) {
  if (step === 1) {
    return (
      <div className="preview-pane space-y-1.5">
        <p className="text-[9px] text-[var(--lg-muted)]">Dados da oficina</p>
        <div className="h-1.5 w-full rounded bg-white/10" />
        <div className="h-1.5 w-4/5 rounded bg-white/10" />
        <div className="mt-2 rounded bg-[var(--lg-orange-soft)] px-2 py-1 text-[9px] text-[var(--lg-orange)]">
          Enviar logo
        </div>
      </div>
    )
  }
  if (step === 2) {
    return (
      <div className="preview-pane grid grid-cols-2 gap-1">
        {['Clientes', 'Veículos', 'Agenda', 'Estoque'].map((l) => (
          <div key={l} className="rounded bg-white/[0.04] px-1.5 py-1.5">
            <p className="text-[8px] text-[var(--lg-muted)]">{l}</p>
            <p className="landing-display text-xs text-white">—</p>
          </div>
        ))}
      </div>
    )
  }
  if (step === 3) {
    return (
      <div className="preview-pane space-y-1.5">
        <div className="flex items-center justify-between">
          <p className="text-[9px] text-white">Orçamento #1257</p>
          <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[8px] text-emerald-300">
            Aprovado
          </span>
        </div>
        <div className="h-1.5 w-3/4 rounded bg-white/10" />
        <div className="rounded bg-[var(--lg-orange)] px-2 py-1 text-center text-[9px] font-bold text-black">
          Converter em OS
        </div>
      </div>
    )
  }
  return (
    <div className="preview-pane space-y-1.5">
      <p className="text-[9px] text-[var(--lg-muted)]">Resumo geral</p>
      <div className="grid grid-cols-3 gap-1">
        <div className="rounded bg-emerald-500/10 px-1 py-1 text-[8px] text-emerald-300">Receitas</div>
        <div className="rounded bg-red-500/10 px-1 py-1 text-[8px] text-red-300">Despesas</div>
        <div className="rounded bg-[var(--lg-orange-soft)] px-1 py-1 text-[8px] text-[var(--lg-orange)]">
          Saldo
        </div>
      </div>
      <div
        className="mx-auto h-8 w-8 rounded-full"
        style={{ background: 'conic-gradient(#ff7a00 0 40%, #3b82f6 40% 70%, #22c55e 70% 100%)' }}
      />
    </div>
  )
}
