import { FastifyPluginAsync } from 'fastify'
import bcrypt from 'bcryptjs'
import { z } from 'zod'

const parceiroInputSchema = z.object({
  empresa: z.string().min(1, 'Nome do parceiro/empresa é obrigatório'),
  nome: z.string().min(1, 'Nome do responsável é obrigatório'),
  email: z.string().email('E-mail inválido'),
  senha: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres'),
  categoriasPermitidas: z.array(z.string()).default([]),
})

const parceiroUpdateSchema = z.object({
  empresa: z.string().min(1).optional(),
  nome: z.string().min(1).optional(),
  email: z.string().email().optional(),
  senha: z.string().min(6).optional(),
  categoriasPermitidas: z.array(z.string()).optional(),
  ativo: z.boolean().optional(),
})

const parceirosRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /parceiros — Lista todos os parceiros cadastrados (apenas ADMIN)
  fastify.get(
    '/parceiros',
    { onRequest: [fastify.autenticar] },
    async (request, reply) => {
      if (request.user.papel !== 'ADMIN') {
        return reply.status(403).send({ erro: 'Acesso restrito a administradores' })
      }

      const parceiros = await fastify.prisma.usuario.findMany({
        where: { papel: 'PARCEIRO' },
        select: {
          id: true,
          nome: true,
          email: true,
          cargo: true,
          papel: true,
          empresa: true,
          categoriasPermitidas: true,
          ativo: true,
          criadoEm: true,
        },
        orderBy: { criadoEm: 'desc' },
      })

      return parceiros
    },
  )

  // POST /parceiros — Cadastra novo parceiro (apenas ADMIN)
  fastify.post(
    '/parceiros',
    { onRequest: [fastify.autenticar] },
    async (request, reply) => {
      if (request.user.papel !== 'ADMIN') {
        return reply.status(403).send({ erro: 'Acesso restrito a administradores' })
      }

      const body = parceiroInputSchema.parse(request.body)

      const existente = await fastify.prisma.usuario.findUnique({
        where: { email: body.email.toLowerCase().trim() },
      })

      if (existente) {
        return reply.status(409).send({ erro: 'Já existe um usuário cadastrado com este e-mail' })
      }

      const senhaHash = await bcrypt.hash(body.senha, 10)
      const dominioCorporativo = body.email.split('@')[1]?.toLowerCase() ?? null

      const parceiro = await fastify.prisma.usuario.create({
        data: {
          nome: body.nome.trim(),
          email: body.email.toLowerCase().trim(),
          cargo: 'Parceiro Homologador',
          senhaHash,
          papel: 'PARCEIRO',
          empresa: body.empresa.trim(),
          dominioCorporativo,
          categoriasPermitidas: body.categoriasPermitidas,
          ativo: true,
        },
        select: {
          id: true,
          nome: true,
          email: true,
          cargo: true,
          papel: true,
          empresa: true,
          categoriasPermitidas: true,
          ativo: true,
          criadoEm: true,
        },
      })

      return reply.status(201).send(parceiro)
    },
  )

  // PUT /parceiros/:id — Atualiza dados do parceiro (apenas ADMIN)
  fastify.put(
    '/parceiros/:id',
    { onRequest: [fastify.autenticar] },
    async (request, reply) => {
      if (request.user.papel !== 'ADMIN') {
        return reply.status(403).send({ erro: 'Acesso restrito a administradores' })
      }

      const { id } = request.params as { id: string }
      const body = parceiroUpdateSchema.parse(request.body)

      const dados: Record<string, unknown> = {}
      if (body.empresa !== undefined) dados.empresa = body.empresa.trim()
      if (body.nome !== undefined) dados.nome = body.nome.trim()
      if (body.email !== undefined) {
        dados.email = body.email.toLowerCase().trim()
        dados.dominioCorporativo = body.email.split('@')[1]?.toLowerCase() ?? null
      }
      if (body.senha !== undefined && body.senha.length >= 6) {
        dados.senhaHash = await bcrypt.hash(body.senha, 10)
      }
      if (body.categoriasPermitidas !== undefined) {
        dados.categoriasPermitidas = body.categoriasPermitidas
      }
      if (body.ativo !== undefined) {
        dados.ativo = body.ativo
      }

      try {
        const atualizado = await fastify.prisma.usuario.update({
          where: { id },
          data: dados,
          select: {
            id: true,
            nome: true,
            email: true,
            cargo: true,
            papel: true,
            empresa: true,
            categoriasPermitidas: true,
            ativo: true,
            criadoEm: true,
          },
        })

        return atualizado
      } catch (err: any) {
        if (err.code === 'P2025') {
          return reply.status(404).send({ erro: 'Parceiro não encontrado' })
        }
        if (err.code === 'P2002') {
          return reply.status(409).send({ erro: 'Já existe outro usuário com este e-mail' })
        }
        throw err
      }
    },
  )

  // DELETE /parceiros/:id — Inativação de parceiro (apenas ADMIN)
  fastify.delete(
    '/parceiros/:id',
    { onRequest: [fastify.autenticar] },
    async (request, reply) => {
      if (request.user.papel !== 'ADMIN') {
        return reply.status(403).send({ erro: 'Acesso restrito a administradores' })
      }

      const { id } = request.params as { id: string }

      try {
        await fastify.prisma.usuario.update({
          where: { id },
          data: { ativo: false },
        })

        return { ok: true }
      } catch (err: any) {
        if (err.code === 'P2025') {
          return reply.status(404).send({ erro: 'Parceiro não encontrado' })
        }
        throw err
      }
    },
  )

  // ============================================================
  // GET /parceiros/meu-painel — Painel exclusivo do parceiro logado
  // ============================================================
  fastify.get(
    '/parceiros/meu-painel',
    { onRequest: [fastify.autenticar] },
    async (request, reply) => {
      const usuarioLogado = await fastify.prisma.usuario.findUnique({
        where: { id: request.user.id },
      })

      if (!usuarioLogado) {
        return reply.status(404).send({ erro: 'Usuário não encontrado' })
      }

      if (usuarioLogado.papel !== 'PARCEIRO' && usuarioLogado.papel !== 'ADMIN') {
        return reply.status(403).send({ erro: 'Acesso restrito a parceiros' })
      }

      return montarDadosPainel(fastify, usuarioLogado)
    },
  )

  // ============================================================
  // GET /parceiros/:id/painel — Painel de um parceiro específico
  // (Admin pode ver qualquer um; Parceiro só pode ver o seu próprio)
  // ============================================================
  fastify.get(
    '/parceiros/:id/painel',
    { onRequest: [fastify.autenticar] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const ehAdmin = request.user.papel === 'ADMIN'
      const ehParceiro = request.user.papel === 'PARCEIRO'

      if (!ehAdmin && !ehParceiro) {
        return reply.status(403).send({ erro: 'Acesso restrito' })
      }

      const parceiro = await fastify.prisma.usuario.findFirst({
        where: {
          OR: [{ id }, { empresa: id }],
          papel: 'PARCEIRO',
        },
        select: {
          id: true,
          nome: true,
          email: true,
          cargo: true,
          papel: true,
          empresa: true,
          categoriasPermitidas: true,
          ativo: true,
          criadoEm: true,
        },
      })

      if (!parceiro) {
        return reply.status(404).send({ erro: 'Parceiro não encontrado' })
      }

      // Regra de segurança: parceiro só pode acessar o seu próprio painel
      if (ehParceiro) {
        const usuarioLogado = await fastify.prisma.usuario.findUnique({
          where: { id: request.user.id },
          select: { id: true, empresa: true },
        })
        if (parceiro.id !== request.user.id && parceiro.empresa !== usuarioLogado?.empresa) {
          return reply.status(403).send({ erro: 'Acesso restrito ao painel exclusivo da sua empresa' })
        }
      }

      return montarDadosPainel(fastify, parceiro)
    },
  )
}

