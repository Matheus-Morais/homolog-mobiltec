import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { usePainelParceiro } from '@/hooks/useParceiros'
import { useAuth } from '@/contextos/AuthContext'
import { Icone } from '@/componentes/Icone'
import { LoadingTela } from '@/componentes/LoadingTela'
import { BadgeHomologado } from '@/componentes/comum/BadgeHomologado'
import { FotoDispositivo } from '@/componentes/vitrine/FotoDispositivo'
import { AvisoRevisao } from '@/componentes/homologacao/AvisoRevisao'
import { ErroApi } from '@/lib/api'
import type { DispositivoPainelParceiro, StatusHomologacao } from '@/lib/tipos'

type FiltroStatus = 'todos' | 'em-homologacao' | 'em-validacao' | 'em-revisao' | 'homologados'

export function PainelParceiro() {
  const { id } = useParams<{ id?: string }>()
  const { ehAdmin, usuario } = useAuth()
  const { data, isLoading, isError, error } = usePainelParceiro(id)

  const [filtro, setFiltro] = useState<FiltroStatus>('todos')
  const [busca, setBusca] = useState('')

  const parceiro = data?.parceiro
  const metricas = data?.metricas
  const dispositivos = data?.dispositivos ?? []

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return dispositivos.filter((d) => {
      // Filtro por status da homologação
      if (filtro === 'em-homologacao' && d.status !== 'RASCUNHO') return false
      if (filtro === 'em-validacao' && d.status !== 'AGUARDANDO_ANALISE') return false
      if (filtro === 'em-revisao' && d.status !== 'EM_REVISAO') return false
      if (filtro === 'homologados' && !d.homologado && d.status !== 'APROVADO' && d.status !== 'PUBLICADO') return false

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

  const ehVisaoAdmin = ehAdmin && parceiro.id !== usuario?.id
  const pctTestes = metricas.testesTotal > 0 ? Math.round((metricas.testesRealizados / metricas.testesTotal) * 100) : 0

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-[78rem] px-8 pt-6 pb-12 space-y-6">

        {/* Banner de visão administrativa para o time Mobiltec */}
        {ehVisaoAdmin && (
          <div
            className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg border text-xs shadow-xs"
            style={{
              background: 'rgba(126,32,101,0.05)',
              borderColor: 'rgba(126,32,101,0.2)',
              color: 'var(--color-primary)',
            }}
          >
            <div className="flex items-center gap-2">
              <span className="font-semibold uppercase tracking-wider">Modo Administrador</span>
              <span>· Acompanhando o painel individual de homologação da empresa</span>
              <strong className="font-bold">{parceiro.empresa}</strong>
            </div>
            <Link
              to="/ambiente/parceiros"
              className="text-xs font-semibold underline underline-offset-2 hover:opacity-80 transition-opacity"
            >
              Gerenciar permissões deste parceiro
            </Link>
          </div>
        )}

        {/* Cabeçalho do Parceiro */}
        <header className="flex flex-wrap items-center justify-between gap-4 border-b pb-5">
          <div className="flex items-center gap-4">
            <div
              className="h-14 w-14 rounded-2xl flex items-center justify-center font-bold text-xl text-white shadow-sm shrink-0"
              style={{ background: 'var(--gradient-brand-purple)' }}
            >
              {parceiro.empresa.substring(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-[var(--color-foreground)]">
                  {parceiro.empresa}
                </h1>
                <span
                  className="px-2 py-0.5 rounded-full text-[10.5px] font-semibold tracking-wide uppercase"
                  style={{
                    background: parceiro.ativo ? 'rgba(22,163,74,0.1)' : 'rgba(220,38,38,0.1)',
                    color: parceiro.ativo ? '#16a34a' : '#dc2626',
                  }}
                >
                  {parceiro.ativo ? 'Parceiro Ativo' : 'Inativo'}
                </span>
                <span
                  className="px-2 py-0.5 rounded-full text-[10.5px] font-semibold"
                  style={{ background: 'var(--color-muted)', color: 'var(--color-muted-foreground)' }}
                >
                  Painel Exclusivo
                </span>
              </div>
              <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted-foreground)' }}>
                Responsável: <span className="font-medium text-[var(--color-foreground)]">{parceiro.nome}</span> ({parceiro.email}) · Cadastrado em {new Date(parceiro.criadoEm).toLocaleDateString('pt-BR')}
              </p>
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

        {/* KPIs de Acompanhamento */}
        <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <CardMetrica
            rotulo="Dispositivos"
            valor={metricas.totalDispositivos}
            descricao="Modelos cadastrados"
            cor="var(--color-primary)"
          />
          <CardMetrica
            rotulo="Em Homologação"
            valor={metricas.emHomologacao}
            descricao="Bateria em teste ativo"
            cor="#64748b"
          />
          <CardMetrica
            rotulo="Em Validação"
            valor={metricas.emValidacao}
            descricao="Aguardando análise"
            cor="#d97706"
          />
          <CardMetrica
            rotulo="Em Revisão"
            valor={metricas.emRevisao}
            descricao="Ajustes técnicos pendentes"
            cor="#2563eb"
          />
          <CardMetrica
            rotulo="Homologados"
            valor={metricas.homologados}
            descricao="Aprovados / certificados"
            cor="var(--color-primary)"
            destaque
          />
          <div className="rounded-xl border p-3.5 flex flex-col justify-between" style={{ background: 'var(--color-card)' }}>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-muted-foreground)]">
                Progresso Testes
              </p>
              <p className="text-xl font-bold tracking-tight mt-0.5 text-[var(--color-foreground)]">
                {pctTestes}%
              </p>
            </div>
            <div className="mt-2">
              <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${pctTestes}%`, background: 'var(--gradient-brand-purple)' }}
                />
              </div>
              <p className="text-[10px] mt-1 text-[var(--color-muted-foreground)]">
                {metricas.testesRealizados} de {metricas.testesTotal} itens avaliados
              </p>
            </div>
          </div>
        </section>

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

            <label className="relative block w-full max-w-[17rem]">
              <span
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
                style={{ color: 'var(--color-muted-foreground)' }}
              >
                <Icone nome="busca" className="h-4 w-4" />
              </span>
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar modelo, versão…"
                className="w-full rounded-lg border py-1.5 pl-9 pr-3 text-xs"
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
                <CardDispositivoParceiro key={disp.dispositivoId} dispositivo={disp} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function CardMetrica({
  rotulo,
  valor,
  descricao,
  cor,
  destaque = false,
}: {
  rotulo: string
  valor: number
  descricao: string
  cor?: string
  destaque?: boolean
}) {
  return (
    <div
      className={`rounded-xl border p-3.5 transition-all shadow-2xs ${destaque ? 'ring-1' : ''}`}
      style={{
        background: 'var(--color-card)',
        borderColor: destaque ? 'rgba(126,32,101,0.25)' : 'var(--color-border)',
      }}
    >
      <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-muted-foreground)]">
        {rotulo}
      </p>
      <p className="text-2xl font-bold tracking-tight mt-0.5" style={{ color: cor ?? 'var(--color-foreground)' }}>
        {valor}
      </p>
      <p className="text-[11px] mt-1 text-[var(--color-muted-foreground)] truncate">{descricao}</p>
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

function CardDispositivoParceiro({ dispositivo: d }: { dispositivo: DispositivoPainelParceiro }) {
  const [expandirObs, setExpandirObs] = useState(false)
  const pctAvaliado = d.resumo.total > 0 ? Math.round((d.resumo.avaliados / d.resumo.total) * 100) : 0

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
          {d.homologado || d.status === 'APROVADO' || d.status === 'PUBLICADO' ? (
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

      {/* Observações do Processo (se existirem) */}
      {d.observacoes && (
        <div className="px-4 py-2 bg-slate-50/80 border-t text-xs">
          <button
            type="button"
            onClick={() => setExpandirObs((v) => !v)}
            className="w-full flex items-center justify-between font-medium text-slate-700 hover:text-slate-900 cursor-pointer"
          >
            <span className="flex items-center gap-1.5">
              <span>💬</span>
              <span>Observações do processo</span>
            </span>
            <span className="text-[10px] opacity-60">{expandirObs ? 'Recolher ▲' : 'Expandir ▼'}</span>
          </button>
          {expandirObs && (
            <p className="mt-2 text-slate-600 leading-relaxed whitespace-pre-wrap text-[11px] pl-5 border-l-2 border-slate-300">
              {d.observacoes}
            </p>
          )}
        </div>
      )}

      {/* Ações Rápidas no Rodapé */}
      <div className="p-3 border-t bg-[var(--color-card)] flex items-center justify-end gap-2 mt-auto">
        <Link
          to={`/matriz/${d.categoriaSlug}`}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-opacity hover:opacity-90 shadow-xs inline-flex items-center gap-1.5"
          style={{ background: 'var(--gradient-brand-purple)' }}
        >
          <span>Bateria de testes</span>
          <span>→</span>
        </Link>

        {d.homologacaoId && (d.homologado || d.status === 'APROVADO' || d.status === 'PUBLICADO') && (
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
