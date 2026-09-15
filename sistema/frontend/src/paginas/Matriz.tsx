import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/contextos/AuthContext'
import { api, ErroApi } from '@/lib/api'
import {
  useEnviarFoto,
  useMatriz,
  useSalvarCelula,
  useSalvarDispositivo,
  useSalvarFicha,
} from '@/hooks/useMatriz'
import { CelulaStatus } from '@/componentes/matriz/CelulaStatus'
import { ModalNovoModelo } from '@/componentes/matriz/ModalNovoModelo'
import { ModalReteste } from '@/componentes/matriz/ModalReteste'
import { ModalFinalizar } from '@/componentes/matriz/ModalFinalizar'
import { ModalObservacao } from '@/componentes/matriz/ModalObservacao'
import { ModalObservacoesHomologacao } from '@/componentes/matriz/ModalObservacoesHomologacao'
import { MenuColuna, type AcaoColuna } from '@/componentes/matriz/MenuColuna'
import { ModalReabrir } from '@/componentes/matriz/ModalReabrir'
import { useRemoverHomologacao } from '@/hooks/useHomologacao'
import { SeletorFiltro } from '@/componentes/matriz/SeletorFiltro'
import { PainelJustificativa } from '@/componentes/matriz/PainelJustificativa'
import { LoadingTela } from '@/componentes/LoadingTela'
import { RotuloGrupo } from '@/componentes/matriz/RotuloGrupo'
import { CelulaFicha } from '@/componentes/matriz/CelulaFicha'
import {
  GRUPO_ORDEM,
  META_STATUS,
  ehSomenteLeitura,
  exigeJustificativa,
  linhasDaFicha,
  versaoAndroidNumero,
} from '@/lib/tipos'
import type {
  BateriaTeste,
  ColunaMatriz,
  GrupoItem,
  ItemTeste,
  StatusResultado,
} from '@/lib/tipos'

// Medido: o nome de item mais largo ocupa 139px; com o padding de 12+12 sobra
// folga sem deixar a coluna com um vão morto à direita.
const LARGURA_ITEM = 184
// Largura das colunas de modelo: comporta as três ações lado a lado no cabeçalho
const LARGURA_COLUNA = 196
const LARGURA_RAIL = 28

type FiltroLinhas = 'todas' | 'faltam' | 'divergencias' | 'sem-justificativa'
/** '' = todas as situações */
type FiltroSituacao =
  | ''
  | 'HOMOLOGADO'
  | 'EM_VALIDACAO'
  | 'EM_REVISAO'
  | 'RASCUNHO'
  | 'REPROVADO'
  | 'em-andamento'
  | 'finalizados'

/** Degradê sutil para as colunas de modelos do cabeçalho */
const GRADIENTE_FAIXA =
  'linear-gradient(90deg, #84236B 0%, #761D5E 45%, #62144D 100%)'

/** Degradê vertical de cima para baixo nos cards do rail de grupos: sutil, leve e mantendo o tom roxo escuro */
const GRADIENTE_RAIL_VERTICAL =
  'linear-gradient(180deg, #84236B 0%, #721C5A 50%, #5E144A 100%)'

/**
 * Estilo de cada célula/card da faixa do cabeçalho.
 * Cada coluna recebe o gradiente sutil individual e elegante.
 */
const estiloFaixa: React.CSSProperties = {
  background: GRADIENTE_FAIXA,
  borderColor: 'rgba(255,255,255,.14)',
  boxShadow: 'inset -1px 0 0 rgba(255,255,255,.32), inset 0 -1px 0 rgba(255,255,255,.7)',
  color: '#fff',
}

/** Altura do hambúrguer: o texto do cabeçalho se centraliza contra ela */
const ALTURA_ACAO = 'h-6'


/**
 * Seções da planilha, na ordem em que aparecem — e é essa ordem que numera o
 * menu ao lado de "Homologação".
 *
 * "Registro" é a ficha do dispositivo (de Foto a Modelo); as outras quatro são
 * os grupos de itens. O recorte é só de linhas: as colunas de modelo continuam
 * inteiras, com seus próprios filtros.
 *
 * Um tipo registrado pelo técnico pode não ter item nenhum num tópico — nesse
 * caso a seção some do menu em vez de abrir uma planilha vazia.
 */
const SECOES = [
  { chave: 'registro', rotulo: 'Registro' },
  { chave: 'TELEMETRIA', rotulo: 'Monitoramento' },
  { chave: 'COLETA', rotulo: 'Informações' },
  { chave: 'COMANDOS', rotulo: 'Comandos' },
  { chave: 'PERFIS', rotulo: 'Perfil' },
  { chave: 'todos', rotulo: 'Todos' },
] as const

type Secao = (typeof SECOES)[number]['chave']

const ROTULO_FILTRO_LINHAS: Record<FiltroLinhas, string> = {
  todas: 'Todos os itens',
  faltam: 'Faltam homologar',
  divergencias: 'Só divergências',
  'sem-justificativa': 'Sem justificativa',
}



