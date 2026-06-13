import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { StatusFinanceiroBadge } from '@/components/shared/StatusBadges'
import { formatarData, formatarMoeda } from '@/lib/utils'
import type { ContaReceberOS } from '@/services/os-pagamento.service'

interface ContasReceberOSTableProps {
  contas: ContaReceberOS[]
}

export function ContasReceberOSTable({ contas }: ContasReceberOSTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>OS</TableHead>
          <TableHead>Cliente</TableHead>
          <TableHead>Moto</TableHead>
          <TableHead className="text-right">Total</TableHead>
          <TableHead className="text-right">Pago</TableHead>
          <TableHead className="text-right">Pendente</TableHead>
          <TableHead>Vencimento</TableHead>
          <TableHead>Pagamentos</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {contas.length === 0 ? (
          <TableRow>
            <TableCell colSpan={9} className="text-center text-muted-foreground">
              Nenhuma OS com valor pendente.
            </TableCell>
          </TableRow>
        ) : (
          contas.map((conta) => (
            <TableRow key={conta.os.id}>
              <TableCell className="font-medium">#{conta.os.numero}</TableCell>
              <TableCell>{conta.clienteNome}</TableCell>
              <TableCell>{conta.motoLabel}</TableCell>
              <TableCell className="text-right">{formatarMoeda(conta.valorTotal)}</TableCell>
              <TableCell className="text-right">{formatarMoeda(conta.valorPago)}</TableCell>
              <TableCell className="text-right text-amber-400">
                {formatarMoeda(conta.valorPendente)}
              </TableCell>
              <TableCell>
                {conta.vencimento ? formatarData(conta.vencimento) : '—'}
              </TableCell>
              <TableCell className="max-w-[220px] text-xs text-muted-foreground">
                {conta.resumoPagamentos ?? '—'}
              </TableCell>
              <TableCell>
                <StatusFinanceiroBadge status={conta.statusFinanceiro} />
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  )
}
