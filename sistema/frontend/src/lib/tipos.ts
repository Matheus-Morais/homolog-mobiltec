/**
 * Espelho do contrato do backend (HANDOFF.md §3).
 * Os enums precisam bater exatamente com os do Prisma — o backend rejeita
 * qualquer outro valor.
 */

export type StatusResultado =
  | 'OK'
  | 'FALHA'
  | 'NAO_SUPORTADO'
  | 'COM_RESSALVA'
  | 'NAO_TESTADO'
  | 'NAO_APLICAVEL'

export type StatusHomologacao =
  | 'RASCUNHO'
  | 'AGUARDANDO_ANALISE'
  | 'EM_REVISAO'
  | 'APROVADO'
  | 'REPROVADO'
  | 'PUBLICADO'
export type TipoGerenciamento = 'ANDROID_LEGADO' | 'ANDROID_ENTERPRISE'
export type GrupoItem = 'TELEMETRIA' | 'COLETA' | 'COMANDOS' | 'PERFIS'
export type PapelUsuario = 'ADMIN' | 'HOMOLOGADOR' | 'PARCEIRO' | 'LEITOR'
export type FormatoCertificado = 'PDF' | 'PPTX'

/** Status que EXIGEM justificativa (spec §5 — regra central) */
export const STATUS_EXIGEM_JUSTIFICATIVA: StatusResultado[] = [
  'FALHA',
  'NAO_SUPORTADO',
  'COM_RESSALVA',
]

export function exigeJustificativa(status: StatusResultado): boolean {
  return STATUS_EXIGEM_JUSTIFICATIVA.includes(status)
}

/**
 * Ordem dos status na UI = ordem dos atalhos 1–6 (spec §10.4).
 * NUNCA agrupar FALHA e NAO_SUPORTADO num botão "Não" (spec §5).
 */
export const STATUS_ORDEM: StatusResultado[] = [
  'OK',
  'FALHA',
  'NAO_SUPORTADO',
  'COM_RESSALVA',
  'NAO_APLICAVEL',
  'NAO_TESTADO',
]

interface MetaStatus {
  rotulo: string
  /** Como o item aparece no certificado (spec §5) */
  noCertificado: string
  atalho: string
  descricao: string
  /** Cor do texto e dos indicadores */
  cor: string
  /** Preenchimento da célula da matriz — saturado, para ler de relance */
  corFill: string
  /** Fundo suave, para áreas maiores */
  corSoft: string
}

export const META_STATUS: Record<StatusResultado, MetaStatus> = {
  OK: {
    rotulo: 'OK',
    noCertificado: '[OK]',
    atalho: '1',
    descricao: 'Testado, funcionou.',
    cor: 'var(--color-status-ok)',
    corFill: 'var(--color-status-ok-fill)',
    corSoft: 'var(--color-status-ok-soft)',
  },
  FALHA: {
    rotulo: 'Falha',
    noCertificado: '[Falha]',
    atalho: '2',
    descricao: 'Testado, não funcionou — bug do agente ou do dispositivo, a reportar ao fabricante.',
    cor: 'var(--color-status-falha)',
    corFill: 'var(--color-status-falha-fill)',
    corSoft: 'var(--color-status-falha-soft)',
  },
  NAO_SUPORTADO: {
    rotulo: 'Não suportado',
    noCertificado: '[ ------ ]',
    atalho: '3',
    descricao: 'Limitação conhecida da plataforma ou do agente — comportamento esperado.',
    cor: 'var(--color-status-nao-suportado)',
    corFill: 'var(--color-status-nao-suportado-fill)',
    corSoft: 'var(--color-status-nao-suportado-soft)',
  },
  COM_RESSALVA: {
    rotulo: 'Com ressalva',
    noCertificado: '[OK com ressalva]',
    atalho: '4',
    descricao: 'Funciona parcialmente ou de forma diferente do esperado.',
    cor: 'var(--color-status-ressalva)',
    corFill: 'var(--color-status-ressalva-fill)',
    corSoft: 'var(--color-status-ressalva-soft)',
  },
  NAO_APLICAVEL: {
    rotulo: 'Não aplicável',
    noCertificado: 'Não Disponível',
    atalho: '5',
    descricao: 'O recurso não existe neste hardware.',
    cor: 'var(--color-status-nao-aplicavel)',
    corFill: 'var(--color-status-nao-aplicavel-fill)',
    corSoft: 'var(--color-status-nao-aplicavel-soft)',
  },
  NAO_TESTADO: {
    rotulo: 'Não testado',
    /** Continua saindo em branco no documento: o que não foi avaliado não é atestado */
    noCertificado: '(em branco)',
    atalho: '6',
    descricao: 'Pendente. A linha aparece no certificado, mas em branco — o que não foi avaliado não é atestado.',
    cor: 'var(--color-status-nao-testado)',
    corFill: 'var(--color-status-nao-testado-fill)',
    corSoft: 'var(--color-status-nao-testado-soft)',
  },
}

