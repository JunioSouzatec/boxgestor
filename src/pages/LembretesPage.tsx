import { useMemo, useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, Pencil, Trash2, Loader2, Copy, CheckCircle2 } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { RecursoPlanoGate } from '@/components/plano/RecursoPlanoGate'
import { BotaoWhatsAppLembrete } from '@/components/lembretes/BotaoWhatsAppLembrete'
import { EditarLembreteDialog } from '@/components/lembretes/EditarLembreteDialog'
import { HistoricoComunicacaoLista } from '@/components/lembretes/HistoricoComunicacaoLista'
import { LembretesSyncStatus } from '@/components/lembretes/LembretesSyncStatus'
import { RegistrarContatoLembreteDialog } from '@/components/lembretes/RegistrarContatoLembreteDialog'
import { obterResponsavelExibicaoLembrete } from '@/services/lembretes/lembretes-responsavel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { BuscaInput } from '@/components/shared/BuscaInput'
import { useLembretes } from '@/context/LembretesContext'
import { useLembretesAutoRefresh } from '@/hooks/useLembretesAutoRefresh'
import { useConfirmacao } from '@/context/ConfirmacaoContext'
import { useToast } from '@/context/ToastContext'
import { useSalvarAcao } from '@/hooks/useSalvarAcao'
import { useOficinaData } from '@/context/CraftContext'
import { formatarData, formatarTelefone } from '@/lib/utils'
import type { CategoriaRegraLembrete, LembreteComStatus, RegraLembreteInput } from '@/types/lembrete'
import type { FiltroListaLembrete } from '@/types/lembrete'
import {
  CATEGORIAS_REGRA,
  getLabelCategoriaRegra,
  getLabelStatusLembrete,
  lembreteStatusEncerrado,
  obterLabelUltimaAcao,
} from '@/types/lembrete'
import { cn } from '@/lib/utils'

const STATUS_VARIANT: Record<string, string> = {
  pendente: 'border-border text-muted-foreground',
  para_hoje: 'border-amber-500/40 text-amber-400',
  vencido: 'border-destructive/40 text-destructive',
  enviado: 'border-sky-500/40 text-sky-400',
  concluido: 'border-emerald-500/40 text-emerald-400',
  cancelado: 'border-border text-muted-foreground line-through',
  falha_envio: 'border-destructive/40 text-destructive',
}

const FILTROS_LISTA: { value: FiltroListaLembrete; label: string }[] = [
  { value: 'pendentes', label: 'Pendentes' },
  { value: 'para_hoje', label: 'Para hoje' },
  { value: 'vencidos', label: 'Vencidos' },
  { value: 'enviados', label: 'Enviados' },
  { value: 'concluidos', label: 'Concluídos' },
  { value: 'cancelados', label: 'Cancelados' },
  { value: 'todos', label: 'Todos' },
]

function lembretePassaFiltro(status: LembreteComStatus['status'], filtro: FiltroListaLembrete): boolean {
  switch (filtro) {
    case 'pendentes':
      return status === 'pendente'
    case 'para_hoje':
      return status === 'para_hoje'
    case 'vencidos':
      return status === 'vencido'
    case 'enviados':
      return status === 'enviado'
    case 'concluidos':
      return status === 'concluido'
    case 'cancelados':
      return status === 'cancelado'
    case 'todos':
      return true
    default:
      return true
  }
}

type FormRegra = RegraLembreteInput

const formRegraVazio: FormRegra = {
  nome_regra: '',
  servico_relacionado: '',
  categoria: 'geral',
  prazo_dias: 90,
  prazo_meses: 0,
  km_retorno: undefined,
  mensagem_padrao: '',
  observacoes_internas: '',
  ativo: true,
}

function formatarPrazoRegra(regra: { prazo_dias: number; prazo_meses: number }): string {
  const partes: string[] = []
  if (regra.prazo_dias > 0) partes.push(`${regra.prazo_dias} dias`)
  if (regra.prazo_meses > 0) partes.push(`${regra.prazo_meses} meses`)
  return partes.length > 0 ? partes.join(' + ') : '—'
}

