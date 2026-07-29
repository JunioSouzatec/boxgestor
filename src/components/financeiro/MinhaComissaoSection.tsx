import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useCraft, useOficinaData } from '@/context/CraftContext'
import {
  calcularResumoComissaoMensal,
  encontrarPerfilComissaoDoUsuario,
  labelTipoComissao,
  listarOsComissaoFuncionario,
} from '@/services/comissoes/comissoes.service'
import {
  carregarPagamentosComissao,
  derivarStatusComissaoFolha,
  diferencaComissaoFolhaAssinada,
  labelStatusComissaoFolha,
  pagamentoComissaoDisponivel,
} from '@/services/comissoes/comissao-pagamento-folha.service'
import { podeVerMinhaComissao } from '@/services/auth/permissions'
import { formatarData, formatarMoeda, getMesLocalAtual } from '@/lib/utils'
import {
  obterComissoesConfig,
  tipoUsaMaoObra,
  tipoUsaPecas,
  type PagamentoComissaoFolha,
  type PerfilComissaoFuncionario,
} from '@/types/comissoes'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

function formatarRegraPerfil(perfil: PerfilComissaoFuncionario): string {
  if (!perfil.comissao_ativa || perfil.tipo_comissao === 'sem_comissao') {
    return 'Comissão inativa'
  }
  const partes: string[] = []
  if (tipoUsaMaoObra(perfil.tipo_comissao)) {
    partes.push(`MO ${perfil.percentual_comissao ?? 0}%`)
  }
  if (tipoUsaPecas(perfil.tipo_comissao)) {
    partes.push(`Peças ${perfil.percentual_comissao_pecas ?? 0}%`)
  }
  if (perfil.tipo_comissao === 'valor_fixo_os') {
    partes.push(`Fixo ${formatarMoeda(perfil.valor_fixo_por_os ?? 0)}/OS`)
  }
  return partes.length ? partes.join(' · ') : labelTipoComissao(perfil.tipo_comissao)
}

function badgeStatusFolha(status: ReturnType<typeof derivarStatusComissaoFolha>) {
  if (status === 'pago') return <Badge variant="success">{labelStatusComissaoFolha(status)}</Badge>
  if (status === 'pago_com_ajuste') {
    return <Badge variant="success">{labelStatusComissaoFolha(status)}</Badge>
  }
  if (status === 'diferenca_pendente') {
    return <Badge variant="warning">{labelStatusComissaoFolha(status)}</Badge>
  }
  return <Badge variant="secondary">{labelStatusComissaoFolha(status)}</Badge>
}

