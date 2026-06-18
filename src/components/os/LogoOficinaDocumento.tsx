interface LogoOficinaDocumentoProps {
  logoUrl?: string
  nome?: string
  tamanho?: 'md' | 'lg'
}

export function LogoOficinaDocumento({
  logoUrl,
  nome,
  tamanho = 'lg',
}: LogoOficinaDocumentoProps) {
  const classeTamanho =
    tamanho === 'lg' ? 'os-documento-logo-lg' : 'os-documento-logo-md'

  if (logoUrl) {
    const isDataUrl = logoUrl.startsWith('data:')
    return (
      <img
        src={logoUrl}
        alt={nome ? `Logo ${nome}` : 'Logo da oficina'}
        className={`pdf-logo os-documento-logo-img ${classeTamanho}`}
        {...(!isDataUrl ? { crossOrigin: 'anonymous' as const } : {})}
      />
    )
  }

  return (
    <div className={`os-documento-logo-placeholder ${classeTamanho}`} aria-hidden>
      C
    </div>
  )
}
