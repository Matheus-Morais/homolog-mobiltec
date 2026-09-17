/**
 * Ciclo de revisão: Admin devolve → parceiro ajusta → reenvia → Admin aprova.
 *
 * Cobre as decisões D432–D437 de ponta a ponta, nas duas telas e com os dois
 * papéis. A cobaia é criada e apagada por este roteiro (D398): nada do que ele
 * cria sobrevive à execução, com ou sem falha.
 */
import { PrismaClient } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { mkdir, unlink } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const process = require('node:process')
const opcoesNavegador = process.env.PLAYWRIGHT_CHANNEL
  ? { channel: process.env.PLAYWRIGHT_CHANNEL }
  : {}

const BASE = 'http://localhost:8080'
const SAIDA = new URL('../.verificacao/', import.meta.url).pathname.replace(/^\//, '')
const erros = []
const marca = Date.now().toString().slice(-6)
const MODELO = `RV-${marca}`

const ADMIN = { email: 'admin@mobiltec.com.br', senha: 'admin123' }
const PARCEIRO = { email: 'parceiro@fabricante.com', senha: 'admin123' }

const prisma = new PrismaClient()
const indiceFiltro = process.argv.indexOf('--filter')
const filtro = indiceFiltro >= 0 ? process.argv[indiceFiltro + 1] : null
const filtrosDisponiveis = new Set(['foto-revisao', 'observacoes-admin', 'estados-modal'])

if (filtro && !filtrosDisponiveis.has(filtro)) {
  console.error(
    `Filtro desconhecido "${filtro}". Use: ${[...filtrosDisponiveis].join(', ')}.`,
  )
  process.exit(2)
}

/** Permissões do parceiro antes deste roteiro mexer nelas */
let permissoesOriginais = null

/** Devolve a conta do parceiro ao estado em que ela estava */
async function restaurarParceiro() {
  if (permissoesOriginais === null) return
  await prisma.usuario.update({
    where: { email: PARCEIRO.email },
    data: { categoriasPermitidas: permissoesOriginais },
  })
  permissoesOriginais = null
}

function checar(rotulo, condicao, detalhe = '') {
  console.log(`${condicao ? '  ✓' : '  ✗'} ${rotulo}${detalhe ? ` — ${detalhe}` : ''}`)
  if (!condicao) erros.push(rotulo)
}

/**
 * Remove a cobaia deste roteiro. O filtro é o padrão exato do modelo gerado
 * aqui (`RV-<6 dígitos>`), para nunca encostar em modelo real do catálogo.
 */
async function limpar() {
  const cobaias = await prisma.dispositivo.findMany({
    where: { fabricante: 'Cobaia Revisao', modelo: { startsWith: 'RV-' } },
    select: { id: true, modelo: true },
  })
  const geradas = cobaias.filter((d) => /^RV-\d{4,}$/.test(d.modelo))
  if (!geradas.length) return 0

  const ids = geradas.map((d) => d.id)
  const homs = await prisma.homologacao.findMany({
    where: { dispositivoId: { in: ids } },
    select: { id: true },
  })
  const idsHom = homs.map((h) => h.id)

  await prisma.certificadoEmitido.deleteMany({ where: { homologacaoId: { in: idsHom } } })
  await prisma.logReabertura.deleteMany({ where: { homologacaoId: { in: idsHom } } })
  await prisma.historicoStatus.deleteMany({ where: { homologacaoId: { in: idsHom } } })
  await prisma.resultado.deleteMany({ where: { homologacaoId: { in: idsHom } } })
  await prisma.homologacao.deleteMany({ where: { id: { in: idsHom } } })
  await prisma.dispositivo.deleteMany({ where: { id: { in: ids } } })
  return geradas.length
}

/** Cria a cobaia direto no banco: o foco aqui é o ciclo, não o cadastro. */
async function criarCobaia() {
  const categoria = await prisma.categoria.findUnique({ where: { slug: 'pos' } })
  if (!categoria) throw new Error('Categoria "pos" não existe — rode o seed antes')

  const bateria = await prisma.bateriaTeste.findFirst({
    where: { categoriaId: categoria.id, ativo: true },
    include: { itens: { select: { itemId: true } } },
  })
  if (!bateria) throw new Error('Nenhuma bateria ativa para "pos" — rode o seed antes')

  const parceiro = await prisma.usuario.findUnique({ where: { email: PARCEIRO.email } })
  if (!parceiro) throw new Error(`Usuário ${PARCEIRO.email} não existe — rode o seed antes`)

  // A matriz recusa categoria fora de `categoriasPermitidas`, e o parceiro do
  // seed nasce sem nenhuma. Libera "pos" só para esta execução — o valor
  // original volta em `restaurarParceiro()`, para não deixar permissão solta
  // numa conta real (D398).
  permissoesOriginais = parceiro.categoriasPermitidas
  if (!parceiro.categoriasPermitidas.includes('pos')) {
    await prisma.usuario.update({
      where: { id: parceiro.id },
      data: { categoriasPermitidas: [...parceiro.categoriasPermitidas, 'pos'] },
    })
  }

  const dispositivo = await prisma.dispositivo.create({
    data: {
      nomeComercial: `Cobaia Revisao ${MODELO}`,
      fabricante: 'Cobaia Revisao',
      modelo: MODELO,
      categoriaId: categoria.id,
      empresa: parceiro.empresa,
      ativo: true,
    },
  })

  const homologacao = await prisma.homologacao.create({
    data: {
      dispositivoId: dispositivo.id,
      bateriaId: bateria.id,
      numeroSerie: `SN${marca}`,
      versaoSo: 'Android 13',
      gerenciamento: 'ANDROID_ENTERPRISE',
      tipoAgente: 'PROD',
      versaoAgente: '12.6.8',
      metodoInscricao: 'QR Code',
      dataInicio: new Date(),
      responsavelId: parceiro.id,
      // Já entra na fila do Admin: o que este roteiro verifica começa aí
      status: 'AGUARDANDO_ANALISE',
      observacoes: JSON.stringify([
        {
          id: 'obs-1',
          titulo: `Observação da cobaia ${marca}`,
          texto: 'Log do agente anexado para conferência da Mobiltec.',
          autorNome: parceiro.nome,
          criadoEm: new Date().toISOString(),
          anexos: [],
        },
      ]),
      resultados: {
        create: bateria.itens.map((i) => ({ itemId: i.itemId, status: 'OK' })),
      },
    },
  })

  return { dispositivoId: dispositivo.id, homologacaoId: homologacao.id }
}

async function entrar(p, { email, senha }) {
  await p.goto(`${BASE}/login`)
  await p.fill('#email', email)
  await p.fill('#senha', senha)
  await p.click('button[type=submit]')
  await p.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15000 })
}

