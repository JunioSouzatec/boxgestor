import { Crown, Clock } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import {
  mensagemRecursoSuperior,
  mensagemTesteExpirado,
  getRotaInicialComAssinatura,
} from '@/services/assinatura/plano-features'
import { useAuth } from '@/context/AuthContext'
import { useAssinatura } from '@/context/AssinaturaContext'
import { MSG } from '@/lib/mensagens-usuario'

interface TelaRecursoPremiumProps {
  tituloPagina?: string
}

export function TelaRecursoPremium({ tituloPagina }: TelaRecursoPremiumProps) {
  const { session } = useAuth()
  const { assinatura, testeExpirado } = useAssinatura()
  const papel = session?.user.papel ?? 'recepcao'
  const rotaInicial = getRotaInicialComAssinatura(papel, assinatura)
  const Icone = testeExpirado ? Clock : Crown

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center px-4 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
        <Icone className="h-7 w-7 text-primary" />
      </div>
      <h2 className="text-lg font-semibold">
        {testeExpirado ? MSG.testePremiumEncerrado : 'Plano superior necessário'}
      </h2>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        {testeExpirado ? mensagemTesteExpirado() : mensagemRecursoSuperior()}
      </p>
      {testeExpirado && (
        <p className="mt-2 max-w-md text-sm text-muted-foreground">{MSG.testePremiumEscolherPlano}</p>
      )}
      {tituloPagina && (
        <p className="mt-1 text-xs text-muted-foreground">Área: {tituloPagina}</p>
      )}
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Button asChild variant="outline">
          <Link to={rotaInicial}>Voltar ao início</Link>
        </Button>
        {papel === 'dono' && (
          <Button asChild>
            <Link to="/planos">Ver planos</Link>
          </Button>
        )}
      </div>
    </div>
  )
}
