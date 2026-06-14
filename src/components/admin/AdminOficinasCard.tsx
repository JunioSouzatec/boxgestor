import { useCallback, useEffect, useState } from 'react'
import { CalendarClock, Loader2, Pencil } from 'lucide-react'
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
import { MSG } from '@/lib/mensagens-usuario'
import { assinaturaService } from '@/services/assinatura/assinatura.service'
import {
  officeRegistryService,
  type OficinaRegistro,
} from '@/services/assinatura/office-registry.service'
import { getLabelPlano, PLANOS_UI, type PlanoTier } from '@/types/plano'

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
  const [oficinas, setOficinas] = useState<OficinaRegistro[]>([])
  const [alterarPlano, setAlterarPlano] = useState<OficinaRegistro | null>(null)
  const [planoSelecionado, setPlanoSelecionado] = useState<PlanoTier>('essential')
  const [salvando, setSalvando] = useState(false)

  const recarregar = useCallback(() => {
    setOficinas(officeRegistryService.listarOficinas())
  }, [])

  useEffect(() => {
    recarregar()
    const handler = () => recarregar()
    window.addEventListener('craft-assinatura-updated', handler)
    return () => window.removeEventListener('craft-assinatura-updated', handler)
  }, [recarregar])

  function abrirAlterarPlano(oficina: OficinaRegistro) {
    setAlterarPlano(oficina)
    setPlanoSelecionado(oficina.plano)
  }

  async function aplicarPlano() {
    if (!alterarPlano) return
    setSalvando(true)
    try {
      assinaturaService.definirPlano(alterarPlano.office_id, planoSelecionado)
      toast.sucesso(MSG.planoOficinaAtualizado)
      setAlterarPlano(null)
      recarregar()
    } catch {
      toast.erro(MSG.erroSalvar)
    } finally {
      setSalvando(false)
    }
  }

  function acaoTrial(oficina: OficinaRegistro, acao: 'estender' | 'encerrar' | 'reiniciar') {
    try {
      if (acao === 'estender') {
        assinaturaService.estenderTrial(oficina.office_id, 7)
        toast.sucesso('Teste Premium estendido por 7 dias.')
      } else if (acao === 'encerrar') {
        assinaturaService.encerrarTrial(oficina.office_id)
        toast.sucesso('Teste Premium encerrado.')
      } else {
        assinaturaService.reiniciarTrial(oficina.office_id)
        toast.sucesso('Teste Premium reiniciado com 7 dias.')
      }
      recarregar()
    } catch {
      toast.erro(MSG.erroSalvar)
    }
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
          {oficinas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma oficina encontrada.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[800px] text-sm">
                <thead className="bg-muted/30">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">Oficina</th>
                    <th className="px-4 py-2 text-left font-medium">Plano</th>
                    <th className="px-4 py-2 text-left font-medium">Status</th>
                    <th className="px-4 py-2 text-left font-medium">Responsável</th>
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
                          <p className="text-xs text-muted-foreground font-mono">
                            {oficina.office_id}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline">{getLabelPlano(oficina.plano)}</Badge>
                          {oficina.plano === 'trial' && oficina.trial_inicio_em && (
                            <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                              <p className="flex items-center gap-1">
                                <CalendarClock className="h-3 w-3" />
                                Início:{' '}
                                {new Date(oficina.trial_inicio_em).toLocaleDateString('pt-BR')}
                              </p>
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
                        <td className="px-4 py-3">
                          <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <p>{oficina.dono_nome ?? '—'}</p>
                          {oficina.dono_email && (
                            <p className="text-xs text-muted-foreground">{oficina.dono_email}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {oficina.criado_em
                            ? new Date(oficina.criado_em).toLocaleDateString('pt-BR')
                            : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap justify-end gap-2">
                            <Button size="sm" variant="outline" onClick={() => abrirAlterarPlano(oficina)}>
                              <Pencil className="mr-1 h-3.5 w-3.5" />
                              Alterar plano
                            </Button>
                            {oficina.plano === 'trial' && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => acaoTrial(oficina, 'estender')}
                                >
                                  Estender teste
                                </Button>
                                {oficina.status === 'teste' && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => acaoTrial(oficina, 'encerrar')}
                                  >
                                    Encerrar teste
                                  </Button>
                                )}
                                {oficina.status === 'teste_expirado' && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => acaoTrial(oficina, 'reiniciar')}
                                  >
                                    Reiniciar teste
                                  </Button>
                                )}
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
    </>
  )
}
