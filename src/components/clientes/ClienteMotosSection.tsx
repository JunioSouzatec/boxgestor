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
import type { Cliente } from '@/types/cliente'
import type { Moto } from '@/types/moto'

interface ClienteMotosSectionProps {
  cliente: Cliente
  motos: Moto[]
}

export function ClienteMotosSection({ cliente, motos }: ClienteMotosSectionProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">Motos do cliente</h3>
        <Button asChild size="sm" variant="outline" className="gap-2">
          <Link to={`/motos?cliente=${cliente.id}`}>
            <Plus className="h-4 w-4" />
            Nova moto
          </Link>
        </Button>
      </div>

      {motos.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhuma moto cadastrada para este cliente.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Marca</TableHead>
              <TableHead>Modelo</TableHead>
              <TableHead>Placa</TableHead>
              <TableHead>Ano</TableHead>
              <TableHead>Quilometragem</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {motos.map((moto) => (
              <TableRow key={moto.id}>
                <TableCell>{moto.marca}</TableCell>
                <TableCell>{moto.modelo}</TableCell>
                <TableCell className="font-medium">{moto.placa}</TableCell>
                <TableCell>{moto.ano}</TableCell>
                <TableCell>{moto.quilometragem.toLocaleString('pt-BR')} km</TableCell>
                <TableCell className="text-right">
                  <Button asChild size="sm" variant="outline" className="gap-1.5">
                    <Link to={`/ordens-servico?novo=1&cliente=${cliente.id}&moto=${moto.id}`}>
                      <ClipboardList className="h-3.5 w-3.5" />
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
