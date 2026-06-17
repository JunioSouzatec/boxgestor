import type { OsDocumentoViewModel } from '@/lib/os-documento'
import { OsPrintDocument } from '@/components/os/OsPrintDocument'

interface OsDocumentoConteudoProps {
  dados: OsDocumentoViewModel
}

/** Visualização na tela e PDF usam o mesmo template de impressão. */
export function OsDocumentoConteudo({ dados }: OsDocumentoConteudoProps) {
  return <OsPrintDocument dados={dados} />
}
