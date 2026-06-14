import { useCraft, useOficinaData } from '@/context/CraftContext'
import { useAssinatura } from '@/context/AssinaturaContext'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { getLabelPlano, normalizarPlanoTier } from '@/types/plano'
import { obterNomeExibidoOficina } from '@/lib/oficina-marca'

export function AdminOficinasCard() {
  const { oficinaId } = useCraft()
  const { configuracao } = useOficinaData()
  const { plano, assinatura } = useAssinatura()
  const planoNorm = normalizarPlanoTier(plano)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Oficinas cadastradas</CardTitle>
        <CardDescription>
          Visão preparada para suporte multi-oficina. Por enquanto, exibe a oficina da sessão
          atual.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/30">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Oficina</th>
                <th className="px-4 py-2 text-left font-medium">Plano</th>
                <th className="px-4 py-2 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-border">
                <td className="px-4 py-3">
                  <p className="font-medium">{obterNomeExibidoOficina(configuracao)}</p>
                  <p className="text-xs text-muted-foreground font-mono">{oficinaId}</p>
                </td>
                <td className="px-4 py-3">
                  <Badge variant="outline">{getLabelPlano(planoNorm)}</Badge>
                </td>
                <td className="px-4 py-3">
                  <Badge variant="success">Ativa</Badge>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Atualizado {new Date(assinatura.updated_at).toLocaleDateString('pt-BR')}
                  </p>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
