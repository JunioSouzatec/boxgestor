import { obterIdentidadeApp } from '@/lib/app-versao'
import { supabaseUrl } from '@/lib/supabase-env'
import { cn } from '@/lib/utils'

interface IdentidadeBoxGestorProps {
  className?: string
}

export function IdentidadeBoxGestor({ className }: IdentidadeBoxGestorProps) {
  const { versaoAmigavel, buildCurto, homolog } = obterIdentidadeApp({
    supabaseUrl,
  })

  return (
    <div
      className={cn(
        'select-none px-1 text-[11px] leading-snug text-muted-foreground',
        className
      )}
      aria-label="Versão do BoxGestor"
    >
      <p className="font-medium text-muted-foreground">BoxGestor</p>
      <p>Versão {versaoAmigavel}</p>
      {homolog && (
        <>
          <p>Ambiente: Homologação</p>
          <p>Build: {buildCurto}</p>
        </>
      )}
    </div>
  )
}
