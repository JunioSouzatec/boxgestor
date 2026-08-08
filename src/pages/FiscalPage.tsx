/**
 * F4A — Central Notas fiscais / Preparar nota (validação sem emissão).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { FileText, Loader2, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { PreparacaoNotaDetalhe } from '@/components/fiscal/PreparacaoNotaDetalhe'
import { EspelhoFiscalConferencia } from '@/components/fiscal/EspelhoFiscalConferencia'
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
import { useToast } from '@/context/ToastContext'
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
import {
  excluirRascunhoFiscal,
  listarRascunhosFiscais,
  preparacaoDeRascunhoFiscal,
  salvarRascunhoFiscal,
} from '@/services/fiscal/fiscal-draft.service'
import {
  labelStatusFiscalDraft,
  origemPreparacaoParaDraft,
  type FiscalDraft,
} from '@/types/fiscal-draft'
import type { PreparacaoNotaFiscal } from '@/types/fiscal-preparacao'
import { labelTipoDocumentoSugerido, type TipoDocumentoFiscalSugerido } from '@/types/fiscal-preparacao'
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
  const { toast } = useToast()

  const [vendas, setVendas] = useState<VendaBalcao[]>([])
  const [carregandoVb, setCarregandoVb] = useState(false)
  const [erroVb, setErroVb] = useState<string | null>(null)
  const [prep, setPrep] = useState<PreparacaoNotaFiscal | null>(null)
  const [prepDraft, setPrepDraft] = useState<FiscalDraft | null>(null)
  const [espelhoAberto, setEspelhoAberto] = useState(false)
  /** Espelho aberto pela lista de rascunhos (sem manter modal de preparação). */
  const [espelhoSomente, setEspelhoSomente] = useState(false)
  const [abrindoId, setAbrindoId] = useState<string | null>(null)
  const [rascunhos, setRascunhos] = useState<FiscalDraft[]>([])
  const [carregandoRascunhos, setCarregandoRascunhos] = useState(false)
  const [erroRascunhos, setErroRascunhos] = useState<string | null>(null)
  const [salvandoRascunho, setSalvandoRascunho] = useState(false)
  const [mensagemRascunho, setMensagemRascunho] = useState<string | null>(null)
  const [excluindoId, setExcluindoId] = useState<string | null>(null)

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

  const carregarRascunhos = useCallback(async () => {
    if (!oficinaId) return
    setCarregandoRascunhos(true)
    setErroRascunhos(null)
    try {
      const lista = await listarRascunhosFiscais(oficinaId, { limite: 80 })
      setRascunhos(lista)
    } catch (e) {
      setErroRascunhos(
        e instanceof Error ? e.message : 'Não foi possível carregar rascunhos fiscais.'
      )
      setRascunhos([])
    } finally {
      setCarregandoRascunhos(false)
    }
  }, [oficinaId])

  useEffect(() => {
    void carregarVendas()
  }, [carregarVendas])

  useEffect(() => {
    void carregarRascunhos()
  }, [carregarRascunhos])

  const idsComRascunho = useMemo(() => {
    const set = new Set<string>()
    for (const r of rascunhos) set.add(`${r.origin_type}:${r.origin_id}`)
    return set
  }, [rascunhos])

  const jaTemRascunhoAberto = useMemo(() => {
    if (!prep) return false
    const tipo = origemPreparacaoParaDraft(prep.origem)
    return idsComRascunho.has(`${tipo}:${prep.origem_id}`)
  }, [prep, idsComRascunho])

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
    setMensagemRascunho(null)
    setPrepDraft(null)
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
    setMensagemRascunho(null)
    setPrepDraft(null)
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

  function abrirRascunho(d: FiscalDraft) {
    setMensagemRascunho(null)
    setPrepDraft(d)
    setPrep(preparacaoDeRascunhoFiscal(d))
  }

  function abrirEspelhoDeRascunho(d: FiscalDraft) {
    setPrepDraft(d)
    setPrep(preparacaoDeRascunhoFiscal(d))
    setEspelhoSomente(true)
    setEspelhoAberto(true)
  }

  function abrirEspelhoAtual() {
    if (!prep) return
    setEspelhoSomente(false)
    setEspelhoAberto(true)
  }

  function fecharEspelho() {
    setEspelhoAberto(false)
    if (espelhoSomente) {
      setPrep(null)
      setPrepDraft(null)
      setEspelhoSomente(false)
    }
  }

  async function salvarRascunhoAtual() {
    if (!prep || !oficinaId) return
    setSalvandoRascunho(true)
    setMensagemRascunho(null)
    try {
      await salvarRascunhoFiscal({
        officeIdLocal: oficinaId,
        preparacao: prep,
        configuracao,
      })
      const msg =
        'Rascunho fiscal salvo. Esta ação ainda não emite nota.'
      setMensagemRascunho(msg)
      toast.sucesso(msg)
      await carregarRascunhos()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Não foi possível salvar o rascunho.'
      setMensagemRascunho(msg)
      toast.erro(msg)
    } finally {
      setSalvandoRascunho(false)
    }
  }

  async function atualizarValidacaoRascunho(draft: FiscalDraft) {
    setAbrindoId(draft.id)
    setMensagemRascunho(null)
    try {
      if (draft.origin_type === 'counter_sale') {
        const venda =
          vendas.find((v) => v.id === draft.origin_id) ||
          (await obterVendaBalcaoPorId(oficinaId, draft.origin_id, true))
        if (!venda) {
          toast.erro('Venda de origem não encontrada.')
          return
        }
        let completa = venda
        if (!venda.itens?.length) {
          const det = await obterVendaBalcaoPorId(oficinaId, venda.id, true)
          if (det) completa = det
        }
        const nova = prepararNotaVendaBalcao({
          venda: completa,
          clientes,
          pecas,
          configuracao,
        })
        setPrep(nova)
        setPrepDraft(null)
        await salvarRascunhoFiscal({
          officeIdLocal: oficinaId,
          preparacao: nova,
          configuracao,
        })
        setMensagemRascunho('Rascunho atualizado com a validação atual. Ainda não emite nota.')
        await carregarRascunhos()
      } else {
        const os = ordens.find((o) => o.id === draft.origin_id)
        if (!os) {
          toast.erro('OS de origem não encontrada.')
          return
        }
        const nova = prepararNotaOrdemServico({
          os,
          clientes,
          pecas,
          motos,
          configuracao,
        })
        setPrep(nova)
        setPrepDraft(null)
        await salvarRascunhoFiscal({
          officeIdLocal: oficinaId,
          preparacao: nova,
          configuracao,
        })
        setMensagemRascunho('Rascunho atualizado com a validação atual. Ainda não emite nota.')
        await carregarRascunhos()
      }
    } catch (e) {
      toast.erro(e instanceof Error ? e.message : 'Falha ao atualizar validação.')
    } finally {
      setAbrindoId(null)
    }
  }

  async function removerRascunho(draft: FiscalDraft) {
    setExcluindoId(draft.id)
    try {
      await excluirRascunhoFiscal(oficinaId, draft.id)
      toast.sucesso('Rascunho fiscal excluído.')
      await carregarRascunhos()
      if (prep && prep.origem_id === draft.origin_id) {
        setMensagemRascunho(null)
      }
    } catch (e) {
      toast.erro(e instanceof Error ? e.message : 'Não foi possível excluir o rascunho.')
    } finally {
      setExcluindoId(null)
    }
  }

  function linkOrigem(draft: FiscalDraft): string {
    return draft.origin_type === 'counter_sale'
      ? '/vendas-balcao'
      : `/ordens-servico/${draft.origin_id}/visualizar`
  }

  function labelTipoDraft(draft: FiscalDraft): string {
    const t = draft.document_type_suggested as TipoDocumentoFiscalSugerido | undefined
    if (!t) return '—'
    try {
      return labelTipoDocumentoSugerido(t)
    } catch {
      return t
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Notas fiscais"
        descricao="Prepare e valide os dados antes da emissão fiscal. A emissão ainda não está ativa."
      />

      <p className="rounded-md border border-amber-600/50 bg-amber-100 px-3 py-2 text-sm text-amber-950 dark:border-amber-400/70 dark:bg-amber-950/70 dark:text-amber-50">
        Esta tela ainda não emite nota fiscal. Ela apenas valida dados da oficina, cliente e itens
        para preparação futura. Revise as configurações fiscais iniciais com o contador. No dia a
        dia, use a prévia para conferência interna — a emissão ainda não está ativa.
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
          <TabsTrigger value="rascunhos">Rascunhos fiscais</TabsTrigger>
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

        <TabsContent value="rascunhos" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base">Rascunhos fiscais</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Preparações salvas internamente. Não emitem nota e não geram XML/DANFE.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void carregarRascunhos()}
                disabled={carregandoRascunhos}
              >
                {carregandoRascunhos ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Atualizar'}
              </Button>
            </CardHeader>
            <CardContent>
              {erroRascunhos && (
                <p className="mb-3 text-sm text-destructive">{erroRascunhos}</p>
              )}
              {carregandoRascunhos && rascunhos.length === 0 ? (
                <p className="text-sm text-muted-foreground">Carregando rascunhos…</p>
              ) : rascunhos.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum rascunho salvo. Abra Preparar nota e use Salvar rascunho.
                </p>
              ) : (
                <>
                  <div className="hidden md:block overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Origem</TableHead>
                          <TableHead>Cliente</TableHead>
                          <TableHead>Valor</TableHead>
                          <TableHead>Tipo</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Pendências</TableHead>
                          <TableHead>Atualizado</TableHead>
                          <TableHead />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rascunhos.map((d) => {
                          const qtd =
                            Number(d.totals_snapshot.qtd_pendencias_bloqueantes) ||
                            d.issues_snapshot.filter((i) => i.severidade === 'bloqueante').length
                          const cliente =
                            typeof d.customer_snapshot.nome === 'string'
                              ? d.customer_snapshot.nome
                              : '—'
                          const valor =
                            Number(d.payment_snapshot.valor_total ?? d.totals_snapshot.valor_total) ||
                            0
                          return (
                            <TableRow key={d.id}>
                              <TableCell className="max-w-[180px] truncate">
                                {d.origin_label || d.origin_id}
                              </TableCell>
                              <TableCell>{cliente}</TableCell>
                              <TableCell>{formatarMoeda(valor)}</TableCell>
                              <TableCell className="text-xs">{labelTipoDraft(d)}</TableCell>
                              <TableCell>
                                <BadgePrep
                                  ok={d.status === 'ready_to_prepare'}
                                  label={labelStatusFiscalDraft(d.status)}
                                />
                              </TableCell>
                              <TableCell>{qtd}</TableCell>
                              <TableCell>{formatarData(d.updated_at)}</TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-1">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => abrirRascunho(d)}
                                  >
                                    Abrir
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => abrirEspelhoDeRascunho(d)}
                                  >
                                    Ver espelho
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={abrindoId === d.id}
                                    onClick={() => void atualizarValidacaoRascunho(d)}
                                  >
                                    {abrindoId === d.id ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      'Atualizar validação'
                                    )}
                                  </Button>
                                  <Button size="sm" variant="outline" asChild>
                                    <Link to={linkOrigem(d)}>Origem</Link>
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    disabled={excluindoId === d.id}
                                    onClick={() => void removerRascunho(d)}
                                    title="Excluir rascunho"
                                  >
                                    {excluindoId === d.id ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <Trash2 className="h-3.5 w-3.5" />
                                    )}
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="space-y-3 md:hidden">
                    {rascunhos.map((d) => {
                      const cliente =
                        typeof d.customer_snapshot.nome === 'string'
                          ? d.customer_snapshot.nome
                          : '—'
                      const valor =
                        Number(d.payment_snapshot.valor_total ?? d.totals_snapshot.valor_total) || 0
                      return (
                        <div key={d.id} className="rounded-lg border border-border p-3 space-y-2">
                          <p className="font-medium truncate">{d.origin_label || d.origin_id}</p>
                          <p className="text-sm text-muted-foreground">
                            {cliente} · {formatarMoeda(valor)} · {formatarData(d.updated_at)}
                          </p>
                          <BadgePrep
                            ok={d.status === 'ready_to_prepare'}
                            label={labelStatusFiscalDraft(d.status)}
                          />
                          <div className="grid gap-2">
                            <Button
                              size="sm"
                              className="w-full"
                              onClick={() => abrirRascunho(d)}
                            >
                              Abrir
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              className="w-full"
                              onClick={() => abrirEspelhoDeRascunho(d)}
                            >
                              Ver espelho
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full"
                              disabled={abrindoId === d.id}
                              onClick={() => void atualizarValidacaoRascunho(d)}
                            >
                              Atualizar validação
                            </Button>
                            <Button size="sm" variant="outline" className="w-full" asChild>
                              <Link to={linkOrigem(d)}>Voltar para origem</Link>
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="w-full"
                              disabled={excluindoId === d.id}
                              onClick={() => void removerRascunho(d)}
                            >
                              Excluir rascunho
                            </Button>
                          </div>
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
        aberto={prep !== null && !espelhoAberto}
        onFechar={() => {
          setPrep(null)
          setPrepDraft(null)
          setMensagemRascunho(null)
        }}
        preparacao={prep}
        configuracao={configuracao}
        onSalvarRascunho={salvarRascunhoAtual}
        salvandoRascunho={salvandoRascunho}
        mensagemRascunho={mensagemRascunho}
        jaTemRascunho={jaTemRascunhoAberto}
        onVerEspelho={abrirEspelhoAtual}
      />

      <EspelhoFiscalConferencia
        aberto={espelhoAberto && prep !== null}
        onFechar={fecharEspelho}
        preparacao={prep}
        configuracao={configuracao}
        cliente={
          prep?.cliente_id
            ? clientes.find((c) => c.id === prep.cliente_id) ?? null
            : null
        }
        pecas={pecas}
        draft={prepDraft}
        onErroImpressao={(msg) => toast.erro(msg)}
      />
    </div>
  )
}
