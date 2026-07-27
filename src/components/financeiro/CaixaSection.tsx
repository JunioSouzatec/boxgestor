/**
 * Caixa — Fase 1B/2B/2C/3A: abrir/fechar + movimentos + sales/refunds + histórico auditável.
 * Cancelados não entram no saldo; permanecem na lista e na auditoria.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ExternalLink, Loader2, Wallet } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useConfirmacao } from '@/context/ConfirmacaoContext'
import { useOficinaData } from '@/context/CraftContext'
import { useToast } from '@/context/ToastContext'
import { useSalvarAcao } from '@/hooks/useSalvarAcao'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { MoneyInput } from '@/components/shared/MoneyInput'
import { MSG, mensagemAmigavel, mensagemErroSalvar } from '@/lib/mensagens-usuario'
import { formatarMoeda } from '@/lib/utils'
import { podeAcessarCaixa, podeGerenciarCaixa } from '@/services/auth/permissions'
import {
  abrirCaixa,
  calcularResumoCaixa,
  cancelarMovimentoCaixa,
  criarMovimentoCaixa,
  fecharCaixa,
  listarAuditoriaCaixa,
  listarMovimentosCaixa,
  listarSessoesCaixa,
  obterCaixaAberto,
} from '@/services/caixa/caixa.service'
import {
  lancarEstornoPendenteNoCaixa,
  listarEstornosPendentesCaixa,
  type EstornoPendenteCaixa,
} from '@/services/caixa/estornos-pendentes-caixa.service'
import { FORMAS_PAGAMENTO, getLabelFormaPagamento } from '@/types/labels'
import type {
  AuditoriaCaixa,
  MovimentoCaixa,
  ResumoCaixa,
  SessaoCaixa,
  TipoMovimentoCaixa,
} from '@/types/caixa'

const AVISO_VINCULO_OS =
  'Pagamentos de OS (exceto pendentes/a receber) entram no caixa aberto como venda. Sem caixa aberto, o pagamento continua normalmente.'

const AVISO_SALDO_ESPERADO =
  'Saldo esperado inclui entradas, suprimentos e vendas de OS; desconta saídas, sangrias e estornos. Cancelados e pagamentos pendentes não contam.'

const AVISO_HISTORICO =
  'Movimentos cancelados permanecem no histórico para auditoria e não entram no saldo/resumo.'

type TipoMovimentoManual = Extract<
  TipoMovimentoCaixa,
  'manual_in' | 'manual_out' | 'sangria' | 'suprimento'
>

const TIPOS_MANUAIS: { value: TipoMovimentoManual; label: string }[] = [
  { value: 'manual_in', label: 'Entrada manual' },
  { value: 'manual_out', label: 'Saída manual' },
  { value: 'sangria', label: 'Sangria' },
  { value: 'suprimento', label: 'Suprimento' },
]

/** Formas de caixa (sem pagamento pendente — não entra nesta fase). */
const FORMAS_CAIXA = FORMAS_PAGAMENTO.filter((f) => f.value !== 'fiado')

