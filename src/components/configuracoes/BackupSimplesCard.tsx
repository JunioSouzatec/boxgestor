import { Download, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { RecursoPlanoGate } from '@/components/plano/RecursoPlanoGate'
import { useCraft } from '@/context/CraftContext'
import { useToast } from '@/context/ToastContext'
import { exportarBackupJson } from '@/services/backup/backup.service'
import { useRef } from 'react'

/** Backup simples para a oficina — exportação JSON. Importação fica no admin. */
export function BackupSimplesCard() {
  const { dados, oficinaId } = useCraft()
  const { toast } = useToast()
  const inputRef = useRef<HTMLInputElement>(null)

  function handleExportar() {
    exportarBackupJson(oficinaId, dados)
    toast.sucesso('Backup exportado com sucesso.')
  }

  return (
    <RecursoPlanoGate recurso="financeiro_basico">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Backup da oficina</CardTitle>
          <CardDescription>
            Exporte uma cópia dos dados da sua oficina para guardar com segurança
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button variant="outline" className="gap-2" onClick={handleExportar}>
            <Download className="h-4 w-4" />
            Exportar backup
          </Button>
          <p className="text-xs text-muted-foreground">
            O arquivo inclui clientes, motos, OS e configurações. Para restaurar um backup,
            solicite suporte.
          </p>
          <input ref={inputRef} type="file" accept=".json" className="hidden" />
          <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground" disabled>
            <Upload className="h-4 w-4" />
            Importar backup (via suporte)
          </Button>
        </CardContent>
      </Card>
    </RecursoPlanoGate>
  )
}
