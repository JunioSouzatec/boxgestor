import { useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { ArrowLeft, ClipboardList, Pencil } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { ClienteMotosSection } from '@/components/clientes/ClienteMotosSection'
import { ClienteOSDialog } from '@/components/clientes/ClienteOSDialog'
import { BotaoWhatsApp } from '@/components/comunicacao/BotaoWhatsApp'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  ClienteDocumentoNumeroCell,
  ClienteDocumentoStatusCell,
} from '@/components/clientes/ClienteDocumentoStatusCell'
import { useCraft, useOficinaData } from '@/context/CraftContext'
import { HistoricoComunicacaoLista } from '@/components/lembretes/HistoricoComunicacaoLista'
import { useLembretes } from '@/context/LembretesContext'
import { montarResumoCliente, listarOsDoCliente } from '@/services/cliente-resumo.service'
import { calcularResumoFinanceiroOS } from '@/services/os-financeiro.service'
import { obterResumoServicoOS } from '@/services/os-listagem.service'
import { obterDataEntradaOS, obterDataSaidaOS } from '@/services/os-datas.service'
import { formatarData, formatarMoeda, formatarTelefone } from '@/lib/utils'
import { labelQuantidadeVeiculos } from '@/lib/moto-form'
import { useTermosOficina } from '@/hooks/useTermosOficina'
import { getLabelStatusFinanceiroOS } from '@/types/labels'
import { getLabelStatusLembrete } from '@/types/lembrete'

