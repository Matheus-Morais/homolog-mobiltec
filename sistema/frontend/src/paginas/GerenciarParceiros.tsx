import { useState, useMemo } from 'react'
import { useParceiros, useCriarParceiro, useAtualizarParceiro, useInativarParceiro } from '@/hooks/useParceiros'
import { useCategorias } from '@/hooks/useVitrine'
import { Icone, iconeDaCategoria } from '@/componentes/Icone'
import { LoadingTela } from '@/componentes/LoadingTela'
import type { Parceiro } from '@/lib/tipos'

export function GerenciarParceiros() {
  const { data: parceiros = [], isLoading } = useParceiros()
  const { data: categorias = [] } = useCategorias()

  const criarParceiro = useCriarParceiro()
  const atualizarParceiro = useAtualizarParceiro()
  const inativarParceiro = useInativarParceiro()

  const [modalAberto, setModalAberto] = useState(false)
  const [parceiroEdicao, setParceiroEdicao] = useState<Parceiro | null>(null)

  // Campos do formulário
  const [empresa, setEmpresa] = useState('')
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('Mobiltec@2026')
  const [categoriasPermitidas, setCategoriasPermitidas] = useState<string[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState<string | null>(null)

  // Gestão de empresas cadastradas
  const [empresasExtras, setEmpresasExtras] = useState<string[]>([])
  const [criandoEmpresa, setCriandoEmpresa] = useState(false)
  const [novaEmpresaNome, setNovaEmpresaNome] = useState('')
  const [erroNovaEmpresa, setErroNovaEmpresa] = useState<string | null>(null)

  const empresasDisponiveis = useMemo(() => {
    const mapa = new Map<string, string>()
    // Nomes fixos principais
    mapa.set('mobiltec', 'Mobiltec')
    mapa.set('tns', 'TNS')

    for (const p of parceiros) {
      if (p.empresa?.trim()) {
        const chave = p.empresa.trim().toLowerCase()
        if (!mapa.has(chave)) {
          mapa.set(chave, p.empresa.trim())
        }
      }
    }
    for (const e of empresasExtras) {
      if (e.trim()) {
        const chave = e.trim().toLowerCase()
        if (!mapa.has(chave)) {
          mapa.set(chave, e.trim())
        }
      }
    }
    return Array.from(mapa.values())
  }, [parceiros, empresasExtras])

  const [busca, setBusca] = useState('')

  const mapaNomeCategoria = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of categorias) {
      m.set(c.slug, c.nome)
    }
    return m
  }, [categorias])

  const parceirosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    if (!termo) return parceiros
    return parceiros.filter((p) => {
      const emp = p.empresa?.toLowerCase() ?? ''
      const nm = p.nome?.toLowerCase() ?? ''
      const em = p.email?.toLowerCase() ?? ''
      return emp.includes(termo) || nm.includes(termo) || em.includes(termo)
    })
  }, [parceiros, busca])

  function salvarNovaEmpresa() {
    const nomeLimpo = novaEmpresaNome.trim()
    if (!nomeLimpo) {
      setErroNovaEmpresa('Informe o nome da empresa parceira.')
      return
    }
    const chave = nomeLimpo.toLowerCase()
    if (!empresasDisponiveis.some((e) => e.toLowerCase() === chave)) {
      setEmpresasExtras((prev) => [...prev, nomeLimpo])
    }
    setEmpresa(nomeLimpo)
    setCriandoEmpresa(false)
    setNovaEmpresaNome('')
    setErroNovaEmpresa(null)
  }

  function abrirModalCriar() {
    setParceiroEdicao(null)
    setEmpresa('')
    setNome('')
    setEmail('')
    setSenha('Mobiltec@2026')
    setIsAdmin(false)
    setCriandoEmpresa(false)
    setNovaEmpresaNome('')
    setErroNovaEmpresa(null)
    // Por padrão marca 'pos' ou a primeira categoria se existir
    setCategoriasPermitidas(categorias.length > 0 ? [categorias[0].slug] : ['pos'])
    setErro(null)
    setSucesso(null)
    setModalAberto(true)
  }

  function abrirModalEditar(p: Parceiro) {
    setParceiroEdicao(p)
    setEmpresa(p.empresa)
    setNome(p.nome)
    setEmail(p.email)
    setSenha('')
    setIsAdmin(p.papel === 'ADMIN')
    setCriandoEmpresa(false)
    setNovaEmpresaNome('')
    setErroNovaEmpresa(null)
    setCategoriasPermitidas(p.categoriasPermitidas ?? [])
    setErro(null)
    setSucesso(null)
    setModalAberto(true)
  }

  function alternarCategoria(slug: string) {
    setCategoriasPermitidas((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug],
    )
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    setSucesso(null)

    if (!empresa.trim()) {
      setErro('Informe o nome da empresa parceira.')
      return
    }
    if (!nome.trim()) {
      setErro('Informe o nome do responsável.')
      return
    }
    if (!email.trim()) {
      setErro('Informe o e-mail de login.')
      return
    }

    if (categoriasPermitidas.length === 0) {
      setErro('Selecione pelo menos uma categoria que o parceiro poderá homologar.')
      return
    }

    const ehMobiltec = empresa.trim().toLowerCase() === 'mobiltec'
    const acessoAdmin = ehMobiltec ? isAdmin : false

    try {
      if (parceiroEdicao) {
        await atualizarParceiro.mutateAsync({
          id: parceiroEdicao.id,
          empresa: empresa.trim(),
          nome: nome.trim(),
          email: email.trim(),
          ...(senha ? { senha } : {}),
          categoriasPermitidas,
          isAdmin: acessoAdmin,
        })
        setSucesso('Parceiro atualizado com sucesso!')
      } else {
        if (!senha || senha.length < 6) {
          setErro('A senha deve ter no mínimo 6 caracteres.')
          return
        }
        await criarParceiro.mutateAsync({
          empresa: empresa.trim(),
          nome: nome.trim(),
          email: email.trim(),
          senha,
          categoriasPermitidas,
          isAdmin: acessoAdmin,
        })
        setSucesso('Parceiro cadastrado com sucesso!')
      }
      setTimeout(() => {
        setModalAberto(false)
        setSucesso(null)
      }, 1000)
    } catch (err: any) {
      setErro(err?.message || 'Erro ao processar requisição.')
    }
  }

  const salvando = criarParceiro.isPending || atualizarParceiro.isPending

  return (
    <div className="h-full flex flex-col overflow-y-auto p-6 space-y-6" style={{ background: 'var(--color-background)' }}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4" style={{ borderColor: 'var(--color-border)' }}>
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ color: 'var(--color-foreground)' }}>
            Registrar parceiro
          </h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted-foreground)' }}>
            Gerencie os acessos de parceiros externos e defina quais tipos de dispositivos cada um pode homologar.
          </p>
        </div>

        <button
          type="button"
          onClick={abrirModalCriar}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg border text-xs font-semibold transition-all hover:opacity-80 active:scale-95 shadow-xs"
          style={{
            background: 'var(--color-muted)',
            borderColor: 'var(--color-border)',
            color: 'var(--color-primary)',
          }}
        >
          <span className="text-sm font-bold leading-none">+</span>
          <span>Registrar parceiro</span>
        </button>
      </div>

      {/* Barra de Filtro / Busca */}
      {!isLoading && parceiros.length > 0 && (
        <div
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl border bg-white shadow-2xs"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <div className="relative flex-1 max-w-md">
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Consultar empresa ou colaborador…"
              className="w-full pl-9 pr-8 py-1.5 text-xs rounded-lg border bg-transparent outline-none focus:border-[var(--color-primary)] transition-colors"
              style={{ borderColor: 'var(--color-input)' }}
            />
            <span className="absolute left-3 top-2 text-slate-400">
              <Icone nome="busca" className="h-3.5 w-3.5" />
            </span>
            {busca && (
              <button
                type="button"
                onClick={() => setBusca('')}
                className="absolute right-2.5 top-1.5 text-slate-400 hover:text-slate-600 cursor-pointer text-xs"
              >
                ✕
              </button>
            )}
          </div>

          <div className="text-xs text-slate-500 font-medium shrink-0">
            {busca ? (
              <span>
                {parceirosFiltrados.length} de {parceiros.length} {parceiros.length === 1 ? 'parceiro' : 'parceiros'}
              </span>
            ) : (
              <span>
                Total: <strong>{parceiros.length}</strong> {parceiros.length === 1 ? 'parceiro' : 'parceiros'} cadastrados
              </span>
            )}
          </div>
        </div>
      )}

      {/* Tabela Estruturada de Parceiros */}
      {isLoading ? (
        <LoadingTela mensagem="Carregando parceiros cadastrados…" />
      ) : parceiros.length === 0 ? (
        <div
          className="rounded-xl border border-dashed p-12 text-center flex flex-col items-center justify-center gap-3"
          style={{ borderColor: 'var(--color-border)', background: 'var(--color-card)' }}
        >
          <div className="h-12 w-12 rounded-full flex items-center justify-center" style={{ background: 'var(--color-muted)', color: 'var(--color-primary)' }}>
            <Icone nome="parceiros" className="h-6 w-6" />
          </div>
          <h2 className="text-base font-semibold" style={{ color: 'var(--color-foreground)' }}>
            Nenhum parceiro registrado ainda
          </h2>
          <p className="text-xs max-w-md" style={{ color: 'var(--color-muted-foreground)' }}>
            Cadastre os fabricantes ou laboratórios parceiros para liberar o acesso restrito às planilhas de homologação.
          </p>
          <button
            type="button"
            onClick={abrirModalCriar}
            className="mt-2 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border text-xs font-semibold transition-all hover:opacity-80 shadow-xs"
            style={{
              background: 'var(--color-muted)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-primary)',
            }}
          >
            <span className="text-sm font-bold leading-none">+</span>
            <span>Registrar primeiro parceiro</span>
          </button>
        </div>
      ) : (
        <div
          className="rounded-xl border overflow-hidden bg-white shadow-2xs"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead
                className="bg-slate-50/90 border-b text-[11px] font-semibold text-slate-500 uppercase tracking-wider"
                style={{ borderColor: 'var(--color-border)' }}
              >
                <tr>
                  <th className="py-2.5 px-4">Empresa</th>
                  <th className="py-2.5 px-4">Colaborador</th>
                  <th className="py-2.5 px-4">E-mail</th>
                  <th className="py-2.5 px-4">Categorias Permitidas</th>
                  <th className="py-2.5 px-4">Perfil</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {parceirosFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400 italic">
                      {busca
                        ? `Nenhum parceiro encontrado com o termo "${busca}".`
                        : 'Nenhum parceiro registrado.'}
                    </td>
                  </tr>
                ) : (
                  parceirosFiltrados.map((p) => (
                    <tr
                      key={p.id}
                      className="hover:bg-slate-50/70 transition-colors"
                      style={{ opacity: p.ativo ? 1 : 0.6 }}
                    >
                      <td className="py-2.5 px-4 font-bold text-slate-900">
                        {p.empresa}
                      </td>
                      <td className="py-2.5 px-4 font-medium text-slate-800">
                        {p.nome}
                      </td>
                      <td className="py-2.5 px-4 text-slate-600">
                        <div className="flex items-center gap-1.5">
                          <Icone nome="email" className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">{p.email}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="flex flex-wrap gap-1">
                          {p.categoriasPermitidas && p.categoriasPermitidas.length > 0 ? (
                            p.categoriasPermitidas.map((catSlug) => (
                              <span
                                key={catSlug}
                                className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200"
                              >
                                {mapaNomeCategoria.get(catSlug) || catSlug}
                              </span>
                            ))
                          ) : (
                            <span className="text-[11px] text-slate-400 italic">Nenhuma</span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-4">
                        {p.papel === 'ADMIN' ? (
                          <span
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-semibold select-none text-white shadow-2xs"
                            style={{ background: 'var(--gradient-brand-purple)' }}
                          >
                            Admin
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-medium bg-slate-100 text-slate-600 select-none">
                            Parceiro
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-4">
                        <span
                          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold select-none"
                          style={{
                            color: p.ativo ? 'var(--color-success-fg)' : 'var(--color-muted-foreground)',
                            background: p.ativo ? 'var(--color-success-soft)' : 'var(--color-muted)',
                            border: `1px solid ${p.ativo ? 'rgba(22, 163, 74, 0.25)' : 'var(--color-border)'}`,
                          }}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${p.ativo ? 'bg-emerald-500' : 'bg-slate-400'}`}
                          />
                          <span>{p.ativo ? 'Ativo' : 'Inativo'}</span>
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => abrirModalEditar(p)}
                            className="px-2.5 py-1 text-xs font-semibold rounded border transition-colors hover:bg-slate-100 cursor-pointer"
                            style={{ borderColor: 'var(--color-border)', color: 'var(--color-foreground)' }}
                          >
                            Editar
                          </button>
                          {p.ativo ? (
                            <button
                              type="button"
                              onClick={() => inativarParceiro.mutate(p.id)}
                              className="px-2.5 py-1 text-xs font-semibold rounded border transition-colors hover:opacity-90 cursor-pointer"
                              style={{
                                borderColor: 'rgba(220, 38, 38, 0.25)',
                                color: 'var(--color-destructive-fg)',
                                background: 'var(--color-destructive-soft)',
                              }}
                            >
                              Inativar
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => atualizarParceiro.mutate({ id: p.id, ativo: true })}
                              className="px-2.5 py-1 text-xs font-semibold rounded border transition-colors hover:opacity-90 cursor-pointer"
                              style={{
                                borderColor: 'rgba(22, 163, 74, 0.25)',
                                color: 'var(--color-success-fg)',
                                background: 'var(--color-success-soft)',
                              }}
                            >
                              Reativar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal de Cadastro / Edição */}
      {modalAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div
            className="w-full max-w-lg rounded-xl border p-6 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
            style={{ background: 'var(--color-card)', borderColor: 'var(--color-border)' }}
          >
            <div className="flex items-center justify-between pb-4 border-b shrink-0" style={{ borderColor: 'var(--color-border)' }}>
              <div>
                <h2 className="text-base font-bold" style={{ color: 'var(--color-foreground)' }}>
                  {parceiroEdicao ? `Editar Parceiro · ${parceiroEdicao.empresa}` : 'Registrar Novo Parceiro'}
                </h2>
                <p className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>
                  Defina o ambiente e as permissões de homologação da empresa.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalAberto(false)}
                className="text-lg font-bold leading-none p-1 rounded hover:opacity-70"
                style={{ color: 'var(--color-muted-foreground)' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={salvar} className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
              {erro && (
                <div className="p-3 rounded-lg text-xs font-medium bg-red-50 text-red-700 border border-red-200">
                  {erro}
                </div>
              )}
              {sucesso && (
                <div className="p-3 rounded-lg text-xs font-medium bg-green-50 text-green-700 border border-green-200">
                  {sucesso}
                </div>
              )}

              <div>
                {!criandoEmpresa ? (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label
                        className="block text-xs font-semibold"
                        style={{ color: 'var(--color-foreground)' }}
                      >
                        Parceiro (Empresa) <span className="text-red-500">*</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setCriandoEmpresa(true)
                          setNovaEmpresaNome('')
                          setErroNovaEmpresa(null)
                        }}
                        className="text-xs font-semibold hover:underline flex items-center gap-1 cursor-pointer transition-colors"
                        style={{ color: 'var(--color-primary)' }}
                      >
                        + Criar Novo Parceiro
                      </button>
                    </div>
                    <select
                      required
                      value={empresa}
                      onChange={(e) => setEmpresa(e.target.value)}
                      className="w-full px-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-1 transition-all cursor-pointer"
                      style={{
                        borderColor: 'var(--color-border)',
                        background: 'var(--color-background)',
                        color: 'var(--color-foreground)',
                      }}
                    >
                      <option value="" disabled>
                        Selecione uma empresa parceira...
                      </option>
                      {empresasDisponiveis.map((emp) => (
                        <option key={emp} value={emp}>
                          {emp}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div
                    className="p-3 rounded-lg border"
                    style={{
                      borderColor: 'var(--color-brand-purple-border, #f0d5eb)',
                      background: 'var(--color-brand-purple-soft, #fbf4fa)',
                    }}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <label
                        className="block text-xs font-bold"
                        style={{ color: 'var(--color-brand-purple-fg, #6e226b)' }}
                      >
                        Nome do Novo Parceiro / Empresa
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setCriandoEmpresa(false)
                          setNovaEmpresaNome('')
                          setErroNovaEmpresa(null)
                        }}
                        className="text-xs hover:underline cursor-pointer"
                        style={{ color: 'var(--color-muted-foreground)' }}
                      >
                        Voltar para seleção
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        autoFocus
                        value={novaEmpresaNome}
                        onChange={(e) => {
                          setNovaEmpresaNome(e.target.value)
                          setErroNovaEmpresa(null)
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            salvarNovaEmpresa()
                          }
                        }}
                        className="flex-1 px-3 py-1.5 text-sm rounded-lg border focus:outline-none"
                        style={{
                          borderColor: 'var(--color-border)',
                          background: 'var(--color-background)',
                          color: 'var(--color-foreground)',
                        }}
                      />
                      <button
                        type="button"
                        onClick={salvarNovaEmpresa}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-opacity hover:opacity-90 cursor-pointer"
                        style={{ background: 'var(--gradient-brand-purple)' }}
                      >
                        Salvar
                      </button>
                    </div>
                    {erroNovaEmpresa && (
                      <p className="mt-1 text-xs text-red-600 font-medium">
                        {erroNovaEmpresa}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Flag de acesso admin quando a empresa for Mobiltec */}
              {empresa.trim().toLowerCase() === 'mobiltec' && (
                <div
                  className="p-3 rounded-lg border flex items-center justify-between gap-3 transition-colors cursor-pointer"
                  onClick={() => setIsAdmin((prev) => !prev)}
                  style={{
                    borderColor: isAdmin ? 'var(--color-primary)' : 'var(--color-border)',
                    background: isAdmin ? 'var(--color-muted)' : 'var(--color-background)',
                  }}
                >
                  <div className="min-w-0 flex-1 select-none">
                    <span className="block text-xs font-bold" style={{ color: 'var(--color-foreground)' }}>
                      Dar acesso de Administrador
                    </span>
                    <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-muted-foreground)' }}>
                      Libera todas as permissões de admin (acesso total a configurações, matriz e homologações).
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={isAdmin}
                    onChange={(e) => setIsAdmin(e.target.checked)}
                    className="h-4 w-4 rounded cursor-pointer shrink-0"
                    style={{ accentColor: 'var(--color-primary)' }}
                  />
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--color-foreground)' }}>
                    Nome do Responsável <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-1 transition-all"
                    style={{
                      borderColor: 'var(--color-border)',
                      background: 'var(--color-background)',
                      color: 'var(--color-foreground)',
                    }}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--color-foreground)' }}>
                    Login (E-mail) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-1 transition-all"
                    style={{
                      borderColor: 'var(--color-border)',
                      background: 'var(--color-background)',
                      color: 'var(--color-foreground)',
                    }}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--color-foreground)' }}>
                  {parceiroEdicao ? 'Redefinir Senha (opcional)' : 'Senha de Acesso'} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-1 transition-all font-mono"
                  style={{
                    borderColor: 'var(--color-border)',
                    background: 'var(--color-background)',
                    color: 'var(--color-foreground)',
                  }}
                />
                {!parceiroEdicao && (
                  <p className="text-[11px] mt-1" style={{ color: 'var(--color-muted-foreground)' }}>
                    Padrão sugerido: <code>Mobiltec@2026</code>
                  </p>
                )}
              </div>

              {/* Categorias que o parceiro pode homologar */}
              <div className="pt-2 border-t" style={{ borderColor: 'var(--color-border)' }}>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--color-foreground)' }}>
                  O que o parceiro terá acesso a homologar? <span className="text-red-500">*</span>
                </label>
                <p className="text-[11px] mb-3" style={{ color: 'var(--color-muted-foreground)' }}>
                  Selecione as categorias liberadas no menu e na planilha do parceiro:
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {categorias.map((cat) => {
                    const marcada = categoriasPermitidas.includes(cat.slug)
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => alternarCategoria(cat.slug)}
                        className={`flex items-center gap-3 p-2.5 rounded-lg border text-left transition-all ${
                          marcada ? 'ring-1' : 'opacity-70 hover:opacity-100'
                        }`}
                        style={{
                          borderColor: marcada ? 'var(--color-primary)' : 'var(--color-border)',
                          background: marcada ? 'var(--color-muted)' : 'var(--color-background)',
                          color: 'var(--color-foreground)',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={marcada}
                          onChange={() => {}} // controlado pelo button
                          className="rounded h-4 w-4 shrink-0"
                          style={{ accentColor: 'var(--color-primary)' }}
                        />
                        <Icone nome={iconeDaCategoria(cat.icone)} className="h-4 w-4 shrink-0" />
                        <span className="text-xs font-medium truncate">{cat.nome}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="pt-4 border-t flex items-center justify-end gap-2 shrink-0" style={{ borderColor: 'var(--color-border)' }}>
                <button
                  type="button"
                  disabled={salvando}
                  onClick={() => setModalAberto(false)}
                  className="px-4 py-2 rounded-lg text-xs font-medium border transition-colors hover:bg-black/5"
                  style={{ borderColor: 'var(--color-border)', color: 'var(--color-foreground)' }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={salvando}
                  className="px-4 py-2 rounded-lg text-xs font-semibold text-white shadow-sm transition-all hover:opacity-90 disabled:opacity-50"
                  style={{ background: 'var(--gradient-brand-purple)' }}
                >
                  {salvando ? 'Salvando…' : parceiroEdicao ? 'Salvar Alterações' : 'Cadastrar Parceiro'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
