import { useMemo, useState } from 'react'
import { AlertTriangle, Loader2, Search } from 'lucide-react'
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
  auditarNumeracaoOsCompleta,
  buscarOsAuditoriaNumeracao,
} from '@/services/os-numbering-audit.service'
import { renumerarOsParaProximoDisponivel } from '@/services/os-numbering.service'

export function AuditarNumeracaoOsSection() {
  const { dados, aplicarDatabase } = useCraft()
  const { session } = useAuth()
  const { toast } = useToast()
  const isAdmin = ehAdminSistema(session?.user)

  const [busca, setBusca] = useState('')
  const [processando, setProcessando] = useState(false)
  const [dialogRenumerar, setDialogRenumerar] = useState<string | null>(null)
  const [confirmacao, setConfirmacao] = useState('')

  const resultado = useMemo(() => auditarNumeracaoOsCompleta(dados), [dados])
  const buscaResultados = useMemo(
    () => (busca.trim() ? buscarOsAuditoriaNumeracao(dados, busca) : []),
    [busca, dados]
  )

  async function confirmarRenumerar() {
    if (!dialogRenumerar || confirmacao.trim() !== 'RENUMERAR') {
      toast.atencao('Digite RENUMERAR para confirmar.')
      return
    }
    setProcessando(true)
    try {
      const res = renumerarOsParaProximoDisponivel(dados, dialogRenumerar)
      if (!res) {
        toast.erro('OS não encontrada.')
        return
      }
      aplicarDatabase(res.db)
      toast.sucesso(`OS renumerada para #${res.novoNumero}.`)
      setDialogRenumerar(null)
      setConfirmacao('')
    } catch (e) {
      toast.erro(e instanceof Error ? e.message : 'Erro ao renumerar OS.')
    } finally {
      setProcessando(false)
    }
  }

  if (!isAdmin) return null

  const { auditoria } = resultado

  return (
    <div className="space-y-4 rounded-lg border border-border/60 bg-card/40 p-4">
      <div>
        <h3 className="text-sm font-semibold">Auditar numeração de OS</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Verifique sequência, duplicidades e renumerar manualmente quando necessário. Nenhuma
          alteração automática.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
        <div className="rounded-md border border-border/50 p-3">
          <p className="text-xs text-muted-foreground">Total de OS</p>
          <p className="font-medium">{auditoria.totalOs}</p>
        </div>
        <div className="rounded-md border border-border/50 p-3">
          <p className="text-xs text-muted-foreground">Maior número</p>
          <p className="font-medium">#{auditoria.maiorNumero}</p>
        </div>
        <div className="rounded-md border border-border/50 p-3">
          <p className="text-xs text-muted-foreground">Próxima numeração prevista</p>
          <p className="font-medium">#{auditoria.proximoNumeroPrevisto}</p>
        </div>
        <div className="rounded-md border border-border/50 p-3">
          <p className="text-xs text-muted-foreground">Números duplicados</p>
          <p className="font-medium">{auditoria.duplicados.length}</p>
        </div>
      </div>

      {auditoria.duplicados.length > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">Números duplicados detectados</p>
            <p className="text-xs mt-1 opacity-90">
              {auditoria.duplicados.map((d) => `#${d.numero} (${d.ordens.length}x)`).join(', ')}
            </p>
          </div>
        </div>
      )}

      {auditoria.numerosFaltando.length > 0 && auditoria.numerosFaltando.length <= 20 && (
        <p className="text-xs text-muted-foreground">
          Lacunas na sequência: {auditoria.numerosFaltando.map((n) => `#${n}`).join(', ')}
        </p>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label htmlFor="busca-audit-os">Buscar OS, cliente ou moto</Label>
          <Input
            id="busca-audit-os"
            placeholder="Ex.: 1010, João, ABC-1234"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-56"
          />
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={() => setBusca(busca)}>
          <Search className="mr-2 h-4 w-4" />
          Buscar
        </Button>
      </div>

      {(busca.trim() ? buscaResultados : resultado.linhas.slice(0, 30)).length > 0 && (
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
              {(busca.trim() ? buscaResultados : resultado.linhas.slice(0, 30)).map((linha) => (
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
                      onClick={() => setDialogRenumerar(linha.os.id)}
                    >
                      Renumerar
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

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
              A OS receberá o próximo número disponível na oficina. Pagamentos permanecem
              vinculados pelo ID real da OS.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="confirm-renumerar">
              Digite <strong>RENUMERAR</strong> para confirmar
            </Label>
            <Input
              id="confirm-renumerar"
              value={confirmacao}
              onChange={(e) => setConfirmacao(e.target.value)}
            />
          </div>
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
