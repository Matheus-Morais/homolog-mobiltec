/**
 * Máquina de estados de homologação e validação de transições por papel.
 *
 * FONTE CANÔNICA — toda lógica de transição deve importar deste módulo.
 * Se novas transições forem adicionadas, atualizar apenas este arquivo.
 */
import type { StatusHomologacao } from '@prisma/client'

/**
 * Mapa de transições de status permitidas para usuários Mobiltec (ADMIN/HOMOLOGADOR).
 * Parceiros possuem regra própria mais restritiva — ver TRANSICOES_PARCEIRO.
 */
export const TRANSICOES_PERMITIDAS: Partial<Record<StatusHomologacao, StatusHomologacao[]>> = {
  RASCUNHO: ['EM_REVISAO', 'AGUARDANDO_ANALISE'] as StatusHomologacao[],
  AGUARDANDO_ANALISE: ['EM_REVISAO', 'APROVADO', 'REPROVADO', 'RASCUNHO'] as StatusHomologacao[],
  EM_REVISAO: ['APROVADO', 'REPROVADO', 'RASCUNHO', 'AGUARDANDO_ANALISE'] as StatusHomologacao[],
  APROVADO: ['PUBLICADO', 'RASCUNHO'] as StatusHomologacao[],
  REPROVADO: ['RASCUNHO'] as StatusHomologacao[],
}

/**
 * Transições permitidas ao PARCEIRO (D434).
 *
 * São os dois momentos em que a homologação está sob custódia dele e ele a
 * devolve para a Mobiltec:
 *
 * - `RASCUNHO` — a primeira submissão, no fim da bateria de testes.
 * - `EM_REVISAO` — a resubmissão, depois de atender aos apontamentos do Admin.
 *
 * `AGUARDANDO_ANALISE` fica de fora de propósito: enquanto está na fila do
 * Admin, a homologação é somente-leitura para o parceiro. Quem a tira de lá é
 * a Mobiltec, aprovando ou mandando para revisão.
 */
export const TRANSICOES_PARCEIRO: Partial<Record<StatusHomologacao, StatusHomologacao[]>> = {
  RASCUNHO: ['AGUARDANDO_ANALISE'] as StatusHomologacao[],
  EM_REVISAO: ['AGUARDANDO_ANALISE'] as StatusHomologacao[],
}

/**
 * Status em que o parceiro pode escrever: ficha, resultados e observações.
 *
 * É a mesma lista de chaves de TRANSICOES_PARCEIRO, e não por acaso — o
 * parceiro edita exatamente enquanto a homologação está com ele, e a devolve
 * com a transição correspondente. `ehSomenteLeitura` no frontend
 * (`lib/tipos.ts`) é o espelho desta regra.
 */
export const STATUS_EDITAVEIS_PARCEIRO = Object.keys(
  TRANSICOES_PARCEIRO,
) as StatusHomologacao[]

/**
 * Valida se uma transição de status é permitida para o papel informado.
 *
 * @returns `{ permitida: true }` ou `{ permitida: false, erro: string }`
 */
export function validarTransicao(
  papel: string,
  statusAtual: string,
  novoStatus: string,
): { permitida: true } | { permitida: false; erro: string } {
  // Leitor: estritamente somente-leitura — nenhuma transição permitida
  if (papel === 'LEITOR') {
    return {
      permitida: false,
      erro: 'Usuários com perfil Leitor não possuem permissão para alterar o status de homologações.',
    }
  }

  // Parceiro: regra estrita — só devolve para análise, a partir de rascunho
  // ou de revisão (D434)
  if (papel === 'PARCEIRO') {
    const permitidas = TRANSICOES_PARCEIRO[statusAtual as StatusHomologacao] ?? []
    if (!permitidas.includes(novoStatus as StatusHomologacao)) {
      return {
        permitida: false,
        erro: 'Parceiros só possuem permissão para enviar homologações em rascunho ou em revisão para Aguardando Análise.',
      }
    }
    return { permitida: true }
  }

  // Mobiltec (ADMIN / HOMOLOGADOR): consulta o mapa de transições
  if (papel === 'ADMIN' || papel === 'HOMOLOGADOR') {
    const permitidas = TRANSICOES_PERMITIDAS[statusAtual as StatusHomologacao] ?? []
    if (!permitidas.includes(novoStatus as StatusHomologacao)) {
      return {
        permitida: false,
        erro: `Transição inválida: ${statusAtual} → ${novoStatus}`,
      }
    }
    return { permitida: true }
  }

  return {
    permitida: false,
    erro: `Papel '${papel}' não possui permissão para transicionar status.`,
  }
}
