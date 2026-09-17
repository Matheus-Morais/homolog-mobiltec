/**
 * Rotas de categorias, itens de teste, baterias e justificativas
 */
import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { StatusResultado } from '@prisma/client'

const catalogoRoutes: FastifyPluginAsync = async (fastify) => {
  // ============================================================
  // CATEGORIAS
  // ============================================================
  fastify.get('/categorias', { onRequest: [fastify.autenticar] }, async (request) => {
    // Por padrão só as que estão em operação — é o que monta o menu.
    const { todas } = request.query as { todas?: string }
    return fastify.prisma.categoria.findMany({
      where: todas === 'true' ? {} : { ativo: true },
      orderBy: { ordem: 'asc' },
      include: {
        _count: { select: { dispositivos: { where: { ativo: true } } } },
      },
    })
  })

  // ============================================================
  // ITENS DE TESTE
  // ============================================================
  fastify.get('/itens-teste', { onRequest: [fastify.autenticar] }, async (request) => {
    const { grupo, ativo } = request.query as { grupo?: string; ativo?: string }
    return fastify.prisma.itemTeste.findMany({
      where: {
        ativo: ativo === 'false' ? false : true,
        ...(grupo ? { grupo: grupo as any } : {}),
      },
      orderBy: [{ grupo: 'asc' }, { ordem: 'asc' }],
    })
  })

  fastify.post('/itens-teste', { onRequest: [fastify.exigirPapeis(['ADMIN', 'HOMOLOGADOR'])] }, async (request, reply) => {
    const schema = z.object({
      grupo: z.enum(['TELEMETRIA', 'COLETA', 'COMANDOS', 'PERFIS']),
      nome: z.string().min(1).max(200),
      descricaoAcao: z.string().min(1).max(500),
      ordem: z.number().int().default(0),
    })
    const body = schema.parse(request.body)
    const item = await fastify.prisma.itemTeste.create({ data: body })
    return reply.status(201).send(item)
  })

  fastify.patch('/itens-teste/:id', { onRequest: [fastify.exigirPapeis(['ADMIN', 'HOMOLOGADOR'])] }, async (request) => {
    const { id } = request.params as { id: string }
    const schema = z.object({
      nome: z.string().min(1).max(200).optional(),
      descricaoAcao: z.string().min(1).max(500).optional(),
      ordem: z.number().int().optional(),
      ativo: z.boolean().optional(),
    })
    const body = schema.parse(request.body)
    // REGRA: nunca deletar item; só desativar via ativo=false
    return fastify.prisma.itemTeste.update({ where: { id }, data: body })
  })

  // ============================================================
  // BATERIAS DE TESTE
  // ============================================================
  fastify.get('/baterias', { onRequest: [fastify.autenticar] }, async (request) => {
    const { categoriaId } = request.query as { categoriaId?: string }
    return fastify.prisma.bateriaTeste.findMany({
      where: {
        ativo: true,
        ...(categoriaId ? { categoriaId } : {}),
      },
      include: {
        categoria: { select: { nome: true, slug: true } },
        itens: {
          include: { item: true },
          orderBy: { ordem: 'asc' },
        },
        _count: { select: { itens: true } },
      },
    })
  })

  fastify.get('/baterias/:id', { onRequest: [fastify.autenticar] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const bateria = await fastify.prisma.bateriaTeste.findUnique({
      where: { id },
      include: {
        categoria: true,
        itens: {
          include: { item: true },
          orderBy: [{ item: { grupo: 'asc' } }, { ordem: 'asc' }],
        },
      },
    })
    if (!bateria) return reply.status(404).send({ erro: 'Bateria não encontrada' })
    return bateria
  })

  fastify.post('/baterias', { onRequest: [fastify.exigirPapeis(['ADMIN', 'HOMOLOGADOR'])] }, async (request, reply) => {
    const schema = z.object({
      categoriaId: z.string().uuid(),
      nome: z.string().min(1),
      descricao: z.string().optional(),
      itens: z.array(z.object({
        itemId: z.string().uuid(),
        ordem: z.number().int().default(0),
        obrigatorio: z.boolean().default(true),
      })),
    })
    const body = schema.parse(request.body)
    const { itens, ...dadosBateria } = body
    const bateria = await fastify.prisma.bateriaTeste.create({
      data: {
        ...dadosBateria,
        itens: {
          create: itens.map(i => ({
            itemId: i.itemId,
            ordem: i.ordem,
            obrigatorio: i.obrigatorio,
          })),
        },
      },
      include: { itens: { include: { item: true } } },
    })
    return reply.status(201).send(bateria)
  })

  fastify.patch('/baterias/:id', { onRequest: [fastify.exigirPapeis(['ADMIN', 'HOMOLOGADOR'])] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const schema = z.object({
      nome: z.string().min(1).optional(),
      descricao: z.string().optional(),
      ativo: z.boolean().optional(),
      itens: z.array(z.object({
        itemId: z.string().uuid(),
        ordem: z.number().int().min(0),
        obrigatorio: z.boolean().default(true),
      })).optional(),
    })
    const body = schema.parse(request.body)
    const { itens, ...dadosBateria } = body

    return await fastify.prisma.$transaction(async (tx) => {
      if (Object.keys(dadosBateria).length > 0) {
        await tx.bateriaTeste.update({ where: { id }, data: dadosBateria })
      }

      if (itens) {
        const atuais = await tx.bateriaItem.findMany({
          where: { bateriaId: id },
          select: { itemId: true },
        })
        const idsAtuais = atuais.map((i) => i.itemId)
        const idsNovos = itens.map((i) => i.itemId)

        const entrando = idsNovos.filter((i) => !idsAtuais.includes(i))
        const saindo = idsAtuais.filter((i) => !idsNovos.includes(i))

        if (saindo.length) {
          await tx.bateriaItem.deleteMany({
            where: { bateriaId: id, itemId: { in: saindo } },
          })
        }

        for (const i of itens) {
          if (entrando.includes(i.itemId)) {
            await tx.bateriaItem.create({
              data: { bateriaId: id, itemId: i.itemId, ordem: i.ordem, obrigatorio: i.obrigatorio },
            })
          } else {
            await tx.bateriaItem.update({
              where: { bateriaId_itemId: { bateriaId: id, itemId: i.itemId } },
              data: { ordem: i.ordem, obrigatorio: i.obrigatorio },
            })
          }
        }

        const abertas = await tx.homologacao.findMany({
          where: { bateriaId: id, status: { in: ['RASCUNHO', 'EM_REVISAO'] } },
          select: { id: true },
        })
        const idsAbertas = abertas.map((h) => h.id)

        if (idsAbertas.length) {
          if (entrando.length) {
            await tx.resultado.createMany({
              data: idsAbertas.flatMap((homologacaoId) =>
                entrando.map((itemId) => ({ homologacaoId, itemId, status: StatusResultado.NAO_TESTADO }))
              ),
              skipDuplicates: true,
            })
          }

          if (saindo.length) {
            const avaliados = await tx.resultado.findMany({
              where: {
                homologacaoId: { in: idsAbertas },
                itemId: { in: saindo },
                OR: [
                  { status: { not: StatusResultado.NAO_TESTADO } },
                  { NOT: { observacao: null } },
                  { NOT: { justificativaId: null } },
                  { NOT: { justificativaTexto: null } },
                ],
              },
              select: { id: true },
            })
            const protegidos = new Set(avaliados.map((r) => r.id))

            await tx.resultado.deleteMany({
              where: {
                homologacaoId: { in: idsAbertas },
                itemId: { in: saindo },
                id: { notIn: [...protegidos] },
              },
            })
          }
        }
      }

      return tx.bateriaTeste.findUnique({
        where: { id },
        include: {
          categoria: true,
          itens: {
            include: { item: true },
            orderBy: [{ item: { grupo: 'asc' } }, { ordem: 'asc' }],
          },
        },
      })
    })
  })

  fastify.patch('/baterias/:id/ordem', { onRequest: [fastify.exigirPapeis(['ADMIN', 'HOMOLOGADOR'])] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const schema = z.object({
      itens: z.array(z.object({
        itemId: z.string().uuid(),
        ordem: z.number().int().min(0),
      })).min(1),
    })
    const body = schema.parse(request.body)

    const bateria = await fastify.prisma.bateriaTeste.findUnique({ where: { id } })
    if (!bateria) return reply.status(404).send({ erro: 'Bateria não encontrada' })

    await fastify.prisma.$transaction(
      body.itens.map((i) =>
        fastify.prisma.bateriaItem.update({
          where: { bateriaId_itemId: { bateriaId: id, itemId: i.itemId } },
          data: { ordem: i.ordem },
        })
      )
    )
    return { ok: true, atualizados: body.itens.length }
  })

  fastify.delete('/baterias/:id', { onRequest: [fastify.exigirPapeis(['ADMIN', 'HOMOLOGADOR'])] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    
    const bateria = await fastify.prisma.bateriaTeste.findUnique({
      where: { id },
      include: { _count: { select: { homologacoes: true } } },
    })
    
    if (!bateria) return reply.status(404).send({ erro: 'Bateria não encontrada' })
    
    if (bateria._count.homologacoes > 0) {
      return reply.status(409).send({
        erro: `Esta bateria possui ${bateria._count.homologacoes} homologação(ões) vinculada(s). Desative-a em vez de apagar.`,
        homologacoes: bateria._count.homologacoes,
      })
    }

    await fastify.prisma.$transaction([
      fastify.prisma.bateriaItem.deleteMany({ where: { bateriaId: id } }),
      fastify.prisma.bateriaTeste.delete({ where: { id } }),
    ])

    return reply.status(204).send()
  })

  // ============================================================
  // JUSTIFICATIVAS
  // ============================================================
  fastify.get('/justificativas', { onRequest: [fastify.autenticar] }, async (request) => {
    const { itemId, gerenciamento, androidMin } = request.query as {
      itemId?: string
      gerenciamento?: string
      androidMin?: string
    }

    const justificativas = await fastify.prisma.justificativa.findMany({
      where: { ativo: true },
      orderBy: [{ usoCount: 'desc' }, { titulo: 'asc' }],
    })

    // Filtragem por sugestão (feita em memória pois itensSugeridos é array)
    if (itemId || gerenciamento || androidMin) {
      const androidMinNum = androidMin ? parseInt(androidMin) : null
      return justificativas.filter(j => {
        const matchItem = !itemId || j.itensSugeridos.includes(itemId)
        const matchGerenciamento = !gerenciamento || !j.gerenciamento || j.gerenciamento === gerenciamento
        const matchAndroid = !androidMinNum || !j.androidMin || j.androidMin <= androidMinNum
        return matchItem && matchGerenciamento && matchAndroid
      })
    }

    return justificativas
  })

  fastify.post('/justificativas', { onRequest: [fastify.exigirPapeis(['ADMIN', 'HOMOLOGADOR'])] }, async (request, reply) => {
    const schema = z.object({
      titulo: z.string().min(1),
      texto: z.string().min(1),
      fontes: z.array(z.object({ label: z.string(), url: z.string() })).default([]),
      itensSugeridos: z.array(z.string().uuid()).default([]),
      androidMin: z.number().int().optional().nullable(),
      gerenciamento: z.enum(['ANDROID_LEGADO', 'ANDROID_ENTERPRISE']).optional().nullable(),
    })
    const body = schema.parse(request.body)
    const j = await fastify.prisma.justificativa.create({ data: body as any })
    return reply.status(201).send(j)
  })

  fastify.patch('/justificativas/:id', { onRequest: [fastify.exigirPapeis(['ADMIN', 'HOMOLOGADOR'])] }, async (request) => {
    const { id } = request.params as { id: string }
    const schema = z.object({
      titulo: z.string().optional(),
      texto: z.string().optional(),
      fontes: z.array(z.object({ label: z.string(), url: z.string() })).optional(),
      itensSugeridos: z.array(z.string().uuid()).optional(),
      androidMin: z.number().int().optional().nullable(),
      gerenciamento: z.enum(['ANDROID_LEGADO', 'ANDROID_ENTERPRISE']).optional().nullable(),
      ativo: z.boolean().optional(),
    })
    const body = schema.parse(request.body)
    return fastify.prisma.justificativa.update({ where: { id }, data: body as any })
  })

  // ============================================================
  // USUÁRIOS (admin only)
  // ============================================================
  fastify.get('/usuarios', { onRequest: [fastify.autenticar] }, async (request, reply) => {
    if (request.user.papel !== 'ADMIN') {
      return reply.status(403).send({ erro: 'Acesso restrito a administradores' })
    }
    return fastify.prisma.usuario.findMany({
      select: { id: true, nome: true, email: true, cargo: true, papel: true, ativo: true, criadoEm: true },
      orderBy: { nome: 'asc' },
    })
  })
}

export default catalogoRoutes
