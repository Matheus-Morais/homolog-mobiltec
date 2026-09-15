import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useHomologacao } from '@/hooks/useHomologacao'
import { Icone } from '@/componentes/Icone'
import { LoadingTela } from '@/componentes/LoadingTela'
import { BadgeHomologado } from '@/componentes/comum/BadgeHomologado'
import type { DispositivoPainelParceiro, StatusHomologacao, StatusResultado } from '@/lib/tipos'

interface ItemObservacaoProcessada {
  id: string
  titulo: string
  texto: string
  autorNome?: string
  autorEmail?: string
  data?: string
  criadoEm?: string
  anexos?: any[]
}

export function parseObservacoes(raw?: string | null): ItemObservacaoProcessada[] {
  if (!raw || !raw.trim()) return []
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      return parsed.map((item: any, idx) => ({
        id: item.id || String(idx),
        titulo: item.titulo || item.assunto || 'Observação',
        texto: item.texto || item.mensagem || item.descricao || '',
        autorNome: item.autorNome || item.autor || '',
        autorEmail: item.autorEmail || item.email || '',
        data: item.data || item.criadoEm,
        anexos: item.anexos || [],
      }))
    }
    if (typeof parsed === 'object' && parsed !== null) {
      return [
        {
          id: parsed.id || '1',
          titulo: parsed.titulo || 'Observação',
          texto: parsed.texto || parsed.mensagem || '',
          autorNome: parsed.autorNome,
          autorEmail: parsed.autorEmail || parsed.email || '',
          data: parsed.data || parsed.criadoEm,
          anexos: parsed.anexos || [],
        },
      ]
    }
  } catch {
    // fallback texto puro
  }

  return [
    {
      id: '1',
      titulo: 'Observação do Processo',
      texto: raw.trim(),
    },
  ]
}

interface Props {
  homologacaoId: string
  dispositivo: DispositivoPainelParceiro
  aoFechar: () => void
}

type FiltroItens = 'todos' | 'divergencias' | 'ok' | 'pendentes'

function formatarNomeGrupo(nome: string) {
  return nome
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/(^\w|\s\w)/g, (m) => m.toUpperCase())
}

