import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Loader2, RefreshCw, Search } from 'lucide-react'
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
import { getCraftPersistenceMode } from '@/lib/supabase'
import { formatarData, formatarMoeda } from '@/lib/utils'
import {
  auditarNumeracaoOsCompleta,
  buscarOsAuditoriaNumeracao,
  type LinhaOsAuditoriaNumeracao,
} from '@/services/os-numbering-audit.service'
import {
  auditarNumeracaoOsSupabase,
  reservarProximoNumeroOsSupabase,
  type AuditoriaNumeracaoSupabase,
} from '@/services/os-numbering-rpc.service'
import { repararRenumerarOs } from '@/services/os-numbering.service'

export function AuditarNumeracaoOsSection() {
  const { dados, oficinaId, aplicarDatabase } = useCraft()
  const { session } = useAuth()
  const { toast } = useToast()
  const isAdmin = ehAdminSistema(session?.user)

  const [busca, setBusca] = useState('')
  const [processando, setProcessando] = useState(false)
  const [carregandoSupabase, setCarregandoSupabase] = useState(false)
  const [auditoriaSupabase, setAuditoriaSupabase] = useState<AuditoriaNumeracaoSupabase | null>(
    null
  )
  const [dialogRenumerar, setDialogRenumerar] = useState<LinhaOsAuditoriaNumeracao | null>(null)
  const [confirmacao, setConfirmacao] = useState('')

  const resultado = useMemo(() => auditarNumeracaoOsCompleta(dados), [dados])
  const buscaResultados = useMemo(
    () => (busca.trim() ? buscarOsAuditoriaNumeracao(dados, busca) : []),
    [busca, dados]
  )

  const recarregarSupabase = useCallback(async () => {
    if (getCraftPersistenceMode() !== 'supabase') return
    setCarregandoSupabase(true)
    try {
      const audit = await auditarNumeracaoOsSupabase(oficinaId)
      setAuditoriaSupabase(audit)
    } finally {
      setCarregandoSupabase(false)
    }
  }, [oficinaId])

  useEffect(() => {
    void recarregarSupabase()
  }, [recarregarSupabase, dados.ordens_servico.length])

  async function confirmarRenumerar() {
    if (!dialogRenumerar || confirmacao.trim() !== 'RENUMERAR') {
      toast.atencao('Digite RENUMERAR para confirmar.')
      return
    }
    setProcessando(true)
    try {
      let novoNumero: number
      if (getCraftPersistenceMode() === 'supabase') {
        novoNumero = await reservarProximoNumeroOsSupabase(oficinaId)
      } else {
        const { resolverProximoNumeroOsDisponivel } = await import(
          '@/services/os-numbering.service'
        )
        novoNumero = resolverProximoNumeroOsDisponivel(dados, dialogRenumerar.os.id)
      }
      const db = repararRenumerarOs(dados, dialogRenumerar.os.id, novoNumero)
      aplicarDatabase(db)
      toast.sucesso(`OS renumerada para #${novoNumero}.`)
      setDialogRenumerar(null)
      setConfirmacao('')
      await recarregarSupabase()
    } catch (e) {
      toast.erro(e instanceof Error ? e.message : 'Erro ao renumerar OS.')
    } finally {
      setProcessando(false)
    }
  }

  if (!isAdmin) return null

  const { auditoria } = resultado
  const linhasExibidas = busca.trim() ? buscaResultados : resultado.linhas.slice(0, 50)

  return (
    <div className="space-y-4 rounded-lg border border-border/60 bg-card/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Auditar numeração de OS</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Compare dados locais com o Supabase. Renumerar só com confirmação RENUMERAR.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={carregandoSupabase}
          onClick={() => void recarregarSupabase()}
        >
          {carregandoSupabase ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Atualizar Supabase
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
        <div className="rounded-md border border-border/50 p-3">
          <p className="text-xs text-muted-foreground">Total local</p>
          <p className="font-medium">{auditoria.totalOs}</p>
        </div>
        <div className="rounded-md border border-border/50 p-3">
          <p className="text-xs text-muted-foreground">Maior número (local)</p>
          <p className="font-medium">#{auditoria.maiorNumero}</p>
        </div>
        <div className="rounded-md border border-border/50 p-3">
          <p className="text-xs text-muted-foreground">Total Supabase</p>
          <p className="font-medium">
            {auditoriaSupabase ? auditoriaSupabase.total_os : '—'}
          </p>
        </div>
        <div className="rounded-md border border-border/50 p-3">
          <p className="text-xs text-muted-foreground">Próximo (RPC Supabase)</p>
          <p className="font-medium">
            {auditoriaSupabase ? `#${auditoriaSupabase.proximo_previsto}` : '—'}
          </p>
        </div>
      </div>

      {auditoriaSupabase && auditoriaSupabase.total_os !== auditoria.totalOs && (
        <p className="text-xs text-amber-200/90">
          Diferença local/Supabase: {auditoria.totalOs} local vs {auditoriaSupabase.total_os}{' '}
          no Supabase. Recarregue os dados da oficina se necessário.
        </p>
      )}

      {(auditoria.duplicados.length > 0 ||
        (auditoriaSupabase?.duplicados?.length ?? 0) > 0) && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">Números duplicados</p>
            <p className="text-xs mt-1 opacity-90">
              Local:{' '}
              {auditoria.duplicados.map((d) => `#${d.numero} (${d.ordens.length}x)`).join(', ') ||
                'nenhum'}
              {auditoriaSupabase && auditoriaSupabase.duplicados.length > 0 && (
                <>
                  {' '}
                  · Supabase:{' '}
                  {auditoriaSupabase.duplicados
                    .map((d) => `#${d.number} (${d.quantidade}x)`)
                    .join(', ')}
                </>
              )}
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label htmlFor="busca-audit-os">Buscar OS, cliente ou moto</Label>
          <Input
            id="busca-audit-os"
            placeholder="Ex.: 1009, João, ABC-1234"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-56"
          />
        </div>
        <Button type="button" variant="secondary" size="sm">
          <Search className="mr-2 h-4 w-4" />
          Buscar
        </Button>
      </div>

      <div className="overflow-x-auto rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nº</TableHead>
              <TableHead>ID</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Moto</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Pagamentos</TableHead>
              <TableHead className="text-right">Ação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhasExibidas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  Nenhuma OS encontrada.
                </TableCell>
              </TableRow>
            ) : (
              linhasExibidas.map((linha) => (
                <TableRow key={linha.os.id}>
                  <TableCell>#{linha.os.numero}</TableCell>
                  <TableCell className="font-mono text-xs">{linha.os.id.slice(0, 8)}…</TableCell>
                  <TableCell>{linha.clienteNome}</TableCell>
                  <TableCell className="text-xs">{linha.motoLabel}</TableCell>
                  <TableCell>{formatarData(linha.os.criado_em)}</TableCell>
                  <TableCell>{formatarMoeda(linha.totalOs)}</TableCell>
                  <TableCell className="text-xs">
                    {linha.qtdPagamentos} — {formatarMoeda(linha.totalPagamentos)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setDialogRenumerar(linha)}
                    >
                      Renumerar
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={dialogRenumerar != null}
        onOpenChange={(open) => {
          if (!open) {
            setDialogRenumerar(null)
            setConfirmacao('')
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Renumerar OS duplicada</DialogTitle>
            <DialogDescription>
              A OS receberá o próximo número livre reservado no Supabase. Pagamentos permanecem
              vinculados pelo ID real.
            </DialogDescription>
          </DialogHeader>
          {dialogRenumerar && (
            <div className="space-y-2 text-sm">
              <p>
                <strong>ID:</strong> {dialogRenumerar.os.id}
              </p>
              <p>
                <strong>Número atual:</strong> #{dialogRenumerar.os.numero}
              </p>
              <p>
                <strong>Cliente:</strong> {dialogRenumerar.clienteNome}
              </p>
              <p>
                <strong>Moto:</strong> {dialogRenumerar.motoLabel}
              </p>
              <p>
                <strong>Data:</strong> {formatarData(dialogRenumerar.os.criado_em)}
              </p>
              <p>
                <strong>Total:</strong> {formatarMoeda(dialogRenumerar.totalOs)}
              </p>
              <p>
                <strong>Pagamentos:</strong> {dialogRenumerar.qtdPagamentos} (
                {formatarMoeda(dialogRenumerar.totalPagamentos)})
              </p>
              <div className="space-y-1 pt-2">
                <Label htmlFor="confirm-renumerar">
                  Digite <strong>RENUMERAR</strong> para confirmar
                </Label>
                <Input
                  id="confirm-renumerar"
                  value={confirmacao}
                  onChange={(e) => setConfirmacao(e.target.value)}
                />
              </div>
            </div>
          )}
          <div className="flex flex-col gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setDialogRenumerar(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={processando || confirmacao.trim() !== 'RENUMERAR'}
              onClick={confirmarRenumerar}
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
