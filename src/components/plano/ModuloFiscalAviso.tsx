import { Link } from 'react-router-dom'
import { FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  AVISO_CUSTOS_EXTERNOS_FISCAL,
  MSG_FISCAL_ADICIONAL_BLOQUEADO,
  PRECO_MODULO_FISCAL_LABEL,
} from '@/types/plano'

interface ModuloFiscalAvisoProps {
  compacto?: boolean
}

/** Aviso comercial quando o adicional fiscal não está ativo. */
export function ModuloFiscalAviso({ compacto = false }: ModuloFiscalAvisoProps) {
  if (compacto) {
    return (
      <p className="text-sm text-muted-foreground">
        {MSG_FISCAL_ADICIONAL_BLOQUEADO} {AVISO_CUSTOS_EXTERNOS_FISCAL}
      </p>
    )
  }

  return (
    <Card className="border-amber-500/30 bg-amber-500/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="h-5 w-5" />
          Módulo Fiscal adicional
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">{MSG_FISCAL_ADICIONAL_BLOQUEADO}</p>
        <p>
          Dados fiscais, rascunhos e conferência fiscal ficam disponíveis quando o adicional
          estiver ativo ({PRECO_MODULO_FISCAL_LABEL} por oficina). Fiscal em preparação para
          emissão — a integração fiscal está em evolução.
        </p>
        <p>{AVISO_CUSTOS_EXTERNOS_FISCAL}</p>
        <p>
          O módulo não promete emissão fiscal pronta nem nota automática enquanto a homologação
          não estiver concluída.
        </p>
        <Button asChild variant="outline" size="sm">
          <Link to="/planos">Ver planos e adicionais</Link>
        </Button>
      </CardContent>
    </Card>
  )
}
