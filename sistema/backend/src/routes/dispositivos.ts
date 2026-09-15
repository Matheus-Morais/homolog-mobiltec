/**
 * CRUD de dispositivos
 * GET    /dispositivos          → lista (filtrável)
 * POST   /dispositivos          → cria
 * GET    /dispositivos/:id      → ficha completa
 * PATCH  /dispositivos/:id      → atualiza
 * DELETE /dispositivos/:id      → soft delete (ativo=false)
 */
import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { salvarFotoDispositivo } from '../lib/storage.js'

/**
 * `fotoUrl` aceita URL absoluta OU caminho servido por nós (`/uploads/...`).
 * Só `.url()` impediria a foto enviada pelo próprio sistema de ser gravada.
 */
const fotoUrlSchema = z
  .string()
  .refine(
    (v) => v.startsWith('/uploads/') || /^https?:\/\//.test(v),
    'Deve ser uma URL http(s) ou um caminho em /uploads/',
  )

const criarDispositivoSchema = z.object({
  categoriaId: z.string(),
  fabricante: z.string().default('Fabricante'),
  modelo: z.string().default('Modelo'),
  nomeComercial: z.string().default('Dispositivo'),
  fotoUrl: fotoUrlSchema.optional().nullable(),
  linkFabricante: z.string().optional().nullable(),
})

const TIPOS_IMAGEM: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
}

const dispositivoRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /dispositivos
  fastify.get('/dispositivos', {
    onRequest: [fastify.autenticar],
  }, async (request) => {
    const { categoriaId, fabricante, busca, ativo } = request.query as {
      categoriaId?: string
      fabricante?: string
      busca?: string
      ativo?: string
    }

    return fastify.prisma.dispositivo.findMany({
      where: {
        ativo: ativo === 'false' ? false : true,
        ...(categoriaId ? { categoriaId } : {}),
        ...(fabricante ? { fabricante: { contains: fabricante, mode: 'insensitive' } } : {}),
        ...(busca ? {
          OR: [
            { fabricante: { contains: busca, mode: 'insensitive' } },
            { modelo: { contains: busca, mode: 'insensitive' } },
            { nomeComercial: { contains: busca, mode: 'insensitive' } },
          ],
        } : {}),
      },
      include: {
        categoria: { select: { id: true, nome: true, slug: true, icone: true } },
        _count: { select: { homologacoes: true } },
      },
      orderBy: [{ fabricante: 'asc' }, { modelo: 'asc' }],
    })
  })

  // POST /dispositivos
  fastify.post('/dispositivos', {
    onRequest: [fastify.exigirPapeis(['ADMIN', 'HOMOLOGADOR'])],
  }, async (request, reply) => {
    const body = criarDispositivoSchema.parse(request.body)
    const fabricante = body.fabricante || 'Fabricante'
    const modelo = body.modelo || 'Modelo'
    const nomeComercial = body.nomeComercial || `${fabricante} ${modelo}`.trim() || 'Dispositivo'

    try {
      const dispositivo = await fastify.prisma.dispositivo.create({
        data: {
          categoriaId: body.categoriaId,
          fabricante,
          modelo,
          nomeComercial,
          fotoUrl: body.fotoUrl ?? null,
          linkFabricante: body.linkFabricante ?? null,
        },
        include: { categoria: true },
      })
      return reply.status(201).send(dispositivo)
    } catch (e: any) {
      fastify.log.error(e)
      if (e.code === 'P2002') {
        return reply.status(409).send({ erro: 'Já existe um dispositivo com esse fabricante e modelo.' })
      }
      if (e.code === 'P2003') {
        return reply.status(400).send({ erro: 'Categoria de dispositivo inválida ou inexistente.' })
      }
      return reply.status(400).send({
        erro: e?.message || 'Não foi possível cadastrar o dispositivo.',
      })
    }
  })

  // GET /dispositivos/fabricantes — lista de fabricantes distintos para filtros
  fastify.get('/dispositivos/fabricantes', {
    onRequest: [fastify.autenticar],
  }, async () => {
    const resultados = await fastify.prisma.dispositivo.findMany({
      select: { fabricante: true },
      distinct: ['fabricante'],
      orderBy: { fabricante: 'asc' },
    })
    return resultados.map(r => r.fabricante)
  })

  // GET /dispositivos/:id
  fastify.get('/dispositivos/:id', {
    onRequest: [fastify.autenticar],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const dispositivo = await fastify.prisma.dispositivo.findUnique({
      where: { id },
      include: {
        categoria: true,
        homologacoes: {
          include: {
            bateria: { select: { id: true, nome: true } },
            responsavel: { select: { id: true, nome: true, email: true } },
            _count: { select: { resultados: true } },
          },
          orderBy: { criadoEm: 'desc' },
        },
      },
    })

    if (!dispositivo) return reply.status(404).send({ erro: 'Dispositivo não encontrado' })
    return dispositivo
  })

  // PATCH /dispositivos/:id
  fastify.patch('/dispositivos/:id', {
    onRequest: [fastify.exigirPapeis(['ADMIN', 'HOMOLOGADOR', 'PARCEIRO'])],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = criarDispositivoSchema.partial().parse(request.body)

    if (request.user.papel === 'PARCEIRO' && 'fotoUrl' in body) {
      const homologacaoBloqueada = await fastify.prisma.homologacao.findFirst({
        where: {
          dispositivoId: id,
          OR: [
            { homologado: true },
            { status: { in: ['APROVADO', 'PUBLICADO', 'AGUARDANDO_ANALISE', 'EM_REVISAO'] } },
          ],
        },
      })

      if (homologacaoBloqueada) {
        return reply.status(403).send({
          erro: 'Parceiros não podem alterar a imagem de um dispositivo após a homologação ou validação.',
        })
      }
    }

    const { categoriaId, ...dadosAtualizacao } = body
    const dispositivo = await fastify.prisma.dispositivo.update({
      where: { id },
      data: {
        ...dadosAtualizacao,
        ...(categoriaId ? { categoria: { connect: { id: categoriaId } } } : {}),
      },
    })
    return dispositivo
  })

  // ============================================================
  // POST /dispositivos/:id/foto — upload da foto usada no certificado
  // ============================================================
  fastify.post('/dispositivos/:id/foto', {
    onRequest: [fastify.exigirPapeis(['ADMIN', 'HOMOLOGADOR', 'PARCEIRO'])],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }

    const dispositivo = await fastify.prisma.dispositivo.findUnique({ where: { id } })
    if (!dispositivo) return reply.status(404).send({ erro: 'Dispositivo não encontrado' })

    if (request.user.papel === 'PARCEIRO') {
      const homologacaoBloqueada = await fastify.prisma.homologacao.findFirst({
        where: {
          dispositivoId: id,
          OR: [
            { homologado: true },
            { status: { in: ['APROVADO', 'PUBLICADO', 'AGUARDANDO_ANALISE', 'EM_REVISAO'] } },
          ],
        },
      })

      if (homologacaoBloqueada) {
        return reply.status(403).send({
          erro: 'Parceiros não podem alterar a imagem de um dispositivo após a homologação ou validação.',
        })
      }
    }

    const arquivo = await request.file()
    if (!arquivo) return reply.status(400).send({ erro: 'Nenhum arquivo enviado.' })

    const extensao = TIPOS_IMAGEM[arquivo.mimetype]
    if (!extensao) {
      return reply.status(415).send({
        erro: `Formato não suportado: ${arquivo.mimetype}. Use PNG, JPEG ou WebP.`,
      })
    }

    let conteudo: Buffer
    try {
      conteudo = await arquivo.toBuffer()
    } catch {
      // O @fastify/multipart lança quando o arquivo estoura o limite configurado
      return reply.status(413).send({ erro: 'Arquivo muito grande. O limite é 8 MB.' })
    }

    const fotoUrl = await salvarFotoDispositivo(id, extensao, conteudo, arquivo.mimetype)

    return fastify.prisma.dispositivo.update({
      where: { id },
      data: { fotoUrl },
    })
  })

  // DELETE /dispositivos/:id (soft delete)
  fastify.delete('/dispositivos/:id', {
    onRequest: [fastify.exigirPapeis(['ADMIN', 'HOMOLOGADOR'])],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    await fastify.prisma.dispositivo.update({
      where: { id },
      data: { ativo: false },
    })
    return reply.status(204).send()
  })
}

export default dispositivoRoutes
