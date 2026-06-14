import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { limparFallbackLocalStorage } from '@/lib/craft-auth-fallback'

interface AuthFallbackScreenProps {
  titulo?: string
  mensagem?: string
}

export function AuthFallbackScreen({
  titulo = 'Não foi possível conectar ao Supabase Auth',
  mensagem,
}: AuthFallbackScreenProps) {
  const { erroAuth, recarregarAuth, ativarModoLocalFallback, estadoAuth } = useAuth()

  const texto =
    mensagem ??
    erroAuth ??
    'Ocorreu um erro ao carregar sua sessão. Seus dados locais foram preservados.'

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="max-w-lg w-full border-destructive/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-5 w-5 text-amber-400" />
            {titulo}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{texto}</p>
          {estadoAuth === 'erro' && (
            <p className="text-xs text-muted-foreground">
              Verifique sua conexão, as variáveis Supabase em .env.local e se o SQL de RLS foi
              executado. Você pode voltar ao modo local demo sem perder dados.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="button" className="gap-2" onClick={() => void recarregarAuth()}>
              <RefreshCw className="h-4 w-4" />
              Tentar novamente
            </Button>
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              onClick={() => void ativarModoLocalFallback()}
            >
              <Home className="h-4 w-4" />
              Voltar para modo local
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            O modo local usa <code className="text-primary">localStorage</code> e a conta demo. Para
            reativar Supabase depois, altere .env.local e{' '}
            <button
              type="button"
              className="text-primary hover:underline"
              onClick={() => {
                limparFallbackLocalStorage()
                window.location.reload()
              }}
            >
              limpe o fallback
            </button>
            .
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

function CarregandoAuth() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center">
        <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Carregando autenticação...</p>
      </div>
    </div>
  )
}

export { CarregandoAuth }
