import { cn } from '@/lib/utils'
import { obterInicialMarcaOficina } from '@/lib/oficina-marca'

interface LogoOficinaProps {
  logoUrl?: string
  nome?: string
  className?: string
  tamanho?: 'xs' | 'sm' | 'md' | 'lg'
  /** circular = avatar redondo; quadrado = cantos arredondados */
  formato?: 'circular' | 'quadrado'
}

const tamanhos = {
  xs: 'h-8 w-8 text-sm',
  sm: 'h-10 w-10 text-base',
  md: 'h-14 w-14 text-xl',
  lg: 'h-20 w-20 text-3xl',
}

export function LogoOficina({
  logoUrl,
  nome,
  className,
  tamanho = 'md',
  formato = 'quadrado',
}: LogoOficinaProps) {
  const dim = tamanhos[tamanho]
  const raio = formato === 'circular' ? 'rounded-full' : 'rounded-lg'

  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={nome ? `Logo ${nome}` : 'Logo da oficina'}
        className={cn(
          'shrink-0 object-contain bg-muted/20',
          raio,
          dim,
          className
        )}
      />
    )
  }

  const inicial = obterInicialMarcaOficina(nome)

  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center bg-primary font-bold text-primary-foreground shadow-sm',
        raio,
        dim,
        className
      )}
      aria-label={nome ? `Logo ${nome}` : 'Logo da oficina'}
      title={nome}
    >
      {inicial}
    </div>
  )
}
