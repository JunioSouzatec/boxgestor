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

              <TabsContent value="caixa">
                <PlaceholderAba texto="Detalhamento de caixa será adicionado na próxima fase." />
              </TabsContent>

              <TabsContent value="estoque" className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Total de itens: {dados.detalhes.totais.pecas}
                </p>
                {dados.estoque_amostra.length === 0 ? (
                  <PlaceholderAba texto="Detalhamento de estoque será adicionado na próxima fase." />
                ) : (
                  <>
                    <ul className="divide-y divide-border rounded-lg border border-border">
                      {dados.estoque_amostra.map((i) => (
                        <li
                          key={i.id}
                          className="flex flex-col gap-1 px-3 py-2 text-sm sm:flex-row sm:justify-between"
                        >
                          <div className="min-w-0">
                            <p className="font-medium break-words">{i.titulo}</p>
                            {i.subtitulo ? (
                              <p className="text-xs text-muted-foreground">{i.subtitulo}</p>
                            ) : null}
                          </div>
                          {i.valor ? (
                            <p className="text-xs text-muted-foreground">{i.valor}</p>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                    <p className="text-xs text-muted-foreground">
                      Amostra somente leitura — detalhamento completo na próxima fase.
                    </p>
                  </>
                )}
              </TabsContent>

              <TabsContent value="portal">
                <PlaceholderAba texto="Detalhamento de portal e aprovações será adicionado na próxima fase." />
              </TabsContent>

              <TabsContent value="sync">
                <PlaceholderAba texto="Diagnóstico de sync/offline será adicionado na próxima fase." />
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
