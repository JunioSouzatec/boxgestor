import { useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { ArrowLeft, Bike, Shield, Bell, Gauge } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { RecursoPlanoGate } from '@/components/plano/RecursoPlanoGate'
import { FichaClienteCard } from '@/components/portal-cliente/FichaClienteCard'
import { ResumoFinanceiroClienteCard } from '@/components/portal-cliente/ResumoFinanceiroClienteCard'
import { FidelizacaoClienteCard } from '@/components/portal-cliente/FidelizacaoClienteCard'
import { TimelineMoto } from '@/components/portal-cliente/TimelineMoto'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useAuth } from '@/context/AuthContext'
import { useCraft, useOficinaData } from '@/context/CraftContext'
import { comunicacaoService } from '@/services/comunicacao/comunicacao.service'
import { lembretesService } from '@/services/lembretes/lembretes.service'
import {
  montarFichaCliente,
  montarTimelineMoto,
  podeVerApenasTimelineMoto,
} from '@/services/portal-cliente/portal-cliente.service'
import { formatarData, formatarMoeda } from '@/lib/utils'
import { calcularTotalGeralDeCampos } from '@/services/os-financeiro.service'
import { StatusOSBadge } from '@/components/shared/StatusBadges'
import { getLabelStatusLembrete } from '@/types/lembrete'

