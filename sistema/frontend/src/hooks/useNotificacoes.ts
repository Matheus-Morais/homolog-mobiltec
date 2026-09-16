import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Notificacao } from '@/lib/tipos'

export interface RespostaNotificacoes {
  total: number
  naoLidas: number
  pendentesConfirmacao: number
  notificacoes: Notificacao[]
}

export function useNotificacoes() {
  return useQuery<RespostaNotificacoes>({
    queryKey: ['notificacoes'],
    queryFn: () => api.get<RespostaNotificacoes>('/notificacoes'),
    refetchInterval: 15_000,
  })
}

export function useConfirmarNotificacao() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.patch<Notificacao>(`/notificacoes/${id}/confirmar`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notificacoes'] })
      qc.invalidateQueries({ queryKey: ['painel-parceiro'] })
      qc.invalidateQueries({ queryKey: ['homologacoes'] })
    },
  })
}

export function useMarcarNotificacaoLida() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.patch<Notificacao>(`/notificacoes/${id}/lida`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notificacoes'] })
    },
  })
}

export function useMarcarTodasLidas() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.post<{ ok: boolean }>('/notificacoes/marcar-todas-lidas'),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ['notificacoes'] })
      const anterior = qc.getQueryData<RespostaNotificacoes>(['notificacoes'])
      if (anterior) {
        qc.setQueryData<RespostaNotificacoes>(['notificacoes'], {
          ...anterior,
          naoLidas: 0,
          notificacoes: anterior.notificacoes.map((n) => ({ ...n, lida: true })),
        })
      }
      return { anterior }
    },
    onError: (_, __, context) => {
      if (context?.anterior) {
        qc.setQueryData(['notificacoes'], context.anterior)
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['notificacoes'] })
    },
  })
}
