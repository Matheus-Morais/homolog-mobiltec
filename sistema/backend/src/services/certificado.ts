/**
 * Geração do certificado (spec §8).
 *
 * Reproduz o layout de `certificado-editavel.html` — mesmas medidas do PPT
 * original, mesmo fundo — mas montado a partir dos dados da homologação, com
 * **quebra de página calculada**. O template original tem 3 páginas fixas com
 * os itens divididos na mão; como o número de itens muda por bateria (§8.2),
 * aqui as páginas são preenchidas por altura estimada.
 *
 * Regra que não pode ser quebrada (§8.3): item NAO_TESTADO não entra no
 * certificado — nem na matriz, nem nas divergências. O que não foi avaliado
 * não é atestado.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { GrupoItem, StatusResultado } from '@prisma/client'

// ------------------------------------------------------------
// Fundo: o PNG do template, inlinado como data URI
// ------------------------------------------------------------

const CAMINHO_FUNDO =
  process.env.CERT_FUNDO ?? path.resolve(process.cwd(), '..', '..', 'fundo-certificado.png')

let fundoCache: string | null = null

function fundoDataUri(): string {
  if (fundoCache !== null) return fundoCache
  try {
    fundoCache = `data:image/png;base64,${readFileSync(CAMINHO_FUNDO).toString('base64')}`
  } catch {
    // Sem o fundo o certificado ainda sai, só que em branco — melhor do que
    // derrubar a emissão inteira por causa de um asset ausente.
    fundoCache = ''
  }
  return fundoCache
}

const MIME_POR_EXTENSAO: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
}

/**
 * Converte a foto do dispositivo em data URI.
 *
 * O documento precisa ser autocontido: no preview ele vai para um `srcDoc`
 * (sem base URL) e no PDF para `page.setContent` — nos dois casos um caminho
 * relativo como `/uploads/fotos/x.png` não resolveria. Inlinar também garante
 * que o PDF arquivado continue íntegro se o arquivo sumir depois.
 */
