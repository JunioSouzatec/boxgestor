import { useMemo } from 'react'
import { Info } from 'lucide-react'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCraft } from '@/context/CraftContext'
import { useOficinaData } from '@/context/CraftContext'
import { usePlanoEscrita } from '@/hooks/usePlanoEscrita'
import {
  podeGerenciarComissoesFuncionarios,
} from '@/services/auth/permissions'
import { useAuth } from '@/context/AuthContext'
import { CRITERIOS_OS_COMISSAO, obterComissoesConfig } from '@/types/comissoes'

/** Motivo comercial documentado no requisito do produto. */
const MOTIVO_OCULTAR_COMISSAO =
  'Por padrão, a comissão fica oculta para o mecânico para evitar influência no valor da OS e manter controle financeiro com o dono.'

export function ComissoesConfigCard() {
  const { session } = useAuth()
  const { atualizarComissoesConfig } = useCraft()
  const { configuracao } = useOficinaData()
  const { verificarEscrita } = usePlanoEscrita()

  const config = useMemo(() => obterComissoesConfig(configuracao), [configuracao])
  const podeEditar = podeGerenciarComissoesFuncionarios(session?.user)

  if (!podeEditar) return null

  function alterarVisibilidade(valor: string) {
    if (!verificarEscrita()) return
    atualizarComissoesConfig({ mecanico_ve_propria_comissao: valor === 'sim' })
  }

  function alterarCriterio(valor: string) {
    if (!verificarEscrita()) return
    atualizarComissoesConfig({
      criterio_os: valor as typeof config.criterio_os,
    })
  }

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-4">
      <p className="text-sm font-medium">Configurações de comissão</p>
      <p className="mt-1 flex items-start gap-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {MOTIVO_OCULTAR_COMISSAO}
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="mecanico-ve-comissao">Permitir que mecânico veja a própria comissão</Label>
          <Select
            value={config.mecanico_ve_propria_comissao ? 'sim' : 'nao'}
            onValueChange={alterarVisibilidade}
          >
            <SelectTrigger id="mecanico-ve-comissao">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="nao">Não</SelectItem>
              <SelectItem value="sim">Sim</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="criterio-os-comissao">OS elegíveis para comissão</Label>
          <Select value={config.criterio_os} onValueChange={alterarCriterio}>
            <SelectTrigger id="criterio-os-comissao">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CRITERIOS_OS_COMISSAO.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  )
}
