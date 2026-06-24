import {
  Dialog,
  DialogContent,
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
import { StatusOSBadge } from '@/components/shared/StatusBadges'
import { calcularResumoFinanceiroOS } from '@/services/os-financeiro.service'
import { listarHistoricoClienteOS } from '@/services/os-listagem.service'
import { formatarData, formatarMoeda } from '@/lib/utils'
import { useTermosOficina } from '@/hooks/useTermosOficina'
import type { Cliente, LancamentoFinanceiro, Moto, OrdemServico } from '@/types'

interface HistoricoClienteOSDialogProps {
  aberto: boolean
  onOpenChange: (open: boolean) => void
  cliente: Cliente | null
  ordens: OrdemServico[]
  motos: Moto[]
  lancamentos: LancamentoFinanceiro[]
  excluirOsId?: string
}

export function HistoricoClienteOSDialog({
  aberto,
  onOpenChange,
  cliente,
  ordens,
  motos,
  lancamentos,
  excluirOsId,
}: HistoricoClienteOSDialogProps) {
  const termos = useTermosOficina()
  if (!cliente) return null

  const historico = listarHistoricoClienteOS(cliente.id, ordens, motos, excluirOsId).map(
    (item) => {
      const resumo = calcularResumoFinanceiroOS(item.os, lancamentos)
      return {
        ...item,
        totalGeral: resumo.totalGeral,
        valorPendente: resumo.valorPendente,
      }
    }
  )

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Histórico — {cliente.nome}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground mb-4">
          Ordens de serviço anteriores deste cliente ({historico.length} registro
          {historico.length !== 1 ? 's' : ''})
        </p>

        {historico.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Nenhuma outra OS encontrada para este cliente.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Entrada</TableHead>
                <TableHead>Previsão</TableHead>
                <TableHead>Saída</TableHead>
                <TableHead>OS</TableHead>
                <TableHead>{termos.veiculo}</TableHead>
                <TableHead>Serviço</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Pago/Pendente</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {historico.map(
                ({
                  os,
                  motoLabel,
                  resumoServico,
                  dataEntrada,
                  dataSaida,
                  totalGeral,
                  valorPendente,
                }) => (
                <TableRow key={os.id}>
                  <TableCell>{formatarData(dataEntrada)}</TableCell>
                  <TableCell>
                    {os.data_previsao ? formatarData(os.data_previsao) : '—'}
                  </TableCell>
                  <TableCell>{dataSaida ? formatarData(dataSaida) : '—'}</TableCell>
                  <TableCell className="font-medium">#{os.numero}</TableCell>
                  <TableCell className="text-sm">{motoLabel}</TableCell>
                  <TableCell className="max-w-[180px] truncate text-sm">
                    {resumoServico}
                  </TableCell>
                  <TableCell>
                    <StatusOSBadge status={os.status} />
                  </TableCell>
                  <TableCell className="text-right">{formatarMoeda(totalGeral)}</TableCell>
                  <TableCell className="text-right text-amber-400">
                    {valorPendente > 0 ? formatarMoeda(valorPendente) : 'Pago'}
                  </TableCell>
                </TableRow>
              )
              )}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  )
}
