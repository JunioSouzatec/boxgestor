import { History, Shield } from 'lucide-react'
import { StatusOSBadge, GarantiaAtivaBadge } from '@/components/shared/StatusBadges'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { garantiaAtiva, obterGarantiaAtivaMoto, obterHistoricoMoto } from '@/lib/os'
import { formatarData, formatarMoeda } from '@/lib/utils'
import { calcularTotalGeralDeCampos } from '@/services/os-financeiro.service'
import type { Cliente, Moto, OrdemServico } from '@/types'

interface MotoHistoricoDialogProps {
  moto: Moto | null
  ordens: OrdemServico[]
  clientes: Cliente[]
  aberto: boolean
  onFechar: () => void
}

export function MotoHistoricoDialog({
  moto,
  ordens,
  clientes,
  aberto,
  onFechar,
}: MotoHistoricoDialogProps) {
  if (!moto) return null

  const historico = obterHistoricoMoto(moto.id, ordens)
  const garantiaAtivaMoto = obterGarantiaAtivaMoto(moto.id, ordens)
  const cliente = clientes.find((c) => c.id === moto.cliente_id)

  const registrosKm = historico
    .filter((o) => o.quilometragem_entrada !== undefined || o.quilometragem_saida !== undefined)
    .map((o) => ({
      os: o.numero,
      data: o.criado_em,
      entrada: o.quilometragem_entrada,
      saida: o.quilometragem_saida,
    }))

  return (
    <Dialog open={aberto} onOpenChange={(open) => !open && onFechar()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-primary" />
            Histórico — {moto.marca} {moto.modelo} ({moto.placa})
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>Cliente: {cliente?.nome ?? '—'}</span>
            <span>•</span>
            <span>KM atual: {moto.quilometragem.toLocaleString('pt-BR')} km</span>
            {garantiaAtivaMoto && (
              <>
                <span>•</span>
                <GarantiaAtivaBadge />
                <span className="text-xs">
                  OS #{garantiaAtivaMoto.numero} até{' '}
                  {formatarData(garantiaAtivaMoto.data_vencimento_garantia!)}
                </span>
              </>
            )}
          </div>

          {registrosKm.length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-semibold">Evolução da quilometragem</h4>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>OS</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>KM entrada</TableHead>
                    <TableHead>KM saída</TableHead>
                    <TableHead>Variação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...registrosKm].reverse().map((r) => (
                    <TableRow key={r.os}>
                      <TableCell className="font-medium">#{r.os}</TableCell>
                      <TableCell>{formatarData(r.data)}</TableCell>
                      <TableCell>
                        {r.entrada !== undefined ? `${r.entrada.toLocaleString('pt-BR')} km` : '—'}
                      </TableCell>
                      <TableCell>
                        {r.saida !== undefined ? `${r.saida.toLocaleString('pt-BR')} km` : '—'}
                      </TableCell>
                      <TableCell>
                        {r.entrada !== undefined && r.saida !== undefined
                          ? `${(r.saida - r.entrada).toLocaleString('pt-BR')} km`
                          : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <div>
            <h4 className="mb-2 text-sm font-semibold">Ordens de serviço</h4>
            {historico.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma OS registrada.</p>
            ) : (
              <div className="space-y-2">
                {historico.map((os) => (
                  <div
                    key={os.id}
                    className="rounded-lg border border-border p-3 text-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold">OS #{os.numero}</span>
                      <div className="flex items-center gap-2">
                        <StatusOSBadge status={os.status} />
                        {garantiaAtiva(os) && (
                          <Badge variant="success" className="gap-1">
                            <Shield className="h-3 w-3" />
                            Garantia
                          </Badge>
                        )}
                      </div>
                    </div>
                    <p className="mt-1 text-muted-foreground">{os.defeito_relatado}</p>
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                      <span>{formatarData(os.criado_em)}</span>
                      <span>{formatarMoeda(calcularTotalGeralDeCampos(os))}</span>
                      {os.data_vencimento_garantia && (
                        <span>Garantia até {formatarData(os.data_vencimento_garantia)}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