export const ROTULO_GRUPO: Record<GrupoItem, string> = {
  TELEMETRIA: 'Telemetria e Monitoramento',
  COLETA: 'Coleta de Informações',
  COMANDOS: 'Comandos Remotos',
  PERFIS: 'Perfis e Políticas MDM',
}

/**
 * Formas curtas do rótulo, para o rail vertical da matriz.
 *
 * Com filtro de itens ligado um grupo pode ficar com uma única linha, e o
 * rótulo completo na vertical é mais alto que a célula. O rail escolhe a
 * maior forma que couber; o nome inteiro fica sempre no `title`.
 */
export const ROTULO_GRUPO_CURTO: Record<GrupoItem, string> = {
  TELEMETRIA: 'Telemetria',
  COLETA: 'Coleta',
  COMANDOS: 'Comandos',
  PERFIS: 'Perfis',
}

/**
 * Cabeçalho das três colunas de cada grupo.
 *
 * Os mesmos rótulos do certificado (`services/certificado.ts`): cada grupo
 * chama suas colunas de um jeito — em Coleta o que se avalia é "Coleta /
 * Descrição da Coleta / Resultado", não "Item de Teste". A tela de resultado
 * repete essa estrutura para que o documento e o sistema não descrevam a
 * mesma tabela com nomes diferentes.
 */
export const COLUNAS_GRUPO: Record<GrupoItem, [string, string, string]> = {
  TELEMETRIA: ['Item de Teste', 'Ação Realizada', 'Status'],
  COLETA: ['Coleta', 'Descrição da Coleta', 'Resultado'],
  COMANDOS: ['Comando', 'Descrição da Execução', 'Resultado'],
  PERFIS: ['Política', 'Restrição Aplicada', 'Status'],
}

export const SIGLA_GRUPO: Record<GrupoItem, string> = {
  TELEMETRIA: 'TEL',
  COLETA: 'COL',
  COMANDOS: 'CMD',
  PERFIS: 'MDM',
}

/** Ordem dos grupos no certificado (spec §8) */
export const GRUPO_ORDEM: GrupoItem[] = ['TELEMETRIA', 'COLETA', 'COMANDOS', 'PERFIS']

export const ROTULO_STATUS_HOMOLOGACAO: Record<StatusHomologacao, string> = {
  RASCUNHO: 'Rascunho',
  AGUARDANDO_ANALISE: 'Em Validação',
  EM_REVISAO: 'Em Revisão',
  APROVADO: 'Homologado',
  REPROVADO: 'Reprovado',
  PUBLICADO: 'Publicado',
}

export interface AnexoObservacao {
  id: string
  nome: string
  url: string
  tipo: 'imagem' | 'zip'
  tamanho?: number
}

export interface ItemObservacaoGeral {
  id: string
  titulo: string
  texto: string
  autorId?: string
  autorNome: string
  autorPapel?: string
  criadoEm: string
  anexos: AnexoObservacao[]
}

export const ROTULO_GERENCIAMENTO: Record<TipoGerenciamento, string> = {
  ANDROID_LEGADO: 'Android Legado',
  ANDROID_ENTERPRISE: 'Android Enterprise',
}

// ============================================================
// Entidades
// ============================================================

export interface Usuario {
  id: string
  nome: string
  email: string
  cargo: string
  papel: PapelUsuario
  empresa?: string | null
  categoriasPermitidas?: string[]
}

export interface Parceiro {
  id: string
  nome: string
  email: string
  cargo: string
  papel: PapelUsuario
  empresa: string
  categoriasPermitidas: string[]
  ativo: boolean
  criadoEm: string
}

export interface PayloadCriarParceiro {
  empresa: string
  nome: string
  email: string
  senha: string
  categoriasPermitidas: string[]
}

export interface PayloadAtualizarParceiro {
  empresa?: string
  nome?: string
  email?: string
  senha?: string
  categoriasPermitidas?: string[]
  ativo?: boolean
}

