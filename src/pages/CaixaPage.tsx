import { PageHeader } from '@/components/layout/PageHeader'
import { CaixaSection } from '@/components/financeiro/CaixaSection'
import { AjudaTooltip } from '@/components/shared/AjudaTooltip'

/**
 * Página própria de Caixa (Fase 3A).
 * Reutiliza CaixaSection; a aba Caixa em Financeiro permanece por compatibilidade.
 */
export function CaixaPage() {
  return (
    <div>
      <PageHeader
        titulo={
          <span className="inline-flex items-center gap-2">
            Caixa
            <AjudaTooltip texto="Abertura, fechamento, movimentos manuais, vendas de OS e auditoria. Movimentos cancelados ficam no histórico e não entram no saldo." />
          </span>
        }
        descricao="Caixa do dia, movimentos e histórico auditável"
      />
      <CaixaSection />
    </div>
  )
}
