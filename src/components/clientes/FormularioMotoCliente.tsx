import { useEffect, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { BotaoConsultarPlaca } from '@/components/veiculos/BotaoConsultarPlaca'
import {
  aplicarOrigemConsultaPlaca,
  camposAtuaisDeFormMotoCliente,
  metadadosOrigemCamposInicial,
  montarAtualizacaoConsultaPlaca,
  registrarOrigemManualCampo,
  resetarOrigemConsultaPlaca,
  type CampoAplicavelConsultaPlaca,
  type FormMotoCliente,
  type ModoFormularioVeiculo,
} from '@/lib/moto-form'
import { normalizarPlaca } from '@/lib/placa-normalizar'
import { limparObservacoesVeiculoParaUi } from '@/lib/veiculo-campos-sync'
import { useTermosOficina } from '@/hooks/useTermosOficina'

interface FormularioMotoClienteProps {
  form: FormMotoCliente
  onChange: (form: FormMotoCliente) => void
  idPrefix?: string
  /** Cadastro novo ou edição. Omitir mantém cadastro novo. */
  modoFormulario?: ModoFormularioVeiculo
  excluirMotoId?: string
  clienteIdContexto?: string
  resolverNomeCliente?: (clienteId: string) => string | undefined
}

export function FormularioMotoCliente({
  form,
  onChange,
  idPrefix = 'moto',
  modoFormulario = 'novo',
  excluirMotoId,
  clienteIdContexto,
  resolverNomeCliente,
}: FormularioMotoClienteProps) {
  const termos = useTermosOficina()
  const [origemCampos, setOrigemCampos] = useState(metadadosOrigemCamposInicial)
  const placaAnteriorRef = useRef(normalizarPlaca(form.placa))
  const formRef = useRef(form)
  useEffect(() => {
    formRef.current = form
  }, [form])

  useEffect(() => {
    const placaNorm = normalizarPlaca(form.placa)
    if (placaNorm === placaAnteriorRef.current) return
    placaAnteriorRef.current = placaNorm
    setOrigemCampos(resetarOrigemConsultaPlaca())
  }, [form.placa])

  function marcarManual(campo: CampoAplicavelConsultaPlaca) {
    setOrigemCampos((prev) => registrarOrigemManualCampo(prev, campo))
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-marca`}>Marca *</Label>
        <Input
          id={`${idPrefix}-marca`}
          value={form.marca}
          onChange={(e) => {
            marcarManual('marca')
            onChange({ ...form, marca: e.target.value })
          }}
          placeholder={termos.placeholderMarca}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-modelo`}>Modelo *</Label>
        <Input
          id={`${idPrefix}-modelo`}
          value={form.modelo}
          onChange={(e) => {
            marcarManual('modelo')
            onChange({ ...form, modelo: e.target.value })
          }}
          placeholder={termos.placeholderModelo}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-ano`}>Ano</Label>
        <Input
          id={`${idPrefix}-ano`}
          type="number"
          value={form.ano}
          onChange={(e) => {
            marcarManual('ano')
            onChange({ ...form, ano: Number(e.target.value) })
          }}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-placa`}>Placa *</Label>
        <div className="flex gap-2">
          <Input
            id={`${idPrefix}-placa`}
            value={form.placa}
            onChange={(e) => onChange({ ...form, placa: e.target.value.toUpperCase() })}
            placeholder="ABC1D23"
            className="flex-1"
          />
          <BotaoConsultarPlaca
            placa={form.placa}
            modoFormulario={modoFormulario}
            incluirCombustivel={false}
            excluirMotoId={excluirMotoId}
            clienteIdContexto={clienteIdContexto}
            resolverNomeCliente={resolverNomeCliente}
            camposAtuais={camposAtuaisDeFormMotoCliente(form)}
            origemCampos={origemCampos}
            onDadosEncontrados={(dados, opcoes) => {
              setOrigemCampos((meta) => {
                const atual = formRef.current
                const patch = montarAtualizacaoConsultaPlaca({
                  formAtual: camposAtuaisDeFormMotoCliente(atual),
                  dados,
                  modo: opcoes.sobrescreverConfirmado ? 'confirmado' : 'apenas_vazios',
                  modoFormulario,
                  incluirCombustivel: false,
                  origemCampos: meta,
                })
                onChange({ ...atual, ...patch })
                return aplicarOrigemConsultaPlaca(meta, patch)
              })
            }}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Consulte a placa para preencher marca, modelo, ano e cor. Confira os dados antes de salvar.
          Somente Salvar grava o cadastro.
        </p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-cor`}>Cor</Label>
        <Input
          id={`${idPrefix}-cor`}
          value={form.cor}
          onChange={(e) => {
            marcarManual('cor')
            onChange({ ...form, cor: e.target.value })
          }}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-km`}>Quilometragem</Label>
        <Input
          id={`${idPrefix}-km`}
          type="number"
          min={0}
          value={form.quilometragem}
          onChange={(e) => onChange({ ...form, quilometragem: Number(e.target.value) })}
        />
      </div>
      <div className="grid gap-2 sm:col-span-2">
        <Label htmlFor={`${idPrefix}-chassi`}>Chassi</Label>
        <Input
          id={`${idPrefix}-chassi`}
          value={form.chassi ?? ''}
          onChange={(e) => onChange({ ...form, chassi: e.target.value })}
        />
      </div>
      <div className="grid gap-2 sm:col-span-2">
        <Label htmlFor={`${idPrefix}-obs`}>Observações {termos.artigoVeiculo}</Label>
        <Textarea
          id={`${idPrefix}-obs`}
          value={limparObservacoesVeiculoParaUi(form.observacoes)}
          onChange={(e) =>
            onChange({
              ...form,
              observacoes: limparObservacoesVeiculoParaUi(e.target.value),
            })
          }
          rows={2}
        />
      </div>
    </div>
  )
}
