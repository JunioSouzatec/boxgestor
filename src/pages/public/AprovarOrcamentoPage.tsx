/**
 * Rota pública: /aprovar-orcamento/:token (A2.4)
 * Carrega somente via Edge Function approval-link-get (payload sanitizado).
 * Não consulta service_orders por id no frontend.
 */
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CheckCircle2, Loader2, ShieldAlert, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatarMoeda } from '@/lib/utils'
import {
  obterOrcamentoPorTokenPublico,
  responderOrcamentoPorTokenPublico,
} from '@/services/orcamento/aprovacao-link-publico.service'
import { aprovacaoLinkPublicoBackendAtivo } from '@/services/orcamento/aprovacao-link-publico.flags'
import type { PublicQuoteApprovalPayload } from '@/types/approval-link'

type Fase =
  | 'loading'
  | 'ready'
  | 'erro'
  | 'sucesso_aprovado'
  | 'sucesso_recusado'
  | 'ja_respondido'

export function AprovarOrcamentoPage() {
  const { token: tokenParam } = useParams<{ token: string }>()
  const token = tokenParam?.trim() || ''
  const backendAtivo = aprovacaoLinkPublicoBackendAtivo()

  const [fase, setFase] = useState<Fase>('loading')
  const [erro, setErro] = useState<string | null>(null)
  const [dados, setDados] = useState<PublicQuoteApprovalPayload | null>(null)
  const [enviando, setEnviando] = useState(false)

  const [aprovarAberto, setAprovarAberto] = useState(false)
  const [recusarAberto, setRecusarAberto] = useState(false)
  const [nome, setNome] = useState('')
  const [obs, setObs] = useState('')

  useEffect(() => {
    let cancelado = false

    async function carregar() {
      if (!backendAtivo) {
        setFase('erro')
        setErro('Link público ainda não está ativo nesta versão.')
        return
      }
      if (!token || token.length < 32) {
        setFase('erro')
        setErro('Link inválido.')
        return
      }

      setFase('loading')
      setErro(null)
      const r = await obterOrcamentoPorTokenPublico(token)
      if (cancelado) return

      if (r.ok && r.dados) {
        setDados(r.dados)
        setFase('ready')
        return
      }

      const st = r.status
      if (st === 'approved' || st === 'rejected' || st === 'expired' || st === 'revoked') {
        setFase('ja_respondido')
        setErro(r.erro || 'Este link já foi respondido ou não está mais disponível.')
        return
      }

      setFase('erro')
      setErro(r.erro || 'Não foi possível carregar o orçamento.')
    }

    void carregar()
    return () => {
      cancelado = true
    }
  }, [token, backendAtivo])

  async function enviar(action: 'approve' | 'reject') {
    const nomeTrim = nome.trim()
    if (nomeTrim.length < 2) {
      window.alert('Informe o nome (mínimo 2 caracteres).')
      return
    }
    setEnviando(true)
    try {
      const r = await responderOrcamentoPorTokenPublico({
        token,
        action,
        responseName: nomeTrim,
        responseNote: obs,
      })
      if (!r.ok) {
        window.alert(r.erro || 'Não foi possível registrar a resposta.')
        if (r.status && r.status !== 'pending') {
          setFase('ja_respondido')
          setErro(r.erro || 'Este link já foi respondido.')
          setAprovarAberto(false)
          setRecusarAberto(false)
        }
        return
      }
      setAprovarAberto(false)
      setRecusarAberto(false)
      setFase(action === 'approve' ? 'sucesso_aprovado' : 'sucesso_recusado')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-lg flex-col gap-4 px-4 py-6 sm:py-10">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Aprovação segura</p>
        <h1 className="text-xl font-semibold leading-tight">
          {dados?.office?.nome || 'Orçamento'}
        </h1>
      </header>

      {fase === 'loading' ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-sm">Carregando orçamento…</p>
        </div>
      ) : null}

      {fase === 'erro' || fase === 'ja_respondido' ? (
        <PainelAviso
          tom={fase === 'ja_respondido' ? 'amber' : 'red'}
          titulo={fase === 'ja_respondido' ? 'Link já utilizado' : 'Não foi possível abrir'}
          texto={erro || 'Tente novamente mais tarde ou fale com a oficina.'}
        />
      ) : null}

      {fase === 'sucesso_aprovado' ? (
        <PainelAviso
          tom="green"
          titulo="Orçamento aprovado"
          texto="A oficina foi informada. A aprovação não representa pagamento."
          icon="ok"
        />
      ) : null}

      {fase === 'sucesso_recusado' ? (
        <PainelAviso
          tom="amber"
          titulo="Orçamento recusado"
          texto="A oficina foi informada da sua resposta."
          icon="no"
        />
      ) : null}

      {fase === 'ready' && dados ? (
        <div className="space-y-4">
          <section className="space-y-1 border-b border-border pb-3">
            <p className="text-sm text-muted-foreground">Orçamento / OS</p>
            <p className="text-2xl font-semibold">#{dados.quote.number}</p>
            <p className="text-sm">
              <span className="text-muted-foreground">Cliente:</span> {dados.quote.customer_name}
            </p>
            <p className="text-sm">
              <span className="text-muted-foreground">Veículo:</span>{' '}
              {dados.quote.vehicle_label}
              {dados.quote.plate ? ` · ${dados.quote.plate}` : ''}
            </p>
          </section>

          {dados.quote.services.length > 0 ? (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold">Serviços</h2>
              <ul className="space-y-2">
                {dados.quote.services.map((s, i) => (
                  <li
                    key={`svc-${i}`}
                    className="flex items-start justify-between gap-3 text-sm"
                  >
                    <span className="min-w-0 break-words">{s.name}</span>
                    <span className="shrink-0 font-medium">{formatarMoeda(s.labor_value)}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {dados.quote.parts.length > 0 ? (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold">Peças</h2>
              <ul className="space-y-2">
                {dados.quote.parts.map((p, i) => (
                  <li key={`part-${i}`} className="space-y-0.5 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <span className="min-w-0 break-words">{p.name}</span>
                      <span className="shrink-0 font-medium">{formatarMoeda(p.subtotal)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {p.quantity} × {formatarMoeda(p.unit_price)}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="space-y-1 border-t border-border pt-3 text-sm">
            {dados.quote.discount > 0 ? (
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Desconto</span>
                <span>− {formatarMoeda(dados.quote.discount)}</span>
              </div>
            ) : null}
            <div className="flex justify-between gap-3 text-base font-semibold">
              <span>Total</span>
              <span>{formatarMoeda(dados.quote.total)}</span>
            </div>
          </section>

          {dados.quote.notes ? (
            <section className="space-y-1 text-sm">
              <h2 className="font-semibold">Observações</h2>
              <p className="whitespace-pre-wrap break-words text-foreground/85">{dados.quote.notes}</p>
            </section>
          ) : null}

          <p className="rounded-md border border-amber-500/40 bg-amber-950/30 px-3 py-2 text-sm text-amber-100">
            {dados.notice || 'A aprovação não representa pagamento.'}
          </p>

          <div className="flex flex-col gap-2 pt-1 sm:flex-row">
            <Button
              type="button"
              className="w-full sm:flex-1"
              onClick={() => {
                setNome(dados.quote.customer_name || '')
                setObs('')
                setAprovarAberto(true)
              }}
            >
              Aprovar orçamento
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full border-destructive/40 text-destructive sm:flex-1"
              onClick={() => {
                setNome(dados.quote.customer_name || '')
                setObs('')
                setRecusarAberto(true)
              }}
            >
              Recusar orçamento
            </Button>
          </div>
        </div>
      ) : null}

      <div className="mt-auto pt-4">
        <Button asChild variant="ghost" size="sm">
          <Link to="/login">Ir para o login da oficina</Link>
        </Button>
      </div>

      <Dialog open={aprovarAberto} onOpenChange={setAprovarAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar aprovação</DialogTitle>
            <DialogDescription>
              Você está autorizando os serviços deste orçamento. Isso não é pagamento.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="pub-aprov-nome">Seu nome</Label>
              <Input
                id="pub-aprov-nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Nome completo"
                autoComplete="name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pub-aprov-obs">Observação (opcional)</Label>
              <Textarea
                id="pub-aprov-obs"
                value={obs}
                onChange={(e) => setObs(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <div className="pt-1">
            <Button
              type="button"
              disabled={enviando || nome.trim().length < 2}
              onClick={() => void enviar('approve')}
            >
              {enviando ? 'Enviando…' : 'Confirmar aprovação'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={recusarAberto} onOpenChange={setRecusarAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar recusa</DialogTitle>
            <DialogDescription>
              A oficina será informada. Você pode deixar um motivo opcional.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="pub-recusa-nome">Seu nome</Label>
              <Input
                id="pub-recusa-nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Nome completo"
                autoComplete="name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pub-recusa-obs">Motivo / observação (opcional)</Label>
              <Textarea
                id="pub-recusa-obs"
                value={obs}
                onChange={(e) => setObs(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <div className="pt-1">
            <Button
              type="button"
              variant="destructive"
              disabled={enviando || nome.trim().length < 2}
              onClick={() => void enviar('reject')}
            >
              {enviando ? 'Enviando…' : 'Confirmar recusa'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function PainelAviso({
  tom,
  titulo,
  texto,
  icon,
}: {
  tom: 'red' | 'amber' | 'green'
  titulo: string
  texto: string
  icon?: 'ok' | 'no'
}) {
  const border =
    tom === 'green'
      ? 'border-emerald-500/40 bg-emerald-950/25'
      : tom === 'amber'
        ? 'border-amber-500/40 bg-amber-950/25'
        : 'border-red-500/40 bg-red-950/25'
  return (
    <div className={`rounded-xl border ${border} p-5`}>
      <div className="mb-2 flex items-start gap-3">
        {icon === 'ok' ? (
          <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-400" />
        ) : icon === 'no' ? (
          <XCircle className="mt-0.5 h-6 w-6 shrink-0 text-amber-400" />
        ) : (
          <ShieldAlert className="mt-0.5 h-6 w-6 shrink-0 text-amber-400" />
        )}
        <div className="min-w-0 space-y-1">
          <h2 className="text-lg font-semibold">{titulo}</h2>
          <p className="text-sm text-foreground/85">{texto}</p>
        </div>
      </div>
    </div>
  )
}
