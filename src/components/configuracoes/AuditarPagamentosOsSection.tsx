import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowRightLeft,
  Link2Off,
  Loader2,
  Search,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useCraft } from '@/context/CraftContext'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { ehAdminSistema } from '@/lib/craft-admin'
import { formatarData, formatarMoeda } from '@/lib/utils'
import {
  auditarPagamentosOs,
  encontrarOsPorNumeroOuId,
  repararExcluirPagamentoTeste,
  repararMoverPagamentoParaOs,
  repararRemoverVinculoPagamentoOs,
  type LinhaAuditoriaPagamentoOs,
} from '@/services/pagamentos/payment-os-audit.service'
import { getLabelFormaPagamento } from '@/types/labels'
import { cn } from '@/lib/utils'

type AcaoReparo = 'remover' | 'mover' | 'excluir'

export function AuditarPagamentosOsSection() {
  const { dados, aplicarDatabase } = useCraft()
  const { session } = useAuth()
  const { toast } = useToast()
  const isAdmin = ehAdminSistema(session?.user)

  const [numeroBusca, setNumeroBusca] = useState('')
  const [auditoriaExecutada, setAuditoriaExecutada] = useState(false)
  const [processando, setProcessando] = useState(false)

  const [dialogAcao, setDialogAcao] = useState<{
    acao: AcaoReparo
    linha: LinhaAuditoriaPagamentoOs
  } | null>(null)
  const [confirmacaoTexto, setConfirmacaoTexto] = useState('')
  const [osDestinoRef, setOsDestinoRef] = useState('')

  const auditoria = useMemo(() => {
    if (!auditoriaExecutada) return null
    const numero = parseInt(numeroBusca.replace(/^#/, '').trim(), 10)
    if (!Number.isFinite(numero)) return null
    return auditarPagamentosOs(dados, numero)
  }, [auditoriaExecutada, numeroBusca, dados])

  function executarBusca() {
    const numero = parseInt(numeroBusca.replace(/^#/, '').trim(), 10)
    if (!Number.isFinite(numero)) {
      toast.atencao('Informe o número da OS (ex.: 1010).')
      return
    }
    setAuditoriaExecutada(true)
  }

  function fecharDialog() {
    setDialogAcao(null)
    setConfirmacaoTexto('')
    setOsDestinoRef('')
  }

  const confirmacaoEsperada =
    dialogAcao?.acao === 'remover'
      ? 'REMOVER'
      : dialogAcao?.acao === 'mover'
        ? 'MOVER'
        : dialogAcao?.acao === 'excluir'
          ? 'EXCLUIR'
          : ''

  async function confirmarReparo() {
    if (!dialogAcao || !isAdmin || !auditoria) return
    if (confirmacaoTexto.trim() !== confirmacaoEsperada) {
      toast.atencao(`Digite exatamente ${confirmacaoEsperada} para confirmar.`)
      return
    }

    const { acao, linha } = dialogAcao
    const id = linha.lancamento.id

    setProcessando(true)
    try {
      let db = dados

      if (acao === 'remover') {
        db = repararRemoverVinculoPagamentoOs(db, id)
        toast.sucesso('Vínculo com a OS removido. O pagamento permanece no financeiro.')
      } else if (acao === 'mover') {
        const destino = encontrarOsPorNumeroOuId(dados, osDestinoRef)
        if (!destino) {
          toast.erro('OS destino não encontrada. Informe número ou ID válido.')
          return
        }
        if (destino.id === auditoria.os.id) {
          toast.atencao('A OS destino é a mesma OS auditada.')
          return
        }
        db = repararMoverPagamentoParaOs(db, id, destino)
        toast.sucesso(`Pagamento movido para OS #${destino.numero}.`)
      } else if (acao === 'excluir') {
        db = repararExcluirPagamentoTeste(db, id)
        toast.sucesso('Pagamento de teste marcado como excluído.')
      }

      aplicarDatabase(db)
      fecharDialog()
    } catch (e) {
      toast.erro(e instanceof Error ? e.message : 'Erro ao aplicar reparo.')
    } finally {
      setProcessando(false)
    }
  }

  if (!isAdmin) return null

  return (
    <div className="space-y-4 rounded-lg border border-border/60 bg-card/40 p-4">
      <div>
        <h3 className="text-sm font-semibold">Auditar pagamentos por OS</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Verifique vínculos de pagamentos com uma OS específica e corrija manualmente pagamentos
          associados por engano. Nenhuma alteração é feita automaticamente.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label htmlFor="audit-os-numero">Número da OS</Label>
          <Input
            id="audit-os-numero"
            placeholder="Ex.: 1010"
            value={numeroBusca}
            onChange={(e) => setNumeroBusca(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && executarBusca()}
            className="w-40"
          />
        </div>
        <Button type="button" variant="secondary" onClick={executarBusca}>
          <Search className="mr-2 h-4 w-4" />
          Auditar
        </Button>
      </div>

      {auditoriaExecutada && !auditoria && (
        <p className="text-sm text-amber-200/90">
          OS #{numeroBusca.replace(/^#/, '')} não encontrada nesta oficina.
        </p>
      )}

      {auditoria && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
            <div className="rounded-md border border-border/50 p-3">
              <p className="text-xs text-muted-foreground">OS</p>
              <p className="font-medium">#{auditoria.os.numero}</p>
              <p className="text-xs text-muted-foreground font-mono truncate" title={auditoria.os.id}>
                ID: {auditoria.os.id}
              </p>
            </div>
            <div className="rounded-md border border-border/50 p-3">
              <p className="text-xs text-muted-foreground">Total da OS</p>
              <p className="font-medium">{formatarMoeda(auditoria.totalOs)}</p>
            </div>
            <div className="rounded-md border border-border/50 p-3">
              <p className="text-xs text-muted-foreground">Total pagamentos (por ID)</p>
              <p className="font-medium">{formatarMoeda(auditoria.totalPagamentosPorId)}</p>
              <p className="text-xs text-muted-foreground">
                {auditoria.quantidadePorId} lançamento(s)
              </p>
            </div>
            <div className="rounded-md border border-border/50 p-3">
              <p className="text-xs text-muted-foreground">Total válidos (filtro estrito)</p>
              <p className="font-medium">{formatarMoeda(auditoria.totalPagamentosValidos)}</p>
              <p className="text-xs text-muted-foreground">
                {auditoria.quantidadeValidos} lançamento(s)
              </p>
            </div>
          </div>

          {(auditoria.diferenca > 0.009 || auditoria.quantidadeSuspeitos > 0) && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100/95">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-medium">Possível inconsistência detectada</p>
                <p className="text-xs mt-1 opacity-90">
                  Diferença entre total por ID e total válido:{' '}
                  {formatarMoeda(auditoria.diferenca)}. Suspeitos:{' '}
                  {auditoria.quantidadeSuspeitos}.
                </p>
              </div>
            </div>
          )}

          <div className="overflow-x-auto rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>ID</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Forma</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Parcelamento</TableHead>
                  <TableHead>Observação</TableHead>
                  <TableHead>service_order_id</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {auditoria.linhas.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-muted-foreground">
                      Nenhum pagamento com ordem_servico_id desta OS.
                    </TableCell>
                  </TableRow>
                ) : (
                  auditoria.linhas.map((linha) => (
                    <TableRow key={linha.lancamento.id}>
                      <TableCell>
                        {linha.vinculoValido ? (
                          <span className="text-xs text-emerald-400">Válido</span>
                        ) : (
                          <span
                            className="text-xs text-amber-300"
                            title={linha.motivoInvalido}
                          >
                            Suspeito
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {linha.lancamento.id.slice(0, 8)}…
                      </TableCell>
                      <TableCell>{formatarData(linha.lancamento.data)}</TableCell>
                      <TableCell>
                        {getLabelFormaPagamento(linha.lancamento.forma_pagamento)}
                      </TableCell>
                      <TableCell>{formatarMoeda(linha.lancamento.valor)}</TableCell>
                      <TableCell className="text-xs">{linha.parcelamento}</TableCell>
                      <TableCell className="max-w-[160px] truncate text-xs text-muted-foreground">
                        {linha.lancamento.observacao || linha.lancamento.descricao || '—'}
                      </TableCell>
                      <TableCell className="font-mono text-xs max-w-[100px] truncate">
                        {linha.lancamento.ordem_servico_id?.slice(0, 8) ?? '—'}…
                      </TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            'text-xs',
                            linha.origem === 'supabase'
                              ? 'text-sky-300'
                              : 'text-muted-foreground'
                          )}
                        >
                          {linha.origem === 'supabase' ? 'Supabase' : 'Local'}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            title="Remover vínculo desta OS"
                            onClick={() =>
                              setDialogAcao({ acao: 'remover', linha })
                            }
                          >
                            <Link2Off className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            title="Mover para outra OS"
                            onClick={() =>
                              setDialogAcao({ acao: 'mover', linha })
                            }
                          >
                            <ArrowRightLeft className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            title="Excluir pagamento de teste"
                            onClick={() =>
                              setDialogAcao({ acao: 'excluir', linha })
                            }
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {auditoria.linhas.some((l) => !l.vinculoValido) && (
            <p className="text-xs text-muted-foreground">
              Pagamentos &quot;Suspeitos&quot; têm vínculo inconsistente (ex.: descrição aponta outra
              OS). Pagamentos válidos por ID mas que não pertencem à OS devem ser removidos ou
              movidos manualmente.
            </p>
          )}
        </div>
      )}

      <Dialog open={dialogAcao != null} onOpenChange={(open) => !open && fecharDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialogAcao?.acao === 'remover' && 'Remover vínculo desta OS'}
              {dialogAcao?.acao === 'mover' && 'Mover pagamento para outra OS'}
              {dialogAcao?.acao === 'excluir' && 'Excluir pagamento de teste'}
            </DialogTitle>
            <DialogDescription>
              {dialogAcao?.acao === 'remover' &&
                'O pagamento continuará no financeiro, mas deixará de aparecer nesta OS.'}
              {dialogAcao?.acao === 'mover' &&
                'O pagamento passará a pertencer à OS destino informada.'}
              {dialogAcao?.acao === 'excluir' &&
                'Use apenas para dados de teste. O pagamento será marcado como excluído localmente.'}
            </DialogDescription>
          </DialogHeader>

          {dialogAcao && (
            <div className="space-y-3 text-sm">
              <p>
                Pagamento: {formatarMoeda(dialogAcao.linha.lancamento.valor)} —{' '}
                {getLabelFormaPagamento(dialogAcao.linha.lancamento.forma_pagamento)} —{' '}
                {formatarData(dialogAcao.linha.lancamento.data)}
              </p>

              {dialogAcao.acao === 'mover' && (
                <div className="space-y-1">
                  <Label htmlFor="os-destino">Número ou ID da OS destino</Label>
                  <Input
                    id="os-destino"
                    placeholder="Ex.: 1008 ou uuid"
                    value={osDestinoRef}
                    onChange={(e) => setOsDestinoRef(e.target.value)}
                  />
                </div>
              )}

              <div className="space-y-1">
                <Label htmlFor="confirmacao-reparo">
                  Digite <strong>{confirmacaoEsperada}</strong> para confirmar
                </Label>
                <Input
                  id="confirmacao-reparo"
                  value={confirmacaoTexto}
                  onChange={(e) => setConfirmacaoTexto(e.target.value)}
                  autoComplete="off"
                />
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2 pt-2">
            <Button type="button" variant="outline" onClick={fecharDialog}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant={dialogAcao?.acao === 'excluir' ? 'destructive' : 'default'}
              disabled={processando || confirmacaoTexto.trim() !== confirmacaoEsperada}
              onClick={confirmarReparo}
            >
              {processando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