function fotoDataUri(fotoUrl: string | null): string | null {
  if (!fotoUrl) return null
  if (/^https?:\/\//.test(fotoUrl)) return fotoUrl // externa: o browser busca
  if (!fotoUrl.startsWith('/uploads/')) return null

  const extensao = path.extname(fotoUrl).toLowerCase()
  const mime = MIME_POR_EXTENSAO[extensao]
  if (!mime) return null

  const base = path.resolve(process.env.UPLOAD_DIR ?? './uploads')
  const absoluto = path.resolve(base, fotoUrl.replace('/uploads/', ''))

  // Barra travessia de diretório: `fotoUrl` vem do banco, mas o custo de
  // checar é zero e o estrago de não checar seria ler qualquer arquivo do disco.
  if (!absoluto.startsWith(base)) return null

  try {
    return `data:${mime};base64,${readFileSync(absoluto).toString('base64')}`
  } catch {
    return null
  }
}

// ------------------------------------------------------------
// Rótulos e regras de renderização
// ------------------------------------------------------------

/**
 * Como cada status aparece no certificado (spec §5).
 *
 * `NAO_TESTADO` renderiza **em branco**: a linha do item continua no documento,
 * seguindo a estrutura do modelo base, mas nada é afirmado sobre ele. A spec
 * §8.3 dizia para omitir a linha inteira; na prática isso fazia o certificado
 * de uma homologação recém-aberta perder todas as páginas de matriz e sobrar só
 * a de divergências. O princípio ("o que não foi avaliado não é atestado")
 * continua valendo — a célula vazia não atesta nada.
 */
const RENDER_STATUS: Record<StatusResultado, string> = {
  OK: '[OK]',
  FALHA: '[Falha]',
  NAO_SUPORTADO: '[ ------ ]',
  COM_RESSALVA: '[OK com ressalva]',
  NAO_APLICAVEL: 'Não Disponível',
  NAO_TESTADO: '',
}

/**
 * Como o item aparece na matriz do certificado.
 *
 * Divergência **sem justificativa sai em branco**, igual a um item não testado.
 * O certificado afirma que algo não funciona só quando existe a explicação
 * técnica ao lado — senão o documento acusaria o dispositivo sem fundamentar,
 * e a "Análise das Divergências" ficaria com um item órfão sem parágrafo.
 * Assim que a justificativa é preenchida, o status volta a aparecer.
 */
function renderStatus(r: ResultadoCertificado): string {
  if (exigeJustificativaCert(r.status) && !temJustificativa(r)) return ''
  return RENDER_STATUS[r.status]
}

const temJustificativa = (r: ResultadoCertificado) =>
  Boolean(r.justificativaTexto?.trim() || r.justificativa?.texto?.trim())

const exigeJustificativaCert = (s: StatusResultado) => STATUS_DIVERGENTES.includes(s)

/** Status que geram uma entrada em "Análise das Divergências" (spec §5) */
const STATUS_DIVERGENTES: StatusResultado[] = ['FALHA', 'NAO_SUPORTADO', 'COM_RESSALVA']

const ORDEM_GRUPOS: GrupoItem[] = ['TELEMETRIA', 'COLETA', 'COMANDOS', 'PERFIS']

/** Título e cabeçalhos de coluna por grupo, como no template original */
const CABECALHO_GRUPO: Record<GrupoItem, { titulo: string; colunas: [string, string, string] }> = {
  TELEMETRIA: {
    titulo: 'Telemetria e Monitoramento',
    colunas: ['Item de Teste', 'Ação Realizada', 'Status'],
  },
  COLETA: {
    titulo: 'Coleta de Informações',
    colunas: ['Coleta', 'Descrição da Coleta', 'Resultado'],
  },
  COMANDOS: {
    titulo: 'Comandos Remotos',
    colunas: ['Comando', 'Descrição da Execução', 'Resultado'],
  },
  PERFIS: {
    titulo: 'Perfis e Políticas MDM',
    colunas: ['Política', 'Restrição Aplicada', 'Status'],
  },
}

// ------------------------------------------------------------
// Paginação
// ------------------------------------------------------------

/* Alturas em polegadas, medidas do CSS do template.
   A página tem 10.8333in de altura interna; o conteúdo começa em 0.83in e o
   rodapé ocupa o fim, sobrando ~9.35in úteis. */
const ALTURA_UTIL = 9.35
const ALTURA_LINHA = 0.2 // table.matriz td { line-height: 0.2in }
const ALTURA_TITULO_GRUPO = 0.28
const ALTURA_CABECALHO_TABELA = 0.24
const ALTURA_ESPACO_GRUPO = 0.1

/* O que a página 1 gasta antes da matriz: título, régua, "Descrição do
   dispositivo", ficha (2.89in), disclaimer, régua e "Matriz de Resultados". */
const ALTURA_ABERTURA = 4.35

interface ItemRenderizado {
  nome: string
  descricaoAcao: string
  status: string
}

interface BlocoGrupo {
  grupo: GrupoItem
  itens: ItemRenderizado[]
  /** true quando o grupo continua de uma página anterior */
  continuacao: boolean
}

/**
 * Distribui os grupos em páginas por altura. Um grupo pode ser partido entre
 * páginas; quando isso acontece, o título dele se repete na página seguinte —
 * é o que o template original faz com "Coleta de Informações".
 */
function paginarMatriz(grupos: { grupo: GrupoItem; itens: ItemRenderizado[] }[]): BlocoGrupo[][] {
  const paginas: BlocoGrupo[][] = []
  let paginaAtual: BlocoGrupo[] = []
  let disponivel = ALTURA_UTIL - ALTURA_ABERTURA

  const fecharPagina = () => {
    if (paginaAtual.length > 0) paginas.push(paginaAtual)
    paginaAtual = []
    disponivel = ALTURA_UTIL
  }

  for (const { grupo, itens } of grupos) {
    let restantes = [...itens]
    let continuacao = false

    while (restantes.length > 0) {
      const custoFixo =
        ALTURA_TITULO_GRUPO +
        ALTURA_CABECALHO_TABELA +
        (paginaAtual.length > 0 ? ALTURA_ESPACO_GRUPO : 0)

      // Não vale abrir um grupo no fim da página para caber 1 linha só.
      const cabem = Math.floor((disponivel - custoFixo) / ALTURA_LINHA)
      if (cabem < 2) {
        fecharPagina()
        continue
      }

      const fatia = restantes.slice(0, cabem)
      paginaAtual.push({ grupo, itens: fatia, continuacao })
      disponivel -= custoFixo + fatia.length * ALTURA_LINHA
      restantes = restantes.slice(cabem)
      continuacao = true

      if (restantes.length > 0) fecharPagina()
    }
  }

  fecharPagina()
  return paginas
}

// ------------------------------------------------------------
// Divergências
// ------------------------------------------------------------

interface Divergencia {
  itens: string[]
  texto: string
  /** itemIds dos resultados que compartilham esta justificativa — alvo da edição inline */
  itemIds: string[]
}

/**
 * Agrupa as divergências por grupo e, dentro do grupo, por justificativa —
 * itens que compartilham a mesma justificativa saem juntos no cabeçalho,
 * separados por hífen (spec §8.3).
 */
function montarDivergencias(
  resultados: ResultadoCertificado[],
): { grupo: GrupoItem; divergencias: Divergencia[] }[] {
  const porGrupo = new Map<GrupoItem, Map<string, Divergencia>>()

  for (const r of resultados) {
    if (!STATUS_DIVERGENTES.includes(r.status)) continue

    // Texto livre é OVERRIDE da justificativa da biblioteca (spec §4.2) — é o
    // que a edição pelo lápis grava, então precisa vencer.
    const texto = r.justificativaTexto ?? r.justificativa?.texto
    if (!texto) continue

    // Agrupa por texto: dois itens só saem juntos se dizem exatamente a mesma
    // coisa. Usar o justificativaId agruparia itens já editados para textos
    // diferentes sob um parágrafo só.
    const chave = texto
    const doGrupo = porGrupo.get(r.item.grupo) ?? new Map<string, Divergencia>()
    const existente = doGrupo.get(chave)

    if (existente) {
      existente.itens.push(r.item.nome)
      existente.itemIds.push(r.itemId)
    } else {
      doGrupo.set(chave, { itens: [r.item.nome], texto, itemIds: [r.itemId] })
    }

    porGrupo.set(r.item.grupo, doGrupo)
  }

  return ORDEM_GRUPOS.filter((g) => porGrupo.has(g)).map((g) => ({
    grupo: g,
    divergencias: [...porGrupo.get(g)!.values()],
  }))
}

/**
 * Um bloco da análise quando o técnico assume a seção.
 *
 * `titulo` é o cabeçalho do grupo, `subtitulo` a linha de itens que vinha em
 * negrito acima do parágrafo — os dois viram texto livre, para o certificado
 * poder tratar de um tema que não corresponde a nenhuma justificativa.
 */
export interface BlocoAnalise {
  id: string
  titulo: string
  subtitulo: string
  texto: string
}

/**
 * A seção assumida: os blocos, mais o registro do que já foi tratado.
 *
 * `vistos` guarda os textos das justificativas que já passaram por aqui. Sem
 * ele não há como distinguir "justificativa escrita depois" de "parágrafo que
 * o técnico reescreveu ou apagou de propósito" — os dois somem da lista de
 * blocos, e o painel ficaria oferecendo de volta o que foi removido.
 */
export interface AnaliseManual {
  blocos: BlocoAnalise[]
  vistos: string[]
}

function normalizarBlocos(bruto: unknown): BlocoAnalise[] {
  if (!Array.isArray(bruto)) return []
  return bruto
    .filter((b): b is Record<string, unknown> => !!b && typeof b === 'object')
    .map((b) => ({
      id: String(b.id ?? ''),
      titulo: String(b.titulo ?? '').trim(),
      subtitulo: String(b.subtitulo ?? '').trim(),
      texto: String(b.texto ?? '').trim(),
    }))
    // Bloco sem nada escrito não vira parágrafo em branco no documento
    .filter((b) => b.titulo || b.subtitulo || b.texto)
}

/** Aceita só o que tem forma de análise: o campo é Json e vem do cliente */
export function lerAnaliseManual(bruto: unknown): AnaliseManual | null {
  // Array puro é a forma que este campo teve no primeiro dia, antes de `vistos`
  if (Array.isArray(bruto)) return { blocos: normalizarBlocos(bruto), vistos: [] }
  if (!bruto || typeof bruto !== 'object') return null
  const obj = bruto as Record<string, unknown>
  if (!Array.isArray(obj.blocos)) return null
  return {
    blocos: normalizarBlocos(obj.blocos),
    vistos: Array.isArray(obj.vistos) ? obj.vistos.map((v) => String(v).trim()).filter(Boolean) : [],
  }
}

/** Só os blocos, para quem só vai desenhar */
export function lerBlocosAnalise(bruto: unknown): BlocoAnalise[] | null {
  return lerAnaliseManual(bruto)?.blocos ?? null
}

/**
 * A análise automática convertida em blocos — o ponto de partida de quem vai
 * editar. Mesma forma que o certificado desenha, para "personalizar" não mudar
 * nada de cara.
 */
export function analiseComoBlocos(
  resultados: ResultadoCertificado[],
): BlocoAnalise[] {
  return montarDivergencias(resultados).flatMap((d) =>
    d.divergencias.map((x, i) => ({
      id: `${d.grupo}-${i}`,
      titulo: CABECALHO_GRUPO[d.grupo].titulo,
      subtitulo: x.itens.join(' - '),
      texto: x.texto,
    })),
  )
}

/**
 * Fontes do rodapé (spec §8.3): as adicionadas manualmente na tela do
 * certificado, somadas às das justificativas usadas nas divergências.
 * As manuais entram primeiro e vencem em caso de mesmo rótulo — foram
 * escritas de propósito, não derivadas.
 */
function montarFontes(
  resultados: ResultadoCertificado[],
  manuais: { label?: string; url?: string }[],
): { label: string; url: string }[] {
  const vistas = new Map<string, { label: string; url: string }>()

  for (const f of manuais) {
    if (!f?.label) continue
    vistas.set(f.label, { label: f.label, url: f.url ?? '' })
  }

  for (const r of resultados) {
    if (!STATUS_DIVERGENTES.includes(r.status)) continue
    const fontes = r.justificativa?.fontes
    if (!Array.isArray(fontes)) continue
    for (const f of fontes as { label?: string; url?: string }[]) {
      if (!f?.label) continue
      if (!vistas.has(f.label)) vistas.set(f.label, { label: f.label, url: f.url ?? '' })
    }
  }

  return [...vistas.values()]
}

// ------------------------------------------------------------
// Tipos de entrada
// ------------------------------------------------------------

export interface ResultadoCertificado {
  itemId: string
  status: StatusResultado
  justificativaId: string | null
  justificativaTexto: string | null
  item: { nome: string; descricaoAcao: string; grupo: GrupoItem; ordem: number }
  justificativa: { titulo: string; texto: string; fontes: unknown } | null
}

export interface HomologacaoCertificado {
  numeroSerie: string
  imei1: string | null
  imei2: string | null
  versaoSo: string
  versaoAgente: string
  metodoInscricao: string
  assinaturaAgente: boolean
  dataInicio: Date
  dataFim: Date | null
  localEmissao: string
  /** Referências manuais do certificado — soma-se às derivadas das justificativas */
  fontes: unknown
  /** Nulo = análise automática; array = a seção escrita à mão (ver `lerBlocosAnalise`) */
  analiseDivergencias?: unknown
  /** Nome que assina cada linha. Vazio → cai para a relação com Usuario. */
  assinaturaResponsavel: string | null
  assinaturaGerente: string | null
  assinaturaApoio: string | null
  dispositivo: { fabricante: string; modelo: string; nomeComercial: string; fotoUrl: string | null }
  responsavel: { nome: string } | null
  gerente: { nome: string } | null
  apoio: { nome: string } | null
  resultados: ResultadoCertificado[]
}

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Campo não preenchido sai em branco, como no modelo base */
function data(d: Date | null | undefined): string {
  if (!d) return ''
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(new Date(d))
}

function dataExtenso(d: Date | string | null | undefined): string {
  if (!d) return ''
  const dataObj = d instanceof Date ? d : new Date(d)
  if (Number.isNaN(dataObj.getTime())) return ''
  return new Intl.DateTimeFormat('pt-BR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(dataObj)
}

// ------------------------------------------------------------
// Montagem do HTML
// ------------------------------------------------------------

export function gerarCertificadoHtml(
  h: HomologacaoCertificado,
  opcoes: { editavel?: boolean } = {},
): string {
  const fundo = fundoDataUri()
  const editavel = opcoes.editavel === true

  /**
   * Lápis de edição inline. Só aparece no preview do app (`?editavel=1`) e
   * nunca no PDF — o botão fica fora do fluxo, então não desloca o layout nem
   * afeta o cálculo de paginação.
   */
  const lapis = (tipo: string, chave: string) =>
    editavel
      ? `<button class="editar" data-tipo="${esc(tipo)}" data-chave="${esc(chave)}" title="Editar este texto">✎</button>`
      : ''

  // A matriz traz TODOS os itens da bateria, preenchidos ou não — o documento
  // sempre segue a estrutura completa do modelo base.
  const gruposMatriz = ORDEM_GRUPOS.map((g) => ({
    grupo: g,
    itens: h.resultados
      .filter((r) => r.item.grupo === g)
      .sort((a, b) => a.item.ordem - b.item.ordem)
      .map<ItemRenderizado>((r) => ({
        nome: r.item.nome,
        descricaoAcao: r.item.descricaoAcao,
        status: renderStatus(r),
      })),
  })).filter((g) => g.itens.length > 0)

  const paginasMatriz = paginarMatriz(gruposMatriz)

  // Divergências e fontes continuam saindo só do que foi avaliado: um item em
  // branco não tem o que justificar.
  const divergencias = montarDivergencias(h.resultados)
  const fontesManuais = Array.isArray(h.fontes) ? (h.fontes as { label?: string; url?: string }[]) : []
  const fontes = montarFontes(h.resultados, fontesManuais)

  const abrePagina = `<section class="pagina" style="background:#FFF url('${fundo}') center/100% 100% no-repeat"><div class="interna"><div class="conteudo">`
  const fechaPagina = `</div></div></section>`

  // --- Ficha do dispositivo (página 1) ---
  //
  // Sem S/N e sem IMEI: o certificado atesta o comportamento de um **modelo**,
  // não de uma unidade, e circula fora da Mobiltec. Identificador de aparelho
  // ali dentro é dado sensível viajando sem necessidade. Os campos continuam
  // no banco e na tela interna do dispositivo, onde servem para rastrear qual
  // unidade foi para a bancada.
  const ficha = [
    ['Fabricante', h.dispositivo.fabricante],
    ['Modelo', h.dispositivo.modelo],
    ['Versão do SO', h.versaoSo],
    ['Data de Início', data(h.dataInicio)],
    ['Data de Término', data(h.dataFim)],
    ['Versão do Agente', h.versaoAgente],
    ['Método de Inscrição', h.metodoInscricao],
    ['Assinatura do Agente', h.assinaturaAgente ? 'Sim' : 'Não'],
  ]
    .map(
      ([rotulo, valor]) =>
        `<div class="ficha-linha">${esc(rotulo)}: <span class="valor">${esc(valor)}</span></div>`,
    )
    .join('')

  const fotoSrc = fotoDataUri(h.dispositivo.fotoUrl)
  const foto = fotoSrc
    ? `<div class="ficha-foto" style="background-image:url('${fotoSrc}')"></div>`
    : `<div class="ficha-foto"></div>`

  const abertura = `
    <h1 class="titulo-doc">CERTIFICADO DE HOMOLOGAÇÃO TÉCNICA</h1>
    <hr class="regua">
    <h2 class="titulo-secao">Descrição do dispositivo</h2>
    <div class="ficha">
      ${foto}
      <div class="ficha-dados">${ficha}</div>
    </div>
    <p class="disclaimer">Os dados acima compreendem as especificações técnicas de hardware extraídas diretamente do terminal e validadas conforme a planilha de controle de ativos.</p>
    <hr class="regua">
    <h2 class="titulo-centro">Matriz de Resultados Técnicos</h2>`

  const tabelaGrupo = (bloco: BlocoGrupo) => {
    const { titulo, colunas } = CABECALHO_GRUPO[bloco.grupo]
    const linhas = bloco.itens
      .map(
        (i) =>
          `<tr><td>${esc(i.nome)}</td><td>${esc(i.descricaoAcao)}</td><td>${esc(i.status)}</td></tr>`,
      )
      .join('')
    return `<div class="grupo">
      <h3 class="titulo-secao">${esc(titulo)}${bloco.continuacao ? ' <span class="cont">(continuação)</span>' : ''}</h3>
      <table class="matriz">
        <thead><tr><th class="col-item">${esc(colunas[0])}</th><th class="col-acao">${esc(colunas[1])}</th><th class="col-status">${esc(colunas[2])}</th></tr></thead>
        <tbody>${linhas}</tbody>
      </table>
    </div>`
  }

  const paginasHtml = paginasMatriz
    .map(
      (blocos, i) =>
        `${abrePagina}${i === 0 ? abertura : ''}${blocos.map(tabelaGrupo).join('')}${fechaPagina}`,
    )
    .join('')

  // --- Página final: divergências + rodapé ---
  // "Avaliado" = o que de fato aparece no documento. Divergência sem
  // justificativa sai em branco, então não conta.
  const algumAvaliado = h.resultados.some((r) => renderStatus(r) !== '')

  // Com a análise assumida pelo técnico, sai exatamente o que ele escreveu —
  // inclusive títulos que não correspondem a grupo nenhum. Blocos seguidos com
  // o mesmo título não repetem o cabeçalho, para a seção continuar lendo como
  // a automática.
  const manuaisBrutos = lerBlocosAnalise(h.analiseDivergencias)
  let manuais = manuaisBrutos
  if (manuaisBrutos && divergencias.length > 0) {
    // Sobreposição automática de justificativas atualizadas durante a homologação
    const atualizados = [...manuaisBrutos]
    for (const d of divergencias) {
      for (const x of d.divergencias) {
        const nomes = x.itens.join(' - ')
        const idx = atualizados.findIndex(
          (b) => b.subtitulo === nomes || x.itens.some((item) => b.subtitulo.includes(item)),
        )
        if (idx >= 0) {
          atualizados[idx] = { ...atualizados[idx], texto: x.texto }
        } else {
          atualizados.push({
            id: `div-${Date.now()}-${x.itemIds[0]}`,
            titulo: CABECALHO_GRUPO[d.grupo].titulo,
            subtitulo: nomes,
            texto: x.texto,
          })
        }
      }
    }
    manuais = atualizados
  }

  const blocosManuais = manuais
    ?.map((b, i, todos) => {
      const repeteTitulo = i > 0 && todos[i - 1].titulo === b.titulo
      return `<div class="${repeteTitulo ? 'divergencia' : 'bloco-grupo'}">
        ${!repeteTitulo && b.titulo ? `<h3 class="titulo-secao">${esc(b.titulo)}</h3>` : ''}
        <div class="divergencia">
          ${b.subtitulo ? `<div class="divergencia-itens">${esc(b.subtitulo)}</div>` : ''}
          ${b.texto ? `<p class="divergencia-texto">${esc(b.texto)}</p>` : ''}
        </div>
      </div>`
    })
    .join('')

  const blocosDivergencia = manuais
    ? blocosManuais
    : divergencias.length
    ? divergencias
        .map(
          (d) => `<div class="bloco-grupo">
            <h3 class="titulo-secao">${esc(CABECALHO_GRUPO[d.grupo].titulo)}</h3>
            ${d.divergencias
              .map(
                (x) => `<div class="divergencia">
                  <div class="divergencia-itens">${x.itens.map(esc).join(' - ')}</div>
                  <p class="divergencia-texto">${esc(x.texto)}${lapis('divergencia', x.itemIds.join(','))}</p>
                </div>`,
              )
              .join('')}
          </div>`,
        )
        .join('')
    : algumAvaliado
      // Só afirma "nenhuma divergência" se de fato houve avaliação. Com tudo em
      // branco, a página fica vazia como no modelo base.
      ? `<p class="sem-divergencia">Nenhuma divergência técnica foi identificada durante os testes de homologação.</p>`
      : ''

  const fontesHtml = fontes.length
    ? `<div class="fontes-bloco">
        <div class="fontes-titulo">Fontes</div>
        <div class="fontes-lista">${fontes
          .map((f) =>
            f.url ? `<a href="${esc(f.url)}">${esc(f.label)}</a>` : esc(f.label),
          )
          .join(' · ')}</div>
      </div>`
    : ''

  // Assinatura manual (digitada na tela do certificado) tem prioridade;
  // sem ela, cai para o nome do Usuario vinculado — hoje é o único caminho
  // para Gerente e Apoio, já que a matriz não oferece seletor de usuário.
  const nomeResponsavel = h.assinaturaResponsavel?.trim() || h.responsavel?.nome || ''
  const nomeGerente = h.assinaturaGerente?.trim() || h.gerente?.nome || ''
  const nomeApoio = h.assinaturaApoio?.trim() || h.apoio?.nome || ''

  const paginaFinal = `<section class="pagina pagina-final" style="background:#FFF url('${fundo}') center/100% 100% no-repeat"><div class="interna interna-final">
    <div class="conteudo conteudo-final">
      <h1 class="titulo-analise">Análise das Divergências</h1>
      <p class="subtitulo-analise">Os itens abaixo apresentam as divergências identificadas durante os testes de homologação e suas respectivas justificativas.</p>
      <hr class="regua">
      ${blocosDivergencia}
    </div>
    <div class="rodape rodape-final">
      ${fontesHtml}
      <div class="assinaturas">
        <div class="assinatura"><span class="valor">${esc(nomeResponsavel)}</span>${lapis('assinaturaResponsavel', '')}<br><span class="cargo">Responsável Técnico</span></div>
        <div class="assinatura"><span class="valor">${esc(nomeGerente)}</span>${lapis('assinaturaGerente', '')}<br><span class="cargo">Gerente de Validação</span></div>
        <div class="assinatura"><span class="valor">${esc(nomeApoio)}</span>${lapis('assinaturaApoio', '')}<br><span class="cargo">Apoio Adicional</span></div>
      </div>
      <div class="emissao">${esc(h.localEmissao)}, ${esc(dataExtenso(h.dataFim ?? new Date()))}</div>
      <div class="confidencial">DOCUMENTO TÉCNICO CONFIDENCIAL – MOBILTEC</div>
    </div>
  </div></section>`

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Certificado — ${esc(h.dispositivo.nomeComercial)}</title>
<style>
:root { --roxo:#6E236B; --texto:#231F20; --margem:0.24in; --linha-ficha:0.262in; }
@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
body {
  margin:0; background:#DDD9DE; padding:0.3in 0;
  font-family: Calibri, Carlito, "Segoe UI", sans-serif; color:var(--texto);
  -webkit-print-color-adjust:exact; print-color-adjust:exact;
}
.pagina {
  position:relative; width:210mm; height:297mm; overflow:hidden;
  margin:0 auto 0.3in; box-shadow:0 2px 12px rgba(0,0,0,.18);
  page-break-after:always; break-after:page;
}
.pagina:last-child { page-break-after:auto; break-after:auto; margin-bottom:0; }
/* Mantém as medidas do PPT (7.5 x 10.8333in) e escala para o A4 */
.interna {
  position:absolute; top:0; left:0; width:7.5in; height:10.8333in;
  transform:scale(1.1024, 1.0793); transform-origin:top left;
}
.conteudo { position:absolute; left:var(--margem); right:var(--margem); top:0.83in; }

.titulo-doc { font-size:19pt; font-weight:bold; text-align:center; margin:0; }
.regua { border:none; border-top:1.5pt solid var(--roxo); margin:0.10in 0 0; }
.titulo-secao { color:var(--roxo); font-size:14pt; font-weight:bold; margin:0.06in 0 0; }
.titulo-centro { color:var(--roxo); font-size:14pt; font-weight:bold; text-align:center; margin:0.08in 0 0; }
.cont { font-size:9pt; font-weight:normal; font-style:italic; }
.valor { color:var(--roxo); }

.ficha { display:flex; margin-top:0.06in; height:2.89in; }
.ficha-foto {
  width:2.78in; height:2.78in; flex:0 0 auto; background:#F4F1F4;
  background-size:contain; background-position:center; background-repeat:no-repeat;
}
.ficha-dados { margin-left:0.14in; padding-top:0.02in; }
.ficha-linha { height:var(--linha-ficha); font-size:11pt; }
.disclaimer { font-size:6.5pt; text-align:center; margin:0.06in 0 0; }

table.matriz { width:100%; border-collapse:collapse; font-size:11pt; margin-top:0.04in; }
table.matriz th { color:var(--roxo); font-weight:bold; text-align:left; text-decoration:underline; padding:0 0 .02in; }
table.matriz td { padding:0; line-height:0.2in; }
.col-item { width:2.10in; } .col-acao { width:3.00in; } .col-status { width:auto; }
.grupo { break-inside:avoid; page-break-inside:avoid; }
.grupo + .grupo { margin-top:0.10in; }

.titulo-analise { color:var(--roxo); font-size:19pt; font-weight:bold; text-align:center; margin:0; }
.subtitulo-analise { font-size:8pt; text-align:center; margin:0.08in 0 0; }
.divergencia { margin-top:0.16in; break-inside:avoid; }
.divergencia-itens {
  text-align:center; font-weight:bold; color:var(--roxo); font-size:12pt;
  margin:0 auto 0.08in; display:table; max-width:100%; padding:0 0.06in;
}
.divergencia-texto { font-style:italic; text-align:center; font-size:11pt; line-height:1.35; margin:0 0.30in; }
.bloco-grupo + .bloco-grupo { margin-top:0.40in; }
.sem-divergencia { text-align:center; font-size:11pt; font-style:italic; margin-top:0.6in; }

.rodape { position:absolute; left:var(--margem); right:var(--margem); bottom:0.72in; }
.pagina-final { min-height:297mm; height:auto; overflow:visible; }
.interna-final {
  position:relative; width:7.5in; min-height:10.8333in; height:auto;
  transform:scale(1.1024, 1.0793); transform-origin:top left;
  display:flex; flex-direction:column; justify-content:space-between;
  padding:0.83in var(--margem) 0.72in var(--margem); box-sizing:border-box;
}
.conteudo-final { position:relative; top:0; left:0; right:0; flex:1 0 auto; margin-bottom:0.4in; }
.rodape-final {
  position:relative; bottom:0; left:0; right:0; margin-top:auto; flex-shrink:0;
  break-inside:avoid; page-break-inside:avoid;
}
.fontes-titulo { text-align:center; font-weight:bold; font-size:10pt; }
.fontes-lista { text-align:center; font-size:9.5pt; margin-top:0.04in; color:var(--roxo); }
.fontes-lista a { color:inherit; text-decoration:underline; }
.assinaturas { display:flex; justify-content:space-between; margin-top:0.46in; padding:0 0.14in; }
.assinatura { font-size:11pt; }
.assinatura .cargo { color:#7A7A7A; font-size:10pt; }
.emissao { margin-top:0.18in; font-size:10pt; color:#7A7A7A; padding-left:0.14in; }
.confidencial { font-size:10pt; padding-left:0.14in; }

/* Lápis de edição — só no preview do app, nunca no PDF */
.editar {
  border:none; background:#E9E5E9; color:#6B6B6B; cursor:pointer;
  font-size:9pt; line-height:1; padding:2px 5px; border-radius:3px;
  margin-left:5px; vertical-align:middle; font-family:inherit;
}
.editar:hover { background:var(--roxo); color:#FFF; }

@media print {
  body { background:none; padding:0; }
  .pagina { margin:0; box-shadow:none; }
  .pagina-final { overflow:visible; height:auto; min-height:297mm; }
  .editar { display:none !important; }
}
</style>
</head>
<body>
${paginasHtml}
${paginaFinal}
${
  editavel
    ? `<script>
// O preview roda num iframe srcDoc (mesma origem do app), então basta avisar
// o pai e deixar a edição acontecer na UI do React — nada é salvo aqui dentro.
document.addEventListener('click', function (e) {
  var b = e.target.closest('.editar');
  if (!b) return;
  e.preventDefault();
  parent.postMessage({
    fonte: 'certificado',
    tipo: b.dataset.tipo,
    chave: b.dataset.chave,
    textoAtual: (b.parentElement.textContent || '').replace('✎', '').trim()
  }, '*');
});
</script>`
    : ''
}
</body>
</html>`
}
