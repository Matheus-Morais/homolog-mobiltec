import { useState, useRef } from 'react'
import { api, ErroApi } from '@/lib/api'
import { Icone } from '@/componentes/Icone'
import type { AnexoObservacao } from '@/lib/tipos'

/**
 * Nota interna sobre um resultado.
 * Permite digitar texto, anexar .zip e colar prints com Ctrl+V.
 */
export function ModalObservacao({
  itemNome,
  modeloNome,
  textoAtual,
  autorEmail,
  atualizadoEm,
  salvando,
  aoSalvar,
  aoFechar,
}: {
  itemNome: string
  modeloNome: string
  textoAtual: string
  autorEmail?: string | null
  atualizadoEm?: string | null
  salvando: boolean
  aoSalvar: (texto: string) => void
  aoFechar: () => void
}) {
  const [texto, setTexto] = useState(textoAtual)
  const [fazendoUpload, setFazendoUpload] = useState(false)
  const [erroUpload, setErroUpload] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function processarArquivo(arquivo: File) {
    setErroUpload(null)
    const ext = arquivo.name.slice(arquivo.name.lastIndexOf('.')).toLowerCase()

    if (
      arquivo.type.startsWith('video/') ||
      ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.flv', '.wmv'].includes(ext)
    ) {
      setErroUpload('Vídeos não serão permitidos neste momento.')
      return
    }

    const permitido =
      arquivo.type.startsWith('image/') ||
      ['.png', '.jpg', '.jpeg', '.webp', '.zip'].includes(ext) ||
      arquivo.type === 'application/zip' ||
      arquivo.type === 'application/x-zip-compressed'

    if (!permitido) {
      setErroUpload('Formato não suportado. Envie arquivos .zip ou imagens (PNG, JPEG, WebP).')
      return
    }

    setFazendoUpload(true)
    try {
      const formData = new FormData()
      formData.append('arquivo', arquivo)
      const res = await api.postMultipart<AnexoObservacao>('/upload/anexo', formData)

      // Adiciona o anexo no corpo do texto da observação
      const tag = res.tipo === 'imagem'
        ? `\n[Print anexado: ${res.nome}](${res.url})`
        : `\n[Arquivo log/zip: ${res.nome}](${res.url})`
      setTexto((prev) => (prev ? `${prev.trimEnd()}${tag}` : tag.trim()))
    } catch (err) {
      setErroUpload(err instanceof ErroApi ? err.message : 'Falha ao enviar arquivo.')
    } finally {
      setFazendoUpload(false)
    }
  }

  function aoColar(e: React.ClipboardEvent) {
    const items = e.clipboardData?.items
    if (!items) return

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (file) {
          e.preventDefault()
          processarArquivo(file)
          break
        }
      }
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15,15,18,.45)' }}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') aoFechar()
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) aoSalvar(texto)
        }}
        className="w-full max-w-xl rounded-xl border shadow-xl"
        style={{ background: 'var(--color-popover)' }}
      >
        <div className="p-5 border-b flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Observação</h2>
            <p className="text-sm mt-0.5" style={{ color: 'var(--color-muted-foreground)' }}>
              {itemNome} · {modeloNome}
            </p>
          </div>
          <button
            type="button"
            onClick={aoFechar}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            title="Fechar"
          >
            <Icone nome="x" className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 space-y-3" onPaste={aoColar}>
          <textarea
            autoFocus
            rows={5}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Nota interna sobre este item. Você pode colar prints com Ctrl+V ou anexar arquivos .zip e imagens."
            className="w-full p-3 rounded-md border bg-transparent text-sm leading-relaxed resize-y outline-none focus:ring-1 focus:ring-primary"
            style={{ borderColor: 'var(--color-input)' }}
          />

          {erroUpload && (
            <div
              className="p-2 rounded-md text-xs font-medium"
              style={{ background: 'var(--color-destructive-soft)', color: 'var(--color-destructive-fg)' }}
            >
              {erroUpload}
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,.zip,application/zip"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) processarArquivo(f)
                e.target.value = ''
              }}
            />
            <button
              type="button"
              disabled={fazendoUpload}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium text-foreground bg-transparent hover:bg-muted transition-colors disabled:opacity-50 cursor-pointer"
              style={{ borderColor: 'var(--color-input)' }}
            >
              <Icone nome="anexo" className="h-3.5 w-3.5" />
              <span>{fazendoUpload ? 'Enviando…' : 'Anexar .zip ou print'}</span>
            </button>
            <span className="text-[11px] text-muted-foreground">
              Cole imagem com <kbd className="font-mono bg-muted px-1 py-0.5 rounded text-[10px]">Ctrl+V</kbd>
            </span>
          </div>
        </div>

        {autorEmail && (
          <div className="px-5 py-2 bg-muted/40 text-[11px] text-muted-foreground flex items-center justify-between border-t border-dashed" style={{ borderColor: 'var(--color-border)' }}>
            <span>Registrado por: <strong className="font-semibold text-foreground">{autorEmail}</strong></span>
            {atualizadoEm && (
              <span className="font-medium">
                {new Date(atualizadoEm).toLocaleDateString('pt-BR')} às{' '}
                {new Date(atualizadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
        )}

        <div className="p-5 border-t flex items-center justify-between gap-3">
          <p className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>
            <kbd className="font-mono">Esc</kbd> cancela ·{' '}
            <kbd className="font-mono">Ctrl+Enter</kbd> salva
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={aoFechar}
              className="px-4 py-2 rounded-md text-sm"
              style={{ color: 'var(--color-muted-foreground)' }}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => aoSalvar(texto)}
              disabled={salvando || fazendoUpload}
              className="px-4 py-2 rounded-md text-sm font-medium text-white disabled:opacity-50"
              style={{ background: 'var(--gradient-brand-purple)' }}
            >
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
