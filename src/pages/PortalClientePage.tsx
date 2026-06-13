import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Users } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { RecursoPlanoGate } from '@/components/plano/RecursoPlanoGate'
import { PortalClienteDashboardCards } from '@/components/portal-cliente/PortalClienteDashboardCards'
import { BadgeVIP } from '@/components/portal-cliente/BadgeVIP'
import { BuscaInput } from '@/components/shared/BuscaInput'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { useCraft, useOficinaData } from '@/context/CraftContext'
import { lembretesService } from '@/services/lembretes/lembretes.service'
import {
  calcularResumoPortalDashboard,
  montarResumoCliente,
} from '@/services/portal-cliente/portal-cliente.service'
import { formatarMoeda, formatarTelefone } from '@/lib/utils'

function PortalClienteConteudo() {
  const { oficinaId } = useCraft()
  const { clientes, ordens } = useOficinaData()
  const [busca, setBusca] = useState('')

  const lembretes = useMemo(
    () => lembretesService.listarLembretes(oficinaId),
    [oficinaId]
  )

  const resumoDashboard = useMemo(
    () => calcularResumoPortalDashboard(clientes, ordens, lembretes),
    [clientes, ordens, lembretes]
  )

  const clientesResumo = useMemo(
    () =>
      clientes
        .map((c) => montarResumoCliente(c, ordens, lembretes))
        .sort((a, b) => b.total_gasto - a.total_gasto),
    [clientes, ordens, lembretes]
  )

  const filtrados = clientesResumo.filter((r) => {
    const termo = busca.toLowerCase()
    return (
      !termo ||
      r.cliente.nome.toLowerCase().includes(termo) ||
      r.cliente.telefone.includes(termo)
    )
  })

  return (
    <div>
      <PageHeader
        titulo="Portal do Cliente"
        descricao="Central completa — ficha, timeline, financeiro e fidelização"
      />

      <div className="mb-6">
        <PortalClienteDashboardCards resumo={resumoDashboard} />
      </div>

      <Card>
        <CardContent className="pt-6">
          <BuscaInput
            valor={busca}
            onChange={setBusca}
            placeholder="Buscar cliente..."
            className="mb-4 max-w-sm"
          />

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>VIP</TableHead>
                <TableHead>Serviços</TableHead>
                <TableHead>Total gasto</TableHead>
                <TableHead>Pontos</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtrados.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                    Nenhum cliente encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                filtrados.map((r) => (
                  <TableRow key={r.cliente.id}>
                    <TableCell className="font-medium">{r.cliente.nome}</TableCell>
                    <TableCell>{formatarTelefone(r.cliente.telefone)}</TableCell>
                    <TableCell>
                      <BadgeVIP nivel={r.nivel_vip} />
                    </TableCell>
                    <TableCell>{r.quantidade_servicos}</TableCell>
                    <TableCell>{formatarMoeda(r.total_gasto)}</TableCell>
                    <TableCell className="text-primary">{r.pontos}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" asChild className="gap-1">
                        <Link to={`/portal-cliente/${r.cliente.id}`}>
                          <Users className="h-4 w-4" />
                          Abrir ficha
                          <ChevronRight className="h-4 w-4" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

export function PortalClientePage() {
  return (
    <RecursoPlanoGate recurso="portal_cliente" pagina>
      <PortalClienteConteudo />
    </RecursoPlanoGate>
  )
}