export function ModalInformacoesHomologacao({ homologacaoId, dispositivo: d, aoFechar }: Props) {
  const { data: homologacao, isLoading } = useHomologacao(homologacaoId)
  const [abaAtiva, setAbaAtiva] = useState<string>('TODOS')
  const [filtroStatus, setFiltroStatus] = useState<FiltroItens>('todos')

  const resultados = homologacao?.resultados ?? []
  const observacoes = useMemo(() => {
    return parseObservacoes(homologacao?.observacoes ?? d.observacoes)
  }, [homologacao?.observacoes, d.observacoes])

  const resumo = useMemo(() => {
    let ok = 0
    let divergencias = 0
    let pendentes = 0
    let naoAplicavel = 0

    for (const r of resultados) {
      if (r.status === 'OK') ok++
      else if (r.status === 'NAO_TESTADO') pendentes++
      else if (r.status === 'NAO_APLICAVEL') naoAplicavel++
      else if (['FALHA', 'NAO_SUPORTADO', 'COM_RESSALVA'].includes(r.status)) divergencias++
    }

    const total = resultados.length
    const pct = total > 0 ? Math.round(((total - pendentes) / total) * 100) : 0

    return { total, ok, divergencias, pendentes, naoAplicavel, pct }
  }, [resultados])

  const gruposDisponiveis = useMemo(() => {
    const mapa = new Map<string, number>()
    for (const r of resultados) {
      const g = r.item?.grupo ?? 'OUTROS'
      mapa.set(g, (mapa.get(g) ?? 0) + 1)
    }
    return Array.from(mapa.entries()).map(([grupo, total]) => ({
      id: grupo,
      nome: formatarNomeGrupo(grupo),
      total,
    }))
  }, [resultados])

  const itensExibidos = useMemo(() => {
    let lista = resultados
    if (abaAtiva !== 'TODOS' && abaAtiva !== 'OBSERVACOES') {
      lista = lista.filter((r) => (r.item?.grupo ?? 'OUTROS') === abaAtiva)
    }
    if (filtroStatus === 'divergencias') {
      lista = lista.filter((r) => ['FALHA', 'NAO_SUPORTADO', 'COM_RESSALVA'].includes(r.status))
    } else if (filtroStatus === 'ok') {
      lista = lista.filter((r) => r.status === 'OK')
    } else if (filtroStatus === 'pendentes') {
      lista = lista.filter((r) => r.status === 'NAO_TESTADO')
    }
    return lista
  }, [resultados, abaAtiva, filtroStatus])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)' }}
    >
      <div
        className="w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        style={{ background: 'var(--color-card)', borderColor: 'var(--color-border)' }}
      >
        {/* Topo do Modal com roxo sutil de fundo */}
        <div
          className="p-5 border-b flex items-start justify-between gap-4 shrink-0"
          style={{
            background: 'rgba(126, 32, 101, 0.04)',
            borderColor: 'rgba(126, 32, 101, 0.12)',
          }}
        >
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                {d.fabricante} · {d.categoriaNome}
              </span>
            </div>
            <h2 className="text-lg font-bold text-slate-900 mt-0.5">{d.nomeComercial}</h2>
            <div className="flex items-center gap-2 mt-1.5 text-xs text-slate-600 flex-wrap">
              <span>Android: <strong>{d.versaoSo}</strong></span>
              <span>·</span>
              <span>Agente: <strong>{d.versaoAgente}</strong></span>
              <span>·</span>
              <span>Modo: <strong>{d.gerenciamento === 'ANDROID_ENTERPRISE' ? 'Enterprise' : 'Legado'}</strong></span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {d.homologado || d.status === 'APROVADO' || d.status === 'PUBLICADO' ? (
              <BadgeHomologado homologado={true} />
            ) : (
              <BadgeStatusModal status={d.status} />
            )}
            <button
              type="button"
              onClick={aoFechar}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
              title="Fechar"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Resumo Quantitativo dos Testes (Compacto e Neutro) */}
        <div className="flex items-center flex-wrap gap-4 sm:gap-6 px-5 py-3 border-b bg-slate-50/60 text-xs text-slate-600 shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Progresso:</span>
            <span className="text-sm font-bold text-slate-900">{resumo.pct}%</span>
            <span className="text-[11px] text-slate-400">({resumo.total - resumo.pendentes}/{resumo.total})</span>
          </div>
          <span className="text-slate-300 hidden sm:inline">|</span>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Aprovados:</span>
            <span className="text-sm font-bold text-slate-900">{resumo.ok}</span>
          </div>
          <span className="text-slate-300 hidden sm:inline">|</span>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Divergências:</span>
            <span className="text-sm font-bold text-slate-900">{resumo.divergencias}</span>
          </div>
          <span className="text-slate-300 hidden sm:inline">|</span>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Não Testados:</span>
            <span className="text-sm font-bold text-slate-900">{resumo.pendentes}</span>
          </div>
          <span className="text-slate-300 hidden sm:inline">|</span>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Não Aplicável:</span>
            <span className="text-sm font-bold text-slate-900">{resumo.naoAplicavel}</span>
          </div>
        </div>

        {/* Barra de Abas / Botões Lado a Lado (Clean e Compacto) */}
        <div className="px-5 pt-3 pb-2 border-b bg-white flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setAbaAtiva('TODOS')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                abaAtiva === 'TODOS'
                  ? 'text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200 hover:text-slate-900'
              }`}
              style={abaAtiva === 'TODOS' ? { background: 'var(--gradient-brand-purple)' } : undefined}
            >
              Todos ({resultados.length})
            </button>

            {gruposDisponiveis.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => setAbaAtiva(g.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  abaAtiva === g.id
                    ? 'text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 hover:text-slate-900'
                }`}
                style={abaAtiva === g.id ? { background: 'var(--gradient-brand-purple)' } : undefined}
              >
                {g.nome} ({g.total})
              </button>
            ))}

            <button
              type="button"
              onClick={() => setAbaAtiva('OBSERVACOES')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                abaAtiva === 'OBSERVACOES'
                  ? 'text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200 hover:text-slate-900'
              }`}
              style={abaAtiva === 'OBSERVACOES' ? { background: 'var(--gradient-brand-purple)' } : undefined}
            >
              <span>💬</span>
              <span>Observações ({observacoes.length})</span>
            </button>
          </div>

          {/* Filtros de Status (exibidos apenas quando estiver na visualização de testes) */}
          {abaAtiva !== 'OBSERVACOES' && (
            <div className="flex items-center gap-1 text-xs">
              <button
                type="button"
                onClick={() => setFiltroStatus('todos')}
                className={`px-2.5 py-1 rounded text-[11px] transition-colors cursor-pointer ${
                  filtroStatus === 'todos'
                    ? 'bg-purple-100 text-[var(--color-primary)] font-bold'
                    : 'text-slate-500 hover:bg-slate-100'
                }`}
              >
                Todos
              </button>
              <button
                type="button"
                onClick={() => setFiltroStatus('divergencias')}
                className={`px-2.5 py-1 rounded text-[11px] transition-colors cursor-pointer ${
                  filtroStatus === 'divergencias'
                    ? 'bg-amber-100 text-amber-800 font-bold'
                    : 'text-slate-500 hover:bg-slate-100'
                }`}
              >
                Divergências ({resumo.divergencias})
              </button>
              <button
                type="button"
                onClick={() => setFiltroStatus('ok')}
                className={`px-2.5 py-1 rounded text-[11px] transition-colors cursor-pointer ${
                  filtroStatus === 'ok'
                    ? 'bg-emerald-100 text-emerald-800 font-bold'
                    : 'text-slate-500 hover:bg-slate-100'
                }`}
              >
                OK ({resumo.ok})
              </button>
              <button
                type="button"
                onClick={() => setFiltroStatus('pendentes')}
                className={`px-2.5 py-1 rounded text-[11px] transition-colors cursor-pointer ${
                  filtroStatus === 'pendentes'
                    ? 'bg-slate-200 text-slate-900 font-bold'
                    : 'text-slate-500 hover:bg-slate-100'
                }`}
              >
                Pendentes ({resumo.pendentes})
              </button>
            </div>
          )}
        </div>

        {/* Conteúdo com Scroll */}
        <div className="flex-1 overflow-y-auto p-5">
          {isLoading ? (
            <div className="py-12">
              <LoadingTela mensagem="Carregando checklist e relatório de testes…" />
            </div>
          ) : abaAtiva === 'OBSERVACOES' ? (
            /* Visualização Exclusiva de Observações */
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2 border-b pb-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <span>💬</span>
                  <span>Observações Registradas pelo Parceiro ({observacoes.length})</span>
                </h3>
              </div>

              {observacoes.length === 0 ? (
                <div className="py-14 px-4 text-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 flex flex-col items-center justify-center gap-2">
                  <span className="text-3xl opacity-70">💬</span>
                  <p className="text-xs font-medium text-slate-600">
                    O parceiro não registrou nenhuma observação até o momento.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {observacoes.map((obs) => (
                    <div
                      key={obs.id}
                      className="p-3.5 rounded-xl border bg-slate-50/60 shadow-2xs space-y-1.5 text-xs"
                      style={{ borderColor: 'var(--color-border)' }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-slate-900">{obs.titulo}</span>
                        {(obs.autorEmail || obs.autorNome) && (
                          <span className="text-[10.5px] text-slate-500 font-medium">
                            Registrado por <strong>{obs.autorEmail || obs.autorNome}</strong>
                            {obs.data || obs.criadoEm
                              ? ` em ${new Date(obs.data || obs.criadoEm!).toLocaleDateString('pt-BR')} às ${new Date(obs.data || obs.criadoEm!).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
                              : ''}
                          </span>
                        )}
                      </div>
                      {obs.texto && (
                        <p className="text-slate-700 text-xs leading-relaxed whitespace-pre-wrap pl-3 border-l-2 border-slate-300">
                          {obs.texto}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Tabela Compacta e Simples de Testes */
            <div className="rounded-xl border overflow-hidden bg-white shadow-2xs" style={{ borderColor: 'var(--color-border)' }}>
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-50 border-b text-[11px] font-semibold text-slate-500 uppercase tracking-wider" style={{ borderColor: 'var(--color-border)' }}>
                  <tr>
                    <th className="py-2.5 px-3.5">Item de Teste</th>
                    <th className="py-2.5 px-3.5 w-36 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {itensExibidos.length === 0 ? (
                    <tr>
                      <td colSpan={2} className="py-10 text-center text-slate-400 italic">
                        Nenhum item encontrado com o filtro selecionado.
                      </td>
                    </tr>
                  ) : (
                    itensExibidos.map((res: any) => (
                      <tr key={res.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-2.5 px-3.5 align-top">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-slate-800">
                              {res.item?.nome ?? 'Item de teste'}
                            </span>
                            {abaAtiva === 'TODOS' && res.item?.grupo && (
                              <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider bg-slate-100 px-1.5 py-0.5 rounded">
                                {formatarNomeGrupo(res.item.grupo)}
                              </span>
                            )}
                          </div>

                          {/* Justificativa anexada */}
                          {(res.justificativa || res.justificativaTexto) && (
                            <div className="mt-1.5 p-2 rounded-lg bg-amber-50/70 border border-amber-200 text-[11px] text-amber-900 space-y-0.5">
                              <span className="font-bold block">
                                Justificativa: {res.justificativa?.titulo ?? 'Nota do técnico'}
                              </span>
                              <p className="text-amber-800/90 whitespace-pre-wrap">
                                {res.justificativa?.texto ?? res.justificativaTexto}
                              </p>
                              <div className="text-[10px] text-amber-700/80 pt-1 border-t border-amber-200/60 mt-1 flex items-center justify-between">
                                <span>
                                  Registrado por: <strong>{res.autorEmail || (homologacao?.responsavel as any)?.email || 'contato@mobiltec.com.br'}</strong>
                                </span>
                                {res.atualizadoEm && (
                                  <span>
                                    {new Date(res.atualizadoEm).toLocaleDateString('pt-BR')} às{' '}
                                    {new Date(res.atualizadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Observação técnica adicional do item */}
                          {res.observacao && (
                            <div className="mt-1 pl-2 border-l-2 border-slate-200 text-[11px] text-slate-500 italic">
                              Obs: {res.observacao}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-3.5 align-top text-right">
                          <BadgeStatusItem status={res.status} />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Rodapé com Ações */}
        <div className="p-4 border-t bg-slate-50 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            {d.status === 'AGUARDANDO_ANALISE' || d.status === 'EM_REVISAO' ? (
              <Link
                to="/ambiente/validar-certificados"
                className="px-3.5 py-2 rounded-lg text-xs font-semibold text-white shadow-xs transition-opacity hover:opacity-90 inline-flex items-center gap-1.5"
                style={{ background: 'var(--gradient-brand-purple)' }}
              >
                <span>Validar Certificado na Esteira Mobiltec</span>
                <span>→</span>
              </Link>
            ) : null}

            {d.homologado || d.status === 'APROVADO' || d.status === 'PUBLICADO' ? (
              <Link
                to={`/homologacoes/${d.homologacaoId}/certificado`}
                className="px-3 py-2 rounded-lg border text-xs font-semibold text-[var(--color-primary)] hover:bg-purple-50 transition-colors inline-flex items-center gap-1.5"
              >
                <Icone nome="certificado" className="h-4 w-4" />
                <span>Visualizar Certificado Oficial</span>
              </Link>
            ) : null}
          </div>

          <button
            type="button"
            onClick={aoFechar}
            className="px-4 py-2 rounded-lg border text-xs font-medium text-slate-700 hover:bg-slate-200/70 transition-colors cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}

function BadgeStatusModal({ status }: { status: StatusHomologacao }) {
  const configs: Record<StatusHomologacao, { rotulo: string; bg: string; fg: string }> = {
    RASCUNHO: { rotulo: 'Em homologação', bg: '#f1f5f9', fg: '#475569' },
    AGUARDANDO_ANALISE: { rotulo: 'Em validação', bg: '#fef3c7', fg: '#b45309' },
    EM_REVISAO: { rotulo: 'Em revisão', bg: '#dbeafe', fg: '#1d4ed8' },
    APROVADO: { rotulo: 'Homologado', bg: 'rgba(126,32,101,0.08)', fg: 'var(--color-primary)' },
    PUBLICADO: { rotulo: 'Homologado', bg: 'rgba(126,32,101,0.08)', fg: 'var(--color-primary)' },
    REPROVADO: { rotulo: 'Reprovado', bg: '#fee2e2', fg: '#b91c1c' },
  }

  const conf = configs[status] ?? configs.RASCUNHO

  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold select-none"
      style={{ background: conf.bg, color: conf.fg }}
    >
      {conf.rotulo}
    </span>
  )
}

function BadgeStatusItem({ status }: { status: StatusResultado }) {
  const configs: Record<StatusResultado, { rotulo: string; bg: string; fg: string }> = {
    OK: { rotulo: 'OK', bg: '#dcfce7', fg: '#15803d' },
    FALHA: { rotulo: 'Falha', bg: '#fee2e2', fg: '#b91c1c' },
    COM_RESSALVA: { rotulo: 'Com Ressalva', bg: '#fef3c7', fg: '#b45309' },
    NAO_SUPORTADO: { rotulo: 'Não Suportado', bg: '#fee2e2', fg: '#b91c1c' },
    NAO_APLICAVEL: { rotulo: 'N/A', bg: '#f1f5f9', fg: '#64748b' },
    NAO_TESTADO: { rotulo: 'Não Testado', bg: '#f8fafc', fg: '#94a3b8' },
  }

  const conf = configs[status] ?? configs.NAO_TESTADO

  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-[10.5px] font-semibold shrink-0 select-none border border-black/5"
      style={{ background: conf.bg, color: conf.fg }}
    >
      {conf.rotulo}
    </span>
  )
}
