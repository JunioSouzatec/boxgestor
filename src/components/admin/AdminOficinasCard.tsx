import { useCallback, useEffect, useState } from 'react'
import { CalendarClock, Eye, Loader2, Pencil, Trash2, Archive, RefreshCw } from 'lucide-react'
import { useToast } from '@/context/ToastContext'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MSG } from '@/lib/mensagens-usuario'
import { assinaturaService } from '@/services/assinatura/assinatura.service'
import {
  adminDefinirPlanoSupabase,
  adminEncerrarTrialSupabase,
  adminEstenderTrialSupabase,
  adminReiniciarTrialSupabase,
} from '@/services/assinatura/assinatura-supabase.service'
import { isUuidFormato } from '@/lib/local-id-uuid'
import { adminUsaSupabaseRemoto, MENSAGEM_ERRO_ACAO_ADMIN } from '@/lib/admin-env'
import { formatarOfficeIdCurto } from '@/services/assinatura/office-admin.service'
import { arquivarOficinaAdmin, removerCacheLocalOficinaAdmin } from '@/services/admin/admin-office-lifecycle.service'
import { AdminOficinaDetalhesDialog } from '@/components/admin/AdminOficinaDetalhesDialog'
import {
  officeRegistryService,
  type OficinaRegistro,
} from '@/services/assinatura/office-registry.service'
import { getLabelPlano, PLANOS_UI, type PlanoTier } from '@/types/plano'
import { useAdminMounted } from '@/hooks/useAdminMounted'

function badgeStatusOficina(status: OficinaRegistro['status']) {
  switch (status) {
    case 'teste':
      return { variant: 'info' as const, label: 'Teste Premium' }
    case 'teste_expirado':
      return { variant: 'warning' as const, label: 'Teste encerrado' }
    default:
      return { variant: 'success' as const, label: 'Ativa' }
  }
}

