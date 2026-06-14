import { Shield, Building2, Wrench, Inbox } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SupabaseConexaoCard } from '@/components/configuracoes/SupabaseConexaoCard'
import { AdminSolicitacoesUpgradeCard } from '@/components/admin/AdminSolicitacoesUpgradeCard'
import { AdminOficinasCard } from '@/components/admin/AdminOficinasCard'
import { useAuth } from '@/context/AuthContext'
import { ehAdminSistema } from '@/lib/craft-admin'
import { APP_NAME } from '@/lib/app-brand'
import { TelaSemPermissao } from '@/components/layout/TelaSemPermissao'

export function AdminCraftPage() {
  const { session } = useAuth()

  if (!session?.user) return null

  if (!ehAdminSistema(session.user)) {
    return <TelaSemPermissao tituloPagina="Admin BoxGestor" />
  }

  return (
    <div>
      <PageHeader
        titulo="Admin BoxGestor"
        descricao={`Área técnica e de suporte do ${APP_NAME} — visível apenas para Administrador do Sistema`}
        acoes={
          <Badge variant="warning" className="gap-1.5">
            <Shield className="h-3.5 w-3.5" />
            Admin Sistema
          </Badge>
        }
      />

      <Tabs defaultValue="solicitacoes" className="space-y-6">
        <TabsList className="flex h-auto flex-wrap gap-1">
          <TabsTrigger value="solicitacoes" className="gap-2">
            <Inbox className="h-4 w-4" />
            Solicitações de upgrade
          </TabsTrigger>
          <TabsTrigger value="oficinas" className="gap-2">
            <Building2 className="h-4 w-4" />
            Oficinas cadastradas
          </TabsTrigger>
          <TabsTrigger value="tecnico" className="gap-2">
            <Wrench className="h-4 w-4" />
            Diagnóstico e manutenção
          </TabsTrigger>
        </TabsList>

        <TabsContent value="solicitacoes">
          <AdminSolicitacoesUpgradeCard />
        </TabsContent>

        <TabsContent value="oficinas">
          <AdminOficinasCard />
        </TabsContent>

        <TabsContent value="tecnico" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ferramentas técnicas</CardTitle>
              <CardDescription>
                Diagnóstico Supabase, sincronização, logs, limpeza de teste e manutenção. Não
                exibir para oficinas clientes.
              </CardDescription>
            </CardHeader>
          </Card>
          <SupabaseConexaoCard modoAdmin />
        </TabsContent>
      </Tabs>
    </div>
  )
}
