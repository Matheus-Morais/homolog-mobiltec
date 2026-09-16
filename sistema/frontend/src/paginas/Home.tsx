import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useVitrine } from '@/hooks/useVitrine'
import { Icone } from '@/componentes/Icone'
import { CardDispositivo } from '@/componentes/vitrine/CardDispositivo'
import { CardEmHomologacao } from '@/componentes/vitrine/CardEmHomologacao'
import { LoadingTela } from '@/componentes/LoadingTela'
import { ehSomenteLeitura } from '@/lib/tipos'
import { ErroApi } from '@/lib/api'
import type { DispositivoVitrine } from '@/lib/tipos'

type Aba = 'homologados' | 'em-homologacao' | 'revalidados'

/**
 * Modelo usado como exemplo enquanto nenhuma homologação real foi finalizada.
 *
 * O card é montado a partir do dispositivo de verdade — versão do agente,
 * Android, foto, contagens — em vez de dados inventados: o que se vê aqui é o
 * estado atual dele. O selo "Exemplo" continua, porque a homologação ainda não
 * está fechada; o card some sozinho quando existir modelo finalizado.
 */
const MODELO_EXEMPLO = /l400/i

/**
 * Painel de homologação — as duas visões que o parceiro terá do catálogo.
 *
 * Nada aqui edita: o que aparece vem da matriz, sozinho, conforme os testes
 * avançam e as homologações são finalizadas.
 */
