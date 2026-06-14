import { useMemo, useState } from 'react'
import { Merge, Loader2, Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useCraft, useOficinaData } from '@/context/CraftContext'
import { useBancoStatus } from '@/context/BancoStatusContext'
import { formatarTelefone, cn } from '@/lib/utils'
import { getCraftPersistenceMode } from '@/lib/supabase'
import { obterContextoOfficeSupabase } from '@/lib/supabase-office-context'
import {
  detectarGruposDuplicadosClientes,
  mesclarClientesDuplicadosNoDatabase,
} from '@/services/clientes/deduplicate-clientes.service'
import { removerClientesSupabasePorIdsLocais } from '@/services/supabase-sync/supabase-phase1.persistence'
import { isModoSupabaseExperimentalAtivo } from '@/services/repository/repository.factory'

export function RepararClientesDuplicadosCard() {
  const { dados, aplicarDatabase, oficinaId } = useCraft()
  const { clientes, motos, ordens } = useOficinaData()
  const { emFallbackLocal, ultimoAviso } = useBancoStatus()
  const [dialogAberto, setDialogAberto] = useState(false)
  const [mesclando, setMesclando] = useState(false)

  const grupos = useMemo(
    () => detectarGruposDuplicadosClientes(clientes, motos, ordens),
    [clientes, motos, ordens]
  )

  const totalDuplicados = useMemo(
    () => grupos.reduce((acc, g) => acc + g.duplicados.length, 0),
    [grupos]
  )

  const handleConfirmarMesclagem = async () => {
    const confirmar = window.confirm(
      `Confirmar mesclagem de ${totalDuplicados} cliente(s) duplicado(s)?\n\n` +
        'Motos, OS, lançamentos e agendamentos serão movidos para o cliente principal. ' +
        'Os registros duplicados serão removidos da lista local.'
    )
    if (!confirmar) return

    setMesclando(true)
    try {
      let dbAtual = dados
      const idsRemoverSupabase: string[] = []

      for (const grupo of grupos) {
        idsRemoverSupabase.push(...grupo.duplicados.map((d) => d.id))
        dbAtual = mesclarClientesDuplicadosNoDatabase(
          dbAtual,
          grupo.principal.id,
          grupo.duplicados.map((d) => d.id)
        )
      }

      aplicarDatabase(dbAtual)

      if (
        isModoSupabaseExperimentalAtivo() &&
        getCraftPersistenceMode() === 'supabase' &&
        idsRemoverSupabase.length > 0
      ) {
        const contexto = await obterContextoOfficeSupabase(oficinaId)
        if (contexto?.officeUuid) {
          const { removidos, erros } = await removerClientesSupabasePorIdsLocais(
            contexto.officeUuid,
            idsRemoverSupabase
          )
          if (import.meta.env.DEV) {
            console.info('[Craft Supabase] Duplicados removidos do Supabase', {
              removidos,
              erros,
            })
          }
          if (erros.length > 0) {
            window.alert(
              `Mesclagem local concluída, mas não foi possível remover todos os duplicados no Supabase:\n${erros.join('\n')}`
            )
          }
        }
      }

      setDialogAberto(false)
    } finally {
      setMesclando(false)
    }
  }

  if (grupos.length === 0) return null

  return (
    <>
      <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-4 space-y-2">
        <div className="flex items-start gap-2">
          <Wrench className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
              Clientes duplicados detectados
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {grupos.length} grupo(s) com {totalDuplicados} registro(s) repetido(s).
              Revise antes de mesclar — nada será apagado sem sua confirmação.
            </p>
            {emFallbackLocal && ultimoAviso && (
              <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">{ultimoAviso}</p>
            )}
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="border-amber-500/50"
          onClick={() => setDialogAberto(true)}
        >
          <Merge className="h-4 w-4 mr-1.5" />
          Reparar clientes duplicados
        </Button>
      </div>

      <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Reparar clientes duplicados</DialogTitle>
            <DialogDescription>
              Prévia do que será unido. O cliente principal é o que tem mais motos/OS ou dados
              mais completos.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {grupos.map((grupo) => (
              <div
                key={grupo.chave}
                className="rounded-md border border-border p-3 space-y-2 text-sm"
              >
                <p className="text-xs text-muted-foreground font-mono">{grupo.chave}</p>

                <div className="rounded bg-primary/5 p-2">
                  <p className="font-medium text-primary">Cliente principal (será mantido)</p>
                  <p>{grupo.principal.nome}</p>
                  <p className="text-muted-foreground">{formatarTelefone(grupo.principal.telefone)}</p>
                  <p className="text-xs mt-1">
                    {grupo.motosPorCliente[grupo.principal.id] ?? 0} moto(s) ·{' '}
                    {grupo.osPorCliente[grupo.principal.id] ?? 0} OS
                  </p>
                </div>

                {grupo.duplicados.map((dup) => (
                  <div key={dup.id} className="rounded bg-muted/50 p-2 border-l-2 border-amber-500">
                    <p className="font-medium text-amber-800 dark:text-amber-200">
                      Duplicado (será removido após mesclar)
                    </p>
                    <p>{dup.nome}</p>
                    <p className="text-muted-foreground">{formatarTelefone(dup.telefone)}</p>
                    <p className="text-xs mt-1">
                      {grupo.motosPorCliente[dup.id] ?? 0} moto(s) ·{' '}
                      {grupo.osPorCliente[dup.id] ?? 0} OS — serão vinculados ao principal
                    </p>
                  </div>
                ))}
              </div>
            ))}
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setDialogAberto(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => void handleConfirmarMesclagem()}
              disabled={mesclando}
              className={cn(mesclando && 'opacity-70')}
            >
              {mesclando ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  Mesclando…
                </>
              ) : (
                <>
                  <Merge className="h-4 w-4 mr-1.5" />
                  Confirmar mesclagem
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