async function sair(p) {
  await p.evaluate(() => localStorage.clear())
}

/** O card da cobaia na tela de validação, pela âncora `data-card-homologacao` */
function cardCobaia(p, id) {
  return p.locator(`[data-card-homologacao="${id}"]`)
}

if (!filtro) {
await limpar()
const { homologacaoId } = await criarCobaia()
console.log(`Cobaia criada: ${MODELO} (homologação ${homologacaoId})\n`)

const nav = await chromium.launch(opcoesNavegador)
const p = await nav.newPage({ viewport: { width: 1600, height: 950 } })
p.on('pageerror', (e) => erros.push(`pageerror: ${e.message}`))

try {
  // ============================================================
  // 1. Admin — a tela de validação depois de D432/D433/D437
  // ============================================================
  console.log('1. Tela de validação do Admin')
  await entrar(p, ADMIN)
  await p.goto(`${BASE}/parceiros/validar-certificados`, { waitUntil: 'networkidle' })
  await p.waitForSelector(`text=Cobaia Revisao ${MODELO}`, { timeout: 15000 })

  const card = cardCobaia(p, homologacaoId)
  checar(
    'Botão "Matriz" foi removido do card (D433)',
    (await card.locator('a:has-text("Matriz")').count()) === 0,
  )
  checar(
    'Botão "Observações" foi removido do card (D433)',
    (await card.locator('button:has-text("Observações")').count()) === 0,
  )
  checar(
    'Botão "Exibir informações" está no card (D432)',
    (await card.locator('button:has-text("Exibir informações")').count()) > 0,
  )

  const botaoRevisao = card.locator('button:has-text("Enviar para revisão")').first()
  const cursor = await botaoRevisao.evaluate((el) => getComputedStyle(el).cursor)
  checar('Botão de revisão usa cursor de mão (D437)', cursor === 'pointer', `cursor: ${cursor}`)
  const corRevisao = await botaoRevisao.evaluate((el) => getComputedStyle(el).backgroundColor)
  checar(
    'Botão de revisão não está com a aparência de desabilitado',
    corRevisao !== 'rgba(0, 0, 0, 0)' && corRevisao !== 'transparent',
    `background: ${corRevisao}`,
  )
  await p.screenshot({ path: `${SAIDA}/revisao-01-fila-admin.png` })

  // ============================================================
  // 2. Admin — a ficha em modal traz resultado e observações
  // ============================================================
  console.log('\n2. Modal "Exibir informações"')
  await card.locator('button:has-text("Exibir informações")').first().click()
  await p.waitForSelector('[role=dialog]', { timeout: 10000 })
  await p.waitForSelector('[role=dialog] >> text=Unidade testada', { timeout: 10000 })

  const modal = p.locator('[role=dialog]').last()
  const textoModal = await modal.textContent()
  checar('Ficha traz a unidade testada', textoModal.includes('Unidade testada'))
  checar('Ficha traz o resultado item a item', textoModal.includes('Resultado da homologação'))
  checar(
    'Ficha traz as observações do parceiro (D433)',
    textoModal.includes(`Observação da cobaia ${marca}`),
  )
  await p.screenshot({ path: `${SAIDA}/revisao-02-modal-informacoes.png` })

  await p.keyboard.press('Escape')
  await p.waitForSelector('[role=dialog]', { state: 'detached', timeout: 10000 })

  // ============================================================
  // 3. Admin — revisão sem motivo é recusada (D435)
  // ============================================================
  console.log('\n3. Motivo da revisão obrigatório')
  await cardCobaia(p, homologacaoId).locator('button:has-text("Enviar para revisão")').first().click()
  await p.waitForSelector('[role=dialog]', { timeout: 10000 })
  await p.locator('[role=dialog] textarea').fill('curto')
  await p.locator('[role=dialog] button:has-text("Enviar para Revisão")').click()
  await p.waitForTimeout(500)

  const statusAposCurto = await prisma.homologacao.findUnique({
    where: { id: homologacaoId },
    select: { status: true },
  })
  checar(
    'Motivo abaixo do mínimo não transiciona (D435)',
    statusAposCurto.status === 'AGUARDANDO_ANALISE',
    `status: ${statusAposCurto.status}`,
  )

  const MOTIVO = `Refazer o teste de telemetria de bateria e justificar o resultado (${marca}).`
  await p.locator('[role=dialog] textarea').fill(MOTIVO)
  await p.locator('[role=dialog] button:has-text("Enviar para Revisão")').click()
  await p.waitForSelector('[role=dialog]', { state: 'detached', timeout: 15000 })

  const aposRevisao = await prisma.homologacao.findUnique({
    where: { id: homologacaoId },
    select: { status: true, historicoStatus: { where: { statusNovo: 'EM_REVISAO' } } },
  })
  checar('Homologação foi para EM_REVISAO', aposRevisao.status === 'EM_REVISAO')
  checar(
    'Motivo ficou gravado no histórico',
    aposRevisao.historicoStatus[0]?.motivo === MOTIVO,
    aposRevisao.historicoStatus[0]?.motivo ?? '(vazio)',
  )

  // ============================================================
  // 4. Admin — sai de "Pendentes", entra em "Em revisão" (D436)
  // ============================================================
  console.log('\n4. Separação das filas do Admin')
  await p.reload({ waitUntil: 'networkidle' })
  await p.waitForTimeout(800)
  checar(
    'Cobaia saiu da aba Pendentes',
    (await p.locator(`text=Cobaia Revisao ${MODELO}`).count()) === 0,
  )

  await p.locator('button:has-text("Em revisão (")').click()
  await p.waitForSelector(`text=Cobaia Revisao ${MODELO}`, { timeout: 10000 })
  const cardRevisao = cardCobaia(p, homologacaoId)
  checar(
    'Cobaia aparece na aba "Em revisão"',
    (await p.locator(`text=Cobaia Revisao ${MODELO}`).count()) > 0,
  )
  checar(
    'Sem botão de aprovar enquanto está com o parceiro (D436)',
    (await cardRevisao.locator('button:has-text("Aprovar & Emitir")').count()) === 0,
  )
  checar(
    'O apontamento aparece no card (D435)',
    (await p.locator(`text=${MOTIVO}`).count()) > 0,
  )
  await p.screenshot({ path: `${SAIDA}/revisao-03-aba-em-revisao.png` })

  // ============================================================
  // 5. Parceiro — matriz liberada, com o apontamento à vista (D434)
  // ============================================================
  console.log('\n5. Matriz liberada para o parceiro')
  await sair(p)
  await entrar(p, PARCEIRO)
  await p.goto(`${BASE}/matriz/pos`, { waitUntil: 'networkidle' })
  await p.waitForSelector('thead th[data-modelo]', { timeout: 15000 })

  checar('O parceiro vê o apontamento na matriz (D435)', (await p.locator(`text=${MOTIVO}`).count()) > 0)

  const coluna = p.locator(`thead th[data-modelo="Cobaia Revisao ${MODELO}"]`)
  checar('A coluna da cobaia está na matriz do parceiro', (await coluna.count()) > 0)
  await p.screenshot({ path: `${SAIDA}/revisao-04-matriz-parceiro.png` })

  // Edita um resultado: é a prova de que a matriz voltou a aceitar escrita
  const indiceColuna = await p.evaluate((modelo) => {
    const ths = [...document.querySelectorAll('thead th[data-modelo]')]
    return ths.findIndex((t) => t.getAttribute('data-modelo') === modelo)
  }, `Cobaia Revisao ${MODELO}`)

  const respostaEdicao = await p.evaluate(
    async ({ id }) => {
      const r = await fetch(`/api/matriz?categoriaSlug=pos`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('homolog.token')}` },
      })
      const m = await r.json()
      const col = m.colunas.find((c) => c.homologacao.id === id)
      if (!col) return { status: 0, erro: 'coluna não veio na matriz do parceiro' }
      const itemId = col.homologacao.resultados[0].itemId
      const put = await fetch(`/api/homologacoes/${id}/resultados/${itemId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('homolog.token')}`,
        },
        body: JSON.stringify({ status: 'FALHA', observacao: 'Reteste durante a revisão' }),
      })
      return { status: put.status, corpo: await put.text() }
    },
    { id: homologacaoId },
  )
  checar(
    'Parceiro grava resultado em EM_REVISAO (D434)',
    respostaEdicao.status === 200,
    `HTTP ${respostaEdicao.status} ${respostaEdicao.corpo ?? respostaEdicao.erro ?? ''}`.slice(0, 160),
  )
  checar('A coluna é editável (não é só leitura)', indiceColuna >= 0)

  // ============================================================
  // 6. Parceiro — reenvia para validação (D434)
  // ============================================================
  console.log('\n6. Reenvio para validação')
  const reenvio = await p.evaluate(async ({ id }) => {
    const r = await fetch(`/api/homologacoes/${id}/status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('homolog.token')}`,
      },
      body: JSON.stringify({ novoStatus: 'AGUARDANDO_ANALISE' }),
    })
    return { status: r.status, corpo: await r.text() }
  }, { id: homologacaoId })
  checar(
    'EM_REVISAO → AGUARDANDO_ANALISE é permitido ao parceiro (D434)',
    reenvio.status === 200,
    `HTTP ${reenvio.status} ${reenvio.corpo}`.slice(0, 160),
  )

  // Reenviada, volta a ser somente-leitura para ele
  const edicaoBloqueada = await p.evaluate(async ({ id }) => {
    const r = await fetch(`/api/homologacoes/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('homolog.token')}`,
      },
      body: JSON.stringify({ numeroSerie: 'NAO-DEVE-PASSAR' }),
    })
    return r.status
  }, { id: homologacaoId })
  checar(
    'Sob custódia da Mobiltec volta a ser somente-leitura (D434)',
    edicaoBloqueada === 403,
    `HTTP ${edicaoBloqueada}`,
  )

  // ============================================================
  // 7. Admin — a cobaia volta para "Pendentes" e é aprovada
  // ============================================================
  console.log('\n7. Retorno à fila do Admin')
  await sair(p)
  await entrar(p, ADMIN)
  await p.goto(`${BASE}/parceiros/validar-certificados`, { waitUntil: 'networkidle' })
  await p.waitForSelector(`text=Cobaia Revisao ${MODELO}`, { timeout: 15000 })
  checar(
    'Cobaia voltou sozinha para a aba Pendentes (D436)',
    (await p.locator(`text=Cobaia Revisao ${MODELO}`).count()) > 0,
  )
  await p.screenshot({ path: `${SAIDA}/revisao-05-de-volta-em-pendentes.png` })

  await cardCobaia(p, homologacaoId).locator('button:has-text("Aprovar & Emitir")').first().click()
  await p.waitForSelector('[role=dialog]', { timeout: 10000 })
  await p.locator('[role=dialog] button:has-text("Confirmar Aprovação")').click()
  await p.waitForSelector('[role=dialog]', { state: 'detached', timeout: 15000 })

  const final = await prisma.homologacao.findUnique({
    where: { id: homologacaoId },
    select: { status: true },
  })
  checar('Ciclo fecha em APROVADO', final.status === 'APROVADO', `status: ${final.status}`)
} catch (e) {
  erros.push(`EXCECAO: ${e.message}`)
  await p.screenshot({ path: `${SAIDA}/revisao-erro.png` }).catch(() => {})
} finally {
  await nav.close()
  console.log(`\nLimpeza: ${await limpar()} cobaia(s) removida(s)`)
  await restaurarParceiro()
  await prisma.$disconnect()
}

console.log('\n' + '='.repeat(60))
console.log(erros.length === 0 ? 'TUDO OK' : `${erros.length} PROBLEMA(S):\n  - ${erros.join('\n  - ')}`)
process.exit(erros.length ? 1 : 0)
}

// ============================================================================
// Provas filtradas dos ajustes de revisão (C1-C8)
// ============================================================================

const idsDispositivosFiltro = []
const idsHomologacoesFiltro = []
const urlsUploadFiltro = new Set()
const prefixoFiltro = `RVF-${Date.now()}-${process.pid}`

function registrarFotoGerada(fotoUrl) {
  if (typeof fotoUrl === 'string' && fotoUrl) urlsUploadFiltro.add(fotoUrl)
}

async function criarCobaiaFiltro({ status = 'RASCUNHO', comDetalhes = false } = {}) {
  const categoria = await prisma.categoria.findUnique({ where: { slug: 'pos' } })
  if (!categoria) throw new Error('Categoria "pos" não existe — rode o seed antes')

  const bateria = await prisma.bateriaTeste.findFirst({
    where: { categoriaId: categoria.id, ativo: true },
    include: {
      itens: {
        orderBy: { ordem: 'asc' },
        include: { item: true },
      },
    },
  })
  if (!bateria || bateria.itens.length < 4) {
    throw new Error('A bateria ativa de "pos" precisa ter ao menos quatro itens — rode o seed antes')
  }

  const parceiro = await prisma.usuario.findUnique({ where: { email: PARCEIRO.email } })
  const admin = await prisma.usuario.findUnique({ where: { email: ADMIN.email } })
  if (!parceiro || !admin) throw new Error('Usuários de verificação não existem — rode o seed antes')

  if (permissoesOriginais === null) permissoesOriginais = parceiro.categoriasPermitidas
  if (!parceiro.categoriasPermitidas.includes('pos')) {
    await prisma.usuario.update({
      where: { id: parceiro.id },
      data: { categoriasPermitidas: [...parceiro.categoriasPermitidas, 'pos'] },
    })
  }

  const sufixo = idsDispositivosFiltro.length + 1
  const modelo = `${prefixoFiltro}-${sufixo}`
  const nomeComercial = `Cobaia Ajustes Revisão ${modelo}`
  const dispositivo = await prisma.dispositivo.create({
    data: {
      nomeComercial,
      fabricante: 'Cobaia Ajustes Revisão',
      modelo,
      categoriaId: categoria.id,
      empresa: parceiro.empresa,
      ativo: true,
    },
  })
  idsDispositivosFiltro.push(dispositivo.id)

  const textos = {
    ambosJustificativa: `Justificativa exata mista ${prefixoFiltro}`,
    ambosObservacao: `Observação exata mista ${prefixoFiltro}`,
    soJustificativa: `Justificativa exata isolada ${prefixoFiltro}`,
    soObservacao: `Observação exata isolada ${prefixoFiltro}`,
  }
  const quatro = bateria.itens.slice(0, 4)
  const detalhes = comDetalhes
    ? [
        {
          item: quatro[0].item,
          status: 'FALHA',
          justificativaTexto: textos.ambosJustificativa,
          observacao: textos.ambosObservacao,
          secoes: [
            ['Justificativa', textos.ambosJustificativa],
            ['Observação da funcionalidade', textos.ambosObservacao],
          ],
        },
        {
          item: quatro[1].item,
          status: 'FALHA',
          justificativaTexto: textos.soJustificativa,
          observacao: null,
          secoes: [['Justificativa', textos.soJustificativa]],
        },
        {
          item: quatro[2].item,
          status: 'OK',
          justificativaTexto: null,
          observacao: textos.soObservacao,
          secoes: [['Observação da funcionalidade', textos.soObservacao]],
        },
        {
          item: quatro[3].item,
          status: 'OK',
          justificativaTexto: null,
          observacao: null,
          secoes: [],
        },
      ]
    : []
  const detalhesPorItem = new Map(detalhes.map((d) => [d.item.id, d]))

  const homologacao = await prisma.homologacao.create({
    data: {
      dispositivoId: dispositivo.id,
      bateriaId: bateria.id,
      numeroSerie: `SN-${prefixoFiltro}-${sufixo}`,
      versaoSo: 'Android 13',
      gerenciamento: 'ANDROID_ENTERPRISE',
      tipoAgente: 'PROD',
      versaoAgente: '12.6.8',
      metodoInscricao: 'QR Code',
      dataInicio: new Date(),
      dataFim: status === 'APROVADO' || status === 'PUBLICADO' ? new Date() : null,
      responsavelId: parceiro.id,
      status,
      homologado:
        status === 'APROVADO' || status === 'PUBLICADO'
          ? true
          : status === 'REPROVADO'
            ? false
            : null,
      resultados: {
        create: bateria.itens.map(({ itemId }) => {
          const caso = detalhesPorItem.get(itemId)
          return {
            itemId,
            status: caso?.status ?? 'OK',
            justificativaTexto: caso?.justificativaTexto ?? null,
            observacao: caso?.observacao ?? null,
          }
        }),
      },
    },
  })
  idsHomologacoesFiltro.push(homologacao.id)

  return {
    dispositivoId: dispositivo.id,
    homologacaoId: homologacao.id,
    modelo,
    nomeComercial,
    parceiroId: parceiro.id,
    adminId: admin.id,
    detalhes,
  }
}

async function limparCobaiasFiltro() {
  for (const dispositivo of await prisma.dispositivo.findMany({
    where: { id: { in: idsDispositivosFiltro } },
    select: { fotoUrl: true },
  })) {
    registrarFotoGerada(dispositivo.fotoUrl)
  }

  if (idsHomologacoesFiltro.length) {
    await prisma.certificadoEmitido.deleteMany({
      where: { homologacaoId: { in: idsHomologacoesFiltro } },
    })
    await prisma.logReabertura.deleteMany({
      where: { homologacaoId: { in: idsHomologacoesFiltro } },
    })
    await prisma.historicoStatus.deleteMany({
      where: { homologacaoId: { in: idsHomologacoesFiltro } },
    })
    await prisma.resultado.deleteMany({
      where: { homologacaoId: { in: idsHomologacoesFiltro } },
    })
    await prisma.homologacao.deleteMany({ where: { id: { in: idsHomologacoesFiltro } } })
  }
  if (idsDispositivosFiltro.length) {
    await prisma.dispositivo.deleteMany({ where: { id: { in: idsDispositivosFiltro } } })
  }

  const diretorioFotos = path.resolve(process.env.UPLOAD_DIR ?? './uploads', 'fotos')
  for (const url of urlsUploadFiltro) {
    if (!url.startsWith('/uploads/fotos/')) continue
    const alvo = path.resolve(diretorioFotos, path.basename(url))
    if (!alvo.startsWith(`${diretorioFotos}${path.sep}`)) {
      erros.push(`Limpeza recusou caminho fora de uploads/fotos: ${alvo}`)
      continue
    }
    await unlink(alvo).catch((erro) => {
      if (erro?.code !== 'ENOENT') erros.push(`Falha ao remover upload ${alvo}: ${erro.message}`)
    })
  }
}

async function configurarCaso(cobaia, status, vinculo, fotoUrl) {
  const data = {
    status,
    homologado:
      status === 'APROVADO' || status === 'PUBLICADO'
        ? true
        : status === 'REPROVADO'
          ? false
          : null,
    dataFim: status === 'APROVADO' || status === 'PUBLICADO' ? new Date() : null,
    responsavelId: vinculo === 'responsavelId' ? cobaia.parceiroId : cobaia.adminId,
    apoioId: vinculo === 'apoioId' ? cobaia.parceiroId : null,
  }
  await prisma.homologacao.update({ where: { id: cobaia.homologacaoId }, data })
  if (fotoUrl !== undefined) {
    await prisma.dispositivo.update({
      where: { id: cobaia.dispositivoId },
      data: { fotoUrl },
    })
  }
}

function tokenDaPagina(p) {
  return p.evaluate(() => localStorage.getItem('homolog.token'))
}

async function chamarApi(token, caminho, { method = 'GET', body, form } = {}) {
  const headers = { Authorization: `Bearer ${token}` }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const resposta = await fetch(`${BASE}/api${caminho}`, {
    method,
    headers,
    body: form ?? (body === undefined ? undefined : JSON.stringify(body)),
  })
  const texto = await resposta.text()
  let corpo = null
  try {
    corpo = texto ? JSON.parse(texto) : null
  } catch {
    corpo = texto
  }
  return { status: resposta.status, corpo }
}

function formularioFoto(buffer, mime, nome) {
  const form = new FormData()
  form.append('arquivo', new Blob([buffer], { type: mime }), nome)
  return form
}

const PNG_VALIDO = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z1pAAAAAASUVORK5CYII=',
  'base64',
)

async function provarFotoRevisao(p) {
  const cobaia = await criarCobaiaFiltro()
  await entrar(p, PARCEIRO)

  console.log('C1 — ação de foto nos seis estados')
  const estados = [
    'RASCUNHO',
    'EM_REVISAO',
    'AGUARDANDO_ANALISE',
    'APROVADO',
    'PUBLICADO',
    'REPROVADO',
  ]
  for (const status of estados) {
    await configurarCaso(cobaia, status, 'responsavelId', null)
    await p.goto(`${BASE}/dispositivos/${cobaia.homologacaoId}`, { waitUntil: 'networkidle' })
    await p.waitForSelector('text=Unidade testada', { timeout: 15000 })
    const quantidade = await p
      .locator(
        'button[title="Alterar foto do dispositivo"], button[title="Adicionar foto do dispositivo"]',
      )
      .count()
    const editavel = status === 'RASCUNHO' || status === 'EM_REVISAO'
    checar(
      `${status}: ação de foto ${editavel ? 'visível' : 'ausente'}`,
      editavel ? quantidade === 1 : quantidade === 0,
      `${quantidade} ação(ões)`,
    )
  }

  console.log('\nC2/C3 — HTTP nos seis estados × três vínculos × duas rotas')
  const token = await tokenDaPagina(p)
  const vinculos = ['responsavelId', 'apoioId', 'não atribuído']
  let numeroCaso = 0
  for (const status of estados) {
    for (const vinculo of vinculos) {
      numeroCaso += 1
      const fotoAnterior = `https://example.invalid/anterior-${numeroCaso}.png`
      await configurarCaso(cobaia, status, vinculo, fotoAnterior)
      const permitido =
        (status === 'RASCUNHO' || status === 'EM_REVISAO') && vinculo !== 'não atribuído'
      const esperado = permitido ? 200 : 403

      const upload = await chamarApi(token, `/dispositivos/${cobaia.dispositivoId}/foto`, {
        method: 'POST',
        form: formularioFoto(PNG_VALIDO, 'image/png', `caso-${numeroCaso}.png`),
      })
      registrarFotoGerada(upload.corpo?.fotoUrl)
      checar(
        `POST ${status} × ${vinculo} = ${esperado}`,
        upload.status === esperado,
        `HTTP ${upload.status}`,
      )

      const novaUrl = `https://example.invalid/nova-${numeroCaso}.png`
      const patch = await chamarApi(token, `/dispositivos/${cobaia.dispositivoId}`, {
        method: 'PATCH',
        body: { fotoUrl: novaUrl },
      })
      checar(
        `PATCH ${status} × ${vinculo} = ${esperado}`,
        patch.status === esperado,
        `HTTP ${patch.status}`,
      )
      const persistida = await prisma.dispositivo.findUnique({
        where: { id: cobaia.dispositivoId },
        select: { fotoUrl: true },
      })
      if (permitido) {
        checar(
          `PATCH persiste ${status} × ${vinculo}`,
          persistida?.fotoUrl === novaUrl,
          persistida?.fotoUrl ?? '(nulo)',
        )
      } else {
        checar(
          `Rotas preservam foto em ${status} × ${vinculo}`,
          persistida?.fotoUrl === fotoAnterior,
          persistida?.fotoUrl ?? '(nulo)',
        )
      }
    }
  }

  console.log('\nC3/C4 — erros, formatos e bordas de 8 MiB')
  const fotoBase = 'https://example.invalid/foto-preservada.png'
  await configurarCaso(cobaia, 'RASCUNHO', 'responsavelId', fotoBase)

  const patchInvalido = await chamarApi(token, `/dispositivos/${cobaia.dispositivoId}`, {
    method: 'PATCH',
    body: { fotoUrl: 'ftp://invalida.example/foto.png' },
  })
  checar('PATCH inválido = 400', patchInvalido.status === 400, `HTTP ${patchInvalido.status}`)
  let fotoPersistida = await prisma.dispositivo.findUnique({
    where: { id: cobaia.dispositivoId },
    select: { fotoUrl: true },
  })
  checar('PATCH 400 preserva a foto anterior', fotoPersistida?.fotoUrl === fotoBase)
  const patchAusente = await chamarApi(token, `/dispositivos/${randomUUID()}`, {
    method: 'PATCH',
    body: { fotoUrl: 'https://example.invalid/foto.png' },
  })
  checar('PATCH dispositivo ausente = 404', patchAusente.status === 404, `HTTP ${patchAusente.status}`)

  const semArquivo = await chamarApi(token, `/dispositivos/${cobaia.dispositivoId}/foto`, {
    method: 'POST',
    form: new FormData(),
  })
  checar('POST sem arquivo = 400', semArquivo.status === 400, `HTTP ${semArquivo.status}`)
  fotoPersistida = await prisma.dispositivo.findUnique({
    where: { id: cobaia.dispositivoId },
    select: { fotoUrl: true },
  })
  checar('POST 400 preserva a foto anterior', fotoPersistida?.fotoUrl === fotoBase)

  const ausente = await chamarApi(token, `/dispositivos/${randomUUID()}/foto`, {
    method: 'POST',
    form: formularioFoto(PNG_VALIDO, 'image/png', 'ausente.png'),
  })
  checar('POST dispositivo ausente = 404', ausente.status === 404, `HTTP ${ausente.status}`)

  const mimeInvalido = await chamarApi(token, `/dispositivos/${cobaia.dispositivoId}/foto`, {
    method: 'POST',
    form: formularioFoto(Buffer.from('não é imagem'), 'text/plain', 'invalido.txt'),
  })
  checar('POST outro MIME = 415', mimeInvalido.status === 415, `HTTP ${mimeInvalido.status}`)
  fotoPersistida = await prisma.dispositivo.findUnique({
    where: { id: cobaia.dispositivoId },
    select: { fotoUrl: true },
  })
  checar('POST 415 preserva a foto anterior', fotoPersistida?.fotoUrl === fotoBase)

  const oitoMiB = Buffer.alloc(8 * 1024 * 1024)
  const limiteAceito = await chamarApi(token, `/dispositivos/${cobaia.dispositivoId}/foto`, {
    method: 'POST',
    form: formularioFoto(oitoMiB, 'image/png', 'limite-8-mib.png'),
  })
  registrarFotoGerada(limiteAceito.corpo?.fotoUrl)
  checar('POST PNG de 8 MiB = 200', limiteAceito.status === 200, `HTTP ${limiteAceito.status}`)

  const fotoAposLimite = limiteAceito.corpo?.fotoUrl
  const acimaLimite = await chamarApi(token, `/dispositivos/${cobaia.dispositivoId}/foto`, {
    method: 'POST',
    form: formularioFoto(Buffer.alloc(8 * 1024 * 1024 + 1), 'image/png', 'acima-8-mib.png'),
  })
  registrarFotoGerada(acimaLimite.corpo?.fotoUrl)
  checar('POST PNG de 8 MiB + 1 byte = 413', acimaLimite.status === 413, `HTTP ${acimaLimite.status}`)
  const preservada = await prisma.dispositivo.findUnique({
    where: { id: cobaia.dispositivoId },
    select: { fotoUrl: true },
  })
  checar(
    'Falha acima de 8 MiB preserva a foto anterior',
    acimaLimite.status === 413 && preservada?.fotoUrl === fotoAposLimite,
    preservada?.fotoUrl ?? '(nulo)',
  )

  for (const [nome, mime] of [
    ['formato.jpeg', 'image/jpeg'],
    ['formato.webp', 'image/webp'],
  ]) {
    const resposta = await chamarApi(token, `/dispositivos/${cobaia.dispositivoId}/foto`, {
      method: 'POST',
      form: formularioFoto(Buffer.from(`conteúdo-${mime}`), mime, nome),
    })
    registrarFotoGerada(resposta.corpo?.fotoUrl)
    checar(`POST ${mime} = 200`, resposta.status === 200, `HTTP ${resposta.status}`)
  }

  console.log('\nC5 — ficha, matriz, vitrine e certificado na mesma sessão')
  await sair(p)
  await configurarCaso(cobaia, 'APROVADO', 'responsavelId', null)
  await entrar(p, ADMIN)

  // Preaquece os quatro consumidores antes da mutação; o upload deve invalidar
  // os dados já vistos sem exigir uma nova autenticação.
  await p.goto(`${BASE}/dispositivos/${cobaia.homologacaoId}`, { waitUntil: 'networkidle' })
  await p.goto(`${BASE}/matriz/pos`, { waitUntil: 'networkidle' })
  await p.waitForSelector(`thead th[data-modelo="${cobaia.nomeComercial}"]`, { timeout: 15000 })
  await p.goto(BASE, { waitUntil: 'networkidle' })
  await p.waitForSelector(`article[data-modelo="${cobaia.nomeComercial}"]`, { timeout: 15000 })
  await p.goto(`${BASE}/homologacoes/${cobaia.homologacaoId}/certificado`, {
    waitUntil: 'networkidle',
  })
  await p.waitForSelector('iframe[title="Preview do certificado"]', { timeout: 15000 })

  await p.goto(`${BASE}/dispositivos/${cobaia.homologacaoId}`, { waitUntil: 'networkidle' })
  await p
    .locator(
      'button[title="Alterar foto do dispositivo"], button[title="Adicionar foto do dispositivo"]',
    )
    .click()
  const modalFoto = p.locator('[role=dialog]')
  await modalFoto.locator('input[type=file]').setInputFiles({
    name: 'foto-nova.png',
    mimeType: 'image/png',
    buffer: PNG_VALIDO,
  })
  const respostaUpload = p.waitForResponse(
    (r) =>
      r.request().method() === 'POST' &&
      r.url().includes(`/api/dispositivos/${cobaia.dispositivoId}/foto`),
  )
  await modalFoto.getByRole('button', { name: 'Salvar foto no catálogo' }).click()
  const resposta = await respostaUpload
  const corpoUpload = await resposta.json()
  registrarFotoGerada(corpoUpload.fotoUrl)
  checar('Upload pela ficha = 200', resposta.status() === 200, `HTTP ${resposta.status()}`)

  const srcEsperado = `/api${corpoUpload.fotoUrl}`
  await p.waitForSelector(`img[src="${srcEsperado}"]`, { timeout: 15000 })
  checar('Ficha atual mostra a foto nova', (await p.locator(`img[src="${srcEsperado}"]`).count()) > 0)

  await p.goto(`${BASE}/matriz/pos`, { waitUntil: 'networkidle' })
  await p.waitForSelector(`thead th[data-modelo="${cobaia.nomeComercial}"]`, { timeout: 15000 })
  checar('Matriz mostra a foto nova', (await p.locator(`img[src="${srcEsperado}"]`).count()) > 0)

  await p.goto(BASE, { waitUntil: 'networkidle' })
  const cardVitrine = p.locator(`article[data-modelo="${cobaia.nomeComercial}"]`)
  await cardVitrine.waitFor({ timeout: 15000 })
  checar('Vitrine mostra a foto nova', (await cardVitrine.locator(`img[src="${srcEsperado}"]`).count()) > 0)

  await p.goto(`${BASE}/homologacoes/${cobaia.homologacaoId}/certificado`, {
    waitUntil: 'networkidle',
  })
  await p.waitForSelector('iframe[title="Preview do certificado"]', { timeout: 15000 })
  const estiloFoto = await p
    .frameLocator('iframe[title="Preview do certificado"]')
    .locator('.ficha-foto')
    .getAttribute('style')
  const prefixoBase64 = PNG_VALIDO.toString('base64').slice(0, 24)
  checar(
    'Preview do certificado mostra exatamente a foto nova',
    Boolean(estiloFoto?.includes('data:image/png') && estiloFoto.includes(prefixoBase64)),
    estiloFoto?.slice(0, 100) ?? '(sem estilo)',
  )
}

