import { ShieldX } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { mensagemSemPermissao } from '@/services/assinatura/plano-features'
import { getRotaInicialComPlano } from '@/services/assinatura/plano-features'
import { useAuth } from '@/context/AuthContext'
import { useAssinatura } from '@/context/AssinaturaContext'

interface TelaSemPermissaoProps {
  tituloPagina?: string
}

export function TelaSemPermissao({ tituloPagina }: TelaSemPermissaoProps) {
  const { session } = useAuth()
  const { plano } = useAssinatura()
  const papel = session?.user.papel ?? 'recepcao'
  const rotaInicial = getRotaInicialComPlano(papel, plano)

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center px-4 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted/30">
        <ShieldX className="h-7 w-7 text-muted-foreground" />
      </div>
      <h2 className="text-lg font-semibold">Acesso restrito</h2>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">{mensagemSemPermissao()}</p>
      {tituloPagina && (
        <p className="mt-1 text-xs text-muted-foreground">Área: {tituloPagina}</p>
      )}
      <Button asChild className="mt-6" variant="outline">
        <Link to={rotaInicial}>Voltar ao início</Link>
      </Button>
    </div>
  )
}
