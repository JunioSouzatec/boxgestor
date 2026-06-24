import { useMemo, useState, useEffect } from 'react'
import { textoBuscaSeguro } from '@/lib/dados-legados'
import { Plus, Pencil, Trash2, History, Loader2 } from 'lucide-react'
import { useSearchParams, Link } from 'react-router-dom'
import { PageHeader } from '@/components/layout/PageHeader'
import { BuscaInput } from '@/components/shared/BuscaInput'
import { GarantiaAtivaBadge } from '@/components/shared/StatusBadges'
import { MotoHistoricoDialog } from '@/components/motos/MotoHistoricoDialog'
import { obterGarantiaAtivaMoto } from '@/lib/os'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useCraft, useOficinaData } from '@/context/CraftContext'
import { useTermosOficina } from '@/hooks/useTermosOficina'
import {
  normalizarTipoVeiculo,
  obterOpcoesTipoVeiculoFormulario,
  tipoVeiculoPadraoOficina,
  tipoVeiculoValidoParaSalvar,
  type TipoVeiculo,
} from '@/lib/veiculo-campos-sync'
import { normalizarTipoOficina } from '@/types/tipo-oficina'
import { useConfirmacao } from '@/context/ConfirmacaoContext'
import { useToast } from '@/context/ToastContext'
import { useSalvarAcao } from '@/hooks/useSalvarAcao'
import { useAssinatura } from '@/context/AssinaturaContext'
import { usePlanoEscrita } from '@/hooks/usePlanoEscrita'
import { AvisoLimitePlano } from '@/components/plano/AvisoLimitePlano'
import { mensagemLimite } from '@/services/assinatura/plano-features'
import { BotaoWhatsApp } from '@/components/comunicacao/BotaoWhatsApp'
import { CampoKmEntrada } from '@/components/shared/CampoKmEntrada'
import { MSG } from '@/lib/mensagens-usuario'
import { msgVeiculoSalvoComSucesso } from '@/lib/termos-oficina'
import type { Moto } from '@/types'

type FormMoto = Omit<Moto, 'id' | 'oficina_id' | 'criado_em'>

const formVazio = (tipoPadrao: TipoVeiculo = 'moto'): FormMoto => ({
  cliente_id: '',
  tipo_veiculo: tipoPadrao,
  marca: '',
  modelo: '',
  ano: new Date().getFullYear(),
  placa: '',
  cor: '',
  quilometragem: 0,
  chassi: '',
  combustivel: '',
  renavam: '',
  motor: '',
  cambio: '',
  observacoes: '',
})