async function verificarDetalhesNaFicha(p, raiz, casos, origem) {
  for (const caso of casos) {
    const linha = raiz.locator('tr').filter({ hasText: caso.item.nome }).first()
    checar(`${origem}: linha de "${caso.item.nome}" existe`, (await linha.count()) === 1)
    const gatilho = linha.getByRole('button', { name: 'Ver detalhes da funcionalidade' })
    if (caso.secoes.length === 0) {
      checar(`${origem}: caso sem detalhe não cria seção`, (await gatilho.count()) === 0)
      continue
    }

    checar(`${origem}: caso com detalhe cria gatilho`, (await gatilho.count()) === 1)
    await gatilho.focus()
    const balao = p.getByRole('tooltip')
    await balao.waitFor({ timeout: 5000 })
    const secoes = await balao.locator('dl > div').evaluateAll((elementos) =>
      elementos.map((elemento) => {
        return [
          elemento.querySelector('dt')?.textContent ?? '',
          elemento.querySelector('dd')?.textContent ?? '',
        ]
      }),
    )
    checar(
      `${origem}: labels e textos exatos de "${caso.item.nome}"`,
      JSON.stringify(secoes) === JSON.stringify(caso.secoes),
      JSON.stringify(secoes),
    )
    await gatilho.blur()
    await balao.waitFor({ state: 'detached', timeout: 5000 })
  }
}

