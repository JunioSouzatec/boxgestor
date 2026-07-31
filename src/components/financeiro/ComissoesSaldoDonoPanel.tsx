/**
 * RC2 Comissão Fase B2 — painel do dono: conta corrente por OS, saldo em aberto e baixas parciais.
 * Mantém o legado de payments apenas como aviso; não remove o fluxo antigo.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Lock, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { MoneyInput } from '@/components/shared/MoneyInput'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/context/ToastContext'
import { formatarData, formatarMoeda, getMesLocalAtual } from '@/lib/utils'
import { FORMAS_PAGAMENTO, getLabelFormaPagamento } from '@/types/labels'
import type { FormaPagamento } from '@/types/enums'
import type { ComissoesConfigOficina, PagamentoComissaoFolha, PerfilComissaoFuncionario } from '@/types/comissoes'
import type { ComissaoItem, ComissaoSettlement } from '@/types/comissao-itens'
import type { LancamentoFinanceiro } from '@/types/financeiro'
import type { OrdemServico } from '@/types/ordem-servico'
import { comissaoItensDisponivel } from '@/services/comissoes/comissao-itens.service'
import {
  labelStatusLinhaContaCorrente,
  montarSaldosPorFuncionario,
  sincronizarItensComissaoPeriodo,
  statusLinhaContaCorrente,
  type StatusLinhaContaCorrente,
} from '@/services/comissoes/comissao-itens-sync.service'
import {
  criarBaixaComissaoParcial,
  listarAlocacoesDaBaixa,
  listarBaixasComissaoFuncionario,
  settlementsDisponivel,
} from '@/services/comissoes/comissao-settlements.service'

interface Props {
  oficinaId: string
  perfis: PerfilComissaoFuncionario[]
  ordens: OrdemServico[]
  lancamentos: LancamentoFinanceiro[]
  config: ComissoesConfigOficina
  clientesPorId: Map<string, string>
  veiculoLabelPorId: Map<string, string>
  /** Baixas antigas (employee_commission_payments) — só aviso/legado */
  pagamentosLegado: PagamentoComissaoFolha[]
  podePagar: boolean
  recursoPremium: boolean
  ehDonoOuAdmin: boolean
  usuarioAtual?: { id?: string; nome?: string }
}

function badgeStatusLinha(status: StatusLinhaContaCorrente) {
  if (status === 'pago') return <Badge variant="success">{labelStatusLinhaContaCorrente(status)}</Badge>
  if (status === 'parcial') return <Badge variant="warning">{labelStatusLinhaContaCorrente(status)}</Badge>
  if (status === 'em_aberto') {
    return <Badge variant="secondary">{labelStatusLinhaContaCorrente(status)}</Badge>
  }
  return <Badge variant="outline">{labelStatusLinhaContaCorrente(status)}</Badge>
}

function badgeStatusItem(status: ComissaoItem['status']) {
  if (status === 'pago') return <Badge variant="success">OS quitada</Badge>
  if (status === 'parcial') return <Badge variant="warning">OS parcial</Badge>
  if (status === 'em_aberto') return <Badge variant="secondary">OS em aberto</Badge>
  if (status === 'cancelado') return <Badge variant="outline">Cancelado</Badge>
  return <Badge variant="outline">{status}</Badge>
}