export interface MetricasPainelParceiro {
  totalDispositivos: number
  emHomologacao: number
  emValidacao: number
  emRevisao: number
  homologados: number
  reprovados: number
  testesTotal: number
  testesRealizados: number
  testesPendentes: number
}

export interface DispositivoPainelParceiro {
  dispositivoId: string
  homologacaoId: string | null
  fabricante: string
  modelo: string
  nomeComercial: string
  fotoUrl: string | null
  linkFabricante: string | null
  categoriaId: string
  categoriaNome: string
  categoriaSlug: string
  categoriaIcone: string
  versaoSo: string
  versaoAgente: string
  versaoPos: string | null
  gerenciamento: TipoGerenciamento
  tipoAgente: string
  status: StatusHomologacao
  homologado: boolean
  observacoes: string | null
  revisaoPendente: RevisaoPendente | null
  dataInicio: string | null
  dataFim: string | null
  responsavelNome: string
  resumo: {
    total: number
    ok: number
    divergencias: number
    semJustificativa: number
    naoTestado: number
    naoAplicavel: number
    avaliados: number
  }
}

export interface PainelParceiroDados {
  parceiro: Parceiro
  metricas: MetricasPainelParceiro
  dispositivos: DispositivoPainelParceiro[]
}

export interface Categoria {
  id: string
  nome: string
  slug: string
  icone: string
  ordem: number
  ativo?: boolean
  /**
   * Linhas da ficha que este tipo mostra na planilha, pelas chaves de
   * `LINHAS_FICHA`. Vazio = a ficha inteira, que é o estado das categorias
   * anteriores ao registro de tipos.
   */
  camposFicha?: ChaveFicha[]
  _count?: { dispositivos: number }
}

/** Um card da vitrine: o modelo visto de fora, sem o item a item do teste */
export interface DispositivoVitrine {
  dispositivoId: string
  homologacaoId: string
  fabricante: string
  modelo: string
  nomeComercial: string
  fotoUrl: string | null
  linkFabricante: string | null
  categoriaNome: string
  categoriaSlug: string
  versaoSo: string
  versaoAgente: string
  versaoPos: string | null
  gerenciamento: TipoGerenciamento
  tipoAgente: string
  status: StatusHomologacao
  homologado: boolean
  dataInicio: string
  dataFim: string | null
  responsavel: string
  numeroHomologacao: number
  versoesAnteriores: string[]
  resumo: {
    total: number
    ok: number
    divergencias: number
    semJustificativa: number
    naoAplicavel: number
    naoTestado: number
    avaliados: number
  }
}

export interface Vitrine {
  categorias: Pick<Categoria, 'id' | 'nome' | 'slug' | 'icone'>[]
  dispositivos: DispositivoVitrine[]
}

export interface Dispositivo {
  id: string
  categoriaId: string
  fabricante: string
  modelo: string
  nomeComercial: string
  fotoUrl: string | null
  linkFabricante: string | null
  ativo: boolean
  criadoEm: string
  categoria?: Categoria
  homologacoes?: Homologacao[]
  _count?: { homologacoes: number }
}

export interface ItemTeste {
  id: string
  grupo: GrupoItem
  nome: string
  descricaoAcao: string
  ordem: number
  ativo: boolean
}

export interface BateriaItem {
  bateriaId: string
  itemId: string
  ordem: number
  obrigatorio: boolean
  item: ItemTeste
}

export interface BateriaTeste {
  id: string
  categoriaId: string
  nome: string
  descricao: string | null
  ativo: boolean
  categoria?: Pick<Categoria, 'nome' | 'slug'>
  itens?: BateriaItem[]
  _count?: { itens: number }
}

export interface Fonte {
  label: string
  url: string
}

export interface Justificativa {
  id: string
  titulo: string
  texto: string
  fontes: Fonte[]
  itensSugeridos: string[]
  androidMin: number | null
  gerenciamento: TipoGerenciamento | null
  usoCount: number
  ativo: boolean
}

export interface Resultado {
  id: string
  homologacaoId: string
  itemId: string
  status: StatusResultado
  observacao: string | null
  justificativaId: string | null
  justificativaTexto: string | null
  atualizadoEm: string
  item: ItemTeste
  justificativa: Justificativa | null
}

