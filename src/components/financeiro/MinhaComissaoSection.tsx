/**
 * RC2 Comissão Fase B3 — Minha comissão (mecânico): conta corrente própria.
 * Lê apenas o próprio employee_id; não exibe salário, lucro, caixa nem outros.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useCraft, useOficinaData } from '@/context/CraftContext'
import {
  encontrarPerfilComissaoDoUsuario,
  labelTipoComissao,
  listarOsComissaoFuncionario,
} from '@/services/comissoes/comissoes.service'
import {
  carregarPagamentosComissao,
  pagamentoComissaoDisponivel,
} from '@/services/comissoes/comissao-pagamento-folha.service'
import {
  comissaoItensDisponivel,
  listarItensComissaoFuncionario,
  listarSaldoComissaoFuncionario,
} from '@/services/comissoes/comissao-itens.service'
import {
  listarAlocacoesDaBaixa,
  listarBaixasComissaoFuncionario,
  settlementsDisponivel,
} from '@/services/comissoes/comissao-settlements.service'
import { podeVerMinhaComissao } from '@/services/auth/permissions'
import { formatarData, formatarMoeda, getMesLocalAtual } from '@/lib/utils'
import { getLabelFormaPagamento } from '@/types/labels'
import {
  obterComissoesConfig,
  tipoUsaMaoObra,
  tipoUsaPecas,
  type PagamentoComissaoFolha,
  type PerfilComissaoFuncionario,
} from '@/types/comissoes'
import type { ComissaoItem, ComissaoSettlement, SaldoComissaoFuncionario } from '@/types/comissao-itens'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

function formatarRegraPerfil(perfil: PerfilComissaoFuncionario): string {
  if (!perfil.comissao_ativa || perfil.tipo_comissao === 'sem_comissao') {
    return 'Comissão inativa'
  }
  const partes: string[] = []
  if (tipoUsaMaoObra(perfil.tipo_comissao)) {
    partes.push(`MO ${perfil.percentual_comissao ?? 0}%`)
  }
  if (tipoUsaPecas(perfil.tipo_comissao)) {
    partes.push(`Peças ${perfil.percentual_comissao_pecas ?? 0}%`)
  }
  if (perfil.tipo_comissao === 'valor_fixo_os') {
    partes.push(`Fixo ${formatarMoeda(perfil.valor_fixo_por_os ?? 0)}/OS`)
  }
  return partes.length ? partes.join(' · ') : labelTipoComissao(perfil.tipo_comissao)
}

function badgeStatusOs(status: 'em_aberto' | 'parcial' | 'pago' | 'cancelado') {
  if (status === 'pago') return <Badge variant="success">Pago</Badge>
  if (status === 'parcial') return <Badge variant="warning">Parcial</Badge>
  if (status === 'cancelado') return <Badge variant="outline">Cancelado</Badge>
  return <Badge variant="secondary">Em aberto</Badge>
}

function textoStatusOs(params: {
  status: 'em_aberto' | 'parcial' | 'pago' | 'cancelado'
  paidAmount: number
  openAmount: number
  pagoEm?: string
}): string {
  if (params.status === 'pago') {
    return params.pagoEm ? `Pago em ${formatarData(params.pagoEm)}` : 'Pago'
  }
  if (params.status === 'parcial') {
    return `Parcial — recebido ${formatarMoeda(params.paidAmount)}, falta ${formatarMoeda(params.openAmount)}`
  }
  if (params.status === 'cancelado') return 'Cancelado'
  return 'Em aberto'
}

export function MinhaComissaoSection() {
  const { session } = useAuth()
  const { oficinaId } = useCraft()
  const { perfisComissao, ordens, lancamentos, configuracao } = useOficinaData()
  const [mesReferencia, setMesReferencia] = useState(getMesLocalAtual())
  const [itens, setItens] = useState<ComissaoItem[]>([])
  const [saldo, setSaldo] = useState<SaldoComissaoFuncionario | null>(null)
  const [baixas, setBaixas] = useState<ComissaoSettlement[]>([])
  const [pagoEmPorItemId, setPagoEmPorItemId] = useState<Record<string, string>>({})
  const [pagamentoLegado, setPagamentoLegado] = useState<PagamentoComissaoFolha | null>(null)
  const [carregando, setCarregando] = useState(false)

  const config = useMemo(() => obterComissoesConfig(configuracao), [configuracao])
  const user = session?.user

  const perfil = useMemo(
    () => encontrarPerfilComissaoDoUsuario(user, perfisComissao),
    [perfisComissao, user]
  )

  const detalhes = useMemo(() => {
    if (!perfil) return []
    return listarOsComissaoFuncionario(perfil, ordens, lancamentos, mesReferencia, config)
  }, [perfil, ordens, lancamentos, mesReferencia, config])

  const carregarContaCorrente = useCallback(async () => {
    if (!perfil) {
      setItens([])
      setSaldo(null)
      setBaixas([])
      setPagoEmPorItemId({})
      setPagamentoLegado(null)
      return
    }

    setCarregando(true)
    const modeloNovo = comissaoItensDisponivel() && settlementsDisponivel()

    if (modeloNovo) {
      const [itensDb, saldoDb, baixasDb] = await Promise.all([
        listarItensComissaoFuncionario(oficinaId, perfil.id, {
          competenceMonth: mesReferencia,
        }),
        listarSaldoComissaoFuncionario(oficinaId, perfil.id, mesReferencia),
        listarBaixasComissaoFuncionario(oficinaId, perfil.id, {
          competenceMonth: mesReferencia,
        }),
      ])
      setItens(itensDb.filter((i) => i.status !== 'cancelado'))
      setSaldo(saldoDb)
      setBaixas(baixasDb)

      const mapaPagoEm: Record<string, string> = {}
      for (const b of baixasDb.slice(0, 30)) {
        const alocs = await listarAlocacoesDaBaixa(oficinaId, b.id)
        for (const a of alocs) {
          const atual = mapaPagoEm[a.commission_item_id]
          if (!atual || b.paid_at > atual) {
            mapaPagoEm[a.commission_item_id] = b.paid_at
          }
        }
      }
      setPagoEmPorItemId(mapaPagoEm)
    } else {
      setItens([])
      setSaldo(null)
      setBaixas([])
      setPagoEmPorItemId({})
    }

    // Legado: só para aviso discreto (não exibe salário). Pode vir vazio por RLS.
    if (pagamentoComissaoDisponivel()) {
      const lista = await carregarPagamentosComissao(oficinaId)
      const match =
        lista.find(
          (p) =>
            p.employee_local_id === perfil.id &&
            p.competence_month === mesReferencia &&
            !p.canceled_at
        ) ?? null
      setPagamentoLegado(match)
    } else {
      setPagamentoLegado(null)
    }

    setCarregando(false)
  }, [perfil, oficinaId, mesReferencia])

  useEffect(() => {
    void carregarContaCorrente()
  }, [carregarContaCorrente])

  const itensPorOsId = useMemo(() => {
    const map = new Map<string, ComissaoItem>()
    for (const i of itens) {
      if (!i.adjustment_of_item_id) map.set(i.service_order_id, i)
    }
    return map
  }, [itens])

  const linhasOs = useMemo(() => {
    return detalhes.map((d) => {
      const item = itensPorOsId.get(d.os_id)
      const gerada = item?.commission_amount ?? d.comissao
      const recebido = item?.paid_amount ?? 0
      const emAberto = item?.open_amount ?? gerada
      const status =
        item?.status === 'pago' || item?.status === 'parcial' || item?.status === 'em_aberto'
          ? item.status
          : recebido <= 0
            ? ('em_aberto' as const)
            : recebido + 0.009 >= gerada
              ? ('pago' as const)
              : ('parcial' as const)
      return {
        os_id: d.os_id,
        numero: d.numero,
        data: d.data_referencia,
        mao_obra: d.mao_obra,
        pecas: d.pecas,
        percentual: d.percentual_aplicado,
        tipo: d.tipo_comissao,
        usou_snapshot: d.usou_snapshot,
        gerada,
        recebido,
        emAberto,
        status,
        pagoEm: item ? pagoEmPorItemId[item.id] : undefined,
      }
    })
  }, [detalhes, itensPorOsId, pagoEmPorItemId])

  const geradoPeriodo = useMemo(() => {
    if (itens.length > 0 && saldo) return saldo.total_gerado
    return Math.round(linhasOs.reduce((a, l) => a + l.gerada, 0) * 100) / 100
  }, [itens.length, saldo, linhasOs])

  const jaRecebido = useMemo(() => {
    if (itens.length > 0 && saldo) return saldo.total_pago
    return Math.round(linhasOs.reduce((a, l) => a + l.recebido, 0) * 100) / 100
  }, [itens.length, saldo, linhasOs])

  const emAbertoTotal = useMemo(() => {
    if (itens.length > 0 && saldo) return saldo.saldo_em_aberto
    return Math.round(linhasOs.reduce((a, l) => a + l.emAberto, 0) * 100) / 100
  }, [itens.length, saldo, linhasOs])

  const ultimoRecebimento = baixas[0] ?? null

  const mostrarAvisoLegado =
    Boolean(pagamentoLegado) ||
    (baixas.length === 0 && itens.length === 0 && detalhes.length > 0 && geradoPeriodo > 0.009)

  if (!user || !podeVerMinhaComissao(user, configuracao)) return null

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Minha comissão</h2>
        <p className="text-sm text-muted-foreground">
          Você vê apenas a sua comissão — gerado, recebido e saldo em aberto — sem dados de outros
          funcionários, lucro ou caixa.
        </p>
      </div>

      <div className="space-y-1">
        <Label htmlFor="mes-minha-comissao">Período (competência)</Label>
        <Input
          id="mes-minha-comissao"
          type="month"
          value={mesReferencia}
          onChange={(e) => setMesReferencia(e.target.value)}
          className="w-[180px]"
        />
      </div>

      {!perfil ? (
        <div className="space-y-2 rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          <p>
            Seu usuário ainda não foi vinculado ao cadastro de funcionário. Peça ao responsável da
            oficina para vincular seu usuário em Financeiro → Comissões.
          </p>
          <p className="text-xs">
            O vínculo é por ID do login (não só pelo nome), na opção{' '}
            <strong className="text-foreground">Vincular usuário da oficina</strong>.
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Regra: </span>
            <span className="font-medium">{formatarRegraPerfil(perfil)}</span>
            <span className="ml-1 text-xs text-muted-foreground">
              ({labelTipoComissao(perfil.tipo_comissao)})
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Gerado no período
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold tabular-nums">{formatarMoeda(geradoPeriodo)}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {linhasOs.length} OS · {carregando ? 'atualizando…' : 'comissão da OS'}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Já recebido
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold tabular-nums">{formatarMoeda(jaRecebido)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Em aberto</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold tabular-nums text-primary">
                  {formatarMoeda(emAbertoTotal)}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">Saldo em aberto</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Último recebimento
                </CardTitle>
              </CardHeader>
              <CardContent>
                {ultimoRecebimento ? (
                  <>
                    <p className="text-2xl font-bold tabular-nums">
                      {formatarData(ultimoRecebimento.paid_at)}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatarMoeda(ultimoRecebimento.amount_paid)}
                      {ultimoRecebimento.payment_method
                        ? ` · ${getLabelFormaPagamento(ultimoRecebimento.payment_method)}`
                        : ''}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Nenhum recebimento registrado neste período.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {mostrarAvisoLegado && (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-muted-foreground">
              Há pagamentos antigos registrados no modelo anterior. Eles podem aparecer apenas como
              recebimento do período.
            </p>
          )}

          <section className="space-y-2">
            <h3 className="text-base font-semibold">Recebimentos</h3>
            {baixas.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
                Nenhum recebimento registrado neste mês.
              </p>
            ) : (
              <div className="space-y-2">
                {baixas.map((b) => (
                  <div key={b.id} className="rounded-lg border border-border px-3 py-2.5 text-sm">
                    <p className="font-medium">
                      {formatarData(b.paid_at)} · {formatarMoeda(b.amount_paid)}
                      {b.payment_method
                        ? ` · ${getLabelFormaPagamento(b.payment_method)}`
                        : ''}
                      {b.paid_by_name ? ` · Registrado por ${b.paid_by_name}` : ''}
                    </p>
                    {b.notes && (
                      <p className="mt-1 text-xs text-muted-foreground">{b.notes}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="text-base font-semibold">Comissão por OS</h3>
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>OS</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead className="text-right">Mão de obra</TableHead>
                    <TableHead className="text-right">Peças</TableHead>
                    <TableHead className="text-right">% / regra</TableHead>
                    <TableHead className="text-right">Comissão da OS</TableHead>
                    <TableHead className="text-right">Recebido</TableHead>
                    <TableHead className="text-right">Em aberto</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linhasOs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-muted-foreground">
                        Nenhuma OS elegível neste período.
                      </TableCell>
                    </TableRow>
                  ) : (
                    linhasOs.map((l) => (
                      <TableRow key={l.os_id}>
                        <TableCell>
                          #{l.numero}
                          {l.usou_snapshot ? (
                            <span className="ml-1 text-[10px] text-muted-foreground">
                              (congelada)
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell>{formatarData(l.data)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatarMoeda(l.mao_obra)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatarMoeda(l.pecas)}
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">
                          {l.percentual != null
                            ? `${l.percentual}%`
                            : l.tipo
                              ? labelTipoComissao(l.tipo)
                              : '—'}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {formatarMoeda(l.gerada)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatarMoeda(l.recebido)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatarMoeda(l.emAberto)}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-0.5">
                            {badgeStatusOs(l.status)}
                            <span className="text-[10px] text-muted-foreground">
                              {textoStatusOs({
                                status: l.status,
                                paidAmount: l.recebido,
                                openAmount: l.emAberto,
                                pagoEm: l.pagoEm,
                              })}
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
