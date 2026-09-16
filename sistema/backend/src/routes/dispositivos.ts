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
import { parceiroPodeAlterarFoto } from '../lib/autorizacao-foto.js'
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
  categoriaId: z.string().uuid(),
  fabricante: z.string().min(1).max(100),
  modelo: z.string().min(1).max(100),
  nomeComercial: z.string().min(1).max(200),
  fotoUrl: fotoUrlSchema.optional().nullable(),
  linkFabricante: z.string().url().optional().nullable(),
})

const TIPOS_IMAGEM: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
}

const VINCULO_FOTO_SELECT = {
  status: true,
  responsavelId: true,
  apoioId: true,
} as const

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

    try {
      const dispositivo = await fastify.prisma.dispositivo.create({
        data: body,
        include: { categoria: true },
      })
      return reply.status(201).send(dispositivo)
    } catch (e: any) {
      if (e.code === 'P2002') {
        return reply.status(409).send({ erro: 'Já existe um dispositivo com esse fabricante e modelo.' })
      }
      throw e
    }
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
          orderBy: { criadoEm: 'desc' },
          include: {
            responsavel: { select: { nome: true } },
            bateria: { select: { nome: true } },
          },
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
      const dispositivo = await fastify.prisma.dispositivo.findUnique({
        where: { id },
        select: { id: true },
      })
      if (!dispositivo) return reply.status(404).send({ erro: 'Dispositivo não encontrado' })

      const homologacoes = await fastify.prisma.homologacao.findMany({
        where: { dispositivoId: id },
        select: VINCULO_FOTO_SELECT,
      })

      if (!parceiroPodeAlterarFoto(homologacoes, request.user.id)) {
        return reply.status(403).send({
          erro: 'Parceiros só podem alterar a foto de dispositivos com homologação atribuída em rascunho ou revisão.',
        })
      }
    }

    const dispositivo = await fastify.prisma.dispositivo.update({
      where: { id },
      data: body,
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
      const homologacoes = await fastify.prisma.homologacao.findMany({
        where: { dispositivoId: id },
        select: VINCULO_FOTO_SELECT,
      })

      if (!parceiroPodeAlterarFoto(homologacoes, request.user.id)) {
        return reply.status(403).send({
          erro: 'Parceiros só podem alterar a foto de dispositivos com homologação atribuída em rascunho ou revisão.',
        })
      }
    }

    let arquivo
    try {
      arquivo = await request.file({ limits: { fileSize: 8 * 1024 * 1024 } })
    } catch {
      return reply.status(413).send({ erro: 'Arquivo muito grande. O limite é 8 MB.' })
    }
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

    if (arquivo.file.truncated || conteudo.length > 8 * 1024 * 1024) {
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
