import { Wifi, WifiOff } from 'lucide-react'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { cn } from '@/lib/utils'

interface IndicadorConexaoProps {
  className?: string
}

export function IndicadorConexao({ className }: IndicadorConexaoProps) {
  const online = useOnlineStatus()

  return (
    <div
      className={cn(
        'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
        online
          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
          : 'border-amber-500/30 bg-amber-500/10 text-amber-400',
        className
      )}
      title={online ? 'Conectado à internet' : 'Sem conexão com a internet'}
    >
      {online ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
      <span>{online ? 'Online' : 'Offline'}</span>
    </div>
  )
}

export function AvisoModoOffline() {
  const online = useOnlineStatus()
  if (online) return null

  return (
    <div
      className="border-b border-amber-500/20 bg-amber-500/5 px-4 py-2 text-center text-xs text-amber-200/90 sm:text-sm"
      role="status"
    >
      Modo offline: os dados serão sincronizados quando a internet voltar.
    </div>
  )
}
