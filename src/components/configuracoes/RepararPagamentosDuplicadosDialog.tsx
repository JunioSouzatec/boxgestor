import { useMemo, useState } from 'react'
import { AlertTriangle, Loader2, Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useCraft } from '@/context/CraftContext'
import { useToast } from '@/context/ToastContext'
import { formatarData, formatarMoeda } from '@/lib/utils'
import {
  detectarPagamentosDuplicados,
  repararPagamentosDuplicados,
  type GrupoDuplicataPagamento,
} from '@/services/pagamentos/payment-dedupe.helpers'
import { getLabelFormaPagamento } from '@/types/labels'

export const MENSAGEM_REPARO_PAGAMENTOS =
  'Pagamentos duplicados reparados com sucesso.'

interface RepararPagamentosDuplicadosDialogProps {
  aberto: boolean
  onFechar: () => void
  /** Limitar reparo a uma OS específica */
  osId?: string
}

export function RepararPagamentosDuplicadosDialog({
  aberto,
  onFechar,
  osId,
}: RepararPagamentosDuplicadosDialogProps) {
  const { dados, aplicarDatabase } = useCraft()
  const { toast } = useToast()
  const [processando, setProcessando] = useState(false)

  const grupos = useMemo(
    () => detectarPagamentosDuplicados(dados, osId),
    [dados, osId, aberto]
  )

  const totalRemover = useMemo(
    () => grupos.reduce((acc, g) => acc + g.remover.length, 0),
    [grupos]
  )

  function descricaoGrupo(g: GrupoDuplicataPagamento): string {
    const p = g.manter
    const osLabel = g.os_numero != null ? `OS #${g.os_numero}` : g.ordem_servico_id
    return `${osLabel} — ${formatarData(p.data)} — ${getLabelFormaPagamento(p.forma_pagamento)} — ${formatarMoeda(p.valor)}`
  }

  async function confirmarReparo() {
    if (grupos.length === 0) return
    setProcessando(true)
    try {
      const { db, removidos } = repararPagamentosDuplicados(dados, grupos)
      aplicarDatabase(db)
      toast.sucesso(
        removidos > 0
          ? `${MENSAGEM_REPARO_PAGAMENTOS} (${removidos} duplicata(s) arquivada(s).)`
          : 'Nenhuma duplicata encontrada.'
      )
      onFechar()
    } catch (e) {
      toast.erro(e instanceof Error ? e.message : 'Erro ao reparar pagamentos.')
    } finally {
      setProcessando(false)
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={(open) => !open && onFechar()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5" />
            Reparar pagamentos duplicados
          </DialogTitle>
          <DialogDescription>
            Detecta pagamentos repetidos na mesma OS (mesmo valor, forma, data e observação).
            Será mantido um pagamento principal; os demais serão arquivados (não apagados
            permanentemente).
          </DialogDescription>
        </DialogHeader>

        {grupos.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            Nenhum pagamento duplicado encontrado{osId ? ' nesta OS' : ''}.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
              <p>
                Foram encontrados <strong>{grupos.length}</strong> grupo(s) com duplicatas (
                <strong>{totalRemover}</strong> pagamento(s) serão arquivados). Confirme apenas se
                a prévia estiver correta.
              </p>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Grupo</TableHead>
                  <TableHead className="text-center">Total</TableHead>
                  <TableHead className="text-center">Manter</TableHead>
                  <TableHead className="text-center">Arquivar</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {grupos.map((g) => (
                  <TableRow key={g.chave}>
                    <TableCell className="text-sm">{descricaoGrupo(g)}</TableCell>
                    <TableCell className="text-center">{g.pagamentos.length}</TableCell>
                    <TableCell className="text-center">1</TableCell>
                    <TableCell className="text-center text-amber-500">{g.remover.length}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onFechar} disabled={processando}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={() => void confirmarReparo()}
            disabled={processando || grupos.length === 0}
          >
            {processando ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Reparando…
              </>
            ) : (
              'Confirmar reparo'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

interface BotaoRepararPagamentosProps {
  osId?: string
  variant?: 'default' | 'outline' | 'ghost' | 'secondary'
  size?: 'default' | 'sm' | 'lg' | 'icon'
  className?: string
}

export function BotaoRepararPagamentosDuplicados({
  osId,
  variant = 'outline',
  size = 'sm',
  className,
}: BotaoRepararPagamentosProps) {
  const [aberto, setAberto] = useState(false)

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        className={className}
        onClick={() => setAberto(true)}
      >
        <Wrench className="mr-2 h-4 w-4" />
        Reparar pagamentos duplicados
      </Button>
      <RepararPagamentosDuplicadosDialog
        aberto={aberto}
        onFechar={() => setAberto(false)}
        osId={osId}
      />
    </>
  )
}