export function ComissoesSaldoDonoPanel({
  oficinaId,
  perfis,
  ordens,
  lancamentos,
  config,
  clientesPorId,
  veiculoLabelPorId,
  pagamentosLegado,
  podePagar,
  recursoPremium,
  ehDonoOuAdmin,
  usuarioAtual,
}: Props) {
  const { toast } = useToast()
  const [mesReferencia, setMesReferencia] = useState(getMesLocalAtual())
  const [itens, setItens] = useState<ComissaoItem[]>([])
  const [sincronizando, setSincronizando] = useState(false)
  const [detalheId, setDetalheId] = useState<string | null>(null)
  const [baixas, setBaixas] = useState<ComissaoSettlement[]>([])
  const [alocacoesPorBaixa, setAlocacoesPorBaixa] = useState<
    Record<string, Array<{ commission_item_id: string; amount_paid: number }>>
  >({})

  const [modoPagar, setModoPagar] = useState<'tudo' | 'parcial' | null>(null)
  const [valorParcial, setValorParcial] = useState(0)
  const [formaPagamento, setFormaPagamento] = useState<FormaPagamento>('dinheiro')
  const [obsBaixa, setObsBaixa] = useState('')
  const [salvandoBaixa, setSalvandoBaixa] = useState(false)

  const modeloNovoDisponivel = comissaoItensDisponivel() && settlementsDisponivel()

  const saldos = useMemo(
    () => montarSaldosPorFuncionario(perfis, itens, mesReferencia),
    [perfis, itens, mesReferencia]
  )

  const sincronizar = useCallback(async () => {
    if (!modeloNovoDisponivel) {
      setItens([])
      return
    }
    setSincronizando(true)
    const resultado = await sincronizarItensComissaoPeriodo({
      officeIdLocal: oficinaId,
      perfis,
      ordens,
      lancamentos,
      config,
      competenceMonth: mesReferencia,
      clientePorId: clientesPorId,
      veiculoLabelPorId,
    })
    setItens(resultado.itens)
    setSincronizando(false)
    if (resultado.erros.length > 0) {
      toast.atencao(
        `Sincronização parcial: ${resultado.erros.length} aviso(s). ${resultado.erros[0]}`
      )
    }
  }, [
    modeloNovoDisponivel,
    oficinaId,
    perfis,
    ordens,
    lancamentos,
    config,
    mesReferencia,
    clientesPorId,
    veiculoLabelPorId,
    toast,
  ])

  useEffect(() => {
    void sincronizar()
  }, [sincronizar])

  const carregarBaixasDetalhe = useCallback(
    async (employeeId: string) => {
      if (!modeloNovoDisponivel) {
        setBaixas([])
        setAlocacoesPorBaixa({})
        return
      }
      const lista = await listarBaixasComissaoFuncionario(oficinaId, employeeId, {
        competenceMonth: mesReferencia,
      })
      setBaixas(lista)
      const mapa: Record<string, Array<{ commission_item_id: string; amount_paid: number }>> = {}
      for (const b of lista.slice(0, 20)) {
        mapa[b.id] = await listarAlocacoesDaBaixa(oficinaId, b.id)
      }
      setAlocacoesPorBaixa(mapa)
    },
    [modeloNovoDisponivel, oficinaId, mesReferencia]
  )

  useEffect(() => {
    if (!detalheId) return
    void carregarBaixasDetalhe(detalheId)
  }, [detalheId, carregarBaixasDetalhe])

  const perfilDetalhe = detalheId ? perfis.find((p) => p.id === detalheId) : undefined
  const saldoDetalhe = detalheId ? saldos.get(detalheId) : undefined
  const itensDetalhe = useMemo(
    () =>
      detalheId
        ? itens
            .filter((i) => i.employee_id === detalheId && i.status !== 'cancelado')
            .sort((a, b) => (a.reference_date || '').localeCompare(b.reference_date || ''))
        : [],
    [detalheId, itens]
  )
  const itensAbertos = itensDetalhe.filter(
    (i) => i.status === 'em_aberto' || (i.status === 'parcial' && i.open_amount > 0.009)
  )
  const itensPagosOuParciais = itensDetalhe.filter(
    (i) => i.status === 'pago' || i.status === 'parcial'
  )

  const legadoDoFuncionario = (employeeId: string) =>
    pagamentosLegado.find(
      (p) =>
        p.employee_local_id === employeeId &&
        p.competence_month === mesReferencia &&
        !p.canceled_at
    )

  function abrirPagar(modo: 'tudo' | 'parcial') {
    if (!saldoDetalhe || saldoDetalhe.saldo_em_aberto <= 0.009) {
      toast.atencao('Não há saldo em aberto para este funcionário.')
      return
    }
    setModoPagar(modo)
    setValorParcial(modo === 'tudo' ? saldoDetalhe.saldo_em_aberto : 0)
    setFormaPagamento('dinheiro')
    setObsBaixa('')
  }

  async function confirmarBaixaNova() {
    if (!perfilDetalhe || !saldoDetalhe || !modoPagar) return
    const valor =
      modoPagar === 'tudo' ? saldoDetalhe.saldo_em_aberto : Number(valorParcial)
    if (!Number.isFinite(valor) || valor <= 0) {
      toast.atencao('Informe um valor maior que zero.')
      return
    }
    if (valor > saldoDetalhe.saldo_em_aberto + 0.009) {
      toast.atencao('Valor maior que o saldo em aberto.')
      return
    }

    setSalvandoBaixa(true)
    const resultado = await criarBaixaComissaoParcial(
      oficinaId,
      {
        employee_id: perfilDetalhe.id,
        employee_name: perfilDetalhe.nome,
        amount_paid: valor,
        payment_method: formaPagamento,
        competence_month: mesReferencia,
        notes: obsBaixa.trim() || undefined,
      },
      usuarioAtual
    )
    setSalvandoBaixa(false)

    if (!resultado.ok) {
      toast.erro(resultado.erro ?? 'Não foi possível registrar a baixa.')
      return
    }

    toast.sucesso(
      resultado.excedente && resultado.excedente > 0
        ? `Baixa registrada. Excedente não alocado: ${formatarMoeda(resultado.excedente)}.`
        : 'Baixa de comissão registrada.'
    )
    setModoPagar(null)
    await sincronizar()
    await carregarBaixasDetalhe(perfilDetalhe.id)
  }

  const totais = useMemo(() => {
    let gerado = 0
    let pago = 0
    let aberto = 0
    for (const s of saldos.values()) {
      gerado += s.total_gerado
      pago += s.total_pago
      aberto += s.saldo_em_aberto
    }
    return {
      gerado: Math.round(gerado * 100) / 100,
      pago: Math.round(pago * 100) / 100,
      aberto: Math.round(aberto * 100) / 100,
    }
  }, [saldos])

  if (!modeloNovoDisponivel) {
    return (
      <div className="rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
        Controle por OS e baixas parciais disponível com sincronização online (Supabase) e plano com
        comissão em folha. O resumo mensal antigo continua abaixo, se visível.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">Saldo em aberto por funcionário</h3>
          <p className="text-sm text-muted-foreground">
            Conta corrente da comissão: gerado no período, pago e saldo em aberto (devedor da oficina
            com o mecânico). Filtro de competência não fecha o mês.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="mes-comissao-b2">Período (competência)</Label>
            <Input
              id="mes-comissao-b2"
              type="month"
              value={mesReferencia}
              onChange={(e) => setMesReferencia(e.target.value)}
              className="w-[180px]"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={sincronizando}
            onClick={() => void sincronizar()}
          >
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${sincronizando ? 'animate-spin' : ''}`} />
            Sincronizar comissões por OS
          </Button>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-muted/20 p-3">
          <p className="text-[11px] uppercase text-muted-foreground">Gerado no período</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">{formatarMoeda(totais.gerado)}</p>
        </div>
        <div className="rounded-lg border border-border bg-muted/20 p-3">
          <p className="text-[11px] uppercase text-muted-foreground">Pago</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">{formatarMoeda(totais.pago)}</p>
        </div>
        <div className="rounded-lg border border-border bg-muted/20 p-3">
          <p className="text-[11px] uppercase text-muted-foreground">Em aberto</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-primary">
            {formatarMoeda(totais.aberto)}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Funcionário</TableHead>
              <TableHead className="text-right">Gerado no período</TableHead>
              <TableHead className="text-right">Pago</TableHead>
              <TableHead className="text-right">Em aberto</TableHead>
              <TableHead className="text-center">OS em aberto</TableHead>
              <TableHead className="text-center">OS pagas/parciais</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {perfis.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  Nenhum funcionário cadastrado.
                </TableCell>
              </TableRow>
            ) : (
              perfis.map((p) => {
                const saldo = saldos.get(p.id)
                const status = statusLinhaContaCorrente(p, saldo)
                const legado = legadoDoFuncionario(p.id)
                return (
                  <TableRow
                    key={p.id}
                    className="cursor-pointer hover:bg-muted/40"
                    onClick={() => setDetalheId(p.id)}
                  >
                    <TableCell>
                      <p className="font-medium text-primary underline-offset-2 hover:underline">
                        {p.nome}
                      </p>
                      <p className="text-xs text-muted-foreground">{p.cargo}</p>
                      {legado && (saldo?.total_gerado ?? 0) <= 0.009 && (
                        <p className="mt-0.5 text-[10px] text-amber-600 dark:text-amber-400">
                          Baixa antiga do modelo mensal
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatarMoeda(saldo?.total_gerado ?? 0)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatarMoeda(saldo?.total_pago ?? 0)}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatarMoeda(saldo?.saldo_em_aberto ?? 0)}
                    </TableCell>
                    <TableCell className="text-center">{saldo?.qtd_itens_abertos ?? 0}</TableCell>
                    <TableCell className="text-center">
                      {(saldo?.qtd_itens_pagos ?? 0) + (saldo?.qtd_itens_parciais ?? 0)}
                    </TableCell>
                    <TableCell className="text-center">{badgeStatusLinha(status)}</TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      {podePagar ? (
                        <Button variant="ghost" size="sm" onClick={() => setDetalheId(p.id)}>
                          Ver detalhe
                        </Button>
                      ) : !recursoPremium && ehDonoOuAdmin ? (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Lock className="h-3 w-3" />
                          Premium
                        </span>
                      ) : (
                        <Button variant="ghost" size="sm" onClick={() => setDetalheId(p.id)}>
                          Ver
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={Boolean(detalheId)}
        onOpenChange={(open) => {
          if (!open) setDetalheId(null)
        }}
      >
        <DialogContent className="flex max-h-[96dvh] w-full flex-col gap-0 overflow-hidden p-0 max-lg:h-[96dvh] lg:max-h-[90dvh] lg:w-[min(92vw,1180px)] lg:max-w-[min(92vw,1180px)]">
          <DialogHeader className="shrink-0 space-y-1 border-b border-border px-4 py-4 pr-12 sm:px-6">
            <DialogTitle className="text-left text-lg sm:text-xl">
              Conta corrente — {perfilDetalhe?.nome ?? 'Funcionário'}
            </DialogTitle>
            <p className="text-left text-xs text-muted-foreground sm:text-sm">
              Saldo em aberto = comissão gerada ainda não baixada. Novas OS aumentam o saldo; baixas
              não fecham o mês inteiro.
            </p>
          </DialogHeader>

          {perfilDetalhe && saldoDetalhe && (
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4 sm:px-6">
              {legadoDoFuncionario(perfilDetalhe.id) && (
                <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-muted-foreground">
                  Este funcionário possui baixa antiga do modelo mensal. O novo controle por OS será
                  usado para próximas comissões. Use &quot;Sincronizar comissões por OS&quot; se a
                  lista estiver vazia.
                </p>
              )}

              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                <div className="rounded-xl border border-border bg-muted/20 p-3">
                  <p className="text-[11px] uppercase text-muted-foreground">Total gerado</p>
                  <p className="mt-1 font-semibold tabular-nums">
                    {formatarMoeda(saldoDetalhe.total_gerado)}
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-muted/20 p-3">
                  <p className="text-[11px] uppercase text-muted-foreground">Total pago</p>
                  <p className="mt-1 font-semibold tabular-nums">
                    {formatarMoeda(saldoDetalhe.total_pago)}
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-muted/20 p-3">
                  <p className="text-[11px] uppercase text-muted-foreground">Saldo em aberto</p>
                  <p className="mt-1 font-semibold tabular-nums text-primary">
                    {formatarMoeda(saldoDetalhe.saldo_em_aberto)}
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-muted/20 p-3">
                  <p className="text-[11px] uppercase text-muted-foreground">Última baixa</p>
                  {baixas[0] ? (
                    <>
                      <p className="mt-1 text-sm font-semibold tabular-nums">
                        {formatarMoeda(baixas[0].amount_paid)}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {formatarData(baixas[0].paid_at)}
                        {baixas[0].payment_method
                          ? ` · ${getLabelFormaPagamento(baixas[0].payment_method)}`
                          : ''}
                      </p>
                    </>
                  ) : (
                    <p className="mt-1 text-sm text-muted-foreground">—</p>
                  )}
                </div>
              </div>

              {podePagar && saldoDetalhe.saldo_em_aberto > 0.009 && (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => abrirPagar('tudo')}>
                    <CheckCircle2 className="mr-1.5 h-4 w-4" />
                    Pagar tudo em aberto
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => abrirPagar('parcial')}>
                    Pagar valor parcial
                  </Button>
                </div>
              )}

              <section className="space-y-2">
                <h4 className="text-sm font-semibold">Comissões em aberto</h4>
                <ListaItensTabela itens={itensAbertos} vazia="Nenhuma OS em aberto neste período." />
              </section>

              <section className="space-y-2">
                <h4 className="text-sm font-semibold">Comissões pagas / parciais</h4>
                <ListaItensTabela
                  itens={itensPagosOuParciais}
                  vazia="Nenhuma OS paga ou parcial neste período."
                />
              </section>

              <section className="space-y-2">
                <h4 className="text-sm font-semibold">Baixas realizadas</h4>
                {baixas.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
                    Nenhuma baixa de comissão neste período.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {baixas.map((b) => {
                      const alocs = alocacoesPorBaixa[b.id] ?? []
                      const osLabels = alocs
                        .map((a) => {
                          const item = itens.find((i) => i.id === a.commission_item_id)
                          return item?.service_order_number
                            ? `#${item.service_order_number} (${formatarMoeda(a.amount_paid)})`
                            : null
                        })
                        .filter(Boolean)
                      return (
                        <div key={b.id} className="rounded-lg border border-border p-3 text-sm">
                          <div className="flex flex-wrap justify-between gap-2">
                            <div>
                              <p className="font-medium tabular-nums">
                                {formatarMoeda(b.amount_paid)}
                                {b.payment_method
                                  ? ` · ${getLabelFormaPagamento(b.payment_method)}`
                                  : ''}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {formatarData(b.paid_at)}
                                {b.paid_by_name ? ` · ${b.paid_by_name}` : ''}
                              </p>
                            </div>
                            <Badge variant="outline">{b.status}</Badge>
                          </div>
                          {osLabels.length > 0 && (
                            <p className="mt-1.5 text-xs text-muted-foreground">
                              OS: {osLabels.join(', ')}
                            </p>
                          )}
                          {b.notes && (
                            <p className="mt-1 text-xs text-muted-foreground">{b.notes}</p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </section>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(modoPagar)}
        onOpenChange={(open) => {
          if (!open && !salvandoBaixa) setModoPagar(null)
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {modoPagar === 'tudo' ? 'Pagar tudo em aberto' : 'Pagar valor parcial'}
            </DialogTitle>
          </DialogHeader>
          {perfilDetalhe && saldoDetalhe && (
            <div className="space-y-4">
              <dl className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-muted/20 p-3 text-sm">
                <div className="col-span-2">
                  <dt className="text-[11px] text-muted-foreground">Funcionário</dt>
                  <dd className="font-medium">{perfilDetalhe.nome}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-muted-foreground">Saldo em aberto</dt>
                  <dd className="tabular-nums">{formatarMoeda(saldoDetalhe.saldo_em_aberto)}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-muted-foreground">Período</dt>
                  <dd>{mesReferencia}</dd>
                </div>
              </dl>

              <div className="grid gap-2">
                <Label>Valor do pagamento *</Label>
                <MoneyInput
                  value={modoPagar === 'tudo' ? saldoDetalhe.saldo_em_aberto : valorParcial}
                  onChange={setValorParcial}
                  disabled={modoPagar === 'tudo' || salvandoBaixa}
                />
                <p className="text-xs text-muted-foreground">
                  A baixa usa FIFO: OS mais antigas primeiro. Pode deixar uma OS parcial.
                </p>
              </div>

              <div className="grid gap-2">
                <Label>Forma de pagamento *</Label>
                <Select
                  value={formaPagamento}
                  onValueChange={(v) => setFormaPagamento(v as FormaPagamento)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FORMAS_PAGAMENTO.filter((f) => f.value !== 'fiado').map((f) => (
                      <SelectItem key={f.value} value={f.value}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="obs-baixa-b2">Observação (opcional)</Label>
                <Textarea
                  id="obs-baixa-b2"
                  rows={3}
                  value={obsBaixa}
                  onChange={(e) => setObsBaixa(e.target.value)}
                  placeholder="Ex.: pagamento semanal em dinheiro."
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" disabled={salvandoBaixa} onClick={() => setModoPagar(null)}>
                  Cancelar
                </Button>
                <Button disabled={salvandoBaixa} onClick={() => void confirmarBaixaNova()}>
                  {salvandoBaixa ? 'Registrando...' : 'Confirmar baixa'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ListaItensTabela({ itens, vazia }: { itens: ComissaoItem[]; vazia: string }) {
  if (itens.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
        {vazia}
      </p>
    )
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>OS</TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead>Data</TableHead>
            <TableHead className="text-right">MO</TableHead>
            <TableHead className="text-right">Peças</TableHead>
            <TableHead className="text-right">%</TableHead>
            <TableHead className="text-right">Gerada</TableHead>
            <TableHead className="text-right">Pago</TableHead>
            <TableHead className="text-right">Em aberto</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {itens.map((i) => (
            <TableRow key={i.id}>
              <TableCell>#{i.service_order_number || '—'}</TableCell>
              <TableCell className="max-w-[140px] truncate text-xs">
                {i.customer_name || '—'}
                {i.vehicle_label ? (
                  <span className="block text-muted-foreground">{i.vehicle_label}</span>
                ) : null}
              </TableCell>
              <TableCell className="text-xs">
                {i.reference_date ? formatarData(i.reference_date) : '—'}
              </TableCell>
              <TableCell className="text-right tabular-nums">{formatarMoeda(i.base_labor)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatarMoeda(i.base_parts)}</TableCell>
              <TableCell className="text-right text-xs text-muted-foreground">
                {[
                  i.labor_percent > 0 ? `MO ${i.labor_percent}%` : null,
                  i.parts_percent > 0 ? `P ${i.parts_percent}%` : null,
                ]
                  .filter(Boolean)
                  .join(' · ') || '—'}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatarMoeda(i.commission_amount)}
              </TableCell>
              <TableCell className="text-right tabular-nums">{formatarMoeda(i.paid_amount)}</TableCell>
              <TableCell className="text-right font-medium tabular-nums">
                {formatarMoeda(i.open_amount)}
              </TableCell>
              <TableCell>{badgeStatusItem(i.status)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
