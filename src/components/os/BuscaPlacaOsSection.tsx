import { useMemo, useState } from 'react'
import { Car, History, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { normalizarPlaca } from '@/lib/placa-normalizar'
import {
  buscarVeiculosPorPlaca,
  type ResultadoBuscaPlaca,
} from '@/services/busca-placa.service'
import { formatarData, formatarMoeda } from '@/lib/utils'
import type { Cliente, Moto, OrdemServico } from '@/types'

interface BuscaPlacaOsSectionProps {
  motos: Moto[]
  clientes: Cliente[]
  ordens: OrdemServico[]
  motoSelecionadaId?: string
  exibirFinanceiro: boolean
  labelVeiculo?: string
  onUsarVeiculo: (moto: Moto) => void
  onVerHistoricoCompleto: (moto: Moto) => void
  onFiltrarPorPlaca: (placa: string) => void
}

function ResultadoPlacaCard({
  resultado,
  exibirFinanceiro,
  motoSelecionadaId,
  onUsar,
  onVerHistorico,
  onFiltrar,
}: {
  resultado: ResultadoBuscaPlaca
  exibirFinanceiro: boolean
  motoSelecionadaId?: string
  onUsar: () => void
  onVerHistorico: () => void
  onFiltrar: () => void
}) {
  const { moto, cliente, quantidadeOs, dataUltimaOs, historicoRecente } = resultado
  const jaSelecionado = motoSelecionadaId === moto.id

  return (
    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
            Veículo encontrado no histórico
          </p>
          <p className="mt-1 text-sm">
            <span className="font-medium">{moto.placa}</span>
            {' · '}
            {moto.marca} {moto.modelo}
            {moto.ano ? ` (${moto.ano})` : ''}
          </p>
        </div>
        {jaSelecionado && (
          <Badge variant="secondary" className="text-xs">
            Selecionado
          </Badge>
        )}
      </div>

      <div className="grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
        <p>
          <span className="text-foreground/80">Cliente:</span> {cliente?.nome ?? '—'}
        </p>
        <p>
          <span className="text-foreground/80">Telefone:</span> {cliente?.telefone?.trim() || '—'}
        </p>
        <p>
          <span className="text-foreground/80">OS anteriores:</span> {quantidadeOs}
        </p>
        <p>
          <span className="text-foreground/80">Última OS:</span>{' '}
          {dataUltimaOs ? formatarData(dataUltimaOs) : '—'}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {!jaSelecionado && (
          <Button type="button" size="sm" onClick={onUsar}>
            Usar este veículo
          </Button>
        )}
        {quantidadeOs > 0 && (
          <>
            <Button type="button" variant="outline" size="sm" onClick={onVerHistorico}>
              <History className="h-4 w-4" />
              Ver histórico completo
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={onFiltrar}>
              Filtrar OS por placa
            </Button>
          </>
        )}
      </div>

      {historicoRecente.length > 0 && (
        <div className="space-y-2 border-t border-border/60 pt-3">
          <p className="text-xs font-medium text-muted-foreground">Últimas OS deste veículo</p>
          <div className="space-y-2">
            {historicoRecente.map((item) => (
              <div
                key={item.os.id}
                className="rounded-md border border-border/50 bg-background/60 px-3 py-2 text-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">
                    {item.os.modo_documento === 'orcamento' ? 'Orç.' : 'OS'} #{item.os.numero}
                  </span>
                  <Badge variant="outline" className="text-[10px]">
                    {item.statusLabel}
                  </Badge>
                </div>
                <p className="mt-1 text-muted-foreground truncate" title={item.resumoServico}>
                  {item.resumoServico}
                </p>
                <div className="mt-1 flex flex-wrap gap-2 text-muted-foreground">
                  <span>{formatarData(item.dataEntrada)}</span>
                  {exibirFinanceiro && (
                    <span>{formatarMoeda(item.totalGeral)}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ListaResultadosPlaca({
  resultados,
  motoSelecionadaId,
  onUsar,
  onVerHistorico,
  onFiltrar,
}: {
  resultados: ResultadoBuscaPlaca[]
  exibirFinanceiro: boolean
  motoSelecionadaId?: string
  onUsar: (moto: Moto) => void
  onVerHistorico: (moto: Moto) => void
  onFiltrar: (placa: string) => void
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-muted-foreground">
        {resultados.length} veículo{resultados.length !== 1 ? 's' : ''} encontrado
        {resultados.length !== 1 ? 's' : ''} — escolha qual usar
      </p>
      {resultados.map((resultado) => (
        <div
          key={resultado.moto.id}
          className="rounded-lg border border-border bg-muted/10 p-3 space-y-2"
        >
          <div className="flex flex-wrap items-start justify-between gap-2 text-sm">
            <div>
              <p className="font-medium">
                {resultado.moto.placa} · {resultado.moto.marca} {resultado.moto.modelo}
              </p>
              <p className="text-muted-foreground">
                {resultado.cliente?.nome ?? '—'}
                {resultado.cliente?.telefone ? ` · ${resultado.cliente.telefone}` : ''}
              </p>
            </div>
            <div className="text-xs text-muted-foreground text-right">
              <p>{resultado.quantidadeOs} OS</p>
              {resultado.dataUltimaOs && (
                <p>Última: {formatarData(resultado.dataUltimaOs)}</p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={motoSelecionadaId === resultado.moto.id ? 'secondary' : 'default'}
              disabled={motoSelecionadaId === resultado.moto.id}
              onClick={() => onUsar(resultado.moto)}
            >
              Usar este veículo
            </Button>
            {resultado.quantidadeOs > 0 && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onVerHistorico(resultado.moto)}
              >
                Ver histórico
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => onFiltrar(resultado.moto.placa)}
            >
              Filtrar OS
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}

export function BuscaPlacaOsSection({
  motos,
  clientes,
  ordens,
  motoSelecionadaId,
  exibirFinanceiro,
  labelVeiculo = 'veículo',
  onUsarVeiculo,
  onVerHistoricoCompleto,
  onFiltrarPorPlaca,
}: BuscaPlacaOsSectionProps) {
  const [placaBusca, setPlacaBusca] = useState('')

  const resultados = useMemo(
    () => buscarVeiculosPorPlaca(placaBusca, motos, clientes, ordens),
    [placaBusca, motos, clientes, ordens]
  )

  const norm = normalizarPlaca(placaBusca)
  const buscaAtiva = norm.length >= 3

  return (
    <div className="sm:col-span-2 rounded-lg border border-border bg-muted/10 p-4 space-y-3">
      <div className="flex items-start gap-2">
        <Car className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="space-y-1">
          <h4 className="text-sm font-semibold">Buscar por placa</h4>
          <p className="text-xs text-muted-foreground">
            Digite a placa para localizar {labelVeiculo}, cliente e histórico interno da oficina.
          </p>
        </div>
      </div>

      <div className="grid gap-2 max-w-sm">
        <Label htmlFor="busca-placa-os">Placa</Label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="busca-placa-os"
            value={placaBusca}
            onChange={(e) => setPlacaBusca(e.target.value.toUpperCase())}
            placeholder="Ex.: ABC1D23 ou ABC-1234"
            className="pl-9 uppercase"
            autoComplete="off"
          />
        </div>
      </div>

      {!buscaAtiva && placaBusca.trim().length > 0 && (
        <p className="text-xs text-muted-foreground">Digite pelo menos 3 caracteres da placa.</p>
      )}

      {buscaAtiva && resultados.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nenhum veículo encontrado no histórico. Você pode cadastrar normalmente.
        </p>
      )}

      {buscaAtiva && resultados.length === 1 && (
        <ResultadoPlacaCard
          resultado={resultados[0]}
          exibirFinanceiro={exibirFinanceiro}
          motoSelecionadaId={motoSelecionadaId}
          onUsar={() => onUsarVeiculo(resultados[0].moto)}
          onVerHistorico={() => onVerHistoricoCompleto(resultados[0].moto)}
          onFiltrar={() => onFiltrarPorPlaca(resultados[0].moto.placa)}
        />
      )}

      {buscaAtiva && resultados.length > 1 && (
        <ListaResultadosPlaca
          resultados={resultados}
          exibirFinanceiro={exibirFinanceiro}
          motoSelecionadaId={motoSelecionadaId}
          onUsar={onUsarVeiculo}
          onVerHistorico={onVerHistoricoCompleto}
          onFiltrar={onFiltrarPorPlaca}
        />
      )}
    </div>
  )
}
