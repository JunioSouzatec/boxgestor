/**
 * Portal do Cliente público — /portal/:token
 * Sem login. Dados só via Edge approval-link-get / respond (payload sanitizado).
 * Fotos: somente include_in_portal via signed URL curta (sem storage_path).
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import {
  CheckCircle2,
  Clock3,
  Loader2,
  MessageCircle,
  ShieldCheck,
  ShieldAlert,
  XCircle,
} from 'lucide-react'
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
  buildWhatsAppUrl,
  normalizarTelefoneWhatsApp,
} from '@/services/comunicacao/whatsapp.service'
import {
  obterOrcamentoPorTokenPublico,
  responderOrcamentoPorTokenPublico,
} from '@/services/orcamento/aprovacao-link-publico.service'
import { aprovacaoLinkPublicoBackendAtivo } from '@/services/orcamento/aprovacao-link-publico.flags'
import { PortalFotosPublicasSection } from '@/components/portal/PortalFotosPublicasSection'
import { PortalAcompanhamentoSection } from '@/components/portal/PortalAcompanhamentoSection'
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
  | 'bloqueado'

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

function rotuloStatusLink(status?: string): string {
  switch (status) {
    case 'approved':
      return 'Aprovado'
    case 'rejected':
      return 'Recusado'
    case 'expired':
      return 'Expirado'
    case 'revoked':
      return 'Cancelado pela oficina'
    case 'pending':
      return 'Pendente de aprovação'
    default:
      return 'Indisponível'
  }
}

function rotuloCabecalhoPortal(opts: {
  fase: string
  modoAcompanhamento: boolean
  statusBloqueio?: string
  conversaoConvertido?: boolean
}): string {
  if (opts.fase === 'loading') return 'Carregando…'
  if (opts.fase === 'ready') {
    return opts.modoAcompanhamento
      ? 'Acompanhamento do serviço'
      : rotuloStatusLink('pending')
  }
  if (opts.fase === 'bloqueado') {
    if (opts.statusBloqueio === 'converted') return 'Orçamento convertido em OS'
    return rotuloStatusLink(opts.statusBloqueio)
  }
  if (opts.fase === 'sucesso_aprovado') return 'Aprovado'
  if (opts.fase === 'sucesso_parcial') return 'Aprovado parcialmente'
  if (opts.fase === 'sucesso_recusado') return 'Recusado'
  return 'Status indisponível'
}

function formatarDataCurta(iso?: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) {
    // Pode ser YYYY-MM-DD sem timezone
    if (/^\d{4}-\d{2}-\d{2}/.test(iso)) {
      const [y, m, day] = iso.slice(0, 10).split('-')
      return `${day}/${m}/${y}`
    }
    return iso
  }
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function extrairContatoOficina(dados: PublicQuoteApprovalPayload | null): string | null {
  if (!dados) return null
  const candidatos = [dados.office.whatsapp, dados.office.telefone]
  for (const raw of candidatos) {
    const t = raw?.trim()
    if (!t) continue
    const digits = normalizarTelefoneWhatsApp(t)
    if (/^55\d{10,11}$/.test(digits)) return t
  }
  return null
}

function extrairConversao(dados: PublicQuoteApprovalPayload | null): {
  converted: boolean
  osNumber: number | null
  statusLabel: string | null
  previsao: string | null
  convertedAt: string | null
} {
  if (!dados) {
    return {
      converted: false,
      osNumber: null,
      statusLabel: null,
      previsao: null,
      convertedAt: null,
    }
  }
  const osNumber =
    dados.quote.converted_os_number ?? dados.conversion?.os_number ?? null
  const converted = Boolean(
    dados.quote.converted ||
      dados.conversion?.converted ||
      (osNumber != null && Number(osNumber) > 0)
  )
  return {
    converted,
    osNumber: osNumber != null && Number(osNumber) > 0 ? Number(osNumber) : null,
    statusLabel:
      dados.quote.generated_os_status ??
      dados.conversion?.generated_os_status ??
      null,
    previsao:
      dados.quote.generated_os_expected_delivery_date ??
      dados.conversion?.generated_os_expected_delivery_date ??
      null,
    convertedAt: dados.quote.converted_at ?? dados.conversion?.converted_at ?? null,
  }
}

function iniciaisOficina(nome?: string | null): string {
  const parts = (nome || 'Oficina')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (parts.length === 0) return 'OF'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase() || 'OF'
}

function mensagemBloqueioAmigavel(status?: string, erro?: string | null): string {
  if (status === 'approved') return 'Este orçamento já foi aprovado. Não é possível responder novamente.'
  if (status === 'rejected') return 'Este orçamento já foi recusado. Não é possível responder novamente.'
  if (status === 'expired') return 'Este link expirou. Fale com a oficina para receber um novo.'
  if (status === 'revoked') return 'Este link foi cancelado pela oficina.'
  return erro || 'Este link não está mais disponível. Fale com a oficina se precisar de ajuda.'
}

export function PortalClientePublicoPage() {
  const { token: tokenParam } = useParams<{ token: string }>()
  const token = tokenParam?.trim() || ''
  const backendAtivo = aprovacaoLinkPublicoBackendAtivo()

  const [logoFalhou, setLogoFalhou] = useState(false)
  const [fase, setFase] = useState<Fase>('loading')
  const [erro, setErro] = useState<string | null>(null)
  const [statusBloqueio, setStatusBloqueio] = useState<string | undefined>()
  const [dados, setDados] = useState<PublicQuoteApprovalPayload | null>(null)
  const [enviando, setEnviando] = useState(false)

  const [modo, setModo] = useState<ModoDecisao>('total')
  const [decisoes, setDecisoes] = useState<Record<string, DecisaoLocal>>({})
  const [confirmarAberto, setConfirmarAberto] = useState(false)
  const [nome, setNome] = useState('')
  const [obs, setObs] = useState('')

  const itens = useMemo(() => (dados ? montarItensUi(dados) : []), [dados])
  const conversao = useMemo(() => extrairConversao(dados), [dados])
  const telefoneOficina = useMemo(() => extrairContatoOficina(dados), [dados])
  const modoAcompanhamento = dados?.portal_mode === 'service_tracking'
  const acompanhamentoEncerrado =
    modoAcompanhamento &&
    (Boolean(dados?.tracking?.encerrado) || dados?.tracking?.status_codigo === 'entregue')
  const podeResponder =
    fase === 'ready' && !!dados && !conversao.converted && !modoAcompanhamento

  useEffect(() => {
    let cancelado = false

    async function carregar() {
      if (!backendAtivo) {
        setFase('erro')
        setErro('Portal temporariamente indisponível. Fale com a oficina.')
        return
      }
      if (!token || token.length < 32) {
        setFase('erro')
        setErro('Link inválido. Peça um novo link à oficina.')
        return
      }

      setFase('loading')
      setErro(null)
      setStatusBloqueio(undefined)
      setLogoFalhou(false)
      const r = await obterOrcamentoPorTokenPublico(token)
      if (cancelado) return

      if (r.dados) {
        setDados(r.dados)
      }

      if (r.ok && r.dados) {
        const lista = montarItensUi(r.dados)
        const inicial: Record<string, DecisaoLocal> = {}
        for (const item of lista) inicial[item.item_key] = 'approved'
        setDecisoes(inicial)

        const conv = extrairConversao(r.dados)
        if (conv.converted) {
          setFase('bloqueado')
          setStatusBloqueio('converted')
          setErro(
            conv.osNumber != null
              ? `Este orçamento já foi convertido em OS #${conv.osNumber}.`
              : 'Este orçamento já foi convertido em OS.'
          )
          return
        }

        setFase('ready')
        return
      }

      const st = r.status
      if (st === 'approved' || st === 'rejected' || st === 'expired' || st === 'revoked') {
        const conv = extrairConversao(r.dados ?? null)
        if (conv.converted) {
          setFase('bloqueado')
          setStatusBloqueio('converted')
          setErro(
            conv.osNumber != null
              ? `Este orçamento já foi convertido em OS #${conv.osNumber}.`
              : 'Este orçamento já foi convertido em OS.'
          )
          return
        }
        setFase('bloqueado')
        setStatusBloqueio(st)
        setErro(mensagemBloqueioAmigavel(st, r.erro))
        return
      }

      setFase('erro')
      setErro(r.erro || 'Não foi possível abrir o portal. Tente novamente ou fale com a oficina.')
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

  function entrarModoParcial() {
    setModo('partial')
    setNome(dados?.quote.customer_name || '')
    setObs('')
  }

  function cancelarSelecaoParcial() {
    setModo('total')
    marcarTodos('approved')
    setConfirmarAberto(false)
    setObs('')
  }

  function tentarConfirmarParcial() {
    if (itens.some((i) => !decisoes[i.item_key])) {
      window.alert('Selecione pelo menos um item aprovado e um recusado.')
      return
    }
    if (resumoSelecao.aprovados.length === 0 || resumoSelecao.recusados.length === 0) {
      if (resumoSelecao.aprovados.length === 0 && resumoSelecao.recusados.length === itens.length) {
        window.alert(
          'Para aprovação parcial, aprove pelo menos um item e recuse pelo menos um. Se quiser recusar tudo, use “Recusar”.'
        )
        return
      }
      if (resumoSelecao.recusados.length === 0 && resumoSelecao.aprovados.length === itens.length) {
        window.alert(
          'Todos os itens estão aprovados. Use “Aprovar tudo”, ou recuse ao menos um item para aprovação parcial.'
        )
        return
      }
      window.alert('Selecione pelo menos um item aprovado e um recusado.')
      return
    }
    abrirConfirmacao('partial')
  }

  async function enviar() {
    const nomeTrim = nome.trim()
    if (nomeTrim.length < 2) {
      window.alert('Informe o nome (mínimo 2 caracteres).')
      return
    }

    if (modo === 'partial') {
      if (itens.some((i) => !decisoes[i.item_key])) {
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
          setFase('bloqueado')
          setStatusBloqueio(r.status)
          setErro(mensagemBloqueioAmigavel(r.status, r.erro))
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

  function abrirWhatsAppOficina() {
    if (!telefoneOficina) return
    const url = buildWhatsAppUrl(
      telefoneOficina,
      modoAcompanhamento
        ? 'Olá, estou acompanhando o serviço pelo portal e tenho uma dúvida.'
        : 'Olá, estou vendo meu orçamento pelo portal e tenho uma dúvida.'
    )
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const validadeFmt = formatarDataCurta(dados?.link.expires_at)
  const previsaoFmt = formatarDataCurta(dados?.quote.valid_until)
  const previsaoOsGeradaFmt = formatarDataCurta(conversao.previsao)
  const tituloConvertido =
    conversao.osNumber != null
      ? `Convertido em OS #${conversao.osNumber}`
      : 'Orçamento convertido em OS'

  return (
    <div className="min-h-[100dvh] bg-[radial-gradient(ellipse_at_top,_#1e293b_0%,_#0b1220_45%,_#070b14_100%)] text-slate-50">
      <div className="mx-auto flex w-full max-w-lg flex-col gap-4 px-4 py-6 sm:py-10">
        <header className="overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-5 shadow-xl shadow-black/20 backdrop-blur">
          <div className="flex items-start gap-3">
            {dados?.office.logo_url && !logoFalhou ? (
              <img
                src={dados.office.logo_url}
                alt=""
                className="h-14 w-14 shrink-0 rounded-2xl object-cover ring-1 ring-white/15"
                onError={() => setLogoFalhou(true)}
              />
            ) : (
              <div
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500/25 to-sky-500/20 ring-1 ring-emerald-400/35"
                aria-hidden
              >
                <span className="text-sm font-bold tracking-wide text-emerald-100">
                  {iniciaisOficina(dados?.office?.nome)}
                </span>
              </div>
            )}
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-emerald-300/90">
                Portal do Cliente
              </p>
              <h1 className="truncate text-xl font-semibold leading-tight">
                {modoAcompanhamento && (fase === 'ready' || fase === 'loading')
                  ? acompanhamentoEncerrado
                    ? 'Acompanhamento encerrado'
                    : 'Acompanhamento do serviço'
                  : dados?.office?.nome || 'Orçamento'}
              </h1>
              <p className="text-sm text-slate-300">
                {modoAcompanhamento && fase === 'ready'
                  ? dados?.office?.nome || 'Oficina'
                  : rotuloCabecalhoPortal({
                      fase,
                      modoAcompanhamento,
                      statusBloqueio,
                      conversaoConvertido: conversao.converted,
                    })}
              </p>
              {modoAcompanhamento && fase === 'ready' && dados?.tracking?.status_publico ? (
                <p className="pt-0.5 text-sm font-medium text-emerald-200/95">
                  {dados.tracking.status_publico}
                </p>
              ) : null}
            </div>
          </div>
        </header>

        {fase === 'loading' ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-white/10 bg-white/5 py-16 text-slate-300">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-300" />
            <p className="text-sm">
              {modoAcompanhamento ? 'Carregando acompanhamento…' : 'Carregando seu orçamento…'}
            </p>
          </div>
        ) : null}

        {fase === 'erro' ? (
          <PainelAviso
            tom="red"
            titulo="Não foi possível abrir"
            texto={erro || 'Tente novamente mais tarde ou fale com a oficina.'}
          />
        ) : null}

        {fase === 'bloqueado' ? (
          <div className="space-y-3">
            <PainelAviso
              tom={
                statusBloqueio === 'approved' || statusBloqueio === 'converted' ? 'green' : 'amber'
              }
              titulo={
                statusBloqueio === 'converted' ? tituloConvertido : rotuloStatusLink(statusBloqueio)
              }
              texto={erro || mensagemBloqueioAmigavel(statusBloqueio)}
              icon={statusBloqueio === 'rejected' ? 'no' : 'ok'}
            />
            {statusBloqueio === 'converted' &&
            (conversao.statusLabel || previsaoOsGeradaFmt || conversao.osNumber != null) ? (
              <CardBloco titulo="Acompanhamento">
                <dl className="grid gap-2 text-sm">
                  {conversao.osNumber != null ? (
                    <Linha label="OS gerada" valor={`#${conversao.osNumber}`} />
                  ) : null}
                  {conversao.statusLabel ? (
                    <Linha label="Status atual" valor={conversao.statusLabel} />
                  ) : null}
                  {previsaoOsGeradaFmt ? (
                    <Linha label="Previsão" valor={previsaoOsGeradaFmt} />
                  ) : null}
                </dl>
              </CardBloco>
            ) : null}
          </div>
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
            {modoAcompanhamento ? (
              <PortalAcompanhamentoSection
                tracking={dados.tracking}
                fallbackStatus={dados.quote.generated_os_status}
                fallbackPrevisao={
                  dados.quote.generated_os_expected_delivery_date || dados.quote.valid_until
                }
              />
            ) : null}

            {!acompanhamentoEncerrado ? (
              <CardBloco titulo="Cliente e veículo">
                <dl className="grid gap-2 text-sm">
                  <Linha label="Cliente" valor={dados.quote.customer_name} />
                  <Linha
                    label="Veículo"
                    valor={`${dados.quote.vehicle_label}${dados.quote.plate ? ` · ${dados.quote.plate}` : ''}`}
                  />
                  <Linha
                    label={modoAcompanhamento ? 'OS' : 'Orçamento'}
                    valor={`#${dados.quote.number}`}
                  />
                  {!modoAcompanhamento && previsaoFmt ? (
                    <Linha label="Previsão" valor={previsaoFmt} />
                  ) : null}
                  {!modoAcompanhamento && validadeFmt ? (
                    <Linha label="Link válido até" valor={validadeFmt} />
                  ) : null}
                </dl>
              </CardBloco>
            ) : (
              <CardBloco titulo="Referência">
                <dl className="grid gap-2 text-sm">
                  <Linha label="OS" valor={`#${dados.quote.number}`} />
                  <Linha label="Cliente" valor={dados.quote.customer_name} />
                </dl>
              </CardBloco>
            )}

            {!acompanhamentoEncerrado ? (
              <CardBloco
                titulo={
                  modo === 'partial'
                    ? 'Aprovação parcial'
                    : modoAcompanhamento
                      ? 'Resumo do serviço'
                      : 'Itens do orçamento'
                }
              >
                {!modoAcompanhamento ? (
                  <p className="mb-3 text-xs text-slate-400">
                    {modo === 'partial'
                      ? 'Marque o que você aprova e o que deseja recusar.'
                      : 'Confira os itens e valores. Depois escolha aprovar tudo, aprovar parcialmente ou recusar.'}
                  </p>
                ) : (
                  <p className="mb-3 text-xs text-slate-400">
                    Resumo seguro dos serviços e peças deste atendimento.
                  </p>
                )}
                {modo === 'partial' && !modoAcompanhamento ? (
                  <p className="mb-3 rounded-lg border border-sky-400/30 bg-sky-950/40 px-3 py-2 text-sm text-sky-50">
                    Escolha abaixo quais itens deseja aprovar ou recusar.
                  </p>
                ) : null}
                <ul className="space-y-2">
                  {itens.map((item) => (
                    <li
                      key={item.item_key}
                      className="rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="break-words font-medium text-slate-50">{item.name}</p>
                          <p className="text-xs text-slate-400">
                            {item.tipo === 'part'
                              ? `${item.quantity} × ${formatarMoeda(item.unit_price)}`
                              : 'Serviço'}
                          </p>
                        </div>
                        <span className="shrink-0 font-semibold text-emerald-200">
                          {formatarMoeda(item.subtotal)}
                        </span>
                      </div>
                      {modo === 'partial' && !modoAcompanhamento ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            className="min-h-10"
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
                            className="min-h-10"
                            variant={
                              decisoes[item.item_key] === 'rejected' ? 'destructive' : 'outline'
                            }
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

                <div className="mt-4 space-y-1 border-t border-white/10 pt-3 text-sm">
                  {dados.quote.discount > 0 ? (
                    <div className="flex justify-between gap-3 text-slate-300">
                      <span>Desconto</span>
                      <span>− {formatarMoeda(dados.quote.discount)}</span>
                    </div>
                  ) : null}
                  <div className="flex justify-between gap-3 text-base font-semibold">
                    <span>Total</span>
                    <span className="text-emerald-200">{formatarMoeda(dados.quote.total)}</span>
                  </div>
                </div>
              </CardBloco>
            ) : null}

            {!acompanhamentoEncerrado && dados.quote.notes ? (
              <CardBloco titulo="Observações">
                <p className="whitespace-pre-wrap break-words text-sm text-slate-200/90">
                  {dados.quote.notes}
                </p>
              </CardBloco>
            ) : null}

            {!acompanhamentoEncerrado ? (
              <PortalFotosPublicasSection photos={dados.photos} />
            ) : null}

            {!modoAcompanhamento ? (
              <p className="rounded-xl border border-amber-400/30 bg-amber-950/35 px-3 py-2.5 text-sm text-amber-50">
                {dados.notice || 'A aprovação do orçamento não confirma pagamento.'}
              </p>
            ) : !acompanhamentoEncerrado && !dados.tracking?.avisos?.length ? (
              <p className="rounded-xl border border-sky-400/25 bg-sky-950/30 px-3 py-2.5 text-sm text-sky-50">
                {dados.notice ||
                  'As informações são atualizadas pela oficina conforme o andamento do serviço.'}
              </p>
            ) : null}

            {!acompanhamentoEncerrado && !dados.photos?.length ? (
              <p className="text-center text-xs text-slate-500">
                Fotos liberadas pela oficina aparecem aqui, quando houver.
              </p>
            ) : null}

            {podeResponder ? (
              <div className="flex flex-col gap-2.5 pt-1">
                {modo !== 'partial' ? (
                  <>
                    <Button
                      type="button"
                      className="min-h-12 w-full bg-emerald-600 text-base hover:bg-emerald-500"
                      onClick={() => abrirConfirmacao('total')}
                    >
                      Aprovar tudo
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-12 w-full border-white/20 bg-white/5 text-base"
                      onClick={entrarModoParcial}
                    >
                      Aprovar parcialmente
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-12 w-full border-red-400/40 text-base text-red-200 hover:bg-red-950/40"
                      onClick={() => abrirConfirmacao('reject')}
                    >
                      Recusar
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      type="button"
                      className="min-h-12 w-full bg-emerald-600 text-base hover:bg-emerald-500"
                      onClick={tentarConfirmarParcial}
                    >
                      Confirmar aprovação parcial
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-12 w-full border-white/20 bg-white/5 text-base"
                      onClick={cancelarSelecaoParcial}
                    >
                      Cancelar seleção
                    </Button>
                  </>
                )}
              </div>
            ) : null}
          </div>
        ) : null}

        <CardBloco titulo="Segurança do link">
          <ul className="space-y-2 text-sm text-slate-300">
            <li className="flex gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                <span>
                  {modoAcompanhamento
                    ? 'Este link é seguro e exclusivo para acompanhar este serviço.'
                    : 'Este link é seguro e exclusivo para este orçamento.'}
                </span>
              </li>
              {!modoAcompanhamento ? (
                <li className="flex gap-2">
                  <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" />
                  <span>A aprovação do orçamento não confirma pagamento.</span>
                </li>
              ) : (
                <li className="flex gap-2">
                  <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" />
                  <span>
                    Este link permite acompanhar o andamento do serviço. Fotos liberadas podem
                    expirar; atualize a página se precisar.
                  </span>
                </li>
              )}
            <li className="flex gap-2">
              <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />
              <span>Em caso de dúvida, fale com a oficina.</span>
            </li>
          </ul>
          {telefoneOficina ? (
            <Button
              type="button"
              variant="outline"
              className="mt-4 min-h-11 w-full gap-2 border-emerald-400/40 bg-emerald-950/30 text-emerald-100"
              onClick={abrirWhatsAppOficina}
            >
              <MessageCircle className="h-4 w-4" />
              Falar com a oficina
            </Button>
          ) : null}
        </CardBloco>
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
                  ? 'Ao confirmar, você autoriza a oficina a seguir apenas com os itens aprovados.'
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
              <Label htmlFor="portal-aprov-nome">Seu nome *</Label>
              <Input
                id="portal-aprov-nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Nome completo"
                autoComplete="name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="portal-aprov-obs">
                {modo === 'reject' ? 'Motivo / observação (opcional)' : 'Observação (opcional)'}
              </Label>
              <Textarea
                id="portal-aprov-obs"
                value={obs}
                onChange={(e) => setObs(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <div className="pt-1">
            <Button
              type="button"
              className="min-h-11 w-full"
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

function CardBloco({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 shadow-lg shadow-black/10">
      <h2 className="mb-3 text-sm font-semibold tracking-wide text-slate-100">{titulo}</h2>
      {children}
    </section>
  )
}

function Linha({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-3">
      <dt className="shrink-0 text-slate-400">{label}</dt>
      <dd className="min-w-0 break-words text-right font-medium text-slate-50">{valor}</dd>
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
      ? 'border-emerald-500/40 bg-emerald-950/35'
      : tom === 'amber'
        ? 'border-amber-500/40 bg-amber-950/35'
        : 'border-red-500/40 bg-red-950/35'
  return (
    <div className={`rounded-2xl border ${border} p-5`}>
      <div className="mb-1 flex items-start gap-3">
        {icon === 'ok' ? (
          <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-400" />
        ) : icon === 'no' ? (
          <XCircle className="mt-0.5 h-6 w-6 shrink-0 text-amber-400" />
        ) : (
          <ShieldAlert className="mt-0.5 h-6 w-6 shrink-0 text-amber-400" />
        )}
        <div className="min-w-0 space-y-1">
          <h2 className="text-lg font-semibold">{titulo}</h2>
          <p className="text-sm text-slate-200/90">{texto}</p>
        </div>
      </div>
    </div>
  )
}
