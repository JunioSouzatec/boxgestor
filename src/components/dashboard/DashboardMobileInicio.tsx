import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  ClipboardPlus,
  Search,
  Bell,
  ClipboardList,
  Wallet,
  CalendarDays,
} from 'lucide-react'
import { getIconeVeiculo } from '@/lib/termos-oficina'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useOficinaData } from '@/context/CraftContext'
import { useAuth } from '@/context/AuthContext'
import { useLembretes } from '@/context/LembretesContext'
import { useTermosOficina } from '@/hooks/useTermosOficina'
import { getDataLocalHoje } from '@/lib/data-local'
import { formatarDataISO } from '@/lib/calendario'
import { cn } from '@/lib/utils'
import {
  podeAcessarModuloUsuario,
  podeAcessarRotaFinanceiro,
  podeCriarOS,
} from '@/services/auth/permissions'

const CHIP_POR_ATALHO: Record<string, string> = {
  'Nova OS': 'bg-blue-500/15 text-blue-400',
  'Buscar cliente': 'bg-sky-500/15 text-sky-400',
  'Lembretes de hoje': 'bg-violet-500/15 text-violet-400',
  'OS em andamento': 'bg-indigo-500/15 text-indigo-400',
  'Registrar pagamento': 'bg-emerald-500/15 text-emerald-400',
  'Agenda do dia': 'bg-purple-500/15 text-purple-400',
}

export function DashboardMobileInicio() {
  const { ordens, agendamentos, configuracao } = useOficinaData()
  const { session } = useAuth()
  const { resumo } = useLembretes()
  const termos = useTermosOficina()
  const IconeVeiculo = getIconeVeiculo(termos.tipo)
  const user = session?.user
  const hoje = getDataLocalHoje()
  const hojeIso = formatarDataISO(new Date())

  const atalhos = useMemo(() => {
    if (!user) return []

    const lista = [
      podeCriarOS(user, configuracao) && {
        to: '/ordens-servico?novo=1',
        label: 'Nova OS',
        icone: ClipboardPlus,
        destaque: true,
      },
      podeAcessarModuloUsuario(user, 'clientes', configuracao) && {
        to: '/clientes',
        label: 'Buscar cliente',
        icone: Search,
        destaque: false,
      },
      podeAcessarModuloUsuario(user, 'motos', configuracao) && {
        to: '/motos',
        label: `Buscar ${termos.palavraVeiculo}`,
        icone: IconeVeiculo,
        destaque: false,
      },
      podeAcessarModuloUsuario(user, 'lembretes', configuracao) && {
        to: '/lembretes?filtro=para_hoje',
        label: 'Lembretes de hoje',
        icone: Bell,
        destaque: false,
      },
      podeAcessarModuloUsuario(user, 'ordens_servico', configuracao) && {
        to: '/ordens-servico?abertas=1',
        label: 'OS em andamento',
        icone: ClipboardList,
        destaque: false,
      },
      podeAcessarRotaFinanceiro(user, configuracao) && {
        to: '/financeiro',
        label: 'Registrar pagamento',
        icone: Wallet,
        destaque: false,
      },
      podeAcessarModuloUsuario(user, 'agenda', configuracao) && {
        to: '/agenda',
        label: 'Agenda do dia',
        icone: CalendarDays,
        destaque: false,
      },
    ]

    return lista.filter(Boolean) as {
      to: string
      label: string
      icone: typeof ClipboardPlus
      destaque: boolean
    }[]
  }, [user, configuracao, termos.palavraVeiculo, IconeVeiculo])

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

  if (atalhos.length === 0) return null

  return (
    <Card className="mb-6 border-zinc-700/50 bg-zinc-900/90 shadow-[0_1px_3px_rgba(0,0,0,0.35)] lg:hidden">
      <CardHeader className="pb-3">
        <CardTitle className="text-base text-zinc-50">Ações rápidas</CardTitle>
        <p className="text-sm text-zinc-400">
          {hoje.split('-').reverse().join('/')} · {osAndamento} OS em andamento ·{' '}
          {resumo.paraHoje.length} lembretes hoje · {agendaHoje} agendamentos
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2">
          {atalhos.map(({ to, label, icone: Icone, destaque }) => {
            const chip =
              CHIP_POR_ATALHO[label] ?? 'bg-slate-500/15 text-slate-300'
            return (
              <Link
                key={to}
                to={to}
                className={cn(
                  'flex min-h-[4.25rem] min-w-0 flex-col items-center justify-center gap-1.5 rounded-xl border px-2 py-3 text-center text-xs font-medium leading-tight transition-all',
                  'border-zinc-700/50 bg-zinc-950/50 text-zinc-100 hover:border-zinc-600 hover:bg-zinc-900',
                  destaque && 'border-blue-500/35 bg-blue-950/30'
                )}
              >
                <span className={cn('rounded-lg p-2', chip)}>
                  <Icone className="h-5 w-5 shrink-0" />
                </span>
                <span className="min-w-0 break-words">{label}</span>
              </Link>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
