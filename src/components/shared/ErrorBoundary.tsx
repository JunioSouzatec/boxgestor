import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { obterContextoPermissoesDebug } from '@/lib/permissions-debug'

interface Props {
  children: ReactNode
  titulo?: string
}

interface State {
  erro: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { erro: null }

  static getDerivedStateFromError(erro: Error): State {
    return { erro }
  }

  componentDidCatch(erro: Error, info: ErrorInfo): void {
    const rota =
      typeof window !== 'undefined' ? window.location.pathname + window.location.search : '(desconhecida)'
    const debug = obterContextoPermissoesDebug()

    console.error('[Craft Oficina] Erro de interface — diagnóstico', {
      rota,
      mensagem: erro.message,
      stack: erro.stack,
      componentStack: info.componentStack,
      usuarioId: debug?.usuarioId ?? '(indisponível)',
      papel: debug?.papel ?? '(indisponível)',
      temPermissionsSalvo: debug?.temPermissionsSalvo ?? '(indisponível)',
      permissionsValidas: debug?.permissionsValidas ?? '(indisponível)',
      debugAtualizadoEm: debug?.atualizadoEm,
    })
  }

  private recarregar = () => {
    this.setState({ erro: null })
    window.location.reload()
  }

  render() {
    if (this.state.erro) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background p-6">
          <Card className="max-w-lg w-full border-destructive/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="h-5 w-5 text-amber-400" />
                {this.props.titulo ?? 'Não foi possível carregar esta tela.'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Ocorreu um erro inesperado. Seus dados locais foram preservados. Tente recarregar
                a página ou volte ao painel principal.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={this.recarregar}>
                  Recarregar página
                </Button>
                <Button type="button" variant="outline" asChild>
                  <a href="/">Ir para o Dashboard</a>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )
    }

    return this.props.children
  }
}
