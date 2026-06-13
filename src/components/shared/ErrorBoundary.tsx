import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

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
    console.error('[Craft Oficina] Erro de interface:', erro, info.componentStack)
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
