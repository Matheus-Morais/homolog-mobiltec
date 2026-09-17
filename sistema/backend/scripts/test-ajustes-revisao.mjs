/**
 * Provas próprias das duas decisões alteradas no fluxo de revisão.
 *
 * Os casos vêm de checks.md: seis estados × três vínculos para autorização
 * da foto e quatro combinações de justificativa/observação para o detalhe.
 */
import assert from 'node:assert/strict'

const filtros = new Set(['autorizacao-foto', 'detalhes-resultado'])
const indiceFiltro = process.argv.indexOf('--filter')
const filtro = indiceFiltro >= 0 ? process.argv[indiceFiltro + 1] : null

if (!filtro || !filtros.has(filtro)) {
  console.error(
    `Uso: node scripts/test-ajustes-revisao.mjs --filter <${[...filtros].join('|')}>`,
  )
  process.exit(2)
}

if (filtro === 'autorizacao-foto') {
  let parceiroPodeAlterarFoto
  try {
    ;({ parceiroPodeAlterarFoto } = await import('../dist/lib/autorizacao-foto.js'))
  } catch (erro) {
    throw new Error(
      'O helper compilado de autorização não existe. Execute `npm run build` no backend antes desta prova.',
      { cause: erro },
    )
  }

  const PARCEIRO_ID = 'parceiro-cobaia'
  const OUTRO_ID = 'outro-usuario'
  const estados = [
    'RASCUNHO',
    'EM_REVISAO',
    'AGUARDANDO_ANALISE',
    'APROVADO',
    'PUBLICADO',
    'REPROVADO',
  ]
  const vinculos = [
    {
      nome: 'responsavelId',
      montar: (status) => [{ status, responsavelId: PARCEIRO_ID, apoioId: null }],
    },
    {
      nome: 'apoioId',
      montar: (status) => [{ status, responsavelId: OUTRO_ID, apoioId: PARCEIRO_ID }],
    },
    {
      nome: 'não atribuído',
      montar: (status) => [{ status, responsavelId: OUTRO_ID, apoioId: null }],
    },
  ]

  let executados = 0
  for (const status of estados) {
    for (const vinculo of vinculos) {
      const esperado =
        (status === 'RASCUNHO' || status === 'EM_REVISAO') &&
        vinculo.nome !== 'não atribuído'
      const obtido = parceiroPodeAlterarFoto(vinculo.montar(status), PARCEIRO_ID)
      assert.equal(
        obtido,
        esperado,
        `${status} × ${vinculo.nome}: esperado ${esperado}, obtido ${obtido}`,
      )
      executados += 1
    }
  }

  assert.equal(
    parceiroPodeAlterarFoto(
      [
        { status: 'APROVADO', responsavelId: PARCEIRO_ID, apoioId: null },
        { status: 'EM_REVISAO', responsavelId: OUTRO_ID, apoioId: PARCEIRO_ID },
      ],
      PARCEIRO_ID,
    ),
    true,
    'Uma homologação histórica somente-leitura não pode bloquear outra revisão atribuída do dispositivo',
  )

  console.log(`✓ autorização de foto: ${executados} combinações (6 estados × 3 vínculos)`)
}

if (filtro === 'detalhes-resultado') {
  const { comporDetalhesResultado } = await import(
    '../../frontend/src/lib/detalhesResultado.ts'
  )

  const casos = [
    {
      nome: 'justificativa + observação',
      entrada: {
        justificativaTexto: 'Justificativa exata do caso misto',
        observacao: 'Observação exata do caso misto',
      },
      esperado: [
        { rotulo: 'Justificativa', texto: 'Justificativa exata do caso misto' },
        {
          rotulo: 'Observação da funcionalidade',
          texto: 'Observação exata do caso misto',
        },
      ],
    },
    {
      nome: 'apenas justificativa vinculada',
      entrada: {
        justificativa: { texto: 'Justificativa exata da biblioteca' },
        observacao: null,
      },
      esperado: [{ rotulo: 'Justificativa', texto: 'Justificativa exata da biblioteca' }],
    },
    {
      nome: 'apenas observação',
      entrada: {
        justificativaTexto: null,
        justificativa: null,
        observacao: 'Observação exata sem justificativa',
      },
      esperado: [
        {
          rotulo: 'Observação da funcionalidade',
          texto: 'Observação exata sem justificativa',
        },
      ],
    },
    {
      nome: 'nenhum detalhe',
      entrada: { justificativaTexto: '', justificativa: { texto: '' }, observacao: '' },
      esperado: [],
    },
  ]

  for (const caso of casos) {
    assert.deepEqual(
      comporDetalhesResultado(caso.entrada),
      caso.esperado,
      `Composição incorreta para ${caso.nome}`,
    )
  }

  console.log(`✓ detalhes do resultado: ${casos.length} combinações com labels e textos exatos`)
}
