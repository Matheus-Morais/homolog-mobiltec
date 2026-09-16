import { FastifyPluginAsync } from 'fastify'

export const notificacoesRoutes: FastifyPluginAsync = async (fastify) => {
  // ============================================================
  // GET /notificacoes — Lista notificações para o usuário logado
  // ============================================================
  fastify.get(
    '/notificacoes',
    { onRequest: [fastify.autenticar] },
    async (request) => {
      const ehAdmin = request.user.papel === 'ADMIN'
      const usuarioLogado = await fastify.prisma.usuario.findUnique({
        where: { id: request.user.id },
        select: { id: true, nome: true, email: true, empresa: true, papel: true },
      })

      const empresa = usuarioLogado?.empresa?.trim()

      const whereClause = ehAdmin
        ? {
            OR: [
              { empresaDestino: null },
              { tipo: 'SUBMETIDO' },
            ],
          }
        : {
            empresaDestino: { equals: empresa || '__SEM_EMPRESA__', mode: 'insensitive' as const },
          }

      const notificacoes = await fastify.prisma.notificacao.findMany({
        where: whereClause,
        orderBy: { criadoEm: 'desc' },
        take: 50,
      })

      const naoLidas = notificacoes.filter((n) => !n.lida).length
      const pendentesConfirmacao = notificacoes.filter((n) => !n.confirmada && (n.tipo === 'REVISAO' || n.tipo === 'APROVADO')).length

      return {
        total: notificacoes.length,
        naoLidas,
        pendentesConfirmacao,
        notificacoes,
      }
    },
  )

  // ============================================================
  // PATCH /notificacoes/:id/confirmar — Confirma recebimento (Ciente)
  // ============================================================
  fastify.patch(
    '/notificacoes/:id/confirmar',
    { onRequest: [fastify.autenticar] },
    async (request, reply) => {
      const { id } = request.params as { id: string }

      const usuarioLogado = await fastify.prisma.usuario.findUnique({
        where: { id: request.user.id },
        select: { id: true, nome: true, email: true, empresa: true, papel: true },
      })

      if (!usuarioLogado) {
        return reply.status(404).send({ erro: 'Usuário não encontrado' })
      }

      const notificacao = await fastify.prisma.notificacao.findUnique({
        where: { id },
      })

      if (!notificacao) {
        return reply.status(404).send({ erro: 'Notificação não encontrada' })
      }

      // Se for parceiro, valida se pertence à sua empresa
      if (
        usuarioLogado.papel === 'PARCEIRO' &&
        notificacao.empresaDestino &&
        usuarioLogado.empresa?.toLowerCase() !== notificacao.empresaDestino.toLowerCase()
      ) {
        return reply.status(403).send({ erro: 'Acesso negado a esta notificação' })
      }

      const nomeConfirmador = usuarioLogado.nome || usuarioLogado.email

      const atualizada = await fastify.prisma.notificacao.update({
        where: { id },
        data: {
          confirmada: true,
          confirmadaEm: new Date(),
          confirmadaPor: nomeConfirmador,
          lida: true,
        },
      })

      return atualizada
    },
  )

  // ============================================================
  // PATCH /notificacoes/:id/lida — Marca como lida
  // ============================================================
  fastify.patch(
    '/notificacoes/:id/lida',
    { onRequest: [fastify.autenticar] },
    async (request, reply) => {
      const { id } = request.params as { id: string }

      const atualizada = await fastify.prisma.notificacao.update({
        where: { id },
        data: { lida: true },
      })

      return atualizada
    },
  )

  // ============================================================
  // POST /notificacoes/marcar-todas-lidas
  // ============================================================
  fastify.post(
    '/notificacoes/marcar-todas-lidas',
    { onRequest: [fastify.autenticar] },
    async (request) => {
      const ehAdmin = request.user.papel === 'ADMIN'
      const usuarioLogado = await fastify.prisma.usuario.findUnique({
        where: { id: request.user.id },
        select: { empresa: true },
      })

      const whereClause = ehAdmin
        ? {
            OR: [
              { empresaDestino: null },
              { tipo: 'SUBMETIDO' },
            ],
          }
        : {
            empresaDestino: { equals: usuarioLogado?.empresa || '__SEM_EMPRESA__', mode: 'insensitive' as const },
          }

      await fastify.prisma.notificacao.updateMany({
        where: { ...whereClause, lida: false },
        data: { lida: true },
      })

      return { ok: true }
    },
  )
}

export default notificacoesRoutes
