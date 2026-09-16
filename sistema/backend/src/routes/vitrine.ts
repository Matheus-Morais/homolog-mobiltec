/**
 * Vitrine — a visão que o parceiro/cliente vê dos dispositivos homologados.
 *
 * GET /vitrine   → catálogo de modelos, um card por dispositivo
 *
 * Hoje a tela mora dentro do sistema (atrás do login), mas o formato já é o
 * do portal externo: nada de rascunho de teste, só o que dá para publicar —
 * modelo, versão do agente, Android e o veredito. O andamento de quem ainda
 * está em homologação vai num bloco separado, sem expor resultado item a item.
 */
import { FastifyPluginAsync } from 'fastify'
import { StatusResultado } from '@prisma/client'

/** Divergência é o que a spec §5 define — NAO_APLICAVEL não entra */
const EXIGE_JUSTIFICATIVA: StatusResultado[] = [
  StatusResultado.FALHA,
  StatusResultado.NAO_SUPORTADO,
  StatusResultado.COM_RESSALVA,
]

const vitrineRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/vitrine', { onRequest: [fastify.autenticar] }, async (request) => {
    const categorias = await fastify.prisma.categoria.findMany({
      where: { ativo: true },
      orderBy: { ordem: 'asc' },
      select: { id: true, nome: true, slug: true, icone: true },
    })

    const ehParceiro = request.user.papel === 'PARCEIRO'
    let empresaParceiro: string | null = null
    if (ehParceiro) {
      const usuarioParceiro = await fastify.prisma.usuario.findUnique({
        where: { id: request.user.id },
        select: { empresa: true },
      })
      empresaParceiro = usuarioParceiro?.empresa?.trim() ?? null
    }

    // Painel Principal (Vitrine Geral Mobiltec):
    // 1. Modelos já aprovados ou publicados são visíveis para todos.
    // 2. Modelos em andamento no ambiente Mobiltec (empresa Mobiltec ou null) são visíveis
    //    para todos os usuários (incluindo parceiros) como visão geral do que está sendo homologado.
    // 3. Se for parceiro com empresa externa, visualiza adicionalmente seus próprios dispositivos em teste.
    const condicaoMobiltecAndamento = {
      status: { in: ['RASCUNHO', 'AGUARDANDO_ANALISE', 'EM_REVISAO', 'REPROVADO'] },
      AND: [
        {
          OR: [
            { dispositivo: { empresa: null } },
            { dispositivo: { empresa: { equals: 'Mobiltec', mode: 'insensitive' } } },
          ],
        },
        {
          OR: [
            { responsavel: { empresa: null } },
            { responsavel: { empresa: { equals: 'Mobiltec', mode: 'insensitive' } } },
          ],
        },
      ],
    }

    const whereHomologacao: any = {
      dispositivo: { ativo: true, categoria: { ativo: true } },
      OR: [
        { status: { in: ['APROVADO', 'PUBLICADO'] } },
        condicaoMobiltecAndamento,
        ...(ehParceiro && empresaParceiro && empresaParceiro.toLowerCase() !== 'mobiltec'
          ? [
              {
                status: { in: ['RASCUNHO', 'AGUARDANDO_ANALISE', 'EM_REVISAO', 'REPROVADO'] },
                dispositivo: { empresa: { equals: empresaParceiro, mode: 'insensitive' } },
              },
              {
                status: { in: ['RASCUNHO', 'AGUARDANDO_ANALISE', 'EM_REVISAO', 'REPROVADO'] },
                responsavel: { empresa: { equals: empresaParceiro, mode: 'insensitive' } },
              },
              {
                status: { in: ['RASCUNHO', 'AGUARDANDO_ANALISE', 'EM_REVISAO', 'REPROVADO'] },
                responsavelId: request.user.id,
              },
            ]
          : []),
      ],
    }

    const homologacoes = await fastify.prisma.homologacao.findMany({
      where: whereHomologacao,
      include: {
        dispositivo: { include: { categoria: { select: { nome: true, slug: true } } } },
        responsavel: { select: { nome: true } },
        resultados: { select: { status: true, justificativaId: true, justificativaTexto: true } },
      },
      orderBy: { criadoEm: 'desc' },
    })

    // Uma linha por modelo: a homologação mais recente é a que vale.
    // As anteriores viram só a contagem de retestes.
    const porDispositivo = new Map<string, typeof homologacoes>()
    for (const h of homologacoes) {
      const lista = porDispositivo.get(h.dispositivoId) ?? []
      lista.push(h)
      porDispositivo.set(h.dispositivoId, lista)
    }

    const dispositivos = [...porDispositivo.values()]
      .map(([atual, ...anteriores]) => {
        const resumo = {
          total: atual.resultados.length,
          ok: 0,
          divergencias: 0,
          semJustificativa: 0,
          naoAplicavel: 0,
          naoTestado: 0,
        }
        for (const r of atual.resultados) {
          if (r.status === StatusResultado.OK) resumo.ok++
          else if (r.status === StatusResultado.NAO_APLICAVEL) resumo.naoAplicavel++
          else if (r.status === StatusResultado.NAO_TESTADO) resumo.naoTestado++
          if (EXIGE_JUSTIFICATIVA.includes(r.status)) {
            resumo.divergencias++
            if (!r.justificativaId && !r.justificativaTexto) resumo.semJustificativa++
          }
        }

        return {
          dispositivoId: atual.dispositivoId,
          homologacaoId: atual.id,
          fabricante: atual.dispositivo.fabricante,
          modelo: atual.dispositivo.modelo,
          nomeComercial: atual.dispositivo.nomeComercial,
          fotoUrl: atual.dispositivo.fotoUrl,
          linkFabricante: atual.dispositivo.linkFabricante,
          categoriaNome: atual.dispositivo.categoria.nome,
          categoriaSlug: atual.dispositivo.categoria.slug,
          versaoSo: atual.versaoSo,
          versaoAgente: atual.versaoAgente,
          versaoPos: atual.versaoPos,
          gerenciamento: atual.gerenciamento,
          tipoAgente: atual.tipoAgente,
          status: atual.status,
          homologado: atual.homologado,
          dataInicio: atual.dataInicio,
          dataFim: atual.dataFim,
          responsavel: atual.responsavel.nome,
          numeroHomologacao: anteriores.length + 1,
          versoesAnteriores: anteriores.map(h => h.versaoAgente),
          resumo: {
            ...resumo,
            // Avaliado = tudo que saiu de NAO_TESTADO. É o progresso que a
            // vitrine mostra para quem ainda está em homologação.
            avaliados: resumo.total - resumo.naoTestado,
          },
        }
      })
      .sort((a, b) => a.nomeComercial.localeCompare(b.nomeComercial, 'pt-BR'))

    return { categorias, dispositivos }
  })
}

export default vitrineRoutes
