import { useState } from 'react'
import { AlertTriangle, Package, Plus, Trash2 } from 'lucide-react'
import { MoneyInput } from '@/components/shared/MoneyInput'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  criarPecaUtilizadaDeEstoque,
  criarPecaUtilizadaManual,
  atualizarPecaUtilizadaNaLista,
  removerPecaUtilizadaDaLista,
  sincronizarValorPecasForm,
  verificarEstoqueInsuficiente,
  validarAdicaoPecaEstoque,
  inferirUnidadeDaPeca,
  rotuloPecaEstoqueOS,
} from '@/services/os-pecas.service'
import { podeEditarValoresLinhaOS, podeGerenciarLinhasOS } from '@/services/auth/permissions'
import type { PapelUsuario } from '@/types/auth'
import type { OrdemServico, Peca } from '@/types'
import { getLabelCategoriaPeca } from '@/types/peca'
import {
  UNIDADES_PECA_OS,
  getLabelUnidadePeca,
  normalizarUnidadePeca,
  parseQuantidadeDecimalComValidacao,
  type UnidadePecaOS,
} from '@/types/unidade-peca'
import { cn, formatarMoeda } from '@/lib/utils'

type FormOSPecas = Pick<OrdemServico, 'pecas_utilizadas' | 'valor_pecas'>

interface PecasOSUtilizadasSectionProps {
  form: FormOSPecas
  pecasEstoque: Peca[]
  papel: PapelUsuario
  onChange: (patch: Partial<FormOSPecas>) => void
  onAdicionarAoEstoque?: (peca: {
    nome: string
    codigo: string
    quantidade: number
    preco_venda: number
  }) => void
}

const manualVazio = {
  nome: '',
  codigo: '',
  quantidade: '1',
  unidade: 'unidade' as UnidadePecaOS,
  valor_unitario: 0,
  observacao: '',
  adicionarEstoque: false,
}

const estoqueVazio = {
  peca_id: '',
  quantidade: '1',
  unidade: 'unidade' as UnidadePecaOS,
  valor_unitario: 0,
  observacao: '',
}

