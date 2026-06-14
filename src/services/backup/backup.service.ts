import { localCraftRepository } from '@/services/repository/local.repository'
import type { CraftDatabase } from '@/types/database'

const VERSAO_BACKUP = 1

export interface BackupCraftPayload {
  versao: number
  exportado_em: string
  office_id: string
  dados: CraftDatabase
}

export interface ResultadoImportacaoBackup {
  ok: boolean
  mensagem: string
}

function nomeArquivoBackup(officeId: string): string {
  const data = new Date().toISOString().slice(0, 10)
  return `craft-oficina-backup-${officeId.slice(0, 12)}-${data}.json`
}

export function exportarBackupJson(officeId: string, dados: CraftDatabase): void {
  const payload: BackupCraftPayload = {
    versao: VERSAO_BACKUP,
    exportado_em: new Date().toISOString(),
    office_id: officeId,
    dados: structuredClone(dados),
  }

  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nomeArquivoBackup(officeId)
  a.click()
  URL.revokeObjectURL(url)
}

export async function importarBackupJson(
  file: File,
  officeIdAtual: string
): Promise<ResultadoImportacaoBackup> {
  try {
    const texto = await file.text()
    const payload = JSON.parse(texto) as BackupCraftPayload

    if (!payload?.dados?.configuracao) {
      return { ok: false, mensagem: 'Arquivo inválido: backup sem configuração da oficina.' }
    }

    if (payload.versao > VERSAO_BACKUP) {
      return {
        ok: false,
        mensagem: 'Versão do backup mais recente que o app. Atualize o BoxGestor.',
      }
    }

    const confirmar = window.confirm(
      'Importar backup substituirá todos os dados locais desta oficina (clientes, OS, logo, cores, etc.). Deseja continuar?'
    )
    if (!confirmar) {
      return { ok: false, mensagem: 'Importação cancelada.' }
    }

    const dados = payload.dados

    dados.configuracao = {
      ...dados.configuracao,
      office_id: officeIdAtual,
      oficina_id: officeIdAtual,
      id: officeIdAtual,
    }

    localCraftRepository.salvar(officeIdAtual, dados)

    return {
      ok: true,
      mensagem: `Backup importado com sucesso (${new Date(payload.exportado_em).toLocaleString('pt-BR')}).`,
    }
  } catch (e) {
    return {
      ok: false,
      mensagem: e instanceof Error ? e.message : 'Não foi possível ler o arquivo de backup.',
    }
  }
}
