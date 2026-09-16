import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type {
  DashboardHomologacao,
  Fonte,
  HistoricoStatus,
  Homologacao,
  Justificativa,
  StatusHomologacao,
  TipoGerenciamento,
} from '@/lib/tipos'

export const chaves = {
  homologacao: (id: string) => ['homologacao', id] as const,
  dashboard: (id: string) => ['homologacao', id, 'dashboard'] as const,
  justificativas: (itemId: string, ger: TipoGerenciamento, android: number | null) =>
    ['justificativas', itemId, ger, android] as const,
}

export function useHomologacao(id: string, opcoes?: { habilitado?: boolean }) {
  const habilitado = (opcoes?.habilitado ?? true) && id !== ''
  return useQuery({
    queryKey: chaves.homologacao(id),
    enabled: habilitado,
    queryFn: () => api.get<Homologacao>(`/homologacoes/${id}`),
  })
}

export function useDashboard(id: string) {
  return useQuery({
    queryKey: chaves.dashboard(id),
    queryFn: () => api.get<DashboardHomologacao>(`/homologacoes/${id}/dashboard`),
  })
}

/** Justificativas sugeridas para um item, filtradas por Android + gerenciamento (spec §10.4) */
export function useJustificativasSugeridas(
  itemId: string | null,
  gerenciamento: TipoGerenciamento,
  androidMin: number | null,
) {
  return useQuery({
    queryKey: chaves.justificativas(itemId ?? '', gerenciamento, androidMin),
    enabled: itemId !== null,
    queryFn: () =>
      api.get<Justificativa[]>('/justificativas', {
        itemId: itemId!,
        gerenciamento,
        androidMin,
      }),
  })
}

/**
 * Muda o status da homologação (finalizar, aprovar…).
 *
 * Invalida a matriz junto: o cabeçalho da coluna troca "Finalizar" por
 * "Reabrir" conforme o status, e sem isso a UI ficaria mostrando o estado
 * antigo mesmo com o banco já atualizado.
 */
export function useTransicaoStatus(homologacaoId: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: (p: {
      novoStatus: StatusHomologacao
      homologado?: boolean
      assinaturaApoio?: string | null
      motivo?: string | null
    }) => api.post<Homologacao>(`/homologacoes/${homologacaoId}/status`, p),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: chaves.homologacao(homologacaoId) })
      qc.invalidateQueries({ queryKey: chaves.dashboard(homologacaoId) })
      qc.invalidateQueries({ queryKey: ['matriz'] })
      // Aprovar congela o certificado e reabrir o descongela — os dois mudam
      // o que a prévia desenha e se o painel aceita edição
      qc.invalidateQueries({ queryKey: ['certificado'] })
      qc.invalidateQueries({ queryKey: ['analise-divergencias'] })
      qc.invalidateQueries({ queryKey: ['homologacoes'] })
      qc.invalidateQueries({ queryKey: ['notificacoes'] })
      qc.invalidateQueries({ queryKey: ['painel-parceiro'] })
      qc.invalidateQueries({ queryKey: ['parceiros'] })
      qc.invalidateQueries({ queryKey: ['dispositivos'] })
    },
  })
}

export function useReabrir(homologacaoId?: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: (param: string | { id?: string; motivo: string }) => {
      const targetId = typeof param === 'string' ? homologacaoId : (param.id || homologacaoId)
      const motivo = typeof param === 'string' ? param : param.motivo
      if (!targetId) throw new Error('ID da homologação é obrigatório')
      return api.post<{ mensagem: string; logId: string }>(`/homologacoes/${targetId}/reabrir`, { motivo })
    },
    onSuccess: (_, variables) => {
      const targetId = typeof variables === 'string' ? homologacaoId : (variables.id || homologacaoId)
      if (targetId) {
        qc.invalidateQueries({ queryKey: chaves.homologacao(targetId) })
        qc.invalidateQueries({ queryKey: chaves.dashboard(targetId) })
      }
      qc.invalidateQueries({ queryKey: ['matriz'] })
      qc.invalidateQueries({ queryKey: ['certificado'] })
      qc.invalidateQueries({ queryKey: ['analise-divergencias'] })
      qc.invalidateQueries({ queryKey: ['homologacoes'] })
      qc.invalidateQueries({ queryKey: ['dispositivos'] })
      qc.invalidateQueries({ queryKey: ['painel-parceiro'] })
      qc.invalidateQueries({ queryKey: ['parceiros'] })
      qc.invalidateQueries({ queryKey: ['homologacoes-finalizadas'] })
    },
  })
}

