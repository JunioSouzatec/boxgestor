import { criarDatabaseMinimaOficina } from '@/services/database-migration.service'
import { localCraftRepository } from '@/services/repository/local.repository'
import { assinaturaService } from '@/services/assinatura/assinatura.service'
import type { CadastroOficinaInput } from '@/types/auth'
import type { ConfiguracaoOficina } from '@/types/oficina'

function montarConfiguracao(
  officeId: string,
  input: Pick<
    CadastroOficinaInput,
    'nome_oficina' | 'endereco' | 'telefone' | 'whatsapp' | 'cidade' | 'estado' | 'cnpj' | 'email'
  > & { nome_responsavel?: string }
): ConfiguracaoOficina {
  const agora = new Date().toISOString()

  return {
    id: officeId,
    oficina_id: officeId,
    office_id: officeId,
    nome: input.nome_oficina.trim(),
    endereco: input.endereco?.trim() ?? '',
    cidade: input.cidade?.trim() || undefined,
    estado: input.estado?.trim() || undefined,
    telefone: input.telefone.trim(),
    whatsapp: input.whatsapp?.trim() || input.telefone.trim(),
    cnpj: input.cnpj?.trim() || undefined,
    email: input.email?.trim() || undefined,
    created_at: agora,
    updated_at: agora,
    preferencias: {
      tema_escuro: true,
      notificacoes: true,
      alerta_estoque_baixo: true,
      cadastro_limpo: true,
    },
  }
}

/** Inicializa dados locais + Teste Premium (7 dias) para oficina recém-cadastrada. */
export function setupNovaOficinaTrial(
  officeId: string,
  input: Pick<
    CadastroOficinaInput,
    | 'nome_oficina'
    | 'endereco'
    | 'telefone'
    | 'whatsapp'
    | 'cidade'
    | 'estado'
    | 'cnpj'
    | 'email'
  > & { nome_responsavel?: string }
): void {
  const configuracao = montarConfiguracao(officeId, input)
  const database = criarDatabaseMinimaOficina(officeId, configuracao)
  localCraftRepository.salvar(officeId, database)
  assinaturaService.reiniciarTrial(officeId)
}
