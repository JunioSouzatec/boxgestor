import { CreditCard } from 'lucide-react'
import { BotaoUpgrade } from '@/components/plano/BotaoUpgrade'
import { StatusFinanceiroBadge } from '@/components/shared/StatusBadges'
import { formatarMoeda } from '@/lib/utils'
import { calcularResumoPagamentoOS } from '@/services/os-pagamento.service'
import type { LancamentoFinanceiro, OrdemServico } from '@/types'

interface PagamentoOSSimplesProps {
  os: OrdemServico | null
  valorTotal: number
  lancamentos: LancamentoFinanceiro[]
}

export function PagamentoOSSimples({
  os,
  valorTotal,
  lancamentos,
}: PagamentoOSSimplesProps) {
  const osParcial =
    os ??
    ({
      id: '',
      numero: 0,
      valor_total: valorTotal,
      status: 'recebida',
    } as OrdemServico)

  const resumo = calcularResumoPagamentoOS(osParcial, lancamentos)

  return (
    <div className="space-y-3 rounded-lg border border-dashed border-border bg-muted/10 p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h4 className="flex items-center gap-2 text-sm font-semibold">
            <CreditCard className="h-4 w-4" />
            Pagamento
          </h4>
          <p className="text-xs text-muted-foreground">
            Resumo financeiro básico — upgrade para controle completo
          </p>
        </div>
        <StatusFinanceiroBadge status={resumo.statusEfetivo} />
      </div>
      <div className="grid gap-2 text-sm sm:grid-cols-3">
        <p>
          <span className="text-muted-foreground">Total: </span>
          {formatarMoeda(resumo.valorTotal)}
        </p>
        <p>
          <span className="text-muted-foreground">Pago: </span>
          {formatarMoeda(resumo.valorPago)}
        </p>
        <p>
          <span className="text-muted-foreground">Pendente: </span>
          {formatarMoeda(resumo.valorPendente)}
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-primary/20 bg-primary/5 p-3">
        <p className="text-xs text-muted-foreground">
          Controle completo de pagamentos, recibos e contas a receber no plano Profissional.
        </p>
        <BotaoUpgrade />
      </div>
    </div>
  )
}
