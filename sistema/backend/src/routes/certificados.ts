/**
 * Certificado (spec §8).
 *
 * GET  /homologacoes/:id/certificado/preview → HTML vivo, sempre com os dados
 *      atuais da homologação. É o que o front mostra no iframe: mexeu na
 *      matriz, o preview reflete na hora.
 * GET  /homologacoes/:id/certificado/pdf     → renderiza o mesmo HTML em PDF
 * POST /homologacoes/:id/certificados        → EMITE: grava o arquivo e o
 *      snapshot JSON. Certificado emitido é imutável (spec §11.3)
 * GET  /homologacoes/:id/certificados        → histórico de emissões
 */
import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { salvarCertificadoPdf } from '../lib/storage.js'
import {
  analiseComoBlocos,
  gerarCertificadoHtml,
  lerAnaliseManual,
  type HomologacaoCertificado,
} from '../services/certificado.js'

const INCLUDE_CERTIFICADO = {
  dispositivo: true,
  responsavel: { select: { id: true, nome: true, empresa: true } },
  gerente: { select: { nome: true } },
  apoio: { select: { nome: true } },
  historicoStatus: {
    where: { statusNovo: 'APROVADO' },
    orderBy: { criadoEm: 'desc' },
    take: 1,
    select: { usuario: { select: { nome: true } } },
  },
  resultados: {
    include: {
      item: true,
      justificativa: true,
    },
  },
} as const

const GERENTE_VALIDACAO_MOBILTEC = 'Rafael Cordeiro'

function projetarParaAmbiente(h: any, papel: string) {
  if (papel === 'PARCEIRO') return h
  return {
    ...h,
    assinaturaResponsavel: h.historicoStatus?.[0]?.usuario?.nome || h.responsavel?.nome || '',
    assinaturaGerente: GERENTE_VALIDACAO_MOBILTEC,
    assinaturaApoio: null,
    apoio: null,
  }
}

