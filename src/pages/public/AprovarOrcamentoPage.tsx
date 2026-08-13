/**
 * Rota pública: /aprovar-orcamento/:token (A2.5 — parcial)
 * Carrega somente via Edge Function approval-link-get (payload sanitizado).
 */
import { useEffect, useMemo, useState } from 'react'
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
import type {
  ApprovalActionPublic,
  ItemDecisionPublicInput,
  PublicQuoteApprovalPayload,
} from '@/types/approval-link'

type Fase =
  | 'loading'
  | 'ready'
  | 'erro'
  | 'sucesso_aprovado'
  | 'sucesso_parcial'
  | 'sucesso_recusado'
  | 'ja_respondido'

type ModoDecisao = 'total' | 'partial' | 'reject'

type DecisaoLocal = 'approved' | 'rejected'

type ItemUi = {
  item_key: string
  tipo: 'service' | 'part'
  name: string
  quantity: number
  unit_price: number
  subtotal: number
}

function montarItensUi(dados: PublicQuoteApprovalPayload): ItemUi[] {
  const services: ItemUi[] = dados.quote.services.map((s, i) => ({
    item_key: s.item_key || `service-${i}`,
    tipo: 'service',
    name: s.name,
    quantity: 1,
    unit_price: s.labor_value,
    subtotal: s.labor_value,
  }))
  const parts: ItemUi[] = dados.quote.parts.map((p, i) => ({
    item_key: p.item_key || `part-${i}`,
    tipo: 'part',
    name: p.name,
    quantity: p.quantity,
    unit_price: p.unit_price,
    subtotal: p.subtotal,
  }))
  return [...services, ...parts]
}

