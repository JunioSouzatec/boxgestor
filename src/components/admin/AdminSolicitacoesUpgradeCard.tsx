import { useCallback, useEffect, useState } from 'react'
import { Check, Eye, Loader2, X } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { MSG } from '@/lib/mensagens-usuario'
import { assinaturaService } from '@/services/assinatura/assinatura.service'
import { officeRegistryService } from '@/services/assinatura/office-registry.service'
import { upgradeRequestsService } from '@/services/assinatura/upgrade-requests.service'
import { getLabelPlano } from '@/types/plano'
import {
  badgeVariantUpgradeStatus,
  STATUS_UPGRADE_LABEL,
  type UpgradeRequest,
} from '@/types/upgrade-request'

export function AdminSolicitacoesUpgradeCard() {
  const { session } = useAuth()
  const { toast } = useToast()
  const [solicitacoes, setSolicitacoes] = useState<UpgradeRequest[]>([])
  const [processandoId, setProcessandoId] = useState<string | null>(null)
  const [recusarAberto, setRecusarAberto] = useState<UpgradeRequest | null>(null)
  const [observacao, setObservacao] = useState('')
  const [verOficina, setVerOficina] = useState<UpgradeRequest | null>(null)

  const recarregar = useCallback(() => {
    setSolicitacoes(upgradeRequestsService.listarTodas())
  }, [])

  useEffect(() => {
    recarregar()
    const handler = () => recarregar()
    window.addEventListener('craft-upgrade-requests-updated', handler)
    return () => window.removeEventListener('craft-upgrade-requests-updated', handler)
  }, [recarregar])

  async function aprovar(req: UpgradeRequest) {
    if (!session?.user) return
    if (!window.confirm(`Aprovar upgrade de ${req.office_nome} para ${getLabelPlano(req.requested_plan)}?`)) {
      return
    }
    setProcessandoId(req.id)
    try {
      upgradeRequestsService.aprovar(req.id, session.user)
      assinaturaService.definirPlano(req.office_id, req.requested_plan)
      toast.sucesso(MSG.solicitacaoAprovada)
      toast.sucesso(MSG.planoAtualizado)
      recarregar()
    } catch (err) {
      toast.erro(err instanceof Error ? err.message : MSG.erroSalvar)
    } finally {
      setProcessandoId(null)
    }
  }

  async function confirmarRecusa() {
    if (!session?.user || !recusarAberto) return
    setProcessandoId(recusarAberto.id)
    try {
      upgradeRequestsService.recusar(recusarAberto.id, session.user, observacao)
      toast.sucesso(MSG.solicitacaoRecusada)
      setRecusarAberto(null)
      setObservacao('')
      recarregar()
    } catch (err) {
      toast.erro(err instanceof Error ? err.message : MSG.erroSalvar)
    } finally {
      setProcessandoId(null)
    }
  }

  const oficinaDetalhe = verOficina
    ? officeRegistryService.obterOficina(verOficina.office_id)
    : undefined

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Solicitações de upgrade</CardTitle>
          <CardDescription>
            Pedidos de upgrade ou mudança de plano feitos pelas oficinas clientes. Aprove ou recuse
            manualmente.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {solicitacoes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma solicitação registrada.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-muted/30">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">Oficina</th>
                    <th className="px-4 py-2 text-left font-medium">Dono</th>
                    <th className="px-4 py-2 text-left font-medium">Plano atual</th>
                    <th className="px-4 py-2 text-left font-medium">Solicitado</th>
                    <th className="px-4 py-2 text-left font-medium">Status</th>
                    <th className="px-4 py-2 text-left font-medium">Data</th>
                    <th className="px-4 py-2 text-right font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {solicitacoes.map((req) => {
                    const processando = processandoId === req.id
                    const oficina = officeRegistryService.obterOficina(req.office_id)
                    const emailDono = oficina?.dono_email ?? req.requested_by_email

                    return (
                      <tr key={req.id} className="border-t border-border">
                        <td className="px-4 py-3">
                          <p className="font-medium">{req.office_nome}</p>
                          <p className="text-xs text-muted-foreground font-mono">{req.office_id}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p>{oficina?.dono_nome ?? req.requested_by_nome}</p>
                          {emailDono && (
                            <p className="text-xs text-muted-foreground">{emailDono}</p>
                          )}
                        </td>
                        <td className="px-4 py-3">{getLabelPlano(req.current_plan)}</td>
                        <td className="px-4 py-3">{getLabelPlano(req.requested_plan)}</td>
                        <td className="px-4 py-3">
                          <Badge variant={badgeVariantUpgradeStatus(req.status)}>
                            {STATUS_UPGRADE_LABEL[req.status]}
                          </Badge>
                          {req.note && (
                            <p className="mt-1 text-xs text-muted-foreground">{req.note}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {new Date(req.created_at).toLocaleString('pt-BR')}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setVerOficina(req)}
                            >
                              <Eye className="mr-1 h-3.5 w-3.5" />
                              Ver oficina
                            </Button>
                            {req.status === 'pending' && (
                              <>
                                <Button
                                  size="sm"
                                  disabled={processando}
                                  onClick={() => void aprovar(req)}
                                >
                                  {processando ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <>
                                      <Check className="mr-1 h-3.5 w-3.5" />
                                      Aprovar
                                    </>
                                  )}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  disabled={processando}
                                  onClick={() => {
                                    setRecusarAberto(req)
                                    setObservacao('')
                                  }}
                                >
                                  <X className="mr-1 h-3.5 w-3.5" />
                                  Recusar
                                </Button>
                              </>
                            )}
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

      <Dialog open={!!recusarAberto} onOpenChange={(aberto) => !aberto && setRecusarAberto(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Recusar solicitação</DialogTitle>
            <DialogDescription>
              O plano atual da oficina será mantido. Você pode incluir uma observação opcional.
            </DialogDescription>
          </DialogHeader>
          {recusarAberto && (
            <div className="space-y-4">
              <p className="text-sm">
                <strong>{recusarAberto.office_nome}</strong> solicitou{' '}
                {getLabelPlano(recusarAberto.requested_plan)}.
              </p>
              <Textarea
                placeholder="Observação (opcional)"
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                rows={3}
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setRecusarAberto(null)}>
                  Cancelar
                </Button>
                <Button variant="destructive" onClick={() => void confirmarRecusa()}>
                  Recusar solicitação
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!verOficina} onOpenChange={(aberto) => !aberto && setVerOficina(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Detalhes da oficina</DialogTitle>
            <DialogDescription>Informações da oficina vinculada à solicitação.</DialogDescription>
          </DialogHeader>
          {verOficina && (
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-muted-foreground">Nome</dt>
                <dd className="font-medium">{verOficina.office_nome}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">ID</dt>
                <dd className="font-mono text-xs">{verOficina.office_id}</dd>
              </div>
              {oficinaDetalhe && (
                <>
                  <div>
                    <dt className="text-muted-foreground">Plano atual</dt>
                    <dd>{getLabelPlano(oficinaDetalhe.plano)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Dono</dt>
                    <dd>
                      {oficinaDetalhe.dono_nome ?? '—'}
                      {oficinaDetalhe.dono_email && (
                        <span className="block text-muted-foreground">
                          {oficinaDetalhe.dono_email}
                        </span>
                      )}
                    </dd>
                  </div>
                  {oficinaDetalhe.criado_em && (
                    <div>
                      <dt className="text-muted-foreground">Cadastro</dt>
                      <dd>{new Date(oficinaDetalhe.criado_em).toLocaleString('pt-BR')}</dd>
                    </div>
                  )}
                </>
              )}
              <div>
                <dt className="text-muted-foreground">Solicitante</dt>
                <dd>
                  {verOficina.requested_by_nome}
                  <span className="block text-muted-foreground">{verOficina.requested_by_email}</span>
                </dd>
              </div>
            </dl>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
