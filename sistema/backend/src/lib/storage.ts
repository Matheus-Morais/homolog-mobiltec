/**
 * Módulo de armazenamento de arquivos (Supabase Storage com fallback para disco local).
 *
 * Se `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` estiverem configurados no ambiente,
 * os uploads de fotos e PDFs são salvos diretamente nos buckets do Supabase Storage.
 * Caso contrário, os arquivos são salvos na pasta local `UPLOAD_DIR`.
 */
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const BUCKET_FOTOS = 'fotos-dispositivos'
const BUCKET_CERTIFICADOS = 'certificados'
const BUCKET_ANEXOS = 'anexos'

const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/+$/, '')
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

export const ehSupabaseStorageAtivo = Boolean(supabaseUrl && supabaseServiceKey)

function obterDiretorioUploads(subpasta: string): string {
  const base = process.env.UPLOAD_DIR ?? (process.env.VERCEL ? '/tmp/uploads' : './uploads')
  return path.resolve(base, subpasta)
}

/**
 * Salva a foto de um dispositivo.
 *
 * @param dispositivoId - ID do dispositivo vinculado.
 * @param extensao - Extensão do arquivo com ponto (ex: `.png`, `.jpg`).
 * @param buffer - Buffer com os bytes da imagem.
 * @param mime - MIME type da imagem (ex: `image/png`).
 * @returns URL pública do arquivo (Supabase Storage ou caminho local `/uploads/fotos/...`).
 */
export async function salvarFotoDispositivo(
  dispositivoId: string,
  extensao: string,
  buffer: Buffer,
  mime: string,
): Promise<string> {
  const nomeArquivo = `${dispositivoId}-${randomUUID().slice(0, 8)}${extensao}`

  if (ehSupabaseStorageAtivo) {
    const endpoint = `${supabaseUrl}/storage/v1/object/${BUCKET_FOTOS}/${nomeArquivo}`
    const resposta = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${supabaseServiceKey}`,
        'Content-Type': mime,
        'x-upsert': 'true',
      },
      body: new Uint8Array(buffer),
    })

    if (!resposta.ok) {
      const erroTexto = await resposta.text().catch(() => '')
      throw new Error(`Falha no upload para o Supabase Storage (${resposta.status}): ${erroTexto}`)
    }

    return `${supabaseUrl}/storage/v1/object/public/${BUCKET_FOTOS}/${nomeArquivo}`
  }

  // Fallback para disco local (ou /tmp se em serverless/Vercel)
  const dir = obterDiretorioUploads('fotos')
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, nomeArquivo), buffer)
  return `/uploads/fotos/${nomeArquivo}`
}

/**
 * Salva o arquivo PDF de um certificado emitido e arquivado.
 *
 * @param homologacaoId - ID da homologação referente ao certificado.
 * @param buffer - Buffer com os bytes do PDF gerado.
 * @returns URL pública do certificado (Supabase Storage ou caminho local `/uploads/certificados/...`).
 */
export async function salvarCertificadoPdf(
  homologacaoId: string,
  buffer: Buffer,
): Promise<string> {
  const nomeArquivo = `${homologacaoId}-${Date.now()}.pdf`

  if (ehSupabaseStorageAtivo) {
    const endpoint = `${supabaseUrl}/storage/v1/object/${BUCKET_CERTIFICADOS}/${nomeArquivo}`
    const resposta = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/pdf',
        'x-upsert': 'true',
      },
      body: new Uint8Array(buffer),
    })

    if (!resposta.ok) {
      const erroTexto = await resposta.text().catch(() => '')
      throw new Error(`Falha no upload do certificado para o Supabase Storage (${resposta.status}): ${erroTexto}`)
    }

    return `${supabaseUrl}/storage/v1/object/public/${BUCKET_CERTIFICADOS}/${nomeArquivo}`
  }

  // Fallback para disco local (ou /tmp se em serverless/Vercel)
  const dir = obterDiretorioUploads('certificados')
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, nomeArquivo), buffer)
  return `/uploads/certificados/${nomeArquivo}`
}

/**
 * Salva um anexo de observação (.zip ou imagem).
 *
 * @param extensao - Extensão com ponto (ex: `.zip`, `.png`).
 * @param buffer - Buffer com os bytes do arquivo.
 * @param mime - MIME type do arquivo.
 * @param nomeOriginal - Nome original para compor o arquivo de forma legível.
 * @returns URL pública ou local do anexo (`/uploads/anexos/...`).
 */
export async function salvarAnexo(
  extensao: string,
  buffer: Buffer,
  mime: string,
  nomeOriginal?: string,
): Promise<string> {
  const sanitize = (nomeOriginal ?? 'anexo')
    .replace(/\.[^/.]+$/, '')
    .replace(/[^\w.-]/g, '_')
    .slice(0, 30)
  const nomeArquivo = `${sanitize}-${randomUUID().slice(0, 8)}${extensao}`

  if (ehSupabaseStorageAtivo) {
    try {
      const endpoint = `${supabaseUrl}/storage/v1/object/${BUCKET_ANEXOS}/${nomeArquivo}`
      const resposta = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${supabaseServiceKey}`,
          'Content-Type': mime,
          'x-upsert': 'true',
        },
        body: new Uint8Array(buffer),
      })

      if (resposta.ok) {
        return `${supabaseUrl}/storage/v1/object/public/${BUCKET_ANEXOS}/${nomeArquivo}`
      }

      const erroTexto = await resposta.text().catch(() => '')
      console.warn(`[storage] Supabase Storage anexo (${resposta.status}): ${erroTexto}`)
    } catch (err) {
      console.warn('[storage] Falha ao comunicar com Supabase Storage:', err)
    }
  }

  // Fallback para disco local (ou /tmp se em serverless/Vercel)
  const dir = obterDiretorioUploads('anexos')
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, nomeArquivo), buffer)
  return `/uploads/anexos/${nomeArquivo}`
}

