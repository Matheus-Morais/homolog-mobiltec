/**
 * Ciclo de revisão: Admin devolve → parceiro ajusta → reenvia → Admin aprova.
 *
 * Cobre as decisões D432–D437 de ponta a ponta, nas duas telas e com os dois
 * papéis. A cobaia é criada e apagada por este roteiro (D398): nada do que ele
 * cria sobrevive à execução, com ou sem falha.
 */
import { chromium } from 'playwright'
import { PrismaClient } from '@prisma/client'

const BASE = 'http://localhost:8080'
const SAIDA = new URL('../.verificacao/', import.meta.url).pathname.replace(/^\//, '')
const erros = []
const marca = Date.now().toString().slice(-6)
const MODELO = `RV-${marca}`

const ADMIN = { email: 'admin@mobiltec.com.br', senha: 'admin123' }
const PARCEIRO = { email: 'parceiro@fabricante.com', senha: 'admin123' }

const prisma = new PrismaClient()

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

await limpar()
const { homologacaoId } = await criarCobaia()
console.log(`Cobaia criada: ${MODELO} (homologação ${homologacaoId})\n`)

const nav = await chromium.launch()
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
