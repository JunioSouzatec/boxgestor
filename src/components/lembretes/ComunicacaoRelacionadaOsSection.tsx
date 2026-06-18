import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { HistoricoComunicacaoLista } from '@/components/lembretes/HistoricoComunicacaoLista'
import { useLembretes } from '@/context/LembretesContext'
import { useOficinaData } from '@/context/CraftContext'

interface ComunicacaoRelacionadaOsSectionProps {
  ordemServicoId: string
  className?: string
}

export function ComunicacaoRelacionadaOsSection({
  ordemServicoId,
  className,
}: ComunicacaoRelacionadaOsSectionProps) {
  const { listarHistoricoPorOS, listarPorOS } = useLembretes()
  const { clientes, motos } = useOficinaData()

  const lembretes = listarPorOS(ordemServicoId)
  const historico = listarHistoricoPorOS(ordemServicoId)

  if (lembretes.length === 0 && historico.length === 0) return null

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Comunicação relacionada</CardTitle>
        <CardDescription>
          Lembretes e contatos vinculados a esta ordem de serviço
        </CardDescription>
      </CardHeader>
      <CardContent>
        {lembretes.length > 0 && (
          <p className="mb-3 text-sm text-muted-foreground">
            {lembretes.length} lembrete(s) vinculado(s) a esta OS.
          </p>
        )}
        <HistoricoComunicacaoLista
          itens={historico}
          clientes={clientes}
          motos={motos}
          mostrarCliente={false}
          mostrarMoto
          mostrarOs={false}
          vazio="Nenhum contato registrado para esta OS."
        />
      </CardContent>
    </Card>
  )
}
