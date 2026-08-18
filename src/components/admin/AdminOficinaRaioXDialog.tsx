import { useEffect, useState } from 'react'
import { Loader2, RefreshCw, ShieldAlert } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatarDataBrasil, formatarMoeda } from '@/lib/utils'
import { getLabelPlano } from '@/types/plano'
import { formatarOfficeIdCurto } from '@/services/assinatura/office-admin.service'
import type { OficinaRegistro } from '@/services/assinatura/office-registry.service'
import { labelTipoOficina } from '@/types/tipo-oficina'
import {
  carregarRaioXOficinaAdmin,
  type AdminSupportPaymentRow,
  type AdminSupportRaioX,
} from '@/services/admin/admin-support.service'
import { useAdminMounted } from '@/hooks/useAdminMounted'

interface AdminOficinaRaioXDialogProps {
  oficina: OficinaRegistro | null
  aberto: boolean
  onFechar: () => void
}

function badgeStatusOficina(status: OficinaRegistro['status']) {
  switch (status) {
    case 'teste':
      return { variant: 'info' as const, label: 'Teste Premium' }
    case 'teste_expirado':
      return { variant: 'warning' as const, label: 'Teste encerrado' }
    default:
      return { variant: 'success' as const, label: 'Ativa' }
  }
}

function PlaceholderAba({ texto }: { texto: string }) {
  return (
    <p className="rounded-lg border border-dashed border-border px-3 py-6 text-sm text-muted-foreground">
      {texto}
    </p>
  )
}

function badgesPagamento(p: AdminSupportPaymentRow) {
  const itens: Array<{ label: string; variant: 'success' | 'destructive' | 'warning' | 'outline' | 'info' }> =
    []
  if (p.is_canceled) itens.push({ label: 'Cancelado', variant: 'destructive' })
  else if (p.is_refund_or_reversal) itens.push({ label: 'Estornado', variant: 'warning' })
  else itens.push({ label: 'Pago', variant: 'success' })
  if (!p.cash_session_id && !p.cash_movement_id) {
    itens.push({ label: 'Sem caixa vinculado', variant: 'outline' })
  }
  if (p.origem_texto === 'Origem não identificada') {
    itens.push({ label: 'Origem não identificada', variant: 'info' })
  }
  return itens
}