async function provarObservacoesAdmin(p) {
  const cobaia = await criarCobaiaFiltro({ status: 'AGUARDANDO_ANALISE', comDetalhes: true })
  await entrar(p, ADMIN)
  await p.goto(`${BASE}/parceiros/validar-certificados`, { waitUntil: 'networkidle' })
  await p.waitForSelector(`text=${cobaia.nomeComercial}`, { timeout: 15000 })

  console.log('C6/C7 — quatro combinações no modal do Admin')
  await cardCobaia(p, cobaia.homologacaoId)
    .getByRole('button', { name: 'Exibir informações' })
    .click()
  const modal = p.getByRole('dialog').last()
  await modal.getByText('Resultado da homologação').waitFor({ timeout: 10000 })
  await verificarDetalhesNaFicha(p, modal, cobaia.detalhes, 'modal Admin')
  await p.screenshot({ path: `${SAIDA}/ajustes-revisao-observacoes-admin.png` })
  await p.keyboard.press('Escape')
  await modal.waitFor({ state: 'detached', timeout: 5000 })

  console.log('\nC7 — mesma apresentação na página de detalhe')
  await p.goto(`${BASE}/dispositivos/${cobaia.homologacaoId}`, { waitUntil: 'networkidle' })
  await p.getByText('Resultado da homologação').waitFor({ timeout: 10000 })
  await verificarDetalhesNaFicha(p, p.locator('body'), cobaia.detalhes, 'página de detalhe')
}

