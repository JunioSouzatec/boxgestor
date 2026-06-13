import { CreditCard } from 'lucide-react'
import { BotaoUpgrade } from '@/components/plano/BotaoUpgrade'
import { StatusFinanceiroBadge } from '@/components/shared/StatusBadges'
import { formatarMoeda } from '@/lib/utils'
import { calcularResumoFinanceiroOS } from '@/services/os-financeiro.service'
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
  const resumo = calcularResumoFinanceiroOS(
    os ?? {
      id: '',
      valor_pecas: 0,
      valor_mao_obra: 0,
      valor_adicional: 0,
      desconto: 0,
      status: 'recebida',
    },
    lancamentos,
    { totalGeral: valorTotal }
  )

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
        <StatusFinanceiroBadge status={resumo.statusFinanceiroEfetivo} />
      </div>
      <div className="grid gap-2 text-sm sm:grid-cols-3">
        <p>
          <span className="text-muted-foreground">Total: </span>
          {formatarMoeda(resumo.totalGeral)}
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
