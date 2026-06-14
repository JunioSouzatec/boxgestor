import { useEffect, useState } from 'react'
import { getCraftPersistenceMode } from '@/lib/supabase'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import {
  aguardarOsNoSupabase,
  diagnosticarOsParaPagamento,
  type DiagnosticoOsPagamento,
  type OsSupabaseMeta,
} from '@/services/supabase-sync/payment-sync.helpers'
import type { CraftDatabase } from '@/types/database'
import type { OrdemServico } from '@/types/ordem-servico'

interface EstadoOsSupabase {
  verificando: boolean
  salva: boolean
  diagnostico: DiagnosticoOsPagamento | null
  meta: OsSupabaseMeta | null
}

export function useOsStatusSupabase(
  os: OrdemServico | null,
  officeLocalId: string,
  dados: CraftDatabase,
  recarregarEm = 0,
  aguardarAposSalvar = false,
  metaForcada: OsSupabaseMeta | null = null
): EstadoOsSupabase {
  const online = useOnlineStatus()
  const [estado, setEstado] = useState<EstadoOsSupabase>({
    verificando: false,
    salva: getCraftPersistenceMode() !== 'supabase' || !online || Boolean(metaForcada),
    diagnostico: null,
    meta: metaForcada,
  })

  useEffect(() => {
    if (metaForcada?.service_order_id) {
      setEstado({
        verificando: false,
        salva: true,
        diagnostico: null,
        meta: metaForcada,
      })
      return
    }

    if (!os) {
      setEstado({ verificando: false, salva: false, diagnostico: null, meta: null })
      return
    }

    if (getCraftPersistenceMode() !== 'supabase') {
      setEstado({ verificando: false, salva: true, diagnostico: null, meta: null })
      return
    }

    if (!online) {
      setEstado({ verificando: false, salva: true, diagnostico: null, meta: null })
      return
    }

    let cancelado = false
    setEstado((s) => ({ ...s, verificando: true }))

    const verificar = async () => {
      const diag = aguardarAposSalvar
        ? await aguardarOsNoSupabase(officeLocalId, os)
        : await diagnosticarOsParaPagamento(officeLocalId, os, dados)

      if (cancelado) return

      const serviceOrderId = diag?.service_order_id ?? diag?.os_supabase_id
      setEstado({
        verificando: false,
        salva: diag?.existe_no_supabase ?? false,
        diagnostico: diag,
        meta:
          diag?.existe_no_supabase && serviceOrderId
            ? { service_order_id: serviceOrderId, supabase_id: serviceOrderId }
            : null,
      })
    }

    void verificar()

    return () => {
      cancelado = true
    }
  }, [
    os?.id,
    os?.numero,
    officeLocalId,
    recarregarEm,
    aguardarAposSalvar,
    online,
    metaForcada?.service_order_id,
  ])

  return estado
}