export function PecasOSUtilizadasSection({
  form,
  pecasEstoque,
  papel,
  onChange,
  onAdicionarAoEstoque,
}: PecasOSUtilizadasSectionProps) {
  const podeGerenciar = podeGerenciarLinhasOS(papel)
  const podeEditarValor = podeEditarValoresLinhaOS(papel)
  const [dialogManual, setDialogManual] = useState(false)
  const [dialogEstoque, setDialogEstoque] = useState(false)
  const [manual, setManual] = useState(manualVazio)
  const [estoqueForm, setEstoqueForm] = useState(estoqueVazio)
  const [erroEstoque, setErroEstoque] = useState<string | null>(null)
  const [qtdEdicao, setQtdEdicao] = useState<Record<string, string>>({})

  const pecasAtivas = pecasEstoque.filter((p) => p.ativo !== false)
  const alertasEstoque = verificarEstoqueInsuficiente(form.pecas_utilizadas ?? [], pecasEstoque)

  function aplicar(patch: Partial<FormOSPecas>) {
    onChange(sincronizarValorPecasForm({ ...form, ...patch }))
  }

  function abrirDialogEstoque() {
    setEstoqueForm(estoqueVazio)
    setErroEstoque(null)
    setDialogEstoque(true)
  }

  function selecionarPecaEstoque(pecaId: string) {
    const peca = pecasAtivas.find((p) => p.id === pecaId)
    if (!peca) return
    setEstoqueForm({
      peca_id: pecaId,
      quantidade: peca.categoria === 'oleo' || peca.categoria === 'arrefecimento' ? '1' : '1',
      unidade: inferirUnidadeDaPeca(peca),
      valor_unitario: peca.preco_venda ?? 0,
      observacao: '',
    })
    setErroEstoque(null)
  }

  function confirmarAdicaoEstoque() {
    const validacao = validarAdicaoPecaEstoque(estoqueForm)
    if (!validacao.valido) {
      setErroEstoque(validacao.mensagem ?? 'Verifique os dados da peça.')
      return
    }

    const parse = parseQuantidadeDecimalComValidacao(estoqueForm.quantidade)
    if (parse.valor === null) {
      setErroEstoque(parse.erro ?? 'Informe a quantidade utilizada.')
      return
    }

    const peca = pecasAtivas.find((p) => p.id === estoqueForm.peca_id)
    if (!peca) {
      setErroEstoque('Selecione uma peça do estoque.')
      return
    }

    const unidade = normalizarUnidadePeca(estoqueForm.unidade)
    const nova = criarPecaUtilizadaDeEstoque(peca, parse.valor, {
      unidade,
      valor_unitario: estoqueForm.valor_unitario,
      observacao: estoqueForm.observacao.trim() || undefined,
      pendencia_compra: parse.valor > (peca.quantidade ?? 0),
    })

    aplicar({ pecas_utilizadas: [...(form.pecas_utilizadas ?? []), nova] })
    setDialogEstoque(false)
    setEstoqueForm(estoqueVazio)
    setErroEstoque(null)
  }

  function atualizarLinha(linhaId: string, patch: Parameters<typeof atualizarPecaUtilizadaNaLista>[2]) {
    aplicar({
      pecas_utilizadas: atualizarPecaUtilizadaNaLista(form.pecas_utilizadas ?? [], linhaId, patch),
    })
  }

  function removerLinha(linhaId: string) {
    aplicar({
      pecas_utilizadas: removerPecaUtilizadaDaLista(form.pecas_utilizadas ?? [], linhaId),
    })
  }

  function salvarManual() {
    if (!manual.nome.trim()) return
    const parse = parseQuantidadeDecimalComValidacao(manual.quantidade)
    if (parse.valor === null) return

    const nova = criarPecaUtilizadaManual({
      nome: manual.nome.trim(),
      codigo: manual.codigo.trim() || undefined,
      quantidade: parse.valor,
      unidade: normalizarUnidadePeca(manual.unidade),
      valor_unitario: manual.valor_unitario,
      observacao: manual.observacao.trim() || undefined,
    })
    aplicar({ pecas_utilizadas: [...(form.pecas_utilizadas ?? []), nova] })

    if (manual.adicionarEstoque && onAdicionarAoEstoque) {
      onAdicionarAoEstoque({
        nome: manual.nome.trim(),
        codigo: manual.codigo.trim() || `MAN-${Date.now()}`,
        quantidade: parse.valor,
        preco_venda: manual.valor_unitario,
      })
    }

    setManual(manualVazio)
    setDialogManual(false)
  }

  const itens = form.pecas_utilizadas ?? []
  const pecaSelecionada = pecasAtivas.find((p) => p.id === estoqueForm.peca_id)
  const qtdPreview = parseQuantidadeDecimalComValidacao(estoqueForm.quantidade, true)
  const totalPreview =
    (qtdPreview.valor ?? 0) * (estoqueForm.valor_unitario ?? 0)

  return (
    <div className="space-y-4 rounded-lg border border-border/60 bg-muted/20 p-4">
      <div className="flex items-center gap-2">
        <Package className="h-4 w-4 text-primary" />
        <Label className="text-base font-medium">Peças e produtos utilizados</Label>
      </div>

      {alertasEstoque.length > 0 && (
        <div className="rounded-md border border-amber-500/40 bg-amber-950/20 p-3 text-sm">
          <div className="flex items-center gap-2 font-medium text-amber-200">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Estoque insuficiente
          </div>
          <ul className="mt-2 space-y-1 text-amber-100/90">
            {alertasEstoque.map((a) => (
              <li key={a.peca_id}>
                {a.nome}: necessário {a.necessario}, disponível {a.disponivel}
              </li>
            ))}
          </ul>
        </div>
      )}

      {podeGerenciar && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={abrirDialogEstoque}>
            <Plus className="h-4 w-4" />
            Peça do estoque
          </Button>
          <Button type="button" variant="outline" onClick={() => setDialogManual(true)}>
            Peça manual
          </Button>
        </div>
      )}

      {itens.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma peça ou produto adicionado.</p>
      ) : (
        <div className="space-y-3">
          {itens.map((item) => {
            const linhaId = item.linha_id ?? gerarIdFallback(item)
            const unidade = normalizarUnidadePeca(item.unidade)
            const qtdDisplay =
              qtdEdicao[linhaId] ??
              (Number.isInteger(item.quantidade)
                ? String(item.quantidade)
                : String(item.quantidade).replace('.', ','))
            const total = (item.quantidade ?? 0) * (item.valor_unitario ?? 0)
            const alerta = alertasEstoque.find((a) => a.peca_id === item.peca_id)
            const pecaRef = item.peca_id
              ? pecasEstoque.find((p) => p.id === item.peca_id)
              : undefined

            return (
              <div
                key={linhaId}
                className={cn(
                  'rounded-md border bg-background/60 p-3 space-y-3',
                  alerta ? 'border-amber-500/40' : 'border-border'
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{item.nome}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.manual ? 'Manual' : 'Estoque'}
                      {pecaRef && ` · ${getLabelCategoriaPeca(pecaRef.categoria ?? 'outros')}`}
                      {item.codigo ? ` · Cód. ${item.codigo}` : ''}
                      {!item.manual && item.peca_id && (
                        <> · Disponível: {pecaRef?.quantidade ?? 0}</>
                      )}
                    </p>
                  </div>
                  {podeGerenciar && (
                    <Button variant="ghost" size="sm" onClick={() => removerLinha(linhaId)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                      Remover
                    </Button>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  <div className="grid gap-1">
                    <Label className="text-xs">Quantidade</Label>
                    <Input
                      inputMode="decimal"
                      value={qtdDisplay}
                      disabled={!podeGerenciar}
                      onChange={(e) => {
                        setQtdEdicao((prev) => ({ ...prev, [linhaId]: e.target.value }))
                      }}
                      onBlur={() => {
                        const raw = qtdEdicao[linhaId]
                        if (raw === undefined) return
                        const parse = parseQuantidadeDecimalComValidacao(raw)
                        if (parse.valor !== null) {
                          atualizarLinha(linhaId, { quantidade: parse.valor })
                        }
                        setQtdEdicao((prev) => {
                          const next = { ...prev }
                          delete next[linhaId]
                          return next
                        })
                      }}
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-xs">Unidade</Label>
                    <Select
                      value={unidade}
                      disabled={!podeGerenciar}
                      onValueChange={(v) =>
                        atualizarLinha(linhaId, { unidade: normalizarUnidadePeca(v) })
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
                  <div className="grid gap-1">
                    <Label className="text-xs">Valor unitário</Label>
                    <MoneyInput
                      value={item.valor_unitario ?? 0}
                      disabled={!podeEditarValor}
                      onChange={(v) => atualizarLinha(linhaId, { valor_unitario: v })}
                    />
                  </div>
                  <div className="grid gap-1 lg:col-span-2">
                    <Label className="text-xs">Valor total</Label>
                    <div className="flex h-10 items-center rounded-md border border-border bg-muted/30 px-3 text-sm font-medium">
                      {formatarMoeda(total)}
                    </div>
                  </div>
                </div>

                {(item.observacao || podeGerenciar) && (
                  <div className="grid gap-1">
                    <Label className="text-xs">Observação</Label>
                    <Input
                      value={item.observacao ?? ''}
                      disabled={!podeGerenciar}
                      placeholder="Opcional"
                      onChange={(e) =>
                        atualizarLinha(linhaId, { observacao: e.target.value || undefined })
                      }
                    />
                  </div>
                )}

                {!item.manual && item.peca_id && alerta && podeGerenciar && (
                  <label className="flex items-center gap-2 text-sm text-amber-200/90">
                    <input
                      type="checkbox"
                      checked={item.pendencia_compra ?? false}
                      onChange={(e) =>
                        atualizarLinha(linhaId, { pendencia_compra: e.target.checked })
                      }
                    />
                    Registrar pendência de compra (estoque insuficiente)
                  </label>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div className="flex justify-end border-t border-border/60 pt-3">
        <p className="text-sm">
          <span className="text-muted-foreground">Total peças/produtos: </span>
          <span className="font-semibold">{formatarMoeda(form.valor_pecas)}</span>
        </p>
      </div>

      <Dialog open={dialogEstoque} onOpenChange={setDialogEstoque}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Adicionar peça do estoque</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-1">
            {erroEstoque && (
              <div
                role="alert"
                className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {erroEstoque}
              </div>
            )}

            <div className="grid gap-2">
              <Label>Peça do estoque *</Label>
              <Select
                value={estoqueForm.peca_id || 'none'}
                onValueChange={(v) => v !== 'none' && selecionarPecaEstoque(v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a peça..." />
                </SelectTrigger>
                <SelectContent>
                  {pecasAtivas.length === 0 ? (
                    <SelectItem value="none" disabled>
                      Nenhuma peça ativa no estoque
                    </SelectItem>
                  ) : (
                    pecasAtivas.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {rotuloPecaEstoqueOS(p)} — {formatarMoeda(p.preco_venda)}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            {pecaSelecionada && (
              <div className="rounded-md bg-muted/40 p-3 text-sm space-y-1">
                <p className="font-medium">{pecaSelecionada.nome}</p>
                <p className="text-muted-foreground">
                  Categoria: {getLabelCategoriaPeca(pecaSelecionada.categoria ?? 'outros')}
                </p>
                <p className="text-muted-foreground">
                  Unidade sugerida: {getLabelUnidadePeca(inferirUnidadeDaPeca(pecaSelecionada))}
                </p>
                <p className="text-muted-foreground">
                  Disponível: {pecaSelecionada.quantidade ?? 0} · Preço:{' '}
                  {formatarMoeda(pecaSelecionada.preco_venda)}
                </p>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Quantidade utilizada *</Label>
                <Input
                  inputMode="decimal"
                  value={estoqueForm.quantidade}
                  onChange={(e) =>
                    setEstoqueForm({ ...estoqueForm, quantidade: e.target.value })
                  }
                  placeholder="Ex.: 2,5"
                />
              </div>
              <div className="grid gap-2">
                <Label>Unidade</Label>
                <Select
                  value={normalizarUnidadePeca(estoqueForm.unidade)}
                  onValueChange={(v) =>
                    setEstoqueForm({ ...estoqueForm, unidade: normalizarUnidadePeca(v) })
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
                <Label>Valor unitário</Label>
                <MoneyInput
                  value={estoqueForm.valor_unitario}
                  disabled={!podeEditarValor}
                  onChange={(v) => setEstoqueForm({ ...estoqueForm, valor_unitario: v })}
                />
              </div>
              <div className="grid gap-2">
                <Label>Valor total</Label>
                <div className="flex h-10 items-center rounded-md border border-border bg-muted/30 px-3 text-sm font-medium">
                  {formatarMoeda(totalPreview)}
                </div>
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Observação</Label>
              <Input
                value={estoqueForm.observacao}
                onChange={(e) => setEstoqueForm({ ...estoqueForm, observacao: e.target.value })}
                placeholder="Opcional"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogEstoque(false)}>
                Cancelar
              </Button>
              <Button onClick={confirmarAdicaoEstoque}>Adicionar à OS</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogManual} onOpenChange={setDialogManual}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar peça manualmente</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-2">
              <Label>Nome da peça/produto *</Label>
              <Input
                value={manual.nome}
                onChange={(e) => setManual({ ...manual, nome: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label>Código</Label>
              <Input
                value={manual.codigo}
                onChange={(e) => setManual({ ...manual, codigo: e.target.value })}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Quantidade</Label>
                <Input
                  inputMode="decimal"
                  value={manual.quantidade}
                  onChange={(e) => setManual({ ...manual, quantidade: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label>Unidade</Label>
                <Select
                  value={normalizarUnidadePeca(manual.unidade)}
                  onValueChange={(v) =>
                    setManual({ ...manual, unidade: normalizarUnidadePeca(v) })
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
                <Label>Valor unitário</Label>
                <MoneyInput
                  value={manual.valor_unitario}
                  disabled={!podeEditarValor}
                  onChange={(v) => setManual({ ...manual, valor_unitario: v })}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Observação</Label>
              <Textarea
                rows={2}
                value={manual.observacao}
                onChange={(e) => setManual({ ...manual, observacao: e.target.value })}
              />
            </div>
            {onAdicionarAoEstoque && (
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={manual.adicionarEstoque}
                  onChange={(e) => setManual({ ...manual, adicionarEstoque: e.target.checked })}
                  className="h-4 w-4 rounded accent-primary"
                />
                Adicionar também ao estoque
              </label>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogManual(false)}>
                Cancelar
              </Button>
              <Button onClick={salvarManual} disabled={!manual.nome.trim()}>
                Adicionar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function gerarIdFallback(item: { linha_id?: string; peca_id?: string; nome: string }) {
  return item.linha_id ?? item.peca_id ?? item.nome
}
