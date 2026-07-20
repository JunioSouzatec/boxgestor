import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ClipboardList, Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { FormularioMotoCliente } from '@/components/clientes/FormularioMotoCliente'
import { useCraft } from '@/context/CraftContext'
import { useConfirmacao } from '@/context/ConfirmacaoContext'
import { useToast } from '@/context/ToastContext'
import { useSalvarAcao } from '@/hooks/useSalvarAcao'
import { usePlanoEscrita } from '@/hooks/usePlanoEscrita'
import { useTermosOficina } from '@/hooks/useTermosOficina'
import {
  formMotoClienteParaInput,
  validarFormMotoCliente,
  type FormMotoCliente,
} from '@/lib/moto-form'
import {
  limparObservacoesVeiculoParaUi,
  prepararMotoParaFormulario,
} from '@/lib/veiculo-campos-sync'
import type { Cliente } from '@/types/cliente'
import type { Moto } from '@/types/moto'

interface ClienteMotosSectionProps {
  cliente: Cliente
  motos: Moto[]
}

function motoParaForm(moto: Moto): FormMotoCliente {
  const campos = prepararMotoParaFormulario(moto)
  return {
    marca: moto.marca,
    modelo: moto.modelo,
    ano: moto.ano,
    placa: moto.placa,
    cor: moto.cor,
    quilometragem: moto.quilometragem ?? 0,
    chassi: moto.chassi ?? '',
    observacoes: campos.observacoes,
  }
}

export function ClienteMotosSection({ cliente, motos }: ClienteMotosSectionProps) {
  const termos = useTermosOficina()
  const { atualizarMoto, excluirMoto } = useCraft()
  const { confirmar } = useConfirmacao()
  const { toast } = useToast()
  const { executar, salvando } = useSalvarAcao()
  const { verificarEscrita } = usePlanoEscrita()

  const [editando, setEditando] = useState<Moto | null>(null)
  const [form, setForm] = useState<FormMotoCliente | null>(null)

  function abrirEditar(moto: Moto) {
    if (!verificarEscrita()) return
    setEditando(moto)
    setForm(motoParaForm(moto))
  }

  function fecharEditar() {
    setEditando(null)
    setForm(null)
  }

  function salvarEdicao() {
    if (!editando || !form) return
    void executar({
      validar: () => validarFormMotoCliente(form, termos),
      acao: async () => {
        // Preserva tipo_veiculo do registro antigo (meta em notes) se não estiver no form
        const metaAntigo = prepararMotoParaFormulario(editando)
        const patch = {
          ...formMotoClienteParaInput(form, cliente.id),
          observacoes: limparObservacoesVeiculoParaUi(form.observacoes) || undefined,
          tipo_veiculo: editando.tipo_veiculo ?? metaAntigo.tipo_veiculo,
          combustivel: (editando.combustivel ?? metaAntigo.combustivel) || undefined,
          renavam: (editando.renavam ?? metaAntigo.renavam) || undefined,
          motor: (editando.motor ?? metaAntigo.motor) || undefined,
          cambio: (editando.cambio ?? metaAntigo.cambio) || undefined,
        }
        const r = await atualizarMoto(editando.id, patch)
        if (r && r.pendente && !r.remoto) {
          return 'Veículo salvo localmente. Aguardando sincronização com o servidor.'
        }
        if (r && !r.ok && !r.pendente) {
          throw new Error(r.erro ?? 'Não foi possível salvar o veículo no servidor.')
        }
        return `${termos.veiculo} atualizado com sucesso.`
      },
      onSuccess: fecharEditar,
    })
  }

  async function confirmarExclusao(moto: Moto) {
    if (!verificarEscrita()) return
    const ok = await confirmar({
      titulo: `Excluir ${termos.palavraVeiculo}`,
      mensagem: `Tem certeza que deseja excluir ${moto.marca} ${moto.modelo} (${moto.placa})?`,
      confirmarTexto: 'Excluir',
      destrutivo: true,
    })
    if (!ok) return
    excluirMoto(moto.id)
    toast.sucesso(`${termos.veiculo} excluído com sucesso.`)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">{termos.veiculos} do cliente</h3>
        <Button asChild size="sm" variant="outline" className="gap-2">
          <Link to={`/motos?cliente=${cliente.id}`}>
            <Plus className="h-4 w-4" />
            {termos.novoVeiculo}
          </Link>
        </Button>
      </div>

      {motos.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhum {termos.palavraVeiculo} cadastrado para este cliente.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Marca / Modelo</TableHead>
              <TableHead>Placa</TableHead>
              <TableHead>Ano</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {motos.map((moto) => (
              <TableRow key={moto.id}>
                <TableCell className="font-medium">
                  {moto.marca} {moto.modelo}
                </TableCell>
                <TableCell>{moto.placa}</TableCell>
                <TableCell>{moto.ano}</TableCell>
                <TableCell className="text-right">
                  <div className="flex flex-wrap justify-end gap-1">
                    <Button asChild variant="ghost" size="sm" className="gap-1">
                      <Link to={`/ordens-servico?novo=1&cliente=${cliente.id}&moto=${moto.id}`}>
                        <ClipboardList className="h-4 w-4" />
                        Nova OS
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1"
                      onClick={() => abrirEditar(moto)}
                    >
                      <Pencil className="h-4 w-4" />
                      Editar
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => confirmarExclusao(moto)}
                      aria-label={`Excluir ${termos.palavraVeiculo}`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={Boolean(editando)} onOpenChange={(aberto) => !aberto && fecharEditar()}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar {termos.palavraVeiculo}</DialogTitle>
          </DialogHeader>
          {form && (
            <FormularioMotoCliente form={form} onChange={setForm} idPrefix="cliente-moto-editar" />
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={fecharEditar} disabled={salvando}>
              Cancelar
            </Button>
            <Button onClick={salvarEdicao} disabled={salvando}>
              Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
