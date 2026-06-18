import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatarData } from '@/lib/utils'
import type { Cliente, Moto } from '@/types'
import type { HistoricoComunicacaoItem } from '@/types/lembrete'
import {
  getLabelCanalComunicacao,
  getLabelResultadoContato,
  getLabelStatusLembrete,
} from '@/types/lembrete'

interface HistoricoComunicacaoListaProps {
  itens: HistoricoComunicacaoItem[]
  clientes?: Cliente[]
  motos?: Moto[]
  mostrarCliente?: boolean
  mostrarMoto?: boolean
  mostrarOs?: boolean
  vazio?: string
}

export function HistoricoComunicacaoLista({
  itens,
  clientes = [],
  motos = [],
  mostrarCliente = true,
  mostrarMoto = false,
  mostrarOs = true,
  vazio = 'Nenhum registro de comunicação.',
}: HistoricoComunicacaoListaProps) {
  const getCliente = (id: string) => clientes.find((c) => c.id === id)?.nome ?? '—'
  const getMoto = (id: string) => {
    const m = motos.find((mo) => mo.id === id)
    return m ? `${m.marca} ${m.modelo} (${m.placa})` : '—'
  }

  if (itens.length === 0) {
    return <p className="text-sm text-muted-foreground">{vazio}</p>
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Data/hora</TableHead>
            {mostrarCliente && <TableHead>Cliente</TableHead>}
            {mostrarMoto && <TableHead>Moto</TableHead>}
            <TableHead>Serviço</TableHead>
            {mostrarOs && <TableHead>OS</TableHead>}
            <TableHead>Canal</TableHead>
            <TableHead>Resultado</TableHead>
            <TableHead>Responsável</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Mensagem</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {itens.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="whitespace-nowrap text-sm">
                {formatarData(item.registro.data.slice(0, 10))}
                <span className="ml-1 text-xs text-muted-foreground">
                  {item.registro.data.slice(11, 16)}
                </span>
              </TableCell>
              {mostrarCliente && (
                <TableCell className="font-medium">{getCliente(item.cliente_id)}</TableCell>
              )}
              {mostrarMoto && <TableCell>{getMoto(item.moto_id)}</TableCell>}
              <TableCell>{item.servico}</TableCell>
              {mostrarOs && (
                <TableCell>
                  {item.ordem_servico_numero ? `#${item.ordem_servico_numero}` : '—'}
                </TableCell>
              )}
              <TableCell>{getLabelCanalComunicacao(item.registro.canal)}</TableCell>
              <TableCell>
                {item.registro.resultado
                  ? getLabelResultadoContato(item.registro.resultado)
                  : '—'}
              </TableCell>
              <TableCell>{item.registro.responsavel}</TableCell>
              <TableCell>
                <Badge variant="outline">{getLabelStatusLembrete(item.registro.status_apos)}</Badge>
              </TableCell>
              <TableCell className="max-w-[220px] truncate text-muted-foreground">
                {item.registro.mensagem || item.registro.observacao || '—'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
