import { Archive } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MSG } from '@/lib/mensagens-usuario'
import { useAuth } from '@/context/AuthContext'

export function OficinaArquivadaScreen() {
  const { logout } = useAuth()

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="max-w-lg w-full border-amber-500/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Archive className="h-5 w-5 text-amber-400" />
            Oficina arquivada
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{MSG.oficinaArquivada}</p>
          <p className="text-xs text-muted-foreground">
            Não é possível criar OS, cadastrar clientes, registrar pagamentos ou solicitar upgrade
            enquanto a conta estiver arquivada. Entre em contato com o suporte do BoxGestor para
            reativar sua oficina.
          </p>
          <Button type="button" variant="outline" onClick={() => void logout()}>
            Sair da conta
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
