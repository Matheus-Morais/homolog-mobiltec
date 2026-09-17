import { useState } from 'react'
import { Icone } from '@/componentes/Icone'
import type { ItemObservacaoGeral } from '@/lib/tipos'

/**
 * As Observações Gerais registradas durante a homologação (D421), em leitura.
 *
 * Passou a fazer parte da ficha de informações (D433): o Admin conferia os
 * logs e prints do parceiro por um botão separado na tela de validação, e
 * esse botão saiu — o material de sustentação pertence à ficha, ao lado do
 * resultado que ele justifica, não a uma janela à parte.
 *
 * O visualizador de imagem ampliada mora aqui dentro, e não em quem chama:
 * é detalhe da lista de anexos, e assim a ficha e a tela de validação não
 * precisam carregar estado que não é delas.
 */
export function BlocoObservacoesParceiro({ observacoes }: { observacoes: string | null }) {
  const [ampliada, setAmpliada] = useState<{ url: string; nome: string } | null>(null)
  const lista = parseObservacoes(observacoes)

  return (
    <section className="mt-6">
      <h2 className="label-caps mb-3">Observações e anexos do parceiro</h2>

      {lista.length === 0 ? (
        <div
          className="p-8 text-center rounded-lg border flex flex-col items-center justify-center text-muted-foreground"
          style={{ background: 'var(--color-card)', borderColor: 'var(--color-border)' }}
        >
          <Icone nome="anexo" className="h-8 w-8 mb-2 opacity-50" />
          <p className="text-sm font-medium">Nenhuma observação registrada pelo parceiro.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {lista.map((obs) => (
            <div
              key={obs.id}
              className="p-4 rounded-lg border space-y-2.5"
              style={{ background: 'var(--color-card)', borderColor: 'var(--color-border)' }}
            >
              <div className="flex items-baseline justify-between gap-2">
                <h4 className="text-sm font-semibold" style={{ color: 'var(--color-foreground)' }}>
                  {obs.titulo}
                </h4>
                <span className="text-[11px]" style={{ color: 'var(--color-muted-foreground)' }}>
                  {obs.autorNome && `${obs.autorNome} · `}
                  {formatarDataHora(obs.criadoEm)}
                </span>
              </div>

              <p
                className="text-xs leading-relaxed whitespace-pre-wrap"
                style={{ color: 'var(--color-foreground)' }}
              >
                {obs.texto}
              </p>

              {obs.anexos && obs.anexos.length > 0 && (
                <div className="pt-2 border-t mt-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider mb-2 text-muted-foreground">
                    Anexos ({obs.anexos.length})
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {obs.anexos.map((a) => {
                      const ehImagem = a.tipo === 'imagem' || /\.(png|jpe?g|webp)$/i.test(a.nome)
                      if (ehImagem) {
                        return (
                          <button
                            key={a.url}
                            type="button"
                            onClick={() => setAmpliada({ url: a.url, nome: a.nome })}
                            className="group relative flex flex-col items-center rounded-lg border overflow-hidden bg-muted/40 cursor-pointer hover:border-primary transition-all"
                            style={{ width: '100px' }}
                          >
                            <img src={a.url} alt={a.nome} className="h-16 w-full object-cover" />
                            <span className="w-full truncate px-1 py-0.5 text-[9px] text-center font-medium bg-popover">
                              {a.nome}
                            </span>
                            <span className="absolute top-1 right-1 bg-black/60 text-white rounded px-1 text-[8px] opacity-0 group-hover:opacity-100 transition-opacity">
                              Ampliar
                            </span>
                          </button>
                        )
                      }
                      return (
                        <a
                          key={a.url}
                          href={a.url}
                          download={a.nome}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-semibold bg-muted/30 hover:bg-muted transition-colors"
                          style={{ borderColor: 'var(--color-border)' }}
                        >
                          <span className="text-sm">📦</span>
                          <div className="min-w-0">
                            <p className="truncate max-w-[140px] font-medium leading-tight">
                              {a.nome}
                            </p>
                            {a.tamanho && (
                              <p className="text-[9px] text-muted-foreground">
                                {formatarTamanho(a.tamanho)}
                              </p>
                            )}
                          </div>
                          <Icone nome="baixar" className="h-3 w-3 shrink-0 text-primary" />
                        </a>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {ampliada && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80"
          onClick={() => setAmpliada(null)}
        >
          <div
            className="relative max-w-4xl max-h-[90vh] flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-full flex items-center justify-between pb-2 text-white text-xs">
              <span className="font-medium truncate max-w-md">{ampliada.nome}</span>
              <button
                type="button"
                onClick={() => setAmpliada(null)}
                className="px-2 py-1 rounded bg-white/20 hover:bg-white/30 text-white font-bold cursor-pointer"
              >
                ✕ Fechar
              </button>
            </div>
            <img
              src={ampliada.url}
              alt={ampliada.nome}
              className="max-h-[80vh] max-w-full object-contain rounded border border-white/20 shadow-2xl"
            />
          </div>
        </div>
      )}
    </section>
  )
}

/**
 * As observações são JSON desde D421, mas registros antigos guardam texto
 * puro — o fallback os mostra como uma observação única em vez de sumir com
 * eles.
 */
function parseObservacoes(raw?: string | null): ItemObservacaoGeral[] {
  if (!raw || !raw.trim()) return []
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed
  } catch {
    // plain text fallback
  }
  return [
    {
      id: 'legado',
      titulo: 'Observação Geral',
      texto: raw,
      autorNome: 'Parceiro',
      criadoEm: new Date().toISOString(),
      anexos: [],
    },
  ]
}

function formatarTamanho(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatarDataHora(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
