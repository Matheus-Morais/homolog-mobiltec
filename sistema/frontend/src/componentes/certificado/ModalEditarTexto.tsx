import { useState } from 'react'

export interface EdicaoCertificado {
  /** 'divergencia' | 'assinaturaResponsavel' | 'assinaturaGerente' | 'assinaturaApoio' */
  tipo: string
  /** Para divergência: itemIds separados por vírgula. Vazio nas assinaturas. */
  chave: string
  textoAtual: string
}

const TITULO: Record<string, string> = {
  divergencia: 'Editar justificativa da divergência',
  assinaturaResponsavel: 'Responsável Técnico',
  assinaturaGerente: 'Gerente de Validação',
  assinaturaApoio: 'Apoio Adicional',
}

/**
 * Edição do texto clicado pelo lápis no preview do certificado.
 *
 * Para divergência, o texto grava como `justificativaTexto` — override da
 * justificativa da biblioteca (spec §4.2) — em todos os itens que compartilham
 * aquele parágrafo. Por isso o aviso de quantos itens serão afetados.
 */
export function ModalEditarTexto({
  edicao,
  salvando,
  aoSalvar,
  aoFechar,
}: {
  edicao: EdicaoCertificado
  salvando: boolean
  aoSalvar: (texto: string) => void
  aoFechar: () => void
}) {
  const [texto, setTexto] = useState(edicao.textoAtual)
  const ehDivergencia = edicao.tipo === 'divergencia'
  const qtdItens = ehDivergencia ? edicao.chave.split(',').filter(Boolean).length : 0

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15,15,18,.45)' }}
      onClick={aoFechar}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') aoFechar()
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) aoSalvar(texto)
        }}
        className="w-full max-w-2xl rounded-xl border shadow-xl"
        style={{ background: 'var(--color-popover)' }}
      >
        <div className="p-5 border-b">
          <h2 className="text-lg font-semibold">{TITULO[edicao.tipo] ?? 'Editar texto'}</h2>
          {ehDivergencia && qtdItens > 1 && (
            <p className="mt-1 text-sm" style={{ color: 'var(--color-warning-fg)' }}>
              Este parágrafo é compartilhado por {qtdItens} itens — a edição vale para todos.
            </p>
          )}
          {ehDivergencia && qtdItens <= 1 && (
            <p className="mt-1 text-sm" style={{ color: 'var(--color-muted-foreground)' }}>
              Substitui o texto da biblioteca só nesta homologação.
            </p>
          )}
        </div>

        <div className="p-5">
          {ehDivergencia ? (
            <textarea
              autoFocus
              rows={7}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              className="w-full p-3 rounded-md border bg-transparent text-sm leading-relaxed resize-y"
              style={{ borderColor: 'var(--color-input)' }}
            />
          ) : (
            <input
              autoFocus
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              className="w-full px-3 py-2 rounded-md border bg-transparent text-sm"
              style={{ borderColor: 'var(--color-input)' }}
            />
          )}
        </div>

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
              disabled={salvando || (ehDivergencia && !texto.trim())}
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
