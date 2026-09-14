import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ancorarMenu } from '@/lib/ancorarMenu'

export interface OpcaoFiltro {
  valor: string
  rotulo: string
}

/**
 * Dropdown da barra de filtros com busca digitável em tempo real.
 *
 * Existe em vez de um `<select>` nativo por um motivo só: o nativo mostra o
 * texto da opção selecionada quando fechado, então "Todos os fabricantes"
 * ocuparia a barra inteira no estado padrão. Aqui o botão fechado mostra o
 * rótulo curto ("Fabricante") e a lista aberta mostra o texto completo e
 * permite filtrar digitando pelo teclado.
 */
export function SeletorFiltro({
  rotuloCurto,
  rotuloTodos,
  valor,
  aoMudar,
  opcoes,
}: {
  /** Aparece no botão quando nada está selecionado */
  rotuloCurto: string
  /** Primeira opção da lista — o estado "sem filtro" */
  rotuloTodos: string
  valor: string
  aoMudar: (v: string) => void
  opcoes: OpcaoFiltro[]
}) {
  const [aberto, setAberto] = useState(false)
  const [busca, setBusca] = useState('')
  const [posicao, setPosicao] = useState<{ x: number; y: number; largura: number } | null>(null)
  const refRaiz = useRef<HTMLDivElement>(null)
  const refMenu = useRef<HTMLDivElement>(null)
  const refBotao = useRef<HTMLButtonElement>(null)
  const refInputBusca = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!aberto) return
    const aoClicarFora = (e: MouseEvent) => {
      const alvo = e.target as Node
      if (refRaiz.current?.contains(alvo) || refMenu.current?.contains(alvo)) return
      setAberto(false)
    }
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAberto(false)
    }
    // O menu é `fixed`, então acompanha scroll/resize pela posição recalculada
    const fechar = () => setAberto(false)
    document.addEventListener('mousedown', aoClicarFora)
    document.addEventListener('keydown', aoTeclar)
    window.addEventListener('resize', fechar)
    return () => {
      document.removeEventListener('mousedown', aoClicarFora)
      document.removeEventListener('keydown', aoTeclar)
      window.removeEventListener('resize', fechar)
    }
  }, [aberto])

  // Foco automático no input de busca ao abrir o dropdown
  useEffect(() => {
    if (aberto) {
      setBusca('')
      const timer = setTimeout(() => {
        refInputBusca.current?.focus()
      }, 40)
      return () => clearTimeout(timer)
    }
  }, [aberto])

  // A lista pode passar da borda de baixo (filtro de fabricante tem dezenas
  // de opções). Medida a altura real, o menu vira para cima se precisar.
  useLayoutEffect(() => {
    if (!aberto || !refMenu.current || !refBotao.current || !posicao) return
    const m = refMenu.current.getBoundingClientRect()
    const p = ancorarMenu(refBotao.current.getBoundingClientRect(), {
      largura: posicao.largura,
      altura: m.height,
    })
    if (p.x !== posicao.x || p.y !== posicao.y) setPosicao({ ...posicao, ...p })
    // `posicao` fora das dependências de propósito: o efeito só precisa rodar
    // na abertura, e incluí-lo faria o próprio `setPosicao` re-disparar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto])

  function alternar() {
    if (aberto) {
      setAberto(false)
      return
    }
    // `fixed` + coordenadas da tela: o card do cabeçalho tem `overflow-hidden`
    // e recortaria um menu posicionado com `absolute`.
    const r = refBotao.current?.getBoundingClientRect()
    if (r) {
      // Largura explícita é obrigatória: sem ela, um elemento `fixed` ocupa
      // todo o espaço da esquerda até a borda da janela, e os itens `w-full`
      // esticam junto. O menu acompanha o botão, com um mínimo para caber
      // o input e "Todos os fabricantes (12)".
      const largura = Math.max(r.width, 224)
      // Não deixa vazar pela direita da janela
      const x = Math.min(r.left, window.innerWidth - largura - 8)
      setPosicao({ x: Math.max(8, x), y: r.bottom + 4, largura })
    }
    setAberto(true)
  }

  const opcoesFiltradas = useMemo(() => {
    const t = busca.trim()
    if (!t) return [{ valor: '', rotulo: rotuloTodos }, ...opcoes]

    const normalizar = (str: string) =>
      str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    const tNorm = normalizar(t)

    const filtradas = opcoes.filter((o) => normalizar(o.rotulo).includes(tNorm))

    if (normalizar(rotuloTodos).includes(tNorm)) {
      return [{ valor: '', rotulo: rotuloTodos }, ...filtradas]
    }
    return filtradas
  }, [busca, opcoes, rotuloTodos])

  const ativo = valor !== ''
  const selecionada = opcoes.find((o) => o.valor === valor)

  return (
    <div ref={refRaiz} className="relative">
      <button
        ref={refBotao}
        type="button"
        onClick={alternar}
        aria-haspopup="listbox"
        aria-expanded={aberto}
        // Identidade estável: o texto do botão vira o valor escolhido, então
        // ele não serve para endereçar o filtro de fora
        data-filtro={rotuloCurto}
        title={ativo ? `${rotuloCurto}: ${selecionada?.rotulo}` : rotuloTodos}
        className={`relative px-2.5 py-1.5 text-sm flex items-center gap-1.5 max-w-48 transition-colors select-none cursor-pointer rounded-md outline-none focus:outline-none focus-visible:outline-none ${
          ativo
            ? 'font-semibold text-[var(--color-primary)]'
            : 'text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:bg-black/[0.035]'
        }`}
      >
        <span className="truncate">{ativo ? selecionada?.rotulo : rotuloCurto}</span>
        <span className={`text-[10px] shrink-0 opacity-60 transition-transform duration-150 ${aberto ? 'rotate-180' : ''}`}>▾</span>
        {ativo && (
          <span
            className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full"
            style={{ background: 'var(--color-primary)' }}
          />
        )}
      </button>

      {aberto && posicao && (
        <div
          ref={refMenu}
          role="listbox"
          className="fixed z-[100] max-h-80 overflow-y-auto rounded-lg border shadow-lg flex flex-col"
          style={{
            left: posicao.x,
            top: posicao.y,
            width: posicao.largura,
            background: 'var(--color-popover)',
            borderColor: 'var(--color-border)',
          }}
        >
          {/* Campo de busca digitável no topo */}
          <div
            className="p-2 border-b sticky top-0 z-10 shrink-0"
            style={{
              background: 'var(--color-popover)',
              borderColor: 'var(--color-border)',
            }}
          >
            <div className="relative flex items-center">
              <input
                ref={refInputBusca}
                type="text"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    if (opcoesFiltradas.length > 0) {
                      aoMudar(opcoesFiltradas[0].valor)
                      setAberto(false)
                    }
                  } else if (e.key === 'Escape') {
                    e.preventDefault()
                    setAberto(false)
                  }
                }}
                placeholder={`Filtrar ${rotuloCurto.toLowerCase()}…`}
                className="w-full pl-7 pr-6 py-1.5 text-xs rounded-md border bg-muted/40 text-foreground focus:bg-background focus:ring-1 focus:ring-primary outline-none transition-all placeholder:text-muted-foreground/60"
                style={{ borderColor: 'var(--color-border)' }}
              />
              <span className="absolute left-2 text-[11px] text-muted-foreground pointer-events-none select-none">
                🔍
              </span>
              {busca && (
                <button
                  type="button"
                  onClick={() => {
                    setBusca('')
                    refInputBusca.current?.focus()
                  }}
                  className="absolute right-2 text-muted-foreground hover:text-foreground text-xs p-0.5 rounded cursor-pointer transition-colors"
                  title="Limpar busca"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Lista de opções */}
          <div className="py-1 overflow-y-auto flex-1">
            {opcoesFiltradas.length === 0 ? (
              <div className="py-4 px-3 text-center text-xs text-muted-foreground italic">
                Nenhum {rotuloCurto.toLowerCase()} encontrado
              </div>
            ) : (
              opcoesFiltradas.map((o) => {
                const marcada = o.valor === valor
                return (
                  <button
                    key={o.valor || '__todos'}
                    type="button"
                    role="option"
                    aria-selected={marcada}
                    onClick={() => {
                      aoMudar(o.valor)
                      setAberto(false)
                    }}
                    className="w-full px-3 py-1.5 text-left text-sm truncate transition-colors hover:opacity-80 cursor-pointer"
                    style={{
                      background: marcada ? 'var(--color-muted)' : 'transparent',
                      fontWeight: marcada ? 600 : 400,
                      color: marcada ? 'var(--color-primary)' : 'inherit',
                    }}
                  >
                    {o.rotulo}
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

