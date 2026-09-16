/**
 * Instância e configuração do Fastify.
 *
 * Exporta a fábrica `criarApp()` para reutilização tanto pelo servidor local
 * (server.ts) quanto pela função serverless em produção na Vercel (api/index.ts).
 */
import 'dotenv/config'
import Fastify, { FastifyInstance } from 'fastify'
import cors from '@fastify/cors'
import estatico from '@fastify/static'
import multipart from '@fastify/multipart'
import path from 'node:path'
import { mkdirSync, existsSync } from 'node:fs'

import jwtPlugin from './plugins/jwt.js'
import prismaPlugin from './plugins/prisma.js'
import { registrarErrorHandler } from './middlewares/error-handler.js'
import authRoutes from './routes/auth.js'
import dispositivoRoutes from './routes/dispositivos.js'
import catalogoRoutes from './routes/catalogo.js'
import homologacaoRoutes from './routes/homologacoes.js'
import matrizRoutes from './routes/matriz.js'
import tiposDispositivoRoutes from './routes/tipos-dispositivo.js'
import certificadoRoutes from './routes/certificados.js'
import vitrineRoutes from './routes/vitrine.js'
import parceirosRoutes from './routes/parceiros.js'
import anexosRoutes from './routes/anexos.js'
import notificacoesRoutes from './routes/notificacoes.js'

export async function criarApp(): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: {
      transport: process.env.NODE_ENV === 'development'
        ? { target: 'pino-pretty' }
        : undefined,
    },
  })

  registrarErrorHandler(fastify)

  // Plugins de infraestrutura
  await fastify.register(cors, {
    origin: true,
    credentials: true,
  })
  await fastify.register(prismaPlugin)
  await fastify.register(jwtPlugin)

  // Arquivos gerados / uploads locais (em serverless, usa /tmp se não for Supabase Storage)
  const dirUploads = path.resolve(
    process.env.UPLOAD_DIR ?? (process.env.VERCEL ? '/tmp/uploads' : './uploads'),
  )
  try {
    if (!existsSync(dirUploads)) {
      mkdirSync(dirUploads, { recursive: true })
    }
  } catch {
    /* /tmp filesystem em serverless */
  }
  await fastify.register(estatico, { root: dirUploads, prefix: '/uploads/' })

  // Multipart para foto do dispositivo e anexos (.zip e imagens até 50 MB)
  await fastify.register(multipart, { limits: { fileSize: 50 * 1024 * 1024, files: 1 } })

  // Rotas da aplicação
  await fastify.register(authRoutes)
  await fastify.register(dispositivoRoutes)
  await fastify.register(catalogoRoutes)
  await fastify.register(homologacaoRoutes)
  await fastify.register(matrizRoutes)
  await fastify.register(tiposDispositivoRoutes)
  await fastify.register(certificadoRoutes)
  await fastify.register(vitrineRoutes)
  await fastify.register(parceirosRoutes)
  await fastify.register(anexosRoutes)
  await fastify.register(notificacoesRoutes)

  // Health check
  fastify.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }))

  return fastify
}
