import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useListaHomologacoes, useTransicaoStatus, type ItemListaHomologacao } from '@/hooks/useHomologacao'
import { Icone, iconeDaCategoria } from '@/componentes/Icone'
import { LoadingTela } from '@/componentes/LoadingTela'
import { ErroApi } from '@/lib/api'
import { BadgeHomologado } from '@/componentes/comum/BadgeHomologado'
import { ModalInformacoesHomologacao } from '@/componentes/parceiro/ModalInformacoesHomologacao'

type AbaFiltro = 'pendentes' | 'revisao' | 'aprovados' | 'todos'

export function ValidarCertificados() {
  const { data: homologacoes = [], isLoading, isError, error } = useListaHomologacoes()
  const [aba, setAba] = useState<AbaFiltro>('pendentes')
  const [busca, setBusca] = useState('')
  const [homologacaoEmAprovacao, setHomologacaoEmAprovacao] = useState<ItemListaHomologacao | null>(null)
  const [homologacaoEmRevisao, setHomologacaoEmRevisao] = useState<ItemListaHomologacao | null>(null)
  const [homologacaoInfo, setHomologacaoInfo] = useState<ItemListaHomologacao | null>(null)
  const [motivoRevisao, setMotivoRevisao] = useState('')
  const [sucesso, setSucesso] = useState<string | null>(null)
  const [erroAcao, setErroAcao] = useState<string | null>(null)

  const idAlvoTransicao = homologacaoEmAprovacao?.id || homologacaoEmRevisao?.id || ''
  const transicao = useTransicaoStatus(idAlvoTransicao)

  // Estatísticas e filtragens
  const { pendentes, emRevisao, aprovados, todos, empresasParceiras } = useMemo(() => {
    const p = homologacoes.filter((h) => h.status === 'AGUARDANDO_ANALISE')
    const rev = homologacoes.filter((h) => h.status === 'EM_REVISAO')
    const a = homologacoes.filter(
      (h) => h.status === 'APROVADO' || h.status === 'PUBLICADO',
    )

    const empresas = new Set<string>()
    for (const h of homologacoes) {
      const nomeEmpresa = h.responsavel?.empresa || h.dispositivo.empresa
      if (nomeEmpresa) empresas.add(nomeEmpresa)
    }

    return {
      pendentes: p,
      emRevisao: rev,
      aprovados: a,
      todos: homologacoes,
      empresasParceiras: Array.from(empresas),
    }
  }, [homologacoes])

  const listaAtual = useMemo(() => {
    let base = todos
    if (aba === 'pendentes') base = pendentes
    else if (aba === 'revisao') base = emRevisao
    else if (aba === 'aprovados') base = aprovados

    const termo = busca.trim().toLowerCase()
    if (!termo) return base

    return base.filter((h) => {
      const matchTexto = [
        h.dispositivo.nomeComercial,
        h.dispositivo.fabricante,
        h.dispositivo.modelo,
        h.responsavel?.nome,
        h.responsavel?.empresa,
        h.dispositivo.empresa,
        h.numeroSerie,
        h.versaoAgente,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return matchTexto.includes(termo)
    })
  }, [aba, busca, todos, pendentes, aprovados])

  async function confirmarAprovacao() {
    if (!homologacaoEmAprovacao) return
    setErroAcao(null)

    transicao.mutate(
      { novoStatus: 'APROVADO', homologado: true },
      {
        onSuccess: () => {
          setSucesso(
            `Certificado de ${homologacaoEmAprovacao.dispositivo.nomeComercial} homologado e aprovado com sucesso!`,
          )
          setHomologacaoEmAprovacao(null)
          setTimeout(() => setSucesso(null), 5000)
        },
        onError: (err) => {
          setErroAcao(
            err instanceof ErroApi ? err.message : 'Não foi possível aprovar a homologação.',
          )
        },
      },
    )
  }

  async function confirmarRevisao() {
    if (!homologacaoEmRevisao) return
    setErroAcao(null)

    transicao.mutate(
      {
        novoStatus: 'EM_REVISAO',
        motivo: motivoRevisao.trim() || 'Solicitados ajustes técnicos na homologação.',
      },
      {
        onSuccess: () => {
          setSucesso(
            `Homologação de ${homologacaoEmRevisao.dispositivo.nomeComercial} enviada para revisão com sucesso!`,
          )
          setHomologacaoEmRevisao(null)
          setMotivoRevisao('')
          setTimeout(() => setSucesso(null), 5000)
        },
        onError: (err) => {
          setErroAcao(
            err instanceof ErroApi ? err.message : 'Não foi possível solicitar revisão.',
          )
        },
      },
    )
  }

  if (isLoading) {
    return <LoadingTela mensagem="Carregando certificados para validação…" />
  }

  if (isError) {
    return (
      <div className="p-8 text-sm" style={{ color: 'var(--color-destructive)' }}>
        {error instanceof ErroApi ? error.message : 'Não foi possível carregar as homologações.'}
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-[76rem] px-8 py-6 space-y-6">
        {/* Cabeçalho */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight" style={{ color: 'var(--color-foreground)' }}>
                Validação de Certificados
              </h1>
              {pendentes.length > 0 && (
                <span
                  className="px-2.5 py-0.5 rounded-full text-xs font-bold text-white shadow-sm"
                  style={{ background: 'var(--gradient-brand-purple)' }}
                >
                  {pendentes.length} pendente{pendentes.length > 1 ? 's' : ''}
                </span>
              )}
            </div>
            <p className="text-xs sm:text-sm mt-0.5" style={{ color: 'var(--color-muted-foreground)' }}>
              Homologações finalizadas por parceiros aguardando conferência técnica, validação e emissão oficial.
            </p>
          </div>

          <Link
            to="/ambiente/parceiros"
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg border text-xs font-semibold transition-all hover:opacity-80 active:scale-95 shadow-xs self-start sm:self-auto"
            style={{
              borderColor: 'var(--color-border)',
              background: 'var(--color-muted)',
              color: 'var(--color-primary)',
            }}
          >
            <Icone nome="parceiros" className="h-3.5 w-3.5" />
            Gerenciar parceiros
          </Link>
        </div>

        {/* Mensagem de sucesso */}
        {sucesso && (
          <div
            className="px-4 py-3 rounded-lg text-sm font-medium flex items-center justify-between shadow-sm animate-in fade-in"
            style={{ background: 'var(--color-status-ok-soft)', color: 'var(--color-status-ok)' }}
          >
            <span>✓ {sucesso}</span>
            <button
              onClick={() => setSucesso(null)}
              className="text-xs font-bold hover:opacity-75 ml-4"
            >
              ✕
            </button>
          </div>
        )}

        {/* Cards de Métricas Rápidas (Compactos e Horizontais) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div
            className="py-2.5 px-3.5 rounded-xl border flex items-center justify-between gap-2 shadow-2xs transition-all"
            style={{
              background: pendentes.length > 0 ? 'rgba(126,32,101,0.04)' : 'var(--color-card)',
              borderColor: pendentes.length > 0 ? 'var(--color-brand-purple)' : 'var(--color-border)',
            }}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0"
                style={{
                  background: pendentes.length > 0 ? 'var(--gradient-brand-purple)' : 'var(--color-muted)',
                  color: pendentes.length > 0 ? '#fff' : 'var(--color-muted-foreground)',
                }}
              >
                <Icone nome="relogio" className="h-3.5 w-3.5" />
              </div>
              <span className="text-xs font-semibold text-[var(--color-foreground)] truncate">
                Aguardando Validação
              </span>
            </div>
            <span
              className="text-base font-bold px-2 py-0.5 rounded-lg shrink-0"
              style={{
                color: pendentes.length > 0 ? 'var(--color-primary)' : 'var(--color-foreground)',
                background: pendentes.length > 0 ? 'rgba(126,32,101,0.08)' : 'var(--color-muted)',
              }}
            >
              {pendentes.length}
            </span>
          </div>

          <div
            className="py-2.5 px-3.5 rounded-xl border flex items-center justify-between gap-2 shadow-2xs transition-all"
            style={{ background: 'var(--color-card)', borderColor: 'var(--color-border)' }}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: 'var(--color-status-ok-soft)', color: 'var(--color-status-ok)' }}
              >
                <Icone nome="certificado" className="h-3.5 w-3.5" />
              </div>
              <span className="text-xs font-semibold text-[var(--color-foreground)] truncate">
                Aprovados & Emitidos
              </span>
            </div>
            <span
              className="text-base font-bold px-2 py-0.5 rounded-lg shrink-0 text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-300"
            >
              {aprovados.length}
            </span>
          </div>

          <div
            className="py-2.5 px-3.5 rounded-xl border flex items-center justify-between gap-2 shadow-2xs transition-all"
            style={{ background: 'var(--color-card)', borderColor: 'var(--color-border)' }}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: 'var(--color-muted)', color: 'var(--color-muted-foreground)' }}
              >
                <Icone nome="parceiros" className="h-3.5 w-3.5" />
              </div>
              <span className="text-xs font-semibold text-[var(--color-foreground)] truncate">
                Parceiros Cadastrados
              </span>
            </div>
            <span
              className="text-base font-bold px-2 py-0.5 rounded-lg shrink-0 text-[var(--color-foreground)] bg-[var(--color-muted)]"
            >
              {empresasParceiras.length}
            </span>
          </div>
        </div>

        {/* Abas e Barra de Busca */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
          <div className="flex items-center gap-1.5 p-1 rounded-lg border bg-muted/30 self-start">
            <button
              onClick={() => setAba('pendentes')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                aba === 'pendentes' ? 'shadow-sm text-white' : 'text-muted-foreground hover:text-foreground'
              }`}
              style={{
                background: aba === 'pendentes' ? 'var(--gradient-brand-purple)' : 'transparent',
              }}
            >
              Aguardando Validação ({pendentes.length})
            </button>
            <button
              onClick={() => setAba('revisao')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                aba === 'revisao' ? 'shadow-sm text-white' : 'text-muted-foreground hover:text-foreground'
              }`}
              style={{
                background: aba === 'revisao' ? 'var(--gradient-brand-purple)' : 'transparent',
              }}
            >
              Em Revisão ({emRevisao.length})
            </button>
            <button
              onClick={() => setAba('aprovados')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                aba === 'aprovados' ? 'shadow-sm text-white' : 'text-muted-foreground hover:text-foreground'
              }`}
              style={{
                background: aba === 'aprovados' ? 'var(--gradient-brand-purple)' : 'transparent',
              }}
            >
              Aprovados ({aprovados.length})
            </button>
            <button
              onClick={() => setAba('todos')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                aba === 'todos' ? 'shadow-sm text-white' : 'text-muted-foreground hover:text-foreground'
              }`}
              style={{
                background: aba === 'todos' ? 'var(--gradient-brand-purple)' : 'transparent',
              }}
            >
              Todos ({todos.length})
            </button>
          </div>

          <div className="relative w-full sm:w-72">
            <Icone
              nome="busca"
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none opacity-50"
            />
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border bg-transparent outline-none focus:ring-1"
              style={{ borderColor: 'var(--color-input)' }}
            />
            {busca && (
              <button
                onClick={() => setBusca('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Lista de Certificados / Homologações */}
        {listaAtual.length === 0 ? (
          <div
            className="p-12 text-center rounded-xl border flex flex-col items-center justify-center"
            style={{ background: 'var(--color-card)', borderColor: 'var(--color-border)' }}
          >
            <div
              className="h-12 w-12 rounded-full flex items-center justify-center mb-3"
              style={{ background: 'var(--color-muted)', color: 'var(--color-muted-foreground)' }}
            >
              <Icone nome="certificado" className="h-6 w-6" />
            </div>
            <h3 className="text-base font-semibold" style={{ color: 'var(--color-foreground)' }}>
              {aba === 'pendentes'
                ? 'Nenhum certificado pendente de validação'
                : aba === 'revisao'
                ? 'Nenhuma homologação em revisão técnica no momento'
                : 'Nenhuma homologação encontrada'}
            </h3>
            <p className="text-xs sm:text-sm mt-1 max-w-md" style={{ color: 'var(--color-muted-foreground)' }}>
              {aba === 'pendentes'
                ? 'Quando um parceiro finalizar a bateria de testes de um dispositivo, a solicitação aparecerá imediatamente aqui para revisão e aprovação.'
                : aba === 'revisao'
                ? 'Homologações devolvidas aos parceiros com solicitação de ajustes técnicos aparecerão aqui enquanto os parceiros corrigem.'
                : 'Ajuste os filtros ou o termo de busca para visualizar outros registros.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {listaAtual.map((h) => {
              const nomeEmpresa = h.responsavel?.empresa || h.dispositivo.empresa || 'Parceiro'
              const nomeResponsavel = h.responsavel?.nome || 'Técnico'
              const isPendente = h.status === 'AGUARDANDO_ANALISE' || h.status === 'EM_REVISAO'
              const isAprovado = h.status === 'APROVADO' || h.status === 'PUBLICADO'
              const dataEnvio = new Date(h.atualizadoEm || h.criadoEm).toLocaleDateString('pt-BR')

              return (
                <div
                  key={h.id}
                  className="p-3.5 sm:p-4 rounded-xl border transition-all hover:shadow-md"
                  style={{
                    background: 'var(--color-card)',
                    borderColor: isPendente ? 'var(--color-primary)' : 'var(--color-border)',
                  }}
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    {/* Dispositivo e Foto */}
                    <div className="flex items-center gap-3.5 min-w-0 flex-1">
                      <div
                        className="h-14 w-14 rounded-lg border shrink-0 overflow-hidden flex items-center justify-center p-1"
                        style={{ background: 'var(--color-muted)', borderColor: 'var(--color-border)' }}
                      >
                        {h.dispositivo.fotoUrl ? (
                          <img
                            src={h.dispositivo.fotoUrl}
                            alt={h.dispositivo.nomeComercial}
                            className="h-full w-full object-contain"
                          />
                        ) : (
                          <Icone
                            nome={iconeDaCategoria(h.dispositivo.categoria?.icone)}
                            className="h-7 w-7 text-muted-foreground"
                          />
                        )}
                      </div>

                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className="px-2 py-0.5 rounded text-[10.5px] font-semibold uppercase tracking-wider"
                            style={{
                              background: 'var(--color-muted)',
                              color: 'var(--color-muted-foreground)',
                            }}
                          >
                            {h.dispositivo.categoria?.nome || 'Dispositivo'}
                          </span>

                          {isAprovado ? (
                            <BadgeHomologado homologado={true} />
                          ) : (
                            <span
                              className="px-2.5 py-0.5 rounded-full text-[10.5px] font-bold"
                              style={{
                                background: isPendente
                                  ? 'var(--color-warning-soft)'
                                  : 'var(--color-muted)',
                                color: isPendente
                                  ? 'var(--color-warning-fg)'
                                  : 'var(--color-muted-foreground)',
                              }}
                            >
                              {h.status === 'AGUARDANDO_ANALISE'
                                ? 'Em Validação'
                                : h.status === 'EM_REVISAO'
                                ? 'Em Revisão'
                                : h.status}
                            </span>
                          )}

                          <span
                            className="px-2 py-0.5 rounded-md text-[10.5px] font-bold tracking-wide"
                            style={{ background: 'rgba(126,32,101,0.08)', color: 'var(--color-primary)' }}
                          >
                            {nomeEmpresa}
                          </span>

                          <span className="text-[11px] text-[var(--color-muted-foreground)] ml-auto sm:ml-1 font-medium">
                            · Envio: {dataEnvio}
                          </span>
                        </div>

                        <h3 className="text-sm sm:text-base font-semibold leading-tight truncate" style={{ color: 'var(--color-foreground)' }}>
                          {h.dispositivo.nomeComercial}
                        </h3>

                        <p className="text-xs truncate" style={{ color: 'var(--color-muted-foreground)' }}>
                          {h.dispositivo.fabricante} {h.dispositivo.modelo} · Resp.: <strong>{nomeResponsavel}</strong>
                          {h.assinaturaApoio && ` · Apoio: ${h.assinaturaApoio}`} · SO: {h.versaoSo} · Agente: {h.versaoAgente}
                          {h.numeroSerie ? ` · S/N: ${h.numeroSerie}` : ''}
                        </p>
                      </div>
                    </div>

                      {/* Botões de Ação */}
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Visualizar Certificado */}
                        <Link
                          to={`/homologacoes/${h.id}/certificado`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors hover:opacity-80"
                          style={{
                            borderColor: 'var(--color-border)',
                            background: 'var(--color-muted)',
                            color: 'var(--color-foreground)',
                          }}
                          title="Visualizar documento do certificado"
                        >
                          <Icone nome="certificado" className="h-3.5 w-3.5" />
                          Certificado
                        </Link>

                        {/* Exibir Informações */}
                        <button
                          type="button"
                          onClick={() => setHomologacaoInfo(h)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors hover:opacity-80"
                          style={{
                            borderColor: 'var(--color-border)',
                            background: 'var(--color-card)',
                            color: 'var(--color-foreground)',
                          }}
                          title="Visualizar informações e detalhes dos testes"
                        >
                          <Icone nome="painel" className="h-3.5 w-3.5" />
                          Exibir Informações
                        </button>

                        {/* Botão de Validação / Aprovação */}
                        {isPendente && (
                          <>
                            <button
                              type="button"
                              onClick={() => setHomologacaoEmRevisao(h)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-opacity hover:opacity-80"
                              style={{
                                borderColor: 'var(--color-border)',
                                color: 'var(--color-muted-foreground)',
                              }}
                            >
                              Revisão
                            </button>

                            <button
                              type="button"
                              onClick={() => setHomologacaoEmAprovacao(h)}
                              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white shadow-sm transition-all hover:opacity-95"
                              style={{
                                background: 'var(--gradient-brand-purple)',
                                boxShadow: '0 2px 6px -1px rgba(126, 32, 101, 0.4)',
                              }}
                            >
                              ✓ Aprovar & Emitir
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )
            })}
          </div>
        )}
      </div>

      {/* Modal de Confirmação de Aprovação */}
      {homologacaoEmAprovacao && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(15,15,18,.5)' }}
          onClick={() => setHomologacaoEmAprovacao(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-xl border shadow-xl p-6 space-y-4"
            style={{ background: 'var(--color-popover)', borderColor: 'var(--color-border)' }}
          >
            <div>
              <h3 className="text-base font-bold" style={{ color: 'var(--color-foreground)' }}>
                Validar e Aprovar Certificado
              </h3>
              <p className="text-xs mt-1" style={{ color: 'var(--color-muted-foreground)' }}>
                Você está validando a homologação de{' '}
                <strong>{homologacaoEmAprovacao.dispositivo.nomeComercial}</strong> submetida por{' '}
                <strong>
                  {homologacaoEmAprovacao.responsavel?.empresa ||
                    homologacaoEmAprovacao.dispositivo.empresa ||
                    'Parceiro'}
                </strong>
                .
              </p>
            </div>

            <div
              className="p-3 rounded-lg text-xs space-y-1.5"
              style={{ background: 'var(--color-status-ok-soft)', color: 'var(--color-status-ok)' }}
            >
              <p className="font-semibold">✓ Confirmação Técnica:</p>
              <p>
                Ao aprovar, o status mudará para <strong>Aprovado</strong> e o certificado oficial estará
                pronto e homologado para o dispositivo.
              </p>
            </div>

            {erroAcao && (
              <div className="p-3 rounded-md text-xs bg-destructive/10 text-destructive font-medium">
                {erroAcao}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setHomologacaoEmAprovacao(null)}
                className="px-3.5 py-1.5 rounded-lg border text-xs font-semibold"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-muted-foreground)' }}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={transicao.isPending}
                onClick={confirmarAprovacao}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ background: 'var(--gradient-brand-purple)' }}
              >
                {transicao.isPending ? 'Validando…' : 'Confirmar Aprovação'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Solicitação de Revisão */}
      {homologacaoEmRevisao && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(15,15,18,.5)' }}
          onClick={() => setHomologacaoEmRevisao(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-xl border shadow-xl p-6 space-y-4"
            style={{ background: 'var(--color-popover)', borderColor: 'var(--color-border)' }}
          >
            <div>
              <h3 className="text-base font-bold" style={{ color: 'var(--color-foreground)' }}>
                Solicitar Ajustes Técnicos
              </h3>
              <p className="text-xs mt-1" style={{ color: 'var(--color-muted-foreground)' }}>
                A homologação voltará ao status <strong>Em Revisão</strong> para que o parceiro ajuste
                testes ou envie novas observações.
              </p>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="motivo-revisao"
                className="block text-xs font-semibold uppercase tracking-wider"
                style={{ color: 'var(--color-muted-foreground)' }}
              >
                Motivo / Apontamentos para o parceiro
              </label>
              <textarea
                id="motivo-revisao"
                rows={3}
                value={motivoRevisao}
                onChange={(e) => setMotivoRevisao(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border bg-transparent outline-none focus:ring-1"
                style={{ borderColor: 'var(--color-input)' }}
              />
            </div>

            {erroAcao && (
              <div className="p-3 rounded-md text-xs bg-destructive/10 text-destructive font-medium">
                {erroAcao}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setHomologacaoEmRevisao(null)}
                className="px-3.5 py-1.5 rounded-lg border text-xs font-semibold"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-muted-foreground)' }}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={transicao.isPending}
                onClick={confirmarRevisao}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ background: 'var(--gradient-brand-purple)' }}
              >
                {transicao.isPending ? 'Enviando…' : 'Enviar para Revisão'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Informações */}
      {homologacaoInfo && (
        <ModalInformacoesHomologacao
          homologacaoId={homologacaoInfo.id}
          dispositivo={{
            ...homologacaoInfo.dispositivo,
            versaoSo: homologacaoInfo.versaoSo,
            versaoAgente: homologacaoInfo.versaoAgente,
            gerenciamento: homologacaoInfo.gerenciamento,
            status: homologacaoInfo.status,
            homologado: homologacaoInfo.homologado || homologacaoInfo.status === 'APROVADO' || homologacaoInfo.status === 'PUBLICADO',
            homologacaoId: homologacaoInfo.id,
            observacoes: homologacaoInfo.observacoes,
          }}
          aoFechar={() => setHomologacaoInfo(null)}
        />
      )}
    </div>
  )
}
