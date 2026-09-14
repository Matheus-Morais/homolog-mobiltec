/**
 * Rotas de homologação — fluxo completo
 *
 * POST /homologacoes                 → cria nova homologação + gera resultados NAO_TESTADO
 * GET  /homologacoes                 → lista (filtrável)
 * GET  /homologacoes/:id             → detalhes completos com resultados
 * PUT  /homologacoes/:id/resultados/:itemId → atualiza resultado (com validação de justificativa)
 * POST /homologacoes/:id/status      → transição de status
 * POST /homologacoes/:id/reabrir     → reabrir APROVADO → RASCUNHO com log
 * GET  /homologacoes/:id/dashboard   → resumo de progresso (X OK, Y falhas, Z pendentes)
 */
import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { StatusResultado, StatusHomologacao } from '@prisma/client'
import { TRANSICOES_PERMITIDAS, validarTransicao } from '../lib/transicoes.js'

// Status que EXIGEM justificativa (regra central da spec)
const STATUS_COM_JUSTIFICATIVA_OBRIGATORIA: StatusResultado[] = [
  StatusResultado.FALHA,
  StatusResultado.NAO_SUPORTADO,
  StatusResultado.COM_RESSALVA,
]

// Status que aparecem no certificado (NAO_TESTADO fica fora)
const _STATUS_VISIVEIS_CERTIFICADO: StatusResultado[] = [
  StatusResultado.OK,
  StatusResultado.FALHA,
  StatusResultado.NAO_SUPORTADO,
  StatusResultado.COM_RESSALVA,
  StatusResultado.NAO_APLICAVEL,
]

