import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { usePainelParceiro } from '@/hooks/useParceiros'
import { useConfirmarNotificacao } from '@/hooks/useNotificacoes'
import { useAuth } from '@/contextos/AuthContext'
import { Icone } from '@/componentes/Icone'
import { LoadingTela } from '@/componentes/LoadingTela'
import { BadgeHomologado } from '@/componentes/comum/BadgeHomologado'
import { FotoDispositivo } from '@/componentes/vitrine/FotoDispositivo'
import {
  ModalInformacoesHomologacao,
  parseObservacoes,
} from '@/componentes/parceiro/ModalInformacoesHomologacao'
import { ErroApi } from '@/lib/api'
import type { DispositivoPainelParceiro, StatusHomologacao } from '@/lib/tipos'

type FiltroStatus = 'todos' | 'em-homologacao' | 'em-validacao' | 'em-revisao' | 'homologados'

export function PainelParceiro() {
  const { id } = useParams<{ id?: string }>()
  const { ehAdmin } = useAuth()
  const { data, isLoading, isError, error } = usePainelParceiro(id)

  const [filtro, setFiltro] = useState<FiltroStatus>('todos')
  const [busca, setBusca] = useState('')
  const [modalDispositivo, setModalDispositivo] = useState<DispositivoPainelParceiro | null>(null)

  const parceiro = data?.parceiro
  const metricas = data?.metricas
  const dispositivos = data?.dispositivos ?? []

  // Detecta se existem revisões pendentes de confirmação/ciência pelo parceiro
  const pendentesRevisao = useMemo(() => {
    return dispositivos.filter(
      (d) => d.status === 'EM_REVISAO' && (!d.notificacaoRevisao || !d.notificacaoRevisao.confirmada),
    )
  }, [dispositivos])

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return dispositivos.filter((d) => {
      // Filtro por status da homologação
      if (filtro === 'em-homologacao' && d.status !== 'RASCUNHO') return false
      if (filtro === 'em-validacao' && d.status !== 'AGUARDANDO_ANALISE') return false
      if (filtro === 'em-revisao' && d.status !== 'EM_REVISAO') return false
      if (filtro === 'homologados' && d.status !== 'APROVADO' && d.status !== 'PUBLICADO') return false

      if (!termo) return true
      return [d.nomeComercial, d.fabricante, d.modelo, d.versaoAgente, d.versaoSo, d.categoriaNome]
        .join(' ')
        .toLowerCase()
        .includes(termo)
    })
  }, [dispositivos, filtro, busca])

  if (isLoading) {
    return <LoadingTela mensagem="Carregando painel do parceiro…" />
  }

  if (isError || !data || !parceiro || !metricas) {
    return (
      <div className="p-8 text-sm" style={{ color: 'var(--color-destructive)' }}>
        {error instanceof ErroApi ? error.message : 'Não foi possível carregar o painel deste parceiro.'}
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-[78rem] px-8 pt-6 pb-12 space-y-6">

        {/* Cabeçalho do Parceiro (Clean, Elegante e Minimalista) */}
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--color-border)] pb-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold tracking-tight text-[var(--color-foreground)]">
                Painel de Homologação {parceiro.empresa}
              </h1>
              <span className="inline-flex items-center gap-1.5 text-xs text-slate-500 font-medium ml-1">
                <span className={`h-2 w-2 rounded-full shrink-0 ${parceiro.ativo ? 'bg-emerald-500' : 'bg-red-500'}`} />
                <span>{parceiro.ativo ? 'Ativo' : 'Inativo'}</span>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to="/"
              className="px-3 py-1.5 rounded-lg border text-xs font-medium text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:bg-black/[0.03] transition-colors"
            >
              Ver Painel Geral Mobiltec
            </Link>
          </div>
        </header>

        {/* Alerta de Revisão Pendente (se houver modelos que necessitam de ajustes) */}
        {pendentesRevisao.length > 0 && (
          <div
            className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg border text-xs shadow-2xs"
            style={{
              background: 'rgba(239, 68, 68, 0.04)',
              borderColor: 'rgba(239, 68, 68, 0.25)',
              color: '#991b1b',
            }}
          >
            <div className="flex items-center gap-2">
              <span className="font-bold">⚠️ Pendência de Revisão Técnica</span>
              <span>
                · A equipe Mobiltec solicitou ajustes técnicos em {pendentesRevisao.length} modelo(s). Veja os apontamentos e confirme o recebimento.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setFiltro('em-revisao')}
              className="font-semibold underline underline-offset-2 hover:opacity-80 cursor-pointer"
            >
              Ver pendências ({pendentesRevisao.length})
            </button>
          </div>
        )}

        {/* Barra de Filtros e Busca (Estilo Clean Abas com Linha Roxa) */}
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--color-border)] pb-2">
            <div className="flex items-center gap-6 overflow-x-auto scrollbar-none">
              <BotaoFiltroClean
                ativo={filtro === 'todos'}
                aoClicar={() => setFiltro('todos')}
                rotulo="Todos os dispositivos"
                contagem={dispositivos.length}
              />
              <BotaoFiltroClean
                ativo={filtro === 'em-homologacao'}
                aoClicar={() => setFiltro('em-homologacao')}
                rotulo="Em homologação"
                contagem={metricas.emHomologacao}
              />
              <BotaoFiltroClean
                ativo={filtro === 'em-validacao'}
                aoClicar={() => setFiltro('em-validacao')}
                rotulo="Em validação"
                contagem={metricas.emValidacao}
              />
              <BotaoFiltroClean
                ativo={filtro === 'em-revisao'}
                aoClicar={() => setFiltro('em-revisao')}
                rotulo="Em revisão"
                contagem={metricas.emRevisao}
              />
              <BotaoFiltroClean
                ativo={filtro === 'homologados'}
                aoClicar={() => setFiltro('homologados')}
                rotulo="Homologados"
                contagem={metricas.homologados}
              />
            </div>

            <label className="relative block w-full max-w-[22rem]">
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

          {/* Listagem de Dispositivos */}
          {filtrados.length === 0 ? (
            <div className="rounded-2xl border p-12 text-center" style={{ background: 'var(--color-card)' }}>
              <p className="text-sm font-medium text-[var(--color-muted-foreground)]">
                Nenhum dispositivo encontrado com os filtros selecionados.
              </p>
              {busca && (
                <button
                  type="button"
                  onClick={() => setBusca('')}
                  className="mt-3 text-xs font-semibold underline underline-offset-2 text-[var(--color-primary)] cursor-pointer"
                >
                  Limpar termo de busca
                </button>
              )}
            </div>
          ) : (
            <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(330px,1fr))]">
              {filtrados.map((disp) => (
                <CardDispositivoParceiro
                  key={disp.dispositivoId}
                  dispositivo={disp}
                  ehAdmin={ehAdmin}
                  aoExibirInformacoes={(d) => setModalDispositivo(d)}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Modal Web com Relatório Completo de Testes e Informações para o Administrador */}
      {modalDispositivo && modalDispositivo.homologacaoId && (
        <ModalInformacoesHomologacao
          homologacaoId={modalDispositivo.homologacaoId}
          dispositivo={modalDispositivo}
          aoFechar={() => setModalDispositivo(null)}
        />
      )}
    </div>
  )
}

