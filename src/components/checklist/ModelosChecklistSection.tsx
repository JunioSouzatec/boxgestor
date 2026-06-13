import { useState } from 'react'
import { Pencil, Plus, Star, Trash2 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ModeloChecklistDialog } from '@/components/checklist/ModeloChecklistDialog'
import { useCraft, useOficinaData } from '@/context/CraftContext'
import { useAssinatura } from '@/context/AssinaturaContext'
import { BotaoUpgrade } from '@/components/plano/BotaoUpgrade'
import { podeExcluirModeloChecklist } from '@/services/checklist-modelo.service'
import type { ModeloChecklist } from '@/types'

export function ModelosChecklistSection() {
  const {
    adicionarModeloChecklist,
    atualizarModeloChecklist,
    excluirModeloChecklist,
    definirModeloPadraoChecklist,
  } = useCraft()
  const { modelosChecklist } = useOficinaData()
  const { temRecurso } = useAssinatura()
  const [dialogAberto, setDialogAberto] = useState(false)
  const [editando, setEditando] = useState<ModeloChecklist | null>(null)

  const podePersonalizar = temRecurso('checklist_personalizado')

  function abrirNovo() {
    setEditando(null)
    setDialogAberto(true)
  }

  function abrirEditar(modelo: ModeloChecklist) {
    setEditando(modelo)
    setDialogAberto(true)
  }

  function salvarModelo(dados: {
    nome: string
    descricao?: string
    ativo: boolean
    padrao: boolean
    itens: ModeloChecklist['itens']
  }) {
    if (editando) {
      atualizarModeloChecklist(editando.id, dados)
      if (dados.padrao) definirModeloPadraoChecklist(editando.id)
    } else {
      const criado = adicionarModeloChecklist(dados)
      if (dados.padrao) definirModeloPadraoChecklist(criado.id)
    }
  }

  function alternarAtivo(modelo: ModeloChecklist) {
    atualizarModeloChecklist(modelo.id, { ativo: !modelo.ativo })
  }

  function excluir(modelo: ModeloChecklist) {
    if (!podeExcluirModeloChecklist(modelo)) {
      window.alert('O modelo padrão não pode ser excluído.')
      return
    }
    if (window.confirm(`Excluir o modelo "${modelo.nome}"?`)) {
      excluirModeloChecklist(modelo.id)
    }
  }

  const conteudo = (
    <div className="space-y-3">
      {!podePersonalizar && (
        <div className="rounded-lg border border-dashed border-primary/30 bg-primary/5 p-4">
          <p className="text-sm text-muted-foreground">
            No plano Free, a oficina utiliza apenas o checklist padrão de entrada nas ordens de
            serviço. Modelos personalizados estão disponíveis a partir do plano Profissional.
          </p>
          <div className="mt-3">
            <BotaoUpgrade />
          </div>
        </div>
      )}

      {modelosChecklist.map((modelo) => (
        <div
          key={modelo.id}
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-4"
        >
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium">{modelo.nome}</p>
              {modelo.padrao && <Badge variant="secondary">Padrão</Badge>}
              {!modelo.ativo && <Badge variant="outline">Inativo</Badge>}
            </div>
            {modelo.descricao && (
              <p className="mt-1 text-sm text-muted-foreground">{modelo.descricao}</p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              {modelo.itens.length} itens configurados
            </p>
          </div>

          {podePersonalizar && (
            <div className="flex flex-wrap gap-2">
              {!modelo.padrao && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => definirModeloPadraoChecklist(modelo.id)}
                >
                  <Star className="h-4 w-4" />
                  Padrão
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => alternarAtivo(modelo)}>
                {modelo.ativo ? 'Inativar' : 'Ativar'}
              </Button>
              <Button variant="outline" size="sm" onClick={() => abrirEditar(modelo)}>
                <Pencil className="h-4 w-4" />
                Editar
              </Button>
              <Button variant="outline" size="sm" onClick={() => excluir(modelo)}>
                <Trash2 className="h-4 w-4" />
                Excluir
              </Button>
            </div>
          )}
        </div>
      ))}

      {podePersonalizar && (
        <Button onClick={abrirNovo} className="w-fit">
          <Plus className="h-4 w-4" />
          Novo modelo
        </Button>
      )}
    </div>
  )

  return (
    <>
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">Modelos de Checklist</CardTitle>
          <CardDescription>
            Configure listas de conferência personalizadas para uso nas ordens de serviço
          </CardDescription>
        </CardHeader>
        <CardContent>{conteudo}</CardContent>
      </Card>

      <ModeloChecklistDialog
        aberto={dialogAberto}
        onFechar={() => setDialogAberto(false)}
        modelo={editando}
        onSalvar={salvarModelo}
      />
    </>
  )
}