export interface Homologacao {
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
  responsavelId: string
  gerenteId: string | null
  apoioId: string | null
  status: StatusHomologacao
  homologado: boolean | null
  localEmissao: string
  /** Referências do rodapé do certificado (spec §8.3) — soma-se às da biblioteca de justificativas */
  fontes: Fonte[]
  /** Nome que assina cada linha do certificado. Vazio → cai para o Usuario vinculado (ver responsavel/gerente/apoio). */
  assinaturaResponsavel: string | null
  assinaturaGerente: string | null
  assinaturaApoio: string | null
  /** Rascunho do técnico durante a homologação — vira a pergunta para o dev, não sai no certificado */
  observacoes: string | null
  criadoEm: string
  atualizadoEm: string
  dispositivo?: Dispositivo
  bateria?: BateriaTeste
  responsavel?: Pick<Usuario, 'id' | 'nome' | 'cargo'>
  gerente?: Pick<Usuario, 'id' | 'nome' | 'cargo'> | null
  apoio?: Pick<Usuario, 'id' | 'nome' | 'cargo'> | null
  resultados?: Resultado[]
  historicoStatus?: HistoricoStatus[]
  _count?: { resultados: number; certificados: number }
}

/** Uma transição de status já ocorrida. Só vem em `GET /homologacoes/:id`. */
export interface HistoricoStatus {
  id: string
  statusAnterior: StatusHomologacao
  statusNovo: StatusHomologacao
  /** Obrigatório ao enviar para revisão (D435); opcional nas demais transições */
  motivo: string | null
  criadoEm: string
  usuario?: { nome: string }
}

/**
 * Apontamento de revisão em aberto, como vem na coluna da matriz.
 *
 * `null` quando a homologação não está em revisão — o aviso na tela some
 * junto com o motivo que o gerou, assim que o parceiro reenvia.
 */
export interface RevisaoPendente {
  motivo: string | null
  solicitadoEm: string
  solicitadoPor: string | null
}

export interface ContagemStatus {
  total: number
  ok: number
  falha: number
  naoSuportado: number
  comRessalva: number
  naoTestado: number
  naoAplicavel: number
}

export interface DashboardHomologacao {
  contagem: ContagemStatus
  porGrupo: Record<GrupoItem, ContagemStatus>
  percentualConcluido: number
  podeAvancarParaRevisao: boolean
}

// ============================================================
// Matriz comparativa (spec §10.5) — a "planilha" web
// ============================================================

/** Resultado como vem na matriz: sem a relação `item`, que já está em `itens` */
export interface ResultadoMatriz {
  id: string
  itemId: string
  status: StatusResultado
  observacao: string | null
  justificativaId: string | null
  justificativaTexto: string | null
  justificativa: { id: string; titulo: string; texto: string } | null
}

export interface HomologacaoAnterior {
  id: string
  versaoAgente: string
  versaoSo: string
  dataInicio: string
  status: StatusHomologacao
  homologado: boolean | null
}

export interface ColunaMatriz {
  homologacao: Homologacao & {
    dispositivo: Dispositivo
    resultados: ResultadoMatriz[]
    resultadosPorItem: Record<string, ResultadoMatriz>
    _count: { certificados: number }
  }
  homologacoesAnteriores: HomologacaoAnterior[]
  revisaoPendente: RevisaoPendente | null
}

export interface Matriz {
  categoria: Categoria
  itens: ItemTeste[]
  colunas: ColunaMatriz[]
}

/**
 * Campos da ficha que viram linhas de cabeçalho na matriz, espelhando a
 * planilha original. `edicao` diz como o campo é editado inline.
 */
/**
 * Linhas da ficha, na ordem definida pelo usuário.
 *
 * Duas linhas não estão na lista dele e continuam aqui de propósito:
 * - `Foto` não é dado, é a única forma de definir a imagem do modelo, que
 *   alimenta o catálogo e o certificado.
 * - `Homologado` é a linha que passou a **ditar** o veredito da coluna: a
 *   flag que aparecia no cabeçalho depois de finalizar foi removida, e quem
 *   responde "homologado ou não" é esta célula.
 *
 * `nomeComercial` saiu ("Modelo PoS"): ele nasce de fabricante + modelo, que
 * já são duas linhas daqui, e ainda é o título da própria coluna — repetia a
 * mesma resposta três vezes. O campo continua existindo no dispositivo e se
 * edita pela Configuração da coluna.
 */