function formatarDataHoraCaixa(valor: string | null | undefined): string {
  if (!valor?.trim()) return '—'
  const d = new Date(valor)
  if (Number.isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}

function labelTipoMovimento(
  tipo: TipoMovimentoCaixa | string,
  cancelado = false
): string {
  if (tipo === 'sale' && cancelado) return 'Venda OS cancelada'
  const found = TIPOS_MANUAIS.find((t) => t.value === tipo)
  if (found) return found.label
  if (tipo === 'sale') return 'Venda OS'
  if (tipo === 'refund') return 'Estorno'
  return tipo
}

function labelAcaoAuditoria(action: string): string {
  switch (action) {
    case 'cash_session_opened':
      return 'Abrir caixa'
    case 'cash_session_closed':
      return 'Fechar caixa'
    case 'cash_session_notes_updated':
      return 'Observação da sessão'
    case 'cash_movement_created':
      return 'Movimento criado'
    case 'cash_movement_cancelled':
      return 'Movimento cancelado'
    case 'refund_pending_no_open_cash':
      return 'Estorno pendente: pagamento cancelado sem caixa aberto'
    case 'refund_pending_resolved':
      return 'Estorno pendente lançado no caixa'
    case 'payment_without_open_cash_authorized':
      return 'Pagamento registrado sem caixa aberto com autorização'
    default:
      return action
  }
}

function metaTexto(meta: Record<string, unknown>, key: string): string | null {
  const v = meta[key]
  if (typeof v === 'string' && v.trim()) return v.trim()
  return null
}

function labelOsVinculada(m: MovimentoCaixa): string {
  const osId = metaTexto(m.craft_meta, 'ordem_servico_id')
  if (osId) return `OS ${osId}`
  if (m.notes?.trim()) {
    const match = m.notes.match(/OS\s*[#:]?\s*([A-Za-z0-9\-]+)/i)
    if (match?.[1]) return `OS ${match[1]}`
    if (/pagamento/i.test(m.notes)) return m.notes.trim()
  }
  return '—'
}

function statusMovimento(m: MovimentoCaixa): {
  label: string
  variant: 'default' | 'secondary' | 'destructive' | 'outline'
} {
  if (m.deleted_at) {
    return { label: 'Cancelado', variant: 'destructive' }
  }
  if (m.type === 'refund') {
    return { label: 'Estorno', variant: 'outline' }
  }
  return { label: 'Ativo', variant: 'secondary' }
}

function detalheCancelamento(m: MovimentoCaixa): string {
  if (!m.deleted_at) return '—'
  const por =
    metaTexto(m.craft_meta, 'cancelled_by_name') ||
    metaTexto(m.craft_meta, 'cancelled_by') ||
    null
  const quando = formatarDataHoraCaixa(
    metaTexto(m.craft_meta, 'cancelled_at') || m.deleted_at
  )
  return por ? `${quando} · ${por}` : quando
}

function mapearErroAbrir(erro?: string): string {
  const raw = (erro ?? '').toLowerCase()
  if (raw.includes('já existe um caixa aberto')) return MSG.caixaJaAberto
  return mensagemAmigavel(erro, MSG.erroAbrirCaixa)
}

function mapearErroFechar(erro?: string): string {
  return mensagemAmigavel(erro, MSG.erroFecharCaixa)
}

function resumoVazio(sessionId: string, opening: number): ResumoCaixa {
  return {
    cash_session_id: sessionId,
    opening_balance: opening,
    totalEntradas: 0,
    totalSaidas: 0,
    totalSangrias: 0,
    totalSuprimentos: 0,
    totalVendas: 0,
    totalEstornos: 0,
    saldoEsperado: opening,
    quantidadeMovimentos: 0,
  }
}

function resumoAuditoriaPayload(a: AuditoriaCaixa): string {
  const p = a.payload ?? {}
  if (
    a.action === 'refund_pending_no_open_cash' ||
    a.action === 'refund_pending_resolved' ||
    a.action === 'payment_without_open_cash_authorized'
  ) {
    const amount = typeof p.amount === 'number' ? formatarMoeda(p.amount) : null
    const os =
      (typeof p.os_label === 'string' && p.os_label.trim()) ||
      (typeof p.numero_os === 'number' ? `OS #${p.numero_os}` : null) ||
      (typeof p.ordem_servico_id === 'string' && p.ordem_servico_id.trim()
        ? `OS ${p.ordem_servico_id}`
        : null)
    const motivo = typeof p.reason === 'string' && p.reason.trim() ? p.reason.trim() : null
    const base =
      [amount, os].filter(Boolean).join(' · ') ||
      (a.action === 'refund_pending_no_open_cash'
        ? 'Pagamento cancelado sem caixa aberto'
        : a.action === 'payment_without_open_cash_authorized'
          ? 'Pagamento autorizado sem caixa'
          : 'Estorno lançado')
    if (a.action === 'refund_pending_no_open_cash') {
      return `${base} · Abra um caixa para lançar este estorno.`
    }
    if (a.action === 'payment_without_open_cash_authorized' && motivo) {
      return `${base} · Motivo: ${motivo}`
    }
    return base
  }
  const tipo = typeof p.type === 'string' ? labelTipoMovimento(p.type) : null
  const amount = typeof p.amount === 'number' ? formatarMoeda(p.amount) : null
  const parts = [tipo, amount].filter(Boolean)
  if (parts.length) return parts.join(' · ')
  if (typeof p.difference === 'number') {
    return `Diferença ${formatarMoeda(p.difference)}`
  }
  if (typeof p.opening_balance === 'number') {
    return `Saldo inicial ${formatarMoeda(p.opening_balance)}`
  }
  return '—'
}

export function CaixaSection() {
  const { session } = useAuth()
  const { configuracao } = useOficinaData()
  const { toast } = useToast()
  const { confirmar } = useConfirmacao()
  const { executar, salvando } = useSalvarAcao()
  const location = useLocation()
  const naPaginaCaixa = location.pathname === '/caixa'

  const user = session?.user
  const officeId = user?.office_id?.trim() ?? ''
  const permitido = podeAcessarCaixa(user, configuracao)
  const podeGerenciar = podeGerenciarCaixa(user, configuracao)

  const [carregando, setCarregando] = useState(true)
  const [caixaAberto, setCaixaAberto] = useState<SessaoCaixa | null>(null)
  const [resumo, setResumo] = useState<ResumoCaixa | null>(null)
  const [movimentos, setMovimentos] = useState<MovimentoCaixa[]>([])
  const [historico, setHistorico] = useState<SessaoCaixa[]>([])
  const [auditoria, setAuditoria] = useState<AuditoriaCaixa[]>([])
  const [estornosPendentes, setEstornosPendentes] = useState<EstornoPendenteCaixa[]>([])
  const [lancandoEstornoId, setLancandoEstornoId] = useState<string | null>(null)
  const [erroCarga, setErroCarga] = useState<string | null>(null)

  const [saldoInicial, setSaldoInicial] = useState(0)
  const [obsAbrir, setObsAbrir] = useState('')

  const [tipoMov, setTipoMov] = useState<TipoMovimentoManual>('manual_in')
  const [valorMov, setValorMov] = useState(0)
  const [formaMov, setFormaMov] = useState<string>('dinheiro')
  const [motivoMov, setMotivoMov] = useState('')
  const [obsMov, setObsMov] = useState('')

  const [dialogFechar, setDialogFechar] = useState(false)
  const [saldoFinal, setSaldoFinal] = useState(0)
  const [obsFechar, setObsFechar] = useState('')

  const saldoEsperado = resumo?.saldoEsperado ?? caixaAberto?.opening_balance ?? 0
  const diferencaPreview = useMemo(
    () => Number((saldoFinal - saldoEsperado).toFixed(2)),
    [saldoFinal, saldoEsperado]
  )
  const motivoObrigatorio = tipoMov === 'manual_out' || tipoMov === 'sangria'
  const movimentosAtivos = useMemo(
    () => movimentos.filter((m) => !m.deleted_at),
    [movimentos]
  )

  const carregar = useCallback(async () => {
    if (!officeId || !permitido) {
      setCarregando(false)
      return
    }
    setCarregando(true)
    setErroCarga(null)
    try {
      // Auditoria da oficina (inclui estorno pendente sem caixa aberto / sessões fechadas)
      const [aberto, lista, auditOffice, pendentes] = await Promise.all([
        obterCaixaAberto(officeId),
        listarSessoesCaixa(officeId, { limite: 20 }),
        listarAuditoriaCaixa(officeId, undefined, 100),
        listarEstornosPendentesCaixa(officeId),
      ])
      if (auditOffice.ok) {
        setAuditoria(auditOffice.dados ?? [])
      } else {
        setAuditoria([])
      }
      if (pendentes.ok) {
        setEstornosPendentes(pendentes.dados ?? [])
      } else {
        setEstornosPendentes([])
      }
      if (!aberto.ok) {
        setErroCarga(mensagemAmigavel(aberto.erro, 'Não foi possível carregar o caixa.'))
        setCaixaAberto(null)
        setResumo(null)
        setMovimentos([])
      } else {
        const sessao = aberto.dados ?? null
        setCaixaAberto(sessao)
        if (sessao) {
          const [movs, res] = await Promise.all([
            listarMovimentosCaixa(officeId, sessao.id, { incluirCancelados: true }),
            calcularResumoCaixa(officeId, sessao.id),
          ])
          if (movs.ok) {
            setMovimentos([...(movs.dados ?? [])].reverse())
          } else {
            setMovimentos([])
            setErroCarga(
              mensagemAmigavel(movs.erro, 'Não foi possível carregar os movimentos.')
            )
          }
          if (res.ok && res.dados) {
            setResumo(res.dados)
          } else {
            setResumo(resumoVazio(sessao.id, sessao.opening_balance))
          }
        } else {
          setResumo(null)
          setMovimentos([])
        }
      }
      if (lista.ok) {
        setHistorico(lista.dados ?? [])
      } else if (aberto.ok) {
        setErroCarga(mensagemAmigavel(lista.erro, 'Não foi possível carregar o histórico.'))
      }
    } catch (err) {
      setErroCarga(mensagemErroSalvar(err, MSG.erroSalvar))
      setCaixaAberto(null)
      setResumo(null)
      setMovimentos([])
      setAuditoria([])
      setEstornosPendentes([])
    } finally {
      setCarregando(false)
    }
  }, [officeId, permitido])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const handleLancarEstornoPendente = (pendente: EstornoPendenteCaixa) => {
    if (!podeGerenciar) {
      toast.atencao(MSG.semPermissaoArea)
      return
    }
    if (!caixaAberto) {
      toast.atencao('Abra um caixa para lançar este estorno.')
      return
    }
    if (lancandoEstornoId) return

    void executar({
      sucesso: MSG.estornoPendenteLancado,
      erro: MSG.erroLancarEstornoPendente,
      acao: async () => {
        setLancandoEstornoId(pendente.audit.id)
        try {
          const r = await lancarEstornoPendenteNoCaixa({
            officeId,
            auditId: pendente.audit.id,
            createdBy: user?.id,
            createdByName: user?.nome,
          })
          if (r.status === 'sem_caixa_aberto') {
            throw new Error('Abra um caixa para lançar este estorno.')
          }
          if (r.status === 'erro') {
            throw new Error(
              mensagemAmigavel(r.erro, MSG.erroLancarEstornoPendente)
            )
          }
        } finally {
          setLancandoEstornoId(null)
        }
      },
      onSuccess: () => {
        void carregar()
      },
    })
  }

  const handleAbrir = () => {
    void executar({
      sucesso: MSG.caixaAberto,
      erro: MSG.erroAbrirCaixa,
      validar: () => {
        if (!Number.isFinite(saldoInicial) || saldoInicial < 0) {
          return MSG.saldoInicialInvalido
        }
        if (!officeId) return MSG.erroAbrirCaixa
        return null
      },
      acao: async () => {
        const r = await abrirCaixa({
          officeId,
          openingBalance: saldoInicial,
          openedBy: user?.id,
          openedByName: user?.nome,
          notes: obsAbrir.trim() || null,
        })
        if (!r.ok) throw new Error(mapearErroAbrir(r.erro))
        setSaldoInicial(0)
        setObsAbrir('')
      },
      onSuccess: () => {
        void carregar()
      },
    })
  }

  const handleRegistrarMovimento = () => {
    if (!caixaAberto) {
      toast.atencao(MSG.caixaFechadoSemMovimento)
      return
    }
    void executar({
      sucesso: MSG.movimentoCaixaRegistrado,
      erro: MSG.erroRegistrarMovimentoCaixa,
      validar: () => {
        if (!Number.isFinite(valorMov) || valorMov <= 0) {
          return MSG.valorMovimentoCaixaInvalido
        }
        if (motivoObrigatorio && !motivoMov.trim()) {
          return MSG.motivoSaidaSangriaObrigatorio
        }
        return null
      },
      acao: async () => {
        const r = await criarMovimentoCaixa({
          officeId,
          cashSessionId: caixaAberto.id,
          type: tipoMov,
          amount: valorMov,
          paymentMethod: formaMov || null,
          reason: motivoMov.trim() || null,
          notes: obsMov.trim() || null,
          createdBy: user?.id,
          createdByName: user?.nome,
        })
        if (!r.ok) {
          throw new Error(
            mensagemAmigavel(r.erro, MSG.erroRegistrarMovimentoCaixa)
          )
        }
        setValorMov(0)
        setMotivoMov('')
        setObsMov('')
      },
      onSuccess: () => {
        void carregar()
      },
    })
  }

  const handleCancelarMovimento = async (mov: MovimentoCaixa) => {
    if (mov.deleted_at) return
    if (mov.type === 'sale' || mov.type === 'refund') {
      toast.atencao(
        'Vendas e estornos de OS são tratados pelo cancelamento do pagamento, não pelo botão de movimento.'
      )
      return
    }
    const ok = await confirmar({
      titulo: 'Cancelar movimento',
      mensagem: `Cancelar ${labelTipoMovimento(mov.type, Boolean(mov.deleted_at))} de ${formatarMoeda(mov.amount)}? O registro permanece no histórico (soft delete) e sai do saldo.`,
      confirmarTexto: 'Cancelar movimento',
      destrutivo: true,
    })
    if (!ok) return

    void executar({
      sucesso: MSG.movimentoCaixaCancelado,
      erro: MSG.erroCancelarMovimentoCaixa,
      acao: async () => {
        const r = await cancelarMovimentoCaixa({
          officeId,
          movementId: mov.id,
          cancelledBy: user?.id,
          cancelledByName: user?.nome,
        })
        if (!r.ok) {
          throw new Error(
            mensagemAmigavel(r.erro, MSG.erroCancelarMovimentoCaixa)
          )
        }
      },
      onSuccess: () => {
        void carregar()
      },
    })
  }

  const abrirDialogFechar = () => {
    if (!caixaAberto) {
      toast.atencao(MSG.erroFecharCaixa)
      return
    }
    setSaldoFinal(saldoEsperado)
    setObsFechar(caixaAberto.notes ?? '')
    setDialogFechar(true)
  }

  const handleFechar = () => {
    if (!caixaAberto) {
      toast.atencao(MSG.erroFecharCaixa)
      return
    }
    void executar({
      sucesso: MSG.caixaFechado,
      erro: MSG.erroFecharCaixa,
      validar: () => {
        if (!Number.isFinite(saldoFinal) || saldoFinal < 0) {
          return MSG.saldoFinalInvalido
        }
        return null
      },
      acao: async () => {
        const r = await fecharCaixa({
          officeId,
          sessionId: caixaAberto.id,
          closingBalanceInformed: saldoFinal,
          closedBy: user?.id,
          closedByName: user?.nome,
          notes: obsFechar.trim() || null,
        })
        if (!r.ok) throw new Error(mapearErroFechar(r.erro))
      },
      onSuccess: () => {
        setDialogFechar(false)
        void carregar()
      },
    })
  }

  if (!permitido) {
    return (
      <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center">
        <p className="text-sm text-muted-foreground">{MSG.semPermissaoArea}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          Apenas dono, administrador, gerente com financeiro completo ou recepção com acesso
          liberado pelo dono pode acessar o caixa.
        </p>
      </div>
    )
  }

  if (carregando) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando caixa…
      </div>
    )
  }

  return (
    <div className="space-y-8 pt-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground max-w-3xl">
          {AVISO_VINCULO_OS}
        </div>
        {!naPaginaCaixa && (
          <Button variant="outline" size="sm" asChild>
            <Link to="/caixa" className="gap-1.5">
              Abrir página Caixa
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </Button>
        )}
      </div>

      {!podeGerenciar && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-sm text-muted-foreground">
          Modo visualização: você pode consultar o caixa. Abrir/fechar e lançar movimentos
          ficam restritos ao dono, administrador ou gerente com financeiro completo.
        </div>
      )}

      {erroCarga && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {erroCarga}
          <Button variant="link" className="ml-2 h-auto p-0" onClick={() => void carregar()}>
            Tentar novamente
          </Button>
        </div>
      )}

      <section className="space-y-3">
        <h2 className="text-base font-semibold">1. Caixa atual</h2>
        {!caixaAberto ? (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Wallet className="h-4 w-4" />
                Nenhum caixa aberto
              </CardTitle>
            </CardHeader>
            <CardContent className="grid max-w-md gap-4">
              {podeGerenciar ? (
                <>
                  <div className="grid gap-2">
                    <Label htmlFor="caixa-saldo-inicial">Saldo inicial</Label>
                    <MoneyInput
                      id="caixa-saldo-inicial"
                      value={saldoInicial}
                      onChange={setSaldoInicial}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="caixa-obs-abrir">Observação (opcional)</Label>
                    <Textarea
                      id="caixa-obs-abrir"
                      value={obsAbrir}
                      onChange={(e) => setObsAbrir(e.target.value)}
                      rows={2}
                      placeholder="Ex.: troco do dia"
                    />
                  </div>
                  <Button onClick={handleAbrir} disabled={salvando}>
                    {salvando ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Abrindo…
                      </>
                    ) : (
                      'Abrir caixa'
                    )}
                  </Button>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Aguarde um responsável abrir o caixa.
                </p>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Wallet className="h-4 w-4" />
                  Resumo do caixa
                </CardTitle>
                <Badge variant="default">Aberto</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                <div>
                  <p className="text-xs text-muted-foreground">Responsável</p>
                  <p className="text-sm font-medium">
                    {caixaAberto.opened_by_name?.trim() || '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Abertura</p>
                  <p className="text-sm font-medium">
                    {formatarDataHoraCaixa(caixaAberto.opened_at)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Saldo inicial</p>
                  <p className="text-sm font-medium">
                    {formatarMoeda(resumo?.opening_balance ?? caixaAberto.opening_balance)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Entradas</p>
                  <p className="text-sm font-medium">
                    {formatarMoeda(resumo?.totalEntradas ?? 0)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Vendas OS</p>
                  <p className="text-sm font-medium">
                    {formatarMoeda(resumo?.totalVendas ?? 0)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Suprimentos</p>
                  <p className="text-sm font-medium">
                    {formatarMoeda(resumo?.totalSuprimentos ?? 0)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Saídas</p>
                  <p className="text-sm font-medium">
                    {formatarMoeda(resumo?.totalSaidas ?? 0)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Sangrias</p>
                  <p className="text-sm font-medium">
                    {formatarMoeda(resumo?.totalSangrias ?? 0)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Estornos</p>
                  <p className="text-sm font-medium">
                    {formatarMoeda(resumo?.totalEstornos ?? 0)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Saldo esperado</p>
                  <p className="text-sm font-semibold">{formatarMoeda(saldoEsperado)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Diferença</p>
                  <p className="text-sm font-medium text-muted-foreground">
                    Informada no fechamento
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Movimentos ativos</p>
                  <p className="text-sm font-medium">{movimentosAtivos.length}</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{AVISO_SALDO_ESPERADO}</p>
              {podeGerenciar && (
                <Button variant="destructive" onClick={abrirDialogFechar} disabled={salvando}>
                  Fechar caixa
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </section>

      {estornosPendentes.length > 0 && (
        <section className="space-y-3">
          <Card className="border-amber-500/40 bg-amber-500/5">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Estornos pendentes</CardTitle>
              <p className="text-sm text-muted-foreground">
                Há {estornosPendentes.length} pagamento(s) cancelado(s) sem caixa aberto
                para estorno.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {!caixaAberto && (
                <p className="text-sm text-muted-foreground">
                  Abra um caixa para lançar este estorno.
                </p>
              )}
              <div className="overflow-x-auto rounded-lg border border-border bg-background">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data do cancelamento</TableHead>
                      <TableHead>OS</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead>Forma</TableHead>
                      <TableHead>Responsável</TableHead>
                      <TableHead className="text-right">Ação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {estornosPendentes.map((p) => (
                      <TableRow key={p.audit.id}>
                        <TableCell className="whitespace-nowrap">
                          {formatarDataHoraCaixa(p.cancelledAt)}
                        </TableCell>
                        <TableCell>
                          {p.osLabel?.trim() ||
                            (p.ordemServicoId ? `OS ${p.ordemServicoId}` : '—')}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatarMoeda(p.amount)}
                        </TableCell>
                        <TableCell>
                          {p.paymentMethod
                            ? getLabelFormaPagamento(p.paymentMethod)
                            : '—'}
                        </TableCell>
                        <TableCell>{p.actorName?.trim() || '—'}</TableCell>
                        <TableCell className="text-right">
                          {caixaAberto && podeGerenciar ? (
                            <Button
                              size="sm"
                              disabled={salvando || lancandoEstornoId === p.audit.id}
                              onClick={() => handleLancarEstornoPendente(p)}
                            >
                              {lancandoEstornoId === p.audit.id ? (
                                <>
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  Lançando…
                                </>
                              ) : (
                                'Lançar estorno neste caixa'
                              )}
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              {podeGerenciar
                                ? 'Abra um caixa para lançar este estorno.'
                                : 'Somente gestores podem lançar o estorno.'}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </section>
      )}

      {caixaAberto && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold">2. Movimentos do caixa</h2>
          <p className="text-xs text-muted-foreground">{AVISO_HISTORICO}</p>

          {podeGerenciar && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Registrar movimento</CardTitle>
            </CardHeader>
            <CardContent className="grid max-w-xl gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label>Tipo</Label>
                  <Select
                    value={tipoMov}
                    onValueChange={(v) => setTipoMov(v as TipoMovimentoManual)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIPOS_MANUAIS.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="caixa-mov-valor">Valor</Label>
                  <MoneyInput
                    id="caixa-mov-valor"
                    value={valorMov}
                    onChange={setValorMov}
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Forma</Label>
                <Select value={formaMov} onValueChange={setFormaMov}>
                  <SelectTrigger>
                    <SelectValue placeholder="Forma" />
                  </SelectTrigger>
                  <SelectContent>
                    {FORMAS_CAIXA.map((f) => (
                      <SelectItem key={f.value} value={f.value}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="caixa-mov-motivo">
                  Motivo{motivoObrigatorio ? ' *' : ' (opcional)'}
                </Label>
                <Input
                  id="caixa-mov-motivo"
                  value={motivoMov}
                  onChange={(e) => setMotivoMov(e.target.value)}
                  placeholder={
                    motivoObrigatorio
                      ? 'Obrigatório para saída/sangria'
                      : 'Ex.: troco, reforço'
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="caixa-mov-obs">Observação (opcional)</Label>
                <Textarea
                  id="caixa-mov-obs"
                  value={obsMov}
                  onChange={(e) => setObsMov(e.target.value)}
                  rows={2}
                />
              </div>
              <Button onClick={handleRegistrarMovimento} disabled={salvando}>
                {salvando ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Registrando…
                  </>
                ) : (
                  'Registrar movimento'
                )}
              </Button>
            </CardContent>
          </Card>
          )}

          {movimentos.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
              Nenhum movimento registrado nesta sessão.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data/hora</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Forma</TableHead>
                    <TableHead>OS</TableHead>
                    <TableHead>Responsável</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Motivo</TableHead>
                    <TableHead>Observação</TableHead>
                    <TableHead>Cancelamento</TableHead>
                    <TableHead className="text-right">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movimentos.map((m) => {
                    const st = statusMovimento(m)
                    const podeCancelarUi =
                      !m.deleted_at && m.type !== 'sale' && m.type !== 'refund'
                    return (
                      <TableRow
                        key={m.id}
                        className={m.deleted_at ? 'opacity-75' : undefined}
                      >
                        <TableCell className="whitespace-nowrap">
                          {formatarDataHoraCaixa(m.created_at)}
                        </TableCell>
                        <TableCell>
                          {labelTipoMovimento(m.type, Boolean(m.deleted_at))}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatarMoeda(m.amount)}
                        </TableCell>
                        <TableCell>
                          {m.payment_method
                            ? getLabelFormaPagamento(m.payment_method)
                            : '—'}
                        </TableCell>
                        <TableCell className="max-w-[140px] truncate">
                          {labelOsVinculada(m)}
                        </TableCell>
                        <TableCell>{m.created_by_name?.trim() || '—'}</TableCell>
                        <TableCell>
                          <Badge variant={st.variant}>{st.label}</Badge>
                        </TableCell>
                        <TableCell className="max-w-[140px] truncate">
                          {m.reason?.trim() || '—'}
                        </TableCell>
                        <TableCell className="max-w-[160px] truncate">
                          {m.notes?.trim() || '—'}
                        </TableCell>
                        <TableCell className="max-w-[180px] truncate text-xs text-muted-foreground">
                          {detalheCancelamento(m)}
                        </TableCell>
                        <TableCell className="text-right">
                          {podeCancelarUi && podeGerenciar ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive"
                              disabled={salvando}
                              onClick={() => void handleCancelarMovimento(m)}
                            >
                              Cancelar
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-base font-semibold">3. Histórico de caixas</h2>
        {historico.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            Nenhuma sessão de caixa ainda.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead>Abertura</TableHead>
                  <TableHead>Fechamento</TableHead>
                  <TableHead className="text-right">Saldo inicial</TableHead>
                  <TableHead className="text-right">Saldo esperado</TableHead>
                  <TableHead className="text-right">Saldo informado</TableHead>
                  <TableHead className="text-right">Diferença</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {historico.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <Badge variant={s.status === 'open' ? 'default' : 'secondary'}>
                        {s.status === 'open' ? 'Aberto' : 'Fechado'}
                      </Badge>
                    </TableCell>
                    <TableCell>{s.opened_by_name?.trim() || '—'}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatarDataHoraCaixa(s.opened_at)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatarDataHoraCaixa(s.closed_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatarMoeda(s.opening_balance)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatarMoeda(s.expected_balance)}
                    </TableCell>
                    <TableCell className="text-right">
                      {s.closing_balance_informed == null
                        ? '—'
                        : formatarMoeda(s.closing_balance_informed)}
                    </TableCell>
                    <TableCell className="text-right">
                      {s.difference == null ? '—' : formatarMoeda(s.difference)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">4. Auditoria</h2>
        <p className="text-xs text-muted-foreground">
          Eventos de abrir/fechar caixa, criar e cancelar movimentos, vendas OS, estornos e
          estornos pendentes quando não há caixa aberto.
        </p>
        {auditoria.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            Nenhum evento de auditoria ainda.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data/hora</TableHead>
                  <TableHead>Evento</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead>Detalhe</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {auditoria.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="whitespace-nowrap">
                      {formatarDataHoraCaixa(a.created_at)}
                    </TableCell>
                    <TableCell>{labelAcaoAuditoria(a.action)}</TableCell>
                    <TableCell>{a.actor_name?.trim() || '—'}</TableCell>
                    <TableCell className="max-w-[280px] truncate text-muted-foreground">
                      {resumoAuditoriaPayload(a)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <Dialog open={dialogFechar} onOpenChange={setDialogFechar}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Fechar caixa</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="rounded-md bg-muted/50 px-3 py-2 text-sm space-y-1">
              <p>
                Saldo esperado:{' '}
                <span className="font-medium">{formatarMoeda(saldoEsperado)}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                Calculado com saldo inicial + entradas + suprimentos + vendas OS − saídas −
                sangrias − estornos (apenas movimentos ativos).
              </p>
              <p className="text-xs text-muted-foreground">{AVISO_SALDO_ESPERADO}</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="caixa-saldo-final">Saldo final informado</Label>
              <MoneyInput
                id="caixa-saldo-final"
                value={saldoFinal}
                onChange={setSaldoFinal}
              />
            </div>
            <div className="rounded-md border border-border px-3 py-2 text-sm">
              Diferença:{' '}
              <span
                className={
                  diferencaPreview === 0
                    ? 'font-medium'
                    : diferencaPreview > 0
                      ? 'font-medium text-emerald-700 dark:text-emerald-400'
                      : 'font-medium text-destructive'
                }
              >
                {formatarMoeda(diferencaPreview)}
              </span>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="caixa-obs-fechar">Observação (opcional)</Label>
              <Textarea
                id="caixa-obs-fechar"
                value={obsFechar}
                onChange={(e) => setObsFechar(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              onClick={() => setDialogFechar(false)}
              disabled={salvando}
            >
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleFechar} disabled={salvando}>
              {salvando ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Fechando…
                </>
              ) : (
                'Confirmar fechamento'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
