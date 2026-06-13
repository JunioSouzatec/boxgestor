import { DollarSign } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatarData, formatarMoeda } from '@/lib/utils'
import type { ResumoFinanceiroCliente } from '@/types/portal-cliente'

interface ResumoFinanceiroClienteCardProps {
  resumo: ResumoFinanceiroCliente
}

export function ResumoFinanceiroClienteCard({ resumo }: ResumoFinanceiroClienteCardProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <DollarSign className="h-5 w-5 text-emerald-400" />
          Resumo financeiro
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <div className="rounded-lg border border-border bg-muted/20 p-3">
            <p className="text-xs text-muted-foreground">Total gasto</p>
            <p className="text-xl font-bold text-emerald-400">{formatarMoeda(resumo.total_gasto)}</p>
          </div>
          <div className="rounded-lg border border-border bg-muted/20 p-3">
            <p className="text-xs text-muted-foreground">Serviços concluídos</p>
            <p className="text-xl font-bold">{resumo.quantidade_servicos}</p>
          </div>
          <div className="rounded-lg border border-border bg-muted/20 p-3">
            <p className="text-xs text-muted-foreground">Ticket médio</p>
            <p className="text-xl font-bold">{formatarMoeda(resumo.ticket_medio)}</p>
          </div>
          <div className="rounded-lg border border-border bg-muted/20 p-3">
            <p className="text-xs text-muted-foreground">Último atendimento</p>
            <p className="font-medium">
              {resumo.ultimo_atendimento ? formatarData(resumo.ultimo_atendimento) : '—'}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-muted/20 p-3 sm:col-span-2">
            <p className="text-xs text-muted-foreground">Próxima revisão prevista</p>
            <p className="font-medium">
              {resumo.proxima_revisao ? formatarData(resumo.proxima_revisao) : '—'}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
