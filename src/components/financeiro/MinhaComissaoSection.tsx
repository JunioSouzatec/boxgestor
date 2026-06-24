import { useMemo, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useOficinaData } from '@/context/CraftContext'
import {
  calcularResumoComissaoMensal,
  listarOsComissaoFuncionario,
} from '@/services/comissoes/comissoes.service'
import { podeVerMinhaComissao } from '@/services/auth/permissions'
import { formatarData, formatarMoeda, getMesLocalAtual } from '@/lib/utils'
import { obterComissoesConfig } from '@/types/comissoes'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function MinhaComissaoSection() {
  const { session } = useAuth()
  const { perfisComissao, ordens, lancamentos, configuracao } = useOficinaData()
  const [mesReferencia, setMesReferencia] = useState(getMesLocalAtual())

  const config = useMemo(() => obterComissoesConfig(configuracao), [configuracao])
  const user = session?.user

  const perfil = useMemo(() => {
    if (!user) return undefined
    return perfisComissao.find(
      (p) => p.usuario_id === user.id || p.nome.trim().toLowerCase() === user.nome.trim().toLowerCase()
    )
  }, [perfisComissao, user])

  const resumo = useMemo(() => {
    if (!perfil) return null
    return calcularResumoComissaoMensal(perfil, ordens, lancamentos, mesReferencia, config)
  }, [perfil, ordens, lancamentos, mesReferencia, config])

  const detalhes = useMemo(() => {
    if (!perfil) return []
    return listarOsComissaoFuncionario(perfil, ordens, lancamentos, mesReferencia, config)
  }, [perfil, ordens, lancamentos, mesReferencia, config])

  if (!user || !podeVerMinhaComissao(user, config)) return null

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Minha comissão</h2>
        <p className="text-sm text-muted-foreground">
          Visão pessoal — você vê apenas a sua comissão, sem salário, dados de outros funcionários ou
          lucro da oficina.
        </p>
      </div>

      <div className="space-y-1">
        <Label htmlFor="mes-minha-comissao">Mês de referência</Label>
        <Input
          id="mes-minha-comissao"
          type="month"
          value={mesReferencia}
          onChange={(e) => setMesReferencia(e.target.value)}
          className="w-[180px]"
        />
      </div>

      {!perfil ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          Seu cadastro financeiro ainda não foi configurado pelo responsável da oficina.
        </p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">OS no mês</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{resumo?.quantidade_os ?? 0}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Comissão do mês</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{formatarMoeda(resumo?.total_comissao ?? 0)}</p>
              </CardContent>
            </Card>
          </div>

          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>OS</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead className="text-right">Mão de obra</TableHead>
                  <TableHead className="text-right">Comissão</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detalhes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      Nenhuma OS elegível neste mês.
                    </TableCell>
                  </TableRow>
                ) : (
                  detalhes.map((d) => (
                    <TableRow key={d.os_id}>
                      <TableCell>#{d.numero}</TableCell>
                      <TableCell>{formatarData(d.data_referencia)}</TableCell>
                      <TableCell className="text-right">{formatarMoeda(d.mao_obra)}</TableCell>
                      <TableCell className="text-right">{formatarMoeda(d.comissao)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  )
}
