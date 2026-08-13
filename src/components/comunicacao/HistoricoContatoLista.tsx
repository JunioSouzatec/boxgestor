import { useState } from 'react'
import { Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { HistoricoContatoMensagemDialog } from '@/components/comunicacao/HistoricoContatoMensagemDialog'
import { useComunicacao } from '@/context/ComunicacaoContext'
import { useOficinaData } from '@/context/CraftContext'
import { getLabelTipoMensagemOficina } from '@/lib/mensagem-agendada-helpers'
import type { HistoricoContato } from '@/types/comunicacao'
import { formatarDataOuDataHoraBrasil } from '@/lib/utils'

export function HistoricoContatoLista() {
  const { historico } = useComunicacao()
  const { configuracao } = useOficinaData()
  const [itemSelecionado, setItemSelecionado] = useState<HistoricoContato | null>(null)

  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>OS</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {historico.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  Nenhum contato registrado ainda.
                </TableCell>
              </TableRow>
            ) : (
              historico.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="whitespace-nowrap">
                    {formatarDataOuDataHoraBrasil(item.data)}
                  </TableCell>
                  <TableCell className="font-medium">{item.cliente_nome}</TableCell>
                  <TableCell className="max-w-[140px] truncate text-sm">
                    {getLabelTipoMensagemOficina(item.tipo_mensagem, configuracao)}
                  </TableCell>
                  <TableCell>
                    {item.ordem_servico_numero ? `#${item.ordem_servico_numero}` : '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-emerald-400 border-emerald-500/30">
                      Enviado manualmente
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setItemSelecionado(item)}
                    >
                      <Eye className="mr-1.5 h-4 w-4" />
                      Ver mensagem
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <HistoricoContatoMensagemDialog
        item={itemSelecionado}
        aberto={itemSelecionado != null}
        onFechar={() => setItemSelecionado(null)}
      />
    </>
  )
}
