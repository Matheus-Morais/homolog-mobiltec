import { useState } from 'react'
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
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState<string | null>(null)

  function abrirModalCriar() {
    setParceiroEdicao(null)
    setEmpresa('')
    setNome('')
    setEmail('')
    setSenha('Mobiltec@2026')
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

    try {
      if (parceiroEdicao) {
        await atualizarParceiro.mutateAsync({
          id: parceiroEdicao.id,
          empresa: empresa.trim(),
          nome: nome.trim(),
          email: email.trim(),
          ...(senha ? { senha } : {}),
          categoriasPermitidas,
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

      {/* Lista de Parceiros */}
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {parceiros.map((p) => (
            <div
              key={p.id}
              className="rounded-xl border px-3.5 py-3 flex items-center justify-between gap-3 transition-all hover:shadow-xs"
              style={{
                borderColor: 'var(--color-border)',
                background: 'var(--color-card)',
                opacity: p.ativo ? 1 : 0.65,
              }}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-sm truncate" style={{ color: 'var(--color-foreground)' }}>
                    {p.empresa}
                  </h3>
                  <span
                    className="text-[11px] font-semibold px-2 py-0.5 rounded-full select-none"
                    style={{
                      color: p.ativo ? 'var(--color-success-fg)' : 'var(--color-muted-foreground)',
                      background: p.ativo ? 'var(--color-success-soft)' : 'var(--color-muted)',
                      border: `1px solid ${p.ativo ? 'rgba(22, 163, 74, 0.25)' : 'var(--color-border)'}`,
                    }}
                  >
                    {p.ativo ? 'Ativo' : 'Inativo'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 mt-1 text-xs truncate" style={{ color: 'var(--color-muted-foreground)' }}>
                  <Icone nome="email" className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{p.email}</span>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => abrirModalEditar(p)}
                  className="px-2.5 py-1 text-xs font-medium rounded border transition-colors hover:bg-black/5"
                  style={{ borderColor: 'var(--color-border)', color: 'var(--color-foreground)' }}
                >
                  Editar
                </button>
                {p.ativo ? (
                  <button
                    type="button"
                    onClick={() => inativarParceiro.mutate(p.id)}
                    className="px-2.5 py-1 text-xs font-medium rounded border transition-colors hover:opacity-90"
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
                    className="px-2.5 py-1 text-xs font-medium rounded border transition-colors hover:opacity-90"
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
            </div>
          ))}
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
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--color-foreground)' }}>
                  Parceiro (Empresa) <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Sunmi, Gertec, Ingenico..."
                  value={empresa}
                  onChange={(e) => setEmpresa(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-1 transition-all"
                  style={{
                    borderColor: 'var(--color-border)',
                    background: 'var(--color-background)',
                    color: 'var(--color-foreground)',
                  }}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--color-foreground)' }}>
                    Nome do Responsável <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Carlos Silva"
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
                    placeholder="parceiro@empresa.com"
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
                  placeholder={parceiroEdicao ? 'Deixe em branco para manter a atual' : 'Senha inicial (mín. 6 caracteres)'}
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