const certificadoRoutes: FastifyPluginAsync = async (fastify) => {

  /**
   * Carrega a homologação para o certificado.
   *
   * Enquanto ela está aberta, o documento segue a bateria do tipo — a mesma
   * regra da planilha: tirar um item da configuração tira a linha das duas,
   * senão a tela e o documento contariam coisas diferentes.
   *
   * Fechada, não. Homologação aprovada é registro: o que foi atestado ali não
   * muda porque alguém editou o tipo depois. (Certificado já emitido é arquivo
   * em disco com snapshot próprio, e não passa por aqui.)
   */
  async function carregar(id: string) {
    const h = await fastify.prisma.homologacao.findUnique({
      where: { id },
      include: INCLUDE_CERTIFICADO,
    })
    if (!h) return h

    const congelada = h.status === 'APROVADO' || h.status === 'PUBLICADO'
    if (congelada) return h

    const daBateria = await fastify.prisma.bateriaItem.findMany({
      where: { bateriaId: h.bateriaId },
      select: { itemId: true },
    })
    const naBateria = new Set(daBateria.map((b) => b.itemId))
    h.resultados = h.resultados.filter((r) => naBateria.has(r.itemId))
    return h
  }

  async function parceiroPodeAcessar(h: any, usuarioId: string) {
    if (h.responsavel?.id === usuarioId) return true
    const usuario = await fastify.prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: { empresa: true },
    })
    return Boolean(
      usuario?.empresa &&
        h.responsavel?.empresa &&
        usuario.empresa.trim().toLowerCase() === h.responsavel.empresa.trim().toLowerCase(),
    )
  }

  /** Renderiza o HTML em PDF A4 com o Playwright (§8.4) */
  async function renderizarPdf(html: string): Promise<Buffer> {
    try {
      // Import dinâmico usando specifier dinâmico para evitar falhas de empacotamento em ambientes serverless
      const moduleName = 'playwright'
      const { chromium } = await import(moduleName)
      const navegador = await chromium.launch()
      try {
        const pagina = await navegador.newPage()
        await pagina.setContent(html, { waitUntil: 'networkidle' })
        return await pagina.pdf({
          format: 'A4',
          printBackground: true,
          margin: { top: '0', right: '0', bottom: '0', left: '0' },
        })
      } finally {
        await navegador.close()
      }
    } catch (err: any) {
      console.warn('Playwright não disponível:', err?.message)
      const errComStatus: any = new Error(
        'Geração de PDF via servidor indisponível neste ambiente. Utilize o botão "Visualizar Certificado" e imprima como PDF (Ctrl+P).',
      )
      errComStatus.statusCode = 503
      throw errComStatus
    }
  }

  // ============================================================
  // GET preview — HTML vivo
  // ============================================================
  fastify.get('/homologacoes/:id/certificado/preview', {
    onRequest: [fastify.autenticar],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { editavel } = request.query as { editavel?: string }
    const h = await carregar(id)
    if (!h) return reply.status(404).send({ erro: 'Homologação não encontrada' })

    // Parceiro só visualiza certificado se homologação estiver aprovada ou publicada
    if (request.user.papel === 'PARCEIRO') {
      if (!(await parceiroPodeAcessar(h, request.user.id))) {
        return reply.status(403).send({ erro: 'Este certificado não pertence ao ambiente do parceiro autenticado.' })
      }
      if (h.status !== 'APROVADO' && h.status !== 'PUBLICADO') {
        return reply.status(403).send({ erro: 'O certificado só fica disponível para parceiros após aprovação oficial pela Mobiltec.' })
      }
    }

    const podeEditar = request.user.papel !== 'PARCEIRO' && editavel === '1'

    return reply
      .type('text/html; charset=utf-8')
      .send(
        gerarCertificadoHtml(projetarParaAmbiente(h, request.user.papel) as unknown as HomologacaoCertificado, {
          editavel: podeEditar,
        }),
      )
  })

  // ============================================================
  // PUT texto de divergência — edição pelo lápis do preview
  // Grava `justificativaTexto` como override (spec §4.2) nos resultados que
  // compartilham o parágrafo, sem tocar na justificativa da biblioteca.
  // ============================================================
  fastify.put('/homologacoes/:id/certificado/divergencia', {
    onRequest: [fastify.exigirPapeis(['ADMIN', 'HOMOLOGADOR'])],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }

    const { itemIds, texto } = z
      .object({
        itemIds: z.array(z.string().uuid()).min(1),
        texto: z.string().min(1).max(4000),
      })
      .parse(request.body)

    const h = await fastify.prisma.homologacao.findUnique({
      where: { id },
      select: { status: true },
    })
    if (!h) return reply.status(404).send({ erro: 'Homologação não encontrada' })
    if (h.status === 'APROVADO' || h.status === 'PUBLICADO') {
      return reply.status(403).send({ erro: 'Homologação aprovada é somente leitura. Reabra para editar.' })
    }

    const { count } = await fastify.prisma.resultado.updateMany({
      where: { homologacaoId: id, itemId: { in: itemIds } },
      data: { justificativaTexto: texto.trim() },
    })

    return { atualizados: count }
  })

  // ============================================================
  // Análise das Divergências escrita à mão
  //
  // A seção nasce das justificativas, mas o certificado é de um modelo
  // específico e às vezes precisa de um tema que nenhuma justificativa cobre.
  // Aqui o técnico assume a seção inteira: edita e apaga até os blocos que
  // vieram por padrão, acrescenta os seus, e volta ao automático quando quiser.
  // ============================================================
  fastify.get('/homologacoes/:id/certificado/analise', {
    onRequest: [fastify.autenticar],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const h = await carregar(id)
    if (!h) return reply.status(404).send({ erro: 'Homologação não encontrada' })

    const manual = lerAnaliseManual(h.analiseDivergencias)
    const automaticos = analiseComoBlocos(h.resultados)

    let blocosFinais = manual?.blocos ?? automaticos
    if (manual && h.status !== 'APROVADO' && h.status !== 'PUBLICADO') {
      const atualizados = [...manual.blocos]
      for (const auto of automaticos) {
        if (!auto.texto) continue
        const idx = atualizados.findIndex(
          (b) => b.subtitulo === auto.subtitulo || b.id === auto.id || (auto.subtitulo && b.subtitulo?.includes(auto.subtitulo)),
        )
        if (idx >= 0) {
          atualizados[idx] = { ...atualizados[idx], texto: auto.texto }
        } else {
          atualizados.push(auto)
        }
      }
      blocosFinais = atualizados
    }

    return {
      manual: manual !== null,
      blocos: blocosFinais,
      vistos: manual?.vistos ?? [],
      novas: [],
      foraDoDocumento: 0,
      somenteLeitura: h.status === 'APROVADO' || h.status === 'PUBLICADO',
    }
  })

  fastify.put('/homologacoes/:id/certificado/analise', {
    onRequest: [fastify.exigirPapeis(['ADMIN', 'HOMOLOGADOR'])],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }

    const { blocos, vistos } = z
      .object({
        // `null` devolve a seção ao automático
        blocos: z
          .array(
            z.object({
              id: z.string().min(1).max(64),
              titulo: z.string().max(200).default(''),
              subtitulo: z.string().max(400).default(''),
              texto: z.string().max(4000).default(''),
            }),
          )
          .nullable(),
        /** Justificativas que o técnico já decidiu o que fazer com */
        vistos: z.array(z.string().max(4000)).optional(),
      })
      .parse(request.body)

    const h = await carregar(id)
    if (!h) return reply.status(404).send({ erro: 'Homologação não encontrada' })
    if (h.status === 'APROVADO' || h.status === 'PUBLICADO') {
      return reply.status(403).send({ erro: 'Homologação aprovada é somente leitura. Reabra para editar.' })
    }

    // `vistos` só muda por gesto explícito do técnico — assumir a seção,
    // trazer uma justificativa ou dispensá-la —, e por isso vem do cliente.
    //
    // A primeira versão recalculava aqui, marcando como tratada toda
    // justificativa que existisse no momento do salvamento. O efeito foi
    // engolir em silêncio justificativas escritas na planilha entre uma
    // edição e outra: elas nunca viravam bloco e nunca mais eram oferecidas.
    const anterior = lerAnaliseManual(h.analiseDivergencias)
    const marcados = [...new Set(vistos ?? anterior?.vistos ?? [])].filter(Boolean)

    await fastify.prisma.homologacao.update({
      where: { id },
      data: { analiseDivergencias: blocos ? { blocos, vistos: marcados } : Prisma.DbNull },
    })

    return { manual: blocos !== null, blocos: blocos ?? [] }
  })

  // ============================================================
  // GET pdf — sem gravar nada
  // ============================================================
  fastify.get('/homologacoes/:id/certificado/pdf', {
    onRequest: [fastify.autenticar],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const h = await carregar(id)
    if (!h) return reply.status(404).send({ erro: 'Homologação não encontrada' })

    // Parceiro só faz download se a homologação estiver aprovada ou publicada
    if (request.user.papel === 'PARCEIRO') {
      if (!(await parceiroPodeAcessar(h, request.user.id))) {
        return reply.status(403).send({ erro: 'Este certificado não pertence ao ambiente do parceiro autenticado.' })
      }
      if (h.status !== 'APROVADO' && h.status !== 'PUBLICADO') {
        return reply.status(403).send({ erro: 'O download do certificado só é permitido após aprovação formal pela Mobiltec.' })
      }
    }

    // Se já houver um certificado emitido com arquivo em disco, serve diretamente
    const emitido = await fastify.prisma.certificadoEmitido.findFirst({
      where: { homologacaoId: id, formato: 'PDF' },
      orderBy: { emitidoEm: 'desc' },
    })

    const nome = `certificado-${h.dispositivo.fabricante}-${h.dispositivo.modelo}-agente-${h.versaoAgente}.pdf`.replace(
      /[^\w.-]/g,
      '_',
    )

    // O arquivo arquivado pode ter sido emitido no ambiente do parceiro.
    // Usuários Mobiltec precisam de uma renderização contextual nova para
    // garantir que o Apoio adicional nunca vaze pelo PDF histórico.
    if (request.user.papel === 'PARCEIRO' && emitido && emitido.arquivoUrl) {
      if (emitido.arquivoUrl.startsWith('http://') || emitido.arquivoUrl.startsWith('https://')) {
        try {
          const resp = await fetch(emitido.arquivoUrl)
          if (resp.ok) {
            const bufferArquivo = Buffer.from(await resp.arrayBuffer())
            return reply
              .type('application/pdf')
              .header('Content-Disposition', `attachment; filename="${nome}"`)
              .send(bufferArquivo)
          }
        } catch (errRemoto) {
          request.log.warn({ err: errRemoto }, 'Falha ao buscar PDF do Supabase Storage')
        }
      }

      if (emitido.arquivoUrl.startsWith('/uploads/')) {
        const base = path.resolve(process.env.UPLOAD_DIR ?? './uploads')
        let caminhoLocal = path.resolve(base, emitido.arquivoUrl.replace('/uploads/', ''))
        if (!existsSync(caminhoLocal)) {
          caminhoLocal = path.resolve('/tmp/uploads', emitido.arquivoUrl.replace('/uploads/', ''))
        }
        if (existsSync(caminhoLocal)) {
          const bufferArquivo = readFileSync(caminhoLocal)
          return reply
            .type('application/pdf')
            .header('Content-Disposition', `attachment; filename="${nome}"`)
            .send(bufferArquivo)
        }
      }
    }

    const html = gerarCertificadoHtml(projetarParaAmbiente(h, request.user.papel) as unknown as HomologacaoCertificado)

    try {
      const pdf = await renderizarPdf(html)
      return reply
        .type('application/pdf')
        .header('Content-Disposition', `attachment; filename="${nome}"`)
        .send(pdf)
    } catch (errPdf: any) {
      // Se a requisição veio direto de um navegador via barra de endereço (Accept inclui text/html)
      if (request.headers.accept?.includes('text/html')) {
        const htmlAutoPrint = html.replace(
          '</body>',
          '<script>window.addEventListener("load", function() { setTimeout(function() { window.print(); }, 400); });</script></body>',
        )
        return reply.type('text/html').send(htmlAutoPrint)
      }

      return reply.status(503).send({
        erro: 'Geração de PDF no servidor indisponível neste ambiente.',
        mensagem: 'Utilize a opção de visualização e imprima como PDF (Salvar como PDF no navegador).',
        previewUrl: `/homologacoes/${id}/certificado`,
      })
    }
  })

  // ============================================================
  // POST — emite e arquiva (imutável)
  // ============================================================
  fastify.post('/homologacoes/:id/certificados', {
    onRequest: [fastify.exigirPapeis(['ADMIN', 'HOMOLOGADOR'])],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }

    const { formato } = z
      .object({ formato: z.enum(['PDF', 'PPTX']).default('PDF') })
      .parse(request.body ?? {})

    if (formato === 'PPTX') {
      return reply.status(501).send({
        erro: 'Exportação PPTX ainda não implementada — é Fase 2 do roadmap. Use PDF.',
      })
    }

    const h = await carregar(id)
    if (!h) return reply.status(404).send({ erro: 'Homologação não encontrada' })

    // Os dois casos que saem em branco do documento (ver `renderStatus`)
    const naoTestados = h.resultados.filter(r => r.status === 'NAO_TESTADO').length
    const semJustificativa = h.resultados.filter(
      r =>
        ['FALHA', 'NAO_SUPORTADO', 'COM_RESSALVA'].includes(r.status) &&
        !r.justificativaTexto?.trim() &&
        !r.justificativa?.texto?.trim(),
    ).length
    const pendentes = naoTestados + semJustificativa
    const html = gerarCertificadoHtml(projetarParaAmbiente(h, request.user.papel) as unknown as HomologacaoCertificado)

    let pdf: Buffer
    try {
      pdf = await renderizarPdf(html)
    } catch (err: any) {
      return reply.status(503).send({
        erro: 'Emissão automatizada de arquivo PDF no servidor indisponível neste ambiente serverless.',
        detalhes: 'Utilize a impressão do navegador (Ctrl+P / Salvar como PDF) para arquivar o certificado.',
      })
    }

    const arquivoUrl = await salvarCertificadoPdf(id, pdf)

    // Snapshot dos dados no momento da emissão — o cliente pode pedir
    // reemissão idêntica anos depois (spec §4.2 / §11.3).
    const certificado = await fastify.prisma.certificadoEmitido.create({
      data: {
        homologacaoId: id,
        formato: 'PDF',
        arquivoUrl,
        snapshot: JSON.parse(JSON.stringify(h)),
        emitidoPor: request.user.id,
      },
      include: { usuario: { select: { nome: true } } },
    })

    return reply.status(201).send({
      ...certificado,
      // A emissão não é bloqueada por pendências, mas o front precisa avisar (§10.6)
      aviso: pendentes > 0
        ? [
            naoTestados > 0 && `${naoTestados} não testado(s)`,
            semJustificativa > 0 && `${semJustificativa} divergência(s) sem justificativa`,
          ]
            .filter(Boolean)
            .join(' e ') + ' saíram em branco no certificado.'
        : null,
    })
  })

  // ============================================================
  // GET — histórico de emissões
  // ============================================================
  fastify.get('/homologacoes/:id/certificados', {
    onRequest: [fastify.autenticar],
  }, async (request) => {
    const { id } = request.params as { id: string }
    return fastify.prisma.certificadoEmitido.findMany({
      where: { homologacaoId: id },
      select: {
        id: true,
        formato: true,
        arquivoUrl: true,
        emitidoEm: true,
        usuario: { select: { nome: true } },
      },
      orderBy: { emitidoEm: 'desc' },
    })
  })
}

export default certificadoRoutes