export function AdminOficinasCard() {
  const { toast } = useToast()
  const { iniciarOperacao, operacaoAtiva } = useAdminMounted()
  const modoRemotoAdmin = adminUsaSupabaseRemoto()
  const [oficinas, setOficinas] = useState<OficinaRegistro[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erroRemoto, setErroRemoto] = useState<string | null>(null)
  const [alterarPlano, setAlterarPlano] = useState<OficinaRegistro | null>(null)
  const [planoSelecionado, setPlanoSelecionado] = useState<PlanoTier>('essential')
  const [salvando, setSalvando] = useState(false)
  const [excluirOficina, setExcluirOficina] = useState<OficinaRegistro | null>(null)
  const [acaoOficina, setAcaoOficina] = useState<'excluir' | 'arquivar'>('excluir')
  const [confirmacaoExclusao, setConfirmacaoExclusao] = useState('')
  const [processandoExclusao, setProcessandoExclusao] = useState(false)
  const [detalhesOficina, setDetalhesOficina] = useState<OficinaRegistro | null>(null)

  const acoesDesabilitadas = modoRemotoAdmin && Boolean(erroRemoto)

  const recarregar = useCallback(async () => {
    const seq = iniciarOperacao()
    setCarregando(true)
    setErroRemoto(null)
    try {
      const resultado = await officeRegistryService.listarOficinasAsync()
      if (!operacaoAtiva(seq)) return
      setOficinas(resultado.oficinas)
      setErroRemoto(resultado.erroRemoto ?? null)
    } catch {
      if (!operacaoAtiva(seq)) return
      setOficinas([])
      setErroRemoto(MENSAGEM_ERRO_ACAO_ADMIN)
    } finally {
      if (operacaoAtiva(seq)) setCarregando(false)
    }
  }, [iniciarOperacao, operacaoAtiva])

  useEffect(() => {
    void recarregar()
    return () => {
      setDetalhesOficina(null)
      setAlterarPlano(null)
      setExcluirOficina(null)
    }
  }, [recarregar])

  function abrirAlterarPlano(oficina: OficinaRegistro) {
    setAlterarPlano(oficina)
    setPlanoSelecionado(oficina.plano)
  }

  async function aplicarPlano() {
    if (!alterarPlano || acoesDesabilitadas) return
    setSalvando(true)
    try {
      if (modoRemotoAdmin && isUuidFormato(alterarPlano.office_id)) {
        await adminDefinirPlanoSupabase(alterarPlano.office_id, planoSelecionado)
      } else {
        assinaturaService.definirPlano(alterarPlano.office_id, planoSelecionado)
      }
      toast.sucesso(MSG.planoOficinaAtualizado)
      setAlterarPlano(null)
      await recarregar()
    } catch (err) {
      toast.erro(err instanceof Error ? err.message : MENSAGEM_ERRO_ACAO_ADMIN)
    } finally {
      setSalvando(false)
    }
  }

  async function acaoTrial(
    oficina: OficinaRegistro,
    acao: 'estender' | 'encerrar' | 'reiniciar'
  ) {
    if (acoesDesabilitadas) return
    try {
      const remoto = modoRemotoAdmin && isUuidFormato(oficina.office_id)

      if (acao === 'estender') {
        if (remoto) {
          await adminEstenderTrialSupabase(oficina.office_id, 7)
        } else {
          assinaturaService.estenderTrial(oficina.office_id, 7)
        }
        toast.sucesso('Teste Premium estendido por 7 dias.')
      } else if (acao === 'encerrar') {
        if (remoto) {
          await adminEncerrarTrialSupabase(oficina.office_id)
        } else {
          assinaturaService.encerrarTrial(oficina.office_id)
        }
        toast.sucesso('Teste Premium encerrado.')
      } else {
        if (remoto) {
          await adminReiniciarTrialSupabase(oficina.office_id)
        } else {
          assinaturaService.reiniciarTrial(oficina.office_id)
        }
        toast.sucesso('Teste Premium reiniciado com 7 dias.')
      }
      await recarregar()
    } catch (err) {
      toast.erro(err instanceof Error ? err.message : MENSAGEM_ERRO_ACAO_ADMIN)
    }
  }

  async function confirmarAcaoOficina() {
    if (!excluirOficina) return
    const palavraEsperada = acaoOficina === 'arquivar' ? 'ARQUIVAR' : 'EXCLUIR'
    if (confirmacaoExclusao.trim().toUpperCase() !== palavraEsperada) {
      toast.erro(`Digite ${palavraEsperada} para confirmar.`)
      return
    }
    setProcessandoExclusao(true)
    try {
      const resultado =
        acaoOficina === 'arquivar' && modoRemotoAdmin
          ? await arquivarOficinaAdmin(excluirOficina.office_id)
          : await removerCacheLocalOficinaAdmin(excluirOficina.office_id)
      if (resultado.ok) {
        toast.sucesso(resultado.mensagem)
        setExcluirOficina(null)
        setConfirmacaoExclusao('')
        await recarregar()
      } else {
        toast.erro(resultado.mensagem)
      }
    } finally {
      setProcessandoExclusao(false)
    }
  }

  function abrirAcaoOficina(oficina: OficinaRegistro, acao: 'excluir' | 'arquivar') {
    setExcluirOficina(oficina)
    setAcaoOficina(acao)
    setConfirmacaoExclusao('')
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Oficinas cadastradas</CardTitle>
          <CardDescription>
            Lista global de oficinas. Altere planos manualmente ou gerencie o Teste Premium.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {erroRemoto && (
            <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-3 text-sm">
              <p className="text-amber-100/90">{erroRemoto}</p>
              <Button
                size="sm"
                variant="outline"
                className="mt-2 gap-1"
                onClick={() => void recarregar()}
                disabled={carregando}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${carregando ? 'animate-spin' : ''}`} />
                Tentar novamente
              </Button>
            </div>
          )}
          {carregando ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando oficinas…
            </div>
          ) : oficinas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma oficina encontrada.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[800px] text-sm">
                <thead className="bg-muted/30">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">Oficina</th>
                    <th className="px-4 py-2 text-left font-medium">Responsável</th>
                    <th className="px-4 py-2 text-left font-medium">Telefone</th>
                    <th className="px-4 py-2 text-left font-medium">Plano</th>
                    <th className="px-4 py-2 text-left font-medium">Status do teste</th>
                    <th className="px-4 py-2 text-left font-medium">Cadastro</th>
                    <th className="px-4 py-2 text-right font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {oficinas.map((oficina) => {
                    const statusBadge = badgeStatusOficina(oficina.status)
                    return (
                      <tr key={oficina.office_id} className="border-t border-border">
                        <td className="px-4 py-3">
                          <p className="font-medium">{oficina.nome}</p>
                          <p
                            className="text-xs text-muted-foreground font-mono"
                            title={oficina.office_id}
                          >
                            ID {formatarOfficeIdCurto(oficina.office_id)}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <p>{oficina.dono_nome ?? '—'}</p>
                          {oficina.dono_email && (
                            <p className="text-xs text-muted-foreground">{oficina.dono_email}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {oficina.telefone ?? '—'}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline">{getLabelPlano(oficina.plano)}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
                          {oficina.plano === 'trial' && (
                            <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                              {oficina.trial_inicio_em && (
                                <p className="flex items-center gap-1">
                                  <CalendarClock className="h-3 w-3" />
                                  Início:{' '}
                                  {new Date(oficina.trial_inicio_em).toLocaleDateString('pt-BR')}
                                </p>
                              )}
                              {oficina.trial_fim_em && (
                                <p>
                                  Fim: {new Date(oficina.trial_fim_em).toLocaleDateString('pt-BR')}
                                </p>
                              )}
                              {oficina.dias_restantes_teste !== null && oficina.status === 'teste' && (
                                <p>{oficina.dias_restantes_teste} dia(s) restante(s)</p>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {oficina.criado_em
                            ? new Date(oficina.criado_em).toLocaleDateString('pt-BR')
                            : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={acoesDesabilitadas}
                              onClick={() => setDetalhesOficina(oficina)}
                            >
                              <Eye className="mr-1 h-3.5 w-3.5" />
                              Ver detalhes
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={acoesDesabilitadas}
                              onClick={() => abrirAlterarPlano(oficina)}
                            >
                              <Pencil className="mr-1 h-3.5 w-3.5" />
                              Alterar plano
                            </Button>
                            {oficina.plano === 'trial' && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={acoesDesabilitadas}
                                  onClick={() => acaoTrial(oficina, 'estender')}
                                >
                                  Estender teste
                                </Button>
                                {oficina.status === 'teste' && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={acoesDesabilitadas}
                                    onClick={() => acaoTrial(oficina, 'encerrar')}
                                  >
                                    Encerrar teste
                                  </Button>
                                )}
                                {oficina.status === 'teste_expirado' && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={acoesDesabilitadas}
                                    onClick={() => acaoTrial(oficina, 'reiniciar')}
                                  >
                                    Reiniciar teste
                                  </Button>
                                )}
                              </>
                            )}
                            {modoRemotoAdmin ? (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={acoesDesabilitadas}
                                onClick={() => abrirAcaoOficina(oficina, 'arquivar')}
                              >
                                <Archive className="mr-1 h-3.5 w-3.5" />
                                Arquivar
                              </Button>
                            ) : null}
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={acoesDesabilitadas}
                              onClick={() => abrirAcaoOficina(oficina, 'excluir')}
                            >
                              <Trash2 className="mr-1 h-3.5 w-3.5" />
                              {modoRemotoAdmin ? 'Remover cache local' : 'Excluir oficina de teste'}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!alterarPlano} onOpenChange={(aberto) => !aberto && setAlterarPlano(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alterar plano da oficina</DialogTitle>
            <DialogDescription>
              Aplicação manual pelo Administrador do Sistema — sem cobrança automática.
            </DialogDescription>
          </DialogHeader>
          {alterarPlano && (
            <div className="space-y-4">
              <p className="text-sm">
                Oficina: <strong>{alterarPlano.nome}</strong>
                <br />
                Plano atual: <strong>{getLabelPlano(alterarPlano.plano)}</strong>
              </p>
              <Select
                value={planoSelecionado}
                onValueChange={(v) => setPlanoSelecionado(v as PlanoTier)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Escolha o plano" />
                </SelectTrigger>
                <SelectContent>
                  {PLANOS_UI.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nome} — {p.preco_label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setAlterarPlano(null)}>
                  Cancelar
                </Button>
                <Button disabled={salvando || planoSelecionado === alterarPlano.plano} onClick={() => void aplicarPlano()}>
                  {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Aplicar plano'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AdminOficinaDetalhesDialog
        oficina={detalhesOficina}
        aberto={!!detalhesOficina}
        onFechar={() => setDetalhesOficina(null)}
      />

      <Dialog open={!!excluirOficina} onOpenChange={(aberto) => !aberto && setExcluirOficina(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {acaoOficina === 'arquivar' ? 'Arquivar oficina' : 'Excluir oficina de teste'}
            </DialogTitle>
            <DialogDescription>
              {acaoOficina === 'arquivar' ? (
                <>
                  A oficina será marcada como inativa no Supabase (arquivada) e removida do cache
                  local deste navegador. Os dados permanecem no banco para auditoria.
                  <br />
                  <br />
                  Para reutilizar o mesmo e-mail, remova também o usuário em Supabase Auth → Users.
                </>
              ) : modoRemotoAdmin ? (
                <>
                  Remove apenas o cache local desta oficina neste navegador. Os dados permanecem no
                  Supabase remoto.
                  <br />
                  <br />
                  Para arquivar a oficina no servidor, use o botão Arquivar.
                </>
              ) : (
                <>
                  Remove a oficina do armazenamento local (dados, assinatura e usuários vinculados).
                  Não apaga dados no Supabase remoto. Ação irreversível no navegador.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          {excluirOficina && (
            <div className="space-y-4">
              <p className="text-sm">
                Oficina: <strong>{excluirOficina.nome}</strong>
              </p>
              <div className="space-y-2">
                <Label htmlFor="confirmar-exclusao">
                  Digite {acaoOficina === 'arquivar' ? 'ARQUIVAR' : 'EXCLUIR'} para confirmar
                </Label>
                <Input
                  id="confirmar-exclusao"
                  value={confirmacaoExclusao}
                  onChange={(e) => setConfirmacaoExclusao(e.target.value)}
                  placeholder={acaoOficina === 'arquivar' ? 'ARQUIVAR' : 'EXCLUIR'}
                  autoComplete="off"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setExcluirOficina(null)}>
                  Cancelar
                </Button>
                <Button
                  variant="destructive"
                  disabled={processandoExclusao}
                  onClick={() => void confirmarAcaoOficina()}
                >
                  {processandoExclusao ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : acaoOficina === 'arquivar' ? (
                    'Arquivar oficina'
                  ) : (
                    'Confirmar exclusão'
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
