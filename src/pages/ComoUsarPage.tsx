import { Link } from 'react-router-dom'
import { BookOpen } from 'lucide-react'
import { useMemo } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ChecklistInicialCard } from '@/components/dashboard/ChecklistInicialCard'
import { useTermosOficina } from '@/hooks/useTermosOficina'

export function ComoUsarPage() {
  const termos = useTermosOficina()

  const passosGuia = useMemo(
    () => [
      {
        titulo: 'Cadastrar cliente',
        descricao: 'Menu Clientes → Novo cliente. Nome e telefone já bastam para começar.',
        link: '/clientes',
      },
      {
        titulo: `Cadastrar ${termos.palavraVeiculo}`,
        descricao: `Menu ${termos.veiculos} → vincule o ${termos.palavraVeiculo} ao cliente (placa, marca, modelo).`,
        link: '/motos',
      },
      {
        titulo: 'Abrir uma OS',
        descricao: `Ordens de Serviço → Nova OS. Escolha cliente, ${termos.palavraVeiculo}, defeito e serviço.`,
        link: '/ordens-servico',
      },
      {
        titulo: 'Registrar pagamento',
        descricao: 'Na OS salva, use a seção Pagamento. Pix, dinheiro ou cartão.',
        link: '/ordens-servico',
      },
      {
        titulo: 'Gerar recibo/PDF',
        descricao: 'Após o pagamento, baixe o recibo ou exporte a OS em PDF.',
        link: '/ordens-servico',
      },
      {
        titulo: 'Configurar checklist',
        descricao: `Configurações → Modelos de checklist para padronizar a entrada ${termos.artigoVeiculo}.`,
        link: '/configuracoes',
      },
      {
        titulo: 'Usar estoque',
        descricao: 'Estoque → cadastre peças. Na OS completa, vincule peças utilizadas.',
        link: '/estoque',
      },
      {
        titulo: 'Entender o Dashboard',
        descricao: 'Visão geral: OS abertas, faturamento e pendências do período.',
        link: '/',
      },
      {
        titulo: 'Planos e upgrade',
        descricao: 'Menu Planos → solicite mudança de plano ou veja o Teste Premium.',
        link: '/planos',
      },
    ],
    [termos]
  )

  return (
    <div>
      <PageHeader
        titulo="Como usar o BoxGestor"
        descricao="Guia rápido para começar na sua oficina"
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <ChecklistInicialCard />

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-primary" />
              Passo a passo
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {passosGuia.map((passo, i) => (
              <div key={passo.titulo} className="rounded-lg border border-border p-3">
                <p className="text-sm font-medium">
                  {i + 1}. {passo.titulo}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{passo.descricao}</p>
                <Button variant="link" className="mt-1 h-auto p-0 text-xs" asChild>
                  <Link to={passo.link}>Ir para a tela →</Link>
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
