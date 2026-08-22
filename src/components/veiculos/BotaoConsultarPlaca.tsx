import { useState, type ComponentProps } from 'react'
import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  ehPlacaBrasileiraValida,
  MSG_PLACA_INVALIDA_CONSULTA,
  normalizarPlaca,
} from '@/lib/placa-normalizar'
import {
  MSG_CONSULTA_PLACA_PREPARACAO,
  type CamposVeiculoParaConsulta,
  type DadosBasicosVeiculoConsulta,
} from '@/services/veiculos/vehicle-plate-lookup.service'

export interface BotaoConsultarPlacaProps {
  placa: string
  disabled?: boolean
  /** Preparado para A2/A3 — não usado na A1. */
  onDadosEncontrados?: (dados: DadosBasicosVeiculoConsulta) => void
  /** Preparado para A3 — aviso de sobrescrita. */
  camposAtuais?: CamposVeiculoParaConsulta
  variant?: ComponentProps<typeof Button>['variant']
  size?: ComponentProps<typeof Button>['size']
  className?: string
}

/**
 * A1 — UI da consulta por placa sem API real.
 * Não preenche formulário, não salva e não chama Edge/externo.
 */
export function BotaoConsultarPlaca({
  placa,
  disabled = false,
  onDadosEncontrados: _onDadosEncontrados,
  camposAtuais: _camposAtuais,
  variant = 'outline',
  size = 'sm',
  className,
}: BotaoConsultarPlacaProps) {
  const [aberto, setAberto] = useState(false)
  const placaValida = ehPlacaBrasileiraValida(placa)
  const placaNorm = normalizarPlaca(placa)

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        disabled={disabled || !placaValida}
        title={
          placaValida
            ? 'Consultar dados básicos do veículo pela placa'
            : MSG_PLACA_INVALIDA_CONSULTA
        }
        className={className ?? 'shrink-0 whitespace-nowrap'}
        onClick={() => setAberto(true)}
      >
        <Search className="mr-1.5 h-3.5 w-3.5" aria-hidden />
        Consultar placa
      </Button>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent prioridadeAlta className="max-w-md">
          <DialogHeader>
            <DialogTitle>Consultar placa</DialogTitle>
            <DialogDescription>
              Em breve o BoxGestor poderá consultar a placa e preencher automaticamente os
              dados básicos do veículo.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            {placaNorm ? (
              <p className="text-muted-foreground">
                Placa informada:{' '}
                <span className="font-medium text-foreground">{placaNorm}</span>
              </p>
            ) : null}

            <p className="text-muted-foreground">{MSG_CONSULTA_PLACA_PREPARACAO}</p>

            <div>
              <p className="mb-1.5 font-medium text-foreground">
                Dados que poderão ser preenchidos:
              </p>
              <ul className="list-inside list-disc space-y-0.5 text-muted-foreground">
                <li>Marca</li>
                <li>Modelo</li>
                <li>Ano</li>
                <li>Cor</li>
                <li>Combustível</li>
                <li>Chassi, se permitido pela API</li>
                <li>Motor, se permitido pela API</li>
              </ul>
            </div>

            <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              A consulta será limitada a dados do veículo. Dados de proprietário, multas,
              débitos ou restrições não serão consultados.
            </p>
          </div>

          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => setAberto(false)}>
              Fechar
            </Button>
            <Button type="button" onClick={() => setAberto(false)}>
              Entendi
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
