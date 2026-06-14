import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { MoneyInput } from '@/components/shared/MoneyInput'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { criarServicoOSItemManual } from '@/services/servico-catalogo.service'
import type { ServicoOSItem } from '@/types/servico-catalogo'

interface ServicoManualDialogProps {
  aberto: boolean
  onFechar: () => void
  onConfirmar: (item: ServicoOSItem, salvarNoCatalogo: boolean) => void
  podeSalvarNoCatalogo: boolean
  salvando?: boolean
}

const formVazio = {
  nome: '',
  descricao: '',
  valor_mao_obra: 0,
  garantia_dias: '',
  observacoes: '',
  salvar_no_catalogo: false,
}

export function ServicoManualDialog({
  aberto,
  onFechar,
  onConfirmar,
  podeSalvarNoCatalogo,
  salvando = false,
}: ServicoManualDialogProps) {
  const [form, setForm] = useState(formVazio)

  function fechar() {
    setForm(formVazio)
    onFechar()
  }

  function confirmar() {
    if (!form.nome.trim()) return
    const item = criarServicoOSItemManual({
      nome: form.nome,
      descricao: form.descricao || undefined,
      valor_mao_obra: form.valor_mao_obra,
      garantia_dias: form.garantia_dias ? parseInt(form.garantia_dias, 10) : undefined,
      observacoes: form.observacoes || undefined,
    })
    onConfirmar(item, form.salvar_no_catalogo && podeSalvarNoCatalogo)
    setForm(formVazio)
  }

  return (
    <Dialog open={aberto} onOpenChange={(open) => !open && fechar()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Adicionar serviço manual</DialogTitle>
          <DialogDescription>
            Este serviço ficará apenas nesta OS. Você pode salvar no catálogo depois, se quiser.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1">
            <Label htmlFor="manual-nome">Nome do serviço *</Label>
            <Input
              id="manual-nome"
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              placeholder="Ex: Revisão de transmissão"
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="manual-desc">Descrição</Label>
            <Textarea
              id="manual-desc"
              rows={2}
              value={form.descricao}
              onChange={(e) => setForm({ ...form, descricao: e.target.value })}
            />
          </div>
          <div className="grid gap-1">
            <Label>Valor de mão de obra</Label>
            <MoneyInput
              value={form.valor_mao_obra}
              onChange={(valor_mao_obra) => setForm({ ...form, valor_mao_obra })}
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="manual-garantia">Garantia (dias)</Label>
            <Input
              id="manual-garantia"
              inputMode="numeric"
              value={form.garantia_dias}
              onChange={(e) =>
                setForm({ ...form, garantia_dias: e.target.value.replace(/\D/g, '') })
              }
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="manual-obs">Observação</Label>
            <Textarea
              id="manual-obs"
              rows={2}
              value={form.observacoes}
              onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
            />
          </div>
          {podeSalvarNoCatalogo && (
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="checkbox"
                checked={form.salvar_no_catalogo}
                onChange={(e) => setForm({ ...form, salvar_no_catalogo: e.target.checked })}
                className="h-4 w-4 rounded border-border"
              />
              Salvar este serviço no catálogo
            </label>
          )}
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={fechar}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={confirmar}
            disabled={!form.nome.trim() || salvando}
          >
            {salvando ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Adicionando…
              </>
            ) : (
              'Adicionar serviço'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
