/**
 * Registro de tipo de dispositivo.
 *
 * Até aqui os tipos (Terminal PoS, Impressora, Coletor) eram semente do banco e
 * todos herdavam a mesma bateria de 48 itens. Esta rota põe isso na mão do
 * técnico: ele descreve o tipo, escolhe quais linhas da ficha fazem sentido
 * para ele e monta a bateria item a item — podendo escrever itens que ainda
 * não existem e alocá-los num dos quatro tópicos.
 *
 * O resultado é uma Categoria + uma BateriaTeste própria. Como a homologação
 * já nasce apontando para a bateria da sua categoria, só os modelos cadastrados
 * neste tipo herdam essa bateria; os outros tipos seguem intocados.
 */
import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { StatusResultado } from '@prisma/client'

const GRUPOS = ['TELEMETRIA', 'COLETA', 'COMANDOS', 'PERFIS'] as const

/** Homologação fechada é somente-leitura (spec §11.4) — a bateria dela não muda */
const EDITAVEIS = ['RASCUNHO', 'EM_REVISAO'] as const

/**
 * "Coletor de Dados 2D" → "coletor-de-dados-2d".
 *
 * O slug vai para a URL da planilha (/matriz/<slug>), então tem de sobreviver
 * a acento e pontuação — daí o NFD antes de cortar o que não é [a-z0-9].
 */
