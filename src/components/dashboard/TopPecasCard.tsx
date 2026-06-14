import { Package } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { PecaUsadaStat } from '@/services/analytics.service'

interface TopPecasCardProps {
  pecas: PecaUsadaStat[]
}

export function TopPecasCard({ pecas }: TopPecasCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Package className="h-4 w-4 text-primary" />
          Peças mais usadas
        </CardTitle>
      </CardHeader>
      <CardContent>
        {pecas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma peça utilizada em OS ainda.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Peça</TableHead>
                <TableHead className="text-right">Qtd</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pecas.map((p) => (
                <TableRow key={p.nome}>
                  <TableCell className="max-w-[200px] truncate font-medium">{p.nome}</TableCell>
                  <TableCell className="text-right">
                    {p.quantidade} {p.quantidade === 1 ? 'unidade' : 'unidades'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
