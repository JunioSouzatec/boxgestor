import { RefreshCw } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useAppVersionCheck } from '@/hooks/useAppVersionCheck'

const ROTAS_SENSIVEIS = [
  '/ordens-servico',
  '/caixa',
  '/financeiro',
  '/estoque',
  '/configuracoes',
]

function rotaSensivel(pathname: string): boolean {
  return ROTAS_SENSIVEIS.some(
    (r) => pathname === r || pathname.startsWith(`${r}/`)
  )
}

export function NovaVersaoBanner() {
  const location = useLocation()
  const { visivel, adiar, atualizarAgora } = useAppVersionCheck()
  const sensivel = rotaSensivel(location.pathname)

  if (!visivel) return null

  const mensagem = sensivel
    ? 'Nova versão disponível. Salve OS, pagamentos, caixa ou estoque antes de atualizar.'
    : 'Nova versão disponível. Salve o que estiver fazendo e clique em Atualizar.'

  return (
    <div
      role="status"
      className="sticky top-16 z-30 border-b border-amber-500/40 bg-amber-500/15 px-4 py-2.5 text-amber-950 dark:text-amber-50 sm:px-6"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-medium leading-snug">{mensagem}</p>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" onClick={adiar}>
            Depois
          </Button>
          <Button size="sm" className="gap-1.5" onClick={atualizarAgora}>
            <RefreshCw className="h-3.5 w-3.5" />
            Atualizar agora
          </Button>
        </div>
      </div>
    </div>
  )
}
