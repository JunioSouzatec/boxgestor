import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  ClipboardPlus,
  Search,
  Bike,
  Bell,
  ClipboardList,
  Wallet,
  CalendarDays,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useOficinaData } from '@/context/CraftContext'
import { useLembretes } from '@/context/LembretesContext'
import { useTermosOficina } from '@/hooks/useTermosOficina'
import { getDataLocalHoje } from '@/lib/data-local'
import { formatarDataISO } from '@/lib/calendario'

export function DashboardMobileInicio() {
  const { ordens, agendamentos } = useOficinaData()
  const { resumo } = useLembretes()
  const termos = useTermosOficina()
  const hoje = getDataLocalHoje()
  const hojeIso = formatarDataISO(new Date())

  const atalhos = useMemo(
    () =>
      [
        {
          to: '/ordens-servico?novo=1',
          label: 'Nova OS',
          icone: ClipboardPlus,
          destaque: true,
        },
        {
          to: '/clientes',
          label: 'Buscar cliente',
          icone: Search,
          destaque: false,
        },
        {
          to: '/motos',
          label: `Buscar ${termos.palavraVeiculo}`,
          icone: Bike,
          destaque: false,
        },
        {
          to: '/lembretes?filtro=para_hoje',
          label: 'Lembretes de hoje',
          icone: Bell,
          destaque: false,
        },
        {
          to: '/ordens-servico?abertas=1',
          label: 'OS em andamento',
          icone: ClipboardList,
          destaque: false,
        },
        {
          to: '/financeiro',
          label: 'Registrar pagamento',
          icone: Wallet,
          destaque: false,
        },
        {
          to: '/agenda',
          label: 'Agenda do dia',
          icone: CalendarDays,
          destaque: false,
        },
      ] as const,
    [termos.palavraVeiculo]
  )

  const osAndamento = useMemo(
    () =>
      ordens.filter(
        (o) =>
          o.status === 'em_servico' ||
          o.status === 'em_diagnostico' ||
          o.status === 'aguardando_peca' ||
          o.status === 'aguardando_aprovacao'
      ).length,
    [ordens]
  )

  const agendaHoje = useMemo(
    () => agendamentos.filter((a) => a.data === hojeIso).length,
    [agendamentos, hojeIso]
  )

  return (
    <Card className="mb-6 lg:hidden">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Ações rápidas</CardTitle>
        <p className="text-sm text-muted-foreground">
          {hoje.split('-').reverse().join('/')} · {osAndamento} OS em andamento ·{' '}
          {resumo.paraHoje.length} lembretes hoje · {agendaHoje} agendamentos
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2">
          {atalhos.map(({ to, label, icone: Icone, destaque }) => (
            <Button
              key={to}
              variant={destaque ? 'default' : 'outline'}
              size="lg"
              className="h-auto min-h-[4.25rem] flex-col gap-1.5 py-3 text-xs leading-tight"
              asChild
            >
              <Link to={to}>
                <Icone className="h-5 w-5 shrink-0" />
                {label}
              </Link>
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
