import { Label } from '@/components/ui/label'
import { SearchableCombobox } from '@/components/ui/searchable-combobox'
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
 * Marca/Modelo pesquisáveis (combobox).
 * - Clique abre as opções com o valor atual visível.
 * - Troca direta sem precisar apagar o texto.
 * - Digitação filtra; texto livre e "Outro" continuam permitidos.
 * - Ao trocar a marca, limpa só modelo sugerido incompatível.
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
  const marcas = marcasPorTipo(tipo)
  const modelos = modelosPorMarca(tipo, marca)

  return (
    <>
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-marca`}>Marca *</Label>
        <SearchableCombobox
          id={`${idPrefix}-marca`}
          value={marca}
          options={marcas}
          placeholder={marcaPlaceholder ?? 'Buscar ou escolher marca'}
          onChange={(valor) => {
            const novaMarca = valorManualOuVazio(valor)
            const modeloResolvido = resolverModeloAoTrocarMarca(tipo, marca, novaMarca, modelo)
            onChange({ marca: novaMarca, modelo: modeloResolvido })
          }}
        />
        <p className="text-xs text-muted-foreground">
          Clique para abrir a lista, escolha outra opção ou digite. &quot;Outro&quot; abre texto livre.
        </p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-modelo`}>Modelo *</Label>
        <SearchableCombobox
          id={`${idPrefix}-modelo`}
          value={modelo}
          options={modelos}
          placeholder={modeloPlaceholder ?? 'Buscar ou escolher modelo'}
          onChange={(valor) => onChange({ marca, modelo: valorManualOuVazio(valor) })}
        />
        <p className="text-xs text-muted-foreground">
          Clique para abrir a lista, escolha outro modelo ou digite. &quot;Outro&quot; não é gravado.
        </p>
      </div>
    </>
  )
}
