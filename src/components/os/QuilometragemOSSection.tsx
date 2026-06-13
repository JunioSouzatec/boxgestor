import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'

interface QuilometragemOSSectionProps {
  entrada?: number
  saida?: number
  onChange: (dados: { quilometragem_entrada?: number; quilometragem_saida?: number }) => void
}

export function QuilometragemOSSection({ entrada, saida, onChange }: QuilometragemOSSectionProps) {
  const percorrido =
    entrada !== undefined && saida !== undefined && saida >= entrada ? saida - entrada : null

  return (
    <div className="space-y-4 rounded-lg border border-border bg-muted/10 p-4">
      <div>
        <h4 className="text-sm font-semibold">Quilometragem</h4>
        <p className="text-xs text-muted-foreground">Registro de KM na entrada e saída</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="km-entrada">KM de entrada</Label>
          <Input
            id="km-entrada"
            type="number"
            min={0}
            value={entrada ?? ''}
            onChange={(e) =>
              onChange({
                quilometragem_entrada: e.target.value ? Number(e.target.value) : undefined,
                quilometragem_saida: saida,
              })
            }
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="km-saida">KM de saída</Label>
          <Input
            id="km-saida"
            type="number"
            min={0}
            value={saida ?? ''}
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
