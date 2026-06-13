import { MoneyInput } from '@/components/shared/MoneyInput'
import { Label } from '@/components/ui/label'
import { calcularValorPagoOS } from '@/services/os-pagamento.service'
import { podeEditarValoresLinhaOS } from '@/services/auth/permissions'
import type { PapelUsuario } from '@/types/auth'
import type { LancamentoFinanceiro, OrdemServico } from '@/types'
import { formatarMoeda } from '@/lib/utils'

interface ResumoFinanceiroOSSectionProps {
  form: Pick<
    OrdemServico,
    'valor_mao_obra' | 'valor_pecas' | 'valor_adicional' | 'desconto'
  >
  valorTotal: number
  os?: OrdemServico | null
  lancamentos: LancamentoFinanceiro[]
  papel: PapelUsuario
  maoObraAutomatica?: boolean
  onChange: (patch: Partial<ResumoFinanceiroOSSectionProps['form']>) => void
}

export function ResumoFinanceiroOSSection({
  form,
  valorTotal,
  os,
  lancamentos,
  papel,
  maoObraAutomatica = false,
  onChange,
}: ResumoFinanceiroOSSectionProps) {
  const podeEditarValor = podeEditarValoresLinhaOS(papel)
  const valorPago = os ? calcularValorPagoOS(os.id, lancamentos) : 0
  const valorPendente = Math.max(0, valorTotal - valorPago)

  return (
    <div className="space-y-4 rounded-lg border border-primary/20 bg-primary/5 p-4">
      <Label className="text-base font-medium">Resumo financeiro</Label>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="mao_obra_resumo">Total mão de obra</Label>
          <MoneyInput
            id="mao_obra_resumo"
            value={form.valor_mao_obra}
            disabled={maoObraAutomatica || !podeEditarValor}
            onChange={(valor_mao_obra) => onChange({ valor_mao_obra })}
          />
          {maoObraAutomatica && (
            <p className="text-xs text-muted-foreground">Calculado pelos serviços adicionados.</p>
          )}
        </div>
        <div className="grid gap-2">
          <Label>Total peças/produtos</Label>
          <div className="flex h-10 items-center rounded-md border border-border bg-muted/30 px-3 text-sm font-medium">
            {formatarMoeda(form.valor_pecas)}
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="adicional">Valores adicionais aprovados</Label>
          <MoneyInput
            id="adicional"
            value={form.valor_adicional ?? 0}
            disabled={!podeEditarValor}
            onChange={(v) => onChange({ valor_adicional: v || undefined })}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="desconto_resumo">Descontos</Label>
          <MoneyInput
            id="desconto_resumo"
            value={form.desconto}
            disabled={!podeEditarValor}
            onChange={(desconto) => onChange({ desconto })}
          />
        </div>
      </div>

      <div className="rounded-md border border-border bg-background/60 p-4 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Total geral</span>
          <span className="font-bold text-primary">{formatarMoeda(valorTotal)}</span>
        </div>
        {os && (
          <>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Valor pago</span>
              <span className="font-medium text-emerald-400">{formatarMoeda(valorPago)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Valor pendente</span>
              <span className="font-medium">{formatarMoeda(valorPendente)}</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