async function provarEstadosModal(p) {
  const cobaia = await criarCobaiaFiltro({ status: 'AGUARDANDO_ANALISE' })
  await entrar(p, ADMIN)
  const paginaValidacao = `${BASE}/parceiros/validar-certificados`
  const rotaDetalhe = `**/api/homologacoes/${cobaia.homologacaoId}`

  console.log('C8 — loading')
  await p.goto(paginaValidacao, { waitUntil: 'networkidle' })
  await p.waitForSelector(`text=${cobaia.nomeComercial}`, { timeout: 15000 })
  let liberar
  const bloqueio = new Promise((resolve) => {
    liberar = resolve
  })
  const segurar = async (route) => {
    await bloqueio
    await route.continue()
  }
  await p.route(rotaDetalhe, segurar)
  await cardCobaia(p, cobaia.homologacaoId)
    .getByRole('button', { name: 'Exibir informações' })
    .click()
  const modalLoading = p.getByRole('dialog').last()
  try {
    await modalLoading.getByText('Carregando informações…').waitFor({ timeout: 5000 })
    checar(
      'Modal mostra “Carregando informações…” durante a requisição',
      await modalLoading.getByText('Carregando informações…').isVisible(),
    )
  } finally {
    liberar()
  }
  await modalLoading.getByText('Unidade testada').waitFor({ timeout: 10000 })
  await p.keyboard.press('Escape')
  await modalLoading.waitFor({ state: 'detached', timeout: 5000 })
  await p.unroute(rotaDetalhe, segurar)

  console.log('\nC8 — mensagem da API')
  await p.reload({ waitUntil: 'networkidle' })
  const mensagemErro = `Falha controlada da API ${prefixoFiltro}`
  const falhar = (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ erro: mensagemErro }),
    })
  await p.route(rotaDetalhe, falhar)
  await cardCobaia(p, cobaia.homologacaoId)
    .getByRole('button', { name: 'Exibir informações' })
    .click()
  const modalErro = p.getByRole('dialog').last()
  await modalErro.getByText(mensagemErro).waitFor({ timeout: 20000 })
  checar('Modal mostra a mensagem exata da API', await modalErro.getByText(mensagemErro).isVisible())
  await p.keyboard.press('Escape')
  await modalErro.waitFor({ state: 'detached', timeout: 5000 })
  await p.unroute(rotaDetalhe, falhar)

  console.log('\nC8 — Escape')
  await p.reload({ waitUntil: 'networkidle' })
  await cardCobaia(p, cobaia.homologacaoId)
    .getByRole('button', { name: 'Exibir informações' })
    .click()
  const modalEscape = p.getByRole('dialog').last()
  await modalEscape.getByText('Unidade testada').waitFor({ timeout: 10000 })
  await p.keyboard.press('Escape')
  await modalEscape.waitFor({ state: 'detached', timeout: 5000 })
  checar('Escape fecha o modal', (await p.getByRole('dialog').count()) === 0)
}

