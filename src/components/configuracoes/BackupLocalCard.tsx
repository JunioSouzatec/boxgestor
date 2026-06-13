import { useRef, useState } from 'react'
import { Download, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCraft } from '@/context/CraftContext'
import {
  exportarBackupJson,
  importarBackupJson,
  type ResultadoImportacaoBackup,
} from '@/services/backup/backup.service'
import { cn } from '@/lib/utils'

export function BackupLocalCard() {
  const { dados, oficinaId } = useCraft()
  const inputRef = useRef<HTMLInputElement>(null)
  const [importando, setImportando] = useState(false)
  const [resultado, setResultado] = useState<ResultadoImportacaoBackup | null>(null)

  function handleExportar() {
    exportarBackupJson(oficinaId, dados)
  }

  async function handleImportar(file: File) {
    setImportando(true)
    setResultado(null)
    try {
      const res = await importarBackupJson(file, oficinaId)
      setResultado(res)
      if (res.ok) {
        window.location.reload()
      }
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