function BotaoFiltroClean({
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
      className={`relative pb-2.5 pt-1 px-1 text-[13px] transition-colors whitespace-nowrap select-none cursor-pointer flex items-center gap-1.5 shrink-0 outline-none ${
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

function CardDispositivoParceiro({
  dispositivo: d,
  ehAdmin,
  aoExibirInformacoes,
}: {
  dispositivo: DispositivoPainelParceiro
  ehAdmin: boolean
  aoExibirInformacoes: (disp: DispositivoPainelParceiro) => void
}) {
  const [expandirObs, setExpandirObs] = useState(false)
  const confirmarNotificacao = useConfirmarNotificacao()
  const pctAvaliado = d.resumo.total > 0 ? Math.round((d.resumo.avaliados / d.resumo.total) * 100) : 0

  // Processa as observações com segurança para NUNCA exibir JSON cru
  const observacoesProcessadas = useMemo(() => {
    return parseObservacoes(d.observacoes)
  }, [d.observacoes])

  const textoRevisao = useMemo(() => {
    if (d.notificacaoRevisao?.mensagem) return d.notificacaoRevisao.mensagem
    if (observacoesProcessadas.length > 0) {
      return `${observacoesProcessadas[0].titulo}: ${observacoesProcessadas[0].texto}`
    }
    return d.observacoes || 'Ajustes técnicos pendentes solicitados pela Mobiltec.'
  }, [d.notificacaoRevisao, observacoesProcessadas, d.observacoes])

  return (
    <article
      className="flex flex-col rounded-xl border shadow-xs overflow-hidden transition-all hover:shadow-md"
      style={{ background: 'var(--color-card)' }}
    >
      {/* Topo: Fabricante, Modelo e Badge de Status */}
      <div className="p-4 pb-3 flex items-start justify-between gap-3 border-b">
        <div className="min-w-0 flex-1">
          <span
            className="text-[10px] font-semibold uppercase tracking-wider block truncate"
            style={{ color: 'var(--color-muted-foreground)' }}
          >
            {d.fabricante} · {d.categoriaNome}
          </span>
          <h3 className="text-sm font-bold truncate leading-tight text-[var(--color-foreground)]" title={d.nomeComercial}>
            {d.nomeComercial}
          </h3>
        </div>

        <div>
          {d.status === 'APROVADO' || d.status === 'PUBLICADO' ? (
            <BadgeHomologado homologado={true} />
          ) : (
            <BadgeStatusProcesso status={d.status} />
          )}
        </div>
      </div>

      {/* Meio: Foto e Dados de Configuração */}
      <div className="p-4 flex items-center gap-4">
        <div
          className="h-20 w-20 rounded-xl border overflow-hidden shrink-0 flex items-center justify-center p-1"
          style={{ background: 'var(--color-sidebar)' }}
        >
          <FotoDispositivo url={d.fotoUrl} nome={d.nomeComercial} altura={76} semBorda />
        </div>

        <div className="flex-1 min-w-0 space-y-1 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-[var(--color-muted-foreground)]">Android:</span>
            <span className="font-semibold text-[var(--color-foreground)]">{d.versaoSo}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[var(--color-muted-foreground)]">Agente:</span>
            <span className="font-semibold text-[var(--color-foreground)]">{d.versaoAgente}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[var(--color-muted-foreground)]">Gerenciamento:</span>
            <span className="font-medium text-[var(--color-muted-foreground)] truncate max-w-[110px]">
              {d.gerenciamento === 'ANDROID_ENTERPRISE' ? 'Enterprise' : 'Legado'}
            </span>
          </div>

          {/* Barra de Progresso de Testes */}
          <div className="pt-1.5">
            <div className="flex items-center justify-between text-[11px] mb-1">
              <span className="text-[var(--color-muted-foreground)]">Testes executados:</span>
              <span className="font-semibold text-[var(--color-foreground)]">{pctAvaliado}%</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${pctAvaliado}%`,
                  background: d.homologado ? 'var(--color-primary)' : '#6366f1',
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Box de Notificação e Confirmação de Revisão Técnica Mobiltec */}
      {d.status === 'EM_REVISAO' && (
        <div
          className="mx-4 mb-3 rounded-lg border p-3 text-xs space-y-2"
          style={{
            background: 'rgba(219, 234, 254, 0.35)',
            borderColor: 'rgba(59, 130, 246, 0.3)',
          }}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-1.5 font-semibold text-blue-900">
              <span className="text-sm">⚠️</span>
              <span>Revisão técnica solicitada pela Mobiltec</span>
            </div>
          </div>

          <p className="text-blue-950/85 leading-relaxed bg-white/70 p-2 rounded border border-blue-200/50 text-[11px]">
            {textoRevisao}
          </p>

          <div className="pt-1 flex items-center justify-between gap-2 flex-wrap text-[11px]">
            {d.notificacaoRevisao?.confirmada ? (
              <span className="inline-flex items-center gap-1 text-emerald-700 font-medium bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                <span>✓</span>
                <span>
                  Recebimento confirmado por {d.notificacaoRevisao.confirmadaPor ?? 'Parceiro'} em{' '}
                  {d.notificacaoRevisao.confirmadaEm
                    ? new Date(d.notificacaoRevisao.confirmadaEm).toLocaleDateString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : ''}
                </span>
              </span>
            ) : d.notificacaoRevisao?.id ? (
              <button
                type="button"
                onClick={() => confirmarNotificacao.mutate(d.notificacaoRevisao!.id)}
                disabled={confirmarNotificacao.isPending}
                className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors shadow-2xs cursor-pointer flex items-center gap-1 text-[11px] disabled:opacity-50"
              >
                <span>{confirmarNotificacao.isPending ? 'Confirmando…' : '✓ Confirmar recebimento (Ciente)'}</span>
              </button>
            ) : null}

            {!ehAdmin && (
              <Link
                to={`/matriz/${d.categoriaSlug}`}
                className="text-blue-700 hover:underline font-medium ml-auto inline-flex items-center gap-1"
              >
                <span>Ajustar itens na bateria</span>
                <span>→</span>
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Observações do Processo (Formato Clean: 1 linha de resumo no card, lista detalhada ao expandir) */}
      {observacoesProcessadas.length > 0 && d.status !== 'EM_REVISAO' && (
        <div className="px-4 py-2 bg-slate-50/80 border-t text-xs">
          <button
            type="button"
            onClick={() => setExpandirObs((v) => !v)}
            className="w-full flex items-center justify-between font-medium text-slate-700 hover:text-slate-900 cursor-pointer"
          >
            <span className="flex items-center gap-1.5 truncate">
              <span>💬</span>
              <span className="font-semibold text-slate-800">Observações:</span>
              <span className="text-slate-600 truncate">
                {observacoesProcessadas.length === 1
                  ? observacoesProcessadas[0].titulo || '1 item registrado'
                  : `${observacoesProcessadas.length} registros`}
              </span>
            </span>
            <span className="text-[10px] opacity-60 shrink-0 ml-2">
              {expandirObs ? 'Recolher ▲' : 'Expandir ▼'}
            </span>
          </button>

          {expandirObs && (
            <div className="mt-2.5 space-y-2">
              {observacoesProcessadas.map((obs) => (
                <div
                  key={obs.id}
                  className="p-2.5 rounded-lg border bg-white shadow-2xs space-y-1 text-xs"
                  style={{ borderColor: 'var(--color-border)' }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <strong className="font-bold text-slate-900">{obs.titulo}</strong>
                    {obs.autorNome && (
                      <span className="text-[10px] text-slate-500 font-medium">
                        {obs.autorNome}
                        {obs.data || obs.criadoEm
                          ? ` · ${new Date(obs.data || obs.criadoEm!).toLocaleDateString('pt-BR')}`
                          : ''}
                      </span>
                    )}
                  </div>
                  {obs.texto && (
                    <p className="text-slate-600 text-[11px] leading-relaxed whitespace-pre-wrap">
                      {obs.texto}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Ações Rápidas no Rodapé: Diferencia Administrador (Exibir informações) de Parceiro (Bateria de testes) */}
      <div className="p-3 border-t bg-[var(--color-card)] flex items-center justify-end gap-2 mt-auto">
        {ehAdmin ? (
          <button
            type="button"
            onClick={() => aoExibirInformacoes(d)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-opacity hover:opacity-90 shadow-xs inline-flex items-center gap-1.5 cursor-pointer"
            style={{ background: 'var(--gradient-brand-purple)' }}
          >
            <Icone nome="busca" className="h-3.5 w-3.5" />
            <span>Exibir informações</span>
          </button>
        ) : (
          <Link
            to={`/matriz/${d.categoriaSlug}`}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-opacity hover:opacity-90 shadow-xs inline-flex items-center gap-1.5"
            style={{ background: 'var(--gradient-brand-purple)' }}
          >
            <span>Bateria de testes</span>
            <span>→</span>
          </Link>
        )}

        {d.homologacaoId && (d.status === 'APROVADO' || d.status === 'PUBLICADO') && (
          <Link
            to={`/homologacoes/${d.homologacaoId}/certificado`}
            className="px-2.5 py-1.5 rounded-lg border text-xs font-semibold text-[var(--color-primary)] hover:bg-purple-50/50 transition-colors inline-flex items-center gap-1"
          >
            <Icone nome="certificado" className="h-3.5 w-3.5" />
            <span>Certificado</span>
          </Link>
        )}
      </div>
    </article>
  )
}

function BadgeStatusProcesso({ status }: { status: StatusHomologacao }) {
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
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-semibold whitespace-nowrap select-none"
      style={{ background: conf.bg, color: conf.fg }}
    >
      {conf.rotulo}
    </span>
  )
}
