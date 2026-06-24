import { Link } from 'react-router-dom'
import { ClipboardList, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useTermosOficina } from '@/hooks/useTermosOficina'
import type { Cliente } from '@/types/cliente'
import type { Moto } from '@/types/moto'

interface ClienteMotosSectionProps {
  cliente: Cliente
  motos: Moto[]
}

export function ClienteMotosSection({ cliente, motos }: ClienteMotosSectionProps) {
  const termos = useTermosOficina()

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">{termos.veiculos} do cliente</h3>
        <Button asChild size="sm" variant="outline" className="gap-2">
          <Link to={`/motos?cliente=${cliente.id}`}>
            <Plus className="h-4 w-4" />
            {termos.novoVeiculo}
          </Link>
        </Button>
      </div>

      {motos.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhum {termos.palavraVeiculo} cadastrado para este cliente.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Marca / Modelo</TableHead>
              <TableHead>Placa</TableHead>
              <TableHead>Ano</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {motos.map((moto) => (
              <TableRow key={moto.id}>
                <TableCell className="font-medium">
                  {moto.marca} {moto.modelo}
                </TableCell>
                <TableCell>{moto.placa}</TableCell>
                <TableCell>{moto.ano}</TableCell>
                <TableCell className="text-right">
                  <Button asChild variant="ghost" size="sm" className="gap-1">
                    <Link to={`/ordens-servico?novo=1&cliente=${cliente.id}&moto=${moto.id}`}>
                      <ClipboardList className="h-4 w-4" />
                      Nova OS
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
