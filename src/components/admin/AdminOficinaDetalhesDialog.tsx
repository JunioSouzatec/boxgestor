import { useCallback, useState } from 'react'
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

function ListaResumo({ items, vazio }: { items: AdminOfficeResumoItem[]; vazio: string }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{vazio}</p>
  }
  return (
    <ul className="divide-y divide-border rounded-lg border border-border">
      {items.map((item) => (
        <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
          <div>
            <p className="font-medium">{item.titulo}</p>
            {item.subtitulo && (
              <p className="text-xs text-muted-foreground">{item.subtitulo}</p>
            )}
          </div>
          <div className="text-right text-xs text-muted-foreground">
            {item.valor && <p>{item.valor}</p>}
            {item.data && <p>{new Date(item.data).toLocaleDateString('pt-BR')}</p>}
          </div>
        </li>
      ))}
    </ul>
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
    if (!oficina) return
    setCarregando(true)
    setErro(null)
    try {
      const dados = await carregarDetalhesOficinaAdmin(oficina.office_id)
      setDetalhes(dados)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar detalhes.')
      setDetalhes(null)
    } finally {
      setCarregando(false)
    }
  }, [oficina])

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      onFechar()
      setDetalhes(null)
      setErro(null)
      return
    }
    void carregar()
  }

  return (
    <Dialog open={aberto} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>{oficina?.nome ?? 'Detalhes da oficina'}</DialogTitle>
          <DialogDescription>
            Dados carregados sob demanda do Supabase — apenas suporte Admin BoxGestor.
          </DialogDescription>
        </DialogHeader>

        {carregando && (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando detalhes…
          </div>
        )}

        {erro && (
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {erro}
          </p>
        )}

        {detalhes && !carregando && (
          <Tabs defaultValue="dados" className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <TabsList className="flex h-auto flex-wrap gap-1">
              <TabsTrigger value="dados">Dados</TabsTrigger>
              <TabsTrigger value="usuarios">Usuários</TabsTrigger>
              <TabsTrigger value="plano">Plano</TabsTrigger>
              <TabsTrigger value="clientes">Clientes</TabsTrigger>
              <TabsTrigger value="motos">Motos</TabsTrigger>
              <TabsTrigger value="os">OS</TabsTrigger>
              <TabsTrigger value="financeiro">Financeiro</TabsTrigger>
              <TabsTrigger value="estoque">Estoque</TabsTrigger>
            </TabsList>

            <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
              <TabsContent value="dados" className="mt-0 space-y-3">
                {detalhes.arquivada && (
                  <Badge variant="warning">Oficina arquivada</Badge>
                )}
                <dl className="grid gap-2 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-muted-foreground">Telefone</dt>
                    <dd>{detalhes.telefone ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">E-mail</dt>
                    <dd>{detalhes.email ?? '—'}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-muted-foreground">Endereço</dt>
                    <dd>{detalhes.endereco ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Cadastro</dt>
                    <dd>
                      {detalhes.criado_em
                        ? new Date(detalhes.criado_em).toLocaleDateString('pt-BR')
                        : '—'}
                    </dd>
                  </div>
                </dl>
              </TabsContent>

              <TabsContent value="usuarios" className="mt-0">
                {detalhes.usuarios.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum usuário.</p>
                ) : (
                  <ul className="divide-y divide-border rounded-lg border border-border text-sm">
                    {detalhes.usuarios.map((u) => (
                      <li key={u.id} className="flex justify-between gap-2 px-3 py-2">
                        <div>
                          <p className="font-medium">{u.nome}</p>
                          <p className="text-xs text-muted-foreground">{u.email}</p>
                        </div>
                        <Badge variant="outline">{u.papel}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </TabsContent>

              <TabsContent value="plano" className="mt-0 space-y-2 text-sm">
                <p>
                  Plano: <strong>{detalhes.plano_label}</strong>
                </p>
                {detalhes.trial_inicio && (
                  <p>
                    Teste início:{' '}
                    {new Date(detalhes.trial_inicio).toLocaleDateString('pt-BR')}
                  </p>
                )}
                {detalhes.trial_fim && (
                  <p>
                    Teste fim: {new Date(detalhes.trial_fim).toLocaleDateString('pt-BR')}
                  </p>
                )}
              </TabsContent>

              <TabsContent value="clientes" className="mt-0 space-y-2">
                <p className="text-sm text-muted-foreground">
                  Total: {detalhes.totais.clientes} (mostrando até {detalhes.amostra_clientes.length})
                </p>
                <ListaResumo items={detalhes.amostra_clientes} vazio="Nenhum cliente." />
              </TabsContent>

              <TabsContent value="motos" className="mt-0 space-y-2">
                <p className="text-sm text-muted-foreground">Total: {detalhes.totais.motos}</p>
                <ListaResumo items={detalhes.amostra_motos} vazio="Nenhuma moto." />
              </TabsContent>

              <TabsContent value="os" className="mt-0 space-y-2">
                <p className="text-sm text-muted-foreground">Total: {detalhes.totais.ordens}</p>
                <ListaResumo items={detalhes.amostra_ordens} vazio="Nenhuma OS." />
              </TabsContent>

              <TabsContent value="financeiro" className="mt-0 space-y-2">
                <p className="text-sm">
                  Pagamentos registrados: <strong>{detalhes.totais.pagamentos}</strong>
                </p>
                <p className="text-sm">
                  Receita (amostra carregada):{' '}
                  <strong>{formatarMoeda(detalhes.totais.receita_paga)}</strong>
                </p>
                <ListaResumo items={detalhes.amostra_pagamentos} vazio="Nenhum pagamento." />
              </TabsContent>

              <TabsContent value="estoque" className="mt-0">
                <p className="text-sm">
                  Itens no estoque: <strong>{detalhes.totais.pecas}</strong>
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Detalhe por item disponível na oficina cliente (modo suporte).
                </p>
              </TabsContent>
            </div>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  )
}
