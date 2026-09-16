import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ROTULO_GRUPO, ROTULO_GRUPO_CURTO, SIGLA_GRUPO } from '@/lib/tipos'

/**
 * O rótulo vertical do rail roxo da matriz.
 *
 * Na planilha inteira o grupo tem dezenas de linhas e o nome completo cabe.
 * Com filtro de itens ligado pode sobrar uma linha só — aí o texto girado
 * fica mais alto que a célula e, sem tratamento, vazava por cima dos grupos
 * vizinhos. Aqui ele mede e cai para a forma curta, depois para a sigla.
 */
export function RotuloGrupo({ grupo, titulo }: { grupo: string; titulo?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [nivel, setNivel] = useState(0)

  const nomeCompleto = titulo || (ROTULO_GRUPO as Record<string, string>)[grupo] || grupo
  const nomeCurto = titulo || (ROTULO_GRUPO_CURTO as Record<string, string>)[grupo] || grupo
  const sigla = (SIGLA_GRUPO as Record<string, string>)[grupo] || grupo.slice(0, 3).toUpperCase()

  const formas = [nomeCompleto, nomeCurto, sigla]

  // Como o span é `overflow: hidden` com altura máxima, scrollHeight devolve a
  // altura natural do texto — dá para comparar com o espaço disponível.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    if (nivel < formas.length - 1 && el.scrollHeight > el.clientHeight + 1) setNivel(nivel + 1)
  })

  // Mudou o filtro (ou a janela): recomeça pela forma completa
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observador = new ResizeObserver(() => setNivel(0))
    observador.observe(el.parentElement ?? el)
    return () => observador.disconnect()
  }, [])

  return (
    <span
      ref={ref}
      // Mesmo corpo e peso do nome do modelo na faixa do topo: os dois são
      // rótulos de eixo da planilha, um na horizontal e outro na vertical.
      className="text-[13px] font-semibold whitespace-nowrap text-white"
      title={nomeCompleto}
      style={{
        writingMode: 'vertical-rl',
        transform: 'rotate(180deg)',
        letterSpacing: '0.04em',
        maxHeight: '100%',
        overflow: 'hidden',
      }}
    >
      {formas[nivel]}
    </span>
  )
}