export const LINHAS_FICHA = [
  { chave: 'fotoUrl', rotulo: 'Foto', edicao: 'foto' },
  { chave: 'homologado', rotulo: 'Homologado', edicao: 'booleano' },
  { chave: 'versaoPos', rotulo: 'Versão PoS', edicao: 'texto' },
  { chave: 'imei1', rotulo: 'IMEI 1', edicao: 'texto' },
  { chave: 'imei2', rotulo: 'IMEI 2', edicao: 'texto' },
  { chave: 'numeroSerie', rotulo: 'Número de Série', edicao: 'texto' },
  { chave: 'tipoAgente', rotulo: 'Tipo do Agente', edicao: 'texto' },
  { chave: 'versaoAgente', rotulo: 'Versão do Agente', edicao: 'texto' },
  { chave: 'gerenciamento', rotulo: 'Gerenciamento', edicao: 'gerenciamento' },
  { chave: 'ferramenta', rotulo: 'Ferramenta', edicao: 'texto' },
  { chave: 'precisaAssinaturaDev', rotulo: 'Precisa Assinatura DEV', edicao: 'booleano' },
  { chave: 'versaoSo', rotulo: 'Android', edicao: 'texto' },
  { chave: 'fabricante', rotulo: 'Fabricante', edicao: 'dispositivo' },
  { chave: 'modelo', rotulo: 'Modelo', edicao: 'dispositivo' },
] as const

export type ChaveFicha = (typeof LINHAS_FICHA)[number]['chave']

/**
 * Linhas que todo tipo carrega, marcadas ou não no registro.
 *
 * Fabricante e modelo são o que distingue uma coluna da outra — sem eles a
 * planilha vira uma grade de modelos anônimos. E `homologado` é a linha que
 * dá o veredito da coluna, desde que a flag saiu do cabeçalho.
 */
export const FICHA_FIXA: ChaveFicha[] = ['homologado', 'fabricante', 'modelo']

/**
 * A ficha que um tipo de dispositivo mostra.
 *
 * Regra única para a tela de registro (onde o técnico escolhe) e para a
 * matriz (onde o resultado aparece), para que as duas não divirjam.
 */
export function linhasDaFicha(
  camposFicha: ChaveFicha[] | undefined,
): readonly (typeof LINHAS_FICHA)[number][] {
  if (!camposFicha || camposFicha.length === 0) return LINHAS_FICHA
  const escolhidas = new Set<string>([...camposFicha, ...FICHA_FIXA])
  return LINHAS_FICHA.filter((l) => escolhidas.has(l.chave))
}

/**
 * Extrai o número da versão do Android de textos como "Android 11".
 * Usado para filtrar as justificativas sugeridas por `androidMin`.
 */
export function versaoAndroidNumero(versaoSo: string): number | null {
  const m = versaoSo.match(/(\d+)/)
  return m ? parseInt(m[1], 10) : null
}

/**
 * O campo `versaoSo` vem gravado ora como "Android 11", ora como "11" —
 * a planilha original misturava os dois. Tira o prefixo para quem já rotula
 * o valor como Android e não quer "Android Android 11" na tela.
 */
export function somenteVersaoAndroid(versaoSo: string): string {
  return versaoSo.replace(/^\s*android\s*/i, '').trim() || versaoSo
}

/**
 * Determina se uma homologação está em estado somente-leitura.
 *
 * @param status - Status atual da homologação.
 * @param papel - Papel do usuário logado (opcional).
 *   - Se `undefined` ou Mobiltec (ADMIN/HOMOLOGADOR): estados terminais (`APROVADO`, `PUBLICADO`, `REPROVADO`)
 *     são somente-leitura; estados em andamento (`RASCUNHO`, `AGUARDANDO_ANALISE`, `EM_REVISAO`) permitem edição.
 *   - Se `PARCEIRO`: além dos estados terminais, `AGUARDANDO_ANALISE` também é bloqueado — a
 *     homologação está na fila da Mobiltec, e quem a tira de lá é ela, aprovando ou mandando
 *     para revisão. Em `EM_REVISAO` a custódia volta para o parceiro, que reexecuta os testes
 *     pendentes e reenvia para validação (D434).
 *
 * Espelha `STATUS_EDITAVEIS_PARCEIRO` no backend (`lib/transicoes.ts`) — se uma das duas
 * listas mudar, a outra tem de mudar junto, ou a tela libera o que a API recusa.
 */
export function ehSomenteLeitura(status: StatusHomologacao, papel?: PapelUsuario): boolean {
  if (papel === 'LEITOR') return true
  if (status === 'APROVADO' || status === 'PUBLICADO' || status === 'REPROVADO') return true
  if (papel === 'PARCEIRO' && status === 'AGUARDANDO_ANALISE') return true
  return false
}
