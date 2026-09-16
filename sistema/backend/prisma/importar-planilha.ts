/**
 * Importa a planilha "Homologação PoS" (Fase 0 do backlog) para o banco.
 *
 *   npm run db:importar-planilha                  # simula e imprime o relatório
 *   npm run db:importar-planilha -- --aplicar
 *   npm run db:importar-planilha -- --aplicar --limpar
 *
 * `--limpar` remove da categoria PoS o que não está na planilha (dispositivos de
 * teste) e colapsa homologações duplicadas do mesmo modelo, mantendo a mais recente.
 *
 * O JSON de entrada vem de `prisma/dados/extrair-planilha.py` e é uma transcrição
 * literal do Excel. Toda a interpretação — o que é "Não", o que é "Testar" — está
 * aqui, em TRADUCAO, para poder ser lida e discutida sem abrir a planilha.
 *
 * A regra central da spec §5 é que a planilha antiga confundia num "Não" só três
 * coisas diferentes: falha do agente, limitação da plataforma e recurso inexistente.
 * Este import não sabe desambiguar sozinho. O que ele faz é:
 *   - aplicar as justificativas conhecidas onde a regra é clara (Device Admin,
 *     SSID em Android 9+, políticas de senha);
 *   - marcar o resto como NAO_SUPORTADO com NOTA_REVISAO no texto da justificativa,
 *     que é o que sobra de honesto: o dado da planilha é preservado, o certificado
 *     sai com a divergência explicada, e a fila de revisão é uma query.
 */
import { PrismaClient, StatusResultado, StatusHomologacao, TipoGerenciamento } from '@prisma/client'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const prisma = new PrismaClient()
const AQUI = dirname(fileURLToPath(import.meta.url))

// ============================================================
// Entrada
// ============================================================

interface ModeloPlanilha {
  coluna: number
  ficha: Record<string, string>
  respostas: Record<string, string>
}

interface Planilha {
  origem: string
  aba: string
  modelos: ModeloPlanilha[]
}

// ============================================================
// Normalização da ficha
// ============================================================

/**
 * A planilha escreve o mesmo fabricante de várias formas ("GERTEC"/"Gertec",
 * "SUNMI"/"Sunmi") e a coluna do A960 traz "PAX A960" no lugar de "PAX".
 * Como (fabricante, modelo) é chave única e vira filtro na tela de dispositivos,
 * cada fabricante precisa de uma grafia só.
 */
const FABRICANTE_CANONICO: Record<string, string> = {
  arny: 'Arny',
  gertec: 'Gertec',
  ingenico: 'Ingenico',
  morefun: 'Morefun',
  newland: 'Newland',
  pax: 'PAX',
  'pax a960': 'PAX',
  positivo: 'Positivo',
  smartpeak: 'SmartPeak',
  sunmi: 'Sunmi',
  tectoy: 'Tectoy',
  verifone: 'Verifone',
  wizarpos: 'WizarPOS',
}

const SEM_INFORMACAO = /^sem\s*informa[çc][ãa]o$/i

/** Vazio, "n/a" e "Sem Informação" são a mesma coisa: campo em branco (D46). */
function texto(valor: string | undefined): string | null {
  const t = (valor ?? '').trim()
  if (!t || t.toLowerCase() === 'n/a' || SEM_INFORMACAO.test(t)) return null
  return t
}

function fabricanteCanonico(bruto: string): string {
  return FABRICANTE_CANONICO[bruto.trim().toLowerCase()] ?? bruto.trim()
}

/** "TECTOY T19" com fabricante Tectoy vira "T19" — o prefixo já está na coluna do lado. */
function modeloSemFabricante(modelo: string, fabricante: string): string {
  const escapado = fabricante.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return modelo.replace(new RegExp(`^${escapado}\\s+`, 'i'), '').trim()
}

/** A planilha alterna "Agente PoS" e "Agente Pos" para o mesmo agente. */
function tipoAgenteCanonico(bruto: string): string {
  return bruto.replace(/\bPos\b/g, 'PoS').trim()
}

/** "9", "8.1.0", "6.0.1" → o major, que é o que `androidMin` das justificativas usa. */
function androidMajor(bruto: string): number | null {
  const m = bruto.match(/(\d+)/)
  return m ? Number.parseInt(m[1], 10) : null
}

// ============================================================
// Tradução das respostas
// ============================================================