function aoSlug(nome: string): string {
  return nome
    .normalize('NFD')
    // \p{M} pega os combinantes que o NFD separou, sem literais invisiveis
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const tiposDispositivoRoutes: FastifyPluginAsync = async (fastify) => {
  // ============================================================
  // GET /tipos-dispositivo — a lista que a tela de manutenção opera
  // ============================================================
  fastify.get('/tipos-dispositivo', { onRequest: [fastify.autenticar] }, async () => {
    // Inclui os inativos: é aqui que eles voltam à operação
    const cats = await fastify.prisma.categoria.findMany({
      orderBy: { ordem: 'asc' },
      include: {
        _count: { select: { dispositivos: { where: { ativo: true } } } },
        baterias: { select: { id: true, itens: { select: { itemId: true } } } },
      },
    })

    return cats.map((c) => ({
      id: c.id,
      nome: c.nome,
      slug: c.slug,
      icone: c.icone,
      ordem: c.ordem,
      ativo: c.ativo,
      camposFicha: c.camposFicha,
      gruposOrdem: c.gruposOrdem,
      gruposTitulos: c.gruposTitulos as Record<string, string>,
      dispositivos: c._count.dispositivos,
      // Uma categoria tem uma bateria na prática; a união cobre as antigas,
      // que a semente podia ter deixado com mais de uma.
      itens: [...new Set(c.baterias.flatMap((b) => b.itens.map((i) => i.itemId)))],
    }))
  })

  // ============================================================
  // POST /tipos-dispositivo
  // ============================================================
  fastify.post('/tipos-dispositivo', { onRequest: [fastify.exigirPapeis(['ADMIN', 'HOMOLOGADOR'])] }, async (request, reply) => {
    const schema = z.object({
      nome: z.string().trim().min(2).max(60),
      icone: z.string().trim().min(1).max(40),
      /** Chaves de LINHAS_FICHA; vazio = a ficha inteira */
      camposFicha: z.array(z.string().min(1).max(40)).default([]),
      /** Ordem dos tópicos/baterias configurados */
      gruposOrdem: z.array(z.string().min(1).max(100)).default([]),
      /** Títulos amigáveis para as baterias */
      gruposTitulos: z.record(z.string()).default({}),
      /** Itens do catálogo que entram na bateria deste tipo */
      itensExistentes: z.array(z.string().uuid()).default([]),
      /** Itens que o técnico escreveu na hora, já alocados num tópico */
      itensNovos: z
        .array(
          z.object({
            grupo: z.string().trim().min(1).max(100),
            nome: z.string().trim().min(1).max(200),
            descricaoAcao: z.string().trim().min(1).max(500),
            ordem: z.number().int().optional(),
          }),
        )
        .default([]),
      itensEditados: z
        .array(
          z.object({
            id: z.string().uuid(),
            nome: z.string().trim().min(1).max(200),
            descricaoAcao: z.string().trim().min(1).max(500).optional(),
          }),
        )
        .default([]),
    })

    const body = schema.parse(request.body)

    // Um tipo sem nenhum item não tem o que testar: a planilha nasceria vazia
    // e sem caminho para consertar, já que a bateria é definida no registro.
    if (body.itensExistentes.length + body.itensNovos.length === 0) {
      return reply
        .status(400)
        .send({ erro: 'Escolha ao menos um item de teste para a bateria deste tipo.' })
    }

    const base = aoSlug(body.nome)
    if (!base) {
      return reply.status(400).send({ erro: 'O nome precisa ter ao menos uma letra ou número.' })
    }

    // Slug livre: "Coletor" repetido vira coletor-2, coletor-3…
    const parecidos = await fastify.prisma.categoria.findMany({
      where: { slug: { startsWith: base } },
      select: { slug: true },
    })
    const tomados = new Set(parecidos.map((c) => c.slug))
    let slug = base
    for (let n = 2; tomados.has(slug); n++) slug = `${base}-${n}`

    const ultima = await fastify.prisma.categoria.findFirst({
      orderBy: { ordem: 'desc' },
      select: { ordem: true },
    })

    // Ordem dentro do grupo: o item novo entra depois do último que já existe
    // ali, para não se intercalar no meio de uma sequência conhecida.
    const ultimaOrdem = new Map<string, number>()

    const criado = await fastify.prisma.$transaction(async (tx) => {
      const categoria = await tx.categoria.create({
        data: {
          nome: body.nome,
          slug,
          icone: body.icone,
          ordem: (ultima?.ordem ?? 0) + 1,
          camposFicha: body.camposFicha,
          gruposOrdem: body.gruposOrdem,
          gruposTitulos: body.gruposTitulos,
        },
      })

      for (const editado of body.itensEditados) {
        await tx.itemTeste.update({
          where: { id: editado.id },
          data: {
            nome: editado.nome,
            ...(editado.descricaoAcao !== undefined ? { descricaoAcao: editado.descricaoAcao } : {}),
          },
        })
      }

      const idsNovos: string[] = []
      for (const novo of body.itensNovos) {
        let proxima = ultimaOrdem.get(novo.grupo)
        if (proxima === undefined) {
          const u = await tx.itemTeste.findFirst({
            where: { grupo: novo.grupo },
            orderBy: { ordem: 'desc' },
            select: { ordem: true },
          })
          proxima = u?.ordem ?? 0
        }
        proxima += 1
        ultimaOrdem.set(novo.grupo, proxima)
        const item = await tx.itemTeste.create({
          data: {
            grupo: novo.grupo,
            nome: novo.nome,
            descricaoAcao: novo.descricaoAcao,
            ordem: novo.ordem ?? proxima,
          },
        })
        idsNovos.push(item.id)
      }

      // Só os IDs que de fato existem: um uuid inventado no corpo viraria uma
      // violação de chave estrangeira no meio da transação.
      const existentes = await tx.itemTeste.findMany({
        where: { id: { in: body.itensExistentes } },
        select: { id: true },
      })

      const idsDaBateria = [...existentes.map((i) => i.id), ...idsNovos]

      const bateria = await tx.bateriaTeste.create({
        data: {
          categoriaId: categoria.id,
          nome: `${body.nome} — Padrão`,
          descricao: `Bateria criada no registro do tipo "${body.nome}".`,
          itens: {
            create: idsDaBateria.map((itemId, i) => ({ itemId, ordem: i + 1 })),
          },
        },
        select: { id: true, nome: true, _count: { select: { itens: true } } },
      })

      return { categoria, bateria }
    })

    return reply.status(201).send(criado)
  })

  // ============================================================
  // PATCH /tipos-dispositivo/:id
  // ============================================================
  fastify.patch('/tipos-dispositivo/:id', { onRequest: [fastify.exigirPapeis(['ADMIN', 'HOMOLOGADOR'])] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const schema = z.object({
      nome: z.string().trim().min(2).max(60).optional(),
      icone: z.string().trim().min(1).max(40).optional(),
      camposFicha: z.array(z.string().min(1).max(40)).optional(),
      gruposOrdem: z.array(z.string().min(1).max(100)).optional(),
      gruposTitulos: z.record(z.string()).optional(),
      ativo: z.boolean().optional(),
      itensExistentes: z.array(z.string().uuid()).optional(),
      itensNovos: z
        .array(
          z.object({
            grupo: z.string().trim().min(1).max(100),
            nome: z.string().trim().min(1).max(200),
            descricaoAcao: z.string().trim().min(1).max(500),
            ordem: z.number().int().optional(),
          }),
        )
        .default([]),
      itensEditados: z
        .array(
          z.object({
            id: z.string().uuid(),
            nome: z.string().trim().min(1).max(200),
            descricaoAcao: z.string().trim().min(1).max(500).optional(),
          }),
        )
        .default([]),
    })
    const body = schema.parse(request.body)

    const categoria = await fastify.prisma.categoria.findUnique({
      where: { id },
      include: { baterias: { select: { id: true }, orderBy: { nome: 'asc' } } },
    })
    if (!categoria) return reply.status(404).send({ erro: 'Tipo de dispositivo não encontrado' })

    // O slug NÃO acompanha o nome: ele está na URL da planilha e em links já
    // salvos pelo time. Renomear é rotulagem, não mudança de endereço.
    const itensPedidos = body.itensExistentes
    if (itensPedidos && itensPedidos.length + body.itensNovos.length === 0) {
      return reply.status(400).send({ erro: 'O tipo precisa de ao menos um item de teste.' })
    }

    const resumo = {
      adicionados: 0,
      removidos: 0,
      /**
       * Itens tirados da bateria que tinham avaliação registrada.
       *
       * A linha sai da planilha na hora, mas o resultado fica guardado no
       * banco e volta inteiro se o item for remarcado — tirar item da
       * configuração não é motivo para destruir trabalho de bancada. A tela
       * usa esta lista para dizer o que foi guardado.
       */
      preservados: [] as string[],
    }

    /** Itens tirados da bateria, para conferir depois o que sobrou visível */
    let tirados: string[] = []

    await fastify.prisma.$transaction(async (tx) => {
      await tx.categoria.update({
        where: { id },
        data: {
          ...(body.nome !== undefined ? { nome: body.nome } : {}),
          ...(body.icone !== undefined ? { icone: body.icone } : {}),
          ...(body.camposFicha !== undefined ? { camposFicha: body.camposFicha } : {}),
          ...(body.gruposOrdem !== undefined ? { gruposOrdem: body.gruposOrdem } : {}),
          ...(body.gruposTitulos !== undefined ? { gruposTitulos: body.gruposTitulos } : {}),
          ...(body.ativo !== undefined ? { ativo: body.ativo } : {}),
        },
      })

      for (const editado of body.itensEditados) {
        await tx.itemTeste.update({
          where: { id: editado.id },
          data: {
            nome: editado.nome,
            ...(editado.descricaoAcao !== undefined ? { descricaoAcao: editado.descricaoAcao } : {}),
          },
        })
      }

      if (!itensPedidos) return

      let bateriaId = categoria.baterias[0]?.id
      if (!bateriaId) {
        const nova = await tx.bateriaTeste.create({
          data: {
            categoriaId: id,
            nome: `${body.nome ?? categoria.nome} — Padrão`,
            descricao: 'Bateria criada ao editar o tipo.',
          },
        })
        bateriaId = nova.id
      }

      const ultimaOrdem = new Map<string, number>()

      const idsNovos: string[] = []
      for (const novo of body.itensNovos) {
        let proxima = ultimaOrdem.get(novo.grupo)
        if (proxima === undefined) {
          const u = await tx.itemTeste.findFirst({
            where: { grupo: novo.grupo },
            orderBy: { ordem: 'desc' },
            select: { ordem: true },
          })
          proxima = u?.ordem ?? 0
        }
        proxima += 1
        ultimaOrdem.set(novo.grupo, proxima)
        const item = await tx.itemTeste.create({
          data: {
            grupo: novo.grupo,
            nome: novo.nome,
            descricaoAcao: novo.descricaoAcao,
            ordem: novo.ordem ?? proxima,
          },
        })
        idsNovos.push(item.id)
      }

      const existentes = await tx.itemTeste.findMany({
        where: { id: { in: itensPedidos } },
        select: { id: true },
      })
      const alvo = new Set([...existentes.map((i) => i.id), ...idsNovos])

      const atuais = new Set(
        (await tx.bateriaItem.findMany({ where: { bateriaId }, select: { itemId: true } })).map(
          (b) => b.itemId,
        ),
      )
      const entrando = [...alvo].filter((i) => !atuais.has(i))
      const saindo = [...atuais].filter((i) => !alvo.has(i))
      resumo.adicionados = entrando.length
      resumo.removidos = saindo.length
      tirados = saindo

      if (saindo.length) {
        await tx.bateriaItem.deleteMany({ where: { bateriaId, itemId: { in: saindo } } })
      }
      if (entrando.length) {
        const maior = await tx.bateriaItem.findFirst({
          where: { bateriaId },
          orderBy: { ordem: 'desc' },
          select: { ordem: true },
        })
        await tx.bateriaItem.createMany({
          data: entrando.map((itemId, i) => ({
            bateriaId,
            itemId,
            ordem: (maior?.ordem ?? 0) + i + 1,
          })),
        })
      }

      // As homologações abertas deste tipo acompanham a bateria: item novo
      // nasce pendente nelas, item retirado sai. O que JÁ FOI AVALIADO fica —
      // apagar resultado de teste por causa de uma edição de catálogo seria
      // destruir trabalho de bancada.
      const abertas = await tx.homologacao.findMany({
        where: { dispositivo: { categoriaId: id }, status: { in: [...EDITAVEIS] } },
        select: { id: true },
      })
      const idsAbertas = abertas.map((h) => h.id)
      if (!idsAbertas.length) return

      if (entrando.length) {
        await tx.resultado.createMany({
          data: idsAbertas.flatMap((homologacaoId) =>
            entrando.map((itemId) => ({ homologacaoId, itemId, status: StatusResultado.NAO_TESTADO })),
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
    })

    // O que ficou guardado: itens tirados que ainda têm resultado no banco.
    // A conta é sobre TODAS as colunas, não só as abertas — homologação
    // fechada nem passa pela reconciliação, e o resultado dela também
    // sobrevive. É esta lista que a tela mostra de volta.
    if (tirados.length) {
      const sobreviventes = await fastify.prisma.resultado.findMany({
        where: {
          itemId: { in: tirados },
          homologacao: { dispositivo: { categoriaId: id, ativo: true } },
        },
        select: { item: { select: { nome: true } } },
        distinct: ['itemId'],
      })
      resumo.preservados = sobreviventes.map((r) => r.item.nome)
    }

    const atualizada = await fastify.prisma.categoria.findUnique({ where: { id } })
    return { categoria: atualizada, ...resumo }
  })

  // ============================================================
  // DELETE /tipos-dispositivo/:id
  // ============================================================
  fastify.delete('/tipos-dispositivo/:id', { onRequest: [fastify.exigirPapeis(['ADMIN', 'HOMOLOGADOR'])] }, async (request, reply) => {
    const { id } = request.params as { id: string }

    const categoria = await fastify.prisma.categoria.findUnique({
      where: { id },
      include: { _count: { select: { dispositivos: true } }, baterias: { select: { id: true } } },
    })
    if (!categoria) return reply.status(404).send({ erro: 'Tipo de dispositivo não encontrado' })

    // Apagar levaria junto homologações e certificados emitidos. Tipo com
    // histórico se desativa: some do menu e o passado continua consultável
    // (mesma regra do `ativo` da categoria).
    if (categoria._count.dispositivos > 0) {
      return reply.status(409).send({
        erro: `"${categoria.nome}" tem ${categoria._count.dispositivos} modelo(s) cadastrado(s). Desative o tipo em vez de apagar — o histórico de homologação e os certificados emitidos dependem dele.`,
        dispositivos: categoria._count.dispositivos,
      })
    }

    const ids = categoria.baterias.map((b) => b.id)
    await fastify.prisma.$transaction([
      fastify.prisma.bateriaItem.deleteMany({ where: { bateriaId: { in: ids } } }),
      fastify.prisma.bateriaTeste.deleteMany({ where: { id: { in: ids } } }),
      fastify.prisma.categoria.delete({ where: { id } }),
    ])

    return reply.status(204).send()
  })
}

export default tiposDispositivoRoutes
