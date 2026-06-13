import { User, Phone, MapPin, FileText } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BadgeVIP } from '@/components/portal-cliente/BadgeVIP'
import { formatarTelefone } from '@/lib/utils'
import type { Cliente } from '@/types'
import type { NivelVIP } from '@/types/portal-cliente'

interface FichaClienteCardProps {
  cliente: Cliente
  nivelVip: NivelVIP
}

export function FichaClienteCard({ cliente, nivelVip }: FichaClienteCardProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <User className="h-5 w-5 text-primary" />
            Dados pessoais
          </CardTitle>
          <BadgeVIP nivel={nivelVip} />
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-xs text-muted-foreground">Nome</p>
          <p className="font-medium">{cliente.nome}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">CPF</p>
          <p className="font-medium">{cliente.cpf ?? '—'}</p>
        </div>
        <div className="flex items-start gap-2 sm:col-span-2">
          <Phone className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-xs text-muted-foreground">Telefone</p>
            <p className="font-medium">{formatarTelefone(cliente.telefone)}</p>
          </div>
        </div>
        <div className="flex items-start gap-2 sm:col-span-2">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-xs text-muted-foreground">Endereço</p>
            <p className="font-medium">{cliente.endereco || '—'}</p>
          </div>
        </div>
        {cliente.observacoes && (
          <div className="flex items-start gap-2 sm:col-span-2">
            <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Observações</p>
              <p className="text-sm">{cliente.observacoes}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