export function useRemoverHomologacao() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: (homologacaoId: string) =>
      api.delete<{ mensagem: string }>(`/homologacoes/${homologacaoId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['matriz'] })
      qc.invalidateQueries({ queryKey: ['homologacoes'] })
      qc.invalidateQueries({ queryKey: ['dispositivos'] })
      qc.invalidateQueries({ queryKey: ['painel-parceiro'] })
      qc.invalidateQueries({ queryKey: ['parceiros'] })
      qc.invalidateQueries({ queryKey: ['homologacoes-finalizadas'] })
    },
  })
}

export function useHomologacoesFinalizadas() {
  return useQuery({
    queryKey: ['homologacoes-finalizadas'],
    queryFn: () => api.get<any[]>('/homologacoes', { finalizados: 'true' }),
  })
}

export interface DadosCertificado {
  fontes?: Fonte[]
  assinaturaResponsavel?: string | null
  assinaturaGerente?: string | null
  assinaturaApoio?: string | null
}

/**
 * Edita fontes e assinaturas do certificado (spec §8.3) — painel da tela de
 * certificado. Invalida o preview além da própria homologação, já que o
 * documento é gerado a partir desses dois campos.
 */
export function useSalvarDadosCertificado(homologacaoId: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: (dados: DadosCertificado) =>
      api.patch<Homologacao>(`/homologacoes/${homologacaoId}`, dados),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: chaves.homologacao(homologacaoId) })
      qc.invalidateQueries({ queryKey: ['certificado', homologacaoId, 'preview'] })
    },
  })
}

/**
 * Edita o texto de uma divergência direto do certificado (lápis do preview).
 * Grava como `justificativaTexto` — override da justificativa da biblioteca
 * (spec §4.2) — em todos os itens que dividem o parágrafo.
 */
export function useEditarDivergencia(homologacaoId: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: (p: { itemIds: string[]; texto: string }) =>
      api.put<{ atualizados: number }>(`/homologacoes/${homologacaoId}/certificado/divergencia`, p),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: chaves.homologacao(homologacaoId) })
      qc.invalidateQueries({ queryKey: ['certificado', homologacaoId, 'preview'] })
      // A matriz mostra a justificativa no tooltip da célula
      qc.invalidateQueries({ queryKey: ['matriz'] })
    },
  })
}

/** Salva um texto livre recorrente como justificativa reutilizável (spec §10.4) */
export function useSalvarNaBiblioteca() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: (p: {
      titulo: string
      texto: string
      itensSugeridos: string[]
      androidMin: number | null
      gerenciamento: TipoGerenciamento | null
    }) => api.post<Justificativa>('/justificativas', { ...p, fontes: [] }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['justificativas'] })
    },
  })
}

export interface ItemListaHomologacao {
  id: string
  dispositivoId: string
  bateriaId: string
  numeroSerie: string
  imei1: string | null
  imei2: string | null
  versaoSo: string
  gerenciamento: TipoGerenciamento
  tipoAgente: string
  versaoAgente: string
  versaoPos: string | null
  ferramenta: string | null
  metodoInscricao: string
  assinaturaAgente: boolean
  precisaAssinaturaDev: boolean
  dataInicio: string
  dataFim: string | null
  status: StatusHomologacao
  homologado: boolean | null
  criadoEm: string
  atualizadoEm: string
  assinaturaApoio: string | null
  observacoes?: string | null
  dispositivo: {
    id: string
    nomeComercial: string
    fabricante: string
    modelo: string
    fotoUrl: string | null
    empresa: string | null
    categoria: {
      id: string
      nome: string
      slug: string
      icone: string
    }
  }
  responsavel?: {
    id: string
    nome: string
    email: string
    cargo: string
    empresa: string | null
    papel: string
  }
  apoio?: {
    id: string
    nome: string
    email: string
    cargo: string
    empresa: string | null
  }
  gerente?: {
    id: string
    nome: string
    cargo: string
  }
  bateria: {
    id?: string
    nome: string
  }
  _count: {
    resultados: number
    certificados: number
  }
  resultados?: {
    id: string
    status: string
    justificativaId: string | null
    justificativaTexto: string | null
  }[]
  /**
   * Só o último envio para revisão, quando houve um. A lista traz no máximo
   * um item — o histórico completo sai em `GET /homologacoes/:id` (D435).
   */
  historicoStatus?: HistoricoStatus[]
}

export function useListaHomologacoes(filtros?: { status?: string; responsavelId?: string }) {
  return useQuery({
    queryKey: ['homologacoes', filtros],
    queryFn: () => api.get<ItemListaHomologacao[]>('/homologacoes', filtros),
    refetchInterval: 15_000,
  })
}

/** Upload da foto oficial do dispositivo — atualiza catálogo, matriz e certificados */
export function useUploadFotoDispositivo(dispositivoId: string, homologacaoId?: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (arquivo: File) => {
      const dados = new FormData()
      dados.append('arquivo', arquivo)
      return api.postMultipart<{ id: string; fotoUrl: string }>(`/dispositivos/${dispositivoId}/foto`, dados)
    },
    onSuccess: () => {
      if (homologacaoId) {
        qc.invalidateQueries({ queryKey: chaves.homologacao(homologacaoId) })
      }
      qc.invalidateQueries({ queryKey: ['matriz'] })
      qc.invalidateQueries({ queryKey: ['vitrine'] })
      qc.invalidateQueries({ queryKey: ['dispositivo', dispositivoId] })
      qc.invalidateQueries({ queryKey: ['certificado'] })
    },
  })
}

