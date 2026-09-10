/**
 * Rotas de upload de anexos de observações (imagens e arquivos .zip).
 *
 * POST /upload/anexo -> upload de imagem ou arquivo .zip (bloqueia vídeos).
 */
import { FastifyPluginAsync } from 'fastify'
import path from 'node:path'
import { salvarAnexo } from '../lib/storage.js'

const TIPOS_PERMITIDOS: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'application/zip': '.zip',
  'application/x-zip-compressed': '.zip',
}

const EXTENSOES_VIDEO = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.flv', '.wmv', '.m4v']

const anexosRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    '/upload/anexo',
    {
      onRequest: [fastify.autenticar],
    },
    async (request, reply) => {
      const arquivo = await request.file()
      if (!arquivo) {
        return reply.status(400).send({ erro: 'Nenhum arquivo enviado.' })
      }

      const nomeOriginal = arquivo.filename || 'anexo'
      const extOriginal = path.extname(nomeOriginal).toLowerCase()

      // Bloqueio explícito de vídeos
      if (
        arquivo.mimetype.startsWith('video/') ||
        EXTENSOES_VIDEO.includes(extOriginal)
      ) {
        return reply.status(400).send({
          erro: 'Vídeos não serão permitidos neste momento.',
        })
      }

      // Validação de extensão/tipo
      let extensao = TIPOS_PERMITIDOS[arquivo.mimetype]
      if (!extensao && (extOriginal === '.zip' || extOriginal === '.png' || extOriginal === '.jpg' || extOriginal === '.jpeg' || extOriginal === '.webp')) {
        extensao = extOriginal
      }

      if (!extensao) {
        return reply.status(415).send({
          erro: 'Formato não suportado. Envie arquivos .zip ou imagens (PNG, JPEG, WebP).',
        })
      }

      let buffer: Buffer
      try {
        buffer = await arquivo.toBuffer()
      } catch {
        return reply.status(413).send({ erro: 'Arquivo muito grande. O limite máximo é de 50 MB.' })
      }

      let url: string
      try {
        url = await salvarAnexo(
          extensao,
          buffer,
          arquivo.mimetype,
          nomeOriginal,
        )
      } catch (err) {
        request.log.error({ err }, 'Falha ao salvar anexo')
        return reply.status(500).send({
          erro: 'Não foi possível salvar o arquivo anexado no armazenamento.',
        })
      }

      const tipoFormatado = arquivo.mimetype.startsWith('image/') || ['.png', '.jpg', '.jpeg', '.webp'].includes(extensao)
        ? 'imagem'
        : 'zip'

      return reply.status(201).send({
        url,
        nome: nomeOriginal,
        tipo: tipoFormatado,
        tamanho: buffer.length,
        criadoEm: new Date().toISOString(),
      })
    },
  )
}

export default anexosRoutes