export function AdminOficinaRaioXDialog({
  oficina,
  aberto,
  onFechar,
}: AdminOficinaRaioXDialogProps) {
  const { iniciarOperacao, operacaoAtiva } = useAdminMounted()
  const [dados, setDados] = useState<AdminSupportRaioX | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [aba, setAba] = useState('resumo')

  async function carregar() {
    if (!oficina) return
    const seq = iniciarOperacao()
    setCarregando(true)
    setErro(null)
    try {
      const raioX = await carregarRaioXOficinaAdmin(oficina)
      if (!operacaoAtiva(seq)) return
      setDados(raioX)
    } catch (e) {
      if (!operacaoAtiva(seq)) return
      setDados(null)
      setErro(e instanceof Error ? e.message : 'Falha ao carregar Raio-X.')
    } finally {
      if (operacaoAtiva(seq)) setCarregando(false)
    }
  }

  useEffect(() => {
    if (!aberto || !oficina) {
      setDados(null)
      setErro(null)
      setAba('resumo')
      return
    }
    void carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recarrega ao abrir/trocar oficina
  }, [aberto, oficina?.office_id])

  const st = oficina ? badgeStatusOficina(oficina.status) : null

  return (
    <Dialog open={aberto} onOpenChange={(open) => !open && onFechar()}>
      <DialogContent className="flex max-h-[92vh] w-[min(96vw,56rem)] max-w-none flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 space-y-2 border-b border-border px-4 py-3 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 space-y-1">
              <DialogTitle className="break-words">
                Raio-X — {oficina?.nome ?? 'Oficina'}
              </DialogTitle>
              <DialogDescription className="break-words">
                Código {oficina ? formatarOfficeIdCurto(oficina.office_id) : '—'} · Somente leitura —
                área de suporte
              </DialogDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="gap-1">
                <ShieldAlert className="h-3.5 w-3.5" />
                Somente leitura
              </Badge>
              {st ? <Badge variant={st.variant}>{st.label}</Badge> : null}
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={carregando || !oficina}
                onClick={() => void carregar()}
              >
                {carregando ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-6">
          {carregando && !dados ? (
            <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando Raio-X…
            </div>
          ) : erro && !dados ? (
            <p className="text-sm text-destructive">{erro}</p>
          ) : dados ? (
            <Tabs value={aba} onValueChange={setAba} className="space-y-4">
              <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
                <TabsTrigger value="resumo" className="shrink-0">
                  Resumo
                </TabsTrigger>
                <TabsTrigger value="usuarios" className="shrink-0">
                  Usuários
                </TabsTrigger>
                <TabsTrigger value="os" className="shrink-0">
                  OS
                </TabsTrigger>
                <TabsTrigger value="pagamentos" className="shrink-0">
                  Pagamentos
                </TabsTrigger>
                <TabsTrigger value="caixa" className="shrink-0">
                  Caixa
                </TabsTrigger>
                <TabsTrigger value="estoque" className="shrink-0">
                  Estoque
                </TabsTrigger>
                <TabsTrigger value="portal" className="shrink-0">
                  Portal/Aprovações
                </TabsTrigger>
                <TabsTrigger value="sync" className="shrink-0">
                  Sync/Offline
                </TabsTrigger>
              </TabsList>

              <TabsContent value="resumo" className="space-y-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <Campo label="Nome" valor={dados.detalhes.nome} />
                  <Campo
                    label="Código"
                    valor={formatarOfficeIdCurto(dados.detalhes.office_id)}
                  />
                  <Campo label="Status" valor={st?.label ?? '—'} />
                  <Campo label="Plano" valor={getLabelPlano(dados.detalhes.plan_tier)} />
                  <Campo
                    label="Trial / vencimento"
                    valor={
                      dados.detalhes.trial_fim
                        ? formatarDataBrasil(dados.detalhes.trial_fim)
                        : '—'
                    }
                  />
                  <Campo
                    label="Tipo"
                    valor={
                      dados.tipo_oficina ? labelTipoOficina(dados.tipo_oficina) : '—'
                    }
                  />
                  <Campo
                    label="Fiscal adicional"
                    valor={dados.fiscal_adicional ? 'Ativo' : 'Não'}
                  />
                  <Campo
                    label="Criada em"
                    valor={
                      dados.detalhes.criado_em
                        ? formatarDataBrasil(dados.detalhes.criado_em)
                        : '—'
                    }
                  />
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <Totulo label="Clientes" valor={dados.detalhes.totais.clientes} />
                  <Totulo label="Veículos" valor={dados.detalhes.totais.motos} />
                  <Totulo label="OS" valor={dados.detalhes.totais.ordens} />
                  <Totulo label="Pagamentos" valor={dados.detalhes.totais.pagamentos} />
                  <Totulo label="Itens estoque" valor={dados.detalhes.totais.pecas} />
                </div>
              </TabsContent>

              <TabsContent value="usuarios" className="space-y-2">
                {dados.usuarios.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum usuário encontrado.</p>
                ) : (
                  <ul className="divide-y divide-border rounded-lg border border-border">
                    {dados.usuarios.map((u) => (
                      <li key={u.id} className="px-3 py-2 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium break-words">{u.nome}</span>
                          <Badge variant="outline">{u.papel}</Badge>
                          <Badge variant={u.ativo ? 'success' : 'warning'}>
                            {u.ativo ? 'Ativo' : 'Inativo'}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground break-all">{u.email}</p>
                        {u.criado_em ? (
                          <p className="text-xs text-muted-foreground">
                            Criado: {formatarDataBrasil(u.criado_em)}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-xs text-muted-foreground">
                  Último acesso não disponível nesta versão (não inventado).
                </p>
              </TabsContent>

              <TabsContent value="os" className="space-y-2">
                {dados.ordens.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma OS encontrada.</p>
                ) : (
                  <ul className="divide-y divide-border rounded-lg border border-border">
                    {dados.ordens.map((o) => (
                      <li
                        key={o.id}
                        className="flex flex-col gap-1 px-3 py-2 text-sm sm:flex-row sm:justify-between"
                      >
                        <div className="min-w-0">
                          <p className="font-medium break-words">{o.titulo}</p>
                          {o.subtitulo ? (
                            <p className="text-xs text-muted-foreground break-words">
                              {o.subtitulo}
                            </p>
                          ) : null}
                        </div>
                        <div className="shrink-0 text-xs text-muted-foreground sm:text-right">
                          {o.valor ? <p>{o.valor}</p> : null}
                          {o.data ? <p>{formatarDataBrasil(o.data)}</p> : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-xs text-muted-foreground">
                  Somente leitura — sem edição de OS nesta tela.
                </p>
              </TabsContent>

              <TabsContent value="pagamentos" className="space-y-3">
                {dados.erro_pagamentos ? (
                  <p className="text-sm text-destructive">{dados.erro_pagamentos}</p>
                ) : null}
                {dados.pagamentos.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhum pagamento encontrado para esta oficina.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {dados.pagamentos.map((p) => (
                      <li
                        key={p.payment_id}
                        className="rounded-lg border border-border px-3 py-2 text-sm"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0 space-y-1">
                            <p className="font-medium">
                              {formatarMoeda(p.amount)}
                              {p.payment_method ? (
                                <span className="ml-2 text-muted-foreground font-normal">
                                  · {p.payment_method}
                                </span>
                              ) : null}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {p.payment_created_at
                                ? formatarDataBrasil(p.payment_created_at)
                                : p.payment_date
                                  ? formatarDataBrasil(p.payment_date)
                                  : '—'}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {badgesPagamento(p).map((b) => (
                              <Badge key={b.label} variant={b.variant}>
                                {b.label}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        <div className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                          <p>
                            <span className="font-medium text-foreground">Origem:</span>{' '}
                            {p.origem_texto}
                          </p>
                          <p>
                            <span className="font-medium text-foreground">Cliente:</span>{' '}
                            {p.customer_name || '—'}
                          </p>
                          <p>
                            <span className="font-medium text-foreground">Veículo:</span>{' '}
                            {p.vehicle_name || '—'}
                            {p.vehicle_plate ? ` · ${p.vehicle_plate}` : ''}
                          </p>
                          <p>
                            <span className="font-medium text-foreground">Recebido por:</span>{' '}
                            {p.received_by_name || '—'}
                          </p>
                          <p>
                            <span className="font-medium text-foreground">Caixa:</span>{' '}
                            {p.cash_session_id
                              ? `${p.cash_session_status ?? 'session'} (${p.cash_session_id.slice(0, 8)}…)`
                              : '—'}
                          </p>
                          <p>
                            <span className="font-medium text-foreground">Mov. caixa:</span>{' '}
                            {p.cash_movement_type || (p.cash_movement_id ? 'vinculado' : '—')}
                          </p>
                          <p>
                            <span className="font-medium text-foreground">Financeiro:</span>{' '}
                            {p.financial_transaction_status ||
                              (p.financial_transaction_id ? 'vinculado' : '—')}
                          </p>
                          {p.authorized_by_name ? (
                            <p>
                              <span className="font-medium text-foreground">Autorizado por:</span>{' '}
                              {p.authorized_by_name}
                            </p>
                          ) : null}
                          {p.is_canceled && p.canceled_by ? (
                            <p>
                              <span className="font-medium text-foreground">Cancelado por:</span>{' '}
                              {p.canceled_by}
                            </p>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </TabsContent>

              <TabsContent value="caixa" className="space-y-3">
                {dados.erro_caixa ? (
                  <p className="text-sm text-destructive">{dados.erro_caixa}</p>
                ) : null}
                {!dados.caixa ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhum dado de caixa encontrado para esta oficina.
                  </p>
                ) : (
                  <>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Campo
                        label="Caixa aberto?"
                        valor={dados.caixa.tem_caixa_aberto ? 'Sim' : 'Não'}
                      />
                      {dados.caixa.sessao_aberta ? (
                        <>
                          <Campo
                            label="Aberto em"
                            valor={
                              dados.caixa.sessao_aberta.opened_at
                                ? formatarDataBrasil(dados.caixa.sessao_aberta.opened_at)
                                : '—'
                            }
                          />
                          <Campo
                            label="Aberto por"
                            valor={dados.caixa.sessao_aberta.opened_by_name || '—'}
                          />
                          <Campo
                            label="Saldo inicial"
                            valor={formatarMoeda(
                              Number(dados.caixa.sessao_aberta.opening_balance ?? 0)
                            )}
                          />
                          <Campo
                            label="Entradas"
                            valor={formatarMoeda(Number(dados.caixa.sessao_aberta.entradas ?? 0))}
                          />
                          <Campo
                            label="Saídas"
                            valor={formatarMoeda(Number(dados.caixa.sessao_aberta.saidas ?? 0))}
                          />
                          <Campo
                            label="Saldo esperado"
                            valor={formatarMoeda(
                              Number(dados.caixa.sessao_aberta.expected_balance ?? 0)
                            )}
                          />
                          <Campo
                            label="Aberto há (h)"
                            valor={
                              dados.caixa.sessao_aberta.aberto_ha_horas != null
                                ? String(dados.caixa.sessao_aberta.aberto_ha_horas)
                                : '—'
                            }
                          />
                        </>
                      ) : null}
                      {dados.caixa.ultimo_fechado ? (
                        <>
                          <Campo
                            label="Último fechado em"
                            valor={
                              dados.caixa.ultimo_fechado.closed_at
                                ? formatarDataBrasil(dados.caixa.ultimo_fechado.closed_at)
                                : '—'
                            }
                          />
                          <Campo
                            label="Fechado por"
                            valor={dados.caixa.ultimo_fechado.closed_by_name || '—'}
                          />
                          <Campo
                            label="Divergência (último)"
                            valor={formatarMoeda(
                              Number(dados.caixa.ultimo_fechado.difference ?? 0)
                            )}
                          />
                        </>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {dados.caixa.alertas.pagamentos_sem_movimento_caixa > 0 ? (
                        <Badge variant="warning">
                          {dados.caixa.alertas.pagamentos_sem_movimento_caixa} pag. sem caixa
                        </Badge>
                      ) : null}
                      {dados.caixa.alertas.movimentos_sem_sessao > 0 ? (
                        <Badge variant="warning">
                          {dados.caixa.alertas.movimentos_sem_sessao} mov. sem sessão
                        </Badge>
                      ) : null}
                      {dados.caixa.alertas.caixa_aberto_ha_mais_de_24h ? (
                        <Badge variant="warning">Caixa aberto &gt; 24h</Badge>
                      ) : null}
                      {dados.caixa.alertas.ultimo_fechado_com_divergencia ? (
                        <Badge variant="destructive">Último fechamento com divergência</Badge>
                      ) : null}
                    </div>

                    {dados.caixa.movimentos.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Nenhum movimento de caixa recente.
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {dados.caixa.movimentos.map((m) => (
                          <li
                            key={m.movement_id}
                            className="rounded-lg border border-border px-3 py-2 text-sm"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div>
                                <p className="font-medium">
                                  {formatarMoeda(m.amount)}
                                  {m.payment_method ? (
                                    <span className="ml-2 font-normal text-muted-foreground">
                                      · {m.payment_method}
                                    </span>
                                  ) : null}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {m.created_at ? formatarDataBrasil(m.created_at) : '—'}
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-1">
                                <Badge variant="outline">{m.tipo_fluxo || m.movement_type || '—'}</Badge>
                                <Badge variant="info">{m.origem_texto}</Badge>
                              </div>
                            </div>
                            <div className="mt-1 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                              {m.descricao ? <p>{m.descricao}</p> : null}
                              <p>
                                OS:{' '}
                                {m.service_order_number != null
                                  ? `#${m.service_order_number}`
                                  : '—'}
                              </p>
                              <p>Cliente: {m.customer_name || '—'}</p>
                              <p>
                                Veículo: {m.vehicle_name || '—'}
                                {m.vehicle_plate ? ` · ${m.vehicle_plate}` : ''}
                              </p>
                              <p>Criado por: {m.created_by_name || '—'}</p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </TabsContent>

              <TabsContent value="estoque" className="space-y-3">
                {dados.erro_estoque ? (
                  <p className="text-sm text-destructive">{dados.erro_estoque}</p>
                ) : null}
                {!dados.estoque ? (
                  <PlaceholderAba texto="Detalhamento de estoque será adicionado na próxima fase." />
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      <Totulo label="Itens" valor={dados.estoque.resumo.total_itens} />
                      <Totulo label="Ativos" valor={dados.estoque.resumo.total_ativos} />
                      <Totulo label="Baixo" valor={dados.estoque.resumo.estoque_baixo} />
                      <Totulo label="Zerados" valor={dados.estoque.resumo.zerados} />
                      <Totulo
                        label="Inativos"
                        valor={dados.estoque.resumo.inativos_ou_deletados}
                      />
                      <div className="rounded-lg border border-border px-3 py-2 text-center">
                        <p className="text-sm font-semibold tabular-nums">
                          {formatarMoeda(dados.estoque.resumo.valor_estimado_venda)}
                        </p>
                        <p className="text-xs text-muted-foreground">Valor estimado</p>
                      </div>
                    </div>

                    <div>
                      <p className="mb-2 text-sm font-medium">Itens críticos</p>
                      {dados.estoque.itens_criticos.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          Nenhum item crítico encontrado.
                        </p>
                      ) : (
                        <ul className="divide-y divide-border rounded-lg border border-border">
                          {dados.estoque.itens_criticos.map((i) => (
                            <li
                              key={i.item_id}
                              className="flex flex-col gap-1 px-3 py-2 text-sm sm:flex-row sm:justify-between"
                            >
                              <div className="min-w-0">
                                <p className="font-medium break-words">{i.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {i.code ? `SKU ${i.code} · ` : ''}
                                  Qtd {i.quantity} · Mín {i.minimum_stock}
                                </p>
                              </div>
                              <div className="flex flex-wrap items-center gap-1">
                                <Badge
                                  variant={
                                    i.status === 'zerado'
                                      ? 'destructive'
                                      : i.status === 'baixo'
                                        ? 'warning'
                                        : 'outline'
                                  }
                                >
                                  {i.status}
                                </Badge>
                                {i.sale_price != null ? (
                                  <span className="text-xs text-muted-foreground">
                                    {formatarMoeda(i.sale_price)}
                                  </span>
                                ) : null}
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div>
                      <p className="mb-2 text-sm font-medium">Movimentações recentes</p>
                      {dados.estoque.movimentos.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          Nenhuma movimentação recente encontrada.
                        </p>
                      ) : (
                        <ul className="space-y-2">
                          {dados.estoque.movimentos.map((m) => (
                            <li
                              key={m.movement_id}
                              className="rounded-lg border border-border px-3 py-2 text-sm"
                            >
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div>
                                  <p className="font-medium break-words">
                                    {m.item_name || 'Peça'}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {m.created_at
                                      ? formatarDataBrasil(m.created_at)
                                      : m.movement_date
                                        ? formatarDataBrasil(m.movement_date)
                                        : '—'}
                                  </p>
                                </div>
                                <div className="flex flex-wrap gap-1">
                                  <Badge variant="outline">qtd {m.quantity}</Badge>
                                  <Badge variant="info">{m.origem_texto}</Badge>
                                </div>
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {m.service_order_number != null
                                  ? `OS #${m.service_order_number}`
                                  : 'Sem OS'}
                                {m.user_name ? ` · ${m.user_name}` : ''}
                                {m.reason ? ` · ${m.reason}` : ''}
                              </p>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </>
                )}
              </TabsContent>

              <TabsContent value="portal" className="space-y-3">
                {dados.erro_portal ? (
                  <p className="text-sm text-destructive">{dados.erro_portal}</p>
                ) : null}
                {!dados.portal ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhum dado de portal/aprovações encontrado.
                  </p>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <Totulo label="Total" valor={dados.portal.resumo.total} />
                      <Totulo label="Pendentes" valor={dados.portal.resumo.pendentes} />
                      <Totulo label="Aprovados" valor={dados.portal.resumo.aprovados} />
                      <Totulo
                        label="Parciais"
                        valor={dados.portal.resumo.aprovados_parcialmente}
                      />
                      <Totulo label="Recusados" valor={dados.portal.resumo.recusados} />
                      <Totulo label="Expirados" valor={dados.portal.resumo.expirados} />
                      <Totulo label="Revogados" valor={dados.portal.resumo.revogados} />
                      <Totulo label="Convertidos" valor={dados.portal.resumo.convertidos} />
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {dados.portal.alertas.pendentes_expirados > 0 ? (
                        <Badge variant="warning">
                          {dados.portal.alertas.pendentes_expirados} pendente(s) expirado(s)
                        </Badge>
                      ) : null}
                      {dados.portal.alertas.aprovados_sem_conversao > 0 ? (
                        <Badge variant="warning">
                          {dados.portal.alertas.aprovados_sem_conversao} aprovado(s) sem conversão
                        </Badge>
                      ) : null}
                      {dados.portal.alertas.aprovados_parciais > 0 ? (
                        <Badge variant="info">
                          {dados.portal.alertas.aprovados_parciais} resposta(s) parcial(is)
                        </Badge>
                      ) : null}
                    </div>

                    {dados.portal.links.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Nenhum link de aprovação recente.
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {dados.portal.links.map((l) => (
                          <li
                            key={l.approval_link_id}
                            className="rounded-lg border border-border px-3 py-2 text-sm"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div>
                                <p className="font-medium">
                                  Orçamento #{l.orcamento_numero ?? '—'}
                                  {l.total != null ? (
                                    <span className="ml-2 font-normal text-muted-foreground">
                                      {formatarMoeda(l.total)}
                                    </span>
                                  ) : null}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  Criado:{' '}
                                  {l.created_at ? formatarDataBrasil(l.created_at) : '—'}
                                  {l.expires_at
                                    ? ` · Validade: ${formatarDataBrasil(l.expires_at)}`
                                    : ''}
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-1">
                                <Badge
                                  variant={
                                    l.status === 'aprovado' ||
                                    l.status === 'aprovado_parcialmente'
                                      ? 'success'
                                      : l.status === 'recusado' || l.status === 'revogado'
                                        ? 'destructive'
                                        : l.status === 'expirado'
                                          ? 'warning'
                                          : 'outline'
                                  }
                                >
                                  {l.status}
                                </Badge>
                                {l.convertido ? (
                                  <Badge variant="info">
                                    Convertido
                                    {l.converted_os_number != null
                                      ? ` OS #${l.converted_os_number}`
                                      : ''}
                                  </Badge>
                                ) : null}
                              </div>
                            </div>
                            <div className="mt-1 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                              <p>Cliente: {l.customer_name || '—'}</p>
                              <p>
                                Veículo: {l.vehicle_name || '—'}
                                {l.vehicle_plate ? ` · ${l.vehicle_plate}` : ''}
                              </p>
                              <p>
                                Respondido:{' '}
                                {l.respondido_em
                                  ? formatarDataBrasil(l.respondido_em)
                                  : '—'}
                              </p>
                              <p>Tipo: {l.tipo_resposta || '—'}</p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Tokens e links com token não são exibidos nesta tela.
                    </p>
                  </>
                )}
              </TabsContent>

              <TabsContent value="sync">
                <PlaceholderAba texto="Diagnóstico de sync/offline será adicionado em fase própria." />
              </TabsContent>
            </Tabs>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Campo({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="rounded-lg border border-border px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium break-words">{valor}</p>
    </div>
  )
}

function Totulo({ label, valor }: { label: string; valor: number }) {
  return (
    <div className="rounded-lg border border-border px-3 py-2 text-center">
      <p className="text-lg font-semibold tabular-nums">{valor}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  )
}
