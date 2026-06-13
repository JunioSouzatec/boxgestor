import { cn } from '@/lib/utils'

interface LogoOficinaProps {
  logoUrl?: string
  nome?: string
  className?: string
  tamanho?: 'sm' | 'md' | 'lg'
}

const tamanhos = {
  sm: 'h-10 w-10 text-base',
  md: 'h-14 w-14 text-xl',
  lg: 'h-20 w-20 text-3xl',
}

export function LogoOficina({
  logoUrl,
  nome,
  className,
  tamanho = 'md',
}: LogoOficinaProps) {
  const dim = tamanhos[tamanho]

  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={nome ? `Logo ${nome}` : 'Logo da oficina'}
        className={cn('rounded-md object-contain', dim, className)}
      />
    )
  }

  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-md bg-zinc-900 font-bold text-white',
        dim,
        className
      )}
      aria-hidden
    >
      C
    </div>
  )
}
