/**
 * Seção interna "Aprovação do cliente" (A1 + A2.4 link seguro).
 * Link público via Edge Function — token só em memória para copiar.
 */
import { useMemo, useState } from 'react'
import {
  Check,
  Copy,
  Eye,
  Link2,
  Link2Off,
  MessageCircle,
  Send,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
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
import { PreviaClienteOrcamentoDialog } from '@/components/os/PreviaClienteOrcamentoDialog'
import { formatarData } from '@/lib/utils'
import { obterStatusOrcamentoEfetivo } from '@/lib/orcamento-fluxo'
import { ehDocumentoOrcamento } from '@/lib/os-modo-documento'
import {
  labelStatusAprovacaoCliente,
  montarPatchAprovacaoManualCliente,
  montarPatchMarcarEnviadoCliente,
  montarPatchRecusaManualCliente,
  montarPreviaClienteOrcamento,
  montarTextoMensagemAprovacaoOrcamento,
  obterAprovacaoClienteMeta,
  statusAprovacaoClienteUi,
} from '@/services/orcamento/aprovacao-cliente.service'
import { aprovacaoLinkPublicoBackendAtivo } from '@/services/orcamento/aprovacao-link-publico.flags'
import { criarApprovalLinkPublico } from '@/services/orcamento/aprovacao-link-publico.service'
import type { Cliente, Moto, Oficina, OrdemServico } from '@/types'
import type { StatusAprovacaoClienteUi } from '@/types/aprovacao-orcamento'

interface AprovacaoClienteOSSectionProps {
  os: OrdemServico
  cliente?: Cliente | null
  moto?: Moto | null
  oficina?: Oficina | null
  usuario?: { id?: string; nome?: string }
  onSalvar: (patch: Partial<OrdemServico>) => Promise<void> | void
  desabilitado?: boolean
}

const BADGE_UI: Record<StatusAprovacaoClienteUi, string> = {
  nao_enviada: 'border-zinc-500/50 bg-zinc-900 text-zinc-100',
  enviada: 'border-sky-400/60 bg-sky-950 text-sky-100',
  aguardando: 'border-amber-400/60 bg-amber-950 text-amber-100',
  aprovado: 'border-emerald-400/60 bg-emerald-950 text-emerald-100',
  recusado: 'border-red-400/60 bg-red-950 text-red-100',
  convertido: 'border-violet-400/60 bg-violet-950 text-violet-100',
}

export function AprovacaoClienteOSSection({
  os,
  cliente,
  moto,
  oficina,
  usuario,
  onSalvar,
  desabilitado = false,
}: AprovacaoClienteOSSectionProps) {
  const [previaAberta, setPreviaAberta] = useState(false)
  const [aprovarAberto, setAprovarAberto] = useState(false)
  const [recusarAberto, setRecusarAberto] = useState(false)
  const [nomeAprovador, setNomeAprovador] = useState('')
  const [obsAprovacao, setObsAprovacao] = useState('')
  const [motivoRecusa, setMotivoRecusa] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [msgCopiada, setMsgCopiada] = useState(false)
  const [linkCopiado, setLinkCopiado] = useState(false)
  /** URL completa só em memória — nunca persistir em craft_meta. */
  const [ultimoLinkUrl, setUltimoLinkUrl] = useState<string | null>(null)
  const [ultimoLinkExpira, setUltimoLinkExpira] = useState<string | null>(null)

  const statusUi = statusAprovacaoClienteUi(os)
  const meta = obterAprovacaoClienteMeta(os)
  const statusOrc = obterStatusOrcamentoEfetivo(os)
  const veiculoLabel = moto
    ? [moto.marca, moto.modelo].filter(Boolean).join(' ')
    : 'veículo'

  const previa = useMemo(
    () =>
      montarPreviaClienteOrcamento({
        os,
        cliente,
        moto,
        oficina,
      }),
    [os, cliente, moto, oficina]
  )

  const textoWhats = useMemo(
    () =>
      montarTextoMensagemAprovacaoOrcamento({
        clienteNome: cliente?.nome || 'cliente',
        veiculo: veiculoLabel,
        numero: os.numero,
        linkUrl: ultimoLinkUrl,
      }),
    [cliente?.nome, veiculoLabel, os.numero, ultimoLinkUrl]
  )

  if (!ehDocumentoOrcamento(os)) return null

  const podeRegistrarResposta =
    statusOrc !== 'convertido' && statusOrc !== 'aprovado' && statusOrc !== 'recusado'
  const linkPublicoAtivo = aprovacaoLinkPublicoBackendAtivo()
  const linkGerado =
    meta.link_publico === true ||
    meta.link_publico === 'ativo' ||
    Boolean(meta.link_id) ||
    Boolean(ultimoLinkUrl)
  const expiraEm = ultimoLinkExpira || meta.expira_em || null

  async function executar(patch: Partial<OrdemServico> | null) {
    if (!patch || desabilitado) return
    setSalvando(true)
    try {
      await onSalvar(patch)
    } finally {
      setSalvando(false)
    }
  }

  async function marcarEnviado() {
    await executar(montarPatchMarcarEnviadoCliente(os, usuario, 'whatsapp_texto'))
  }

  async function confirmarAprovacao() {
    const patch = montarPatchAprovacaoManualCliente(os, {
      clienteNome: nomeAprovador || cliente?.nome || 'Cliente',
      observacao: obsAprovacao,
      canal: 'manual',
      usuario,
    })
    await executar(patch)
    setAprovarAberto(false)
    setNomeAprovador('')
    setObsAprovacao('')
  }

  async function confirmarRecusa() {
    const patch = montarPatchRecusaManualCliente(os, {
      motivo: motivoRecusa,
      clienteNome: cliente?.nome,
      canal: 'manual',
      usuario,
    })
    await executar(patch)
    setRecusarAberto(false)
    setMotivoRecusa('')
  }

  async function copiarTexto(texto: string, tipo: 'msg' | 'link') {
    try {
      await navigator.clipboard.writeText(texto)
      if (tipo === 'msg') {
        setMsgCopiada(true)
        window.setTimeout(() => setMsgCopiada(false), 2000)
      } else {
        setLinkCopiado(true)
        window.setTimeout(() => setLinkCopiado(false), 2000)
      }
    } catch {
      window.prompt('Copie:', texto)
    }
  }

  async function gerarLinkSeguro() {
    if (!linkPublicoAtivo) return
    setSalvando(true)
    try {
      const r = await criarApprovalLinkPublico({
        serviceOrderId: os.id,
        serviceOrderNumber: os.numero,
        validityDays: 7,
      })
      if (!r.ok || !r.url) {
        window.alert(r.erro || 'Não foi possível gerar o link seguro.')
        return
      }

      // URL só em memória. Meta/histórico já foram gravados pela Edge Function
      // (sem token/URL). Evita onSalvar aqui para não sobrescrever craft_meta.
      setUltimoLinkUrl(r.url)
      setUltimoLinkExpira(r.expires_at || null)

      try {
        await navigator.clipboard.writeText(r.url)
        setLinkCopiado(true)
        window.setTimeout(() => setLinkCopiado(false), 2000)
      } catch {
        // URL fica visível no bloco abaixo para cópia manual
      }
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="min-w-0 max-w-full space-y-3 overflow-x-hidden rounded-lg border border-border bg-muted/10 p-3 sm:p-4">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <h4 className="text-sm font-semibold">Aprovação do cliente</h4>
          <p className="break-words text-xs text-muted-foreground">
            Prévia, registro manual e link seguro para o cliente aprovar/recusar.
          </p>
        </div>
        <Badge variant="outline" className={`shrink-0 ${BADGE_UI[statusUi]}`}>
          {labelStatusAprovacaoCliente(statusUi)}
        </Badge>
      </div>

      {!linkPublicoAtivo ? (
        <div className="flex min-w-0 items-start gap-2 rounded-md border border-amber-500/40 bg-amber-950/40 px-3 py-2 text-xs text-amber-100">
          <Link2Off className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p className="min-w-0 break-words">
            Link público temporariamente indisponível. Use prévia ou aprovação manual.
          </p>
        </div>
      ) : null}

      <div className="grid min-w-0 gap-2 text-xs sm:grid-cols-2">
        <Info label="Status do orçamento" valor={statusOrc || 'rascunho'} />
        <Info
          label="Link seguro"
          valor={
            linkGerado
              ? meta.status === 'aguardando_cliente' || ultimoLinkUrl
                ? 'Link gerado / Aguardando cliente'
                : 'Gerado'
              : 'Não gerado'
          }
        />
        <Info
          label="Expira em"
          valor={expiraEm ? formatarData(expiraEm.slice(0, 10)) : '—'}
        />
        <Info
          label="Enviado em"
          valor={meta.enviado_em ? formatarData(meta.enviado_em.slice(0, 10)) : '—'}
        />
        <Info label="Quem marcou envio" valor={meta.enviado_por_nome || '—'} />
        <Info
          label="Resposta em"
          valor={meta.respondido_em ? formatarData(meta.respondido_em.slice(0, 10)) : '—'}
        />
        <Info label="Nome informado" valor={meta.cliente_nome || '—'} />
        <Info
          label="Observação / motivo"
          valor={meta.cliente_observacao || meta.motivo_recusa || '—'}
        />
      </div>

      {ultimoLinkUrl ? (
        <div className="min-w-0 space-y-2 rounded-md border border-emerald-500/30 bg-emerald-950/20 px-3 py-2">
          <p className="text-xs font-medium text-emerald-100">
            Link gerado (exibido só agora — não fica salvo no sistema)
          </p>
          <p className="break-all text-[11px] text-foreground/80">{ultimoLinkUrl}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={desabilitado}
              onClick={() => void copiarTexto(ultimoLinkUrl, 'link')}
            >
              <Copy className="h-4 w-4" />
              {linkCopiado ? 'Link copiado' : 'Copiar link'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={desabilitado}
              onClick={() => void copiarTexto(textoWhats, 'msg')}
            >
              <Copy className="h-4 w-4" />
              {msgCopiada ? 'Mensagem copiada' : 'Copiar mensagem'}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="max-w-full"
          disabled={desabilitado || salvando}
          onClick={() => setPreviaAberta(true)}
        >
          <Eye className="h-4 w-4" />
          Ver prévia do cliente
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={desabilitado || salvando || statusOrc === 'convertido'}
          onClick={() => void marcarEnviado()}
        >
          <Send className="h-4 w-4" />
          Marcar como enviado ao cliente
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={desabilitado}
          onClick={() => void copiarTexto(textoWhats, 'msg')}
        >
          <Copy className="h-4 w-4" />
          {msgCopiada ? 'Mensagem copiada' : 'Copiar mensagem'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={desabilitado || salvando || !linkPublicoAtivo || statusOrc === 'convertido'}
          title="Gerar link seguro de aprovação"
          onClick={() => void gerarLinkSeguro()}
        >
          <Link2 className="h-4 w-4" />
          Gerar link seguro
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
          disabled={desabilitado || salvando || !podeRegistrarResposta}
          onClick={() => {
            setNomeAprovador(cliente?.nome || '')
            setAprovarAberto(true)
          }}
        >
          <Check className="h-4 w-4" />
          Registrar aprovação manual
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="border-destructive/40 text-destructive"
          disabled={desabilitado || salvando || !podeRegistrarResposta}
          onClick={() => setRecusarAberto(true)}
        >
          <X className="h-4 w-4" />
          Registrar recusa manual
        </Button>
      </div>

      <div className="min-w-0 rounded-md border border-border/70 bg-background/40 px-3 py-2">
        <p className="mb-1 flex items-center gap-1.5 text-xs font-medium">
          <MessageCircle className="h-3.5 w-3.5 shrink-0" />
          Texto sugerido (sem envio automático)
        </p>
        <p className="whitespace-pre-wrap break-words text-xs text-foreground/80">{textoWhats}</p>
      </div>

      {(meta.eventos?.length ?? 0) > 0 ? (
        <div className="space-y-1">
          <p className="text-xs font-semibold">Histórico da aprovação</p>
          <ul className="space-y-1">
            {[...(meta.eventos ?? [])]
              .slice()
              .reverse()
              .slice(0, 8)
              .map((e) => (
                <li
                  key={e.id}
                  className="rounded border border-border/60 px-2 py-1.5 text-[11px] text-foreground/80"
                >
                  <span className="font-medium uppercase">{e.tipo}</span>
                  {e.em ? ` · ${formatarData(e.em.slice(0, 10))}` : ''}
                  {e.por_nome ? ` · ${e.por_nome}` : ''}
                  {e.cliente_nome ? ` · cliente: ${e.cliente_nome}` : ''}
                  {e.observacao ? ` · ${e.observacao}` : ''}
                </li>
              ))}
          </ul>
        </div>
      ) : null}

      <PreviaClienteOrcamentoDialog
        open={previaAberta}
        onOpenChange={setPreviaAberta}
        previa={previa}
      />

      <Dialog open={aprovarAberto} onOpenChange={setAprovarAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar aprovação manual</DialogTitle>
            <DialogDescription>
              Ao aprovar, você registra que o cliente autorizou os serviços deste orçamento. Isso não
              é pagamento e não altera o status operacional da OS automaticamente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="aprov-nome">Nome do aprovador</Label>
              <Input
                id="aprov-nome"
                value={nomeAprovador}
                onChange={(e) => setNomeAprovador(e.target.value)}
                placeholder="Nome de quem aprovou"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="aprov-obs">Observação (opcional)</Label>
              <Textarea
                id="aprov-obs"
                value={obsAprovacao}
                onChange={(e) => setObsAprovacao(e.target.value)}
                rows={3}
              />
            </div>
            <Button
              type="button"
              disabled={salvando || !nomeAprovador.trim()}
              onClick={() => void confirmarAprovacao()}
            >
              Confirmar aprovação
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={recusarAberto} onOpenChange={setRecusarAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar recusa manual</DialogTitle>
            <DialogDescription>
              Você está registrando que o cliente recusou este orçamento. A oficina fica informada no
              histórico. Status operacional da OS não muda automaticamente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="recusa-motivo">Motivo (opcional)</Label>
              <Textarea
                id="recusa-motivo"
                value={motivoRecusa}
                onChange={(e) => setMotivoRecusa(e.target.value)}
                rows={3}
              />
            </div>
            <Button
              type="button"
              variant="destructive"
              disabled={salvando}
              onClick={() => void confirmarRecusa()}
            >
              Confirmar recusa
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Info({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="min-w-0 rounded-md border border-border/60 px-2.5 py-1.5">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="break-words font-medium text-foreground">{valor}</p>
    </div>
  )
}
