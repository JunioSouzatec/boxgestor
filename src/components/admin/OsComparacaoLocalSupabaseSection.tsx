import { useCallback, useState } from 'react'
import { CloudUpload, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useCraft } from '@/context/CraftContext'
import { useToast } from '@/context/ToastContext'
import { useAuth } from '@/context/AuthContext'
import { ehAdminSistema } from '@/lib/craft-admin'
import {
  diagnosticarComparacaoOsLocalSupabase,
  restaurarOsLocalParaSupabase,
  type LinhaComparacaoOs,
} from '@/services/admin/os-comparison-diagnostic.service'

const LABEL_STATUS: Record<LinhaComparacaoOs['status'], string> = {
  ambos: 'Local + Supabase',
  somente_local: 'Somente local',
  somente_supabase: 'Somente Supabase',
  nao_encontrada: 'Não encontrada',
}

export function OsComparacaoLocalSupabaseSection() {
  const { dados, oficinaId, aplicarDatabase, recarregarDadosSupabase } = useCraft()
  const { session } = useAuth()
  const { toast } = useToast()
  const isAdminSistema = ehAdminSistema(session?.user)

  const [carregando, setCarregando] = useState(false)
  const [processandoId, setProcessandoId] = useState<string | null>(null)
  const [linhas, setLinhas] = useState<LinhaComparacaoOs[]>([])
  const [resumo, setResumo] = useState<{
    totalLocal: number
    totalSupabase: number
    somenteLocal: number
    somenteSupabase: number
    comPendencias: number
  } | null>(null)

  const analisar = useCallback(async () => {
    if (!isAdminSistema) return
    setCarregando(true)
    try {
      const resultado = await diagnosticarComparacaoOsLocalSupabase(oficinaId, dados)
      setLinhas(resultado.linhas)
      setResumo({
        totalLocal: resultado.totalLocal,
        totalSupabase: resultado.totalSupabase,
        somenteLocal: resultado.somenteLocal,
        somenteSupabase: resultado.somenteSupabase,
        comPendencias: resultado.comPendencias,
      })
    } catch (e) {
      toast.erro(e instanceof Error ? e.message : 'Erro ao comparar OS local x Supabase.')
    } finally {
      setCarregando(false)
    }
  }, [dados, isAdminSistema, oficinaId, toast])

  async function restaurarOs(osId: string) {
    if (!isAdminSistema) return
    setProcessandoId(osId)
    try {
      const resultado = await restaurarOsLocalParaSupabase(oficinaId, osId, dados)
      if (resultado.ok) {
        toast.sucesso(resultado.mensagem)
        if (resultado.db) aplicarDatabase(resultado.db)
        await recarregarDadosSupabase()
        await analisar()
      } else {
        toast.erro(resultado.mensagem)
      }
    } catch (e) {
      toast.erro(e instanceof Error ? e.message : 'Erro ao restaurar OS.')
    } finally {
      setProcessandoId(null)
    }
  }

  if (!isAdminSistema) return null

  return (
    <div className="rounded-md border border-border bg-muted/10 p-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold">Comparar OS local x Supabase</h4>
          <p className="text-xs text-muted-foreground mt-1">
            Verifique se alguma OS sumiu da listagem após resolver pendências de pagamento.
          </p>
          {resumo && (
            <p className="text-xs text-muted-foreground mt-1">
              Local: {resumo.totalLocal} · Supabase: {resumo.totalSupabase} · Somente local:{' '}
              {resumo.somenteLocal} · Somente Supabase: {resumo.somenteSupabase} · Com pendências:{' '}
              {resumo.comPendencias}
            </p>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2"
          disabled={carregando}
          onClick={() => void analisar()}
        >
          {carregando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Comparar OS
        </Button>
      </div>

      {linhas.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>OS</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Pendências</TableHead>
                <TableHead>Vínculo</TableHead>
                <TableHead>Observação</TableHead>
                <TableHead className="text-right">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((linha) => (
                <TableRow key={`${linha.os_id}-${linha.numero}`}>
                  <TableCell>#{linha.numero}</TableCell>
                  <TableCell className="text-xs">{LABEL_STATUS[linha.status]}</TableCell>
                  <TableCell className="text-xs">{linha.cliente_nome ?? '—'}</TableCell>
                  <TableCell className="text-xs">
                    {linha.tem_pendencias_pagamento ? 'Sim' : 'Não'}
                  </TableCell>
                  <TableCell className="text-xs">
                    {linha.vinculo_quebrado ? 'Quebrado' : 'OK'}
                  </TableCell>
                  <TableCell className="max-w-[200px] text-xs text-muted-foreground">
                    {linha.mensagem ?? '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    {linha.pode_restaurar ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 gap-1 text-xs"
                        disabled={Boolean(processandoId)}
                        onClick={() => void restaurarOs(linha.os_id)}
                      >
                        {processandoId === linha.os_id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <CloudUpload className="h-3 w-3" />
                        )}
                        Restaurar OS para Supabase
                      </Button>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {!carregando && linhas.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Clique em &quot;Comparar OS&quot; para verificar divergências entre cache local e Supabase.
        </p>
      )}
    </div>
  )
}