export function Home() {
  const { data, isLoading, isError, error } = useVitrine()
  const [aba, setAba] = useState<Aba>('homologados')
  const [busca, setBusca] = useState('')
  const [categoria, setCategoria] = useState('')

  const containerLinhaRef = useRef<HTMLDivElement>(null)
  const barraBuscaRef = useRef<HTMLLabelElement>(null)
  const scrollCategoriasRef = useRef<HTMLDivElement>(null)
  const [podeScrollEsq, setPodeScrollEsq] = useState(false)
  const [podeScrollDir, setPodeScrollDir] = useState(false)
  const [larguraLimite, setLarguraLimite] = useState<number | null>(null)

  const verificarScroll = useCallback(() => {
    const el = scrollCategoriasRef.current
    if (!el) return
    setPodeScrollEsq(el.scrollLeft > 2)
    setPodeScrollDir(el.scrollLeft + el.clientWidth < el.scrollWidth - 4)
  }, [])

  const atualizarMedidas = useCallback(() => {
    if (barraBuscaRef.current && containerLinhaRef.current) {
      const containerLeft = containerLinhaRef.current.getBoundingClientRect().left
      const buscaRight = barraBuscaRef.current.getBoundingClientRect().right
      // Folga extra para que o dispositivo (ex: Totem 1) apareça por completo antes da seta
      const delta = buscaRight - containerLeft + 85
      if (delta > 200) {
        setLarguraLimite(Math.round(delta))
      }
    }
    verificarScroll()
  }, [verificarScroll])

  useEffect(() => {
    atualizarMedidas()
    window.addEventListener('resize', atualizarMedidas)
    return () => window.removeEventListener('resize', atualizarMedidas)
  }, [atualizarMedidas, data])

  function rolarCategorias(direcao: 'esq' | 'dir') {
    if (!scrollCategoriasRef.current) return
    const passo = 220
    scrollCategoriasRef.current.scrollBy({
      left: direcao === 'dir' ? passo : -passo,
      behavior: 'smooth',
    })
    setTimeout(verificarScroll, 250)
  }

  const { finalizados, exemplos, emAndamento, retestados, contagemPorCategoria } = useMemo(() => {
    const reais = data?.dispositivos ?? []

    const contagem = new Map<string, number>()
    for (const d of reais) {
      contagem.set(d.categoriaSlug, (contagem.get(d.categoriaSlug) ?? 0) + 1)
    }

    const termo = busca.trim().toLowerCase()
    const passa = (d: DispositivoVitrine) => {
      if (categoria && d.categoriaSlug !== categoria) return false
      if (!termo) return true
      return [d.nomeComercial, d.fabricante, d.modelo, d.versaoAgente, d.versaoSo]
        .join(' ')
        .toLowerCase()
        .includes(termo)
    }

    const filtrados = reais.filter(passa)
    const prontos = filtrados.filter((d) => ehSomenteLeitura(d.status))

    // O exemplo só existe enquanto a seção estaria vazia
    const base = prontos.length === 0 ? filtrados.find((d) => MODELO_EXEMPLO.test(d.modelo)) : undefined

    return {
      finalizados: prontos,
      exemplos: base ? [base] : [],
      emAndamento: filtrados.filter((d) => !ehSomenteLeitura(d.status)),
      // Modelos que voltaram para a bancada com outra versão do agente:
      // aparecem aqui além da sua aba de origem, porque a pergunta é outra
      // ("o que foi revalidado?"), não um estágio diferente.
      retestados: filtrados.filter((d) => d.numeroHomologacao > 1),
      contagemPorCategoria: contagem,
    }
  }, [data, busca, categoria])

  if (isLoading) {
    return <LoadingTela mensagem="Carregando dispositivos homologados…" />
  }

  if (isError || !data) {
    return (
      <div className="p-8 text-sm" style={{ color: 'var(--color-destructive)' }}>
        {error instanceof ErroApi ? error.message : 'Não foi possível carregar os dispositivos.'}
      </div>
    )
  }

  const total = data.dispositivos.length
  const cardsHomologados = [...finalizados, ...exemplos]

  return (
    // Conteúdo centralizado com largura máxima: em tela larga, tudo encostado
    // à esquerda deixava metade do painel vazia.
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-[76rem]">
      {/* Sem título aqui: quem nomeia a seção é a trilha da barra do card */}
      <header className="px-8 pt-6 pb-5">
        <p className="flex flex-wrap items-center gap-1.5 text-sm" style={{ color: 'var(--color-muted-foreground)' }}>
          {total} modelos no
          {/* Aqui o fundo é claro, então a marca aparece nas cores dela: roxo
              no nome, laranja no "4". A pastilha é de vidro — véu translúcido
              com desfoque, não um bloco de cor chapado. */}
          <span
            data-marca
            className="inline-flex items-center rounded-full border px-2 py-0.5 text-[13px] font-bold tracking-tight"
            style={{
              background: 'rgba(126,32,101,.07)',
              borderColor: 'rgba(126,32,101,.16)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              color: 'var(--color-primary)',
            }}
          >
            cloud
            <span style={{ color: 'var(--color-brand-orange)' }}>4</span>
            mobile
          </span>
          · {emAndamento.length} em homologação agora.
        </p>

        {/* Linha 1: que dispositivos entram na tela - estilo clean com limite da barra de busca e setas */}
        <div
          ref={containerLinhaRef}
          className="mt-5 flex items-center gap-3 border-b border-[var(--color-border)]"
          style={{
            maxWidth: larguraLimite ? `${larguraLimite}px` : '48.5rem',
            width: '100%',
          }}
        >
          <span
            className="text-xs font-semibold uppercase shrink-0 pb-2.5"
            style={{ color: 'var(--color-muted-foreground)', letterSpacing: '0.08em' }}
          >
            Dispositivos
          </span>
          <div className="h-4 w-px shrink-0 mb-2.5" style={{ background: 'var(--color-border)' }} />

          <div className="flex-1 min-w-0 flex items-center gap-2">
            {podeScrollEsq && (
              <button
                type="button"
                onClick={() => rolarCategorias('esq')}
                aria-label="Rolar dispositivos para esquerda"
                className="shrink-0 p-1 pb-2.5 text-[var(--color-primary)] hover:opacity-70 transition-opacity cursor-pointer select-none outline-none"
              >
                <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="var(--color-primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="10 13 5 8 10 3" />
                </svg>
              </button>
            )}

            <div
              ref={scrollCategoriasRef}
              onScroll={verificarScroll}
              className="flex items-center gap-5 overflow-x-auto scrollbar-none scroll-smooth flex-1 min-w-0"
            >
              <BotaoCategoria
                ativo={categoria === ''}
                aoClicar={() => setCategoria('')}
                rotulo="Todos"
                contagem={total}
              />
              {data.categorias.map((c) => (
                <BotaoCategoria
                  key={c.slug}
                  ativo={categoria === c.slug}
                  aoClicar={() => setCategoria(c.slug)}
                  rotulo={c.nome}
                  contagem={contagemPorCategoria.get(c.slug) ?? 0}
                />
              ))}
            </div>

            {podeScrollDir && (
              <button
                type="button"
                onClick={() => rolarCategorias('dir')}
                aria-label="Rolar dispositivos para direita"
                className="shrink-0 p-1 pb-2.5 text-[var(--color-primary)] hover:opacity-70 transition-opacity cursor-pointer select-none outline-none"
              >
                <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="var(--color-primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 3 11 8 6 13" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Linha 2: em que ponto da homologação eles estão — e a busca ao lado */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div
            className="inline-flex rounded-lg border p-0.5"
            style={{ background: 'var(--color-muted)' }}
            role="tablist"
          >
            {(
              [
                ['homologados', 'Homologados', cardsHomologados.length],
                ['em-homologacao', 'Em homologação', emAndamento.length],
                ['revalidados', 'Revalidados', retestados.length],
              ] as [Aba, string, number][]
            ).map(([valor, rotulo, n]) => (
              <button
                key={valor}
                type="button"
                role="tab"
                aria-selected={aba === valor}
                onClick={() => setAba(valor)}
                className="rounded-[6px] px-4 py-1.5 text-sm font-medium transition-colors"
                style={{
                  background: aba === valor ? 'var(--color-card)' : 'transparent',
                  color: aba === valor ? 'var(--color-foreground)' : 'var(--color-muted-foreground)',
                  boxShadow: aba === valor ? '0 1px 2px rgba(0,0,0,.06)' : undefined,
                }}
              >
                {rotulo}
                <span className="ml-1.5 opacity-60">{n}</span>
              </button>
            ))}
          </div>

          {/* Largura do texto do próprio placeholder, sem sobra à direita */}
          <label ref={barraBuscaRef} className="relative block w-full max-w-[22rem]">
            <span
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
              style={{ color: 'var(--color-muted-foreground)' }}
            >
              <Icone nome="busca" className="h-4 w-4" />
            </span>
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Pesquise o modelo, versão, fabricante, etc..."
              className="w-full rounded-lg border py-1.5 pl-9 pr-3 text-xs sm:text-sm placeholder:text-[var(--color-muted-foreground)]/70"
              style={{ background: 'var(--color-card)' }}
            />
          </label>
        </div>
      </header>

      <div className="px-8 pb-10">
        {aba === 'homologados' ? (
          <>
            {cardsHomologados.length === 0 ? (
              <Vazio>Nenhum modelo finalizado com esses filtros.</Vazio>
            ) : (
              <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,312px)]">
                {cardsHomologados.map((d) => (
                  <CardDispositivo key={d.homologacaoId} dispositivo={d} />

                ))}
              </div>
            )}
          </>
        ) : aba === 'em-homologacao' ? (
          <>
            {emAndamento.length === 0 ? (
              <Vazio>Nenhum modelo em teste com esses filtros.</Vazio>
            ) : (
              <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
                {emAndamento.map((d) => (
                  <CardEmHomologacao key={d.homologacaoId} dispositivo={d} />
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            {retestados.length === 0 ? (
              <Vazio>
                Nenhum modelo foi retestado ainda. Um reteste começa pela matriz, no botão
                "Reteste" da coluna do modelo.
              </Vazio>
            ) : (
              // Cada um com o card do seu estágio: retestado e finalizado é
              // catálogo; retestado e em teste ainda é andamento.
              <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,312px)]">
                {retestados.map((d) =>
                  ehSomenteLeitura(d.status) ? (
                    <CardDispositivo key={d.homologacaoId} dispositivo={d} />

                  ) : (
                    <CardEmHomologacao key={d.homologacaoId} dispositivo={d} />
                  ),
                )}
              </div>
            )}
          </>
        )}
        </div>
      </div>
    </div>
  )
}

function Vazio({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border p-8 text-center" style={{ background: 'var(--color-card)' }}>
      <p className="text-sm" style={{ color: 'var(--color-muted-foreground)' }}>
        {children}
      </p>
      <Link
        to="/matriz/pos"
        className="mt-3 inline-block text-sm underline underline-offset-2"
        style={{ color: 'var(--color-primary)' }}
      >
        Ir para a matriz
      </Link>
    </div>
  )
}

function BotaoCategoria({
  ativo,
  aoClicar,
  rotulo,
  contagem,
}: {
  ativo: boolean
  aoClicar: () => void
  rotulo: string
  contagem: number
}) {
  return (
    <button
      type="button"
      onClick={aoClicar}
      className={`relative shrink-0 pb-2.5 pt-1 px-1 text-[13px] transition-colors whitespace-nowrap select-none cursor-pointer flex items-center gap-1.5 outline-none focus:outline-none focus-visible:outline-none ${
        ativo
          ? 'font-semibold text-[var(--color-primary)]'
          : 'font-medium text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]'
      }`}
    >
      <span>{rotulo}</span>
      <span className={`text-xs ${ativo ? 'opacity-80 font-medium' : 'opacity-60 font-normal'}`}>
        {contagem}
      </span>
      {ativo && (
        <span
          className="absolute bottom-0 left-0 right-0 h-[2.5px] rounded-full"
          style={{ background: 'var(--color-primary)' }}
        />
      )}
    </button>
  )
}
