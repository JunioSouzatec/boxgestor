import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
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
import { useLembretes } from '@/context/LembretesContext'
import { useAuth } from '@/context/AuthContext'
import type { LembreteComStatus, StatusLembrete } from '@/types/lembrete'
import { STATUS_LEMBRETE } from '@/types/lembrete'

interface EditarLembreteDialogProps {
  lembrete: LembreteComStatus | null
  aberto: boolean
  onFechar: () => void
}

export function EditarLembreteDialog({ lembrete, aberto, onFechar }: EditarLembreteDialogProps) {
  const { atualizarLembrete, cancelarLembrete } = useLembretes()
  const { session } = useAuth()
  const [servico, setServico] = useState('')
  const [dataPrevista, setDataPrevista] = useState('')
  const [kmPrevista, setKmPrevista] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [status, setStatus] = useState<StatusLembrete>('pendente')

  useEffect(() => {
    if (!lembrete || !aberto) return
    setServico(lembrete.servico)
    setDataPrevista(lembrete.data_prevista)
    setKmPrevista(lembrete.km_prevista != null ? String(lembrete.km_prevista) : '')
    setMensagem(lembrete.mensagem)
    setObservacoes(lembrete.observacoes ?? '')
    setStatus(lembrete.status)
  }, [lembrete, aberto])

  function handleSalvar() {
    if (!lembrete) return
    if (!servico.trim() || !dataPrevista || !mensagem.trim()) return

    atualizarLembrete(lembrete.id, {
      servico: servico.trim(),
      data_prevista: dataPrevista,
      km_prevista: kmPrevista ? Number(kmPrevista) : undefined,
      mensagem: mensagem.trim(),
      observacoes: observacoes.trim() || undefined,
      status,
    })
    onFechar()
  }

  function handleCancelar() {
    if (!lembrete) return
    if (window.confirm('Cancelar este lembrete? O registro permanecerá no histórico.')) {
      const responsavel = session?.user?.nome?.trim() || 'Usuário'
      cancelarLembrete(lembrete.id, responsavel)
      onFechar()
    }
  }

  if (!lembrete) return null

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar lembrete</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-1 sm:col-span-2">
              <Label>Serviço/peça</Label>
              <Input value={servico} onChange={(e) => setServico(e.target.value)} />
            </div>
            <div className="grid gap-1">
              <Label>Data de retorno</Label>
              <Input
                type="date"
                value={dataPrevista}
                onChange={(e) => setDataPrevista(e.target.value)}
              />
            </div>
            <div className="grid gap-1">
              <Label>Quilometragem de retorno</Label>
              <Input
                type="number"
                min={0}
                value={kmPrevista}
                onChange={(e) => setKmPrevista(e.target.value)}
                placeholder="Opcional"
              />
            </div>
          </div>

          <div className="grid gap-1">
            <Label>Mensagem WhatsApp</Label>
            <Textarea
              value={mensagem}
              onChange={(e) => setMensagem(e.target.value)}
              rows={5}
              className="text-sm"
            />
          </div>

          <div className="grid gap-1">
            <Label>Observações internas</Label>
            <Textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              rows={2}
              className="text-sm"
            />
          </div>

          <div className="grid gap-1">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as StatusLembrete)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_LEMBRETE.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Pendente, Para hoje e Vencido são recalculados pela data. Os demais são fixos e o
              lembrete permanece no histórico.
            </p>
          </div>

          <div className="flex flex-wrap justify-between gap-2 pt-2">
            <Button variant="outline" className="text-destructive" onClick={handleCancelar}>
              Cancelar lembrete
            </Button>
            <Button onClick={handleSalvar}>Salvar alterações</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
