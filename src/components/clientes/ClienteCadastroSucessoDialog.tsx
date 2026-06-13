import { Link } from 'react-router-dom'
import { Bike, CheckCircle2, ClipboardList, UserCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { Cliente } from '@/types/cliente'
import type { Moto } from '@/types/moto'

interface ClienteCadastroSucessoDialogProps {
  aberto: boolean
  onFechar: () => void
  cliente: Cliente
  moto?: Moto
}

export function ClienteCadastroSucessoDialog({
  aberto,
  onFechar,
  cliente,
  moto,
}: ClienteCadastroSucessoDialogProps) {
  const comMoto = Boolean(moto)

  return (
    <Dialog open={aberto} onOpenChange={(open) => !open && onFechar()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-emerald-400">
            <CheckCircle2 className="h-5 w-5" />
            {comMoto ? 'Cliente e moto cadastrados com sucesso.' : 'Cliente cadastrado com sucesso.'}
          </DialogTitle>
          <DialogDescription>
            {comMoto
              ? `${cliente.nome} e ${moto!.marca} ${moto!.modelo} (${moto!.placa}) estão prontos para atendimento.`
              : `${cliente.nome} foi adicionado à base de clientes.`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 pt-2">
          <Button asChild className="justify-start gap-2">
            <Link to={`/clientes/${cliente.id}`} onClick={onFechar}>
              <UserCircle className="h-4 w-4" />
              Ver cliente
            </Link>
          </Button>
          <Button asChild variant="outline" className="justify-start gap-2">
            <Link to={`/motos?cliente=${cliente.id}`} onClick={onFechar}>
              <Bike className="h-4 w-4" />
              Cadastrar outra moto
            </Link>
          </Button>
          {comMoto && (
            <Button asChild variant="outline" className="justify-start gap-2">
              <Link
                to={`/ordens-servico?novo=1&cliente=${cliente.id}&moto=${moto!.id}`}
                onClick={onFechar}
              >
                <ClipboardList className="h-4 w-4" />
                Criar Ordem de Serviço
              </Link>
            </Button>
          )}
          {!comMoto && (
            <Button asChild variant="outline" className="justify-start gap-2">
              <Link to={`/ordens-servico?novo=1&cliente=${cliente.id}`} onClick={onFechar}>
                <ClipboardList className="h-4 w-4" />
                Criar Ordem de Serviço
              </Link>
            </Button>
          )}
          <Button variant="ghost" onClick={onFechar} className="mt-1">
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