export function ClienteDetalhePage() {
  const { clienteId } = useParams<{ clienteId: string }>()
  const { dados } = useCraft()
  const { motos, ordens, lancamentos } = useOficinaData()
  const [dialogOsAberto, setDialogOsAberto] = useState(false)
  const termos = useTermosOficina()

  const cliente = dados.clientes.find((c) => c.id === clienteId)

  const motosDoCliente = useMemo(
    () => motos.filter((m) => m.cliente_id === clienteId),
    [motos, clienteId]
  )

  const { listarPorCliente, listarHistoricoPorCliente } = useLembretes()

  const lembretes = useMemo(
    () => listarPorCliente(clienteId ?? ''),
    [listarPorCliente, clienteId]
  )

  const historicoComunicacao = useMemo(
    () => listarHistoricoPorCliente(clienteId ?? ''),
    [listarHistoricoPorCliente, clienteId]
  )

  const resumo = useMemo(() => {
    if (!clienteId) return null
    return montarResumoCliente(clienteId, ordens, lancamentos, lembretes)
  }, [clienteId, ordens, lancamentos, lembretes])

  const osCliente = useMemo(() => {
    if (!clienteId) return []
    return listarOsDoCliente(clienteId, ordens, motos)
  }, [clienteId, ordens, motos])

  if (!clienteId) {
    return <Navigate to="/clientes" replace />
  }

  if (!cliente) {
    return (
      <div className="space-y-4">
        <Button asChild variant="ghost" className="gap-2">
          <Link to="/clientes">
            <ArrowLeft className="h-4 w-4" />
            Voltar para clientes
          </Link>
        </Button>
        <p className="text-muted-foreground">Cliente não encontrado.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        titulo={cliente.nome}
        descricao={labelQuantidadeVeiculos(
          motosDoCliente.length,
          termos.palavraVeiculo,
          termos.veiculos
        )}
        acoes={
          <div className="flex flex-wrap gap-2">
            <BotaoWhatsApp cliente={cliente} />
            <Button className="gap-2" asChild>
              <Link to={`/ordens-servico?novo=1&cliente=${cliente.id}`}>
                <ClipboardList className="h-4 w-4" />
                Nova OS
              </Link>
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => setDialogOsAberto(true)}>
              Ver OS
            </Button>
          </div>
        }
      />

      <Button asChild variant="ghost" size="sm" className="gap-2 -mt-2">
        <Link to="/clientes">
          <ArrowLeft className="h-4 w-4" />
          Voltar para clientes
        </Link>
      </Button>

      {resumo && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground">Total de OS</p>
              <p className="text-lg font-semibold">{resumo.totalOs}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground">Total pago</p>
              <p className="text-lg font-semibold">{formatarMoeda(resumo.totalGasto)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground">Valor pendente</p>
              <p className="text-lg font-semibold text-amber-400">
                {formatarMoeda(resumo.valorPendente)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground">Último atendimento</p>
              <p className="text-sm font-semibold">{resumo.ultimoAtendimentoLabel ?? '—'}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground">Próximo lembrete</p>
              <p className="text-sm font-semibold">{resumo.proximoLembreteLabel ?? '—'}</p>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs defaultValue="dados" className="space-y-4">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="dados">Dados</TabsTrigger>
          <TabsTrigger value="motos">{termos.veiculos}</TabsTrigger>
          <TabsTrigger value="os">Ordens de Serviço</TabsTrigger>
          <TabsTrigger value="financeiro">Histórico financeiro</TabsTrigger>
          <TabsTrigger value="lembretes">Lembretes</TabsTrigger>
          <TabsTrigger value="comunicacao">Histórico de comunicação</TabsTrigger>
        </TabsList>

        <TabsContent value="dados">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Dados do cliente</CardTitle>
              <Button asChild variant="outline" size="sm" className="gap-2">
                <Link to={`/clientes?editar=${cliente.id}`}>
                  <Pencil className="h-3.5 w-3.5" />
                  Editar cliente
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 text-sm">
              <div>
                <p className="text-muted-foreground">Telefone</p>
                <p className="font-medium">{formatarTelefone(cliente.telefone)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">CPF</p>
                <p className="font-medium">{cliente.cpf ?? '—'}</p>
              </div>
              <div className="sm:col-span-2">
                <p className="text-muted-foreground">Endereço</p>
                <p className="font-medium">{cliente.endereco || '—'}</p>
              </div>
              {cliente.observacoes && (
                <div className="sm:col-span-2">
                  <p className="text-muted-foreground">Observações</p>
                  <p className="font-medium whitespace-pre-wrap">{cliente.observacoes}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="motos">
          <Card>
            <CardContent className="pt-6">
              <ClienteMotosSection cliente={cliente} motos={motosDoCliente} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="os">
          <Card>
            <CardContent className="pt-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-sm font-semibold">Ordens de Serviço</h3>
                <Button size="sm" onClick={() => setDialogOsAberto(true)}>
                  Ver todas com ações
                </Button>
              </div>
              {osCliente.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma OS cadastrada.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>OS</TableHead>
                      <TableHead>Entrada</TableHead>
                      <TableHead>Previsão</TableHead>
                      <TableHead>Saída</TableHead>
                      <TableHead>{termos.veiculo}</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Pendente</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {osCliente.slice(0, 10).map(({ os, moto }) => {
                      const fin = calcularResumoFinanceiroOS(os, lancamentos)
                      const saida = obterDataSaidaOS(os)
                      return (
                        <TableRow key={os.id}>
                          <TableCell>
                            <ClienteDocumentoNumeroCell os={os} />
                          </TableCell>
                          <TableCell>{formatarData(obterDataEntradaOS(os))}</TableCell>
                          <TableCell>
                            {os.data_previsao ? formatarData(os.data_previsao) : '—'}
                          </TableCell>
                          <TableCell>{saida ? formatarData(saida) : '—'}</TableCell>
                          <TableCell>{moto?.placa ?? '—'}</TableCell>
                          <TableCell>
                            <ClienteDocumentoStatusCell os={os} ordens={ordens} />
                          </TableCell>
                          <TableCell className="text-right">{formatarMoeda(fin.totalGeral)}</TableCell>
                          <TableCell className="text-right text-amber-400">
                            {fin.valorPendente > 0 ? formatarMoeda(fin.valorPendente) : '—'}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="financeiro">
          <Card>
            <CardContent className="pt-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>OS</TableHead>
                    <TableHead>Serviço</TableHead>
                    <TableHead>Status financeiro</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Pago</TableHead>
                    <TableHead className="text-right">Pendente</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {osCliente.map(({ os }) => {
                    const fin = calcularResumoFinanceiroOS(os, lancamentos)
                    return (
                      <TableRow key={os.id}>
                        <TableCell>#{os.numero}</TableCell>
                        <TableCell className="max-w-[200px] truncate">
                          {obterResumoServicoOS(os)}
                        </TableCell>
                        <TableCell>{getLabelStatusFinanceiroOS(fin.statusFinanceiroEfetivo)}</TableCell>
                        <TableCell className="text-right">{formatarMoeda(fin.totalGeral)}</TableCell>
                        <TableCell className="text-right">{formatarMoeda(fin.valorPago)}</TableCell>
                        <TableCell className="text-right text-amber-400">
                          {fin.valorPendente > 0 ? formatarMoeda(fin.valorPendente) : '—'}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="lembretes">
          <Card>
            <CardContent className="pt-6">
              {lembretes.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum lembrete para este cliente.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Serviço</TableHead>
                      <TableHead>OS</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lembretes.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell>{formatarData(l.data_prevista)}</TableCell>
                        <TableCell>{l.servico}</TableCell>
                        <TableCell>
                          {l.ordem_servico_numero ? `#${l.ordem_servico_numero}` : '—'}
                        </TableCell>
                        <TableCell>{getLabelStatusLembrete(l.status)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="comunicacao">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Histórico de comunicação</CardTitle>
            </CardHeader>
            <CardContent>
              <HistoricoComunicacaoLista
                itens={historicoComunicacao}
                motos={motos}
                mostrarCliente={false}
                mostrarMoto
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <ClienteOSDialog
        aberto={dialogOsAberto}
        onOpenChange={setDialogOsAberto}
        cliente={cliente}
        ordens={ordens}
        motos={motos}
        lancamentos={lancamentos}
      />
    </div>
  )
}
