import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Crown, UserX, Shield, Bell } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { BadgeVIP } from '@/components/portal-cliente/BadgeVIP'
import type { ClientePortalResumo, ResumoPortalDashboard } from '@/types/portal-cliente'
import { formatarData } from '@/lib/utils'
import { cn } from '@/lib/utils'

interface PortalClienteDashboardCardsProps {
  resumo: ResumoPortalDashboard
  compacto?: boolean
}

export function PortalClienteDashboardCards({
  resumo,
  compacto = false,
}: PortalClienteDashboardCardsProps) {
  const limite = compacto ? 4 : 5

  const cards: {
    titulo: string
    descricao: string
    icone: typeof Crown
    cor: string
    itens: ClientePortalResumo[]
    vazio: string
    renderExtra: (r: ClientePortalResumo) => ReactNode
  }[] = [
    {
      titulo: 'Clientes VIP',
      descricao: 'Ouro e Diamante',
      icone: Crown,
      cor: 'text-yellow-400',
      itens: resumo.clientes_vip,
      vazio: 'Nenhum cliente VIP ainda.',
      renderExtra: (r) => <BadgeVIP nivel={r.nivel_vip} className="text-xs" />,
    },
    {
      titulo: 'Sem retorno há 90+ dias',
      descricao: 'Reativar contato',
      icone: UserX,
      cor: 'text-destructive',
      itens: resumo.sem_retorno_90_dias,
      vazio: 'Todos retornaram recentemente.',
      renderExtra: (r) => (
        <span className="text-xs text-destructive shrink-0">{r.dias_sem_retorno}d</span>
      ),
    },
    {
      titulo: 'Garantia ativa',
      descricao: 'Acompanhamento',
      icone: Shield,
      cor: 'text-amber-400',
      itens: resumo.garantia_ativa,
      vazio: 'Nenhuma garantia ativa.',
      renderExtra: () => null,
    },
    {
      titulo: 'Lembretes próximos',
      descricao: 'Contato programado',
      icone: Bell,
      cor: 'text-cyan-400',
      itens: resumo.lembretes_proximos,
      vazio: 'Nenhum lembrete próximo.',
      renderExtra: (r) =>
        r.ultimo_atendimento ? (
          <span className="text-xs text-muted-foreground shrink-0">
            {formatarData(r.ultimo_atendimento)}
          </span>
        ) : null,
    },
  ]

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map(({ titulo, descricao, icone: Icone, cor, itens, vazio, renderExtra }) => (
        <Card key={titulo}>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Icone className={cn('h-4 w-4', cor)} />
              {titulo}
            </CardTitle>
            <CardDescription className="text-xs">{descricao}</CardDescription>
          </CardHeader>
          <CardContent>
            {itens.length === 0 ? (
              <p className="text-xs text-muted-foreground">{vazio}</p>
            ) : (
              <ul className="space-y-1.5">
                {itens.slice(0, limite).map((r) => (
                  <li key={r.cliente.id}>
                    <Link
                      to={`/portal-cliente/${r.cliente.id}`}
                      className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/40"
                    >
                      <span className="truncate">{r.cliente.nome}</span>
                      {renderExtra(r)}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {!compacto && itens.length > limite && (
              <Button variant="link" size="sm" className="mt-2 h-auto p-0" asChild>
                <Link to="/portal-cliente">Ver todos ({itens.length})</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
