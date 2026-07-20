import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { formatarMoeda, formatarDataBrasil } from '@/lib/utils'
import { getLabelPlano } from '@/types/plano'
import {
  carregarAmostraEstoqueOficinaAdmin,
  carregarDetalhesOficinaAdmin,
  detectarClientesDuplicadosAdmin,
  LIMITE_ESTOQUE_TODOS,
  type AdminOfficeDetalhes,
  type AdminOfficeResumoItem,
} from '@/services/admin/admin-office-details.service'
import type { OficinaRegistro } from '@/services/assinatura/office-registry.service'
import { useAdminMounted } from '@/hooks/useAdminMounted'
import {
  ADMIN_GET_OFFICE_DETAILS_TIMEOUT_MS,
  AdminRpcTimeoutError,
  iniciarWatchdogAdmin,
  MENSAGEM_ERRO_DETALHES_OFICINA,
} from '@/lib/admin-env'
import { Button } from '@/components/ui/button'
import { AdminTipoOficinaSection } from '@/components/admin/AdminTipoOficinaSection'
import { AdminUsuariosPlanoSection } from '@/components/admin/AdminUsuariosPlanoSection'
import {
  getRotuloVeiculoPorTipo,
  msgNenhumVeiculoCadastrado,
  rotuloVeiculosCadastrados,
} from '@/lib/termos-oficina'

interface AdminOficinaDetalhesDialogProps {
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

function ListaResumo({ items, vazio }: { items: AdminOfficeResumoItem[]; vazio: string }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{vazio}</p>
  }
  return (
    <ul className="divide-y divide-border rounded-lg border border-border">
      {items.map((item) => (
        <li
          key={item.id}
          className="flex flex-col gap-1 px-3 py-2 text-sm sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-2"
        >
          <div className="min-w-0 flex-1">
            <p className="font-medium break-words">{item.titulo}</p>
            {item.subtitulo && (
              <p className="text-xs text-muted-foreground break-words">{item.subtitulo}</p>
            )}
          </div>
          <div className="shrink-0 text-left text-xs text-muted-foreground sm:text-right">
            {item.valor && <p>{item.valor}</p>}
            {item.data && <p>{formatarDataBrasil(item.data)}</p>}
          </div>
        </li>
      ))}
    </ul>
  )
}

function ContadorAmostra({
  total,
  mostrando,
  rotulo = 'itens',
}: {
  total: number
  mostrando: number
  rotulo?: string
}) {
  if (total <= mostrando) {
    return (
      <p className="text-sm text-muted-foreground">
        Mostrando {mostrando} {rotulo}
      </p>
    )
  }
  return (
    <p className="text-sm text-muted-foreground">
      Mostrando {mostrando} de {total} {rotulo}
    </p>
  )
}

