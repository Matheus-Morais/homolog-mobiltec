import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Categoria, ChaveFicha, GrupoItem, ItemTeste } from '@/lib/tipos'

/** Um tipo como a tela de manutenção o vê: com a bateria e a contagem de uso */
export interface TipoDispositivo {
  id: string
  nome: string
  slug: string
  icone: string
  ordem: number
  ativo: boolean
  camposFicha: (ChaveFicha | string)[]
  /** Modelos ativos cadastrados neste tipo — o que impede apagar */
  dispositivos: number
  /** Ids dos itens de teste da bateria dele */
  itens: string[]
}

/** Catálogo de itens de teste — a lista que o registro oferece para marcar */
export function useItensTeste() {
  return useQuery({
    queryKey: ['itens-teste'],
    queryFn: () => api.get<ItemTeste[]>('/itens-teste'),
    staleTime: 5 * 60_000,
  })
}

/** Todos os tipos, ativos e inativos — é aqui que um inativo volta à operação */
export function useTiposDispositivo() {
  return useQuery({
    queryKey: ['tipos-dispositivo'],
    queryFn: () => api.get<TipoDispositivo[]>('/tipos-dispositivo'),
  })
}

export interface PayloadTipoDispositivo {
  nome: string
  icone: string
  camposFicha: (ChaveFicha | string)[]
  itensExistentes: string[]
  itensNovos: { grupo: GrupoItem; nome: string; descricaoAcao: string }[]
}

interface TipoCriado {
  categoria: Categoria
  bateria: { id: string; nome: string; _count: { itens: number } }
}

/** O que a edição mexeu nas homologações abertas — a tela mostra de volta */
export interface ResumoEdicao {
  categoria: Categoria
  adicionados: number
  removidos: number
  /**
   * Itens retirados que tinham avaliação registrada. A linha saiu da planilha,
   * mas o resultado ficou guardado e volta se o item for remarcado.
   */
  preservados: string[]
}

/**
 * Invalida o que a lista de tipos alimenta: o menu lateral (`categorias`), a
 * própria lista, o catálogo de itens (itens escritos na hora entram nele) e as
 * matrizes, cujas linhas saem da bateria do tipo.
 */
function invalidar(qc: ReturnType<typeof useQueryClient>) {
  for (const chave of [['categorias'], ['tipos-dispositivo'], ['itens-teste'], ['matriz'], ['vitrine']]) {
    qc.invalidateQueries({ queryKey: chave })
  }
}

export function useRegistrarTipo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (p: PayloadTipoDispositivo) => api.post<TipoCriado>('/tipos-dispositivo', p),
    onSuccess: () => invalidar(qc),
  })
}

export function useEditarTipo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...p }: { id: string } & Partial<PayloadTipoDispositivo> & { ativo?: boolean }) =>
      api.patch<ResumoEdicao>(`/tipos-dispositivo/${id}`, p),
    onSuccess: () => invalidar(qc),
  })
}

/**
 * Apaga um tipo. O backend recusa (409) quando ele tem modelos cadastrados —
 * ali o caminho é desativar, para não levar junto homologações e certificados.
 */
export function useRemoverTipo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/tipos-dispositivo/${id}`),
    onSuccess: () => invalidar(qc),
  })
}