export function AprovarOrcamentoPage() {
  const { token: tokenParam } = useParams<{ token: string }>()
  const token = tokenParam?.trim() || ''
  const backendAtivo = aprovacaoLinkPublicoBackendAtivo()

  const [fase, setFase] = useState<Fase>('loading')
  const [erro, setErro] = useState<string | null>(null)
  const [dados, setDados] = useState<PublicQuoteApprovalPayload | null>(null)
  const [enviando, setEnviando] = useState(false)

  const [modo, setModo] = useState<ModoDecisao>('total')
  const [decisoes, setDecisoes] = useState<Record<string, DecisaoLocal>>({})
  const [confirmarAberto, setConfirmarAberto] = useState(false)
  const [nome, setNome] = useState('')
  const [obs, setObs] = useState('')

  const itens = useMemo(() => (dados ? montarItensUi(dados) : []), [dados])

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
        const lista = montarItensUi(r.dados)
        const inicial: Record<string, DecisaoLocal> = {}
        for (const item of lista) inicial[item.item_key] = 'approved'
        setDecisoes(inicial)
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

  const resumoSelecao = useMemo(() => {
    const aprovados = itens.filter((i) => decisoes[i.item_key] === 'approved')
    const recusados = itens.filter((i) => decisoes[i.item_key] === 'rejected')
    const totalAprovado = aprovados.reduce((s, i) => s + i.subtotal, 0)
    const totalRecusado = recusados.reduce((s, i) => s + i.subtotal, 0)
    return { aprovados, recusados, totalAprovado, totalRecusado }
  }, [itens, decisoes])

  function marcarTodos(decision: DecisaoLocal) {
    const next: Record<string, DecisaoLocal> = {}
    for (const item of itens) next[item.item_key] = decision
    setDecisoes(next)
  }

  function abrirConfirmacao(novoModo: ModoDecisao) {
    setModo(novoModo)
    if (novoModo === 'total') marcarTodos('approved')
    if (novoModo === 'reject') marcarTodos('rejected')
    setNome(dados?.quote.customer_name || '')
    setObs('')
    setConfirmarAberto(true)
  }

  async function enviar() {
    const nomeTrim = nome.trim()
    if (nomeTrim.length < 2) {
      window.alert('Informe o nome (mínimo 2 caracteres).')
      return
    }

    if (modo === 'partial') {
      const faltando = itens.some((i) => !decisoes[i.item_key])
      if (faltando) {
        window.alert('Defina aprovado ou recusado para cada item.')
        return
      }
      if (resumoSelecao.aprovados.length === 0) {
        window.alert('Selecione ao menos um item para aprovar, ou escolha recusar o orçamento.')
        return
      }
      if (resumoSelecao.recusados.length === 0) {
        window.alert('Na aprovação parcial, recuse ao menos um item — ou use “Aprovar tudo”.')
        return
      }
    }

    let action: ApprovalActionPublic = 'approve'
    if (modo === 'reject') action = 'reject'
    if (modo === 'partial') action = 'partial'

    const itemsDecision: ItemDecisionPublicInput[] = itens.map((i) => ({
      item_key: i.item_key,
      decision: decisoes[i.item_key] || 'approved',
    }))

    setEnviando(true)
    try {
      const r = await responderOrcamentoPorTokenPublico({
        token,
        action,
        responseName: nomeTrim,
        responseNote: obs,
        itemsDecision,
      })
      if (!r.ok) {
        window.alert(r.erro || 'Não foi possível registrar a resposta.')
        if (r.status && r.status !== 'pending') {
          setFase('ja_respondido')
          setErro(r.erro || 'Este link já foi respondido.')
          setConfirmarAberto(false)
        }
        return
      }
      setConfirmarAberto(false)
      if (r.approval_type === 'partial' || action === 'partial') {
        setFase('sucesso_parcial')
      } else if (action === 'reject' || r.approval_type === 'rejected') {
        setFase('sucesso_recusado')
      } else {
        setFase('sucesso_aprovado')
      }
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

      {fase === 'sucesso_parcial' ? (
        <PainelAviso
          tom="green"
          titulo="Aprovação parcial registrada"
          texto="A oficina foi informada dos itens aprovados e recusados. Isso não representa pagamento."
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

          <section className="space-y-2">
            <h2 className="text-sm font-semibold">Itens do orçamento</h2>
            <p className="text-xs text-muted-foreground">
              Por padrão todos ficam como <strong>aprovado</strong>. Na aprovação parcial, altere o
              que quiser recusar.
            </p>
            <ul className="space-y-2">
              {itens.map((item) => (
                <li
                  key={item.item_key}
                  className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-words font-medium">{item.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.tipo === 'part'
                          ? `${item.quantity} × ${formatarMoeda(item.unit_price)}`
                          : 'Serviço'}
                      </p>
                    </div>
                    <span className="shrink-0 font-medium">{formatarMoeda(item.subtotal)}</span>
                  </div>
                  {modo === 'partial' || confirmarAberto ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={decisoes[item.item_key] === 'approved' ? 'default' : 'outline'}
                        onClick={() =>
                          setDecisoes((prev) => ({ ...prev, [item.item_key]: 'approved' }))
                        }
                      >
                        Aprovado
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={decisoes[item.item_key] === 'rejected' ? 'destructive' : 'outline'}
                        onClick={() =>
                          setDecisoes((prev) => ({ ...prev, [item.item_key]: 'rejected' }))
                        }
                      >
                        Recusado
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>

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

          <div className="flex flex-col gap-2 pt-1">
            <Button type="button" className="w-full" onClick={() => abrirConfirmacao('total')}>
              Aprovar tudo
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => {
                setModo('partial')
                setNome(dados.quote.customer_name || '')
                setObs('')
              }}
            >
              Aprovar parcialmente
            </Button>
            {modo === 'partial' ? (
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                onClick={() => setConfirmarAberto(true)}
              >
                Continuar com seleção
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              className="w-full border-destructive/40 text-destructive"
              onClick={() => abrirConfirmacao('reject')}
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

      <Dialog open={confirmarAberto} onOpenChange={setConfirmarAberto}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {modo === 'reject'
                ? 'Confirmar recusa'
                : modo === 'partial'
                  ? 'Confirmar aprovação parcial'
                  : 'Confirmar aprovação'}
            </DialogTitle>
            <DialogDescription>
              {modo === 'reject'
                ? 'A oficina será informada. Você pode deixar um motivo opcional.'
                : modo === 'partial'
                  ? 'Ao confirmar, você autoriza a oficina a seguir apenas com os itens aprovados. Os itens recusados ficarão registrados para conferência da oficina.'
                  : 'Você está autorizando os serviços deste orçamento. Isso não é pagamento.'}
            </DialogDescription>
          </DialogHeader>

          {modo === 'partial' ? (
            <div className="space-y-3 rounded-md border border-border bg-muted/20 p-3 text-sm">
              <div>
                <p className="font-semibold text-emerald-300">
                  Aprovados ({resumoSelecao.aprovados.length}) —{' '}
                  {formatarMoeda(resumoSelecao.totalAprovado)}
                </p>
                <ul className="mt-1 space-y-0.5 text-xs text-foreground/80">
                  {resumoSelecao.aprovados.map((i) => (
                    <li key={i.item_key}>• {i.name}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="font-semibold text-red-300">
                  Recusados ({resumoSelecao.recusados.length}) —{' '}
                  {formatarMoeda(resumoSelecao.totalRecusado)}
                </p>
                <ul className="mt-1 space-y-0.5 text-xs text-foreground/80">
                  {resumoSelecao.recusados.map((i) => (
                    <li key={i.item_key}>• {i.name}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="pub-aprov-nome">Seu nome *</Label>
              <Input
                id="pub-aprov-nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Nome completo"
                autoComplete="name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pub-aprov-obs">
                {modo === 'reject' ? 'Motivo / observação (opcional)' : 'Observação (opcional)'}
              </Label>
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
              variant={modo === 'reject' ? 'destructive' : 'default'}
              disabled={enviando || nome.trim().length < 2}
              onClick={() => void enviar()}
            >
              {enviando
                ? 'Enviando…'
                : modo === 'reject'
                  ? 'Confirmar recusa'
                  : 'Confirmar'}
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