function LembretesConteudo() {
  const { lembretes, regras, salvarRegra, excluirRegra, historicoComunicacao, recarregar, sincronizarAgora, atualizarLembrete } =
    useLembretes()
  useLembretesAutoRefresh(recarregar, sincronizarAgora)
  const { clientes, motos } = useOficinaData()
  const { confirmar } = useConfirmacao()
  const { toast } = useToast()
  const { executar, salvando } = useSalvarAcao()

  const [busca, setBusca] = useState('')
  const [filtroLista, setFiltroLista] = useState<FiltroListaLembrete>('todos')
  const [dialogRegra, setDialogRegra] = useState(false)
  const [editandoRegraId, setEditandoRegraId] = useState<string | null>(null)
  const [formRegra, setFormRegra] = useState<FormRegra>(formRegraVazio)
  const [lembreteEditando, setLembreteEditando] = useState<LembreteComStatus | null>(null)
  const [lembreteRegistrar, setLembreteRegistrar] = useState<LembreteComStatus | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()

  useEffect(() => {
    const filtroParam = searchParams.get('filtro') as FiltroListaLembrete | null
    if (filtroParam && FILTROS_LISTA.some((f) => f.value === filtroParam)) {
      setFiltroLista(filtroParam)
      setSearchParams({}, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- abre uma vez via query string
  }, [searchParams.get('filtro')])

  const getCliente = (id: string) => clientes.find((c) => c.id === id)
  const getMoto = (id: string) => motos.find((m) => m.id === id)

  const lembretesFiltrados = useMemo(() => {
    const termo = busca.toLowerCase()
    return lembretes.filter((l) => {
      if (!lembretePassaFiltro(l.status, filtroLista)) return false
      const cliente = getCliente(l.cliente_id)
      const moto = getMoto(l.moto_id)
      const texto = [
        cliente?.nome,
        cliente?.telefone,
        moto?.placa,
        moto?.marca,
        moto?.modelo,
        l.servico,
        l.observacoes,
        obterLabelUltimaAcao(l),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return !termo || texto.includes(termo)
    })
  }, [lembretes, busca, filtroLista, clientes, motos])

  async function copiarMensagemLembrete(lembrete: LembreteComStatus) {
    try {
      await navigator.clipboard.writeText(lembrete.mensagem)
      toast.sucesso('Mensagem copiada.')
    } catch {
      toast.erro('Não foi possível copiar a mensagem.')
    }
  }

  async function concluirLembrete(lembrete: LembreteComStatus) {
    const ok = await confirmar({
      titulo: 'Concluir lembrete',
      mensagem: 'Marcar este lembrete como concluído?',
      confirmarTexto: 'Concluir',
    })
    if (!ok) return
    atualizarLembrete(lembrete.id, { status: 'concluido' })
    toast.sucesso('Lembrete concluído.')
  }

  function abrirNovaRegra() {
    setEditandoRegraId(null)
    setFormRegra({
      ...formRegraVazio,
      mensagem_padrao:
        'Olá {{nome_cliente}}! Lembrete de {{servico}} para sua moto {{moto}} (placa {{placa}}). Previsão: {{data_prevista}} ou {{km_prevista}}. {{nome_oficina}}',
    })
    setDialogRegra(true)
  }

  function abrirEditarRegra(id: string) {
    const regra = regras.find((r) => r.id === id)
    if (!regra) return
    setEditandoRegraId(id)
    setFormRegra({
      nome_regra: regra.nome_regra,
      servico_relacionado: regra.servico_relacionado,
      categoria: regra.categoria as CategoriaRegraLembrete,
      prazo_dias: regra.prazo_dias,
      prazo_meses: regra.prazo_meses,
      km_retorno: regra.km_retorno,
      mensagem_padrao: regra.mensagem_padrao,
      observacoes_internas: regra.observacoes_internas ?? '',
      ativo: regra.ativo,
    })
    setDialogRegra(true)
  }

  async function excluirRegraConfirmada(regraId: string) {
    const ok = await confirmar({
      titulo: 'Excluir regra',
      mensagem: 'Tem certeza que deseja excluir esta regra?',
      confirmarTexto: 'Excluir',
      destrutivo: true,
    })
    if (ok) {
      excluirRegra(regraId)
      toast.sucesso('Regra excluída com sucesso.')
    }
  }

  function salvarRegraForm() {
    void executar({
      validar: () => {
        if (
          !formRegra.nome_regra.trim() ||
          !formRegra.servico_relacionado.trim() ||
          !formRegra.mensagem_padrao.trim()
        ) {
          return 'Preencha nome, serviço e mensagem da regra.'
        }
        return null
      },
      acao: () => {
        salvarRegra(
          {
            ...formRegra,
            nome_regra: formRegra.nome_regra.trim(),
            servico_relacionado: formRegra.servico_relacionado.trim(),
            observacoes_internas: formRegra.observacoes_internas?.trim() || undefined,
          },
          editandoRegraId ?? undefined
        )
      },
      sucesso: editandoRegraId ? 'Regra salva com sucesso.' : 'Regra criada com sucesso.',
      onSuccess: () => setDialogRegra(false),
    })
  }

  return (
    <div>
      <PageHeader
        titulo="Lembretes"
        descricao="Lembretes editáveis de revisão e retorno — prazos ajustáveis por serviço, peça e moto"
      />

      <LembretesSyncStatus className="mb-4" />

      <Tabs defaultValue="lista" className="mt-2">
        <TabsList>
          <TabsTrigger value="lista">Lista</TabsTrigger>
          <TabsTrigger value="regras">Regras de Retorno</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="lista" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Lembretes programados</CardTitle>
              <CardDescription>
                Edite datas, quilometragem e mensagens conforme a orientação da oficina
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-4 flex flex-wrap gap-3">
                <BuscaInput
                  valor={busca}
                  onChange={setBusca}
                  placeholder="Buscar cliente, telefone, placa ou serviço..."
                  className="max-w-xs"
                />
              </div>

              <div className="mb-4 flex flex-wrap gap-2">
                {FILTROS_LISTA.map((f) => (
                  <Button
                    key={f.value}
                    type="button"
                    size="sm"
                    variant={filtroLista === f.value ? 'default' : 'outline'}
                    onClick={() => setFiltroLista(f.value)}
                  >
                    {f.label}
                  </Button>
                ))}
              </div>

              <div className="overflow-x-auto rounded-lg border border-border hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Moto</TableHead>
                      <TableHead>Telefone</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Data prevista</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Última ação</TableHead>
                      <TableHead>Responsável</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lembretesFiltrados.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                          Nenhum lembrete encontrado. Finalize uma OS para criar lembretes.
                        </TableCell>
                      </TableRow>
                    ) : (
                      lembretesFiltrados.map((l) => {
                        const cliente = getCliente(l.cliente_id)
                        const moto = getMoto(l.moto_id)
                        return (
                          <TableRow key={l.id}>
                            <TableCell className="font-medium">{cliente?.nome ?? '—'}</TableCell>
                            <TableCell>
                              {moto ? `${moto.marca} ${moto.modelo}` : '—'}
                              {moto?.placa && (
                                <span className="block text-xs text-muted-foreground">{moto.placa}</span>
                              )}
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              {cliente?.telefone ? formatarTelefone(cliente.telefone) : '—'}
                            </TableCell>
                            <TableCell>
                              <div>
                                {l.servico}
                                {l.personalizado && (
                                  <Badge variant="outline" className="ml-2 text-xs">
                                    Personalizado
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              {formatarData(l.data_prevista)}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={cn(STATUS_VARIANT[l.status])}>
                                {getLabelStatusLembrete(l.status)}
                              </Badge>
                            </TableCell>
                            <TableCell className="max-w-[140px] truncate text-sm text-muted-foreground">
                              {obterLabelUltimaAcao(l)}
                            </TableCell>
                            <TableCell className="text-sm">
                              {obterResponsavelExibicaoLembrete(l)}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 px-2 text-xs"
                                  onClick={() => setLembreteRegistrar(l)}
                                >
                                  Registrar contato
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  title="Editar lembrete"
                                  onClick={() => setLembreteEditando(l)}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                {cliente && moto && (
                                  <BotaoWhatsAppLembrete
                                    lembrete={l}
                                    cliente={cliente}
                                    moto={moto}
                                    variant="icon"
                                  />
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )
                      })
                    )}
                  </TableBody>
                </Table>
              </div>

              <div className="md:hidden space-y-3">
                {lembretesFiltrados.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Nenhum lembrete encontrado. Finalize uma OS para criar lembretes.
                  </p>
                ) : (
                  lembretesFiltrados.map((l) => {
                    const cliente = getCliente(l.cliente_id)
                    const moto = getMoto(l.moto_id)
                    return (
                      <Card key={l.id}>
                        <CardContent className="p-4 space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-semibold">{cliente?.nome ?? '—'}</p>
                              <p className="text-sm text-muted-foreground">
                                {moto ? `${moto.marca} ${moto.modelo}` : '—'}
                                {moto?.placa ? ` · ${moto.placa}` : ''}
                              </p>
                            </div>
                            <Badge variant="outline" className={cn(STATUS_VARIANT[l.status])}>
                              {getLabelStatusLembrete(l.status)}
                            </Badge>
                          </div>
                          <div className="text-sm space-y-1">
                            <p>
                              <span className="text-muted-foreground">Serviço:</span> {l.servico}
                            </p>
                            <p>
                              <span className="text-muted-foreground">Data:</span>{' '}
                              {formatarData(l.data_prevista)}
                            </p>
                            <p>
                              <span className="text-muted-foreground">Responsável:</span>{' '}
                              {obterResponsavelExibicaoLembrete(l)}
                            </p>
                            <p className="text-muted-foreground">{obterLabelUltimaAcao(l)}</p>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="lg"
                              className="h-11"
                              onClick={() => void copiarMensagemLembrete(l)}
                            >
                              <Copy className="mr-2 h-4 w-4" />
                              Copiar
                            </Button>
                            {cliente && moto && (
                              <BotaoWhatsAppLembrete
                                lembrete={l}
                                cliente={cliente}
                                moto={moto}
                                variant="sm"
                                className="h-11 w-full"
                              />
                            )}
                            <Button
                              type="button"
                              variant="outline"
                              size="lg"
                              className="h-11"
                              onClick={() => setLembreteRegistrar(l)}
                            >
                              Registrar contato
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="lg"
                              className="h-11"
                              onClick={() => setLembreteEditando(l)}
                            >
                              Remarcar
                            </Button>
                            {!lembreteStatusEncerrado(l.status) && (
                              <Button
                                type="button"
                                variant="outline"
                                size="lg"
                                className="col-span-2 h-11 text-emerald-400"
                                onClick={() => void concluirLembrete(l)}
                              >
                                <CheckCircle2 className="mr-2 h-4 w-4" />
                                Concluir
                              </Button>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="regras" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base">Regras de Retorno</CardTitle>
                <CardDescription>
                  Configure prazos, quilometragem e mensagens — totalmente editáveis
                </CardDescription>
              </div>
              <Button onClick={abrirNovaRegra} size="sm" className="gap-2">
                <Plus className="h-4 w-4" />
                Nova regra
              </Button>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Regra</TableHead>
                      <TableHead>Serviço</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead>Prazo</TableHead>
                      <TableHead>Km retorno</TableHead>
                      <TableHead>Ativo</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {regras.map((regra) => (
                      <TableRow key={regra.id}>
                        <TableCell className="font-medium">{regra.nome_regra}</TableCell>
                        <TableCell>{regra.servico_relacionado}</TableCell>
                        <TableCell>{getLabelCategoriaRegra(regra.categoria)}</TableCell>
                        <TableCell>{formatarPrazoRegra(regra)}</TableCell>
                        <TableCell>
                          {regra.km_retorno
                            ? `+${regra.km_retorno.toLocaleString('pt-BR')} km`
                            : '—'}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              regra.ativo
                                ? 'border-emerald-500/40 text-emerald-400'
                                : 'text-muted-foreground'
                            }
                          >
                            {regra.ativo ? 'Ativo' : 'Inativo'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => abrirEditarRegra(regra.id)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => void excluirRegraConfirmada(regra.id)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="historico" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Histórico de comunicação</CardTitle>
              <CardDescription>
                Todos os contatos registrados — lembretes nunca são apagados, apenas mudam de status
              </CardDescription>
            </CardHeader>
            <CardContent>
              <HistoricoComunicacaoLista
                itens={historicoComunicacao}
                clientes={clientes}
                motos={motos}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={dialogRegra} onOpenChange={setDialogRegra}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editandoRegraId ? 'Editar regra' : 'Nova regra'}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-1">
                <Label>Nome da regra</Label>
                <Input
                  value={formRegra.nome_regra}
                  onChange={(e) => setFormRegra({ ...formRegra, nome_regra: e.target.value })}
                  placeholder="Ex.: Troca de óleo semestral"
                />
              </div>
              <div className="grid gap-1">
                <Label>Serviço relacionado</Label>
                <Input
                  value={formRegra.servico_relacionado}
                  onChange={(e) =>
                    setFormRegra({ ...formRegra, servico_relacionado: e.target.value })
                  }
                  placeholder="Ex.: Troca de óleo"
                />
              </div>
            </div>

            <div className="grid gap-1">
              <Label>Categoria</Label>
              <Select
                value={formRegra.categoria}
                onValueChange={(v) =>
                  setFormRegra({ ...formRegra, categoria: v as CategoriaRegraLembrete })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIAS_REGRA.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-1">
                <Label>Prazo (dias)</Label>
                <Input
                  type="number"
                  min={0}
                  value={formRegra.prazo_dias}
                  onChange={(e) =>
                    setFormRegra({ ...formRegra, prazo_dias: Number(e.target.value) || 0 })
                  }
                />
              </div>
              <div className="grid gap-1">
                <Label>Prazo (meses)</Label>
                <Input
                  type="number"
                  min={0}
                  value={formRegra.prazo_meses}
                  onChange={(e) =>
                    setFormRegra({ ...formRegra, prazo_meses: Number(e.target.value) || 0 })
                  }
                />
              </div>
              <div className="grid gap-1">
                <Label>Km retorno</Label>
                <Input
                  type="number"
                  min={0}
                  value={formRegra.km_retorno ?? ''}
                  onChange={(e) =>
                    setFormRegra({
                      ...formRegra,
                      km_retorno: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                  placeholder="Ex.: 3000"
                />
              </div>
            </div>

            <div className="grid gap-1">
              <Label>Mensagem padrão WhatsApp</Label>
              <Textarea
                value={formRegra.mensagem_padrao}
                onChange={(e) => setFormRegra({ ...formRegra, mensagem_padrao: e.target.value })}
                rows={4}
                placeholder="Variáveis: {{nome_cliente}}, {{moto}}, {{placa}}, {{servico}}, {{data_prevista}}, {{km_prevista}}, {{nome_oficina}}"
              />
            </div>

            <div className="grid gap-1">
              <Label>Observações internas</Label>
              <Textarea
                value={formRegra.observacoes_internas ?? ''}
                onChange={(e) =>
                  setFormRegra({ ...formRegra, observacoes_internas: e.target.value })
                }
                rows={2}
                placeholder="Ex.: Ajustar conforme desgaste na OS"
              />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={formRegra.ativo}
                onChange={(e) => setFormRegra({ ...formRegra, ativo: e.target.checked })}
                className="h-4 w-4 rounded accent-primary"
              />
              Regra ativa
            </label>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDialogRegra(false)}>
              Cancelar
            </Button>
            <Button onClick={salvarRegraForm} disabled={salvando}>
              {salvando ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Salvando…
                </>
              ) : (
                'Salvar'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <EditarLembreteDialog
        lembrete={lembreteEditando}
        aberto={lembreteEditando !== null}
        onFechar={() => setLembreteEditando(null)}
      />

      <RegistrarContatoLembreteDialog
        lembrete={lembreteRegistrar}
        aberto={lembreteRegistrar !== null}
        onFechar={() => setLembreteRegistrar(null)}
      />
    </div>
  )
}

export function LembretesPage() {
  return (
    <RecursoPlanoGate recurso="lembretes" pagina>
      <LembretesConteudo />
    </RecursoPlanoGate>
  )
}
