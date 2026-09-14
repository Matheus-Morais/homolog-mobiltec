import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useHomologacao } from '@/hooks/useHomologacao'
import { api, ErroApi } from '@/lib/api'
import { useAuth } from '@/contextos/AuthContext'
import { imprimirCertificadoHtml } from '@/lib/imprimir'
import { FotoDispositivo } from '@/componentes/vitrine/FotoDispositivo'
import { ModalUploadFoto } from '@/componentes/dispositivo/ModalUploadFoto'
import { DicaJustificativa } from '@/componentes/DicaJustificativa'
import { Icone } from '@/componentes/Icone'
import { LoadingTela } from '@/componentes/LoadingTela'
import {
  COLUNAS_GRUPO,
  GRUPO_ORDEM,
  META_STATUS,
  ROTULO_GERENCIAMENTO,
  ROTULO_GRUPO,
  somenteVersaoAndroid,
} from '@/lib/tipos'
import type { GrupoItem, StatusResultado } from '@/lib/tipos'

/** Uma linha do resultado, no formato que esta tela desenha */
/**
 * É `<table>`, e não grid, por um motivo concreto: cada linha em grid é um
 * contêiner independente, então dimensionar por conteúdo desalinharia as
 * colunas entre as linhas — e um grid único para cabeçalho e corpo exigiria
 * `display: contents`, que apaga a linha como elemento. Tabela resolve as
 * duas coisas de graça.
 *
 * A coluna do status é fixa e serve de âncora à direita; as outras duas
 * ficam em `auto`, sizing por conteúdo. Com a justificativa fora da tabela
 * (virou balão no `?`), sobra largura para os quatro grupos caberem dois a
 * dois.
 */
const LARGURA_STATUS = '7rem'
/**
 * Na largura toda, deixar as duas primeiras colunas em `auto` abriria um vão
 * entre o texto e a coluna seguinte — era a queixa original desta tela. Com o
 * item em fração fixa, a ação ocupa todo o resto e a linha fecha.
 */
const LARGURA_ITEM = '26%'

interface LinhaResultado {
  grupo: GrupoItem
  nome: string
  acao: string
  status: StatusResultado
  justificativa: string | null
  observacao: string | null
}

/**
 * Informações da homologação de um modelo.
 *
 * É o "exibir informações" do catálogo: a ficha da unidade testada, o
 * resultado item a item e o botão de exportar o certificado. Só leitura —
 * quem edita é a matriz.
 */
