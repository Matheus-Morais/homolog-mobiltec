import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { BateriaTeste } from '@/lib/tipos'

/** Lista baterias de uma categoria */
export function useBaterias(categoriaId?: string) {
  return useQuery({
    queryKey: ['baterias', categoriaId],
    queryFn: () => api.get<BateriaTeste[]>('/baterias', categoriaId ? { categoriaId } : undefined),
  })
}

export interface PayloadCriarBateria {
  categoriaId: string
  nome: string
  descricao?: string | null
  itens: { itemId: string; ordem: number; obrigatorio: boolean }[]
}

/** Cria nova bateria */
export function useCriarBateria() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: PayloadCriarBateria) => api.post<BateriaTeste>('/baterias', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['baterias'] })
      qc.invalidateQueries({ queryKey: ['tipos-dispositivo'] })
      qc.invalidateQueries({ queryKey: ['matriz'] })
    },
  })
}

export interface PayloadEditarBateria {
  id: string
  nome?: string
  descricao?: string | null
  itens?: { itemId: string; ordem: number; obrigatorio: boolean }[]
}

/** Edita bateria existente (D431) */
export function useEditarBateria() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...payload }: PayloadEditarBateria) =>
      api.patch<BateriaTeste>(`/baterias/${id}`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['baterias'] })
      qc.invalidateQueries({ queryKey: ['tipos-dispositivo'] })
      qc.invalidateQueries({ queryKey: ['matriz'] })
    },
  })
}

export interface PayloadReordenarBateria {
  id: string
  itens: { itemId: string; ordem: number }[]
}

/** Reordena itens de uma bateria (D430) */
export function useReordenarBateria() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...payload }: PayloadReordenarBateria) =>
      api.patch<BateriaTeste>(`/baterias/${id}/ordem`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['baterias'] })
      qc.invalidateQueries({ queryKey: ['matriz'] })
    },
  })
}

/** Soft-delete de bateria */
export function useRemoverBateria() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/baterias/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['baterias'] })
      qc.invalidateQueries({ queryKey: ['tipos-dispositivo'] })
    },
  })
}