const NOTA_REVISAO =
  'Migrado da planilha de homologação PoS, onde a célula dizia apenas "Não". ' +
  'A planilha não separava falha do agente de limitação da plataforma, então a ' +
  'classificação entre Falha, Não suportado e Não aplicável ainda precisa de revisão técnica.'

const NOTA_ANDROID_6 =
  'Não suportado na versão de Android do dispositivo (Android 6), conforme registrado ' +
  'na planilha de homologação PoS. O recurso depende de APIs disponíveis apenas em versões posteriores.'

const NOTA_FORA_DA_PLANILHA = 'Item do catálogo sem linha correspondente na planilha de origem.'

/** Títulos das justificativas do seed, usados para resolver os ids. */
const JUST = {
  deviceAdmin: 'Device Admin depreciado — comandos de tela',
  ssid: 'SSID como informação sensível — Android 9+',
  senhas: 'Políticas de senha limitadas — Android 9+',
  appsBloqueados: 'Apps Bloqueados — desinstalação em vez de bloqueio',
} as const

type IdsJustificativa = Record<keyof typeof JUST, string>

const COMANDOS_DE_TELA = new Set([
  'COMANDOS::Reiniciar',
  'COMANDOS::Bloquear',
  'COMANDOS::Desbloquear',
])

/** Mapeamento das chaves da planilha de telemetria para os nomes canônicos no catálogo */
const DE_PARA_TELEMETRIA: Record<string, string> = {
  'TELEMETRIA::Nível de Bateria': 'TELEMETRIA::Bateria',
  'TELEMETRIA::Status de Memória RAM': 'TELEMETRIA::Memória',
  'TELEMETRIA::Consumo de Dados Móveis': 'TELEMETRIA::Dados Móveis',
  'TELEMETRIA::Status de Armazenamento': 'TELEMETRIA::Armazenamento',
  'TELEMETRIA::Aplicativos Instalados': 'TELEMETRIA::Apps Instalados',
  'TELEMETRIA::Tempo de Uso Apps': 'TELEMETRIA::App Tempo/Tela',
  'TELEMETRIA::Consumo WiFi por App': 'TELEMETRIA::App Consumo WiFi',
  'TELEMETRIA::Consumo 4G por Apps': 'TELEMETRIA::App Consumo 4G',
}

const REQUISITO_INSTALACAO = 'COMANDOS::Requisito de Instalação'
const APPS_BLOQUEADOS = 'PERFIS::Apps Bloqueados'

interface Traducao {
  status: StatusResultado
  observacao?: string | null
  justificativaId?: string | null
  justificativaTexto?: string | null
  /** Marca as células que entram na fila de revisão do relatório. */
  revisar?: boolean
}

/** Escolhe a justificativa de um "Não", quando existe uma regra conhecida. */
function justificarNao(chave: string, android: number | null, ids: IdsJustificativa): Traducao {
  if (COMANDOS_DE_TELA.has(chave) && (android ?? 0) >= 7) {
    return { status: StatusResultado.NAO_SUPORTADO, justificativaId: ids.deviceAdmin }
  }
  if (chave === 'COLETA::Rede WiFi' && (android ?? 0) >= 9) {
    return { status: StatusResultado.NAO_SUPORTADO, justificativaId: ids.ssid }
  }
  if (chave === 'PERFIS::Políticas de Senhas' && (android ?? 0) >= 9) {
    return { status: StatusResultado.NAO_SUPORTADO, justificativaId: ids.senhas }
  }
  return { status: StatusResultado.NAO_SUPORTADO, justificativaTexto: null, revisar: true }
}

function traduzir(
  chave: string,
  bruto: string,
  android: number | null,
  ids: IdsJustificativa,
): Traducao {
  const valor = bruto.trim()
  const baixo = valor.toLowerCase()

  if (!valor) return { status: StatusResultado.NAO_TESTADO }

  // "Requisito de Instalação" é uma linha descritiva, não um aprovado/reprovado:
  // ela responde *qual* é o requisito. Todo valor preenchido é uma resposta válida.
  if (chave === REQUISITO_INSTALACAO) {
    if (baixo === 'sim' || baixo === 'não' || baixo === 'nao') {
      return { status: StatusResultado.OK }
    }
    return { status: StatusResultado.OK, observacao: valor }
  }

  if (baixo === 'sim') return { status: StatusResultado.OK }

  if (baixo === 'testar') {
    return {
      status: StatusResultado.NAO_TESTADO,
    }
  }

  if (chave === APPS_BLOQUEADOS && /^desinstala[çc][ãa]o$/i.test(valor)) {
    return {
      status: StatusResultado.COM_RESSALVA,
      justificativaId: ids.appsBloqueados,
    }
  }

  if (/^n[ãa]o\b/i.test(valor)) {
    // "Não. Adroid 6" — se não houver motivo mapeado com ID, apenas mantém NAO_SUPORTADO
    return justificarNao(chave, android, ids)
  }

  // Valor que não se encaixa em nada: preserva status sem texto automático
  return {
    status: StatusResultado.NAO_TESTADO,
    revisar: true,
  }
}

