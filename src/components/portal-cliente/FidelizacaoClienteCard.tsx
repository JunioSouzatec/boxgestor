import { Award } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatarData } from '@/lib/utils'
import type { FidelizacaoCliente } from '@/types/portal-cliente'

interface FidelizacaoClienteCardProps {
  fidelizacao: FidelizacaoCliente
}

export function FidelizacaoClienteCard({ fidelizacao }: FidelizacaoClienteCardProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Award className="h-5 w-5 text-primary" />
          Fidelização
        </CardTitle>
        <CardDescription>R$ 100 gastos = 1 ponto · cada serviço concluído = 10 pontos</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4 rounded-lg border border-primary/30 bg-primary/5 p-4 text-center">
          <p className="text-xs text-muted-foreground">Pontos acumulados</p>
          <p className="text-3xl font-bold text-primary">{fidelizacao.pontos_acumulados}</p>
        </div>

        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="text-right">Pontos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fidelizacao.historico.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="py-6 text-center text-muted-foreground">
                    Nenhum ponto registrado ainda.
                  </TableCell>
                </TableRow>
              ) : (
                fidelizacao.historico.slice(0, 10).map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="whitespace-nowrap">{formatarData(e.data)}</TableCell>
                    <TableCell className="text-sm">{e.descricao}</TableCell>
                    <TableCell className="text-right font-medium text-primary">+{e.pontos}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
