import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/contextos/AuthContext'
import { useCategorias } from '@/hooks/useVitrine'
import { useListaHomologacoes } from '@/hooks/useHomologacao'
import { useParceiros } from '@/hooks/useParceiros'
import { ancorarMenu } from '@/lib/ancorarMenu'
import { LogoMobiltec } from './LogoMobiltec'
import { Icone, iconeDaCategoria, type NomeIcone } from './Icone'
import { CentralNotificacoes } from './CentralNotificacoes'

const CHAVE_MENU = 'homolog.menu-aberto'

interface ItemMenuDados {
  para: string
  rotulo: string
  icone: NomeIcone
  fim: boolean
}


/**
 * Item do menu que abre um grupo de opções, e não uma tela.
 *
 * Com o menu aberto o grupo se desdobra no lugar, recuado, ao passar o mouse
 * ou ao clicar (fixando o estado). Recolhido não há onde desdobrar — aí as opções
 * saem num painel flutuante ancorado ao lado.
 */
function GrupoMenu({
  item,
  filhos,
  aberto,
  totalPendentes = 0,
}: {
  item: Omit<ItemMenuDados, 'fim'>
  filhos: ItemMenuDados[]
  aberto: boolean
  totalPendentes?: number
}) {
  const { pathname } = useLocation()
  const noGrupo = filhos.some((f) => pathname === f.para || pathname.startsWith(`${f.para}/`))
  const [expandido, setExpandido] = useState(noGrupo)
  const [emHover, setEmHover] = useState(false)
  const [flutuante, setFlutuante] = useState<{ x: number; y: number } | null>(null)
  const refBotao = useRef<HTMLButtonElement>(null)
  const refPainel = useRef<HTMLDivElement>(null)
  const refTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Navegar para dentro do grupo o abre e o fixa aberto
  useEffect(() => {
    if (noGrupo) setExpandido(true)
  }, [noGrupo])

  // Recolher o menu fecha o desdobramento: ele não tem onde caber em 64px
  useEffect(() => {
    if (!aberto) {
      setExpandido(false)
      setEmHover(false)
    } else {
      setFlutuante(null)
    }
  }, [aberto])

  // Limpeza de timeout ao desmontar
  useEffect(() => {
    return () => {
      if (refTimeout.current) clearTimeout(refTimeout.current)
    }
  }, [])

  function aoEntrarMouse() {
    if (!aberto) return
    if (refTimeout.current) {
      clearTimeout(refTimeout.current)
      refTimeout.current = null
    }
    setEmHover(true)
  }

  function aoSairMouse() {
    if (!aberto) return
    if (refTimeout.current) clearTimeout(refTimeout.current)
    refTimeout.current = setTimeout(() => {
      setEmHover(false)
    }, 130)
  }

  useEffect(() => {
    if (!flutuante) return
    const fechar = (e: MouseEvent) => {
      const alvo = e.target as Node
      if (refBotao.current?.contains(alvo) || refPainel.current?.contains(alvo)) return
      setFlutuante(null)
    }
    const aoTeclar = (e: KeyboardEvent) => e.key === 'Escape' && setFlutuante(null)
    document.addEventListener('mousedown', fechar)
    document.addEventListener('keydown', aoTeclar)
    return () => {
      document.removeEventListener('mousedown', fechar)
      document.removeEventListener('keydown', aoTeclar)
    }
  }, [flutuante])

  function alternar() {
    if (aberto) {
      setExpandido((v) => {
        const proximo = !v
        if (!proximo) setEmHover(false)
        return proximo
      })
      return
    }
    const r = refBotao.current?.getBoundingClientRect()
    if (!r) return
    if (flutuante) return setFlutuante(null)
    const aoLado = {
      top: r.top,
      bottom: r.top,
      left: r.right + 6,
      right: r.right + 6,
      width: 0,
    } as DOMRect
    setFlutuante(ancorarMenu(aoLado, { largura: 210, altura: filhos.length * 32 + 35 }))
  }

  const abertoVisivel = expandido || emHover

  return (
    <div
      className="relative"
      onMouseEnter={aoEntrarMouse}
      onMouseLeave={aoSairMouse}
    >
      <button
        ref={refBotao}
        type="button"
        onClick={alternar}
        aria-expanded={aberto ? abertoVisivel : !!flutuante}
        title={aberto ? undefined : item.rotulo}
        data-grupo-menu={item.rotulo}
        className={`btn-menu-lateral relative flex items-center select-none outline-none focus:outline-none focus-visible:outline-none ${
          aberto
            ? 'w-full gap-2.5 rounded-lg px-2.5 py-1.5 text-sm font-medium leading-tight'
            : 'mx-auto h-9 w-9 items-center justify-center rounded-lg'
        } ${
          noGrupo
            ? 'btn-menu-ativo text-white'
            : 'text-[var(--color-muted-foreground)]'
        }`}
        style={{
          background: noGrupo ? 'var(--gradient-brand-purple)' : undefined,
          boxShadow: noGrupo ? '0 2px 6px -1px rgba(126, 32, 101, 0.35)' : undefined,
          justifyContent: aberto ? 'flex-start' : 'center',
        }}
      >
        <Icone nome={item.icone} className="h-[18px] w-[18px] shrink-0" />
        {!aberto && item.rotulo === 'Parceiros' && totalPendentes > 0 && (
          <span
            className="absolute top-1 right-1 h-2 w-2 rounded-full ring-2 shadow-xs"
            style={{ background: '#F59E0B' }}
          />
        )}
        {aberto && (
          <>
            <span className="flex-1 truncate text-left">{item.rotulo}</span>
            {item.rotulo === 'Parceiros' && totalPendentes > 0 && (
              <span
                className="px-1.5 py-0.5 rounded-full text-[10px] font-bold text-white shadow-xs"
                style={{ background: noGrupo ? '#F59E0B' : 'var(--gradient-brand-purple)' }}
              >
                {totalPendentes}
              </span>
            )}
            <svg
              viewBox="0 0 16 16"
              className="h-3.5 w-3.5 shrink-0 transition-transform duration-200 opacity-75"
              style={{ transform: abertoVisivel ? 'rotate(180deg)' : 'none' }}
              aria-hidden
            >
              <path
                d="M4 6.5 8 10.5l4-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </>
        )}
      </button>

      {aberto && (
        <div
          className="menu-accordion-wrapper"
          data-aberto={abertoVisivel ? 'true' : 'false'}
        >
          <div className="menu-accordion-content">
            <div
              className="mt-1 ml-5 space-y-0.5 border-l pl-2"
              style={{ borderColor: 'var(--color-border)' }}
            >
              {filhos.map((f) => {
                const isCertificado = f.para.includes('validar-certificados')
                return (
                  <NavLink
                    key={f.para}
                    to={f.para}
                    end={f.fim}
                    className={({ isActive }) =>
                      `btn-menu-subitem flex items-center justify-between truncate rounded-md px-2.5 py-1.5 text-[13px] font-medium leading-tight outline-none focus:outline-none focus-visible:outline-none ${
                        isActive
                          ? 'btn-subitem-ativo bg-[var(--color-muted)] text-[var(--color-primary)] font-semibold'
                          : 'text-[var(--color-muted-foreground)]'
                      }`
                    }
                  >
                    <span className="truncate">{f.rotulo}</span>
                    {isCertificado && totalPendentes > 0 && (
                      <span
                        className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold text-white shrink-0"
                        style={{ background: 'var(--gradient-brand-purple)' }}
                      >
                        {totalPendentes}
                      </span>
                    )}
                  </NavLink>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {!aberto && flutuante && (
        <div
          ref={refPainel}
          role="menu"
          data-menu-flutuante
          className="fixed z-50 min-w-52 rounded-lg border py-1.5 shadow-lg bg-white"
          style={{
            left: flutuante.x,
            top: flutuante.y,
            background: 'var(--color-popover)',
            color: 'var(--color-foreground)',
          }}
        >
          <div className="px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b mb-1">
            {item.rotulo}
          </div>
          {filhos.map((f) => {
            const isCertificado = f.para.includes('validar-certificados')
            return (
              <NavLink
                key={f.para}
                to={f.para}
                end={f.fim}
                role="menuitem"
                onClick={() => setFlutuante(null)}
                className="flex items-center justify-between px-3 py-1.5 text-xs font-medium transition-colors hover:bg-black/[0.04] outline-none focus:outline-none focus-visible:outline-none"
                style={({ isActive }) => ({
                  background: isActive ? 'var(--color-muted)' : 'transparent',
                  color: isActive ? 'var(--color-primary)' : 'inherit',
                  fontWeight: isActive ? 600 : 400,
                })}
              >
                <span className="truncate">{f.rotulo}</span>
                {isCertificado && totalPendentes > 0 && (
                  <span
                    className="ml-2 px-1.5 py-0.5 rounded-full text-[10px] font-bold text-white shrink-0"
                    style={{ background: 'var(--gradient-brand-purple)' }}
                  >
                    {totalPendentes}
                  </span>
                )}
              </NavLink>
            )
          })}
        </div>
      )}
    </div>
  )
}

/**
 * Menu "Painéis" com estrutura dinâmica por perfil (spec §3):
 *
 * PARCEIRO:
 * Painéis ˅
 * ├── Mobiltec (Geral público)
 * └── [Nome da Empresa] (Exclusivo do parceiro logado)
 *
 * ADMIN @MOBILTEC:
 * Painéis ˅
 * ├── Mobiltec (Geral público)
 * └── Parceiros ˅
 *     ├── Empresa A
 *     ├── Empresa B
 *     └── Empresa C
 */
function MenuPaineis({
  aberto,
  ehAdmin,
  ehParceiro,
  usuario,
}: {
  aberto: boolean
  ehAdmin: boolean
  ehParceiro: boolean
  usuario: any
}) {
  const { pathname } = useLocation()
  const { data: parceiros = [] } = useParceiros(ehAdmin)
  const parceirosAtivos = parceiros.filter((p) => p.ativo)

  // Deduplica parceiros por empresa para que múltiplos usuários da mesma empresa formem um único ambiente
  const empresasParceirasUnicas = useMemo(() => {
    const mapa = new Map<string, typeof parceiros[number]>()
    for (const p of parceirosAtivos) {
      if (!p.empresa || !p.empresa.trim()) continue
      let chave = p.empresa.trim().toLowerCase()
      if (chave === 'tnsi' || chave === 'tns') {
        chave = 'tns'
      }
      if (!mapa.has(chave)) {
        mapa.set(chave, {
          ...p,
          empresa: chave === 'tns' ? 'TNS' : p.empresa.trim(),
        })
      }
    }
    return Array.from(mapa.values())
  }, [parceirosAtivos])

  const noPainel =
    pathname === '/' ||
    pathname === '/paineis/mobiltec' ||
    pathname === '/paineis/meu-painel' ||
    pathname.startsWith('/paineis/parceiro')

  const noSubParceiros = pathname.startsWith('/paineis/parceiro')

  const [expandido, setExpandido] = useState(noPainel)
  const [parceirosExpandido, setParceirosExpandido] = useState(noSubParceiros)
  const [emHover, setEmHover] = useState(false)
  const [flutuante, setFlutuante] = useState<{ x: number; y: number } | null>(null)
  const refBotao = useRef<HTMLButtonElement>(null)
  const refPainel = useRef<HTMLDivElement>(null)
  const refTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (noPainel) setExpandido(true)
    if (noSubParceiros) setParceirosExpandido(true)
  }, [noPainel, noSubParceiros])

  useEffect(() => {
    if (!aberto) {
      setExpandido(false)
      setEmHover(false)
    } else {
      setFlutuante(null)
    }
  }, [aberto])

  useEffect(() => {
    return () => {
      if (refTimeout.current) clearTimeout(refTimeout.current)
    }
  }, [])

  function aoEntrarMouse() {
    if (!aberto) return
    if (refTimeout.current) {
      clearTimeout(refTimeout.current)
      refTimeout.current = null
    }
    setEmHover(true)
  }

  function aoSairMouse() {
    if (!aberto) return
    if (refTimeout.current) clearTimeout(refTimeout.current)
    refTimeout.current = setTimeout(() => {
      setEmHover(false)
    }, 130)
  }

  useEffect(() => {
    if (!flutuante) return
    const fechar = (e: MouseEvent) => {
      const alvo = e.target as Node
      if (refBotao.current?.contains(alvo) || refPainel.current?.contains(alvo)) return
      setFlutuante(null)
    }
    const aoTeclar = (e: KeyboardEvent) => e.key === 'Escape' && setFlutuante(null)
    document.addEventListener('mousedown', fechar)
    document.addEventListener('keydown', aoTeclar)
    return () => {
      document.removeEventListener('mousedown', fechar)
      document.removeEventListener('keydown', aoTeclar)
    }
  }, [flutuante])

  function alternar() {
    if (aberto) {
      setExpandido((v) => {
        const proximo = !v
        if (!proximo) setEmHover(false)
        return proximo
      })
      return
    }
    const r = refBotao.current?.getBoundingClientRect()
    if (!r) return
    if (flutuante) return setFlutuante(null)
    const aoLado = {
      top: r.top,
      bottom: r.top,
      left: r.right + 6,
      right: r.right + 6,
      width: 0,
    } as DOMRect
    const altura = ehAdmin ? 260 : 80
    setFlutuante(ancorarMenu(aoLado, { largura: 210, altura }))
  }

  const abertoVisivel = expandido || emHover

  return (
    <div
      className="relative"
      onMouseEnter={aoEntrarMouse}
      onMouseLeave={aoSairMouse}
    >
      <button
        ref={refBotao}
        type="button"
        onClick={alternar}
        aria-expanded={aberto ? abertoVisivel : !!flutuante}
        title={aberto ? undefined : 'Painel'}
        data-grupo-menu="Painel"
        className={`btn-menu-lateral relative flex items-center select-none outline-none focus:outline-none focus-visible:outline-none ${
          aberto
            ? 'w-full gap-2.5 rounded-lg px-2.5 py-1.5 text-sm font-medium leading-tight'
            : 'mx-auto h-9 w-9 items-center justify-center rounded-lg'
        } ${
          noPainel
            ? 'btn-menu-ativo text-white'
            : 'text-[var(--color-muted-foreground)]'
        }`}
        style={{
          background: noPainel ? 'var(--gradient-brand-purple)' : undefined,
          boxShadow: noPainel ? '0 2px 6px -1px rgba(126, 32, 101, 0.35)' : undefined,
          justifyContent: aberto ? 'flex-start' : 'center',
        }}
      >
        <Icone nome="painel" className="h-[18px] w-[18px] shrink-0" />
        {aberto && (
          <>
            <span className="flex-1 truncate text-left">Painel</span>
            <svg
              viewBox="0 0 16 16"
              className="h-3.5 w-3.5 shrink-0 transition-transform duration-200 opacity-75"
              style={{ transform: abertoVisivel ? 'rotate(180deg)' : 'none' }}
              aria-hidden
            >
              <path
                d="M4 6.5 8 10.5l4-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </>
        )}
      </button>

      {aberto && (
        <div
          className="menu-accordion-wrapper"
          data-aberto={abertoVisivel ? 'true' : 'false'}
        >
          <div className="menu-accordion-content">
            <div
              className="mt-1 ml-5 space-y-0.5 border-l pl-2"
              style={{ borderColor: 'var(--color-border)' }}
            >
              {/* Mobiltec — Painel Geral Público */}
              <NavLink
                to="/"
                end
                className={({ isActive }) =>
                  `btn-menu-subitem flex items-center justify-between truncate rounded-md px-2.5 py-1.5 text-[13px] font-medium leading-tight outline-none focus:outline-none focus-visible:outline-none ${
                    isActive
                      ? 'btn-subitem-ativo bg-[var(--color-muted)] text-[var(--color-primary)] font-semibold'
                      : 'text-[var(--color-muted-foreground)]'
                  }`
                }
              >
                <span className="truncate">Mobiltec</span>
              </NavLink>

              {/* Se for PARCEIRO: mostra diretamente o nome da própria empresa (se não for a Mobiltec) */}
              {ehParceiro && usuario?.empresa && usuario.empresa.trim().toLowerCase() !== 'mobiltec' && (
                <NavLink
                  to="/paineis/meu-painel"
                  className={({ isActive }) =>
                    `btn-menu-subitem flex items-center justify-between truncate rounded-md px-2.5 py-1.5 text-[13px] font-medium leading-tight outline-none focus:outline-none focus-visible:outline-none ${
                      isActive
                        ? 'btn-subitem-ativo bg-[var(--color-muted)] text-[var(--color-primary)] font-semibold'
                        : 'text-[var(--color-muted-foreground)]'
                    }`
                  }
                >
                  <span className="truncate">{usuario.empresa}</span>
                </NavLink>
              )}

              {/* Se for ADMIN: mostra submenu Parceiros ˅ com a lista de todos os parceiros */}
              {ehAdmin && (
                <div className="pt-0.5">
                  <button
                    type="button"
                    onClick={() => setParceirosExpandido((v) => !v)}
                    className={`btn-menu-subitem flex items-center justify-between w-full truncate rounded-md px-2.5 py-1.5 text-[13px] font-medium leading-tight cursor-pointer outline-none focus:outline-none focus-visible:outline-none ${
                      noSubParceiros
                        ? 'text-[var(--color-primary)] font-semibold'
                        : 'text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]'
                    }`}
                  >
                    <span className="truncate">Parceiros</span>
                    <div className="flex items-center gap-1 shrink-0">
                      <svg
                        viewBox="0 0 16 16"
                        className="h-3 w-3 shrink-0 transition-transform duration-200 opacity-70"
                        style={{ transform: parceirosExpandido ? 'rotate(180deg)' : 'none' }}
                        aria-hidden
                      >
                        <path
                          d="M4 6.5 8 10.5l4-4"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </div>
                  </button>

                  {parceirosExpandido && (
                    <div
                      className="mt-0.5 ml-2.5 space-y-0.5 border-l pl-2"
                      style={{ borderColor: 'var(--color-border)' }}
                    >
                      {empresasParceirasUnicas.length === 0 ? (
                        <span className="text-[11px] text-slate-400 italic px-2 py-1 block">
                          Nenhum parceiro cadastrado
                        </span>
                      ) : (
                        empresasParceirasUnicas.map((p) => (
                          <NavLink
                            key={p.empresa}
                            to={`/paineis/parceiro/${p.id}`}
                            className={({ isActive }) =>
                              `btn-menu-subitem flex items-center truncate rounded-md px-2 py-1 text-[12px] font-medium leading-tight outline-none focus:outline-none focus-visible:outline-none ${
                                isActive
                                  ? 'bg-[var(--color-muted)] text-[var(--color-primary)] font-semibold'
                                  : 'text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]'
                              }`
                            }
                            title={p.empresa}
                          >
                            <span className="truncate">{p.empresa}</span>
                          </NavLink>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Menu Flutuante (quando sidebar está recolhida) */}
      {!aberto && flutuante && (
        <div
          ref={refPainel}
          role="menu"
          data-menu-flutuante
          className="fixed z-50 min-w-52 rounded-lg border py-1.5 shadow-lg bg-white"
          style={{
            left: flutuante.x,
            top: flutuante.y,
            background: 'var(--color-popover)',
            color: 'var(--color-foreground)',
          }}
        >
          <div className="px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b mb-1">
            Painel
          </div>
          <NavLink
            to="/"
            end
            role="menuitem"
            onClick={() => setFlutuante(null)}
            className="flex items-center px-3 py-1.5 text-xs font-medium transition-colors hover:bg-black/[0.04] outline-none"
            style={({ isActive }) => ({
              background: isActive ? 'var(--color-muted)' : 'transparent',
              color: isActive ? 'var(--color-primary)' : 'inherit',
              fontWeight: isActive ? 600 : 400,
            })}
          >
            Mobiltec
          </NavLink>

          {ehParceiro && usuario?.empresa && usuario.empresa.trim().toLowerCase() !== 'mobiltec' && (
            <NavLink
              to="/paineis/meu-painel"
              role="menuitem"
              onClick={() => setFlutuante(null)}
              className="flex items-center px-3 py-1.5 text-xs font-medium transition-colors hover:bg-black/[0.04] outline-none"
              style={({ isActive }) => ({
                background: isActive ? 'var(--color-muted)' : 'transparent',
                color: isActive ? 'var(--color-primary)' : 'inherit',
                fontWeight: isActive ? 600 : 400,
              })}
            >
              {usuario.empresa}
            </NavLink>
          )}

          {ehAdmin && (
            <div className="pt-1 mt-1 border-t">
              <div className="px-3 py-1 text-[10.5px] font-semibold text-slate-400 uppercase tracking-wider">
                Parceiros
              </div>
              {empresasParceirasUnicas.length === 0 ? (
                <span className="text-[11px] text-slate-400 italic px-3 py-1 block">
                  Nenhum parceiro
                </span>
              ) : (
                empresasParceirasUnicas.map((p) => (
                  <NavLink
                    key={p.empresa}
                    to={`/paineis/parceiro/${p.id}`}
                    role="menuitem"
                    onClick={() => setFlutuante(null)}
                    className="flex items-center px-3 py-1.5 text-xs font-medium transition-colors hover:bg-black/[0.04] outline-none"
                    style={({ isActive }) => ({
                      background: isActive ? 'var(--color-muted)' : 'transparent',
                      color: isActive ? 'var(--color-primary)' : 'inherit',
                      fontWeight: isActive ? 600 : 400,
                    })}
                  >
                    <span className="truncate">{p.empresa}</span>
                  </NavLink>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Nome do registro, ao centro da barra.
 *
 * Só nas telas de planilha: é o rótulo do documento que a bateria de testes
 * produz. No painel não faz sentido — ali não se registra nada, só se lê o
 * que já foi homologado.
 */
const NOME_REGISTRO = 'Registro de Testes Internos'

/**
 * Casca do sistema: menu retrátil à esquerda, conteúdo à direita.
 *
 * O menu é montado a partir das categorias ativas — cadastrar uma nova
 * categoria no banco a faz aparecer aqui sozinha, sem mexer no código.
 */
export function Layout() {
  const { usuario, ehParceiro, ehAdmin, sair } = useAuth()
  const { data: categorias } = useCategorias()
  const { data: todasHomologacoes = [] } = useListaHomologacoes()
  const { data: todosParceiros = [] } = useParceiros(ehAdmin)
  const { pathname } = useLocation()

  const totalPendentes = todasHomologacoes.filter(
    (h) => h.status === 'AGUARDANDO_ANALISE' || h.status === 'EM_REVISAO',
  ).length

  const [aberto, setAberto] = useState(() => {
    try {
      return localStorage.getItem(CHAVE_MENU) !== 'false'
    } catch {
      return true
    }
  })

  function alternar() {
    setAberto((v) => {
      try {
        localStorage.setItem(CHAVE_MENU, String(!v))
      } catch {
        /* navegador sem storage: o menu só não lembra o estado */
      }
      return !v
    })
  }

  const categoriasFiltradas = (categorias ?? []).filter((c) => {
    if (!ehParceiro) return true
    return usuario?.categoriasPermitidas?.includes(c.slug)
  })

  const itensCategorias: ItemMenuDados[] = categoriasFiltradas.map((c) => ({
    para: `/matriz/${c.slug}`,
    rotulo: c.nome,
    icone: iconeDaCategoria(c.icone),
    fim: false,
  }))

  const homologacoes = { para: '/matriz', rotulo: 'Homologações', icone: 'homologacao' as NomeIcone }

  /**
   * Fica sempre abaixo dos tipos de dispositivo, separado por um traço: é de
   * onde saem os itens acima dele, não mais um deles. Não é tela: abre as duas
   * opções que configuram a lista e os tipos de dispositivo.
   */
  const homologacaoConfig = { para: '/registro', rotulo: 'Configurar Homologação', icone: 'registro' as NomeIcone }
  const opcoesHomologacaoConfig: ItemMenuDados[] = [
    { para: '/registro', rotulo: 'Registrar homologação', icone: 'registro', fim: true },
    // `fim: false`: editar um tipo é `/registro/tipos/:id`, e a opção continua
    // sendo esta. O item acima é `fim: true` para não engolir esta rota.
    { para: '/registro/tipos', rotulo: 'Editar / remover homologação', icone: 'registro', fim: false },
  ]

  const parceiros = { para: '/parceiros', rotulo: 'Parceiros', icone: 'parceiros' as NomeIcone }
  const opcoesParceiros: ItemMenuDados[] = [
    { para: '/ambiente/parceiros', rotulo: 'Registrar parceiro', icone: 'parceiros', fim: true },
    { para: '/parceiros/validar-certificados', rotulo: 'Validar certificado', icone: 'certificado', fim: true },
  ]

  // 224px: o item mais largo é "Painel de Homologação" (~150px) mais ícone e
  // recuo. Em 280 sobrava uma faixa vazia à direita de todos os itens.
  const largura = aberto ? 224 : 64

  /**
   * Seção atual, para a trilha da barra superior.
   *
   * Em menus que possuem mais de uma opção (como Configurar Homologação e Parceiros),
   * a barra do topo mantém sempre o nome do grupo principal, enquanto a página
   * exibe no título principal o nome da tela/submenu.
   */
  const secao = (() => {
    if (pathname === '/' || pathname === '/paineis/mobiltec') {
      return { rotulo: 'Painel · Mobiltec', icone: 'painel' as NomeIcone }
    }
    if (pathname === '/paineis/meu-painel') {
      return { rotulo: `Painel · ${usuario?.empresa || 'Meu Painel'}`, icone: 'painel' as NomeIcone }
    }
    if (pathname.startsWith('/paineis/parceiro/')) {
      const idOuEmpresa = pathname.replace('/paineis/parceiro/', '')
      const p = todosParceiros.find((x) => x.id === idOuEmpresa || x.empresa.toLowerCase() === idOuEmpresa.toLowerCase())
      return { rotulo: `Painel · ${p?.empresa || idOuEmpresa}`, icone: 'painel' as NomeIcone }
    }
    if (pathname.startsWith('/configurar-dispositivos') || pathname.startsWith('/dispositivos/gerenciar')) {
      return { rotulo: 'Configurar Dispositivos', icone: 'smartphone' as NomeIcone }
    }
    if (opcoesHomologacaoConfig.some((i) => (i.fim ? pathname === i.para : pathname.startsWith(i.para)))) {
      return homologacaoConfig
    }
    if (opcoesParceiros.some((i) => (i.fim ? pathname === i.para : pathname.startsWith(i.para)))) {
      return parceiros
    }
    const cat = itensCategorias.find((i) => (i.fim ? pathname === i.para : pathname.startsWith(i.para)))
    if (cat) {
      return { rotulo: `Homologações · ${cat.rotulo}`, icone: cat.icone }
    }
    return { rotulo: 'Painel · Mobiltec', icone: 'painel' as NomeIcone }
  })()

  /** Só as telas de planilha registram testes */
  const ehPlanilha = pathname.startsWith('/matriz')

  const ehSandbox =
    import.meta.env.VITE_AMBIENTE === 'sandbox' ||
    window.location.hostname.includes('sandbox')

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {ehSandbox && (
        <div
          className="w-full py-1.5 px-4 text-center text-xs font-bold uppercase tracking-wider shrink-0 z-50 flex items-center justify-center gap-2 shadow-sm"
          style={{ background: '#FEF3C7', color: '#92400E', borderBottom: '1px solid #FCD34D' }}
        >
          <span>⚠️ AMBIENTE SANDBOX — EXPERIMENTAÇÃO ISOLADA (SEM IMPACTO EM PRODUÇÃO)</span>
        </div>
      )}

      {/* O fundo da janela é o mesmo do menu: é a faixa que aparece em volta do
          card do painel e o que dá a ele o efeito de folha solta. */}
      <div className="flex-1 flex min-h-0 overflow-hidden" style={{ background: 'var(--color-sidebar)' }}>
        <aside
          className="flex flex-col shrink-0 transition-[width] duration-200"
          style={{ width: largura, background: 'var(--color-sidebar)' }}
        >
          {/* Sem botão aqui dentro: aberto fica só o lockup, recolhido só o
              símbolo — ambos centralizados. Quem abre e fecha é o botão da
              borda, que não se confunde com a marca. */}
          <div
            className="flex items-center justify-center border-b px-3 shrink-0"
            style={{ height: 'var(--topbar-h)' }}
          >
            {aberto ? (
              <LogoMobiltec className="h-11 w-auto" />
            ) : (
              <LogoMobiltec variante="simbolo" className="h-7 w-7" />
            )}
          </div>

          <nav className="flex-1 overflow-y-auto p-2 space-y-1">
            {/* Menu Painéis (diferenciado por perfil) */}
            <MenuPaineis
              aberto={aberto}
              ehAdmin={ehAdmin}
              ehParceiro={ehParceiro}
              usuario={usuario}
            />

            {/* Menu Homologações — os dispositivos registrados ficam aqui */}
            {itensCategorias.length > 0 && (
              <GrupoMenu
                item={homologacoes}
                filhos={itensCategorias}
                aberto={aberto}
              />
            )}

            {/* O traço marca a mudança de natureza: acima, os tipos que já
                existem; abaixo, quem cria e mantém a lista deles. */}
            {!ehParceiro && (
              <div className="!mt-2 pt-2 space-y-1" style={{ borderTop: '1px solid var(--color-border)' }}>
                <GrupoMenu item={homologacaoConfig} filhos={opcoesHomologacaoConfig} aberto={aberto} />
                {ehAdmin && (
                  <NavLink
                    to="/configurar-dispositivos"
                    title={aberto ? undefined : 'Configurar dispositivos'}
                    data-item-menu="Configurar dispositivos"
                    className={({ isActive }) =>
                      `btn-menu-lateral relative flex items-center select-none outline-none focus:outline-none focus-visible:outline-none ${
                        aberto
                          ? 'w-full gap-2.5 rounded-lg px-2.5 py-1.5 text-sm font-medium leading-tight'
                          : 'mx-auto h-9 w-9 items-center justify-center rounded-lg'
                      } ${
                        isActive
                          ? 'btn-menu-ativo text-white'
                          : 'text-[var(--color-muted-foreground)] hover:bg-black/[0.04] dark:hover:bg-white/[0.04]'
                      }`
                    }
                    style={({ isActive }) => ({
                      background: isActive ? 'var(--gradient-brand-purple)' : undefined,
                      boxShadow: isActive ? '0 2px 6px -1px rgba(126, 32, 101, 0.35)' : undefined,
                      justifyContent: aberto ? 'flex-start' : 'center',
                    })}
                  >
                    <Icone nome="smartphone" className="h-[18px] w-[18px] shrink-0" />
                    {aberto && <span className="flex-1 truncate text-left">Configurar dispositivos</span>}
                  </NavLink>
                )}
                {ehAdmin && (
                  <GrupoMenu
                    item={parceiros}
                    filhos={opcoesParceiros}
                    aberto={aberto}
                    totalPendentes={totalPendentes}
                  />
                )}
              </div>
            )}
          </nav>

          <div className="border-t p-2 shrink-0">
            {aberto && (
              <div className="px-2.5 py-1 mb-1">
                <p className="truncate text-xs font-semibold">{usuario?.nome}</p>
                <p className="truncate text-[11px]" style={{ color: 'var(--color-muted-foreground)' }}>
                  {usuario?.cargo}
                </p>
              </div>
            )}
            <button
              onClick={sair}
              title="Sair"
              className={`btn-menu-lateral flex items-center select-none outline-none focus:outline-none focus-visible:outline-none ${
                aberto
                  ? 'w-full gap-2.5 rounded-lg px-2.5 py-1.5 text-sm font-medium leading-tight'
                  : 'mx-auto h-9 w-9 items-center justify-center rounded-lg'
              } text-[var(--color-muted-foreground)] hover:text-red-600`}
              style={{
                justifyContent: aberto ? 'flex-start' : 'center',
              }}
            >
              <Icone nome="sair" className="h-[18px] w-[18px] shrink-0" />
              {aberto && <span>Sair</span>}
            </button>
          </div>
        </aside>

        {/* O painel inteiro é um card: a folga de 8px em volta deixa aparecer a
            faixa de fundo, e é ela que separa o card do menu — daí o `aside` ter
            perdido a borda direita. */}
        <main className="flex-1 min-w-0 p-2">
          <div
            className="flex h-full flex-col overflow-hidden rounded-xl border"
            style={{ background: 'var(--color-card)' }}
            data-painel
          >
            {/* Barra do topo do card. À esquerda, onde se está; ao centro, o
                nome do sistema, igual em todas as telas — nenhuma página repete
                o próprio título abaixo. O centro é absoluto para ficar no meio
                da barra, e não no meio do que sobra depois da trilha. */}
            <div className="relative flex shrink-0 items-center gap-3 border-b px-3 py-2">
              <button
                type="button"
                onClick={alternar}
                aria-label={aberto ? 'Recolher menu' : 'Expandir menu'}
                title={aberto ? 'Recolher menu' : 'Expandir menu'}
                className="grid h-8 w-8 place-items-center rounded-lg transition-all duration-150 outline-none focus:outline-none focus-visible:outline-none hover:bg-black/[0.04] hover:shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
                style={{ color: 'var(--color-muted-foreground)' }}
              >
                <Icone nome="painel" className="h-[18px] w-[18px]" />
              </button>

              <div className="h-5 w-px" style={{ background: 'var(--color-border)' }} />

              <div className="flex min-w-0 items-center gap-2">
                <Icone nome={secao.icone} className="h-4 w-4 shrink-0" />
                <h1 className="truncate text-sm" style={{ color: 'var(--color-muted-foreground)' }}>
                  {secao.rotulo}
                </h1>
              </div>

              {ehPlanilha && (
                <span
                  data-registro
                  className="pointer-events-none absolute left-1/2 -translate-x-1/2 truncate text-sm font-semibold"
                  style={{ letterSpacing: '0.01em' }}
                >
                  {NOME_REGISTRO}
                </span>
              )}

              <div className="ml-auto flex items-center gap-3 text-xs">
                <CentralNotificacoes />
                <span className="font-medium" style={{ color: 'var(--color-foreground)' }}>
                  {usuario?.nome}
                </span>
                <span
                  className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                  style={{
                    background: ehParceiro ? 'var(--color-warning-soft)' : 'var(--color-info-soft)',
                    color: ehParceiro ? 'var(--color-warning-fg)' : 'var(--color-info-fg)',
                  }}
                >
                  {ehParceiro ? (usuario?.empresa ? `Parceiro (${usuario.empresa})` : 'Parceiro') : 'Mobiltec'}
                </span>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden">
              <Outlet />
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