const homologacaoRoutes: FastifyPluginAsync = async (fastify) => {

  // ============================================================
  // POST /homologacoes — Cria nova homologação
  // ============================================================
  fastify.post('/homologacoes', {
    onRequest: [fastify.exigirPapeis(['ADMIN', 'HOMOLOGADOR', 'PARCEIRO'])],
  }, async (request, reply) => {
    const schema = z.object({
      dispositivoId: z.string().uuid(),
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
      responsavelId: z.string().uuid().optional(),
      gerenteId: z.string().uuid().optional().nullable(),
      apoioId: z.string().uuid().optional().nullable(),
      localEmissao: z.string().default('São Paulo'),
    })

    const body = schema.parse(request.body)
    const responsavelId = body.responsavelId ?? request.user.id

    // Busca a bateria para obter os itens
    const bateria = await fastify.prisma.bateriaTeste.findUnique({
      where: { id: body.bateriaId },
      include: { itens: { include: { item: true }, orderBy: { ordem: 'asc' } } },
    })
    if (!bateria) return reply.status(404).send({ erro: 'Bateria não encontrada' })
    if (!bateria.ativo) return reply.status(400).send({ erro: 'Bateria inativa' })

    // Cria homologação e todos os resultados NAO_TESTADO atomicamente
    const homologacao = await fastify.prisma.homologacao.create({
      data: {
        ...body,
        responsavelId,
        status: StatusHomologacao.RASCUNHO,
        resultados: {
          create: bateria.itens.map(bi => ({
            itemId: bi.itemId,
            status: StatusResultado.NAO_TESTADO,
          })),
        },
      },
      include: {
        dispositivo: true,
        bateria: { select: { nome: true } },
        responsavel: { select: { nome: true } },
        resultados: { include: { item: true } },
      },
    })

    return reply.status(201).send(homologacao)
  })

  // ============================================================
  // GET /homologacoes — Lista
  // ============================================================
  fastify.get('/homologacoes', {
    onRequest: [fastify.autenticar],
  }, async (request) => {
    const { dispositivoId, status, responsavelId, finalizados } = request.query as {
      dispositivoId?: string
      status?: string
      responsavelId?: string
      finalizados?: string
    }

    const whereStatus = finalizados === 'true'
      ? { in: [StatusHomologacao.APROVADO, StatusHomologacao.PUBLICADO, StatusHomologacao.REPROVADO] }
      : (status ? (status as StatusHomologacao) : undefined)

    return fastify.prisma.homologacao.findMany({
      where: {
        ...(dispositivoId ? { dispositivoId } : {}),
        ...(whereStatus ? { status: whereStatus } : {}),
        ...(responsavelId ? { responsavelId } : {}),
      },
      include: {
        dispositivo: { include: { categoria: true } },
        responsavel: { select: { id: true, nome: true, email: true, cargo: true, empresa: true, papel: true } },
        apoio: { select: { id: true, nome: true, email: true, cargo: true, empresa: true } },
        gerente: { select: { id: true, nome: true, cargo: true } },
        bateria: { select: { id: true, nome: true } },
        _count: { select: { resultados: true, certificados: true } },
        resultados: {
          select: {
            id: true,
            status: true,
            justificativaId: true,
            justificativaTexto: true,
          },
        },
      },
      orderBy: { criadoEm: 'desc' },
    })
  })

  // ============================================================
  // PATCH /homologacoes/:id — Edita a ficha da unidade testada
  // (S/N, IMEI, versão do agente…) — usado pelos campos de cabeçalho da matriz
  // ============================================================
  fastify.patch('/homologacoes/:id', {
    onRequest: [fastify.exigirPapeis(['ADMIN', 'HOMOLOGADOR', 'PARCEIRO'])],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }

    const schema = z.object({
      numeroSerie: z.string().min(1).optional(),
      imei1: z.string().optional().nullable(),
      imei2: z.string().optional().nullable(),
      versaoSo: z.string().min(1).optional(),
      gerenciamento: z.enum(['ANDROID_LEGADO', 'ANDROID_ENTERPRISE']).optional(),
      tipoAgente: z.string().min(1).optional(),
      versaoAgente: z.string().min(1).optional(),
      versaoPos: z.string().optional().nullable(),
      ferramenta: z.string().optional().nullable(),
      metodoInscricao: z.string().min(1).optional(),
      assinaturaAgente: z.boolean().optional(),
      precisaAssinaturaDev: z.boolean().optional(),
      dataInicio: z.string().transform(s => new Date(s)).optional(),
      dataFim: z.string().transform(s => new Date(s)).optional().nullable(),
      gerenteId: z.string().uuid().optional().nullable(),
      apoioId: z.string().uuid().optional().nullable(),
      localEmissao: z.string().optional(),
      // Fontes e assinaturas — editadas na tela do certificado (spec §8.3)
      fontes: z.array(z.object({ label: z.string().min(1), url: z.string() })).optional(),
      assinaturaResponsavel: z.string().optional().nullable(),
      assinaturaGerente: z.string().optional().nullable(),
      assinaturaApoio: z.string().optional().nullable(),
      // Rascunho do técnico durante o teste — não sai no certificado
      observacoes: z.string().optional().nullable(),
    })

    const body = schema.parse(request.body)

    const atual = await fastify.prisma.homologacao.findUnique({
      where: { id },
      select: { status: true, responsavelId: true, apoioId: true },
    })
    if (!atual) return reply.status(404).send({ erro: 'Homologação não encontrada' })

    // Mesma regra dos resultados: aprovada é somente leitura (spec §11.4)
    if (atual.status === StatusHomologacao.APROVADO || atual.status === StatusHomologacao.PUBLICADO) {
      return reply.status(403).send({ erro: 'Homologação aprovada é somente leitura. Reabra para editar.' })
    }

    // Parceiro só pode alterar dados enquanto em RASCUNHO e apenas de homologações próprias
    if (request.user.papel === 'PARCEIRO') {
      if (atual.responsavelId !== request.user.id && atual.apoioId !== request.user.id) {
        return reply.status(403).send({ erro: 'Parceiros só podem editar homologações atribuídas a eles.' })
      }
      if (atual.status !== StatusHomologacao.RASCUNHO) {
        return reply.status(403).send({ erro: 'Homologação em análise ou finalizada é somente leitura para parceiros.' })
      }
      // Parceiro não edita assinaturas oficiais nem fontes — rejeitar explicitamente
      const camposRestritos = ['fontes', 'assinaturaResponsavel', 'assinaturaGerente'] as const
      const tentouEditar = camposRestritos.filter(c => (body as Record<string, unknown>)[c] !== undefined)
      if (tentouEditar.length > 0) {
        return reply.status(403).send({
          erro: `Parceiros não possuem permissão para alterar: ${tentouEditar.join(', ')}. Esses campos são gerenciados exclusivamente pela equipe Mobiltec.`,
        })
      }
    }

    return fastify.prisma.homologacao.update({ where: { id }, data: body as any })
  })

  // ============================================================
  // GET /homologacoes/:id — Detalhes completos
  // ============================================================
  fastify.get('/homologacoes/:id', {
    onRequest: [fastify.autenticar],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }

    const homologacao = await fastify.prisma.homologacao.findUnique({
      where: { id },
      include: {
        dispositivo: { include: { categoria: true } },
        bateria: true,
        responsavel: { select: { id: true, nome: true, cargo: true } },
        gerente: { select: { id: true, nome: true, cargo: true } },
        apoio: { select: { id: true, nome: true, cargo: true } },
        resultados: {
          include: {
            item: true,
            justificativa: true,
          },
          orderBy: [
            { item: { grupo: 'asc' } },
            { item: { ordem: 'asc' } },
          ],
        },
        certificados: {
          orderBy: { emitidoEm: 'desc' },
          include: { usuario: { select: { nome: true } } },
        },
      },
    })

    if (!homologacao) return reply.status(404).send({ erro: 'Homologação não encontrada' })
    return homologacao
  })

  // ============================================================
  // GET /homologacoes/:id/dashboard — Resumo de progresso
  // ============================================================
  fastify.get('/homologacoes/:id/dashboard', {
    onRequest: [fastify.autenticar],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }

    const resultados = await fastify.prisma.resultado.findMany({
      where: { homologacaoId: id },
      include: { item: { select: { grupo: true } } },
    })

    if (resultados.length === 0) {
      return reply.status(404).send({ erro: 'Homologação não encontrada' })
    }

    const contagem = {
      total: 0,
      ok: 0,
      falha: 0,
      naoSuportado: 0,
      comRessalva: 0,
      naoTestado: 0,
      naoAplicavel: 0,
    }

    const porGrupo: Record<string, typeof contagem> = {}

    for (const r of resultados) {
      const grupo = r.item.grupo
      if (!porGrupo[grupo]) {
        porGrupo[grupo] = { total: 0, ok: 0, falha: 0, naoSuportado: 0, comRessalva: 0, naoTestado: 0, naoAplicavel: 0 }
      }

      contagem.total++
      porGrupo[grupo].total++

      switch (r.status) {
        case 'OK': contagem.ok++; porGrupo[grupo].ok++; break
        case 'FALHA': contagem.falha++; porGrupo[grupo].falha++; break
        case 'NAO_SUPORTADO': contagem.naoSuportado++; porGrupo[grupo].naoSuportado++; break
        case 'COM_RESSALVA': contagem.comRessalva++; porGrupo[grupo].comRessalva++; break
        case 'NAO_TESTADO': contagem.naoTestado++; porGrupo[grupo].naoTestado++; break
        case 'NAO_APLICAVEL': contagem.naoAplicavel++; porGrupo[grupo].naoAplicavel++; break
      }
    }

    const percentualConcluido = Math.round(
      ((contagem.total - contagem.naoTestado) / contagem.total) * 100
    )

    return {
      contagem,
      porGrupo,
      percentualConcluido,
      podeAvancarParaRevisao: contagem.naoTestado === 0,
    }
  })

  // ============================================================
  // PUT /homologacoes/:id/resultados/:itemId — Atualiza resultado
  // REGRA CENTRAL: FALHA, NAO_SUPORTADO, COM_RESSALVA exigem justificativa
  // ============================================================
  fastify.put('/homologacoes/:id/resultados/:itemId', {
    onRequest: [fastify.exigirPapeis(['ADMIN', 'HOMOLOGADOR', 'PARCEIRO'])],
  }, async (request, reply) => {
    const { id, itemId } = request.params as { id: string; itemId: string }

    const schema = z.object({
      status: z.enum(['OK', 'FALHA', 'NAO_SUPORTADO', 'COM_RESSALVA', 'NAO_TESTADO', 'NAO_APLICAVEL']),
      observacao: z.string().max(2000).optional().nullable(),
      justificativaId: z.string().uuid().optional().nullable(),
      justificativaTexto: z.string().max(2000).optional().nullable(),
    })

    const body = schema.parse(request.body)
    const statusEnum = body.status as StatusResultado

    // Verificar se a homologação está em estado editável
    const homologacao = await fastify.prisma.homologacao.findUnique({
      where: { id },
      select: { status: true, responsavelId: true, apoioId: true, analiseDivergencias: true },
    })
    if (!homologacao) return reply.status(404).send({ erro: 'Homologação não encontrada' })
    if (homologacao.status === StatusHomologacao.APROVADO || homologacao.status === StatusHomologacao.PUBLICADO) {
      return reply.status(403).send({ erro: 'Homologação aprovada é somente leitura. Reabra para editar.' })
    }

    // Regras RBAC para Parceiro:
    if (request.user.papel === 'PARCEIRO') {
      const ehExcecaoHgomes = request.user.email?.toLowerCase() === 'hgomes@tnsi.com'
      // Ownership check: parceiro só opera em homologações atribuídas a ele, exceto exceção hgomes@tnsi.com
      if (!ehExcecaoHgomes && homologacao.responsavelId !== request.user.id && homologacao.apoioId !== request.user.id) {
        return reply.status(403).send({ erro: 'Parceiros só podem editar resultados de homologações atribuídas a eles.' })
      }
      if (!ehExcecaoHgomes && homologacao.status !== StatusHomologacao.RASCUNHO) {
        return reply.status(403).send({ erro: 'Homologação em análise ou finalizada é somente leitura para parceiros.' })
      }
      if (body.justificativaId || body.justificativaTexto) {
        return reply.status(403).send({
          erro: 'Parceiros não possuem permissão para registrar justificativas técnicas oficiais. Utilize o campo de observações.',
        })
      }
    }

    // A justificativa NÃO trava mais a marcação do status (decisão do usuário,
    // DECISOES Etapa 43): durante a homologação interna o técnico marca o que
    // observou e escreve a justificativa depois, com o retorno do dev.
    //
    // A regra da spec §5 continua valendo onde ela protege o cliente: no
    // certificado, divergência sem justificativa sai em branco — o documento
    // não atesta o que ninguém explicou.

    // Atualiza (upsert para segurança)
    const resultado = await fastify.prisma.resultado.upsert({
      where: { homologacaoId_itemId: { homologacaoId: id, itemId } },
      update: {
        status: statusEnum,
        observacao: body.observacao,
        justificativaId: body.justificativaId,
        justificativaTexto: body.justificativaTexto,
        autorEmail: request.user?.email ?? null,
      },
      create: {
        homologacaoId: id,
        itemId,
        status: statusEnum,
        observacao: body.observacao,
        justificativaId: body.justificativaId,
        justificativaTexto: body.justificativaTexto,
        autorEmail: request.user?.email ?? null,
      },
      include: { item: true, justificativa: true },
    })

    // Incrementa uso_count da justificativa se foi selecionada da biblioteca
    if (body.justificativaId) {
      await fastify.prisma.justificativa.update({
        where: { id: body.justificativaId },
        data: { usoCount: { increment: 1 } },
      })
    }

    // Se a homologação tem análise manual de divergências e o item recebeu justificativa nova/alterada,
    // sobrepõe imediatamente a funcionalidade correspondente no certificado sem exigir ação manual
    if (homologacao.analiseDivergencias && typeof homologacao.analiseDivergencias === 'object') {
      try {
        const analise = homologacao.analiseDivergencias as {
          blocos?: Array<{ id: string; titulo: string; subtitulo: string; texto: string }>
          vistos?: string[]
        }
        if (Array.isArray(analise.blocos)) {
          const textoJustificativa = body.justificativaTexto || (body.justificativaId ? resultado.justificativa?.texto : null)
          const nomeItem = resultado.item?.nome
          if (textoJustificativa && nomeItem) {
            let blocoEncontrado = false
            const blocosAtualizados = analise.blocos.map((b) => {
              if (b.subtitulo?.includes(nomeItem) || b.id?.includes(itemId)) {
                blocoEncontrado = true
                return { ...b, texto: textoJustificativa }
              }
              return b
            })
            if (!blocoEncontrado) {
              blocosAtualizados.push({
                id: `item-${itemId}`,
                titulo: resultado.item?.grupo ? `Grupo ${resultado.item.grupo}` : 'Análise Técnica',
                subtitulo: nomeItem,
                texto: textoJustificativa,
              })
            }
            await fastify.prisma.homologacao.update({
              where: { id },
              data: {
                analiseDivergencias: {
                  ...analise,
                  blocos: blocosAtualizados,
                  vistos: [...new Set([...(analise.vistos ?? []), textoJustificativa])],
                },
              },
            })
          }
        }
      } catch (err) {
        console.warn('Erro ao sincronizar justificativa na análise do certificado:', err)
      }
    }

    return resultado
  })

  // ============================================================
  // POST /homologacoes/:id/status — Transição de status
  // RASCUNHO → AGUARDANDO_ANALISE → EM_REVISAO → APROVADO
  // ============================================================
  fastify.post('/homologacoes/:id/status', {
    onRequest: [fastify.exigirPapeis(['ADMIN', 'HOMOLOGADOR', 'PARCEIRO'])],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const statusSchema = z.object({
      novoStatus: z.enum(['RASCUNHO', 'AGUARDANDO_ANALISE', 'EM_REVISAO', 'APROVADO', 'REPROVADO', 'PUBLICADO']),
      homologado: z.boolean().optional(),
      assinaturaApoio: z.string().optional().nullable(),
      motivo: z.string().optional().nullable(),
    })
    const { novoStatus, homologado, assinaturaApoio, motivo } = statusSchema.parse(request.body)

    const homologacao = await fastify.prisma.homologacao.findUnique({
      where: { id },
      include: {
        dispositivo: true,
        responsavel: { select: { id: true, nome: true, email: true, empresa: true } },
        resultados: {
          include: {
            item: true,
          },
        },
      },
    })
    if (!homologacao) return reply.status(404).send({ erro: 'Homologação não encontrada' })

    const ehParceiro = request.user.papel === 'PARCEIRO'

    // Ownership check: parceiro só pode transicionar homologações atribuídas a ele
    if (ehParceiro) {
      if (homologacao.responsavelId !== request.user.id && homologacao.apoioId !== request.user.id) {
        return reply.status(403).send({ erro: 'Parceiros só podem submeter homologações atribuídas a eles.' })
      }
    }

    // Validar transição usando o módulo canônico de máquina de estados
    const resultado = validarTransicao(request.user.papel, homologacao.status, novoStatus)
    if (!resultado.permitida) {
      const statusCode = ehParceiro ? 403 : 422
      return reply.status(statusCode).send({
        erro: resultado.erro,
        ...(statusCode === 422 ? { transicoesPermitidas: TRANSICOES_PERMITIDAS[homologacao.status] ?? [] } : {}),
      })
    }

    // Pendências: item não testado ou divergência sem justificativa.
    //
    // NÃO bloqueiam a transição — decisão do usuário (ver DECISOES, Etapa 33):
    // quem fecha a homologação é o time de homologação, e quem valida e
    // assina é o gerente de produto. O checklist continua existindo, mas
    // como informação, não como trava. A pendência segue visível em três
    // lugares: no modal de finalizar, no contador da barra de filtros e no
    // certificado, onde a linha sem justificativa sai em branco (spec §5).
    const pendentes = homologacao.resultados.filter(r => {
      if (r.status === StatusResultado.NAO_TESTADO) return true
      if (STATUS_COM_JUSTIFICATIVA_OBRIGATORIA.includes(r.status)) {
        return !r.justificativaId && !r.justificativaTexto
      }
      return false
    })

    // Para APROVADO: homologado é obrigatório (decisão manual)
    if (novoStatus === StatusHomologacao.APROVADO && homologado === undefined) {
      return reply.status(422).send({
        erro: "Campo 'homologado' é obrigatório ao aprovar (true = aprovado, false = reprovado).",
      })
    }

    // Validação de assinatura de apoio do parceiro: obtida do cadastro do usuário
    let assinaturaApoioFinal = assinaturaApoio
    if (ehParceiro && assinaturaApoio !== undefined) {
      if (assinaturaApoio && String(assinaturaApoio).trim()) {
        const u = await fastify.prisma.usuario.findUnique({
          where: { id: request.user.id },
          select: { nome: true, empresa: true },
        })
        const nomeEsperado = u?.nome?.trim() ?? ''
        const empresaEsperada = u?.empresa?.trim() || 'Parceiro'
        // Normaliza automaticamente para o formato oficial do parceiro: "Nome — Empresa" (ex: "Matheus — TNS")
        assinaturaApoioFinal = `${nomeEsperado} — ${empresaEsperada}`
      } else {
        assinaturaApoioFinal = null
      }
    }

    // Atualiza homologação e registra histórico de transição
    const [atualizado] = await fastify.prisma.$transaction([
      fastify.prisma.homologacao.update({
        where: { id },
        data: {
          status: novoStatus,
          ...(assinaturaApoioFinal !== undefined ? { assinaturaApoio: assinaturaApoioFinal } : {}),
          ...(novoStatus === StatusHomologacao.APROVADO ? {
            homologado,
            dataFim: homologado ? new Date() : undefined,
          } : {}),
          ...(novoStatus === StatusHomologacao.REPROVADO ? {
            homologado: false,
            dataFim: new Date(),
          } : {}),
        },
      }),
      fastify.prisma.historicoStatus.create({
        data: {
          homologacaoId: id,
          statusAnterior: homologacao.status,
          statusNovo: novoStatus,
          usuarioId: request.user.id,
          motivo: motivo ?? null,
        },
      }),
    ])

    // Fluxo dinâmico de notificações entre Parceiro e Admin Mobiltec
    const empresaParceiro = homologacao.responsavel?.empresa || homologacao.dispositivo?.empresa || null
    const nomeDisp = homologacao.dispositivo?.nomeComercial || 'Dispositivo'

    try {
      if (novoStatus === StatusHomologacao.EM_REVISAO && empresaParceiro) {
        await fastify.prisma.notificacao.create({
          data: {
            tipo: 'REVISAO',
            titulo: `Revisão solicitada: ${nomeDisp}`,
            mensagem: motivo?.trim() || 'A equipe técnica da Mobiltec solicitou ajustes nesta homologação.',
            homologacaoId: id,
            dispositivoNome: nomeDisp,
            empresaDestino: empresaParceiro,
            link: `/paineis/meu-painel`,
            confirmada: false,
          },
        })
      } else if (novoStatus === StatusHomologacao.APROVADO && empresaParceiro) {
        await fastify.prisma.notificacao.create({
          data: {
            tipo: 'APROVADO',
            titulo: `Certificado emitido e aprovado: ${nomeDisp}`,
            mensagem: `A homologação do dispositivo ${nomeDisp} foi aprovada oficialmente. O certificado já está disponível para consulta e download.`,
            homologacaoId: id,
            dispositivoNome: nomeDisp,
            empresaDestino: empresaParceiro,
            link: `/homologacoes/${id}/certificado`,
            confirmada: false,
          },
        })
      } else if (novoStatus === StatusHomologacao.AGUARDANDO_ANALISE) {
        await fastify.prisma.notificacao.create({
          data: {
            tipo: 'SUBMETIDO',
            titulo: `Homologação enviada para análise: ${nomeDisp}`,
            mensagem: `O parceiro ${empresaParceiro || 'Parceiro'} enviou o modelo ${nomeDisp} para conferência técnica e validação de certificado.`,
            homologacaoId: id,
            dispositivoNome: nomeDisp,
            empresaDestino: null,
            link: `/parceiros/validar-certificados`,
            confirmada: false,
          },
        })
      }
    } catch (e) {
      fastify.log.warn(`Erro ao gerar notificação de transição de status: ${e}`)
    }

    // As pendências vão junto na resposta: quem fechou com item em aberto
    // fica sabendo o que ficou para trás, e o gerente de produto tem o que
    // conferir antes de assinar.
    return {
      ...atualizado,
      pendencias: pendentes.map(r => ({ itemId: r.itemId, status: r.status })),
    }
  })

  // ============================================================
  // POST /homologacoes/:id/reabrir — Reabrir finalizado → RASCUNHO
  // ============================================================
  fastify.post('/homologacoes/:id/reabrir', {
    onRequest: [fastify.exigirPapeis(['ADMIN'])],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { motivo } = z.object({ motivo: z.string().min(10) }).parse(request.body)

    const homologacao = await fastify.prisma.homologacao.findUnique({
      where: { id },
      include: {
        dispositivo: { include: { categoria: true } },
        responsavel: { select: { empresa: true } },
      },
    })
    if (!homologacao) return reply.status(404).send({ erro: 'Homologação não encontrada' })

    const statusFinalizados: StatusHomologacao[] = [
      StatusHomologacao.APROVADO,
      StatusHomologacao.PUBLICADO,
      StatusHomologacao.REPROVADO,
    ]
    if (!statusFinalizados.includes(homologacao.status)) {
      return reply.status(422).send({
        erro: 'Só é possível reabrir homologações finalizadas (Aprovado, Publicado ou Reprovado).',
      })
    }

    // Executa tudo em transação
    const [logEntry] = await fastify.prisma.$transaction(async (tx) => {
      const log = await tx.logReabertura.create({
        data: {
          homologacaoId: id,
          usuarioId: request.user.id,
          motivo,
        },
      })
      await tx.homologacao.update({
        where: { id },
        data: {
          status: StatusHomologacao.RASCUNHO,
          homologado: null,
          dataFim: null,
        },
      })
      await tx.historicoStatus.create({
        data: {
          homologacaoId: id,
          statusAnterior: homologacao.status,
          statusNovo: StatusHomologacao.RASCUNHO,
          usuarioId: request.user.id,
          motivo,
        },
      })

      // Se for de parceiro, emite notificação para refletir no painel dele
      const empresaParceiro = homologacao.responsavel?.empresa || homologacao.dispositivo?.empresa || null
      const nomeDisp = homologacao.dispositivo?.nomeComercial || 'Dispositivo'
      if (empresaParceiro && empresaParceiro.toLowerCase() !== 'mobiltec') {
        await tx.notificacao.create({
          data: {
            tipo: 'REVISAO',
            titulo: `Homologação reaberta: ${nomeDisp}`,
            mensagem: `A homologação do modelo ${nomeDisp} foi reaberta pelo administrador para ajustes. Motivo: ${motivo}`,
            homologacaoId: id,
            dispositivoNome: nomeDisp,
            empresaDestino: empresaParceiro,
            link: `/matriz/${homologacao.dispositivo?.categoria?.slug || 'pos'}`,
            confirmada: false,
          },
        })
      }
      return [log]
    })

    return { mensagem: 'Homologação reaberta para edição.', logId: logEntry.id }
  })

  // ============================================================
  // DELETE /homologacoes/:id — Exclui homologação da planilha ou da base
  // ============================================================
  fastify.delete('/homologacoes/:id', {
    onRequest: [fastify.exigirPapeis(['ADMIN', 'HOMOLOGADOR', 'PARCEIRO'])],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }

    const homologacao = await fastify.prisma.homologacao.findUnique({
      where: { id },
      include: {
        dispositivo: true,
        responsavel: { select: { id: true, empresa: true } },
      },
    })
    if (!homologacao) return reply.status(404).send({ erro: 'Homologação não encontrada' })

    const statusFinalizados: StatusHomologacao[] = [
      StatusHomologacao.APROVADO,
      StatusHomologacao.PUBLICADO,
      StatusHomologacao.REPROVADO,
    ]
    const ehFinalizada = statusFinalizados.includes(homologacao.status)

    // Regra 1: Homologações finalizadas só podem ser excluídas por ADMIN
    if (ehFinalizada && request.user.papel !== 'ADMIN') {
      return reply.status(403).send({
        erro: 'Apenas administradores possuem permissão para excluir homologações finalizadas.',
      })
    }

    // Regra 2: Para parceiro, apenas o responsável que cadastrou a homologação pode excluí-la da planilha
    if (request.user.papel === 'PARCEIRO') {
      if (homologacao.responsavelId !== request.user.id) {
        return reply.status(403).send({
          erro: 'Apenas o usuário responsável pelo registro pode remover este item da planilha.',
        })
      }
    }

    // Executa exclusão atômica de todos os relacionamentos
    await fastify.prisma.$transaction(async (tx) => {
      await tx.resultado.deleteMany({ where: { homologacaoId: id } })
      await tx.certificadoEmitido.deleteMany({ where: { homologacaoId: id } })
      await tx.logReabertura.deleteMany({ where: { homologacaoId: id } })
      await tx.historicoStatus.deleteMany({ where: { homologacaoId: id } })
      await tx.notificacao.deleteMany({ where: { homologacaoId: id } })
      await tx.homologacao.delete({ where: { id } })

      // Se o dispositivo não possuir nenhum outro teste/homologação cadastrado,
      // exclui também o dispositivo para não deixar registros órfãos e liberar @@unique([fabricante, modelo])
      const restantes = await tx.homologacao.count({
        where: { dispositivoId: homologacao.dispositivoId },
      })
      if (restantes === 0) {
        await tx.dispositivo.delete({ where: { id: homologacao.dispositivoId } })
      }
    })

    return reply.status(200).send({ mensagem: 'Homologação removida com sucesso.' })
  })
}

export default homologacaoRoutes