export function Matriz() {
  // Uma matriz por categoria (/matriz/pos, /matriz/coletor…)
  const { slug = 'pos' } = useParams<{ slug: string }>()
  const navegar = useNavigate()
  const { usuario, ehParceiro, ehLeitor } = useAuth()

  const { data, isLoading, isError, error } = useMatriz(slug)
  const salvarCelula = useSalvarCelula(slug)
  const salvarFicha = useSalvarFicha(slug)
  const salvarDispositivo = useSalvarDispositivo(slug)

  const enviarFoto = useEnviarFoto(slug)

  const [novoModelo, setNovoModelo] = useState(false)
  const [reteste, setReteste] = useState<ColunaMatriz | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [painel, setPainel] = useState<{
    coluna: ColunaMatriz
    item: ItemTeste
    status: StatusResultado
  } | null>(null)

  // --- Filtros ---
  const [filtroFabricante, setFiltroFabricante] = useState('')
  const [filtroModelo, setFiltroModelo] = useState('')
  const [filtroVersaoAgente, setFiltroVersaoAgente] = useState('')
  const [filtroSituacao, setFiltroSituacao] = useState<FiltroSituacao>('')
  const [filtroLinhas, setFiltroLinhas] = useState<FiltroLinhas>('todas')
  /** Seção da planilha em foco — recorta linhas, não colunas */
  const [secao, setSecao] = useState<Secao>('todos')
  /** Só os modelos que já foram retestados — mais de uma homologação no histórico */
  const [soRetestados, setSoRetestados] = useState(false)
  const [painelDivergencias, setPainelDivergencias] = useState(false)
  const [finalizar, setFinalizar] = useState<ColunaMatriz | null>(null)
  const [reabrir, setReabrir] = useState<ColunaMatriz | null>(null)
  const [observacao, setObservacao] = useState<{ coluna: ColunaMatriz; item: ItemTeste } | null>(
    null,
  )
  /** Observações da homologação inteira — o rascunho do técnico, não de um item */
  const [observacoes, setObservacoes] = useState<ColunaMatriz | null>(null)
  /** Configuração: o formulário do cadastro, agora editando o que já existe */
  const [configurar, setConfigurar] = useState<ColunaMatriz | null>(null)
  const [remover, setRemover] = useState<ColunaMatriz | null>(null)
  const [erroRemover, setErroRemover] = useState<string | null>(null)
  const removerHomologacao = useRemoverHomologacao()

  const { data: baterias } = useQuery({
    queryKey: ['baterias', data?.categoria.id],
    enabled: !!data?.categoria.id,
    queryFn: () => api.get<BateriaTeste[]>('/baterias', { categoriaId: data!.categoria.id }),
  })

  /** Valores disponíveis nos seletores, tirados dos próprios dados */
  const opcoes = useMemo(() => {
    const fabricantes = new Set<string>()
    const modelos = new Set<string>()
    const versoes = new Set<string>()
    for (const c of data?.colunas ?? []) {
      fabricantes.add(c.homologacao.dispositivo.fabricante)
      versoes.add(c.homologacao.versaoAgente)
      // Modelos só do fabricante escolhido: sem isso a lista mistura marcas
      if (!filtroFabricante || c.homologacao.dispositivo.fabricante === filtroFabricante) {
        modelos.add(c.homologacao.dispositivo.modelo)
      }
    }
    const ordenar = (s: Set<string>) => [...s].sort((a, b) => a.localeCompare(b, 'pt-BR'))
    return {
      fabricantes: ordenar(fabricantes),
      modelos: ordenar(modelos),
      versoes: ordenar(versoes),
    }
  }, [data, filtroFabricante])

  /**
   * As linhas da ficha deste tipo de dispositivo.
   *
   * Impressora não tem IMEI, coletor não tem versão de PoS: o técnico marca no
   * registro do tipo o que faz sentido, e a planilha mostra só isso. Categoria
   * anterior ao registro vem com a lista vazia e recebe a ficha inteira.
   */
  const linhasFicha = useMemo(() => linhasDaFicha(data?.categoria.camposFicha), [data])

  /** Só as seções que têm linhas aqui — um tipo pode não usar todos os tópicos */
  const secoesVisiveis = useMemo(() => {
    const comItens = new Set((data?.itens ?? []).map((i) => i.grupo))
    return SECOES.filter(
      (s) => s.chave === 'registro' || s.chave === 'todos' || comItens.has(s.chave as GrupoItem),
    )
  }, [data])

  /** Quantos modelos já passaram por reteste — rótulo do botão */
  const totalRetestados = useMemo(
    () => (data?.colunas ?? []).filter((c) => c.homologacoesAnteriores.length > 0).length,
    [data],
  )

  // Trocar de categoria zera os filtros: fabricante de PoS não existe em coletor
  useEffect(() => {
    setFiltroFabricante('')
    setFiltroModelo('')
    setFiltroVersaoAgente('')
    setFiltroSituacao('')
    setFiltroLinhas('todas')
    setSoRetestados(false)
    // A seção também: o tópico em foco pode nem existir no tipo de destino
    setSecao('todos')
  }, [slug])

  // Trocar de fabricante invalida o modelo escolhido: "GPOS720" não existe
  // dentro de "Positivo", e a matriz ficaria vazia sem explicação
  useEffect(() => setFiltroModelo(''), [filtroFabricante])

  /** Colunas depois dos filtros de fabricante, versão do agente e situação */
  const colunasVisiveis = useMemo(
    () =>
      (data?.colunas ?? []).filter((c) => {
        if (soRetestados && c.homologacoesAnteriores.length === 0) return false
        if (filtroFabricante && c.homologacao.dispositivo.fabricante !== filtroFabricante)
          return false
        if (filtroModelo && c.homologacao.dispositivo.modelo !== filtroModelo) return false
        if (filtroVersaoAgente && c.homologacao.versaoAgente !== filtroVersaoAgente) return false
        if (filtroSituacao === 'HOMOLOGADO')
          return c.homologacao.status === 'APROVADO' || c.homologacao.status === 'PUBLICADO'
        if (filtroSituacao === 'EM_VALIDACAO')
          return c.homologacao.status === 'AGUARDANDO_ANALISE'
        if (filtroSituacao === 'EM_REVISAO')
          return c.homologacao.status === 'EM_REVISAO'
        if (filtroSituacao === 'RASCUNHO')
          return c.homologacao.status === 'RASCUNHO'
        if (filtroSituacao === 'REPROVADO')
          return c.homologacao.status === 'REPROVADO'
        if (filtroSituacao === 'finalizados') return ehSomenteLeitura(c.homologacao.status)
        if (filtroSituacao === 'em-andamento') return !ehSomenteLeitura(c.homologacao.status)
        return true
      }),
    [data, filtroFabricante, filtroModelo, filtroVersaoAgente, filtroSituacao, soRetestados],
  )

  /**
   * Contagem de divergências sobre as colunas visíveis.
   *
   * Divergência é o que a spec §5 define: FALHA, NAO_SUPORTADO e COM_RESSALVA —
   * os três que exigem justificativa e saem na "Análise das Divergências".
   * `NAO_APLICAVEL` **não** entra: o recurso não existe no hardware, não há
   * nada a justificar nem a atestar.
   */
  const divergencias = useMemo(() => {
    const contagem = { falha: 0, naoSuportado: 0, comRessalva: 0, semJustificativa: 0, total: 0 }
    for (const c of colunasVisiveis) {
      for (const r of c.homologacao.resultados) {
        if (!exigeJustificativa(r.status)) continue
        contagem.total++
        if (r.status === 'FALHA') contagem.falha++
        if (r.status === 'NAO_SUPORTADO') contagem.naoSuportado++
        if (r.status === 'COM_RESSALVA') contagem.comRessalva++
        if (!r.justificativaId && !r.justificativaTexto) contagem.semJustificativa++
      }
    }
    return contagem
  }, [colunasVisiveis])

  // Itens agrupados, na ordem do certificado
  const grupos = useMemo(() => {
    if (!data) return []
    const porGrupo = new Map<GrupoItem, ItemTeste[]>()
    for (const item of data.itens) {
      const lista = porGrupo.get(item.grupo) ?? []
      lista.push(item)
      porGrupo.set(item.grupo, lista)
    }

    /** A linha entra se ALGUMA coluna visível casa com o filtro escolhido */
    const linhaPassa = (item: ItemTeste) => {
      if (filtroLinhas === 'todas') return true
      return colunasVisiveis.some((c) => {
        const r = c.homologacao.resultadosPorItem[item.id]
        if (!r) return false
        switch (filtroLinhas) {
          case 'faltam':
            return r.status === 'NAO_TESTADO'
          case 'divergencias':
            return exigeJustificativa(r.status)
          case 'sem-justificativa':
            return exigeJustificativa(r.status) && !r.justificativaId && !r.justificativaTexto
        }
      })
    }

    return GRUPO_ORDEM.filter((g) => porGrupo.has(g))
      .map((g) => ({ grupo: g, itens: (porGrupo.get(g) ?? []).filter(linhaPassa) }))
      .filter((g) => g.itens.length > 0)
  }, [data, filtroLinhas, colunasVisiveis])

  async function aplicarStatus(
    coluna: ColunaMatriz,
    item: ItemTeste,
    status: StatusResultado,
    escolha?: { justificativaId: string | null; justificativaTexto: string | null },
  ) {
    setAviso(null)
    const atual = coluna.homologacao.resultadosPorItem[item.id]

    // O status aplica direto, sem passar pelo painel: durante a homologação
    // interna o técnico marca o que observou na hora e a justificativa vem
    // depois, com o retorno do dev. Quem quiser justificar agora tem a opção
    // "Justificativa" no próprio menu da célula (restrita a técnicos Mobiltec).
    const justId = ehParceiro
      ? null
      : escolha
        ? escolha.justificativaId
        : exigeJustificativa(status)
          ? (atual?.justificativaId ?? null)
          : null

    const justTexto = ehParceiro
      ? null
      : escolha
        ? escolha.justificativaTexto
        : exigeJustificativa(status)
          ? (atual?.justificativaTexto ?? null)
          : null

    try {
      await salvarCelula.mutateAsync({
        homologacaoId: coluna.homologacao.id,
        itemId: item.id,
        status,
        observacao: atual?.observacao ?? null,
        justificativaId: justId,
        justificativaTexto: justTexto,
      })
    } catch (err) {
      setAviso(err instanceof ErroApi ? err.message : 'Não foi possível salvar a célula.')
      throw err
    }
  }

  if (isLoading) {
    return <LoadingTela mensagem="Carregando planilha de homologação…" />
  }

  if (isError || !data) {
    return (
      <div className="p-8 text-sm" style={{ color: 'var(--color-destructive)' }}>
        {error instanceof ErroApi ? error.message : 'Não foi possível carregar a matriz.'}
      </div>
    )
  }

  // A tabela renderiza as colunas já filtradas por fabricante / versão do agente
  const colunas = colunasVisiveis

  /**
   * O rail roxo dos grupos só aparece com a planilha inteira à vista.
   * Filtrando itens sobram poucas linhas por grupo e o rótulo vertical não
   * cabe na altura da célula — a coluna esquerda fica só com o nome do item.
   */
  const railVisivel = filtroLinhas === 'todas'
  const recuoItem = railVisivel ? LARGURA_RAIL : 0
  const larguraTotal = recuoItem + LARGURA_ITEM + colunas.length * LARGURA_COLUNA

  return (
    <div className="h-full flex flex-col">
      {/* Cabeçalho: só os filtros, centralizados. O nome da tela vive na
          barra do card, no Layout — aqui ele só repetiria. */}
      <header className="px-8 pt-4 pb-3 shrink-0">
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
              <SeletorFiltro
                rotuloCurto="Fabricante"
                rotuloTodos={`Todos os fabricantes (${opcoes.fabricantes.length})`}
                valor={filtroFabricante}
                aoMudar={setFiltroFabricante}
                opcoes={opcoes.fabricantes.map((f) => ({ valor: f, rotulo: f }))}
              />
              {/* As opções de modelo acompanham o fabricante escolhido: com
                  31 colunas, listar todos os modelos de todas as marcas junto
                  transforma o seletor numa lista sem serventia. */}
              <SeletorFiltro
                rotuloCurto="Modelo"
                rotuloTodos={`Todos os modelos (${opcoes.modelos.length})`}
                valor={filtroModelo}
                aoMudar={setFiltroModelo}
                opcoes={opcoes.modelos.map((m) => ({ valor: m, rotulo: m }))}
              />
              <SeletorFiltro
                rotuloCurto="Versão do agente"
                rotuloTodos={`Todas as versões (${opcoes.versoes.length})`}
                valor={filtroVersaoAgente}
                aoMudar={setFiltroVersaoAgente}
                opcoes={opcoes.versoes.map((v) => ({ valor: v, rotulo: v }))}
              />
              <SeletorFiltro
                rotuloCurto="Status"
                rotuloTodos="Todos os status"
                valor={filtroSituacao}
                aoMudar={(v) => setFiltroSituacao(v as FiltroSituacao)}
                opcoes={[
                  { valor: 'HOMOLOGADO', rotulo: 'Homologado' },
                  { valor: 'EM_VALIDACAO', rotulo: 'Em Validação' },
                  { valor: 'EM_REVISAO', rotulo: 'Em Revisão' },
                  { valor: 'RASCUNHO', rotulo: 'Rascunho' },
                  { valor: 'REPROVADO', rotulo: 'Não Homologado' },
                  { valor: 'em-andamento', rotulo: 'Em andamento (geral)' },
                  { valor: 'finalizados', rotulo: 'Finalizados (geral)' },
                ]}
              />
              {/* Sem seletor de itens: o recorte de linhas é acionado pelo
                  painel de divergências. Enquanto estiver ligado, aparece
                  aqui como etiqueta removível — senão não haveria como sair. */}
              {filtroLinhas !== 'todas' && (
                <button
                  type="button"
                  onClick={() => setFiltroLinhas('todas')}
                  title="Voltar a mostrar todos os itens"
                  className="relative px-2.5 py-1.5 text-sm font-semibold flex items-center gap-1.5 whitespace-nowrap text-[var(--color-primary)] hover:opacity-80 select-none cursor-pointer"
                >
                  <span>{ROTULO_FILTRO_LINHAS[filtroLinhas]}</span>
                  <span aria-hidden className="opacity-70 text-xs">
                    ✕
                  </span>
                  <span
                    className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full"
                    style={{ background: 'var(--color-primary)' }}
                  />
                </button>
              )}

              <button
                type="button"
                onClick={() => setPainelDivergencias((v) => !v)}
                aria-expanded={painelDivergencias}
                // Âncora própria: o menu lateral também tem um botão com
                // `aria-expanded`, e endereçar este "pelo primeiro da página"
                // passou a apontar para lá
                data-painel-divergencias
                title={
                  ehParceiro
                    ? `${divergencias.total} divergência(s)`
                    : `${divergencias.total} divergência(s)${divergencias.semJustificativa > 0 ? `, ${divergencias.semJustificativa} sem justificativa` : ''}`
                }
                className={`relative px-2.5 py-1.5 text-sm font-medium flex items-center gap-1.5 whitespace-nowrap transition-colors rounded-md select-none cursor-pointer outline-none focus:outline-none focus-visible:outline-none ${
                  !ehParceiro && divergencias.semJustificativa > 0
                    ? 'text-red-700 bg-red-50 hover:bg-red-100'
                    : painelDivergencias
                      ? 'text-[var(--color-primary)] font-semibold'
                      : 'text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:bg-black/[0.035]'
                }`}
              >
                <span>
                  {!ehParceiro && divergencias.semJustificativa > 0 ? '⚠' : '◆'} {divergencias.total}
                </span>
                {!ehParceiro && divergencias.semJustificativa > 0 && (
                  <span className="font-semibold">· {divergencias.semJustificativa} sem justificar</span>
                )}
                {painelDivergencias && (
                  <span
                    className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full"
                    style={{ background: !ehParceiro && divergencias.semJustificativa > 0 ? '#b91c1c' : 'var(--color-primary)' }}
                  />
                )}
              </button>

              {/* Modelos que já voltaram para a bancada com uma versão nova
                  do agente. Fica ao lado dos filtros porque é um recorte da
                  mesma planilha, não outra tela. */}
              <button
                type="button"
                onClick={() => setSoRetestados((v) => !v)}
                aria-pressed={soRetestados}
                disabled={totalRetestados === 0}
                title={
                  totalRetestados === 0
                    ? 'Nenhum modelo foi retestado ainda'
                    : 'Mostrar só os modelos que já foram retestados com outra versão do agente'
                }
                className={`relative px-2.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors disabled:opacity-45 select-none cursor-pointer rounded-md outline-none focus:outline-none focus-visible:outline-none ${
                  soRetestados
                    ? 'font-semibold text-[var(--color-primary)]'
                    : 'text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:bg-black/[0.035]'
                }`}
              >
                <span>Revalidados</span>
                <span className="ml-1 text-xs opacity-70 font-normal">{totalRetestados}</span>
                {soRetestados && (
                  <span
                    className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full"
                    style={{ background: 'var(--color-primary)' }}
                  />
                )}
              </button>

              {!ehLeitor && (
                <button
                  type="button"
                  onClick={() => setNovoModelo(true)}
                  className="h-8 px-3 rounded-md text-xs font-semibold text-white transition-opacity hover:opacity-90 inline-flex items-center gap-1.5 shadow-xs shrink-0"
                  style={{ background: GRADIENTE_FAIXA }}
                >
                  + Novo modelo
                </button>
              )}
          </div>

          {painelDivergencias && (
            <div
              className="mt-3 rounded-xl border px-5 py-4"
              style={{ background: 'var(--color-sidebar)' }}
            >
              <p className="label-caps mb-2">
                Divergências{filtroFabricante || filtroVersaoAgente ? ' (nos modelos filtrados)' : ''}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {(
                  [
                    ['FALHA', divergencias.falha],
                    ['NAO_SUPORTADO', divergencias.naoSuportado],
                    ['COM_RESSALVA', divergencias.comRessalva],
                  ] as [StatusResultado, number][]
                ).map(([s, n]) => (
                  <span
                    key={s}
                    className="px-2.5 py-1 rounded-md text-xs font-semibold"
                    style={{ background: META_STATUS[s].corFill, color: META_STATUS[s].cor }}
                  >
                    {META_STATUS[s].rotulo}: {n}
                  </span>
                ))}

                {!ehParceiro && (
                  <>
                    <span className="mx-1 h-4 w-px" style={{ background: 'var(--color-border)' }} />
                    {divergencias.semJustificativa > 0 ? (
                      <button
                        type="button"
                        onClick={() => setFiltroLinhas('sem-justificativa')}
                        className="px-2.5 py-1 rounded-md text-xs font-semibold underline underline-offset-2"
                        style={{
                          background: 'var(--color-destructive-soft)',
                          color: 'var(--color-destructive-fg)',
                        }}
                      >
                        {divergencias.semJustificativa} sem justificativa — filtrar para resolver
                      </button>
                    ) : (
                      <span className="text-xs" style={{ color: 'var(--color-status-ok)' }}>
                        ✓ Todas as divergências estão justificadas
                      </span>
                    )}
                  </>
                )}
              </div>
              <p className="mt-2 text-xs" style={{ color: 'var(--color-muted-foreground)' }}>
                "Não aplicável" não conta como divergência: o recurso não existe no hardware, então
                não há o que justificar nem atestar (spec §5).
              </p>
            </div>
          )}

      </header>

      {aviso && (
        <div
          role="alert"
          className="mx-8 mt-3 px-4 py-2.5 rounded-md text-sm shrink-0"
          style={{ background: 'var(--color-destructive-soft)', color: 'var(--color-destructive-fg)' }}
        >
          {aviso}
        </div>
      )}

      {colunas.length === 0 || grupos.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-sm">
            {data.colunas.length === 0 ? (
              <>
                <p className="font-medium">Nenhum modelo cadastrado ainda</p>
                <p className="mt-1 text-sm" style={{ color: 'var(--color-muted-foreground)' }}>
                  Cadastre o primeiro modelo de {data.categoria.nome} para começar a preencher a
                  matriz.
                </p>
                {!ehLeitor && (
                  <button
                    type="button"
                    onClick={() => setNovoModelo(true)}
                    className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white shadow-sm transition-all hover:opacity-90 active:scale-95"
                    style={{ background: GRADIENTE_FAIXA }}
                  >
                    <span>+</span>
                    <span>Cadastrar modelo</span>
                  </button>
                )}
              </>
            ) : (
              <>
                <p className="font-medium">Nenhum resultado com esses filtros</p>
                <p className="mt-1 text-sm" style={{ color: 'var(--color-muted-foreground)' }}>
                  {colunas.length === 0
                    ? soRetestados
                      ? 'Nenhum modelo retestado casa com os outros filtros.'
                      : 'Nenhum modelo casa com os filtros escolhidos.'
                    : `Nenhum item se encaixa em "${ROTULO_FILTRO_LINHAS[filtroLinhas]}" nos modelos filtrados.`}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setFiltroFabricante('')
                    setFiltroModelo('')
                    setFiltroVersaoAgente('')
                    setFiltroSituacao('')
                    setFiltroLinhas('todas')
                    setSoRetestados(false)
                  }}
                  className="mt-3 text-sm underline underline-offset-2"
                  style={{ color: 'var(--color-primary)' }}
                >
                  Limpar filtros
                </button>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-auto mx-8 mb-6 rounded-xl border" style={{ background: 'var(--color-card)' }}>
          <table
            className="border-collapse text-xs"
            style={{ width: larguraTotal, tableLayout: 'fixed' }}
          >
            <colgroup>
              {railVisivel && <col style={{ width: LARGURA_RAIL }} />}
              <col style={{ width: LARGURA_ITEM }} />
              {colunas.map((c) => (
                <col key={c.homologacao.id} style={{ width: LARGURA_COLUNA }} />
              ))}
            </colgroup>

            {/* Cabeçalho: ficha de cada unidade testada.
                Fundo em tinta clara da marca, texto em roxo: são 31 colunas
                lado a lado, e em roxo chapado a faixa dominava a planilha. */}
            <thead>
              <tr>
                {/* Mesma anatomia das colunas de modelo: título e hambúrguer
                    numa linha. Aqui o menu recorta as LINHAS — as seções da
                    planilha — sem tocar nas colunas de modelo. */}
                <th
                  colSpan={railVisivel ? 2 : 1}
                  className="sticky left-0 top-0 z-30 border px-3 py-1.5 text-left align-top"
                  style={estiloFaixa}
                >
                  {/* Altura fixa igual à do hambúrguer: assim o texto se
                      centraliza contra o botão aqui e nas colunas de modelo,
                      e as duas linhas caem na mesma altura. Centralizar a
                      célula inteira não serviria — a coluna que tem "Nª
                      homologação" ficaria com o nome deslocado. */}
                  <div className={`flex items-center justify-between gap-2 ${ALTURA_ACAO}`}>
                    <span className="text-[13px] font-semibold leading-snug text-white">
                      Homologação
                    </span>
                    <MenuColuna
                      modelo="seções da planilha"
                      marcador={secao !== 'todos'}
                      acoes={secoesVisiveis.map((s, i) => ({
                        rotulo: `${i + 1}. ${s.rotulo}`,
                        aoClicar: () => setSecao(s.chave),
                        ativo: secao === s.chave,
                      }))}
                    />
                  </div>
                </th>
                {colunas.map((c) => (
                  <th
                    key={c.homologacao.id}
                    data-modelo={c.homologacao.dispositivo.nomeComercial}
                    // `align-top` como na coluna da esquerda: sem ele o `th`
                    // centraliza verticalmente, e basta uma coluna finalizada
                    // — que ganha a linha do veredito e fica mais alta — para
                    // empurrar o nome de TODAS as outras 8px para baixo.
                    className="sticky top-0 z-20 border px-2 py-1.5 text-center align-top"
                    style={estiloFaixa}
                  >
                    {/* Nome centralizado na coluna e o menu ancorado à direita.
                        Com `justify-between` o nome ficava centrado no espaço
                        que sobrava do botão, não na coluna — daí o hambúrguer
                        sair do fluxo. */}
                    <div className="relative">
                      {/* Só o lado do hambúrguer é reservado. Com `px-7` nos
                          dois, 56px sumiam da coluna e "GERTEC GPOS700X" não
                          cabia — o nome do modelo não pode aparecer cortado. */}
                      <div className="pr-7">
                        {/* Mesma altura do hambúrguer, como na coluna da
                            esquerda: é o que põe os dois nomes na mesma linha */}
                        <div
                          className={`flex items-center justify-center ${ALTURA_ACAO}`}
                        >
                          <span
                            data-nome-modelo
                            className="truncate text-[13px] font-semibold leading-snug text-white"
                            title={c.homologacao.dispositivo.nomeComercial}
                          >
                            {c.homologacao.dispositivo.nomeComercial}
                          </span>
                        </div>

                        {c.homologacoesAnteriores.length > 0 && (
                          <div
                            className="mt-0.5 text-[10px] font-normal text-white/70"
                            title={c.homologacoesAnteriores
                              .map((h) => `${h.versaoAgente} · ${h.versaoSo}`)
                              .join('\n')}
                          >
                            {c.homologacoesAnteriores.length + 1}ª homologação
                          </div>
                        )}
                      </div>

                      <div className="absolute right-0 top-0">
                      {(() => {
                        const ehFinalizada =
                          c.homologacao.status === 'APROVADO' ||
                          c.homologacao.status === 'PUBLICADO' ||
                          c.homologacao.status === 'REPROVADO'
                        const podeRemover =
                          !ehLeitor &&
                          (usuario?.papel === 'ADMIN' ||
                            (!ehFinalizada &&
                              (usuario?.papel === 'HOMOLOGADOR' ||
                                (ehParceiro && c.homologacao.responsavelId === usuario?.id))))

                        return (
                          <MenuColuna
                            modelo={c.homologacao.dispositivo.nomeComercial}
                            acoes={[
                              // Configuração disponível para parceiro durante o processo e para Mobiltec
                              !ehLeitor && (!ehSomenteLeitura(c.homologacao.status, usuario?.papel) || !ehParceiro) && {
                                rotulo: 'Configuração',
                                aoClicar: () => setConfigurar(c),
                              },
                              (!ehParceiro || c.homologacao.status === 'APROVADO' || c.homologacao.status === 'PUBLICADO') && {
                                rotulo: 'Certificado',
                                aoClicar: () =>
                                  navegar(`/homologacoes/${c.homologacao.id}/certificado`),
                              },
                              // Reteste disponível para parceiro e Mobiltec, inclusive após enviar para validação
                              !ehLeitor && { rotulo: 'Reteste', aoClicar: () => setReteste(c) },
                              {
                                rotulo: 'Observação',
                                aoClicar: () => setObservacoes(c),
                                marcado: !!c.homologacao.observacoes?.trim(),
                              },
                              ehSomenteLeitura(c.homologacao.status, usuario?.papel)
                                ? (usuario?.papel === 'ADMIN' ? { rotulo: 'Reabrir', aoClicar: () => setReabrir(c), destaque: true } : null)
                                : (!ehLeitor ? {
                                    rotulo: ehParceiro
                                      ? c.homologacao.status === 'EM_REVISAO'
                                        ? 'Reenviar para Validação'
                                        : 'Enviar para Validação'
                                      : 'Finalizar',
                                    aoClicar: () => setFinalizar(c),
                                    destaque: true,
                                  } : null),
                              podeRemover && {
                                rotulo: 'Remover da planilha',
                                aoClicar: () => {
                                  setErroRemover(null)
                                  setRemover(c)
                                },
                                destrutivo: true,
                              },
                            ].filter(Boolean) as AcaoColuna[]}
                          />
                        )
                      })()}
                      </div>
                    </div>

                    {/* Sem flag de veredito aqui: quem responde "homologado
                        ou não" é a linha "Homologado" da ficha, logo abaixo.
                        Duas fontes para a mesma pergunta é uma a mais. */}
                  </th>
                ))}
              </tr>

              {/* A ficha é a seção "Registro": some quando o foco é outro */}
              {(secao === 'registro' || secao === 'todos') &&
                linhasFicha.map((linha) => (
                <tr key={linha.chave}>
                  <th
                    colSpan={railVisivel ? 2 : 1}
                    className="sticky left-0 z-10 border px-3 py-1.5 text-left font-medium"
                    style={{ background: 'var(--color-sidebar)' }}
                  >
                    {linha.rotulo}
                  </th>
                  {colunas.map((c) => (
                    <td key={c.homologacao.id} className="border p-0">
                      <CelulaFicha
                        coluna={c}
                        linha={linha}
                        somenteLeitura={ehSomenteLeitura(c.homologacao.status, usuario?.papel)}
                        enviandoFoto={
                          enviarFoto.isPending &&
                          enviarFoto.variables?.dispositivoId === c.homologacao.dispositivoId
                        }
                        aoEnviarFoto={(arquivo) =>
                          enviarFoto.mutate(
                            { dispositivoId: c.homologacao.dispositivoId, arquivo },
                            {
                              onError: (err) =>
                                setAviso(
                                  err instanceof ErroApi
                                    ? err.message
                                    : 'Não foi possível enviar a foto.',
                                ),
                            },
                          )
                        }
                        aoSalvarFicha={(campos) =>
                          salvarFicha.mutate(
                            { homologacaoId: c.homologacao.id, ...campos },
                            {
                              onError: (err) =>
                                setAviso(
                                  err instanceof ErroApi ? err.message : 'Não foi possível salvar.',
                                ),
                            },
                          )
                        }
                        aoSalvarDispositivo={(campos) =>
                          salvarDispositivo.mutate({
                            dispositivoId: c.homologacao.dispositivoId,
                            ...campos,
                          })
                        }
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </thead>

            {/* Corpo: um bloco por grupo, com o rail vertical da planilha */}
            {grupos
              .filter(({ grupo }) => secao === 'todos' || secao === grupo)
              .map(({ grupo, itens }) => (
              <tbody key={grupo} data-grupo={grupo}>
                {itens.map((item, i) => (
                  <tr key={item.id} data-item={item.nome}>
                    {railVisivel && i === 0 && (
                      <td
                        rowSpan={itens.length}
                        className="sticky left-0 z-10 border p-0"
                        style={{
                          background: GRADIENTE_RAIL_VERTICAL,
                          borderColor: 'rgba(255,255,255,.14)',
                          color: '#fff',
                        }}
                      >
                        {/* `height: 100%` não resolve dentro de td com rowspan — mas a
                            célula é sticky, logo é bloco de contenção: inset-0 preenche. */}
                        <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
                          <RotuloGrupo grupo={grupo} />
                        </div>
                      </td>
                    )}

                    <th
                      className="sticky z-10 border px-3 py-2 text-left font-medium"
                      style={{ left: recuoItem, background: 'var(--color-card)' }}
                      title={item.descricaoAcao}
                    >
                      <span className={item.ativo ? '' : 'line-through opacity-60'}>
                        {item.nome}
                      </span>
                    </th>

                    {colunas.map((c) => (
                      <td key={c.homologacao.id} className="border p-0">
                        <CelulaStatus
                          resultado={c.homologacao.resultadosPorItem[item.id]}
                          somenteLeitura={ehSomenteLeitura(c.homologacao.status, usuario?.papel)}
                          aoEscolher={(s) => aplicarStatus(c, item, s)}
                          aoAbrirObservacao={() => setObservacao({ coluna: c, item })}
                          aoAbrirJustificativa={() =>
                            setPainel({
                              coluna: c,
                              item,
                              // Justificar não muda o status: o painel reaplica
                              // o que já está lá, agora com a explicação junto
                              status: c.homologacao.resultadosPorItem[item.id]?.status ?? 'FALHA',
                            })
                          }
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      )}

      {novoModelo && (
        <ModalNovoModelo
          categoriaId={data.categoria.id}
          categoriaSlug={slug}
          baterias={baterias ?? []}
          aoFechar={() => setNovoModelo(false)}
          aoCriar={() => setNovoModelo(false)}
        />
      )}

      {configurar && (
        <ModalNovoModelo
          categoriaId={data.categoria.id}
          categoriaSlug={slug}
          baterias={baterias ?? []}
          coluna={configurar}
          aoFechar={() => setConfigurar(null)}
          aoCriar={() => setConfigurar(null)}
          aoPedirReteste={(col) => {
            setConfigurar(null)
            setReteste(col)
          }}
          aoPedirRemover={
            (!ehLeitor &&
              (usuario?.papel === 'ADMIN' ||
                (!(
                  configurar.homologacao.status === 'APROVADO' ||
                  configurar.homologacao.status === 'PUBLICADO' ||
                  configurar.homologacao.status === 'REPROVADO'
                ) &&
                  (usuario?.papel === 'HOMOLOGADOR' ||
                    (ehParceiro && configurar.homologacao.responsavelId === usuario?.id)))))
              ? (col) => {
                  setConfigurar(null)
                  setErroRemover(null)
                  setRemover(col)
                }
              : undefined
          }
        />
      )}

      {remover && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(15,15,18,.45)' }}
          onClick={() => setRemover(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Remover homologação da planilha"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.key === 'Escape' && setRemover(null)}
            className="w-full max-w-md rounded-xl border shadow-xl p-5 space-y-4"
            style={{ background: 'var(--color-popover)', color: 'var(--color-foreground)' }}
          >
            <div className="flex items-center gap-3">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                style={{ background: 'var(--color-destructive-soft)', color: 'var(--color-destructive)' }}
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-semibold">Remover da planilha</h3>
                <p className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>
                  {remover.homologacao.dispositivo.nomeComercial} · agente {remover.homologacao.versaoAgente}
                </p>
              </div>
            </div>

            <p className="text-sm leading-relaxed" style={{ color: 'var(--color-foreground)' }}>
              Tem certeza que deseja remover esta homologação da planilha? Todos os resultados de testes e anotações deste item serão excluídos.
            </p>

            {erroRemover && (
              <div
                role="alert"
                className="px-3 py-2 rounded-md text-xs"
                style={{ background: 'var(--color-destructive-soft)', color: 'var(--color-destructive-fg)' }}
              >
                {erroRemover}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t" style={{ borderColor: 'var(--color-border)' }}>
              <button
                type="button"
                onClick={() => setRemover(null)}
                disabled={removerHomologacao.isPending}
                className="px-3 py-1.5 rounded-md text-xs font-medium"
                style={{ color: 'var(--color-muted-foreground)' }}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={removerHomologacao.isPending}
                onClick={async () => {
                  try {
                    setErroRemover(null)
                    await removerHomologacao.mutateAsync(remover.homologacao.id)
                    setRemover(null)
                  } catch (err) {
                    setErroRemover(err instanceof ErroApi ? err.message : 'Não foi possível remover da planilha.')
                  }
                }}
                className="px-3.5 py-1.5 rounded-md text-xs font-semibold text-white disabled:opacity-50 transition-opacity"
                style={{ background: 'var(--color-destructive)' }}
              >
                {removerHomologacao.isPending ? 'Removendo…' : 'Remover da planilha'}
              </button>
            </div>
          </div>
        </div>
      )}

      {reteste && (
        <ModalReteste
          coluna={reteste}
          aoFechar={() => setReteste(null)}
          aoCriar={() => setReteste(null)}
        />
      )}

      {finalizar && (
        <ModalFinalizar
          coluna={finalizar}
          aoFechar={() => setFinalizar(null)}
          aoFinalizar={() => setFinalizar(null)}
        />
      )}

      {reabrir && (
        <ModalReabrir
          coluna={reabrir}
          aoFechar={() => setReabrir(null)}
          aoReabrir={() => setReabrir(null)}
        />
      )}

      {observacao && (
        <ModalObservacao
          itemNome={observacao.item.nome}
          modeloNome={observacao.coluna.homologacao.dispositivo.nomeComercial}
          textoAtual={
            observacao.coluna.homologacao.resultadosPorItem[observacao.item.id]?.observacao ?? ''
          }
          autorEmail={
            observacao.coluna.homologacao.resultadosPorItem[observacao.item.id]?.autorEmail ?? null
          }
          atualizadoEm={
            observacao.coluna.homologacao.resultadosPorItem[observacao.item.id]?.atualizadoEm ?? null
          }
          salvando={salvarCelula.isPending}
          aoFechar={() => setObservacao(null)}
          aoSalvar={(texto) => {
            const atual = observacao.coluna.homologacao.resultadosPorItem[observacao.item.id]
            salvarCelula.mutate(
              {
                homologacaoId: observacao.coluna.homologacao.id,
                itemId: observacao.item.id,
                // Mantém status e justificativa: só a nota muda
                status: atual?.status ?? 'NAO_TESTADO',
                observacao: texto.trim() || null,
                justificativaId: atual?.justificativaId ?? null,
                justificativaTexto: atual?.justificativaTexto ?? null,
              },
              {
                onSuccess: () => setObservacao(null),
                onError: (err) =>
                  setAviso(
                    err instanceof ErroApi ? err.message : 'Não foi possível salvar a observação.',
                  ),
              },
            )
          }}
        />
      )}

      {observacoes && (
        <ModalObservacoesHomologacao
          coluna={observacoes}
          itens={data.itens}
          salvando={salvarFicha.isPending}
          aoFechar={() => setObservacoes(null)}
          aoSalvar={(texto) =>
            salvarFicha.mutate(
              { homologacaoId: observacoes.homologacao.id, observacoes: texto.trim() || null },
              {
                onSuccess: () => setObservacoes(null),
                onError: (err) =>
                  setAviso(
                    err instanceof ErroApi
                      ? err.message
                      : 'Não foi possível salvar as observações.',
                  ),
              },
            )
          }
        />
      )}

      {painel && (
        <PainelJustificativa
          itemId={painel.item.id}
          itemNome={painel.item.nome}
          justificativaIdAtual={
            painel.coluna.homologacao.resultadosPorItem[painel.item.id]?.justificativaId ?? null
          }
          justificativaTextoAtual={
            painel.coluna.homologacao.resultadosPorItem[painel.item.id]?.justificativaTexto ?? null
          }
          autorEmailAtual={
            painel.coluna.homologacao.resultadosPorItem[painel.item.id]?.autorEmail ?? null
          }
          atualizadoEmAtual={
            painel.coluna.homologacao.resultadosPorItem[painel.item.id]?.atualizadoEm ?? null
          }
          statusPretendido={painel.status}
          gerenciamento={painel.coluna.homologacao.gerenciamento}
          androidMin={versaoAndroidNumero(painel.coluna.homologacao.versaoSo)}
          textosLivresUsados={painel.coluna.homologacao.resultados
            .map((r) => r.justificativaTexto)
            .filter((t): t is string => !!t)}
          aoCancelar={() => setPainel(null)}
          aoConfirmar={async (escolha) => {
            await aplicarStatus(painel.coluna, painel.item, painel.status, escolha)
          }}
        />
      )}
    </div>
  )
}
