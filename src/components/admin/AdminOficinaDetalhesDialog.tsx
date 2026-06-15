import { useCallback, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { formatarMoeda } from '@/lib/utils'
import { getLabelPlano } from '@/types/plano'
import {
  carregarDetalhesOficinaAdmin,
  type AdminOfficeDetalhes,
  type AdminOfficeResumoItem,
} from '@/services/admin/admin-office-details.service'
import type { OficinaRegistro } from '@/services/assinatura/office-registry.service'

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
        <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
          <div className="min-w-0 flex-1">
            <p className="font-medium">{item.titulo}</p>
            {item.subtitulo && (
              <p className="text-xs text-muted-foreground break-words">{item.subtitulo}</p>
            )}
          </div>
          <div className="shrink-0 text-right text-xs text-muted-foreground">
            {item.valor && <p>{item.valor}</p>}
            {item.data && <p>{new Date(item.data).toLocaleDateString('pt-BR')}</p>}
          </div>
        </li>
      ))}
    </ul>
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
  const [detalhes, setDetalhes] = useState<AdminOfficeDetalhes | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    if (!oficina?.office_id) return
    setCarregando(true)
    setErro(null)
    setDetalhes(null)
    try {
      const dados = await carregarDetalhesOficinaAdmin(oficina.office_id)
      setDetalhes(dados)
    } catch (e) {
      console.error('[Admin BoxGestor] Falha ao carregar detalhes da oficina', {
        office_id: oficina.office_id,
        erro: e,
      })
      setErro('Não foi possível carregar os detalhes desta oficina.')
      setDetalhes(null)
    } finally {
      setCarregando(false)
    }
  }, [oficina])

  useEffect(() => {
    if (aberto && oficina?.office_id) {
      void carregar()
    }
    if (!aberto) {
      setDetalhes(null)
      setErro(null)
      setCarregando(false)
    }
  }, [aberto, oficina?.office_id, carregar])

  function handleOpenChange(open: boolean) {
    if (!open) onFechar()
  }

  return (
    <Dialog open={aberto} onOpenChange={handleOpenChange}>
      <DialogContent className="flex h-[min(92dvh,900px)] w-[min(96vw,1100px)] max-w-none flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 space-y-0 border-b border-border px-6 py-4">
          <DialogTitle className="text-xl">Detalhes da oficina</DialogTitle>
          <DialogDescription className="sr-only">
            Dados carregados sob demanda do Supabase — apenas suporte Admin BoxGestor.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-6 pb-6 pt-4">
          {oficina && <ResumoTopo oficina={oficina} detalhes={detalhes} />}

          {carregando && (
            <div className="flex flex-1 items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Carregando detalhes da oficina...
            </div>
          )}

          {!carregando && erro && (
            <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {erro}
            </div>
          )}

          {!carregando && !erro && detalhes && (
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
                  Motos
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
                          ? new Date(detalhes.criado_em).toLocaleDateString('pt-BR')
                          : '—'}
                      </dd>
                    </div>
                    {detalhes.trial_inicio && (
                      <div>
                        <dt className="text-muted-foreground">Início do teste</dt>
                        <dd>{new Date(detalhes.trial_inicio).toLocaleDateString('pt-BR')}</dd>
                      </div>
                    )}
                    {detalhes.trial_fim && (
                      <div>
                        <dt className="text-muted-foreground">Fim do teste</dt>
                        <dd>{new Date(detalhes.trial_fim).toLocaleDateString('pt-BR')}</dd>
                      </div>
                    )}
                  </dl>
                </TabsContent>

                <TabsContent value="usuarios" className="mt-0">
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
                  <p className="text-sm text-muted-foreground">
                    Total: {detalhes.totais.clientes}
                    {detalhes.totais.clientes > detalhes.amostra_clientes.length &&
                      ` (mostrando ${detalhes.amostra_clientes.length})`}
                  </p>
                  <ListaResumo
                    items={detalhes.amostra_clientes}
                    vazio="Nenhum cliente cadastrado."
                  />
                </TabsContent>

                <TabsContent value="motos" className="mt-0 space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Total: {detalhes.totais.motos}
                    {detalhes.totais.motos > detalhes.amostra_motos.length &&
                      ` (mostrando ${detalhes.amostra_motos.length})`}
                  </p>
                  <ListaResumo items={detalhes.amostra_motos} vazio="Nenhuma moto cadastrada." />
                </TabsContent>

                <TabsContent value="os" className="mt-0 space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Total: {detalhes.totais.ordens}
                    {detalhes.totais.ordens > detalhes.amostra_ordens.length &&
                      ` (mostrando ${detalhes.amostra_ordens.length})`}
                  </p>
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
                  <p className="text-sm text-muted-foreground">
                    Total: {detalhes.totais.pecas}
                    {detalhes.totais.pecas > detalhes.amostra_estoque.length &&
                      ` (mostrando ${detalhes.amostra_estoque.length})`}
                  </p>
                  <ListaResumo
                    items={detalhes.amostra_estoque}
                    vazio="Nenhum item de estoque."
                  />
                </TabsContent>
              </div>
            </Tabs>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