// ============================================================
// Import
// ============================================================

async function main() {
  const args = process.argv.slice(2)
  const aplicar = args.includes('--aplicar')
  const limpar = args.includes('--limpar')
  const dataArg = args.find(a => a.startsWith('--data='))?.slice('--data='.length)
  const dataInicio = new Date(`${dataArg ?? new Date().toISOString().slice(0, 10)}T00:00:00Z`)

  const planilha: Planilha = JSON.parse(
    readFileSync(join(AQUI, 'dados', 'planilha-pos.json'), 'utf8'),
  )

  // Normaliza chaves de telemetria alinhadas ao catálogo canônico da Mobiltec
  for (const m of planilha.modelos) {
    const respostasNormalizadas: Record<string, string> = {}
    for (const [k, v] of Object.entries(m.respostas)) {
      const normalizada = DE_PARA_TELEMETRIA[k] ?? k
      respostasNormalizadas[normalizada] = v
    }
    m.respostas = respostasNormalizadas
  }

  console.log(`\n📄 ${planilha.origem} · aba ${planilha.aba} · ${planilha.modelos.length} modelos`)
  console.log(aplicar ? '   modo: APLICAR' : '   modo: simulação (use --aplicar para gravar)')
  if (limpar) console.log('   --limpar: remove da categoria PoS o que não está na planilha')

  // ---------- referências ----------
  const categoria = await prisma.categoria.findUnique({ where: { slug: 'pos' } })
  if (!categoria) throw new Error('Categoria "pos" não encontrada — rode o seed primeiro.')

  const bateria = await prisma.bateriaTeste.findFirst({
    where: { categoriaId: categoria.id, nome: 'PoS — Completa' },
    include: { itens: { include: { item: true } } },
  })
  if (!bateria) throw new Error('Bateria "PoS — Completa" não encontrada — rode o seed primeiro.')

  const admin = await prisma.usuario.findFirst({ where: { papel: 'ADMIN', ativo: true } })
  if (!admin) throw new Error('Nenhum usuário ADMIN ativo — rode o seed primeiro.')

  const justificativas = await prisma.justificativa.findMany()
  const ids = Object.fromEntries(
    Object.entries(JUST).map(([apelido, titulo]) => {
      const j = justificativas.find(x => x.titulo === titulo)
      if (!j) throw new Error(`Justificativa "${titulo}" não encontrada — rode o seed primeiro.`)
      return [apelido, j.id]
    }),
  ) as IdsJustificativa

  /** itens da bateria indexados por "GRUPO::Nome", que é a chave usada no JSON */
  const itensPorChave = new Map(bateria.itens.map(bi => [`${bi.item.grupo}::${bi.item.nome}`, bi.item]))

  // Uma chave da planilha sem item correspondente significa que o catálogo mudou
  // e o mapeamento do extrator ficou para trás. Melhor parar do que importar torto.
  const chavesDaPlanilha = new Set(planilha.modelos.flatMap(m => Object.keys(m.respostas)))
  const orfas = [...chavesDaPlanilha].filter(c => !itensPorChave.has(c))
  if (orfas.length > 0) {
    throw new Error(`Linhas da planilha sem item no catálogo:\n  - ${orfas.join('\n  - ')}`)
  }
  const semPlanilha = [...itensPorChave.keys()].filter(c => !chavesDaPlanilha.has(c))

  // ---------- plano ----------
  const plano = planilha.modelos.map(m => {
    const f = m.ficha
    const fabricante = fabricanteCanonico(f.fabricante)
    const modelo = modeloSemFabricante(f.modelo, fabricante)
    const android = androidMajor(f.android)
    const ferramenta = texto(f.ferramenta)

    const resultados = bateria.itens.map(bi => {
      const chave = `${bi.item.grupo}::${bi.item.nome}`
      const bruto = m.respostas[chave]
      const t: Traducao =
        bruto === undefined
          ? { status: StatusResultado.NAO_TESTADO, observacao: null }
          : traduzir(chave, bruto, android, ids)
      return { itemId: bi.itemId, chave, bruto: bruto ?? '', ...t }
    })

    return {
      coluna: m.coluna,
      fabricante,
      modelo,
      nomeComercial: f.nomeComercial,
      ficha: {
        numeroSerie: texto(f.numeroSerie) ?? 'Sem informação',
        imei1: texto(f.imei1),
        imei2: texto(f.imei2),
        versaoSo: `Android ${f.android}`.trim(),
        gerenciamento: /enterprise/i.test(f.gerenciamento)
          ? TipoGerenciamento.ANDROID_ENTERPRISE
          : TipoGerenciamento.ANDROID_LEGADO,
        tipoAgente: tipoAgenteCanonico(f.tipoAgente) || 'Agente PoS',
        versaoAgente: texto(f.versaoAgente) ?? 'Não informada',
        versaoPos: texto(f.versaoPos),
        ferramenta,
        // A planilha tem uma coluna só para a ferramenta usada na instalação, que é
        // o que o certificado chama de "Método de Inscrição" (D12). Sem coluna
        // separada, as duas saem da mesma origem.
        metodoInscricao: ferramenta ?? 'Não informado',
        precisaAssinaturaDev: /^sim$/i.test(f.precisaAssinaturaDev.trim()),
        homologado: /^sim$/i.test(f.homologado.trim())
          ? true
          : /^n[ãa]o$/i.test(f.homologado.trim())
            ? false
            : null,
      },
      resultados,
    }
  })

  // (fabricante, modelo) é unique: uma colisão aqui viraria erro no meio da gravação.
  const chaves = new Map<string, number[]>()
  for (const p of plano) {
    const k = `${p.fabricante}|${p.modelo}`
    chaves.set(k, [...(chaves.get(k) ?? []), p.coluna])
  }
  const colisoes = [...chaves].filter(([, cols]) => cols.length > 1)
  if (colisoes.length > 0) {
    throw new Error(
      `Modelos duplicados na planilha (fabricante + modelo é chave única):\n` +
        colisoes.map(([k, cols]) => `  - ${k} nas colunas ${cols.join(', ')}`).join('\n'),
    )
  }

  // ---------- relatório ----------
  const contagem: Record<string, number> = {}
  const revisar: string[] = []
  for (const p of plano) {
    for (const r of p.resultados) {
      contagem[r.status] = (contagem[r.status] ?? 0) + 1
      if (r.revisar) revisar.push(`${p.nomeComercial} · ${r.chave} · "${r.bruto}"`)
    }
  }

  console.log('\n📊 Resultados a gravar')
  for (const [status, n] of Object.entries(contagem).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${status.padEnd(14)} ${String(n).padStart(4)}`)
  }
  console.log(`   ${'TOTAL'.padEnd(14)} ${String(plano.length * bateria.itens.length).padStart(4)}`)
  console.log(`\n🔍 Células que entram na fila de revisão: ${revisar.length}`)
  if (semPlanilha.length > 0) {
    console.log(`   Itens do catálogo fora da planilha (ficam "não testado"): ${semPlanilha.join(', ')}`)
  }

  if (!aplicar) {
    console.log('\n(simulação — nada foi gravado)\n')
    return
  }

  // ---------- limpeza ----------
  const naPlanilha = new Set(plano.map(p => `${p.fabricante}|${p.modelo}`))

  if (limpar) {
    const existentes = await prisma.dispositivo.findMany({
      where: { categoriaId: categoria.id },
      include: { homologacoes: { orderBy: { criadoEm: 'desc' }, select: { id: true } } },
    })

    const foraDaPlanilha = existentes.filter(d => !naPlanilha.has(`${d.fabricante}|${d.modelo}`))
    // Reteste é histórico legítimo (§11.2), mas as duplicatas que estão aqui vieram
    // dos roteiros de verificação, não de retestes reais.
    const duplicadas = existentes
      .filter(d => naPlanilha.has(`${d.fabricante}|${d.modelo}`))
      .flatMap(d => d.homologacoes.slice(1).map(h => h.id))

    const homologacoesAApagar = [
      ...foraDaPlanilha.flatMap(d => d.homologacoes.map(h => h.id)),
      ...duplicadas,
    ]

    if (homologacoesAApagar.length > 0 || foraDaPlanilha.length > 0) {
      await prisma.$transaction([
        prisma.certificadoEmitido.deleteMany({ where: { homologacaoId: { in: homologacoesAApagar } } }),
        prisma.logReabertura.deleteMany({ where: { homologacaoId: { in: homologacoesAApagar } } }),
        prisma.resultado.deleteMany({ where: { homologacaoId: { in: homologacoesAApagar } } }),
        prisma.homologacao.deleteMany({ where: { id: { in: homologacoesAApagar } } }),
        prisma.dispositivo.deleteMany({ where: { id: { in: foraDaPlanilha.map(d => d.id) } } }),
      ])
    }

    console.log(
      `\n🧹 Removidos: ${foraDaPlanilha.length} dispositivo(s) fora da planilha ` +
        `(${foraDaPlanilha.map(d => d.nomeComercial).join(', ') || '—'}) e ` +
        `${duplicadas.length} homologação(ões) duplicada(s)`,
    )
  }

  // ---------- gravação ----------
  let criados = 0
  let atualizados = 0

  for (const p of plano) {
    // Uma foto já enviada pelo sistema não deve se perder num reimport.
    const dispositivo = await prisma.dispositivo.upsert({
      where: { fabricante_modelo: { fabricante: p.fabricante, modelo: p.modelo } },
      update: { nomeComercial: p.nomeComercial, categoriaId: categoria.id, ativo: true },
      create: {
        categoriaId: categoria.id,
        fabricante: p.fabricante,
        modelo: p.modelo,
        nomeComercial: p.nomeComercial,
      },
    })

    const anterior = await prisma.homologacao.findFirst({
      where: { dispositivoId: dispositivo.id },
      orderBy: { criadoEm: 'desc' },
      select: { id: true, status: true },
    })

    // Homologação aprovada é somente-leitura (spec §11.4) — o import não a reabre.
    if (anterior && (anterior.status === StatusHomologacao.APROVADO || anterior.status === StatusHomologacao.PUBLICADO)) {
      console.log(`   ⏭  ${p.nomeComercial}: homologação ${anterior.status} — pulada`)
      continue
    }

    const dados = {
      bateriaId: bateria.id,
      ...p.ficha,
      dataInicio,
      responsavelId: admin.id,
      status: StatusHomologacao.RASCUNHO,
    }

    const homologacao = anterior
      ? await prisma.homologacao.update({ where: { id: anterior.id }, data: dados })
      : await prisma.homologacao.create({ data: { ...dados, dispositivoId: dispositivo.id } })

    if (anterior) atualizados++
    else criados++

    await prisma.$transaction(
      p.resultados.map(r =>
        prisma.resultado.upsert({
          where: { homologacaoId_itemId: { homologacaoId: homologacao.id, itemId: r.itemId } },
          update: {
            status: r.status,
            observacao: r.observacao ?? null,
            justificativaId: r.justificativaId ?? null,
            justificativaTexto: r.justificativaTexto ?? null,
          },
          create: {
            homologacaoId: homologacao.id,
            itemId: r.itemId,
            status: r.status,
            observacao: r.observacao ?? null,
            justificativaId: r.justificativaId ?? null,
            justificativaTexto: r.justificativaTexto ?? null,
          },
        }),
      ),
    )
  }

  // `uso_count` incrementava a cada PUT, inflando a contagem (dívida do HANDOFF §6).
  // Depois de um import em massa vale recontar a partir da verdade.
  for (const j of justificativas) {
    const usoCount = await prisma.resultado.count({ where: { justificativaId: j.id } })
    if (usoCount !== j.usoCount) await prisma.justificativa.update({ where: { id: j.id }, data: { usoCount } })
  }

  console.log(`\n✅ ${criados} modelo(s) criado(s), ${atualizados} atualizado(s)`)
  console.log(`   Data de início gravada em todas: ${dataInicio.toISOString().slice(0, 10)} ` +
    `(a planilha não tem essa coluna — ajuste por modelo na matriz)\n`)
}

main()
  .catch(e => {
    console.error('❌ Erro no import:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
