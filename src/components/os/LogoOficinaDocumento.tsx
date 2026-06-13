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
    return (
      <img
        src={logoUrl}
        alt={nome ? `Logo ${nome}` : 'Logo da oficina'}
        className={`os-documento-logo-img ${classeTamanho}`}
      />
    )
  }

  return (
    <div className={`os-documento-logo-placeholder ${classeTamanho}`} aria-hidden>
      C
    </div>
  )
}
