import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { FormMotoCliente } from '@/lib/moto-form'

interface FormularioMotoClienteProps {
  form: FormMotoCliente
  onChange: (form: FormMotoCliente) => void
  idPrefix?: string
}

export function FormularioMotoCliente({
  form,
  onChange,
  idPrefix = 'moto',
}: FormularioMotoClienteProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-marca`}>Marca *</Label>
        <Input
          id={`${idPrefix}-marca`}
          value={form.marca}
          onChange={(e) => onChange({ ...form, marca: e.target.value })}
          placeholder="Ex.: Honda"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-modelo`}>Modelo *</Label>
        <Input
          id={`${idPrefix}-modelo`}
          value={form.modelo}
          onChange={(e) => onChange({ ...form, modelo: e.target.value })}
          placeholder="Ex.: CG 160"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-ano`}>Ano</Label>
        <Input
          id={`${idPrefix}-ano`}
          type="number"
          value={form.ano}
          onChange={(e) => onChange({ ...form, ano: Number(e.target.value) })}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-placa`}>Placa *</Label>
        <Input
          id={`${idPrefix}-placa`}
          value={form.placa}
          onChange={(e) => onChange({ ...form, placa: e.target.value.toUpperCase() })}
          placeholder="ABC1D23"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-cor`}>Cor</Label>
        <Input
          id={`${idPrefix}-cor`}
          value={form.cor}
          onChange={(e) => onChange({ ...form, cor: e.target.value })}
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
        <Label htmlFor={`${idPrefix}-obs`}>Observações da moto</Label>
        <Textarea
          id={`${idPrefix}-obs`}
          value={form.observacoes ?? ''}
          onChange={(e) => onChange({ ...form, observacoes: e.target.value })}
          rows={2}
        />
      </div>
    </div>
  )
}
