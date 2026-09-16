import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ancorarMenu } from '@/lib/ancorarMenu'

export interface AcaoColuna {
  rotulo: string
  aoClicar: () => void
  /** Ponto ao lado do rótulo, para sinalizar conteúdo (observações escritas) */
  marcado?: boolean
  /** Destaca a ação que fecha ou reabre a homologação */
  destaque?: boolean
  /** Ação destrutiva como remover da planilha */
  destrutivo?: boolean
  /** Opção corrente, quando o menu é um seletor e não uma lista de ações */
  ativo?: boolean
}

/**
 * Menu de ações da coluna, atrás de um hambúrguer ao lado do nome do modelo.
 *
 * Antes eram quatro botões soltos no cabeçalho, ocupando duas linhas em cada
 * uma das 31 colunas. Recolhidos aqui, o cabeçalho volta a ser o nome do
 * modelo — e a altura da faixa cai pela metade.
 *
 * O menu é `fixed` e ancorado por `ancorarMenu`, como os outros da matriz: o
 * `thead` é `sticky` e recortaria um menu posicionado dentro dele.
 */
export function MenuColuna({
  modelo,
  acoes,
  marcador,
}: {
  /** Vai no `aria-label`: "Ações de {modelo}" */
  modelo: string
  acoes: AcaoColuna[]
  /** Ponto no próprio hambúrguer, para sinalizar filtro ligado */
  marcador?: boolean
}) {
  const [aberto, setAberto] = useState(false)
  const [posicao, setPosicao] = useState<{ x: number; y: number } | null>(null)
  const refBotao = useRef<HTMLButtonElement>(null)
  const refMenu = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!aberto) return
    const fechar = (e: MouseEvent) => {
      const alvo = e.target as Node
      if (refBotao.current?.contains(alvo) || refMenu.current?.contains(alvo)) return
      setAberto(false)
    }
    const aoTeclar = (e: KeyboardEvent) => e.key === 'Escape' && setAberto(false)
    document.addEventListener('mousedown', fechar)
    document.addEventListener('keydown', aoTeclar)
    return () => {
      document.removeEventListener('mousedown', fechar)
      document.removeEventListener('keydown', aoTeclar)
    }
  }, [aberto])

  useLayoutEffect(() => {
    if (!aberto || !refMenu.current || !refBotao.current) return
    const m = refMenu.current.getBoundingClientRect()
    setPosicao(
      ancorarMenu(
        refBotao.current.getBoundingClientRect(),
        { largura: m.width, altura: m.height },
        8,
        'fim',
      ),
    )
  }, [aberto])

  function abrir() {
    const r = refBotao.current?.getBoundingClientRect()
    if (r) setPosicao({ x: r.left, y: r.bottom + 4 })
    setAberto(true)
  }

  return (
    <>
      <button
        ref={refBotao}
        type="button"
        onClick={() => (aberto ? setAberto(false) : abrir())}
        aria-label={`Ações de ${modelo}`}
        aria-expanded={aberto}
        data-menu-coluna
        // O botão vive sobre a faixa roxa: traço branco e fundo translúcido,
        // que fica mais sólido quando aberto ou com filtro ligado
        className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded border text-white transition-colors hover:opacity-80"
        style={{
          background: aberto || marcador ? 'rgba(255,255,255,.28)' : 'rgba(255,255,255,.10)',
          borderColor: aberto || marcador ? 'rgba(255,255,255,.65)' : 'rgba(255,255,255,.35)',
        }}
      >
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden focusable="false">
          {[4, 8, 12].map((y) => (
            <rect key={y} x="2" y={y - 0.75} width="12" height="1.5" rx="0.75" fill="currentColor" />
          ))}
        </svg>
      </button>

      {aberto && posicao && (
        <div
          ref={refMenu}
          role="menu"
          data-menu-aberto
          className="fixed z-50 min-w-44 rounded-lg border py-1 shadow-lg"
          // `color` explícito: o menu é filho do `th` da faixa roxa, que
          // define texto branco — sem isto as opções ficam brancas sobre o
          // fundo branco do próprio menu, visíveis só no destaque do hover.
          style={{
            left: posicao.x,
            top: posicao.y,
            background: 'var(--color-popover)',
            color: 'var(--color-foreground)',
          }}
        >
          {acoes.map((a, i) => (
            <div key={a.rotulo}>
              {/* Um traço antes de fechar/reabrir ou remover */}
              {(a.destaque || a.destrutivo) && i > 0 && <div className="my-1 border-t" />}
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setAberto(false)
                  a.aoClicar()
                }}
                aria-current={a.ativo || undefined}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs font-normal transition-opacity hover:opacity-80"
                style={
                  a.destrutivo
                    ? { color: 'var(--color-destructive)', fontWeight: 500 }
                    : a.destaque
                      ? { color: 'var(--color-primary)', fontWeight: 600 }
                      : a.ativo
                        ? { background: 'var(--color-muted)', color: 'var(--color-primary)', fontWeight: 600 }
                        : undefined
                }
              >
                <span className="flex-1">{a.rotulo}</span>
                {a.marcado && (
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: 'var(--color-primary)' }}
                    aria-label="tem conteúdo"
                  />
                )}
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
