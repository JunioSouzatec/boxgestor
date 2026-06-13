import { formatarDetalhePagamento } from '@/lib/pagamento-format'
import type { FormaPagamento } from '@/types/enums'

interface ResumoParcelamentoPreviewProps {
  valor: number
  formaPagamento: FormaPagamento
  parcelas?: number
}

export function ResumoParcelamentoPreview({
  valor,
  formaPagamento,
  parcelas,
}: ResumoParcelamentoPreviewProps) {
  if (formaPagamento !== 'credito' || valor <= 0) return null

  const detalhe = formatarDetalhePagamento({
    forma_pagamento: formaPagamento,
    valor,
    parcelas,
  })

  return (
    <div className="rounded-md border border-primary/20 bg-primary/5 p-3 text-sm">
      {detalhe.linhas.map((linha) => (
        <p key={linha}>{linha}</p>
      ))}
    </div>
  )
}
