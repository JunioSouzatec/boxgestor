import { Wrench } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { ServicoExecutadoStat } from '@/lib/analytics'
import { formatarMoeda } from '@/lib/utils'

interface TopServicosCardProps {
  servicos: ServicoExecutadoStat[]
}

export function TopServicosCard({ servicos }: TopServicosCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Wrench className="h-4 w-4 text-primary" />
          Serviços mais executados
        </CardTitle>
      </CardHeader>
      <CardContent>
        {servicos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem serviços concluídos ainda.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Serviço</TableHead>
                <TableHead className="text-right">Qtd</TableHead>
                <TableHead className="text-right">Receita</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {servicos.map((s) => (
                <TableRow key={s.servico}>
                  <TableCell className="max-w-[180px] truncate font-medium">{s.servico}</TableCell>
                  <TableCell className="text-right">{s.quantidade}</TableCell>
                  <TableCell className="text-right">{formatarMoeda(s.receita)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
