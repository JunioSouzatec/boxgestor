/**
 * F4A — Central Notas fiscais / Preparar nota (validação sem emissão).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { FileText, Loader2 } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { PreparacaoNotaDetalhe } from '@/components/fiscal/PreparacaoNotaDetalhe'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useOficinaData, useCraft } from '@/context/CraftContext'
import { entidadeFoiExcluida } from '@/lib/entidade-ativa'
import { formatarData, formatarMoeda } from '@/lib/utils'
import { ordenarMaisRecentesPrimeiro } from '@/lib/ordenacao-listagem'
import {
  listarVendasBalcao,
  obterVendaBalcaoPorId,
} from '@/services/venda-balcao/venda-balcao.service'
import {
  prepararNotaOrdemServico,
  prepararNotaVendaBalcao,
} from '@/services/fiscal/fiscal-preparar-nota.service'
import { montarResumoFiscalCentral } from '@/services/fiscal/fiscal-validacao.service'
import type { PreparacaoNotaFiscal } from '@/types/fiscal-preparacao'
import type { VendaBalcao } from '@/types/venda-balcao'
import { getLabelStatusOS } from '@/types/labels'

function BadgePrep({ label, ok }: { label: string; ok: boolean }) {
  return (
    <Badge
      variant={ok ? 'success' : 'outline'}
      className={
        ok
          ? undefined
          : 'border-amber-600/50 bg-amber-100 text-amber-950 dark:border-amber-400/70 dark:bg-amber-950/60 dark:text-amber-50'
      }
    >
      {label}
    </Badge>
  )
}

export function FiscalPage() {
  const { oficinaId } = useCraft()
  const { clientes, pecas, ordens, motos, configuracao } = useOficinaData()

  const [vendas, setVendas] = useState<VendaBalcao[]>([])
  const [carregandoVb, setCarregandoVb] = useState(false)
  const [erroVb, setErroVb] = useState<string | null>(null)
  const [prep, setPrep] = useState<PreparacaoNotaFiscal | null>(null)
  const [abrindoId, setAbrindoId] = useState<string | null>(null)

  const carregarVendas = useCallback(async () => {
    if (!oficinaId) return
    setCarregandoVb(true)
    setErroVb(null)
    try {
      const lista = await listarVendasBalcao(oficinaId, { limite: 80 })
      setVendas(
        lista.filter((v) => !v.deleted_at && v.status !== 'canceled' && v.status !== 'draft')
      )
    } catch (e) {
      setErroVb(e instanceof Error ? e.message : 'Não foi possível carregar vendas balcão.')
      setVendas([])
    } finally {
      setCarregandoVb(false)
    }
  }, [oficinaId])

  useEffect(() => {
    void carregarVendas()
  }, [carregarVendas])

  const osLista = useMemo(
    () =>
      ordenarMaisRecentesPrimeiro(
        ordens.filter(
          (o) =>
            !entidadeFoiExcluida(o) &&
            o.status !== 'cancelada' &&
            o.modo_documento !== 'orcamento'
        )
      ).slice(0, 80),
    [ordens]
  )

  const prepCacheVb = useMemo(() => {
    const map = new Map<string, PreparacaoNotaFiscal>()
    for (const v of vendas.slice(0, 40)) {
      map.set(
        v.id,
        prepararNotaVendaBalcao({
          venda: v,
          clientes,
          pecas,
          configuracao,
        })
      )
    }
    return map
  }, [vendas, clientes, pecas, configuracao])

  const prepCacheOs = useMemo(() => {
    const map = new Map<string, PreparacaoNotaFiscal>()
    for (const os of osLista.slice(0, 40)) {
      map.set(
        os.id,
        prepararNotaOrdemServico({
          os,
          clientes,
          pecas,
          motos,
          configuracao,
        })
      )
    }
    return map
  }, [osLista, clientes, pecas, motos, configuracao])

  const pendenciasAmostra = useMemo(() => {
    let n = 0
    for (const p of prepCacheVb.values()) {
      n += p.pendencias.filter((x) => x.severidade === 'bloqueante').length
    }
    for (const p of prepCacheOs.values()) {
      n += p.pendencias.filter((x) => x.severidade === 'bloqueante').length
    }
    return n
  }, [prepCacheVb, prepCacheOs])

  const resumo = useMemo(
    () =>
      montarResumoFiscalCentral({
        configuracao,
        clientes,
        pecas,
        pendenciasAmostra,
      }),
    [configuracao, clientes, pecas, pendenciasAmostra]
  )

  async function abrirPreparacaoVb(venda: VendaBalcao) {
    setAbrindoId(venda.id)
    try {
      let completa = venda
      if (!venda.itens?.length) {
        const det = await obterVendaBalcaoPorId(oficinaId, venda.id, true)
        if (det) completa = det
      }
      setPrep(
        prepararNotaVendaBalcao({
          venda: completa,
          clientes,
          pecas,
          configuracao,
        })
      )
    } finally {
      setAbrindoId(null)
    }
  }

  function abrirPreparacaoOs(osId: string) {
    const os = ordens.find((o) => o.id === osId)
    if (!os) return
    setPrep(
      prepararNotaOrdemServico({
        os,
        clientes,
        pecas,
        motos,
        configuracao,
      })
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Notas fiscais"
        descricao="Prepare e valide os dados antes da emissão fiscal. A emissão ainda não está ativa."
      />

      <p className="rounded-md border border-amber-600/50 bg-amber-100 px-3 py-2 text-sm text-amber-950 dark:border-amber-400/70 dark:bg-amber-950/70 dark:text-amber-50">
        Esta tela ainda não emite nota fiscal. Ela apenas valida dados da oficina, cliente e itens
        para preparação futura. Confirme os dados fiscais com o contador antes de emitir.
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Oficina fiscal</CardTitle>
          </CardHeader>
          <CardContent>
            <BadgePrep
              ok={resumo.oficina_completa}
              label={resumo.oficina_completa ? 'Completa' : 'Incompleta'}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Clientes fiscais</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold">
              {resumo.clientes_basico_preenchido}
              <span className="text-sm font-normal text-muted-foreground">
                {' '}
                / {resumo.clientes_total}
              </span>
            </p>
            <p className="text-xs text-muted-foreground">com dados básicos</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Produtos fiscais</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold">
              {resumo.produtos_basico_preenchido}
              <span className="text-sm font-normal text-muted-foreground">
                {' '}
                / {resumo.produtos_total}
              </span>
            </p>
            <p className="text-xs text-muted-foreground">com NCM/unidade/origem</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Pendências fiscais</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold">{resumo.pendencias_amostra}</p>
            <p className="text-xs text-muted-foreground">na amostra listada</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Emissão fiscal</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant="outline" className="border-border text-muted-foreground">
              Ainda não ativa
            </Badge>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="vendas">
        <TabsList className="flex h-auto flex-wrap gap-1">
          <TabsTrigger value="vendas">Vendas Balcão</TabsTrigger>
          <TabsTrigger value="os">Ordens de Serviço</TabsTrigger>
        </TabsList>

        <TabsContent value="vendas" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-base">Origens — Venda Balcão</CardTitle>
              <Button variant="outline" size="sm" onClick={() => void carregarVendas()} disabled={carregandoVb}>
                {carregandoVb ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Atualizar'}
              </Button>
            </CardHeader>
            <CardContent>
              {erroVb && <p className="mb-3 text-sm text-destructive">{erroVb}</p>}
              {carregandoVb && vendas.length === 0 ? (
                <p className="text-sm text-muted-foreground">Carregando vendas…</p>
              ) : vendas.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma venda balcão para preparar.</p>
              ) : (
                <>
                  <div className="hidden md:block overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Venda</TableHead>
                          <TableHead>Cliente</TableHead>
                          <TableHead>Data</TableHead>
                          <TableHead>Valor</TableHead>
                          <TableHead>Financeiro</TableHead>
                          <TableHead>Fiscal</TableHead>
                          <TableHead />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {vendas.map((v) => {
                          const p = prepCacheVb.get(v.id)
                          const pagPendente =
                            v.payment_status === 'pending' || v.status === 'pending'
                          return (
                            <TableRow key={v.id}>
                              <TableCell>
                                {v.sale_number != null ? `#${v.sale_number}` : v.id.slice(0, 8)}
                              </TableCell>
                              <TableCell>{v.customer_name || 'Não identificado'}</TableCell>
                              <TableCell>
                                {formatarData(v.sold_at || v.created_at)}
                              </TableCell>
                              <TableCell>{formatarMoeda(v.total)}</TableCell>
                              <TableCell>
                                {pagPendente ? (
                                  <Badge
                                    variant="outline"
                                    className="border-amber-600/50 bg-amber-100 text-amber-950 dark:border-amber-400/70 dark:bg-amber-950/60 dark:text-amber-50"
                                  >
                                    Pendente
                                  </Badge>
                                ) : (
                                  <Badge variant="success">Pago</Badge>
                                )}
                              </TableCell>
                              <TableCell>
                                {p ? (
                                  <BadgePrep
                                    ok={p.status === 'pronta_para_preparar'}
                                    label={p.status_label}
                                  />
                                ) : (
                                  <Badge variant="outline">Não preparada</Badge>
                                )}
                              </TableCell>
                              <TableCell>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="gap-1"
                                  disabled={abrindoId === v.id}
                                  onClick={() => void abrirPreparacaoVb(v)}
                                >
                                  {abrindoId === v.id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <FileText className="h-3.5 w-3.5" />
                                  )}
                                  Preparar nota
                                </Button>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="space-y-3 md:hidden">
                    {vendas.map((v) => {
                      const p = prepCacheVb.get(v.id)
                      const pagPendente =
                        v.payment_status === 'pending' || v.status === 'pending'
                      return (
                        <div key={v.id} className="rounded-lg border border-border p-3 space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-medium">
                              {v.sale_number != null ? `#${v.sale_number}` : v.id.slice(0, 8)}
                            </p>
                            {p && (
                              <BadgePrep
                                ok={p.status === 'pronta_para_preparar'}
                                label={p.status_label}
                              />
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {v.customer_name || 'Não identificado'} ·{' '}
                            {formatarMoeda(v.total)} · {pagPendente ? 'Pendente' : 'Pago'}
                          </p>
                          <Button
                            size="sm"
                            className="w-full gap-1"
                            disabled={abrindoId === v.id}
                            onClick={() => void abrirPreparacaoVb(v)}
                          >
                            <FileText className="h-3.5 w-3.5" />
                            Preparar nota
                          </Button>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="os" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Origens — Ordens de Serviço</CardTitle>
            </CardHeader>
            <CardContent>
              {osLista.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma OS para preparar.</p>
              ) : (
                <>
                  <div className="hidden md:block overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>OS</TableHead>
                          <TableHead>Cliente</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Valor</TableHead>
                          <TableHead>Itens</TableHead>
                          <TableHead>Fiscal</TableHead>
                          <TableHead />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {osLista.map((os) => {
                          const p = prepCacheOs.get(os.id)
                          const cli = clientes.find((c) => c.id === os.cliente_id)
                          const nPecas = os.pecas_utilizadas?.length ?? 0
                          const nServ =
                            os.servicos_itens?.length ??
                            ((os.valor_mao_obra ?? 0) > 0 || os.servicos_executados ? 1 : 0)
                          return (
                            <TableRow key={os.id}>
                              <TableCell>#{os.numero}</TableCell>
                              <TableCell>{cli?.nome ?? '—'}</TableCell>
                              <TableCell>{getLabelStatusOS(os.status)}</TableCell>
                              <TableCell>{formatarMoeda(os.valor_total)}</TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {nServ} serv. · {nPecas} peç.
                              </TableCell>
                              <TableCell>
                                {p ? (
                                  <BadgePrep
                                    ok={p.status === 'pronta_para_preparar'}
                                    label={p.status_label}
                                  />
                                ) : (
                                  <Badge variant="outline">Não preparada</Badge>
                                )}
                              </TableCell>
                              <TableCell>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="gap-1"
                                  onClick={() => abrirPreparacaoOs(os.id)}
                                >
                                  <FileText className="h-3.5 w-3.5" />
                                  Preparar nota
                                </Button>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="space-y-3 md:hidden">
                    {osLista.map((os) => {
                      const p = prepCacheOs.get(os.id)
                      const cli = clientes.find((c) => c.id === os.cliente_id)
                      return (
                        <div key={os.id} className="rounded-lg border border-border p-3 space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-medium">OS #{os.numero}</p>
                            {p && (
                              <BadgePrep
                                ok={p.status === 'pronta_para_preparar'}
                                label={p.status_label}
                              />
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {cli?.nome ?? '—'} · {formatarMoeda(os.valor_total)} ·{' '}
                            {getLabelStatusOS(os.status)}
                          </p>
                          <Button
                            size="sm"
                            className="w-full gap-1"
                            onClick={() => abrirPreparacaoOs(os.id)}
                          >
                            <FileText className="h-3.5 w-3.5" />
                            Preparar nota
                          </Button>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <PreparacaoNotaDetalhe
        aberto={prep !== null}
        onFechar={() => setPrep(null)}
        preparacao={prep}
        configuracao={configuracao}
      />
    </div>
  )
}
