import { useId } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { TipoVeiculo } from '@/lib/veiculo-campos-sync'
import {
  marcasPorTipo,
  modelosPorMarca,
  resolverModeloAoTrocarMarca,
  valorManualOuVazio,
} from '@/data/veiculos/marcas-modelos'

interface CamposMarcaModeloProps {
  tipo?: TipoVeiculo
  marca: string
  modelo: string
  onChange: (next: { marca: string; modelo: string }) => void
  idPrefix?: string
  marcaPlaceholder?: string
  modeloPlaceholder?: string
}

/**
 * Campos Marca/Modelo com sugestões (datalist).
 * - Sugestões conforme o tipo de veículo (carro/moto).
 * - Texto livre sempre permitido ("Outro" = digitar qualquer valor).
 * - Ao trocar a marca, limpa apenas modelo sugerido incompatível (preserva customizado).
 */
export function CamposMarcaModelo({
  tipo,
  marca,
  modelo,
  onChange,
  idPrefix = 'veiculo',
  marcaPlaceholder,
  modeloPlaceholder,
}: CamposMarcaModeloProps) {
  const uid = useId()
  const listaMarcasId = `${idPrefix}-marcas-${uid}`
  const listaModelosId = `${idPrefix}-modelos-${uid}`
  const marcas = marcasPorTipo(tipo)
  const modelos = modelosPorMarca(tipo, marca)

  return (
    <>
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-marca`}>Marca *</Label>
        <Input
          id={`${idPrefix}-marca`}
          list={listaMarcasId}
          value={marca}
          placeholder={marcaPlaceholder}
          autoComplete="off"
          onChange={(e) => {
            const novaMarca = valorManualOuVazio(e.target.value)
            const modeloResolvido = resolverModeloAoTrocarMarca(tipo, marca, novaMarca, modelo)
            onChange({ marca: novaMarca, modelo: modeloResolvido })
          }}
        />
        <datalist id={listaMarcasId}>
          {marcas.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
        <p className="text-xs text-muted-foreground">
          Escolha na lista ou digite outra marca. &quot;Outro&quot; só abre o campo para texto livre.
        </p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-modelo`}>Modelo *</Label>
        <Input
          id={`${idPrefix}-modelo`}
          list={listaModelosId}
          value={modelo}
          placeholder={modeloPlaceholder}
          autoComplete="off"
          onChange={(e) => onChange({ marca, modelo: valorManualOuVazio(e.target.value) })}
        />
        <datalist id={listaModelosId}>
          {modelos.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
        <p className="text-xs text-muted-foreground">
          Escolha na lista ou digite outro modelo. &quot;Outro&quot; não é gravado — digite o nome real.
        </p>
      </div>
    </>
  )
}
