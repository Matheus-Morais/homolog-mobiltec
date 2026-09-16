import { useLayoutEffect, useRef, useState } from 'react'
import { ancorarMenu } from '@/lib/ancorarMenu'
import type { SecaoDetalheResultado } from '@/lib/detalhesResultado'

/**
 * Ponto de interrogação ao lado do status: passa o mouse e os detalhes da
 * funcionalidade aparecem num balão.
 *
 * Esse conteúdo morava numa coluna própria da tabela de resultados, que
 * ocupava 38% da largura para servir a poucas linhas. Fora da tabela, sobra
 * espaço para os quatro grupos caberem dois a dois.
 *
 * O balão é `position: fixed` pelo mesmo motivo dos menus da matriz: o card
 * do grupo tem `overflow-hidden` e recortaria um balão posicionado dentro
 * dele. `ancorarMenu` cuida de virar para cima quando não couber embaixo.
 */
export function DicaJustificativa({
  secoes,
}: {
  secoes: readonly SecaoDetalheResultado[]
}) {
  const [aberto, setAberto] = useState(false)
  const [posicao, setPosicao] = useState<{ x: number; y: number } | null>(null)
  const refGatilho = useRef<HTMLButtonElement>(null)
  const refBalao = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!aberto || !refBalao.current || !refGatilho.current) return
    const b = refBalao.current.getBoundingClientRect()
    // `fim`: o balão cresce para a **esquerda**. O `?` fica na borda direita
    // da linha, onde não há espaço à direita — e à esquerda sobra a largura
    // toda da tabela.
    setPosicao(
      ancorarMenu(
        refGatilho.current.getBoundingClientRect(),
        { largura: b.width, altura: b.height },
        8,
        'fim',
      ),
    )
  }, [aberto])

  function abrir() {
    const r = refGatilho.current?.getBoundingClientRect()
    // Posição provisória; o efeito acima corrige antes da pintura, quando já
    // dá para medir o balão.
    if (r) setPosicao({ x: r.left, y: r.bottom + 6 })
    setAberto(true)
  }

  return (
    <>
      <button
        ref={refGatilho}
        type="button"
        // `button` e não `span`: assim chega pelo teclado e o balão abre no
        // foco, não só no hover.
        aria-label="Ver detalhes da funcionalidade"
        aria-expanded={aberto}
        title=""
        onMouseEnter={abrir}
        onMouseLeave={() => setAberto(false)}
        onFocus={abrir}
        onBlur={() => setAberto(false)}
        data-dica
        // Roxo desde o início: em cinza o ícone só se anunciava depois que o
        // mouse já estava em cima — ou seja, para quem já tinha achado.
        // Bolinha menor com o "?" maior dentro: o glifo ganha nitidez sem o
        // ícone brigar de tamanho com a pastilha de status ao lado.
        className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold leading-none transition-colors"
        style={{
          borderColor: 'var(--color-primary)',
          color: 'var(--color-primary)',
          background: aberto ? 'var(--color-primary)' : 'transparent',
          ...(aberto ? { color: '#fff' } : null),
        }}
      >
        ?
      </button>

      {aberto && posicao && (
        <div
          ref={refBalao}
          role="tooltip"
          data-balao
          className="pointer-events-none fixed z-50 max-w-[22rem] rounded-lg px-3 py-2 text-xs leading-relaxed text-white shadow-lg"
          style={{
            left: posicao.x,
            top: posicao.y,
            background: 'var(--color-brand-purple)',
          }}
        >
          <dl className="space-y-2">
            {secoes.map((secao) => (
              <div key={secao.rotulo}>
                <dt className="font-semibold">{secao.rotulo}</dt>
                <dd className="mt-0.5 whitespace-pre-wrap">{secao.texto}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </>
  )
}