/**
 * Monta os dados consolidados do painel de um parceiro:
 * métricas de homologação, progresso de testes e lista de dispositivos.
 */
async function montarDadosPainel(fastify: any, parceiro: any) {
  const empresa = parceiro.empresa

  const dispositivos = await fastify.prisma.dispositivo.findMany({
    where: {
      ativo: true,
      OR: [
        ...(empresa ? [{ empresa }] : []),
        ...(empresa ? [{ fabricante: { equals: empresa, mode: 'insensitive' } }] : []),
        { homologacoes: { some: { responsavelId: parceiro.id } } },
        ...(empresa ? [{ homologacoes: { some: { responsavel: { empresa } } } }] : []),
      ],
    },
    include: {
      categoria: { select: { id: true, nome: true, slug: true, icone: true } },
      homologacoes: {
        include: {
          resultados: { select: { status: true, justificativaId: true, justificativaTexto: true } },
          responsavel: { select: { id: true, nome: true, email: true } },
          // O último apontamento da Mobiltec, para o card do painel dizer o
          // que precisa ser ajustado (D435)
          historicoStatus: {
            where: { statusNovo: 'EM_REVISAO' },
            orderBy: { criadoEm: 'desc' },
            take: 1,
            select: { motivo: true, criadoEm: true, usuario: { select: { nome: true } } },
          },
        },
        orderBy: { criadoEm: 'desc' },
      },
    },
    orderBy: { criadoEm: 'desc' },
  })

  const metricas = {
    totalDispositivos: dispositivos.length,
    emHomologacao: 0,
    emValidacao: 0,
    emRevisao: 0,
    homologados: 0,
    reprovados: 0,
    testesTotal: 0,
    testesRealizados: 0,
    testesPendentes: 0,
  }

  const listaDispositivos = dispositivos.map((d: any) => {
    const atual = d.homologacoes[0]
    const resumo = {
      total: atual?.resultados.length ?? 0,
      ok: 0,
      divergencias: 0,
      semJustificativa: 0,
      naoTestado: 0,
      naoAplicavel: 0,
      avaliados: 0,
    }

    if (atual) {
      if (atual.status === 'RASCUNHO') metricas.emHomologacao++
      else if (atual.status === 'AGUARDANDO_ANALISE') metricas.emValidacao++
      else if (atual.status === 'EM_REVISAO') metricas.emRevisao++
      else if (atual.status === 'APROVADO' || atual.status === 'PUBLICADO') metricas.homologados++
      else if (atual.status === 'REPROVADO') metricas.reprovados++

      for (const r of atual.resultados) {
        metricas.testesTotal++
        if (r.status === 'NAO_TESTADO') {
          metricas.testesPendentes++
          resumo.naoTestado++
        } else {
          metricas.testesRealizados++
        }

        if (r.status === 'OK') resumo.ok++
        else if (r.status === 'NAO_APLICAVEL') resumo.naoAplicavel++

        if (['FALHA', 'NAO_SUPORTADO', 'COM_RESSALVA'].includes(r.status)) {
          resumo.divergencias++
          if (!r.justificativaId && !r.justificativaTexto) resumo.semJustificativa++
        }
      }
      resumo.avaliados = resumo.total - resumo.naoTestado
    }

    return {
      dispositivoId: d.id,
      homologacaoId: atual?.id ?? null,
      fabricante: d.fabricante,
      modelo: d.modelo,
      nomeComercial: d.nomeComercial,
      fotoUrl: d.fotoUrl,
      linkFabricante: d.linkFabricante,
      categoriaId: d.categoria.id,
      categoriaNome: d.categoria.nome,
      categoriaSlug: d.categoria.slug,
      categoriaIcone: d.categoria.icone,
      versaoSo: atual?.versaoSo ?? '-',
      versaoAgente: atual?.versaoAgente ?? '-',
      versaoPos: atual?.versaoPos ?? null,
      gerenciamento: atual?.gerenciamento ?? 'ANDROID_ENTERPRISE',
      tipoAgente: atual?.tipoAgente ?? 'PROD',
      status: atual?.status ?? 'RASCUNHO',
      homologado: atual?.homologado ?? false,
      observacoes: atual?.observacoes ?? null,
      revisaoPendente:
        atual?.status === 'EM_REVISAO' && atual.historicoStatus[0]
          ? {
              motivo: atual.historicoStatus[0].motivo,
              solicitadoEm: atual.historicoStatus[0].criadoEm,
              solicitadoPor: atual.historicoStatus[0].usuario?.nome ?? null,
            }
          : null,
      dataInicio: atual?.dataInicio ?? null,
      dataFim: atual?.dataFim ?? null,
      responsavelNome: atual?.responsavel?.nome ?? parceiro.nome,
      resumo,
    }
  })

  return {
    parceiro: {
      id: parceiro.id,
      nome: parceiro.nome,
      email: parceiro.email,
      cargo: parceiro.cargo,
      papel: parceiro.papel,
      empresa: parceiro.empresa,
      categoriasPermitidas: parceiro.categoriasPermitidas,
      ativo: parceiro.ativo,
      criadoEm: parceiro.criadoEm,
    },
    metricas,
    dispositivos: listaDispositivos,
  }
}

export default parceirosRoutes
