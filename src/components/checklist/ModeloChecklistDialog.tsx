import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
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
  CATEGORIAS_CHECKLIST,
  TIPOS_RESPOSTA_CHECKLIST,
} from '@/services/checklist-modelo.service'
import { gerarId } from '@/lib/utils'
import type { ItemModeloChecklist, ModeloChecklist, TipoRespostaChecklist } from '@/types'

interface ModeloChecklistDialogProps {
  aberto: boolean
  onFechar: () => void
  modelo?: ModeloChecklist | null
  onSalvar: (dados: {
    nome: string
    descricao?: string
    ativo: boolean
    padrao: boolean
    itens: ItemModeloChecklist[]
  }) => void
}

function itemVazio(ordem: number): ItemModeloChecklist {
  return {
    id: gerarId(),
    nome: '',
    categoria: 'outros',
    tipo_resposta: 'ok_nao_ok',
    obrigatorio: false,
    ordem,
  }
}

export function ModeloChecklistDialog({
  aberto,
  onFechar,
  modelo,
  onSalvar,
}: ModeloChecklistDialogProps) {
  const [nome, setNome] = useState('')
  const [descricao, setDescricao] = useState('')
  const [ativo, setAtivo] = useState(true)
  const [padrao, setPadrao] = useState(false)
  const [itens, setItens] = useState<ItemModeloChecklist[]>([itemVazio(1)])

  useEffect(() => {
    if (!aberto) return
    if (modelo) {
      setNome(modelo.nome)
      setDescricao(modelo.descricao ?? '')
      setAtivo(modelo.ativo)
      setPadrao(modelo.padrao)
      setItens(
        [...modelo.itens]
          .sort((a, b) => a.ordem - b.ordem)
          .map((item, idx) => ({ ...item, ordem: idx + 1 }))
      )
    } else {
      setNome('')
      setDescricao('')
      setAtivo(true)
      setPadrao(false)
      setItens([itemVazio(1)])
    }
  }, [aberto, modelo])

  function atualizarItem(id: string, patch: Partial<ItemModeloChecklist>) {
    setItens((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }

  function removerItem(id: string) {
    setItens((prev) =>
      prev
        .filter((item) => item.id !== id)
        .map((item, idx) => ({ ...item, ordem: idx + 1 }))
    )
  }

  function adicionarItem() {
    setItens((prev) => [...prev, itemVazio(prev.length + 1)])
  }

  function salvar() {
    if (!nome.trim()) {
      window.alert('Informe o nome do modelo.')
      return
    }
    const itensValidos = itens.filter((i) => i.nome.trim())
    if (!itensValidos.length) {
      window.alert('Adicione ao menos um item ao checklist.')
      return
    }
    onSalvar({
      nome: nome.trim(),
      descricao: descricao.trim() || undefined,
      ativo,
      padrao,
      itens: itensValidos.map((item, idx) => ({
        ...item,
        nome: item.nome.trim(),
        ordem: idx + 1,
      })),
    })
    onFechar()
  }

  return (
    <Dialog open={aberto} onOpenChange={(open) => !open && onFechar()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{modelo ? 'Editar modelo de checklist' : 'Novo modelo de checklist'}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2 sm:col-span-2">
            <Label>Nome do modelo</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <Label>Descrição</Label>
            <Textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              rows={2}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
            Modelo ativo
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={padrao}
              onChange={(e) => setPadrao(e.target.checked)}
            />
            Definir como padrão
          </label>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Itens do checklist</Label>
            <Button type="button" variant="outline" size="sm" onClick={adicionarItem}>
              <Plus className="h-4 w-4" />
              Item
            </Button>
          </div>

          <div className="space-y-3">
            {itens.map((item) => (
              <div key={item.id} className="grid gap-2 rounded-lg border border-border p-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input
                    placeholder="Nome do item"
                    value={item.nome}
                    onChange={(e) => atualizarItem(item.id, { nome: e.target.value })}
                  />
                  <Select
                    value={item.categoria}
                    onValueChange={(v) =>
                      atualizarItem(item.id, {
                        categoria: v as ItemModeloChecklist['categoria'],
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Categoria" />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIAS_CHECKLIST.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  <Select
                    value={item.tipo_resposta}
                    onValueChange={(v) =>
                      atualizarItem(item.id, { tipo_resposta: v as TipoRespostaChecklist })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Tipo de resposta" />
                    </SelectTrigger>
                    <SelectContent>
                      {TIPOS_RESPOSTA_CHECKLIST.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min={1}
                    value={item.ordem}
                    onChange={(e) =>
                      atualizarItem(item.id, { ordem: Number(e.target.value) || 1 })
                    }
                    placeholder="Ordem"
                  />
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={item.obrigatorio}
                      onChange={(e) =>
                        atualizarItem(item.id, { obrigatorio: e.target.checked })
                      }
                    />
                    Obrigatório
                  </label>
                </div>
                <Input
                  placeholder="Observação padrão (opcional)"
                  value={item.observacao_padrao ?? ''}
                  onChange={(e) =>
                    atualizarItem(item.id, {
                      observacao_padrao: e.target.value || undefined,
                    })
                  }
                />
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removerItem(item.id)}
                    disabled={itens.length <= 1}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                    Remover item
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onFechar}>
            Cancelar
          </Button>
          <Button onClick={salvar}>Salvar modelo</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
