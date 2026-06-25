import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Loader2, RotateCcw, Shield } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/context/AuthContext'
import { useCraft, useOficinaData } from '@/context/CraftContext'
import { useSalvarAcao } from '@/hooks/useSalvarAcao'
import { MSG } from '@/lib/mensagens-usuario'
import { getCraftPersistenceMode } from '@/lib/supabase'
import { podeAlterarPermissoesEquipe } from '@/services/auth/permissions'
import { salvarDadosOficinaComSupabase } from '@/services/supabase-sync/salvar-oficina.service'
import {
  aplicarRegrasVisuaisMecanico,
  mesclarPermissoesEquipeComComissoes,
  normalizarPermissoesEquipe,
  PERMISSOES_EQUIPE_PADRAO,
  obterPermissoesEquipe,
  type PermissoesEquipeConfig,
  type PermissoesGerente,
  type PermissoesMecanico,
  type PermissoesRecepcao,
} from '@/types/permissoes-equipe'
import { TelaSemPermissao } from '@/components/layout/TelaSemPermissao'

function SwitchPermissao({
  id,
  label,
  checked,
  onChange,
  aviso,
}: {
  id: string
  label: string
  checked: boolean
  onChange: (v: boolean) => void
  aviso?: string
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="flex cursor-pointer items-start gap-3">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-1 h-4 w-4 rounded border-border"
        />
        <span className="text-sm">{label}</span>
      </label>
      {aviso && checked && (
        <p className="ml-7 text-xs text-amber-600 dark:text-amber-500">{aviso}</p>
      )}
    </div>
  )
}