await mkdir(SAIDA, { recursive: true })
const navegadorFiltro = await chromium.launch(opcoesNavegador)
const paginaFiltro = await navegadorFiltro.newPage({ viewport: { width: 1600, height: 950 } })
paginaFiltro.on('pageerror', (erro) => erros.push(`pageerror: ${erro.message}`))

try {
  if (filtro === 'foto-revisao') await provarFotoRevisao(paginaFiltro)
  if (filtro === 'observacoes-admin') await provarObservacoesAdmin(paginaFiltro)
  if (filtro === 'estados-modal') await provarEstadosModal(paginaFiltro)
} catch (erro) {
  erros.push(`EXCEÇÃO: ${erro.stack ?? erro.message}`)
  await paginaFiltro.screenshot({ path: `${SAIDA}/ajustes-revisao-${filtro}-erro.png` }).catch(() => {})
} finally {
  await navegadorFiltro.close()
  await limparCobaiasFiltro().catch((erro) => erros.push(`Falha na limpeza do banco: ${erro.message}`))
  await restaurarParceiro().catch((erro) => erros.push(`Falha ao restaurar parceiro: ${erro.message}`))
  await prisma.$disconnect()
}

console.log('\n' + '='.repeat(60))
console.log(
  erros.length === 0
    ? `TUDO OK — filtro ${filtro}`
    : `${erros.length} PROBLEMA(S):\n  - ${erros.join('\n  - ')}`,
)
process.exit(erros.length ? 1 : 0)
