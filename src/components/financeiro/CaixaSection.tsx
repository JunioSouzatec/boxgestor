/**
 * Caixa — Fase 1B/2B: abrir/fechar + movimentos manuais.
 * Não vincula pagamentos de OS. Fiado não entra no caixa.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, Wallet } from 'lucide-react'
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
import { podeGerenciarCaixa } from '@/services/auth/permissions'
import {
  abrirCaixa,
  calcularResumoCaixa,
  cancelarMovimentoCaixa,
  criarMovimentoCaixa,
  fecharCaixa,
  listarMovimentosCaixa,
  listarSessoesCaixa,
  obterCaixaAberto,
} from '@/services/caixa/caixa.service'
import { FORMAS_PAGAMENTO, getLabelFormaPagamento } from '@/types/labels'
import type {
  MovimentoCaixa,
  ResumoCaixa,
  SessaoCaixa,
  TipoMovimentoCaixa,
} from '@/types/caixa'

const AVISO_SEM_VINCULO_OS =
  'Pagamentos de OS ainda não estão vinculados ao caixa nesta fase.'

const AVISO_SALDO_ESPERADO =
  'Nesta fase, pagamentos de OS ainda não entram no caixa. Fiado não conta como dinheiro.'

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

/** Formas de caixa (sem fiado — não entra nesta fase). */
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

function labelTipoMovimento(tipo: TipoMovimentoCaixa | string): string {
  const found = TIPOS_MANUAIS.find((t) => t.value === tipo)
  if (found) return found.label
  if (tipo === 'sale') return 'Venda'
  if (tipo === 'refund') return 'Estorno'
  return tipo
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

export function CaixaSection() {
  const { session } = useAuth()
  const { configuracao } = useOficinaData()
  const { toast } = useToast()
  const { confirmar } = useConfirmacao()
  const { executar, salvando } = useSalvarAcao()

  const user = session?.user
  const officeId = user?.office_id?.trim() ?? ''
  const permitido = podeGerenciarCaixa(user, configuracao)

  const [carregando, setCarregando] = useState(true)
  const [caixaAberto, setCaixaAberto] = useState<SessaoCaixa | null>(null)
  const [resumo, setResumo] = useState<ResumoCaixa | null>(null)
  const [movimentos, setMovimentos] = useState<MovimentoCaixa[]>([])
  const [historico, setHistorico] = useState<SessaoCaixa[]>([])
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

  const carregar = useCallback(async () => {
    if (!officeId || !permitido) {
      setCarregando(false)
      return
    }
    setCarregando(true)
    setErroCarga(null)
    try {
      const [aberto, lista] = await Promise.all([
        obterCaixaAberto(officeId),
        listarSessoesCaixa(officeId, { limite: 20 }),
      ])
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
            listarMovimentosCaixa(officeId, sessao.id),
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
    } finally {
      setCarregando(false)
    }
  }, [officeId, permitido])

  useEffect(() => {
    void carregar()
  }, [carregar])

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
    const ok = await confirmar({
      titulo: 'Cancelar movimento',
      mensagem: `Cancelar ${labelTipoMovimento(mov.type)} de ${formatarMoeda(mov.amount)}? Esta ação não apaga o registro (soft delete).`,
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
          Apenas dono, administrador ou gerente com financeiro completo pode abrir e fechar o
          caixa.
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
    <div className="space-y-6 pt-2">
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-100">
        {AVISO_SEM_VINCULO_OS}
      </div>

      {erroCarga && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {erroCarga}
          <Button variant="link" className="ml-2 h-auto p-0" onClick={() => void carregar()}>
            Tentar novamente
          </Button>
        </div>
      )}

      {!caixaAberto ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Wallet className="h-4 w-4" />
              Nenhum caixa aberto
            </CardTitle>
          </CardHeader>
          <CardContent className="grid max-w-md gap-4">
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
          </CardContent>
        </Card>
      ) : (
        <>
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
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
                  <p className="text-xs text-muted-foreground">Saldo esperado</p>
                  <p className="text-sm font-semibold">{formatarMoeda(saldoEsperado)}</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{AVISO_SALDO_ESPERADO}</p>
              <Button variant="destructive" onClick={abrirDialogFechar} disabled={salvando}>
                Fechar caixa
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Novo movimento</CardTitle>
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

          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Movimentos do caixa</h3>
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
                      <TableHead>Motivo</TableHead>
                      <TableHead>Responsável</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {movimentos.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="whitespace-nowrap">
                          {formatarDataHoraCaixa(m.created_at)}
                        </TableCell>
                        <TableCell>{labelTipoMovimento(m.type)}</TableCell>
                        <TableCell className="text-right font-medium">
                          {formatarMoeda(m.amount)}
                        </TableCell>
                        <TableCell>
                          {m.payment_method
                            ? getLabelFormaPagamento(m.payment_method)
                            : '—'}
                        </TableCell>
                        <TableCell className="max-w-[180px] truncate">
                          {m.reason?.trim() || '—'}
                        </TableCell>
                        <TableCell>{m.created_by_name?.trim() || '—'}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">Ativo</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            disabled={salvando}
                            onClick={() => void handleCancelarMovimento(m)}
                          >
                            Cancelar
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </>
      )}

      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Histórico de sessões</h3>
        {historico.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            Nenhuma sessão de caixa ainda.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Abertura</TableHead>
                  <TableHead>Fechamento</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead className="text-right">Saldo inicial</TableHead>
                  <TableHead className="text-right">Saldo final</TableHead>
                  <TableHead className="text-right">Esperado</TableHead>
                  <TableHead className="text-right">Diferença</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {historico.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="whitespace-nowrap">
                      {formatarDataHoraCaixa(s.opened_at)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatarDataHoraCaixa(s.closed_at)}
                    </TableCell>
                    <TableCell>{s.opened_by_name?.trim() || '—'}</TableCell>
                    <TableCell className="text-right">
                      {formatarMoeda(s.opening_balance)}
                    </TableCell>
                    <TableCell className="text-right">
                      {s.closing_balance_informed == null
                        ? '—'
                        : formatarMoeda(s.closing_balance_informed)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatarMoeda(s.expected_balance)}
                    </TableCell>
                    <TableCell className="text-right">
                      {s.difference == null ? '—' : formatarMoeda(s.difference)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={s.status === 'open' ? 'default' : 'secondary'}>
                        {s.status === 'open' ? 'Aberto' : 'Fechado'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

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
                Calculado com saldo inicial + entradas + suprimentos − saídas − sangrias.
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
