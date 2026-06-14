import { useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, Clock, Shield, Loader2 } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useLembretes } from '@/context/LembretesContext'
import { PageHeader } from '@/components/layout/PageHeader'
import { BuscaInput } from '@/components/shared/BuscaInput'
import { MoneyInput } from '@/components/shared/MoneyInput'
import { RecursoPlanoGate } from '@/components/plano/RecursoPlanoGate'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
import { useCraft, useOficinaData } from '@/context/CraftContext'
import { useConfirmacao } from '@/context/ConfirmacaoContext'
import { useToast } from '@/context/ToastContext'
import { useSalvarAcao } from '@/hooks/useSalvarAcao'
import {
  podeGerenciarCatalogoServicos,
  podeEditarValorPadraoCatalogoServicos,
} from '@/services/auth/permissions'
import { cn, formatarMoeda, gerarId } from '@/lib/utils'
import type { ServicoCatalogo, ServicoCatalogoInput } from '@/types'
import {
  CATEGORIAS_SERVICO_CATALOGO,
  getLabelCategoriaServicoCatalogo,
} from '@/types/servico-catalogo'
import { normalizarPecaSugeridaServico } from '@/services/servico-catalogo.service'
import { CATEGORIAS_PECA, getLabelCategoriaPeca } from '@/types/peca'
import {
  UNIDADES_PECA_OS,
  formatQuantidadeComUnidade,
  parseQuantidadeDecimal,
  type UnidadePecaOS,
} from '@/types/unidade-peca'
import type { PecaSugeridaServico } from '@/types/servico-catalogo'

type FormServico = ServicoCatalogoInput

const formVazio: FormServico = {
  nome: '',
  categoria: 'outros',
  descricao: '',
  valor_mao_obra: 0,
  tempo_estimado_minutos: undefined,
  garantia_dias: undefined,
  observacoes_internas: '',
  ativo: true,
  pecas_sugeridas: [],
  lembrete: undefined,
}

function formatarTempo(minutos?: number): string {
  if (!minutos) return '—'
  if (minutos < 60) return `${minutos} min`
  const h = Math.floor(minutos / 60)
  const m = minutos % 60
  return m ? `${h}h ${m}min` : `${h}h`
}

