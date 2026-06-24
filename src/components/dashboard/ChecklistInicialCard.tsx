import { Link } from 'react-router-dom'
import { CheckCircle2, Circle } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useOficinaData } from '@/context/CraftContext'
import { useMemo } from 'react'
import { useTermosOficina } from '@/hooks/useTermosOficina'
import { msgCadastrePrimeiroVeiculo } from '@/lib/termos-oficina'

export function ChecklistInicialCard({ compacto = false }: { compacto?: boolean }) {
  const { configuracao, clientes, motos, ordens, lancamentos } = useOficinaData()
  const termos = useTermosOficina()

  const checklist = useMemo(() => {
    const temLogo = Boolean(configuracao.logo_url)
    const temCliente = clientes.length > 0
    const temMoto = motos.length > 0
    const temOs = ordens.length > 0
    const temPagamento = lancamentos.some((l) => l.pago && l.tipo === 'receita')
    return [
      { label: 'Cadastre sua oficina', ok: Boolean(configuracao.nome?.trim()) },
      { label: 'Configure logo', ok: temLogo },
      { label: 'Cadastre primeiro cliente', ok: temCliente },
      { label: msgCadastrePrimeiroVeiculo(termos), ok: temMoto },
      { label: 'Abra sua primeira OS', ok: temOs },
      { label: 'Registre um pagamento', ok: temPagamento },
      { label: 'Gere seu primeiro recibo', ok: temPagamento },
    ]
  }, [configuracao, clientes, motos, ordens, lancamentos, termos])

  const concluidos = checklist.filter((c) => c.ok).length
  const completo = concluidos === checklist.length

  if (completo && compacto) return null

  return (
    <Card className={compacto ? 'mb-6 border-primary/20 bg-primary/5' : undefined}>
      <CardHeader className={compacto ? 'pb-2' : undefined}>
        <CardTitle className="text-base flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-primary" />
          Primeiros passos ({concluidos}/{checklist.length})
        </CardTitle>
        {!compacto && (
          <CardDescription>Checklist inicial — atualiza conforme você usa o sistema.</CardDescription>
        )}
        {compacto && (
          <CardDescription>
            Complete os passos abaixo para começar a usar o BoxGestor na sua oficina.
          </CardDescription>
        )}
      </CardHeader>
      <CardContent>
        <ul className={`space-y-2 ${compacto ? 'sm:columns-2 sm:gap-6' : ''}`}>
          {checklist.map((item) => (
            <li key={item.label} className="flex items-center gap-2 text-sm break-inside-avoid">
              {item.ok ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
              ) : (
                <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <span className={item.ok ? 'text-foreground' : 'text-muted-foreground'}>
                {item.label}
              </span>
            </li>
          ))}
        </ul>
        {!completo && (
          <Button variant="link" className="mt-3 h-auto p-0" asChild>
            <Link to="/como-usar">Ver guia completo →</Link>
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
