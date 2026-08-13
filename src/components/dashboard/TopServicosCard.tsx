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
    <Card className="border-zinc-700/50 bg-zinc-900/90 shadow-[0_1px_3px_rgba(0,0,0,0.35)]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base text-zinc-50">
          <span className="rounded-lg bg-blue-500/15 p-1.5 text-blue-400">
            <Wrench className="h-4 w-4" />
          </span>
          Serviços mais realizados
        </CardTitle>
      </CardHeader>
      <CardContent>
        {servicos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum serviço registrado em OS ainda.</p>
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
