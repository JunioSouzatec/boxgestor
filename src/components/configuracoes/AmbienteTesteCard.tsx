import { useState } from 'react'
import { AlertTriangle, Download, Trash2 } from 'lucide-react'
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
import { useCraft } from '@/context/CraftContext'
import { useToast } from '@/context/ToastContext'
import { MSG } from '@/lib/mensagens-usuario'
import {
  exportarBackupAntesLimpeza,
  type OpcaoLimpezaTeste,
} from '@/services/backup/office-reset.service'

const CONFIRMACAO_TEXTO = 'LIMPAR'

export function AmbienteTesteCard() {
  const { dados, oficinaId, limparDadosTeste } = useCraft()
  const { toast } = useToast()

  const [opcao, setOpcao] = useState<OpcaoLimpezaTeste>('operacao')
  const [backupExportado, setBackupExportado] = useState(false)
  const [confirmouBackup, setConfirmouBackup] = useState(false)
  const [dialogAberto, setDialogAberto] = useState(false)
  const [textoConfirmacao, setTextoConfirmacao] = useState('')
  const [limpando, setLimpando] = useState(false)

  const podeProsseguirLimpeza = backupExportado || confirmouBackup

  function handleExportarBackup() {
    exportarBackupAntesLimpeza(oficinaId, dados)
    setBackupExportado(true)
    toast.sucesso('Backup exportado com sucesso.')
  }

  function abrirConfirmacao() {
    if (!podeProsseguirLimpeza) {
      toast.erro('Exporte um backup ou confirme que já possui cópia segura antes de limpar.')
      return
    }
    setTextoConfirmacao('')
    setDialogAberto(true)
  }

  async function executarLimpeza() {
    if (textoConfirmacao !== CONFIRMACAO_TEXTO) {
      toast.erro(`Digite exatamente ${CONFIRMACAO_TEXTO} para confirmar.`)
      return
    }

    setLimpando(true)
    try {
      const resultado = await limparDadosTeste(opcao)
      if (!resultado.ok) {
        toast.erro(resultado.mensagem)
        return
      }

      if (resultado.avisosSupabase?.length) {
        toast.atencao(resultado.mensagem)
      } else {
        toast.sucesso(MSG.dadosTesteLimpos)
      }

      setDialogAberto(false)
      window.location.reload()
    } catch (err) {
      if (import.meta.env.DEV) console.error('[Craft] Erro ao limpar dados de teste:', err)
      toast.erro('Não foi possível limpar os dados de teste. Tente novamente.')
    } finally {
      setLimpando(false)
    }
  }

  return (
    <div className="space-y-4 rounded-md border border-amber-500/30 bg-amber-500/5 p-4">
      <div>
        <p className="text-sm font-medium">Ambiente de teste</p>
        <p className="text-xs text-muted-foreground mt-1">
          Simule uma oficina nova apagando dados operacionais de teste. Login, oficina,
          configurações, logo, cores e plano são preservados.
        </p>
      </div>

      <div
        className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100/90"
        role="alert"
      >
        <div className="flex gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
          <p>
            Esta ação apagará clientes, motos, OS, pagamentos, financeiro, agenda e dados
            operacionais desta oficina. Usuário, oficina, configurações, logo e plano serão
            mantidos.
          </p>
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-xs font-medium text-muted-foreground">Tipo de limpeza</legend>
        <label className="flex items-start gap-2 cursor-pointer rounded-md border border-border p-3 hover:bg-muted/20">
          <input
            type="radio"
            name="opcao-limpeza"
            className="mt-1"
            checked={opcao === 'operacao'}
            onChange={() => setOpcao('operacao')}
          />
          <span>
            <span className="text-sm font-medium block">Limpar operação</span>
            <span className="text-xs text-muted-foreground">
              Clientes, motos, OS, pagamentos, financeiro, agenda e lembretes.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2 cursor-pointer rounded-md border border-border p-3 hover:bg-muted/20">
          <input
            type="radio"
            name="opcao-limpeza"
            className="mt-1"
            checked={opcao === 'operacao_estoque'}
            onChange={() => setOpcao('operacao_estoque')}
          />
          <span>
            <span className="text-sm font-medium block">Limpar operação + estoque</span>
            <span className="text-xs text-muted-foreground">
              Inclui peças, fornecedores e movimentações de estoque.
            </span>
          </span>
        </label>
      </fieldset>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" className="gap-2" onClick={handleExportarBackup}>
          <Download className="h-4 w-4" />
          Exportar backup antes de limpar
        </Button>
      </div>

      <label className="flex items-start gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          className="mt-1"
          checked={confirmouBackup}
          onChange={(e) => setConfirmouBackup(e.target.checked)}
        />
        <span className="text-muted-foreground">
          Confirmo que já exportei backup ou possuo cópia segura dos dados.
        </span>
      </label>

      <Button
        type="button"
        variant="destructive"
        className="gap-2"
        disabled={!podeProsseguirLimpeza || limpando}
        onClick={abrirConfirmacao}
      >
        <Trash2 className="h-4 w-4" />
        Limpar dados de teste da oficina
      </Button>

      <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmar limpeza de dados de teste</DialogTitle>
            <DialogDescription>
              Esta ação não pode ser desfeita. Digite{' '}
              <strong className="text-foreground">{CONFIRMACAO_TEXTO}</strong> para confirmar.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="confirmacao-limpar">Confirmação</Label>
            <Input
              id="confirmacao-limpar"
              value={textoConfirmacao}
              onChange={(e) => setTextoConfirmacao(e.target.value)}
              placeholder={CONFIRMACAO_TEXTO}
              autoComplete="off"
              disabled={limpando}
            />
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={limpando}
              onClick={() => setDialogAberto(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={limpando || textoConfirmacao !== CONFIRMACAO_TEXTO}
              onClick={() => void executarLimpeza()}
            >
              {limpando ? 'Limpando…' : 'Confirmar limpeza'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