export function PermissoesEquipePage() {
  const { session } = useAuth()
  const { dados, atualizarPermissoesEquipe, atualizarConfiguracao } = useCraft()
  const { configuracao } = useOficinaData()
  const { executar, salvando } = useSalvarAcao()

  const [perm, setPerm] = useState<PermissoesEquipeConfig>(() =>
    obterPermissoesEquipe(configuracao)
  )

  useEffect(() => {
    setPerm(obterPermissoesEquipe(configuracao))
  }, [configuracao])

  if (!podeAlterarPermissoesEquipe(session?.user)) {
    return <TelaSemPermissao />
  }

  function patchGerente(patch: Partial<PermissoesGerente>) {
    setPerm((p) => ({ ...p, gerente: { ...p.gerente, ...patch } }))
  }

  function patchRecepcao(patch: Partial<PermissoesRecepcao>) {
    setPerm((p) => ({ ...p, recepcao: { ...p.recepcao, ...patch } }))
  }

  function patchMecanico(patch: Partial<PermissoesMecanico>) {
    setPerm((p) => ({
      ...p,
      mecanico: aplicarRegrasVisuaisMecanico({ ...p.mecanico, ...patch }),
    }))
  }

  function restaurarPadrao() {
    setPerm({ ...PERMISSOES_EQUIPE_PADRAO })
  }

  async function salvar() {
    await executar({
      acao: async () => {
        const normalizado: PermissoesEquipeConfig = {
          ...perm,
          mecanico: aplicarRegrasVisuaisMecanico(perm.mecanico),
        }
        const mesclado = mesclarPermissoesEquipeComComissoes(
          normalizarPermissoesEquipe(normalizado),
          configuracao.comissoes_config
        )

        if (getCraftPersistenceMode() === 'supabase') {
          const resultado = await salvarDadosOficinaComSupabase(
            dados,
            {
              permissions: mesclado.permissions,
              comissoes_config: mesclado.comissoes_config,
            },
            (patch) => atualizarConfiguracao(patch)
          )
          if (!resultado.salvouSupabase) {
            throw new Error(MSG.erroSalvarPermissoesEquipe)
          }
        } else {
          atualizarPermissoesEquipe(mesclado.permissions)
        }
      },
      sucesso: MSG.permissoesEquipeSalvas,
      erro: MSG.erroSalvarPermissoesEquipe,
    })
  }

  return (
    <div>
      <PageHeader
        titulo="Permissões da equipe"
        descricao="Configure o que gerente, recepção e mecânico podem acessar nesta oficina."
        acoes={
          <Button variant="outline" size="sm" asChild>
            <Link to="/configuracoes">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar
            </Link>
          </Button>
        }
      />

      <p className="mb-6 flex items-start gap-2 rounded-lg border border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
        <Shield className="mt-0.5 h-4 w-4 shrink-0" />
        Dono e Admin Sistema sempre têm acesso total. Alterações aqui afetam apenas gerente,
        recepção e mecânico.
      </p>

      <div className="mb-6 flex flex-wrap gap-2">
        <Button variant="outline" onClick={restaurarPadrao} disabled={salvando}>
          <RotateCcw className="mr-2 h-4 w-4" />
          Restaurar padrão seguro
        </Button>
        <Button onClick={() => void salvar()} disabled={salvando}>
          {salvando ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Salvando…
            </>
          ) : (
            'Salvar permissões'
          )}
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-1">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Gerente</CardTitle>
            <CardDescription>
              Gerencia a operação da oficina. Dados financeiros sensíveis ficam bloqueados, a
              menos que o dono libere.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <SwitchPermissao
              id="g-fin-op"
              label="Ver financeiro operacional"
              checked={perm.gerente.ver_financeiro_operacional}
              onChange={(v) => patchGerente({ ver_financeiro_operacional: v })}
            />
            <SwitchPermissao
              id="g-fin-completo"
              label="Ver financeiro completo"
              checked={perm.gerente.ver_financeiro_completo}
              onChange={(v) => patchGerente({ ver_financeiro_completo: v })}
              aviso="Atenção: esta permissão pode liberar dados financeiros sensíveis da oficina."
            />
            <SwitchPermissao
              id="g-salarios"
              label="Ver salários e comissões"
              checked={perm.gerente.ver_salarios_comissoes}
              onChange={(v) => patchGerente({ ver_salarios_comissoes: v })}
              aviso="Atenção: o gerente poderá ver salários, comissões e despesas internas de funcionários. Requer proteção no servidor (consulte docs/supabase-permissoes-equipe-gerente-comissoes.sql)."
            />
            <SwitchPermissao
              id="g-relatorios"
              label="Ver relatórios operacionais"
              checked={perm.gerente.ver_relatorios_operacionais}
              onChange={(v) => patchGerente({ ver_relatorios_operacionais: v })}
            />
            <SwitchPermissao
              id="g-pagamentos"
              label="Registrar pagamentos"
              checked={perm.gerente.registrar_pagamentos}
              onChange={(v) => patchGerente({ registrar_pagamentos: v })}
            />
            <SwitchPermissao
              id="g-estoque"
              label="Gerenciar estoque"
              checked={perm.gerente.gerenciar_estoque}
              onChange={(v) => patchGerente({ gerenciar_estoque: v })}
            />
            <SwitchPermissao
              id="g-agenda"
              label="Gerenciar agenda e lembretes"
              checked={perm.gerente.gerenciar_agenda_lembretes}
              onChange={(v) => patchGerente({ gerenciar_agenda_lembretes: v })}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recepção / Atendente</CardTitle>
            <CardDescription>
              Atendimento, cadastro e apoio operacional. Sem acesso financeiro sensível por
              padrão.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <SwitchPermissao
              id="r-clientes"
              label="Criar clientes"
              checked={perm.recepcao.criar_clientes}
              onChange={(v) => patchRecepcao({ criar_clientes: v })}
            />
            <SwitchPermissao
              id="r-veiculos"
              label="Criar veículos/motos"
              checked={perm.recepcao.criar_veiculos}
              onChange={(v) => patchRecepcao({ criar_veiculos: v })}
            />
            <SwitchPermissao
              id="r-os"
              label="Criar OS"
              checked={perm.recepcao.criar_os}
              onChange={(v) => patchRecepcao({ criar_os: v })}
            />
            <SwitchPermissao
              id="r-pagamentos"
              label="Registrar pagamentos"
              checked={perm.recepcao.registrar_pagamentos}
              onChange={(v) => patchRecepcao({ registrar_pagamentos: v })}
            />
            <SwitchPermissao
              id="r-agenda"
              label="Ver agenda e lembretes"
              checked={perm.recepcao.ver_agenda_lembretes}
              onChange={(v) => patchRecepcao({ ver_agenda_lembretes: v })}
            />
            <SwitchPermissao
              id="r-relatorios"
              label="Ver relatórios operacionais básicos"
              checked={perm.recepcao.ver_relatorios_operacionais}
              onChange={(v) => patchRecepcao({ ver_relatorios_operacionais: v })}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Mecânico</CardTitle>
            <CardDescription>
              Acesso operacional às OS, checklist e execução dos serviços.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <SwitchPermissao
              id="m-todas-os"
              label="Ver todas as OS"
              checked={perm.mecanico.ver_todas_os}
              onChange={(v) =>
                patchMecanico(
                  v
                    ? { ver_todas_os: true, ver_apenas_os_atribuidas: false }
                    : { ver_todas_os: false, ver_apenas_os_atribuidas: true }
                )
              }
            />
            <SwitchPermissao
              id="m-os-atrib"
              label="Ver apenas OS atribuídas a ele"
              checked={perm.mecanico.ver_apenas_os_atribuidas && !perm.mecanico.ver_todas_os}
              onChange={(v) =>
                patchMecanico(
                  v
                    ? { ver_todas_os: false, ver_apenas_os_atribuidas: true }
                    : { ver_apenas_os_atribuidas: false }
                )
              }
            />
            <SwitchPermissao
              id="m-status"
              label="Alterar status da OS"
              checked={perm.mecanico.alterar_status_os}
              onChange={(v) => patchMecanico({ alterar_status_os: v })}
            />
            <SwitchPermissao
              id="m-checklist"
              label="Preencher checklist"
              checked={perm.mecanico.preencher_checklist}
              onChange={(v) => patchMecanico({ preencher_checklist: v })}
            />
            <SwitchPermissao
              id="m-obs"
              label="Adicionar observações"
              checked={perm.mecanico.adicionar_observacoes}
              onChange={(v) => patchMecanico({ adicionar_observacoes: v })}
            />
            <SwitchPermissao
              id="m-pecas"
              label="Informar peças/serviços usados"
              checked={perm.mecanico.informar_pecas_servicos}
              onChange={(v) => patchMecanico({ informar_pecas_servicos: v })}
            />
            <SwitchPermissao
              id="m-comissao"
              label="Ver própria comissão"
              checked={perm.mecanico.ver_propria_comissao}
              onChange={(v) => patchMecanico({ ver_propria_comissao: v })}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
