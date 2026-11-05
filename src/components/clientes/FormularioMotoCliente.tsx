import { useEffect, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { BotaoConsultarPlaca } from '@/components/veiculos/BotaoConsultarPlaca'
import { CamposMarcaModelo } from '@/components/veiculos/CamposMarcaModelo'
import {
  anoExibicaoCampoVeiculo,
  aplicarOrigemConsultaPlaca,
  camposAtuaisDeFormMotoCliente,
  metadadosOrigemCamposInicial,
  montarAtualizacaoConsultaPlaca,
  parseAnoCampoVeiculo,
  registrarOrigemManualCampo,
  resetarOrigemConsultaPlaca,
  type CampoAplicavelConsultaPlaca,
  type FormMotoCliente,
  type ModoFormularioVeiculo,
} from '@/lib/moto-form'
import { normalizarPlaca } from '@/lib/placa-normalizar'
import { limparObservacoesVeiculoParaUi, tipoVeiculoPadraoOficina } from '@/lib/veiculo-campos-sync'
import { useOficinaData } from '@/context/CraftContext'
import { useTermosOficina } from '@/hooks/useTermosOficina'
import { normalizarTipoOficina } from '@/types/tipo-oficina'

interface FormularioMotoClienteProps {
  form: FormMotoCliente
  onChange: (form: FormMotoCliente) => void
  idPrefix?: string
  /**
   * Cadastro novo (ClientesPage) ou edição (ClienteMotosSection).
   * Omitir só em cadastro novo; edição deve passar explicitamente "edicao".
   */
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
  const { configuracao } = useOficinaData()
  const tipoPadrao = tipoVeiculoPadraoOficina(normalizarTipoOficina(configuracao.tipo_oficina))
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
      <CamposMarcaModelo
        tipo={form.tipo_veiculo ?? tipoPadrao}
        marca={form.marca}
        modelo={form.modelo}
        onChange={({ marca, modelo }) => {
          if (marca !== form.marca) marcarManual('marca')
          if (modelo !== form.modelo) marcarManual('modelo')
          onChange({ ...form, marca, modelo })
        }}
        idPrefix={idPrefix}
        marcaPlaceholder={termos.placeholderMarca}
        modeloPlaceholder={termos.placeholderModelo}
      />
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-ano`}>Ano</Label>
        <Input
          id={`${idPrefix}-ano`}
          type="number"
          value={anoExibicaoCampoVeiculo(form.ano)}
          placeholder="Ex.: 2020"
          onChange={(e) => {
            marcarManual('ano')
            onChange({ ...form, ano: parseAnoCampoVeiculo(e.target.value) })
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