function ResumoTopo({
  oficina,
  detalhes,
}: {
  oficina: OficinaRegistro
  detalhes: AdminOfficeDetalhes | null
}) {
  const statusBadge = badgeStatusOficina(oficina.status)
  const plano = detalhes?.plano_label ?? getLabelPlano(oficina.plano)
  const responsavel = detalhes?.responsavel_nome ?? oficina.dono_nome ?? '—'
  const email = detalhes?.responsavel_email ?? oficina.dono_email ?? detalhes?.email ?? '—'
  const telefone = detalhes?.telefone ?? oficina.telefone ?? '—'

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-lg font-semibold">{detalhes?.nome ?? oficina.nome}</p>
          {detalhes?.nome_fantasia && (
            <p className="text-sm text-muted-foreground">{detalhes.nome_fantasia}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{plano}</Badge>
          <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
          {detalhes?.arquivada && <Badge variant="warning">Arquivada</Badge>}
        </div>
      </div>
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <dt className="text-muted-foreground">Responsável</dt>
          <dd>{responsavel}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">E-mail</dt>
          <dd className="break-all">{email}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Telefone</dt>
          <dd>{telefone}</dd>
        </div>
      </dl>
    </div>
  )
}

export function AdminOficinaDetalhesDialog({
  oficina,
  aberto,
  onFechar,
}: AdminOficinaDetalhesDialogProps) {
  const { iniciarOperacao, operacaoAtiva, mountedRef } = useAdminMounted()
  const requestIdRef = useRef(0)
  const [detalhes, setDetalhes] = useState<AdminOfficeDetalhes | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [carregandoMaisEstoque, setCarregandoMaisEstoque] = useState(false)

  const carregarMaisEstoque = useCallback(async () => {
    if (!oficina?.office_id || !detalhes) return
    setCarregandoMaisEstoque(true)
    try {
      const itens = await carregarAmostraEstoqueOficinaAdmin(
        oficina.office_id,
        LIMITE_ESTOQUE_TODOS
      )
      // Só substitui se a RPC retornou itens — evita apagar a amostra com lista vazia por falha/RLS
      if (itens.length > 0) {
        setDetalhes((prev) => (prev ? { ...prev, amostra_estoque: itens } : prev))
      } else {
        console.warn('[Admin BoxGestor] Ver todos retornou 0 itens — mantendo amostra atual')
      }
    } catch (e) {
      console.error('Erro ao carregar mais estoque admin:', e)
    } finally {
      setCarregandoMaisEstoque(false)
    }
  }, [oficina?.office_id, detalhes])

  const carregar = useCallback(async () => {
    if (!oficina?.office_id) return
    const seq = iniciarOperacao()
    const reqId = ++requestIdRef.current
    setCarregando(true)
    setErro(null)
    setDetalhes(null)

    const pararWatchdog = iniciarWatchdogAdmin(ADMIN_GET_OFFICE_DETAILS_TIMEOUT_MS, () => {
      if (requestIdRef.current !== reqId || !mountedRef.current) return
      requestIdRef.current += 1
      const err = new AdminRpcTimeoutError('admin_get_office_details (watchdog UI)')
      console.error('Erro ao carregar detalhes admin:', err)
      setErro(MENSAGEM_ERRO_DETALHES_OFICINA)
      setDetalhes(null)
      setCarregando(false)
    })

    try {
      const dados = await carregarDetalhesOficinaAdmin(oficina.office_id)
      pararWatchdog()
      if (!operacaoAtiva(seq) || requestIdRef.current !== reqId || !mountedRef.current) return
      setDetalhes(dados)
    } catch (e) {
      pararWatchdog()
      if (!operacaoAtiva(seq) || requestIdRef.current !== reqId || !mountedRef.current) return
      console.error('Erro ao carregar detalhes admin:', {
        office_id: oficina.office_id,
        erro: e,
      })
      setErro(
        e instanceof Error && e.message ? e.message : MENSAGEM_ERRO_DETALHES_OFICINA
      )
      setDetalhes(null)
    } finally {
      pararWatchdog()
      if (requestIdRef.current === reqId && mountedRef.current) {
        setCarregando(false)
      }
    }
  }, [oficina, iniciarOperacao, operacaoAtiva, mountedRef])

  const carregarRef = useRef(carregar)
  carregarRef.current = carregar

  useEffect(() => {
    if (aberto && oficina?.office_id) {
      void carregarRef.current()
    }
    if (!aberto) {
      requestIdRef.current += 1
      setDetalhes(null)
      setErro(null)
      setCarregando(false)
    }
  }, [aberto, oficina?.office_id])

  function handleOpenChange(open: boolean) {
    if (!open) onFechar()
  }

  return (
    <Dialog open={aberto} onOpenChange={handleOpenChange}>
      <DialogContent className="flex h-[min(100dvh,900px)] max-lg:h-[100dvh] max-lg:max-h-[100dvh] w-[min(100vw,1100px)] max-lg:w-full max-lg:max-w-none max-lg:rounded-none flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 space-y-0 border-b border-border px-4 py-4 sm:px-6">
          <DialogTitle className="text-xl pr-8">Detalhes da oficina</DialogTitle>
          <DialogDescription className="sr-only">
            Dados carregados sob demanda do Supabase — apenas suporte Admin BoxGestor.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 pb-4 pt-4 sm:px-6 sm:pb-6">
          {oficina && <ResumoTopo oficina={oficina} detalhes={detalhes} />}

          {carregando && (
            <div className="flex flex-1 items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Carregando detalhes da oficina...
            </div>
          )}

          {!carregando && erro && (
            <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <p>{erro}</p>
              <Button
                size="sm"
                variant="outline"
                className="mt-2 gap-1"
                onClick={() => void carregar()}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Tentar novamente
              </Button>
            </div>
          )}

          {!carregando && !erro && detalhes && (() => {
            const rotuloVeiculosAba = getRotuloVeiculoPorTipo(detalhes.tipo_oficina)
            const rotuloVeiculosLista = rotuloVeiculosCadastrados(detalhes.tipo_oficina)
            const msgVazioVeiculos = msgNenhumVeiculoCadastrado(detalhes.tipo_oficina)

            return (
            <Tabs defaultValue="dados" className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden">
              <TabsList className="h-auto w-full shrink-0 justify-start overflow-x-auto flex-nowrap">
                <TabsTrigger value="dados" className="shrink-0">
                  Dados da oficina
                </TabsTrigger>
                <TabsTrigger value="usuarios" className="shrink-0">
                  Usuários
                </TabsTrigger>
                <TabsTrigger value="clientes" className="shrink-0">
                  Clientes
                </TabsTrigger>
                <TabsTrigger value="motos" className="shrink-0">
                  {rotuloVeiculosAba}
                </TabsTrigger>
                <TabsTrigger value="os" className="shrink-0">
                  OS
                </TabsTrigger>
                <TabsTrigger value="financeiro" className="shrink-0">
                  Financeiro
                </TabsTrigger>
                <TabsTrigger value="estoque" className="shrink-0">
                  Estoque
                </TabsTrigger>
              </TabsList>

              <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
                <TabsContent value="dados" className="mt-0 space-y-3">
                  <AdminTipoOficinaSection
                    officeId={detalhes.office_id}
                    tipoAtual={detalhes.tipo_oficina}
                    onAtualizado={(tipo) =>
                      setDetalhes((prev) => (prev ? { ...prev, tipo_oficina: tipo } : prev))
                    }
                  />
                  <dl className="grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-muted-foreground">Nome</dt>
                      <dd>{detalhes.nome}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Nome fantasia</dt>
                      <dd>{detalhes.nome_fantasia ?? '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Telefone</dt>
                      <dd>{detalhes.telefone ?? '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">E-mail</dt>
                      <dd className="break-all">{detalhes.email ?? '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Cidade</dt>
                      <dd>{detalhes.cidade ?? '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Estado</dt>
                      <dd>{detalhes.estado ?? '—'}</dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-muted-foreground">Endereço</dt>
                      <dd>{detalhes.endereco ?? '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Plano</dt>
                      <dd>{detalhes.plano_label}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Cadastro</dt>
                      <dd>
                        {detalhes.criado_em
                          ? formatarDataBrasil(detalhes.criado_em)
                          : '—'}
                      </dd>
                    </div>
                    {detalhes.trial_inicio && (
                      <div>
                        <dt className="text-muted-foreground">Início do teste</dt>
                        <dd>{formatarDataBrasil(detalhes.trial_inicio)}</dd>
                      </div>
                    )}
                    {detalhes.trial_fim && (
                      <div>
                        <dt className="text-muted-foreground">Fim do teste</dt>
                        <dd>{formatarDataBrasil(detalhes.trial_fim)}</dd>
                      </div>
                    )}
                  </dl>
                </TabsContent>

                <TabsContent value="usuarios" className="mt-0 space-y-4">
                  <AdminUsuariosPlanoSection
                    officeId={detalhes.office_id}
                    planoTier={detalhes.plan_tier}
                    extraUsersCount={detalhes.extra_users_count}
                    usuariosAtivos={detalhes.usuarios.filter((u) => u.ativo).length}
                    onAtualizado={(count) =>
                      setDetalhes((prev) =>
                        prev ? { ...prev, extra_users_count: count } : prev
                      )
                    }
                  />
                  {detalhes.usuarios.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhum usuário cadastrado.</p>
                  ) : (
                    <ul className="divide-y divide-border rounded-lg border border-border text-sm">
                      {detalhes.usuarios.map((u) => (
                        <li key={u.id} className="flex flex-wrap justify-between gap-2 px-3 py-2">
                          <div>
                            <p className="font-medium">{u.nome}</p>
                            <p className="text-xs text-muted-foreground break-all">{u.email}</p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline">{u.papel}</Badge>
                            <Badge variant={u.ativo ? 'success' : 'secondary'}>
                              {u.ativo ? 'Ativo' : 'Inativo'}
                            </Badge>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </TabsContent>

                <TabsContent value="clientes" className="mt-0 space-y-2">
                  <ContadorAmostra
                    total={detalhes.totais.clientes}
                    mostrando={detalhes.amostra_clientes.length}
                    rotulo="clientes"
                  />
                  <p className="text-xs text-muted-foreground">Fonte: Supabase</p>
                  {detectarClientesDuplicadosAdmin(detalhes.amostra_clientes).length > 0 && (
                    <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100/95">
                      Possíveis clientes duplicados no banco (mesmo telefone/nome):{' '}
                      {detectarClientesDuplicadosAdmin(detalhes.amostra_clientes)
                        .map((g) => g.clientes.map((c) => c.titulo).join(' / '))
                        .join('; ')}
                      . Revise no Supabase — nada é apagado automaticamente.
                    </p>
                  )}
                  <ListaResumo
                    items={detalhes.amostra_clientes}
                    vazio="Nenhum cliente cadastrado."
                  />
                </TabsContent>

                <TabsContent value="motos" className="mt-0 space-y-2">
                  <ContadorAmostra
                    total={detalhes.totais.motos}
                    mostrando={detalhes.amostra_motos.length}
                    rotulo={rotuloVeiculosLista.toLowerCase()}
                  />
                  <ListaResumo items={detalhes.amostra_motos} vazio={msgVazioVeiculos} />
                </TabsContent>

                <TabsContent value="os" className="mt-0 space-y-2">
                  <ContadorAmostra
                    total={detalhes.totais.ordens}
                    mostrando={detalhes.amostra_ordens.length}
                    rotulo="OS"
                  />
                  <ListaResumo items={detalhes.amostra_ordens} vazio="Nenhuma OS cadastrada." />
                </TabsContent>

                <TabsContent value="financeiro" className="mt-0 space-y-2">
                  <p className="text-sm">
                    Pagamentos registrados: <strong>{detalhes.totais.pagamentos}</strong>
                  </p>
                  <p className="text-sm">
                    Receita total: <strong>{formatarMoeda(detalhes.totais.receita_paga)}</strong>
                  </p>
                  <ListaResumo
                    items={detalhes.amostra_pagamentos}
                    vazio="Nenhum pagamento encontrado."
                  />
                </TabsContent>

                <TabsContent value="estoque" className="mt-0 space-y-2">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <ContadorAmostra
                      total={detalhes.totais.pecas}
                      mostrando={detalhes.amostra_estoque.length}
                      rotulo="itens"
                    />
                    {detalhes.totais.pecas > detalhes.amostra_estoque.length && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={carregandoMaisEstoque}
                        onClick={() => void carregarMaisEstoque()}
                      >
                        {carregandoMaisEstoque ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Carregando…
                          </>
                        ) : (
                          'Ver todos'
                        )}
                      </Button>
                    )}
                  </div>
                  <ListaResumo
                    items={detalhes.amostra_estoque}
                    vazio="Nenhum item de estoque."
                  />
                </TabsContent>
              </div>
            </Tabs>
            )
          })()}
        </div>
      </DialogContent>
    </Dialog>
  )
}
