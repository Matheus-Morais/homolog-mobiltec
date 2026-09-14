import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useHomologacoesFinalizadas, useRemoverHomologacao } from '@/hooks/useHomologacao'
import { useCategorias } from '@/hooks/useVitrine'
import { useAuth } from '@/contextos/AuthContext'
import { LoadingTela } from '@/componentes/LoadingTela'
import { ModalReabrir } from '@/componentes/matriz/ModalReabrir'
import { Icone, iconeDaCategoria } from '@/componentes/Icone'
import { ErroApi } from '@/lib/api'

export function ConfigurarDispositivos() {
  const { ehAdmin } = useAuth()
  const { data: homologacoes = [], isLoading, isError, error } = useHomologacoesFinalizadas()
  const { data: categorias = [] } = useCategorias()
  const removerHomologacao = useRemoverHomologacao()

  const [busca, setBusca] = useState('')
  const [filtroCategoria, setFiltroCategoria] = useState('')
  const [filtroParceiro, setFiltroParceiro] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')

  const [itemParaReabrir, setItemParaReabrir] = useState<any | null>(null)
  const [itemParaExcluir, setItemParaExcluir] = useState<any | null>(null)
  const [erroExcluir, setErroExcluir] = useState<string | null>(null)

  // Extrai lista única de parceiros / empresas presentes nos dados
  const parceirosDisponiveis = useMemo(() => {
    const lista = new Set<string>()
    for (const h of homologacoes) {
      const empresa = h.responsavel?.empresa?.trim() || h.dispositivo?.empresa?.trim()
      if (empresa && empresa.toLowerCase() !== 'mobiltec') {
        lista.add(empresa)
      }
    }
    return Array.from(lista).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [homologacoes])

  // Filtragem dinâmica
  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return homologacoes.filter((h: any) => {
      if (filtroCategoria && h.dispositivo?.categoriaId !== filtroCategoria) return false

      const empresa = (h.responsavel?.empresa || h.dispositivo?.empresa || 'Mobiltec').trim()
      if (filtroParceiro) {
        if (filtroParceiro === 'Mobiltec' && empresa.toLowerCase() !== 'mobiltec') return false
        if (filtroParceiro !== 'Mobiltec' && empresa.toLowerCase() !== filtroParceiro.toLowerCase()) return false
      }

      if (filtroStatus && h.status !== filtroStatus) return false

      if (!termo) return true
      const campos = [
        h.dispositivo?.nomeComercial,
        h.dispositivo?.fabricante,
        h.dispositivo?.modelo,
        h.dispositivo?.categoria?.nome,
        empresa,
        h.versaoAgente,
        h.versaoSo,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return campos.includes(termo)
    })
  }, [homologacoes, busca, filtroCategoria, filtroParceiro, filtroStatus])

  // Métricas
  const totalAprovados = homologacoes.filter((h: any) => h.status === 'APROVADO').length
  const totalPublicados = homologacoes.filter((h: any) => h.status === 'PUBLICADO').length
  const totalReprovados = homologacoes.filter((h: any) => h.status === 'REPROVADO').length

  if (!ehAdmin) {
    return (
      <div className="flex-1 p-8 text-center">
        <p className="text-sm" style={{ color: 'var(--color-destructive)' }}>
          Acesso restrito. Apenas administradores podem acessar a configuração e gestão de dispositivos finalizados.
        </p>
      </div>
    )
  }

  if (isLoading) {
    return <LoadingTela mensagem="Carregando dispositivos homologados e finalizados…" />
  }

  if (isError) {
    return (
      <div className="p-8 text-sm" style={{ color: 'var(--color-destructive)' }}>
        {error instanceof ErroApi ? error.message : 'Não foi possível carregar os dispositivos finalizados.'}
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-[84rem] px-8 pt-6 pb-16 space-y-6">

        {/* Cabeçalho */}
        <header className="border-b pb-4" style={{ borderColor: 'var(--color-border)' }}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold tracking-tight" style={{ color: 'var(--color-foreground)' }}>
                Configurar Dispositivos
              </h1>
              <p className="text-xs mt-1" style={{ color: 'var(--color-muted-foreground)' }}>
                Painel consultivo de modelos finalizados na Mobiltec e parceiros. Reabra para ajustes ou exclua definitivamente da base.
              </p>
            </div>

            {/* Badges de Métricas */}
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border"
                    style={{ background: 'var(--color-muted)', borderColor: 'var(--color-border)', color: 'var(--color-foreground)' }}>
                <span>Total:</span>
                <strong className="font-bold">{homologacoes.length}</strong>
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border border-emerald-200 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-800/60 dark:text-emerald-300">
                <span>Aprovados:</span>
                <strong className="font-bold">{totalAprovados + totalPublicados}</strong>
              </span>
              {totalReprovados > 0 && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border border-red-200 bg-red-50 text-red-800 dark:bg-red-950/40 dark:border-red-800/60 dark:text-red-300">
                  <span>Reprovados:</span>
                  <strong className="font-bold">{totalReprovados}</strong>
                </span>
              )}
            </div>
          </div>
        </header>

        {/* Barra de Filtros */}
        <div className="flex flex-wrap items-center gap-3 p-3.5 rounded-xl border bg-[var(--color-popover)]"
             style={{ borderColor: 'var(--color-border)' }}>
          {/* Busca */}
          <div className="relative flex-1 min-w-56">
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por modelo, fabricante, parceiro ou versão…"
              className="w-full pl-9 pr-3 py-1.5 rounded-lg border text-xs bg-transparent outline-none focus:border-[var(--color-primary)] transition-colors"
              style={{ borderColor: 'var(--color-input)', color: 'var(--color-foreground)' }}
            />
            <div className="absolute left-2.5 top-2 text-[var(--color-muted-foreground)]">
              <Icone nome="busca" className="h-4 w-4" />
            </div>
            {busca && (
              <button
                type="button"
                onClick={() => setBusca('')}
                className="absolute right-2.5 top-2 text-xs font-bold text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
              >
                ✕
              </button>
            )}
          </div>

          {/* Filtro Categoria */}
          <select
            value={filtroCategoria}
            onChange={(e) => setFiltroCategoria(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border text-xs bg-transparent outline-none cursor-pointer"
            style={{ borderColor: 'var(--color-input)', color: 'var(--color-foreground)' }}
          >
            <option value="">Todas as categorias</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>

          {/* Filtro Parceiro / Empresa */}
          <select
            value={filtroParceiro}
            onChange={(e) => setFiltroParceiro(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border text-xs bg-transparent outline-none cursor-pointer"
            style={{ borderColor: 'var(--color-input)', color: 'var(--color-foreground)' }}
          >
            <option value="">Todos os parceiros / ambientes</option>
            <option value="Mobiltec">Mobiltec (Interno)</option>
            {parceirosDisponiveis.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>

          {/* Filtro Status */}
          <select
            value={filtroStatus}
            onChange={(e) => setFiltroStatus(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border text-xs bg-transparent outline-none cursor-pointer"
            style={{ borderColor: 'var(--color-input)', color: 'var(--color-foreground)' }}
          >
            <option value="">Todos os status</option>
            <option value="APROVADO">Aprovado</option>
            <option value="PUBLICADO">Publicado</option>
            <option value="REPROVADO">Reprovado</option>
          </select>

          {(busca || filtroCategoria || filtroParceiro || filtroStatus) && (
            <button
              type="button"
              onClick={() => {
                setBusca('')
                setFiltroCategoria('')
                setFiltroParceiro('')
                setFiltroStatus('')
              }}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:bg-black/[0.04] transition-colors"
            >
              Limpar filtros
            </button>
          )}
        </div>

        {/* Tabela de Dispositivos Finalizados */}
        <div className="rounded-xl border overflow-hidden bg-[var(--color-popover)]"
             style={{ borderColor: 'var(--color-border)' }}>
          {filtrados.length === 0 ? (
            <div className="p-12 text-center space-y-2">
              <p className="text-sm font-medium" style={{ color: 'var(--color-foreground)' }}>
                Nenhum dispositivo homologado ou finalizado encontrado.
              </p>
              <p className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>
                Tente ajustar os filtros acima ou aguarde a finalização de novas homologações.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b bg-[var(--color-muted)] text-[var(--color-muted-foreground)] font-semibold uppercase tracking-wider"
                      style={{ borderColor: 'var(--color-border)' }}>
                    <th className="px-4 py-3">Dispositivo</th>
                    <th className="px-4 py-3">Categoria</th>
                    <th className="px-4 py-3">Ambiente / Parceiro</th>
                    <th className="px-4 py-3">Versão Agente & SO</th>
                    <th className="px-4 py-3">Conclusão</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
                  {filtrados.map((h: any) => {
                    const empresa = (h.responsavel?.empresa || h.dispositivo?.empresa || 'Mobiltec').trim()
                    const ehParceiro = empresa.toLowerCase() !== 'mobiltec'
                    const nomeComercial = h.dispositivo?.nomeComercial || `${h.dispositivo?.fabricante} ${h.dispositivo?.modelo}`
                    const dataFormatada = h.dataFim
                      ? new Date(h.dataFim).toLocaleDateString('pt-BR')
                      : 'Não informada'

                    return (
                      <tr
                        key={h.id}
                        className="transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.02]"
                      >
                        {/* Dispositivo */}
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-lg border flex items-center justify-center shrink-0 bg-[var(--color-muted)]"
                                 style={{ borderColor: 'var(--color-border)' }}>
                              {h.dispositivo?.fotoUrl ? (
                                <img
                                  src={h.dispositivo.fotoUrl}
                                  alt={nomeComercial}
                                  className="h-8 w-8 object-contain rounded"
                                />
                              ) : (
                                <Icone
                                  nome={iconeDaCategoria(h.dispositivo?.categoria?.icone || 'smartphone')}
                                  className="h-4 w-4 text-[var(--color-muted-foreground)]"
                                />
                              )}
                            </div>
                            <div>
                              <p className="font-semibold text-sm leading-snug" style={{ color: 'var(--color-foreground)' }}>
                                {nomeComercial}
                              </p>
                              <p className="text-[11px] text-[var(--color-muted-foreground)]">
                                {h.dispositivo?.fabricante} · {h.dispositivo?.modelo}
                              </p>
                            </div>
                          </div>
                        </td>

                        {/* Categoria */}
                        <td className="px-4 py-3.5">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border"
                                style={{ background: 'var(--color-muted)', borderColor: 'var(--color-border)', color: 'var(--color-foreground)' }}>
                            {h.dispositivo?.categoria?.nome || '—'}
                          </span>
                        </td>

                        {/* Ambiente / Parceiro */}
                        <td className="px-4 py-3.5">
                          <div className="space-y-0.5">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${
                                ehParceiro
                                  ? 'bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-950/60 dark:text-amber-200 dark:border-amber-800'
                                  : 'bg-purple-100 text-purple-900 border border-purple-200 dark:bg-purple-950/60 dark:text-purple-200 dark:border-purple-800'
                              }`}
                            >
                              {ehParceiro ? `Parceiro ${empresa}` : 'Mobiltec'}
                            </span>
                            {h.responsavel?.nome && (
                              <p className="text-[10px] text-[var(--color-muted-foreground)]">
                                Resp.: {h.responsavel.nome}
                              </p>
                            )}
                          </div>
                        </td>

                        {/* Versão */}
                        <td className="px-4 py-3.5">
                          <p className="font-medium" style={{ color: 'var(--color-foreground)' }}>
                            Agente: {h.versaoAgente || '—'}
                          </p>
                          <p className="text-[11px] text-[var(--color-muted-foreground)]">
                            SO: {h.versaoSo || '—'}
                          </p>
                        </td>

                        {/* Conclusão */}
                        <td className="px-4 py-3.5 text-[var(--color-muted-foreground)]">
                          {dataFormatada}
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3.5">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                              h.status === 'APROVADO'
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300'
                                : h.status === 'PUBLICADO'
                                  ? 'bg-sky-100 text-sky-800 border border-sky-300 dark:bg-sky-950/60 dark:text-sky-300'
                                  : 'bg-red-100 text-red-800 border border-red-300 dark:bg-red-950/60 dark:text-red-300'
                            }`}
                          >
                            {h.status === 'APROVADO'
                              ? 'Aprovado'
                              : h.status === 'PUBLICADO'
                                ? 'Publicado'
                                : 'Reprovado'}
                          </span>
                        </td>

                        {/* Ações */}
                        <td className="px-4 py-3.5 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            {/* Certificado */}
                            <Link
                              to={`/homologacoes/${h.id}/certificado`}
                              className="px-2.5 py-1.5 rounded-md border text-xs font-medium text-[var(--color-foreground)] hover:bg-black/[0.04] transition-colors"
                              style={{ borderColor: 'var(--color-border)' }}
                              title="Visualizar Certificado Técnico"
                            >
                              Certificado
                            </Link>

                            {/* Reabrir */}
                            <button
                              type="button"
                              onClick={() => setItemParaReabrir(h)}
                              className="px-2.5 py-1.5 rounded-md border text-xs font-semibold text-[var(--color-primary)] border-[var(--color-primary)]/40 hover:bg-[var(--color-primary)]/10 transition-colors"
                              title="Reabrir homologação para rascunho"
                            >
                              Reabrir
                            </button>

                            {/* Excluir da base */}
                            <button
                              type="button"
                              onClick={() => {
                                setErroExcluir(null)
                                setItemParaExcluir(h)
                              }}
                              className="px-2.5 py-1.5 rounded-md border text-xs font-semibold text-[var(--color-destructive)] border-[var(--color-destructive)]/40 hover:bg-[var(--color-destructive)]/10 transition-colors"
                              title="Excluir dispositivo da base definitivamente"
                            >
                              Excluir
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modal Reabrir */}
      {itemParaReabrir && (
        <ModalReabrir
          homologacao={itemParaReabrir}
          aoFechar={() => setItemParaReabrir(null)}
          aoReabrir={() => setItemParaReabrir(null)}
        />
      )}

      {/* Modal Excluir da Base */}
      {itemParaExcluir && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(15,15,18,.45)' }}
          onClick={() => setItemParaExcluir(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Excluir dispositivo da base"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.key === 'Escape' && setItemParaExcluir(null)}
            className="w-full max-w-md rounded-xl border shadow-xl p-5 space-y-4"
            style={{ background: 'var(--color-popover)', color: 'var(--color-foreground)' }}
          >
            <div className="flex items-center gap-3">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                style={{ background: 'var(--color-destructive-soft)', color: 'var(--color-destructive)' }}
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-semibold">Excluir dispositivo da base</h3>
                <p className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>
                  {itemParaExcluir.dispositivo?.nomeComercial} · {itemParaExcluir.responsavel?.empresa || 'Mobiltec'}
                </p>
              </div>
            </div>

            <p className="text-sm leading-relaxed" style={{ color: 'var(--color-foreground)' }}>
              Tem certeza que deseja excluir permanentemente este dispositivo da base?
              Esta ação removerá a homologação, certificados e todos os registros atrelados tanto do ambiente Mobiltec quanto do ambiente do parceiro.
            </p>

            {erroExcluir && (
              <div
                role="alert"
                className="px-3 py-2 rounded-md text-xs"
                style={{ background: 'var(--color-destructive-soft)', color: 'var(--color-destructive-fg)' }}
              >
                {erroExcluir}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t" style={{ borderColor: 'var(--color-border)' }}>
              <button
                type="button"
                onClick={() => setItemParaExcluir(null)}
                disabled={removerHomologacao.isPending}
                className="px-3 py-1.5 rounded-md text-xs font-medium"
                style={{ color: 'var(--color-muted-foreground)' }}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={removerHomologacao.isPending}
                onClick={async () => {
                  try {
                    setErroExcluir(null)
                    await removerHomologacao.mutateAsync(itemParaExcluir.id)
                    setItemParaExcluir(null)
                  } catch (err) {
                    setErroExcluir(err instanceof ErroApi ? err.message : 'Não foi possível excluir da base.')
                  }
                }}
                className="px-3.5 py-1.5 rounded-md text-xs font-semibold text-white disabled:opacity-50 transition-opacity"
                style={{ background: 'var(--color-destructive)' }}
              >
                {removerHomologacao.isPending ? 'Excluindo…' : 'Excluir definitivamente'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
