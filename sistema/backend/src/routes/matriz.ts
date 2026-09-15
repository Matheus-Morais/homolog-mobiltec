/**
 * Matriz comparativa (spec §10.5) — a "planilha" web.
 *
 * GET  /matriz?categoriaSlug=pos   → linhas = itens de teste, colunas = modelos
 * POST /matriz/modelo              → cadastra modelo + abre a homologação de uma vez
 *
 * Cada coluna é um MODELO, mostrando a homologação mais recente dele. Retestes
 * antigos continuam no banco e aparecem em `homologacoesAnteriores` — a spec
 * §11.2 é clara que reteste nunca sobrescreve, o histórico por versão de agente
 * é informação de valor.
 */
import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { StatusHomologacao, StatusResultado } from '@prisma/client'

const matrizRoutes: FastifyPluginAsync = async (fastify) => {

  // ============================================================
  // GET /matriz
  // ============================================================
  fastify.get('/matriz', { onRequest: [fastify.autenticar] }, async (request, reply) => {
    const { categoriaSlug = 'pos' } = request.query as { categoriaSlug?: string }

    const categoria = await fastify.prisma.categoria.findUnique({
      where: { slug: categoriaSlug },
    })
    if (!categoria) return reply.status(404).send({ erro: 'Categoria não encontrada' })

    const ehParceiro = request.user.papel === 'PARCEIRO'
    let usuarioParceiro: { empresa: string | null; categoriasPermitidas: string[] } | null = null

    if (ehParceiro) {
      usuarioParceiro = await fastify.prisma.usuario.findUnique({
        where: { id: request.user.id },
        select: { empresa: true, categoriasPermitidas: true },
      })

      if (!usuarioParceiro?.categoriasPermitidas.includes(categoriaSlug)) {
        return reply.status(403).send({ erro: 'Acesso não permitido a esta categoria de dispositivo' })
      }
    }

    const whereHomologacao: any = {
      dispositivo: { categoriaId: categoria.id, ativo: true },
    }

    // Exceção solicitada: hgomes@tnsi.com recebe a mesma planilha de POS completa do admin
    const ehExcecaoHgomesPos =
      ehParceiro &&
      request.user.email?.toLowerCase() === 'hgomes@tnsi.com' &&
      categoriaSlug === 'pos'

    if (ehParceiro && !ehExcecaoHgomesPos) {
      const empresa = usuarioParceiro?.empresa
      if (empresa) {
        whereHomologacao.OR = [
          { dispositivo: { empresa } },
          { responsavel: { empresa } },
          { responsavelId: request.user.id },
        ]
      } else {
        whereHomologacao.responsavelId = request.user.id
      }
    }

    const homologacoes = await fastify.prisma.homologacao.findMany({
      where: whereHomologacao,
      include: {
        dispositivo: true,
        bateria: { select: { id: true, nome: true } },
        responsavel: { select: { id: true, nome: true } },
        resultados: {
          select: {
            id: true,
            itemId: true,
            status: true,
            observacao: true,
            justificativaId: true,
            justificativaTexto: true,
            justificativa: { select: { id: true, titulo: true, texto: true } },
          },
        },
        _count: { select: { certificados: true } },
        // Só o último envio para revisão, e só o que a coluna precisa: o
        // apontamento que o parceiro tem de atender (D435). `take: 1` mantém
        // a planilha leve — o histórico completo sai em GET /homologacoes/:id.
        historicoStatus: {
          where: { statusNovo: StatusHomologacao.EM_REVISAO },
          orderBy: { criadoEm: 'desc' },
          take: 1,
          select: {
            motivo: true,
            criadoEm: true,
            usuario: { select: { nome: true } },
          },
        },
      },
      orderBy: { criadoEm: 'desc' },
    })

    // Agrupa por modelo: a primeira de cada dispositivo é a mais recente
    // (findMany já veio ordenado por criadoEm desc).
    const porDispositivo = new Map<string, typeof homologacoes>()
    for (const h of homologacoes) {
      const lista = porDispositivo.get(h.dispositivoId) ?? []
      lista.push(h)
      porDispositivo.set(h.dispositivoId, lista)
    }

    const colunas = [...porDispositivo.values()]
      .map(([atual, ...anteriores]) => ({
        homologacao: {
          ...atual,
          // O mapa itemId → resultado economiza busca linear no front.
          resultadosPorItem: Object.fromEntries(
            atual.resultados.map(r => [r.itemId, r]),
          ),
        },
        // Fora do objeto `homologacao` de propósito: não é campo do registro,
        // é o apontamento em aberto. Só existe enquanto o status for
        // EM_REVISAO — depois que o parceiro reenvia, o aviso some da tela
        // junto com o motivo que o gerou.
        revisaoPendente:
          atual.status === StatusHomologacao.EM_REVISAO && atual.historicoStatus[0]
            ? {
                motivo: atual.historicoStatus[0].motivo,
                solicitadoEm: atual.historicoStatus[0].criadoEm,
                solicitadoPor: atual.historicoStatus[0].usuario?.nome ?? null,
              }
            : null,
        homologacoesAnteriores: anteriores.map(h => ({
          id: h.id,
          versaoAgente: h.versaoAgente,
          versaoSo: h.versaoSo,
          dataInicio: h.dataInicio,
          status: h.status,
          homologado: h.homologado,
        })),
      }))
      .sort((a, b) =>
        a.homologacao.dispositivo.nomeComercial.localeCompare(
          b.homologacao.dispositivo.nomeComercial,
          'pt-BR',
        ),
      )

    // Linhas: os itens das baterias DESTE tipo de dispositivo, e só eles.
    //
    // Antes entrava também todo item com resultado gravado, para não esconder
    // avaliação já feita. O efeito prático foi o contrário do pretendido:
    // desmarcar um item na edição do tipo não tirava a linha da planilha,
    // porque o item já tinha resultado nas colunas — e a tela ficava
    // impossível de limpar. Agora a bateria manda, e a planilha responde na
    // hora ao que foi configurado.
    //
    // Nada é apagado: os resultados continuam no banco e a linha volta
    // inteira, com o que já estava preenchido, assim que o item é remarcado.
    // Homologação já aprovada guarda o que foi atestado no certificado
    // emitido, que é arquivo e não muda.
    const daCategoria = await fastify.prisma.bateriaItem.findMany({
      where: { bateria: { categoriaId: categoria.id } },
      select: { itemId: true },
    })
    const idsDaBateria = [...new Set(daCategoria.map(b => b.itemId))]
    const itens = await fastify.prisma.itemTeste.findMany({
      where: { id: { in: idsDaBateria } },
      orderBy: [{ grupo: 'asc' }, { ordem: 'asc' }],
    })

    // Os resultados acompanham as linhas: se sobrasse resultado de item fora
    // da bateria, ele contaria no medidor de divergências e no checklist de
    // finalizar sem ter linha onde ser resolvido.
    const naBateria = new Set(idsDaBateria)
    for (const c of colunas) {
      c.homologacao.resultados = c.homologacao.resultados.filter(r => naBateria.has(r.itemId))
      c.homologacao.resultadosPorItem = Object.fromEntries(
        c.homologacao.resultados.map(r => [r.itemId, r]),
      )
    }

    return { categoria, itens, colunas }
  })

  // ============================================================
  // POST /matriz/modelo — nova coluna na planilha
  // ============================================================
  fastify.post('/matriz/modelo', { onRequest: [fastify.exigirPapeis(['ADMIN', 'HOMOLOGADOR', 'PARCEIRO'])] }, async (request, reply) => {
    const schema = z.object({
      categoriaId: z.string().uuid(),
      // Dispositivo
      fabricante: z.string().min(1).max(100),
      modelo: z.string().min(1).max(100),
      nomeComercial: z.string().min(1).max(200),
      linkFabricante: z.string().url().optional().nullable(),
      // Homologação inicial
      bateriaId: z.string().uuid(),
      numeroSerie: z.string().min(1),
      imei1: z.string().optional().nullable(),
      imei2: z.string().optional().nullable(),
      versaoSo: z.string().min(1),
      gerenciamento: z.enum(['ANDROID_LEGADO', 'ANDROID_ENTERPRISE']),
      tipoAgente: z.string().min(1),
      versaoAgente: z.string().min(1),
      versaoPos: z.string().optional().nullable(),
      ferramenta: z.string().optional().nullable(),
      metodoInscricao: z.string().min(1),
      assinaturaAgente: z.boolean().default(false),
      precisaAssinaturaDev: z.boolean().default(false),
      dataInicio: z.string().transform(s => new Date(s)),
    })

    const body = schema.parse(request.body)
    const { categoriaId, fabricante, modelo, nomeComercial, linkFabricante, ...dadosHomologacao } = body

    const bateria = await fastify.prisma.bateriaTeste.findUnique({
      where: { id: body.bateriaId },
      include: { itens: { select: { itemId: true } } },
    })
    if (!bateria) return reply.status(404).send({ erro: 'Bateria não encontrada' })
    if (!bateria.ativo) return reply.status(400).send({ erro: 'Bateria inativa' })

    let empresaDispositivo: string | null = null
    if (request.user.papel === 'PARCEIRO') {
      const u = await fastify.prisma.usuario.findUnique({
        where: { id: request.user.id },
        select: { empresa: true, categoriasPermitidas: true },
      })
      const cat = await fastify.prisma.categoria.findUnique({
        where: { id: categoriaId },
        select: { slug: true },
      })
      if (!cat || !u?.categoriasPermitidas.includes(cat.slug)) {
        return reply.status(403).send({ erro: 'Acesso não permitido a esta categoria de dispositivo' })
      }
      empresaDispositivo = u.empresa
    }

    // Dispositivo e homologação nascem juntos: uma coluna da planilha sem
    // homologação não significa nada, e um dispositivo órfão sujaria a lista.
    try {
      const dispositivo = await fastify.prisma.dispositivo.create({
        data: {
          categoriaId,
          fabricante,
          modelo,
          nomeComercial,
          linkFabricante,
          empresa: empresaDispositivo,
          homologacoes: {
            create: {
              ...dadosHomologacao,
              responsavelId: request.user.id,
              status: StatusHomologacao.RASCUNHO,
              resultados: {
                create: bateria.itens.map(bi => ({
                  itemId: bi.itemId,
                  status: StatusResultado.NAO_TESTADO,
                })),
              },
            },
          },
        },
        include: {
          homologacoes: {
            include: { resultados: { select: { id: true, itemId: true, status: true } } },
          },
        },
      })

      return reply.status(201).send(dispositivo)
    } catch (e: any) {
      if (e.code === 'P2002') {
        return reply.status(409).send({
          erro: `Já existe um dispositivo ${fabricante} ${modelo}. Para um novo teste do mesmo modelo, abra um reteste em vez de cadastrar de novo.`,
        })
      }
      throw e
    }
  })

  // ============================================================
  // POST /matriz/reteste — nova homologação para um modelo já cadastrado
  // ============================================================
  fastify.post('/matriz/reteste', { onRequest: [fastify.exigirPapeis(['ADMIN', 'HOMOLOGADOR', 'PARCEIRO'])] }, async (request, reply) => {
    const schema = z.object({
      dispositivoId: z.string().uuid(),
      /** Copia a ficha da homologação anterior, mudando só o que veio no corpo */
      baseHomologacaoId: z.string().uuid(),
      versaoAgente: z.string().min(1),
      versaoSo: z.string().min(1).optional(),
      numeroSerie: z.string().min(1).optional(),
      dataInicio: z.string().transform(s => new Date(s)),
    })

    const body = schema.parse(request.body)

    const base = await fastify.prisma.homologacao.findUnique({
      where: { id: body.baseHomologacaoId },
      include: { bateria: { include: { itens: { select: { itemId: true } } } } },
    })
    if (!base) return reply.status(404).send({ erro: 'Homologação base não encontrada' })

    const nova = await fastify.prisma.homologacao.create({
      data: {
        dispositivoId: body.dispositivoId,
        bateriaId: base.bateriaId,
        numeroSerie: body.numeroSerie ?? base.numeroSerie,
        imei1: base.imei1,
        imei2: base.imei2,
        versaoSo: body.versaoSo ?? base.versaoSo,
        gerenciamento: base.gerenciamento,
        tipoAgente: base.tipoAgente,
        versaoAgente: body.versaoAgente,
        versaoPos: base.versaoPos,
        ferramenta: base.ferramenta,
        metodoInscricao: base.metodoInscricao,
        assinaturaAgente: base.assinaturaAgente,
        precisaAssinaturaDev: base.precisaAssinaturaDev,
        dataInicio: body.dataInicio,
        responsavelId: request.user.id,
        localEmissao: base.localEmissao,
        status: StatusHomologacao.RASCUNHO,
        resultados: {
          create: base.bateria.itens.map(bi => ({
            itemId: bi.itemId,
            status: StatusResultado.NAO_TESTADO,
          })),
        },
      },
    })

    return reply.status(201).send(nova)
  })
}

export default matrizRoutes