export function MinhaComissaoSection() {
  const { session } = useAuth()
  const { oficinaId } = useCraft()
  const { perfisComissao, ordens, lancamentos, configuracao } = useOficinaData()
  const [mesReferencia, setMesReferencia] = useState(getMesLocalAtual())
  const [pagamentoFolha, setPagamentoFolha] = useState<PagamentoComissaoFolha | null>(null)

  const config = useMemo(() => obterComissoesConfig(configuracao), [configuracao])
  const user = session?.user

  const perfil = useMemo(
    () => encontrarPerfilComissaoDoUsuario(user, perfisComissao),
    [perfisComissao, user]
  )

  const resumo = useMemo(() => {
    if (!perfil) return null
    return calcularResumoComissaoMensal(perfil, ordens, lancamentos, mesReferencia, config)
  }, [perfil, ordens, lancamentos, mesReferencia, config])

  const detalhes = useMemo(() => {
    if (!perfil) return []
    return listarOsComissaoFuncionario(perfil, ordens, lancamentos, mesReferencia, config)
  }, [perfil, ordens, lancamentos, mesReferencia, config])

  const carregarFolha = useCallback(async () => {
    if (!perfil || !pagamentoComissaoDisponivel()) {
      setPagamentoFolha(null)
      return
    }
    const lista = await carregarPagamentosComissao(oficinaId)
    const match =
      lista.find(
        (p) =>
          p.employee_local_id === perfil.id &&
          p.competence_month === mesReferencia &&
          !p.canceled_at
      ) ?? null
    setPagamentoFolha(match)
  }, [perfil, oficinaId, mesReferencia])

  useEffect(() => {
    void carregarFolha()
  }, [carregarFolha])

  const statusFolha = useMemo(
    () => derivarStatusComissaoFolha(resumo?.total_comissao ?? 0, pagamentoFolha),
    [resumo?.total_comissao, pagamentoFolha]
  )
  const diferencaAssinada = useMemo(
    () => diferencaComissaoFolhaAssinada(resumo?.total_comissao ?? 0, pagamentoFolha),
    [resumo?.total_comissao, pagamentoFolha]
  )

  if (!user || !podeVerMinhaComissao(user, configuracao)) return null

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Minha comissão</h2>
        <p className="text-sm text-muted-foreground">
          Você vê apenas a sua comissão, sem salário, dados de outros funcionários ou lucro da
          oficina.
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
        <div className="space-y-2 rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          <p>Seu cadastro financeiro ainda não foi configurado pelo responsável da oficina.</p>
          <p className="text-xs">
            Peça ao dono para abrir <strong className="text-foreground">Financeiro → Comissões</strong>,
            editar o seu cadastro e usar <strong className="text-foreground">Vincular usuário da oficina</strong>{' '}
            com o seu login — o vínculo é por ID, não só pelo nome.
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Regra</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm font-semibold leading-snug">{formatarRegraPerfil(perfil)}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {labelTipoComissao(perfil.tipo_comissao)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Base mão de obra
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold tabular-nums">
                  {formatarMoeda(resumo?.total_mao_obra ?? 0)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Base peças</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold tabular-nums">
                  {formatarMoeda(resumo?.total_pecas ?? 0)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Comissão calculada
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold tabular-nums text-primary">
                  {formatarMoeda(resumo?.total_comissao ?? 0)}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {resumo?.quantidade_os ?? 0} OS no mês
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="rounded-xl border border-border p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">Status em folha</span>
              {badgeStatusFolha(statusFolha)}
            </div>
            {pagamentoFolha ? (
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-[11px] text-muted-foreground">Comissão calculada</dt>
                  <dd className="tabular-nums">{formatarMoeda(resumo?.total_comissao ?? 0)}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-muted-foreground">Valor registrado em folha</dt>
                  <dd className="tabular-nums">{formatarMoeda(pagamentoFolha.commission_amount)}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-muted-foreground">Diferença / ajuste</dt>
                  <dd className="tabular-nums">
                    {diferencaAssinada === 0
                      ? formatarMoeda(0)
                      : `${diferencaAssinada > 0 ? '+' : '−'}${formatarMoeda(Math.abs(diferencaAssinada))}`}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">
                Ainda não há baixa de comissão registrada para este mês. O responsável marca como paga
                em folha quando efetuar o pagamento.
              </p>
            )}
            {pagamentoFolha?.ultima_correcao && (
              <p className="mt-2 text-xs text-muted-foreground">
                Baixa corrigida: valor anterior {formatarMoeda(pagamentoFolha.ultima_correcao.valor_anterior)}{' '}
                → {formatarMoeda(pagamentoFolha.ultima_correcao.novo_valor)}.
              </p>
            )}
          </div>

          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>OS</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead className="text-right">Mão de obra</TableHead>
                  <TableHead className="text-right">Peças</TableHead>
                  <TableHead className="text-right">% / regra</TableHead>
                  <TableHead className="text-right">Comissão</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detalhes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      Nenhuma OS elegível neste mês.
                    </TableCell>
                  </TableRow>
                ) : (
                  detalhes.map((d) => (
                    <TableRow key={d.os_id}>
                      <TableCell>
                        #{d.numero}
                        {d.usou_snapshot ? (
                          <span className="ml-1 text-[10px] text-muted-foreground">(congelada)</span>
                        ) : null}
                      </TableCell>
                      <TableCell>{formatarData(d.data_referencia)}</TableCell>
                      <TableCell className="text-right">{formatarMoeda(d.mao_obra)}</TableCell>
                      <TableCell className="text-right">{formatarMoeda(d.pecas)}</TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {d.percentual_aplicado != null
                          ? `${d.percentual_aplicado}%`
                          : d.tipo_comissao
                            ? labelTipoComissao(d.tipo_comissao)
                            : '—'}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatarMoeda(d.comissao)}
                      </TableCell>
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