export function MotosPage() {
  const { adicionarMoto, atualizarMoto, excluirMoto } = useCraft()
  const { motos, clientes, ordens, configuracao } = useOficinaData()
  const termos = useTermosOficina()
  const tipoOficina = normalizarTipoOficina(configuracao.tipo_oficina)
  const tipoVeiculoPadrao = tipoVeiculoPadraoOficina(tipoOficina)
  const { limiteAtingido, temRecurso } = useAssinatura()
  const { verificarEscrita } = usePlanoEscrita()
  const { confirmar } = useConfirmacao()
  const { toast } = useToast()
  const { executar, salvando } = useSalvarAcao()
  const [searchParams, setSearchParams] = useSearchParams()
  const [busca, setBusca] = useState('')
  const [dialogAberto, setDialogAberto] = useState(false)
  const [historicoMoto, setHistoricoMoto] = useState<Moto | null>(null)
  const [editando, setEditando] = useState<Moto | null>(null)
  const [form, setForm] = useState<FormMoto>(formVazio(tipoVeiculoPadrao))
  const opcoesTipoVeiculo = useMemo(
    () => obterOpcoesTipoVeiculoFormulario(tipoOficina, editando?.tipo_veiculo),
    [tipoOficina, editando?.tipo_veiculo]
  )
  const mostrarTipoVeiculo = opcoesTipoVeiculo.length > 1

  useEffect(() => {
    const clienteId = searchParams.get('cliente')
    if (!clienteId || !clientes.some((c) => c.id === clienteId)) return
    if (limiteAtingido('motos')) return
    setEditando(null)
    setForm({ ...formVazio(tipoVeiculoPadrao), cliente_id: clienteId })
    setDialogAberto(true)
    setSearchParams({}, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- abre uma vez ao vir de outra tela
  }, [searchParams.get('cliente'), clientes.length])

  const getClienteNome = (id: string) => clientes.find((c) => c.id === id)?.nome ?? '—'

  const motosFiltradas = motos.filter(
    (m) =>
      textoBuscaSeguro(m.placa).includes(busca.toLowerCase()) ||
      textoBuscaSeguro(m.marca).includes(busca.toLowerCase()) ||
      textoBuscaSeguro(m.modelo).includes(busca.toLowerCase()) ||
      getClienteNome(m.cliente_id).toLowerCase().includes(busca.toLowerCase())
  )

  function abrirNovo() {
    if (!verificarEscrita()) return
    if (limiteAtingido('motos')) {
      toast.atencao(mensagemLimite('motos'))
      return
    }
    setEditando(null)
    setForm(formVazio(tipoVeiculoPadrao))
    setDialogAberto(true)
  }

  function abrirEditar(moto: Moto) {
    setEditando(moto)
    setForm({
      cliente_id: moto.cliente_id,
      tipo_veiculo: normalizarTipoVeiculo(moto.tipo_veiculo, tipoVeiculoPadrao),
      marca: moto.marca,
      modelo: moto.modelo,
      ano: moto.ano,
      placa: moto.placa,
      cor: moto.cor,
      quilometragem: moto.quilometragem,
      chassi: moto.chassi ?? '',
      combustivel: moto.combustivel ?? '',
      renavam: moto.renavam ?? '',
      motor: moto.motor ?? '',
      cambio: moto.cambio ?? '',
      observacoes: moto.observacoes ?? '',
    })
    setDialogAberto(true)
  }

  function salvar() {
    if (!verificarEscrita()) return
    void executar({
      validar: () => {
        if (!form.cliente_id || !form.marca.trim() || !form.modelo.trim() || !form.placa.trim()) {
          return 'Verifique os campos obrigatórios (cliente, marca, modelo e placa).'
        }
        const tipo = normalizarTipoVeiculo(form.tipo_veiculo, tipoVeiculoPadrao)
        if (
          !tipoVeiculoValidoParaSalvar(
            tipoOficina,
            tipo,
            Boolean(editando),
            editando?.tipo_veiculo
          )
        ) {
          return `O tipo "${tipo}" não está disponível para novos cadastros nesta oficina.`
        }
        return null
      },
      acao: () => {
        const dados = {
          ...form,
          tipo_veiculo: normalizarTipoVeiculo(form.tipo_veiculo, tipoVeiculoPadrao),
          chassi: form.chassi || undefined,
          combustivel: form.combustivel || undefined,
          renavam: form.renavam || undefined,
          motor: form.motor || undefined,
          cambio: form.cambio || undefined,
          observacoes: form.observacoes || undefined,
        }
        if (editando) {
          atualizarMoto(editando.id, dados)
        } else {
          adicionarMoto(dados)
        }
      },
      sucesso: editando ? MSG.alterado : msgVeiculoSalvoComSucesso(termos),
      onSuccess: () => setDialogAberto(false),
    })
  }

  async function confirmarExclusao(moto: Moto) {
    const ok = await confirmar({
      titulo: `Excluir ${termos.palavraVeiculo}`,
      mensagem: `Tem certeza que deseja excluir ${termos.artigoVeiculo} ${moto.marca} ${moto.modelo} (${moto.placa})?`,
      confirmarTexto: 'Excluir',
      destrutivo: true,
    })
    if (ok) {
      excluirMoto(moto.id)
      toast.sucesso(MSG.excluido)
    }
  }

  function abrirHistorico(moto: Moto) {
    if (!temRecurso('historico_avancado_moto')) {
      toast.info('Histórico avançado disponível no plano Premium. Acesse Planos para fazer upgrade.')
      return
    }
    setHistoricoMoto(moto)
  }

  return (
    <div>
      <PageHeader
        titulo={termos.veiculos}
        descricao={`${termos.veiculos} cadastrados vinculados aos clientes`}
        acoes={
          <Button
            onClick={abrirNovo}
            disabled={clientes.length === 0 || limiteAtingido('motos')}
          >
            <Plus className="h-4 w-4" />
            {termos.novoVeiculo}
          </Button>
        }
      />

      <AvisoLimitePlano tipo="motos" />

      <Card>
        <CardContent className="pt-6">
          <BuscaInput
            valor={busca}
            onChange={setBusca}
            placeholder="Buscar por placa, marca, modelo ou cliente..."
            className="mb-4 max-w-sm"
          />

          <Table className="hidden md:table">
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Marca / Modelo</TableHead>
                <TableHead>Ano</TableHead>
                <TableHead>Placa</TableHead>
                <TableHead>Cor</TableHead>
                <TableHead>KM</TableHead>
                <TableHead>Garantia</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {motosFiltradas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
                    Nenhum {termos.palavraVeiculo} encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                motosFiltradas.map((moto) => {
                  const emGarantia = obterGarantiaAtivaMoto(moto.id, ordens) !== null
                  return (
                  <TableRow key={moto.id}>
                    <TableCell>{getClienteNome(moto.cliente_id)}</TableCell>
                    <TableCell className="font-medium">
                      {moto.marca} {moto.modelo}
                    </TableCell>
                    <TableCell>{moto.ano}</TableCell>
                    <TableCell>{moto.placa}</TableCell>
                    <TableCell>{moto.cor}</TableCell>
                    <TableCell>{moto.quilometragem.toLocaleString('pt-BR')} km</TableCell>
                    <TableCell>
                      {emGarantia ? <GarantiaAtivaBadge /> : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {(() => {
                          const clienteMoto = clientes.find((c) => c.id === moto.cliente_id)
                          return clienteMoto ? (
                            <BotaoWhatsApp cliente={clienteMoto} moto={moto} />
                          ) : null
                        })()}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => abrirHistorico(moto)}
                          title={
                            temRecurso('historico_avancado_moto')
                              ? 'Histórico'
                              : 'Histórico — Premium'
                          }
                        >
                          <History className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => abrirEditar(moto)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => confirmarExclusao(moto)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )})
              )}
            </TableBody>
          </Table>

          <div className="md:hidden space-y-3">
            {motosFiltradas.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nenhum {termos.palavraVeiculo} encontrado.
              </p>
            ) : (
              motosFiltradas.map((moto) => {
                const clienteMoto = clientes.find((c) => c.id === moto.cliente_id)
                const emGarantia = obterGarantiaAtivaMoto(moto.id, ordens) !== null
                return (
                  <Card key={moto.id}>
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold">
                            {moto.marca} {moto.modelo}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {moto.placa} · {getClienteNome(moto.cliente_id)}
                          </p>
                        </div>
                        {emGarantia && <GarantiaAtivaBadge />}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {moto.ano} · {moto.cor} · {moto.quilometragem.toLocaleString('pt-BR')} km
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <Button variant="outline" size="lg" className="h-11" asChild>
                          <Link to={`/ordens-servico?novo=1&cliente=${moto.cliente_id}`}>
                            Nova OS
                          </Link>
                        </Button>
                        <Button
                          variant="outline"
                          size="lg"
                          className="h-11"
                          onClick={() => abrirHistorico(moto)}
                        >
                          Histórico
                        </Button>
                        {clienteMoto && (
                          <div className="col-span-2">
                            <BotaoWhatsApp cliente={clienteMoto} moto={moto} className="w-full h-11" />
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )
              })
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editando ? `Editar ${termos.palavraVeiculo.toLowerCase()}` : termos.novoVeiculo}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2 sm:col-span-2">
              <Label>Cliente *</Label>
              <Select
                value={form.cliente_id}
                onValueChange={(v) => setForm({ ...form, cliente_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o cliente" />
                </SelectTrigger>
                <SelectContent>
                  {clientes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {mostrarTipoVeiculo && (
              <div className="grid gap-2 sm:col-span-2">
                <Label>Tipo *</Label>
                <Select
                  value={form.tipo_veiculo ?? tipoVeiculoPadrao}
                  onValueChange={(v) =>
                    setForm({ ...form, tipo_veiculo: normalizarTipoVeiculo(v, tipoVeiculoPadrao) })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {opcoesTipoVeiculo.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="marca">Marca *</Label>
              <Input
                id="marca"
                value={form.marca}
                onChange={(e) => setForm({ ...form, marca: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="modelo">Modelo *</Label>
              <Input
                id="modelo"
                value={form.modelo}
                onChange={(e) => setForm({ ...form, modelo: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ano">Ano</Label>
              <Input
                id="ano"
                type="number"
                value={form.ano}
                onChange={(e) => setForm({ ...form, ano: Number(e.target.value) })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="placa">Placa *</Label>
              <Input
                id="placa"
                value={form.placa}
                onChange={(e) => setForm({ ...form, placa: e.target.value.toUpperCase() })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cor">Cor</Label>
              <Input
                id="cor"
                value={form.cor}
                onChange={(e) => setForm({ ...form, cor: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <CampoKmEntrada
                id="km"
                label="KM de entrada"
                value={form.quilometragem === 0 ? undefined : form.quilometragem}
                onChange={(valor) =>
                  setForm({ ...form, quilometragem: valor ?? 0 })
                }
              />
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="chassi">Chassi</Label>
              <Input
                id="chassi"
                value={form.chassi}
                onChange={(e) => setForm({ ...form, chassi: e.target.value })}
              />
            </div>
            {(tipoOficina === 'carros' ||
              tipoOficina === 'mista' ||
              form.tipo_veiculo === 'carro' ||
              form.tipo_veiculo === 'caminhonete') && (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="combustivel">Combustível</Label>
                  <Input
                    id="combustivel"
                    value={form.combustivel ?? ''}
                    onChange={(e) => setForm({ ...form, combustivel: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="renavam">Renavam</Label>
                  <Input
                    id="renavam"
                    value={form.renavam ?? ''}
                    onChange={(e) => setForm({ ...form, renavam: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="motor">Motor</Label>
                  <Input
                    id="motor"
                    value={form.motor ?? ''}
                    onChange={(e) => setForm({ ...form, motor: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="cambio">Câmbio</Label>
                  <Input
                    id="cambio"
                    value={form.cambio ?? ''}
                    onChange={(e) => setForm({ ...form, cambio: e.target.value })}
                  />
                </div>
              </>
            )}
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="obs">Observações</Label>
              <Textarea
                id="obs"
                value={form.observacoes}
                onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
              />
            </div>
            <div className="flex justify-end gap-2 sm:col-span-2">
              <Button variant="outline" onClick={() => setDialogAberto(false)}>
                Cancelar
              </Button>
              <Button onClick={salvar} disabled={salvando}>
                {salvando ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Salvando…
                  </>
                ) : (
                  'Salvar'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {temRecurso('historico_avancado_moto') && (
        <MotoHistoricoDialog
          moto={historicoMoto}
          ordens={ordens}
          clientes={clientes}
          aberto={historicoMoto !== null}
          onFechar={() => setHistoricoMoto(null)}
        />
      )}
    </div>
  )
}
