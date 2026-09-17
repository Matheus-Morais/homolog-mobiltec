import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { usePainelParceiro } from '@/hooks/useParceiros'
import { useConfirmarNotificacao } from '@/hooks/useNotificacoes'
import { useAuth } from '@/contextos/AuthContext'
import { Icone } from '@/componentes/Icone'
import { LoadingTela } from '@/componentes/LoadingTela'
import { BadgeHomologado } from '@/componentes/comum/BadgeHomologado'
import { FotoDispositivo } from '@/componentes/vitrine/FotoDispositivo'
import { AvisoRevisao } from '@/componentes/homologacao/AvisoRevisao'
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
              background: 'var(--color-brand-purple-soft, #fbf4fa)',
              borderColor: 'var(--color-brand-purple-border, #f0d5eb)',
              color: 'var(--color-brand-purple-fg, #6e226b)',
            }}
          >
            <div className="flex items-center gap-2">
              <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="font-bold">Pendência de Revisão Técnica</span>
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

  const revisao = useMemo(() => {
    if (d.revisaoInfo) return d.revisaoInfo
    const msg =
      d.notificacaoRevisao?.mensagem ||
      (observacoesProcessadas.length > 0
        ? `${observacoesProcessadas[0].titulo}: ${observacoesProcessadas[0].texto}`
        : d.observacoes || 'Ajustes técnicos pendentes solicitados pela Mobiltec.')
    return {
      tecnicoNome: 'Técnico Mobiltec',
      mensagem: msg,
      criadoEm: d.notificacaoRevisao?.criadoEm ?? null,
      confirmada: Boolean(d.notificacaoRevisao?.confirmada),
      confirmadaPor: d.notificacaoRevisao?.confirmadaPor ?? null,
      confirmadaEm: d.notificacaoRevisao?.confirmadaEm ?? null,
      notificacaoId: d.notificacaoRevisao?.id ?? null,
    }
  }, [d.revisaoInfo, d.notificacaoRevisao, observacoesProcessadas, d.observacoes])

  const [expandirTextoRevisao, setExpandirTextoRevisao] = useState(false)
  const precisaLerMais = revisao.mensagem.length > 130

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

      {/* Meio: Foto e Dados Técnicos OU Card de Aviso da Revisão Técnica */}
      {d.status === 'EM_REVISAO' ? (
        <div className="p-4 flex-1 flex flex-col justify-between text-xs space-y-3">
          <div
            className="rounded-xl border p-3.5 flex flex-col justify-between gap-2.5 transition-all shadow-2xs"
            style={{
              background: 'var(--color-sidebar)',
              borderColor: 'var(--color-border)',
            }}
          >
            {/* Topo do Aviso: Quem enviou para revisão + Data */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 min-w-0">
                <p className="text-[12px] truncate leading-tight">
                  <strong className="text-[var(--color-foreground)] font-bold">
                    {revisao.tecnicoNome}
                  </strong>
                  <span className="text-[var(--color-muted-foreground)] font-normal ml-1">
                    enviou para revisão
                  </span>
                </p>
              </div>

              {revisao.criadoEm && (
                <span className="text-[10px] text-[var(--color-muted-foreground)] font-medium shrink-0">
                  {new Date(revisao.criadoEm).toLocaleDateString('pt-BR', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              )}
            </div>

            {/* Mensagem da Revisão */}
            <div
              className="p-3 rounded-lg border text-[12px] leading-relaxed text-[var(--color-foreground)] shadow-2xs"
              style={{
                background: 'var(--color-card)',
                borderColor: 'var(--color-border)',
              }}
            >
              <p className={`whitespace-pre-wrap ${!expandirTextoRevisao && precisaLerMais ? 'line-clamp-1' : ''}`}>
                {revisao.mensagem}
              </p>
              {precisaLerMais && (
                <button
                  type="button"
                  onClick={() => setExpandirTextoRevisao((v) => !v)}
                  className="mt-1.5 text-[11px] font-semibold text-[var(--color-primary)] hover:underline cursor-pointer block"
                >
                  {expandirTextoRevisao ? 'Ler menos ▲' : 'Ler mais ▼'}
                </button>
              )}
            </div>

            {/* Status / Ação de Confirmação (Ciente) */}
            <div className="pt-2 border-t border-[var(--color-border)]/50 flex items-center justify-between gap-2 text-[11px]">
              {revisao.confirmada ? (
                <div className="flex items-center gap-1.5 text-[var(--color-muted-foreground)] text-[11px] min-w-0">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block shrink-0 shadow-xs" />
                  <span className="truncate">
                    Confirmado por <strong className="text-[var(--color-foreground)]">{revisao.confirmadaPor ?? 'Parceiro'}</strong>
                    {revisao.confirmadaEm
                      ? ` em ${new Date(revisao.confirmadaEm).toLocaleDateString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}`
                      : ''}
                  </span>
                </div>
              ) : revisao.notificacaoId ? (
                <button
                  type="button"
                  onClick={() => confirmarNotificacao.mutate(revisao.notificacaoId!)}
                  disabled={confirmarNotificacao.isPending}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white shadow-xs transition-opacity hover:opacity-90 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  style={{ background: 'var(--gradient-brand-purple)' }}
                >
                  <span>✓</span>
                  <span>{confirmarNotificacao.isPending ? 'Confirmando…' : 'Confirmar recebimento (Ciente)'}</span>
                </button>
              ) : <div />}

              {/* Botão de Ajustar Testes (somente Parceiro) */}
              {!ehAdmin && (
                <Link
                  to={`/matriz/${d.categoriaSlug}`}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-opacity hover:opacity-90 shadow-xs inline-flex items-center gap-1.5 shrink-0"
                  style={{ background: 'var(--gradient-brand-purple)' }}
                >
                  <span>Ajustar</span>
                </Link>
              )}
            </div>
          </div>
        </div>
      ) : (
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
              <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
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
      )}

      {/* O apontamento que trouxe o dispositivo de volta para a bancada (D435) */}
      {d.revisaoPendente && (
        <div className="px-4 pb-3">
          <AvisoRevisao
            motivo={d.revisaoPendente.motivo}
            solicitadoEm={d.revisaoPendente.solicitadoEm}
            solicitadoPor={d.revisaoPendente.solicitadoPor}
          />
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

      {/* Ações Rápidas no Rodapé */}
      {(ehAdmin || d.status !== 'EM_REVISAO') && (
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
          ) : d.status !== 'EM_REVISAO' ? (
            <Link
              to={`/matriz/${d.categoriaSlug}`}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-opacity hover:opacity-90 shadow-xs inline-flex items-center gap-1.5"
              style={{ background: 'var(--gradient-brand-purple)' }}
            >
              <span>Bateria de testes</span>
              <span>→</span>
            </Link>
          ) : null}

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
      )}
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
