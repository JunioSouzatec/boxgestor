import type { ConviteUsuario } from '@/services/auth/convites.service'
import { gerarLinkConvite } from '@/services/auth/convites.service'
import { getLabelPapel } from '@/types/auth'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Copy, Link2 } from 'lucide-react'
import { MSG } from '@/lib/mensagens-usuario'
import { formatarData } from '@/lib/utils'

interface ConvitePreparadoCardProps {
  convite: ConviteUsuario
  onCopiar?: () => void
  compacto?: boolean
}

export function ConvitePreparadoCard({
  convite,
  onCopiar,
  compacto = false,
}: ConvitePreparadoCardProps) {
  const link = gerarLinkConvite(convite.token)

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader className={compacto ? 'pb-2' : undefined}>
        <CardTitle className="text-base flex items-center gap-2">
          <Link2 className="h-4 w-4 text-primary" />
          {compacto ? 'Convite pendente' : 'Convite preparado'}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <p className="text-xs text-muted-foreground">Nome</p>
            <p className="font-medium">{convite.nome}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">E-mail</p>
            <p className="font-medium">{convite.email}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Cargo</p>
            <Badge variant="secondary">{getLabelPapel(convite.papel)}</Badge>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Status</p>
            <Badge variant="outline">Convite pendente</Badge>
          </div>
        </div>

        {!compacto && (
          <p className="text-xs text-muted-foreground">{MSG.conviteEnviarManualmente}</p>
        )}

        <div className="rounded-lg border border-border bg-background/80 p-3">
          <p className="mb-1 text-xs font-medium text-muted-foreground">Link de convite</p>
          <p className="break-all font-mono text-xs">{link}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Válido até {formatarData(convite.expira_em.slice(0, 10))}
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          className="gap-2"
          onClick={onCopiar}
        >
          <Copy className="h-4 w-4" />
          Copiar link
        </Button>
      </CardContent>
    </Card>
  )
}
