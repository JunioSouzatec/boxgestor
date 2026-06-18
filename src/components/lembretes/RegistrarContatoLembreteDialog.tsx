import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
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
import { useSalvarAcao } from '@/hooks/useSalvarAcao'
import type { LembreteComStatus } from '@/types/lembrete'
import {
  CANAIS_COMUNICACAO,
  RESULTADOS_CONTATO,
  type CanalComunicacaoLembrete,
  type ResultadoContatoLembrete,
} from '@/types/lembrete'

interface RegistrarContatoLembreteDialogProps {
  lembrete: LembreteComStatus | null
  aberto: boolean
  onFechar: () => void
  mensagemInicial?: string
  canalInicial?: CanalComunicacaoLembrete
  resultadoInicial?: ResultadoContatoLembrete
}

export function RegistrarContatoLembreteDialog({
  lembrete,
  aberto,
  onFechar,
  mensagemInicial,
  canalInicial = 'whatsapp',
  resultadoInicial = 'enviado',
}: RegistrarContatoLembreteDialogProps) {
  const { registrarContato } = useLembretes()
  const { session } = useAuth()
  const { executar, salvando } = useSalvarAcao()

  const [canal, setCanal] = useState<CanalComunicacaoLembrete>(canalInicial)
  const [mensagem, setMensagem] = useState('')
  const [resultado, setResultado] = useState<ResultadoContatoLembrete>(resultadoInicial)
  const [dataHora, setDataHora] = useState('')
  const [observacao, setObservacao] = useState('')

  useEffect(() => {
    if (!lembrete || !aberto) return
    const agora = new Date()
    const local = new Date(agora.getTime() - agora.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16)
    setCanal(canalInicial)
    setMensagem(mensagemInicial ?? lembrete.mensagem)
    setResultado(resultadoInicial)
    setDataHora(local)
    setObservacao('')
  }, [lembrete, aberto, mensagemInicial, canalInicial, resultadoInicial])

  function handleSalvar() {
    if (!lembrete) return
    const responsavel = session?.user?.nome?.trim() || 'Usuário'

    void executar({
      validar: () => {
        if (!dataHora) return 'Informe a data e hora do contato.'
        return null
      },
      acao: () => {
        registrarContato(lembrete.id, {
          canal,
          mensagem: mensagem.trim() || undefined,
          resultado,
          data_hora: new Date(dataHora).toISOString(),
          responsavel,
          observacao: observacao.trim() || undefined,
        })
      },
      sucesso: 'Contato registrado com sucesso.',
      onSuccess: onFechar,
    })
  }

  if (!lembrete) return null

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Registrar contato</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="rounded-lg border border-border bg-muted/20 p-3 text-sm">
            <p className="font-medium">{lembrete.servico}</p>
            <p className="text-muted-foreground">Previsto: {lembrete.data_prevista}</p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-1">
              <Label>Canal</Label>
              <Select value={canal} onValueChange={(v) => setCanal(v as CanalComunicacaoLembrete)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CANAIS_COMUNICACAO.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1">
              <Label>Resultado</Label>
              <Select
                value={resultado}
                onValueChange={(v) => setResultado(v as ResultadoContatoLembrete)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RESULTADOS_CONTATO.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-1">
            <Label>Data e hora</Label>
            <Input
              type="datetime-local"
              value={dataHora}
              onChange={(e) => setDataHora(e.target.value)}
            />
          </div>

          <div className="grid gap-1">
            <Label>Mensagem enviada / anotação</Label>
            <Textarea
              value={mensagem}
              onChange={(e) => setMensagem(e.target.value)}
              rows={4}
              placeholder="Texto enviado ao cliente ou resumo da ligação"
            />
          </div>

          <div className="grid gap-1">
            <Label>Observação interna (opcional)</Label>
            <Textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              rows={2}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onFechar}>
              Cancelar
            </Button>
            <Button onClick={handleSalvar} disabled={salvando}>
              {salvando ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Salvando…
                </>
              ) : (
                'Salvar registro'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