export function CatalogoServicosPage() {
  const { session } = useAuth()
  const { adicionarServicoCatalogo, atualizarServicoCatalogo, excluirServicoCatalogo } = useCraft()
  const { servicosCatalogo, pecas } = useOficinaData()
  const { regras } = useLembretes()
  const papel = session?.user.papel ?? 'recepcao'
  const podeGerenciar = podeGerenciarCatalogoServicos(papel)
  const podeEditarValor = podeEditarValorPadraoCatalogoServicos(papel)
  const { confirmar } = useConfirmacao()
  const { toast } = useToast()
  const { executar, salvando } = useSalvarAcao()

  const [busca, setBusca] = useState('')
  const [dialogAberto, setDialogAberto] = useState(false)
  const [editando, setEditando] = useState<ServicoCatalogo | null>(null)
  const [form, setForm] = useState<FormServico>(formVazio)
  const [novaSugestao, setNovaSugestao] = useState({
    descricao: '',
    quantidade: '1',
    unidade: 'unidade' as UnidadePecaOS,
    categoria_peca: '' as string,
    peca_referencia_id: '',
  })

  const regrasAtivas = useMemo(() => regras.filter((r) => r.ativo), [regras])

  const servicosFiltrados = servicosCatalogo.filter(
    (s) =>
      s.nome.toLowerCase().includes(busca.toLowerCase()) ||
      getLabelCategoriaServicoCatalogo(s.categoria).toLowerCase().includes(busca.toLowerCase())
  )

  function abrirNova() {
    if (!podeGerenciar) return
    setEditando(null)
    setForm(formVazio)
    setDialogAberto(true)
  }

  function abrirEditar(servico: ServicoCatalogo) {
    if (!podeGerenciar) return
    setEditando(servico)
    setForm({
      nome: servico.nome,
      categoria: servico.categoria,
      descricao: servico.descricao ?? '',
      valor_mao_obra: servico.valor_mao_obra,
      tempo_estimado_minutos: servico.tempo_estimado_minutos,
      garantia_dias: servico.garantia_dias,
      observacoes_internas: servico.observacoes_internas ?? '',
      ativo: servico.ativo,
      pecas_sugeridas: [...servico.pecas_sugeridas],
      lembrete: servico.lembrete ? { ...servico.lembrete } : undefined,
    })
    setDialogAberto(true)
  }

  function salvar() {
    if (!podeGerenciar) return
    void executar({
      validar: () => (!form.nome.trim() ? 'Informe o nome do serviço.' : null),
      acao: () => {
        if (editando) {
          atualizarServicoCatalogo(editando.id, form)
        } else {
          adicionarServicoCatalogo(form)
        }
      },
      sucesso: 'Serviço salvo com sucesso.',
      onSuccess: () => setDialogAberto(false),
    })
  }

  async function confirmarExclusao(servico: ServicoCatalogo) {
    if (!podeGerenciar) return
    const ok = await confirmar({
      titulo: 'Excluir serviço',
      mensagem: `Tem certeza que deseja excluir o serviço "${servico.nome}"?`,
      confirmarTexto: 'Excluir',
      destrutivo: true,
    })
    if (ok) {
      excluirServicoCatalogo(servico.id)
      toast.sucesso('Serviço excluído com sucesso.')
    }
  }

  function alternarAtivo(servico: ServicoCatalogo) {
    if (!podeGerenciar) return
    atualizarServicoCatalogo(servico.id, { ativo: !servico.ativo })
  }

  function adicionarPecaSugerida() {
    if (!novaSugestao.descricao.trim()) return
    const item = normalizarPecaSugeridaServico(
      {
        id: gerarId(),
        descricao: novaSugestao.descricao.trim(),
        quantidade: parseQuantidadeDecimal(novaSugestao.quantidade),
        unidade: novaSugestao.unidade,
        categoria_peca:
          novaSugestao.categoria_peca && novaSugestao.categoria_peca !== 'none'
            ? (novaSugestao.categoria_peca as PecaSugeridaServico['categoria_peca'])
            : undefined,
        peca_referencia_id:
          novaSugestao.peca_referencia_id && novaSugestao.peca_referencia_id !== 'none'
            ? novaSugestao.peca_referencia_id
            : undefined,
      },
      pecas
    )
    setForm({
      ...form,
      pecas_sugeridas: [...form.pecas_sugeridas, item],
    })
    setNovaSugestao({
      descricao: '',
      quantidade: '1',
      unidade: 'unidade',
      categoria_peca: '',
      peca_referencia_id: '',
    })
  }

  function removerPecaSugerida(id: string) {
    setForm({
      ...form,
      pecas_sugeridas: form.pecas_sugeridas.filter((p) => p.id !== id),
    })
  }

  return (
    <RecursoPlanoGate recurso="catalogo_servicos" pagina>
      <div>
        <PageHeader
          titulo="Catálogo de Serviços"
          descricao="Cadastre serviços padrão para agilizar ordens de serviço"
          acoes={
            podeGerenciar ? (
              <Button onClick={abrirNova}>
                <Plus className="h-4 w-4" />
                Novo serviço
              </Button>
            ) : undefined
          }
        />

        <Card>
          <CardContent className="pt-6">
            <BuscaInput
              valor={busca}
              onChange={setBusca}
              placeholder="Buscar por nome ou categoria..."
              className="mb-4 max-w-sm"
            />

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Serviço</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead className="text-right">Mão de obra</TableHead>
                  <TableHead>Tempo</TableHead>
                  <TableHead>Garantia</TableHead>
                  <TableHead>Peças</TableHead>
                  <TableHead>Status</TableHead>
                  {podeGerenciar && <TableHead className="text-right">Ações</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {servicosFiltrados.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={podeGerenciar ? 8 : 7}
                      className="text-center text-muted-foreground"
                    >
                      Nenhum serviço encontrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  servicosFiltrados.map((servico) => (
                    <TableRow key={servico.id} className={cn(!servico.ativo && 'opacity-60')}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{servico.nome}</p>
                          {servico.descricao && (
                            <p className="text-xs text-muted-foreground line-clamp-1">
                              {servico.descricao}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {getLabelCategoriaServicoCatalogo(servico.categoria)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {formatarMoeda(servico.valor_mao_obra)}
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1 text-sm">
                          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                          {formatarTempo(servico.tempo_estimado_minutos)}
                        </span>
                      </TableCell>
                      <TableCell>
                        {servico.garantia_dias ? (
                          <span className="inline-flex items-center gap-1 text-sm">
                            <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                            {servico.garantia_dias} dias
                          </span>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell>{servico.pecas_sugeridas.length}</TableCell>
                      <TableCell>
                        <Badge variant={servico.ativo ? 'default' : 'secondary'}>
                          {servico.ativo ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </TableCell>
                      {podeGerenciar && (
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => alternarAtivo(servico)}
                              title={servico.ativo ? 'Inativar' : 'Ativar'}
                            >
                              {servico.ativo ? 'Inativar' : 'Ativar'}
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => abrirEditar(servico)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => confirmarExclusao(servico)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>{editando ? 'Editar serviço' : 'Novo serviço'}</DialogTitle>
            </DialogHeader>

            <div className="grid gap-4 py-2">
              <div className="grid gap-2">
                <Label htmlFor="nome">Nome do serviço *</Label>
                <Input
                  id="nome"
                  value={form.nome}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                />
              </div>

              <div className="grid gap-2">
                <Label>Categoria</Label>
                <Select
                  value={form.categoria}
                  onValueChange={(v) =>
                    setForm({ ...form, categoria: v as FormServico['categoria'] })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIAS_SERVICO_CATALOGO.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="descricao">Descrição</Label>
                <Textarea
                  id="descricao"
                  value={form.descricao ?? ''}
                  onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                  rows={2}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="valor">Valor padrão de mão de obra</Label>
                  <MoneyInput
                    id="valor"
                    value={form.valor_mao_obra}
                    disabled={!podeEditarValor}
                    onChange={(valor_mao_obra) => setForm({ ...form, valor_mao_obra })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="tempo">Tempo estimado (minutos)</Label>
                  <Input
                    id="tempo"
                    inputMode="numeric"
                    value={form.tempo_estimado_minutos ?? ''}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, '')
                      setForm({
                        ...form,
                        tempo_estimado_minutos: v ? parseInt(v, 10) : undefined,
                      })
                    }}
                    placeholder="Ex: 30"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="garantia">Garantia padrão (dias)</Label>
                  <Input
                    id="garantia"
                    inputMode="numeric"
                    value={form.garantia_dias ?? ''}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, '')
                      setForm({
                        ...form,
                        garantia_dias: v ? parseInt(v, 10) : undefined,
                      })
                    }}
                    placeholder="Ex: 30"
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Status</Label>
                  <Select
                    value={form.ativo ? 'ativo' : 'inativo'}
                    onValueChange={(v) => setForm({ ...form, ativo: v === 'ativo' })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ativo">Ativo</SelectItem>
                      <SelectItem value="inativo">Inativo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="obs">Observações internas</Label>
                <Textarea
                  id="obs"
                  value={form.observacoes_internas ?? ''}
                  onChange={(e) => setForm({ ...form, observacoes_internas: e.target.value })}
                  rows={2}
                />
              </div>

              <div className="rounded-lg border border-border p-3 space-y-3">
                <div>
                  <Label>Peças sugeridas (modelo)</Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Sugestões genéricas para lembrar a oficina na OS — ex.: &quot;Óleo de motor&quot;,
                    &quot;Filtro de óleo&quot;. Na ordem de serviço, o usuário escolhe a peça real do
                    estoque.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-2 sm:col-span-2">
                    <Label>Descrição da sugestão *</Label>
                    <Input
                      value={novaSugestao.descricao}
                      onChange={(e) =>
                        setNovaSugestao({ ...novaSugestao, descricao: e.target.value })
                      }
                      placeholder="Ex.: Óleo de motor, Filtro de óleo..."
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Quantidade sugerida</Label>
                    <Input
                      inputMode="decimal"
                      value={novaSugestao.quantidade}
                      onChange={(e) =>
                        setNovaSugestao({ ...novaSugestao, quantidade: e.target.value })
                      }
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Unidade</Label>
                    <Select
                      value={novaSugestao.unidade}
                      onValueChange={(v) =>
                        setNovaSugestao({ ...novaSugestao, unidade: v as UnidadePecaOS })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {UNIDADES_PECA_OS.map((u) => (
                          <SelectItem key={u.value} value={u.value}>
                            {u.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>Categoria no estoque (filtro na OS)</Label>
                    <Select
                      value={novaSugestao.categoria_peca || 'none'}
                      onValueChange={(v) =>
                        setNovaSugestao({ ...novaSugestao, categoria_peca: v })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Opcional" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Qualquer categoria</SelectItem>
                        {CATEGORIAS_PECA.map((c) => (
                          <SelectItem key={c.value} value={c.value}>
                            {c.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>Peça de referência (opcional)</Label>
                    <Select
                      value={novaSugestao.peca_referencia_id || 'none'}
                      onValueChange={(v) =>
                        setNovaSugestao({ ...novaSugestao, peca_referencia_id: v })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Exemplo do estoque" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nenhuma</SelectItem>
                        {pecas.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button type="button" variant="secondary" onClick={adicionarPecaSugerida}>
                  Adicionar sugestão
                </Button>
                {form.pecas_sugeridas.length > 0 && (
                  <div className="space-y-1">
                    {form.pecas_sugeridas.map((ps) => (
                      <div
                        key={ps.id}
                        className="flex items-center justify-between text-sm rounded-md bg-muted/40 px-2 py-1"
                      >
                        <span>
                          {ps.descricao} —{' '}
                          {formatQuantidadeComUnidade(ps.quantidade, ps.unidade)}
                          {ps.categoria_peca
                            ? ` · ${getLabelCategoriaPeca(ps.categoria_peca)}`
                            : ''}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removerPecaSugerida(ps.id)}
                        >
                          Remover
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-border p-3 space-y-3">
                <Label>Lembrete de retorno (opcional)</Label>
                <Select
                  value={form.lembrete?.ativo ? 'sim' : 'nao'}
                  onValueChange={(v) => {
                    if (v === 'nao') {
                      setForm({ ...form, lembrete: undefined })
                    } else {
                      setForm({
                        ...form,
                        lembrete: form.lembrete ?? { ativo: true, prazo_dias: 90 },
                      })
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Vincular lembrete?" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nao">Sem lembrete</SelectItem>
                    <SelectItem value="sim">Com lembrete</SelectItem>
                  </SelectContent>
                </Select>

                {form.lembrete?.ativo && (
                  <div className="grid gap-3">
                    <div className="grid gap-2">
                      <Label>Regra existente (opcional)</Label>
                      <Select
                        value={form.lembrete.regra_id ?? 'personalizado'}
                        onValueChange={(v) =>
                          setForm({
                            ...form,
                            lembrete: {
                              ...form.lembrete!,
                              regra_id: v === 'personalizado' ? undefined : v,
                            },
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Regra personalizada" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="personalizado">Personalizado neste serviço</SelectItem>
                          {regrasAtivas.map((r) => (
                            <SelectItem key={r.id} value={r.id}>
                              {r.nome_regra}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {!form.lembrete.regra_id && (
                      <>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="grid gap-2">
                            <Label>Prazo (dias)</Label>
                            <Input
                              inputMode="numeric"
                              value={form.lembrete.prazo_dias ?? ''}
                              onChange={(e) => {
                                const v = e.target.value.replace(/\D/g, '')
                                setForm({
                                  ...form,
                                  lembrete: {
                                    ...form.lembrete!,
                                    prazo_dias: v ? parseInt(v, 10) : undefined,
                                  },
                                })
                              }}
                            />
                          </div>
                          <div className="grid gap-2">
                            <Label>KM retorno</Label>
                            <Input
                              inputMode="numeric"
                              value={form.lembrete.km_retorno ?? ''}
                              onChange={(e) => {
                                const v = e.target.value.replace(/\D/g, '')
                                setForm({
                                  ...form,
                                  lembrete: {
                                    ...form.lembrete!,
                                    km_retorno: v ? parseInt(v, 10) : undefined,
                                  },
                                })
                              }}
                            />
                          </div>
                        </div>
                        <div className="grid gap-2">
                          <Label>Mensagem padrão</Label>
                          <Textarea
                            value={form.lembrete.mensagem_padrao ?? ''}
                            onChange={(e) =>
                              setForm({
                                ...form,
                                lembrete: {
                                  ...form.lembrete!,
                                  mensagem_padrao: e.target.value,
                                },
                              })
                            }
                            rows={2}
                          />
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setDialogAberto(false)}>
                  Cancelar
                </Button>
                <Button onClick={salvar} disabled={!form.nome.trim() || salvando}>
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
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </RecursoPlanoGate>
  )
}
