import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { CampoKmEntrada } from '@/components/shared/CampoKmEntrada'
import { useTermosOficina } from '@/hooks/useTermosOficina'

interface QuilometragemOSSectionProps {
  entrada?: number
  saida?: number
  onChange: (dados: { quilometragem_entrada?: number; quilometragem_saida?: number }) => void
  erroEntrada?: string
}

export function QuilometragemOSSection({
  entrada,
  saida,
  onChange,
  erroEntrada,
}: QuilometragemOSSectionProps) {
  const termos = useTermosOficina()
  const percorrido =
    entrada !== undefined && saida !== undefined && saida >= entrada ? saida - entrada : null

  return (
    <div className="space-y-4 rounded-lg border border-border bg-muted/10 p-4">
      <div>
        <h4 className="text-sm font-semibold">KM de entrada</h4>
        <p className="text-xs text-muted-foreground">
          Registro de KM na entrada e saída {termos.artigoVeiculo}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <CampoKmEntrada
          id="km-entrada"
          obrigatorio
          value={entrada}
          erro={erroEntrada}
          onChange={(valor) =>
            onChange({
              quilometragem_entrada: valor,
              quilometragem_saida: saida,
            })
          }
        />
        <div className="grid gap-2">
          <Label htmlFor="km-saida">KM de saída</Label>
          <Input
            id="km-saida"
            type="number"
            min={0}
            placeholder="Ex: 38.120"
            value={saida === undefined || saida === 0 ? '' : saida}
            onChange={(e) =>
              onChange({
                quilometragem_entrada: entrada,
                quilometragem_saida: e.target.value ? Number(e.target.value) : undefined,
              })
            }
          />
        </div>
      </div>

      {percorrido !== null && (
        <p className="text-sm text-primary">
          Percorridos durante o serviço: {percorrido.toLocaleString('pt-BR')} km
        </p>
      )}
    </div>
  )
}
