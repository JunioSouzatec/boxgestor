import { useRef, useState } from 'react'
import { Download, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCraft } from '@/context/CraftContext'
import { useToast } from '@/context/ToastContext'
import {
  exportarBackupJson,
  importarBackupJson,
  type ResultadoImportacaoBackup,
} from '@/services/backup/backup.service'
import { cn } from '@/lib/utils'

export function BackupLocalCard() {
  const { dados, oficinaId } = useCraft()
  const { toast } = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const [importando, setImportando] = useState(false)
  const [resultado, setResultado] = useState<ResultadoImportacaoBackup | null>(null)

  function handleExportar() {
    exportarBackupJson(oficinaId, dados)
    toast.sucesso('Backup exportado com sucesso.')
  }

  async function handleImportar(file: File) {
    setImportando(true)
    setResultado(null)
    try {
      const res = await importarBackupJson(file, oficinaId)
      setResultado(res)
      if (res.ok) {
        toast.sucesso('Backup importado com sucesso. Recarregando…')
        window.location.reload()
      } else {
        toast.erro(res.mensagem || 'Não foi possível importar o backup.')
      }
    } catch (err) {
      if (import.meta.env.DEV) console.error('[Craft] Erro ao importar backup:', err)
      toast.erro('Não foi possível importar o backup.')
    } finally {
      setImportando(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="space-y-4 rounded-md border border-border bg-muted/10 p-4">
      <div>
        <p className="text-sm font-medium">Backup local (JSON)</p>
        <p className="text-xs text-muted-foreground mt-1">
          Exporta ou importa todos os dados do navegador, incluindo logo, cores e configurações de
          aparência. A logo permanece em base64 no arquivo.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" className="gap-2" onClick={handleExportar}>
          <Download className="h-4 w-4" />
          Exportar backup
        </Button>
        <Button
          type="button"
          variant="outline"
          className="gap-2"
          disabled={importando}
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="h-4 w-4" />
          {importando ? 'Importando…' : 'Importar backup'}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void handleImportar(file)
          }}
        />
      </div>

      {resultado && !resultado.ok && (
        <div
          className={cn(
            'rounded-md border p-3 text-sm',
            'border-red-500/30 bg-red-500/5 text-red-100/90'
          )}
        >
          {resultado.mensagem}
        </div>
      )}
    </div>
  )
}
