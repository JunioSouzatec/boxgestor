import { useEffect, useMemo, useState } from 'react'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAuth } from '@/context/AuthContext'
import { useViewportMobile } from '@/hooks/useViewportMobile'
import { cn } from '@/lib/utils'
import { getLabelPapel, type AuthUser } from '@/types/auth'

const SEM_RESPONSAVEL = '__sem_responsavel__'

export interface ResponsavelOSSelectProps {
  responsavelId?: string
  responsavelNome?: string
  disabled?: boolean
  onChange: (valor: { responsavel_id?: string; responsavel?: string }) => void
}

function ordenarCandidatos(usuarios: AuthUser[]): AuthUser[] {
  const peso = (u: AuthUser) => {
    if (u.papel === 'mecanico') return 0
    if (u.papel === 'gerente') return 1
    if (u.papel === 'dono') return 2
    return 3
  }
  return [...usuarios]
    .filter((u) => u.ativo)
    .sort((a, b) => {
      const d = peso(a) - peso(b)
      if (d !== 0) return d
      return a.nome.localeCompare(b.nome, 'pt-BR')
    })
}

export function ResponsavelOSSelect({
  responsavelId,
  responsavelNome,
  disabled = false,
  onChange,
}: ResponsavelOSSelectProps) {
  const { carregarUsuarios, listarUsuarios } = useAuth()
  const isMobile = useViewportMobile()
  const [usuarios, setUsuarios] = useState<AuthUser[]>(() => listarUsuarios())
  const [carregando, setCarregando] = useState(false)

  useEffect(() => {
    let ativo = true
    setCarregando(true)
    void carregarUsuarios()
      .then((lista) => {
        if (ativo) setUsuarios(lista)
      })
      .finally(() => {
        if (ativo) setCarregando(false)
      })
    return () => {
      ativo = false
    }
  }, [carregarUsuarios])

  const candidatos = useMemo(() => ordenarCandidatos(usuarios), [usuarios])

  const valorSelect = useMemo(() => {
    if (responsavelId && candidatos.some((u) => u.id === responsavelId)) {
      return responsavelId
    }
    if (responsavelNome?.trim()) {
      const porNome = candidatos.find(
        (u) => u.nome.trim().toLowerCase() === responsavelNome.trim().toLowerCase()
      )
      if (porNome) return porNome.id
    }
    return SEM_RESPONSAVEL
  }, [responsavelId, responsavelNome, candidatos])

  function aplicarValor(valor: string) {
    if (valor === SEM_RESPONSAVEL) {
      onChange({ responsavel_id: undefined, responsavel: undefined })
      return
    }
    const user = candidatos.find((u) => u.id === valor)
    if (!user) {
      onChange({ responsavel_id: undefined, responsavel: undefined })
      return
    }
    onChange({ responsavel_id: user.id, responsavel: user.nome })
  }

  const classeCampo = cn(
    'col-span-full grid gap-2 min-w-0',
    isMobile && 'rounded-lg border border-border bg-muted/20 p-3'
  )

  return (
    <div id="os-campo-responsavel" className={classeCampo}>
      <Label htmlFor="os-responsavel" className={cn(isMobile && 'text-sm font-semibold')}>
        Responsável pela OS
      </Label>

      {isMobile ? (
        <select
          id="os-responsavel"
          value={valorSelect}
          disabled={disabled || carregando}
          onChange={(e) => aplicarValor(e.target.value)}
          className={cn(
            'flex h-11 w-full min-w-0 appearance-none rounded-md border border-border bg-background px-3 py-2 text-base shadow-sm',
            'focus:outline-none focus:ring-2 focus:ring-primary/50',
            'disabled:cursor-not-allowed disabled:opacity-50'
          )}
        >
          <option value={SEM_RESPONSAVEL}>
            {carregando ? 'Carregando funcionários…' : 'Selecionar funcionário/mecânico'}
          </option>
          {candidatos.map((u) => (
            <option key={u.id} value={u.id}>
              {`${u.nome} — ${getLabelPapel(u.papel)}`}
            </option>
          ))}
        </select>
      ) : (
        <Select value={valorSelect} disabled={disabled || carregando} onValueChange={aplicarValor}>
          <SelectTrigger id="os-responsavel" className="w-full">
            <SelectValue
              placeholder={
                carregando ? 'Carregando funcionários…' : 'Selecionar funcionário/mecânico'
              }
            />
          </SelectTrigger>
          <SelectContent position="popper" className="z-[120] max-h-72">
            <SelectItem value={SEM_RESPONSAVEL}>Sem responsável</SelectItem>
            {candidatos.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {`${u.nome} — ${getLabelPapel(u.papel)}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {responsavelNome?.trim() && valorSelect === SEM_RESPONSAVEL && (
        <p className="text-xs text-muted-foreground">
          Nome legado na OS: {responsavelNome.trim()} (selecione o funcionário para vincular)
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Mecânico responsável pela execução. Usado na listagem e na futura comissão.
      </p>
    </div>
  )
}