function PortalClienteDetalheConteudo() {
  const { clienteId } = useParams<{ clienteId: string }>()
  const { session } = useAuth()
  const { oficinaId } = useCraft()
  const { clientes, motos, ordens } = useOficinaData()
  const [motoTimelineId, setMotoTimelineId] = useState<string>('')

  const papel = session?.user.papel ?? 'recepcao'
  const somenteTimeline = podeVerApenasTimelineMoto(papel)

  const lembretes = useMemo(
    () => lembretesService.listarLembretes(oficinaId),
    [oficinaId]
  )
  const contatos = useMemo(
    () => comunicacaoService.listarHistorico(oficinaId),
    [oficinaId]
  )

  const cliente = clientes.find((c) => c.id === clienteId)

  const ficha = useMemo(() => {
    if (!cliente) return null
    return montarFichaCliente(cliente, motos, ordens, contatos, lembretes)
  }, [cliente, motos, ordens, contatos, lembretes])

  const motoSelecionada =
    ficha?.motos.find((m) => m.id === (motoTimelineId || ficha.motos[0]?.id)) ?? ficha?.motos[0]

  const timelineMoto = useMemo(() => {
    if (!ficha || !motoSelecionada) return []
    const label = `${motoSelecionada.marca} ${motoSelecionada.modelo} (${motoSelecionada.placa})`
    return montarTimelineMoto(
      motoSelecionada.id,
      label,
      ficha.ordens,
      contatos.filter((c) => c.cliente_id === cliente!.id),
      lembretes.filter((l) => l.cliente_id === cliente!.id)
    )
  }, [ficha, motoSelecionada, contatos, lembretes, cliente])

  if (!clienteId || !cliente || !ficha) {
    return <Navigate to="/portal-cliente" replace />
  }

  if (somenteTimeline) {
    return (
      <div>
        <PageHeader
          titulo={cliente.nome}
          descricao="Histórico da moto"
          acoes={
            <Button variant="outline" size="sm" asChild>
              <Link to="/portal-cliente">
                <ArrowLeft className="h-4 w-4" />
                Voltar
              </Link>
            </Button>
          }
        />

        {ficha.motos.length > 1 && (
          <div className="mb-4 max-w-xs">
            <Select
              value={motoSelecionada?.id ?? ''}
              onValueChange={setMotoTimelineId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecionar moto" />
              </SelectTrigger>
              <SelectContent>
                {ficha.motos.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.marca} {m.modelo} · {m.placa}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <TimelineMoto
          eventos={timelineMoto}
          titulo="Timeline da moto"
          motoLabel={
            motoSelecionada
              ? `${motoSelecionada.marca} ${motoSelecionada.modelo} · ${motoSelecionada.placa}`
              : undefined
          }
        />
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        titulo={cliente.nome}
        descricao="Central do Cliente — ficha completa"
        acoes={
          <Button variant="outline" size="sm" asChild>
            <Link to="/portal-cliente">
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Link>
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <FichaClienteCard cliente={ficha.cliente} nivelVip={ficha.nivel_vip} />
        <ResumoFinanceiroClienteCard resumo={ficha.resumo_financeiro} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Bike className="h-5 w-5 text-primary" />
              Motos cadastradas
            </CardTitle>
          </CardHeader>
          <CardContent>
            {ficha.motos.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma moto cadastrada.</p>
            ) : (
              <ul className="space-y-2">
                {ficha.motos.map((m) => (
                  <li
                    key={m.id}
                    className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm"
                  >
                    <p className="font-medium">
                      {m.marca} {m.modelo} · {m.placa}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {m.ano} · {m.cor}
                      {m.quilometragem != null && (
                        <> · {m.quilometragem.toLocaleString('pt-BR')} km</>
                      )}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Shield className="h-5 w-5 text-amber-400" />
              Garantias ativas
            </CardTitle>
          </CardHeader>
          <CardContent>
            {ficha.garantias_ativas.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma garantia ativa.</p>
            ) : (
              <ul className="space-y-2">
                {ficha.garantias_ativas.map((g) => (
                  <li
                    key={g.id}
                    className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm"
                  >
                    <p className="font-medium">OS vinculada · {g.dias_garantia} dias</p>
                    <p className="text-xs text-muted-foreground">
                      Válida até {formatarData(g.data_vencimento)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Bell className="h-5 w-5 text-cyan-400" />
              Próximos lembretes
            </CardTitle>
          </CardHeader>
          <CardContent>
            {ficha.lembretes_proximos.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum lembrete pendente.</p>
            ) : (
              <ul className="space-y-2">
                {ficha.lembretes_proximos.slice(0, 5).map((l) => (
                  <li
                    key={l.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm"
                  >
                    <span>{l.servico}</span>
                    <Badge variant="outline">{getLabelStatusLembrete(l.status)}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Gauge className="h-5 w-5" />
              Quilometragem registrada
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Moto</TableHead>
                    <TableHead>Km</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ficha.quilometragens.slice(0, 6).map((q, i) => (
                    <TableRow key={`${q.moto_id}-${q.data}-${i}`}>
                      <TableCell>{formatarData(q.data)}</TableCell>
                      <TableCell className="max-w-[140px] truncate text-xs">{q.moto_label}</TableCell>
                      <TableCell>{q.quilometragem.toLocaleString('pt-BR')} km</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Histórico de serviços</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>OS</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ficha.ordens.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
                        Nenhuma ordem de serviço.
                      </TableCell>
                    </TableRow>
                  ) : (
                    ficha.ordens.slice(0, 10).map((os) => (
                      <TableRow key={os.id}>
                        <TableCell className="font-medium">#{os.numero}</TableCell>
                        <TableCell>{formatarData(os.criado_em.slice(0, 10))}</TableCell>
                        <TableCell>
                          <StatusOSBadge status={os.status} />
                        </TableCell>
                        <TableCell className="text-right">
                          {formatarMoeda(calcularTotalGeralDeCampos(os))}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <FidelizacaoClienteCard fidelizacao={ficha.fidelizacao} />

        <div>
          {ficha.motos.length > 1 && (
            <div className="mb-4 max-w-xs">
              <Select
                value={motoSelecionada?.id ?? ''}
                onValueChange={setMotoTimelineId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Moto na timeline" />
                </SelectTrigger>
                <SelectContent>
                  {ficha.motos.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.marca} {m.modelo} · {m.placa}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <TimelineMoto
            eventos={timelineMoto}
            titulo="Timeline da moto"
            motoLabel={
              motoSelecionada
                ? `${motoSelecionada.marca} ${motoSelecionada.modelo} · ${motoSelecionada.placa}`
                : undefined
            }
          />
        </div>
      </div>
    </div>
  )
}

export function PortalClienteDetalhePage() {
  return (
    <RecursoPlanoGate recurso="portal_cliente" pagina>
      <PortalClienteDetalheConteudo />
    </RecursoPlanoGate>
  )
}
