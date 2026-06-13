import { Users } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { ClienteFrequenteStat } from '@/lib/analytics'
import { formatarMoeda } from '@/lib/utils'

interface TopClientesCardProps {
  clientes: ClienteFrequenteStat[]
}

export function TopClientesCard({ clientes }: TopClientesCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4 text-primary" />
          Clientes mais frequentes
        </CardTitle>
      </CardHeader>
      <CardContent>
        {clientes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem clientes com serviços concluídos.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead className="text-right">Serviços</TableHead>
                <TableHead className="text-right">Total gasto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clientes.map((c) => (
                <TableRow key={c.clienteId}>
                  <TableCell className="font-medium">{c.nome}</TableCell>
                  <TableCell className="text-right">{c.quantidade}</TableCell>
                  <TableCell className="text-right">{formatarMoeda(c.valorTotal)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
