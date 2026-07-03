import type { OsDocumentoViewModel } from '@/lib/os-documento'
import { OsPrintDocument } from '@/components/os/OsPrintDocument'

interface OsDocumentoConteudoProps {
  dados: OsDocumentoViewModel
  exibirFinanceiro?: boolean
}

/** Visualização na tela e PDF usam o mesmo template de impressão. */
export function OsDocumentoConteudo({
  dados,
  exibirFinanceiro = true,
}: OsDocumentoConteudoProps) {
  return <OsPrintDocument dados={dados} exibirFinanceiro={exibirFinanceiro} />
}
