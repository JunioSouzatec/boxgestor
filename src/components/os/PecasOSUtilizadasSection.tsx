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
} from '@/services/os-pecas.service'
import { podeEditarValoresLinhaOS, podeGerenciarLinhasOS } from '@/services/auth/permissions'
import type { PapelUsuario } from '@/types/auth'
import type { OrdemServico, Peca } from '@/types'
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
  valor_unitario: 0,
  observacao: '',
  adicionarEstoque: false,
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
  const [manual, setManual] = useState(manualVazio)

  const alertasEstoque = verificarEstoqueInsuficiente(form.pecas_utilizadas ?? [], pecasEstoque)

  function aplicar(patch: Partial<FormOSPecas>) {
    onChange(sincronizarValorPecasForm({ ...form, ...patch }))
  }

  function adicionarDoEstoque(pecaId: string) {
    const peca = pecasEstoque.find((p) => p.id === pecaId)
    if (!peca) return
    aplicar({
      pecas_utilizadas: [...(form.pecas_utilizadas ?? []), criarPecaUtilizadaDeEstoque(peca)],
    })
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
    const qtd = Math.max(1, parseInt(manual.quantidade, 10) || 1)
    const nova = criarPecaUtilizadaManual({
      nome: manual.nome.trim(),
      codigo: manual.codigo.trim() || undefined,
      quantidade: qtd,
      valor_unitario: manual.valor_unitario,
      observacao: manual.observacao.trim() || undefined,
    })
    aplicar({ pecas_utilizadas: [...(form.pecas_utilizadas ?? []), nova] })

    if (manual.adicionarEstoque && onAdicionarAoEstoque) {
      onAdicionarAoEstoque({
        nome: manual.nome.trim(),
        codigo: manual.codigo.trim() || `MAN-${Date.now()}`,
        quantidade: qtd,
        preco_venda: manual.valor_unitario,
      })
    }

    setManual(manualVazio)
    setDialogManual(false)
  }

  const itens = form.pecas_utilizadas ?? []

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
          <Select onValueChange={adicionarDoEstoque}>
            <SelectTrigger className="min-w-[220px] flex-1">
              <SelectValue placeholder="Selecionar peça do estoque" />
            </SelectTrigger>
            <SelectContent>
              {pecasEstoque.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.nome} — {formatarMoeda(p.preco_venda)} (estoque: {p.quantidade})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="button" variant="secondary" onClick={() => setDialogManual(true)}>
            <Plus className="h-4 w-4" />
            Peça manual
          </Button>
        </div>
      )}

      {itens.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma peça ou produto adicionado.</p>
      ) : (
        <div className="space-y-3">
          {itens.map((item) => {
            const linhaId: string = item.linha_id ?? item.peca_id ?? item.nome
            const total = item.quantidade * item.valor_unitario
            const alerta = alertasEstoque.find((a) => a.peca_id === item.peca_id)
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
                      {item.codigo ? ` · Cód. ${item.codigo}` : ''}
                    </p>
                  </div>
                  {podeGerenciar && (
                    <Button variant="ghost" size="sm" onClick={() => removerLinha(linhaId)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                      Remover
                    </Button>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="grid gap-1">
                    <Label className="text-xs">Quantidade</Label>
                    <Input
                      inputMode="numeric"
                      value={item.quantidade}
                      disabled={!podeGerenciar}
                      onChange={(e) => {
                        const v = Math.max(1, parseInt(e.target.value.replace(/\D/g, ''), 10) || 1)
                        atualizarLinha(linhaId, { quantidade: v })
                      }}
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-xs">Valor unitário</Label>
                    <MoneyInput
                      value={item.valor_unitario}
                      disabled={!podeEditarValor}
                      onChange={(v) => atualizarLinha(linhaId, { valor_unitario: v })}
                    />
                  </div>
                  <div className="grid gap-1 sm:col-span-2">
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
                  inputMode="numeric"
                  value={manual.quantidade}
                  onChange={(e) =>
                    setManual({ ...manual, quantidade: e.target.value.replace(/\D/g, '') || '1' })
                  }
                />
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