export function DetalheDispositivo() {
  const { id = '' } = useParams<{ id: string }>()
  const consulta = useHomologacao(id)
  const { ehMobiltec, ehParceiro } = useAuth()

  const [baixando, setBaixando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [modalFotoAberto, setModalFotoAberto] = useState(false)

  const ficha = useMemo(() => {
    const h = consulta.data
    if (!h) return null
    return {
      dispositivoId: h.dispositivo?.id ?? '',
      nomeComercial: h.dispositivo?.nomeComercial ?? '—',
      fabricante: h.dispositivo?.fabricante ?? '—',
      modelo: h.dispositivo?.modelo ?? '—',
      fotoUrl: h.dispositivo?.fotoUrl ?? null,
      versaoSo: h.versaoSo,
      versaoAgente: h.versaoAgente,
      versaoPos: h.versaoPos,
      tipoAgente: h.tipoAgente,
      gerenciamento: h.gerenciamento,
      // Sem `numeroSerie`, `imei1` e `imei2`: esta é a tela que o parceiro vai
      // ver, e identificador de aparelho não tem o que fazer nela — mesma
      // razão pela qual saíram do certificado. Continuam no banco e na matriz,
      // onde servem para saber qual unidade foi para a bancada.
      metodoInscricao: h.metodoInscricao,
      // Mesma precedência do certificado: o nome digitado na tela do
      // certificado vence; sem ele, cai para o Usuario vinculado. Se as duas
      // telas mostrassem regras diferentes, uma delas estaria mentindo.
      responsavelTecnico: h.assinaturaResponsavel?.trim() || h.responsavel?.nome || null,
      gerenteValidacao: h.assinaturaGerente?.trim() || h.gerente?.nome || null,
      dataInicio: h.dataInicio,
      dataFim: h.dataFim,
      status: h.status,
      homologado: h.homologado,
      categoriaSlug: 'pos',
    }
  }, [consulta.data])

  const linhas: LinhaResultado[] = useMemo(
    () =>
      (consulta.data?.resultados ?? []).map((r) => ({
        grupo: r.item.grupo,
        nome: r.item.nome,
        // A coluna do meio do certificado: o que foi feito para avaliar o item
        acao: r.item.descricaoAcao,
        status: r.status,
        justificativa: r.justificativaTexto ?? r.justificativa?.texto ?? null,
        observacao: r.observacao,
      })),
    [consulta.data],
  )

  const porGrupo = useMemo(
    () =>
      GRUPO_ORDEM.map((g) => ({ grupo: g, itens: linhas.filter((l) => l.grupo === g) })).filter(
        (g) => g.itens.length > 0,
      ),
    [linhas],
  )

  const podeEditarFoto =
    ehMobiltec || (ehParceiro && ficha?.status === 'RASCUNHO' && !ficha?.homologado)

  async function exportarCertificado() {
    setBaixando(true)
    setAviso(null)
    try {
      const blob = await api.getBlob(`/homologacoes/${id}/certificado/pdf`)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `certificado-${ficha?.modelo ?? id}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e: any) {
      // Fallback: se a geração no servidor estiver indisponível (serverless / sem Playwright),
      // buscamos o preview HTML e abrimos o diálogo nativo do navegador para Salvar como PDF
      try {
        setAviso('Abrindo diálogo de impressão (Salvar como PDF)...')
        const html = await api.getTexto(`/homologacoes/${id}/certificado/preview`)
        imprimirCertificadoHtml(html)
      } catch (errFallback) {
        setAviso(e instanceof ErroApi ? e.message : 'Não foi possível gerar o PDF.')
      }
    } finally {
      setBaixando(false)
    }
  }

  if (consulta.isLoading) {
    return <LoadingTela mensagem="Carregando detalhes do dispositivo…" />
  }

  if (!ficha) {
    return (
      <div className="p-8">
        <p className="text-sm" style={{ color: 'var(--color-destructive)' }}>
          {consulta.error instanceof ErroApi
            ? consulta.error.message
            : 'Homologação não encontrada.'}
        </p>
        <Link
          to="/"
          className="mt-3 inline-block text-sm underline underline-offset-2"
          style={{ color: 'var(--color-primary)' }}
        >
          Voltar para dispositivos
        </Link>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-8 py-7">
        <Link
          to="/"
          className="text-sm underline underline-offset-2"
          style={{ color: 'var(--color-muted-foreground)' }}
        >
          ← Painel de Homologação
        </Link>

        {aviso && (
          <div
            role="status"
            className="mt-3 rounded-lg px-4 py-3 text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-2 border transition-all"
            style={
              aviso.toLowerCase().includes('abrindo')
                ? {
                    background: 'var(--color-brand-purple-soft)',
                    color: 'var(--color-brand-purple-fg)',
                    borderColor: 'var(--color-brand-purple-border)',
                  }
                : {
                    background: 'var(--color-destructive-soft)',
                    color: 'var(--color-destructive-fg)',
                    borderColor: 'var(--color-destructive-soft)',
                  }
            }
          >
            <div className="flex items-center gap-2">
              {aviso.toLowerCase().includes('abrindo') && (
                <Icone nome="printer" className="h-4 w-4 shrink-0 animate-pulse text-[var(--color-primary)]" />
              )}
              <span>{aviso}</span>
            </div>
            <Link
              to={`/homologacoes/${id}/certificado`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-semibold underline underline-offset-2 shrink-0 hover:opacity-80 transition-opacity"
              style={{ color: 'var(--color-primary)' }}
            >
              Abrir Certificado no navegador →
            </Link>
          </div>
        )}

        {/* Ficha da unidade testada — a identificação do modelo e a ação
            moram no topo dela, e não num bloco solto acima: é a mesma coisa
            sendo descrita, não duas. */}
        {/* Foto grande à esquerda, tudo o mais numa coluna ao lado: com os
            três identificadores fora, os dados restantes cabem em duas
            fileiras, e a faixa larga que sobrava vira espaço para a imagem. */}
        <section
          className="mt-4 rounded-xl border px-5 pb-5 pt-3"
          style={{ background: 'var(--color-card)' }}
        >
          {/* Cabeçalho na largura inteira do card: a linha divisória passa a
              atravessar tudo, e o que fica abaixo dela — foto e dados — é um
              bloco só, contra o qual a foto pode se centralizar de verdade. */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-2.5">
            {/* h2: o h1 da página é a trilha da barra do card, no Layout */}
            <h2
              className="min-w-0 text-sm font-medium uppercase"
              style={{ color: 'var(--color-muted-foreground)', letterSpacing: '0.06em' }}
            >
              {ficha.fabricante} {ficha.modelo}
            </h2>

            <div className="flex items-center gap-2">
              <Link
                to={`/homologacoes/${id}/certificado`}
                target="_blank"
                rel="noopener noreferrer"
                title="Abrir visualização do certificado técnico"
                className="flex shrink-0 items-center gap-1.5 rounded-md border px-3.5 py-2 text-sm font-semibold transition-colors hover:bg-muted"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-foreground)' }}
              >
                <Icone nome="certificado" className="h-4 w-4 shrink-0" />
                Visualizar Certificado
              </Link>
              <button
                type="button"
                onClick={exportarCertificado}
                disabled={baixando}
                title="Baixar o certificado em PDF com os dados atuais"
                className="flex shrink-0 items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-45"
                style={{ background: 'var(--gradient-brand-purple)' }}
              >
                <Icone nome="baixar" className="h-4 w-4 shrink-0" />
                {baixando ? 'Gerando…' : 'Baixar PDF'}
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-start gap-6">
            <div className="flex flex-col items-center gap-2">
              <div
                className="group relative w-48 shrink-0 self-center overflow-hidden rounded-xl border transition-all"
                style={{ background: 'var(--color-sidebar)' }}
              >
                <FotoDispositivo
                  url={ficha.fotoUrl}
                  nome={ficha.nomeComercial}
                  altura={192}
                  semBorda
                />
                {podeEditarFoto && (
                  <button
                    type="button"
                    onClick={() => setModalFotoAberto(true)}
                    title={ficha.fotoUrl ? 'Alterar foto do dispositivo' : 'Adicionar foto do dispositivo'}
                    className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/60 opacity-0 backdrop-blur-[2px] transition-all duration-150 group-hover:opacity-100 focus:opacity-100 cursor-pointer"
                  >
                    <div className="grid h-10 w-10 place-items-center rounded-full bg-white/20 text-white shadow-sm">
                      <Icone nome="camera" className="h-5 w-5" />
                    </div>
                    <span className="text-xs font-semibold text-white tracking-wide">
                      {ficha.fotoUrl ? 'Alterar foto' : 'Enviar foto'}
                    </span>
                  </button>
                )}
              </div>

              {podeEditarFoto && (
                <button
                  type="button"
                  onClick={() => setModalFotoAberto(true)}
                  className="flex items-center gap-1.5 text-xs font-medium transition-colors hover:text-primary cursor-pointer"
                  style={{ color: 'var(--color-muted-foreground)' }}
                >
                  <Icone nome="camera" className="h-3.5 w-3.5" />
                  <span>{ficha.fotoUrl ? 'Alterar foto' : 'Enviar foto'}</span>
                </button>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <p className="label-caps mb-3">Unidade testada</p>
              {/* 240px de mínimo, não 190: medido, o par mais largo ("Método
                  de inscrição: Não informado") precisa de 213px, e com três
                  colunas nesta faixa sobravam 207 — o valor truncava. */}
              <dl className="grid gap-x-8 gap-y-2.5 text-sm [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
                <Campo rotulo="Android" valor={somenteVersaoAndroid(ficha.versaoSo)} />
                <Campo rotulo="Versão do agente" valor={ficha.versaoAgente} />
                <Campo rotulo="Tipo de agente" valor={ficha.tipoAgente} />
                <Campo rotulo="Versão PoS" valor={ficha.versaoPos} />
                <Campo rotulo="Gerenciamento" valor={ROTULO_GERENCIAMENTO[ficha.gerenciamento]} />
                <Campo rotulo="Método de inscrição" valor={ficha.metodoInscricao} />
                <Campo rotulo="Início" valor={formatarData(ficha.dataInicio)} />
                <Campo rotulo="Conclusão" valor={formatarData(ficha.dataFim)} />
                {/* As duas assinaturas do certificado, na mesma ordem em que
                    aparecem lá no rodapé */}
                <Campo rotulo="Responsável técnico" valor={ficha.responsavelTecnico} />
                <Campo rotulo="Gerente de validação" valor={ficha.gerenteValidacao} />
              </dl>
            </div>
          </div>
        </section>

        {/* Resultado item a item */}
        <section className="mt-6">
          <h2 className="label-caps mb-3">Resultado da homologação</h2>

          {/* Um grupo abaixo do outro, na largura toda — a mesma sequência do
              certificado. Lado a lado, os grupos têm 9, 11, 12 e 16 itens e as
              duas pilhas nunca fechavam na mesma altura. */}
          <div className="space-y-5">
            {porGrupo.map(({ grupo, itens }) => (
              <div
                key={grupo}
                className="overflow-hidden rounded-lg border"
                style={{ background: 'var(--color-card)' }}
              >
                <div
                  className="px-4 py-2 text-xs font-semibold uppercase"
                  style={{
                    background: 'var(--gradient-brand-purple)',
                    color: '#fff',
                    letterSpacing: '0.08em',
                  }}
                >
                  {ROTULO_GRUPO[grupo]}
                </div>

                {/* As mesmas três colunas do certificado. A justificativa saiu
                    da tabela e virou balão no `?` ao lado do status: ela é
                    exceção, e como coluna cobrava 38% da largura em todas as
                    linhas para servir a poucas. */}
                {/* Linhas baixas (`py-1.5`, `leading-snug`): na largura toda
                    nada quebra, então a altura do card é só a soma das linhas
                    — e são 48 itens somando os quatro grupos. */}
                <table className="w-full text-[13px] leading-snug">
                  <colgroup>
                    <col style={{ width: LARGURA_ITEM }} />
                    <col />
                    <col style={{ width: LARGURA_STATUS }} />
                  </colgroup>
                  <thead data-colunas>
                    <tr
                      className="text-left text-[11px] font-semibold uppercase"
                      style={{
                        background: 'var(--color-muted)',
                        // Roxo no lugar do cinza: o cabeçalho passa a marcar a
                        // tabela em vez de se confundir com o texto de apoio.
                        color: 'var(--color-primary)',
                        letterSpacing: '0.06em',
                      }}
                    >
                      {/* O nome do item tem prioridade de largura: é o que
                          identifica a linha. Quem cede e quebra é a ação, que
                          é descrição. */}
                      <th className="py-1.5 pl-4 pr-3 font-semibold whitespace-nowrap">
                        {COLUNAS_GRUPO[grupo][0]}
                      </th>
                      <th className="py-1.5 pr-3 font-semibold">{COLUNAS_GRUPO[grupo][1]}</th>
                      <th className="py-1.5 pr-4 text-right font-semibold">
                        {COLUNAS_GRUPO[grupo][2]}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {itens.map((l) => {
                      const nota = l.justificativa ?? l.observacao
                      return (
                        <tr key={l.nome} className="border-t align-top">
                          <td className="py-1.5 pl-4 pr-3 font-medium whitespace-nowrap">
                            {l.nome}
                          </td>
                          <td
                            className="py-1.5 pr-3"
                            style={{ color: 'var(--color-muted-foreground)' }}
                          >
                            {l.acao}
                          </td>
                          <td className="py-1.5 pr-4">
                            {/* O "?" vem antes da pastilha: assim a coluna de
                                status continua terminando sempre no mesmo x,
                                com ou sem justificativa. */}
                            <span className="flex items-center justify-end gap-1.5">
                              {nota && <DicaJustificativa texto={nota} />}
                              <span
                                className="inline-block rounded px-2 py-0.5 text-xs font-semibold whitespace-nowrap"
                                style={{
                                  background: META_STATUS[l.status].corFill,
                                  color: META_STATUS[l.status].cor,
                                }}
                              >
                                {META_STATUS[l.status].rotulo}
                              </span>
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </section>
      </div>

      {modalFotoAberto && ficha && ficha.dispositivoId && (
        <ModalUploadFoto
          aberto={modalFotoAberto}
          aoFechar={() => setModalFotoAberto(false)}
          dispositivoId={ficha.dispositivoId}
          homologacaoId={id}
          nomeDispositivo={`${ficha.fabricante} ${ficha.modelo}`}
          fotoAtualUrl={ficha.fotoUrl}
        />
      )}
    </div>
  )
}

function Campo({ rotulo, valor }: { rotulo: string; valor: string | null | undefined }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b pb-2">
      <dt style={{ color: 'var(--color-muted-foreground)' }}>{rotulo}</dt>
      <dd className="truncate font-medium" title={valor ?? undefined}>
        {valor || '—'}
      </dd>
    </div>
  )
}

function formatarData(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR', { timeZone: 'UTC' })
}
