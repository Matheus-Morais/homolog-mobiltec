import type { StatusHomologacao } from '@prisma/client'
import { STATUS_EDITAVEIS_PARCEIRO } from './transicoes.js'

export type VinculoHomologacaoFoto = {
  status: StatusHomologacao
  responsavelId: string
  apoioId: string | null
}

export function parceiroPodeAlterarFoto(
  homologacoes: readonly VinculoHomologacaoFoto[],
  parceiroId: string,
): boolean {
  return homologacoes.some(homologacao =>
    STATUS_EDITAVEIS_PARCEIRO.includes(homologacao.status)
    && (homologacao.responsavelId === parceiroId || homologacao.apoioId === parceiroId),
  )
}
