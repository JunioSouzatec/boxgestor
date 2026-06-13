import { Link } from 'react-router-dom'
import { Eye, FileDown, Pencil } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { StatusOSBadge } from '@/components/shared/StatusBadges'
import { calcularResumoFinanceiroOS } from '@/services/os-financeiro.service'
import {
  listarOsDoCliente,
  montarResumoCliente,
} from '@/services/cliente-resumo.service'
import {
  obterDataFinalizacaoOS,
  obterResumoServicoOS,
} from '@/services/os-listagem.service'
import { formatarData, formatarMoeda } from '@/lib/utils'
import { getLabelStatusFinanceiroOS } from '@/types/labels'
import type { Cliente, LancamentoFinanceiro, Moto, OrdemServico } from '@/types'

interface ClienteOSDialogProps {
  aberto: boolean
  onOpenChange: (open: boolean) => void
  cliente: Cliente | null
  ordens: OrdemServico[]
  motos: Moto[]
  lancamentos: LancamentoFinanceiro[]
  onVisualizar?: (os: OrdemServico) => void
  onEditar?: (os: OrdemServico) => void
  onExportarPdf?: (os: OrdemServico) => void
}

export function ClienteOSDialog({
  aberto,
  onOpenChange,
  cliente,
  ordens,
  motos,
  lancamentos,
  onVisualizar,
  onEditar,
  onExportarPdf,
}: ClienteOSDialogProps) {
  if (!cliente) return null

  const itens = listarOsDoCliente(cliente.id, ordens, motos)
  const resumo = montarResumoCliente(cliente.id, ordens, lancamentos)

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ordens de Serviço — {cliente.nome}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-4 text-sm mb-4">
          <div className="rounded-md border border-border bg-muted/10 p-3">
            <p className="text-xs text-muted-foreground">Total de OS</p>
            <p className="font-semibold">{resumo.totalOs}</p>
          </div>
          <div className="rounded-md border border-border bg-muted/10 p-3">
            <p className="text-xs text-muted-foreground">Total pago</p>
            <p className="font-semibold">{formatarMoeda(resumo.totalGasto)}</p>
          </div>
          <div className="rounded-md border border-border bg-muted/10 p-3">
            <p className="text-xs text-muted-foreground">Pendente</p>
            <p className="font-semibold text-amber-400">{formatarMoeda(resumo.valorPendente)}</p>
          </div>
          <div className="rounded-md border border-border bg-muted/10 p-3">
            <p className="text-xs text-muted-foreground">Último atendimento</p>
            <p className="font-semibold">{resumo.ultimoAtendimentoLabel ?? '—'}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          <Button asChild size="sm">
            <Link to={`/ordens-servico?novo=1&cliente=${cliente.id}`} onClick={() => onOpenChange(false)}>
              Nova OS para este cliente
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to={`/clientes/${cliente.id}`} onClick={() => onOpenChange(false)}>
              Ver detalhe do cliente
            </Link>
          </Button>
        </div>

        {itens.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Nenhuma ordem de serviço para este cliente.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>OS</TableHead>
                <TableHead>Abertura</TableHead>
                <TableHead>Previsão</TableHead>
                <TableHead>Finalização</TableHead>
                <TableHead>Moto</TableHead>
                <TableHead>Serviço</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Financeiro</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Pendente</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {itens.map(({ os, moto }) => {
                const fin = calcularResumoFinanceiroOS(os, lancamentos)
                return (
                  <TableRow key={os.id}>
                    <TableCell className="font-medium">#{os.numero}</TableCell>
                    <TableCell>{formatarData(os.criado_em)}</TableCell>
                    <TableCell>{os.data_previsao ? formatarData(os.data_previsao) : '—'}</TableCell>
                    <TableCell>
                      {(() => {
                        const fim = obterDataFinalizacaoOS(os)
                        return fim ? formatarData(fim) : '—'
                      })()}
                    </TableCell>
                    <TableCell className="text-sm">
                      {moto ? `${moto.marca} ${moto.modelo}` : '—'}
                      {moto && (
                        <span className="block text-xs text-muted-foreground">{moto.placa}</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[140px] truncate text-sm">
                      {obterResumoServicoOS(os, 40)}
                    </TableCell>
                    <TableCell>
                      <StatusOSBadge status={os.status} />
                    </TableCell>
                    <TableCell className="text-xs">
                      {getLabelStatusFinanceiroOS(fin.statusFinanceiroEfetivo)}
                    </TableCell>
                    <TableCell className="text-right">{formatarMoeda(fin.totalGeral)}</TableCell>
                    <TableCell className="text-right text-amber-400">
                      {fin.valorPendente > 0 ? formatarMoeda(fin.valorPendente) : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {onVisualizar ? (
                          <Button variant="ghost" size="icon" title="Visualizar" onClick={() => onVisualizar(os)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        ) : (
                          <Button variant="ghost" size="icon" title="Visualizar" asChild>
                            <Link
                              to={`/ordens-servico?ver=${os.id}`}
                              onClick={() => onOpenChange(false)}
                            >
                              <Eye className="h-4 w-4" />
                            </Link>
                          </Button>
                        )}
                        {onEditar ? (
                          <Button variant="ghost" size="icon" title="Editar" onClick={() => onEditar(os)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        ) : (
                          <Button variant="ghost" size="icon" title="Editar" asChild>
                            <Link
                              to={`/ordens-servico?editar=${os.id}`}
                              onClick={() => onOpenChange(false)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Link>
                          </Button>
                        )}
                        {onExportarPdf ? (
                          <Button variant="ghost" size="icon" title="PDF" onClick={() => onExportarPdf(os)}>
                            <FileDown className="h-4 w-4" />
                          </Button>
                        ) : (
                          <Button variant="ghost" size="icon" title="PDF" asChild>
                            <Link
                              to={`/ordens-servico?pdf=${os.id}`}
                              onClick={() => onOpenChange(false)}
                            >
                              <FileDown className="h-4 w-4" />
                            </Link>
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  )
}
