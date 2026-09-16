import { useMemo } from 'react'
import { FotoDispositivo } from '@/componentes/vitrine/FotoDispositivo'
import { DicaJustificativa } from '@/componentes/DicaJustificativa'
import { Icone } from '@/componentes/Icone'
import { comporDetalhesResultado } from '@/lib/detalhesResultado'
import type { SecaoDetalheResultado } from '@/lib/detalhesResultado'
import {
  GRUPO_ORDEM,
  META_STATUS,
  ROTULO_GERENCIAMENTO,
  obterColunasGrupo,
  obterRotuloGrupo,
  somenteVersaoAndroid,
} from '@/lib/tipos'
import type { GrupoItem, Homologacao, StatusResultado } from '@/lib/tipos'

/**
 * A ficha da homologação: a unidade testada e o resultado item a item.
 *
 * Mora aqui, e não dentro da página, porque a mesma ficha é aberta em dois
 * lugares (D432): pela vitrine, como página em `/dispositivos/:id`, e pela
 * tela de Validar Certificado, dentro de um modal — ali o Admin confere sem
 * perder a fila em que estava. Só leitura nos dois; quem edita é a matriz.
 *
 * São duas peças exportadas, e não uma: na página a unidade testada fica
 * dentro do card com os botões do certificado, e o resultado vem abaixo dele,
 * solto. Quem chama decide o enquadramento.
 */

/** Uma linha do resultado, no formato que esta ficha desenha */
interface LinhaResultado {
  grupo: GrupoItem
  nome: string
  acao: string
  status: StatusResultado
  detalhes: SecaoDetalheResultado[]
}

/**
 * É `<table>`, e não grid, por um motivo concreto: cada linha em grid é um
 * contêiner independente, então dimensionar por conteúdo desalinharia as
 * colunas entre as linhas — e um grid único para cabeçalho e corpo exigiria
 * `display: contents`, que apaga a linha como elemento. Tabela resolve as
 * duas coisas de graça.
 *
 * A coluna do status é fixa e serve de âncora à direita; as outras duas
 * ficam em `auto`, sizing por conteúdo. Com os detalhes fora da tabela
 * (viraram balão no `?`), sobra largura para os quatro grupos caberem dois a
 * dois.
 */
const LARGURA_STATUS = '7rem'
/**
 * Na largura toda, deixar as duas primeiras colunas em `auto` abriria um vão
 * entre o texto e a coluna seguinte — era a queixa original desta tela. Com o
 * item em fração fixa, a ação ocupa todo o resto e a linha fecha.
 */
const LARGURA_ITEM = '26%'

/** A identificação da unidade que foi para a bancada: foto e ficha técnica. */
export function FichaUnidadeTestada({
  homologacao,
  aoEditarFoto,
}: {
  homologacao: Homologacao
  /**
   * Quando informado, a foto vira botão de troca. Sem isso é só imagem — é o
   * caso do modal de validação, onde o Admin confere e não mexe no cadastro.
   */
  aoEditarFoto?: () => void
}) {
  const ficha = useMemo(() => {
    const h = homologacao
    return {
      nomeComercial: h.dispositivo?.nomeComercial ?? '—',
      fotoUrl: h.dispositivo?.fotoUrl ?? null,
      versaoSo: h.versaoSo,
      versaoAgente: h.versaoAgente,
      versaoPos: h.versaoPos,
      tipoAgente: h.tipoAgente,
      gerenciamento: h.gerenciamento,
      // Sem `numeroSerie`, `imei1` e `imei2`: esta é a ficha que o parceiro
      // vai ver, e identificador de aparelho não tem o que fazer nela — mesma
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
    }
  }, [homologacao])

  return (
    // Foto grande à esquerda, tudo o mais numa coluna ao lado: com os três
    // identificadores fora, os dados restantes cabem em duas fileiras, e a
    // faixa larga que sobrava vira espaço para a imagem.
    <div className="flex flex-wrap items-start gap-6">
      <div className="flex flex-col items-center gap-2">
        <div
          className="group relative w-48 shrink-0 self-center overflow-hidden rounded-xl border transition-all"
          style={{ background: 'var(--color-sidebar)' }}
        >
          <FotoDispositivo url={ficha.fotoUrl} nome={ficha.nomeComercial} altura={192} semBorda />
          {aoEditarFoto && (
            <button
              type="button"
              onClick={aoEditarFoto}
              title={
                ficha.fotoUrl ? 'Alterar foto do dispositivo' : 'Adicionar foto do dispositivo'
              }
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

        {aoEditarFoto && (
          <button
            type="button"
            onClick={aoEditarFoto}
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
  )
}

/** O checklist da bateria, grupo a grupo — as mesmas colunas do certificado. */
export function ResultadoHomologacao({ homologacao }: { homologacao: Homologacao }) {
  const porGrupo = useMemo(() => {
    const linhas: LinhaResultado[] = (homologacao.resultados ?? []).map((r) => ({
      grupo: r.item.grupo,
      nome: r.item.nome,
      // A coluna do meio do certificado: o que foi feito para avaliar o item
      acao: r.item.descricaoAcao,
      status: r.status,
      detalhes: comporDetalhesResultado(r),
    }))

    const gruposPresentes = Array.from(new Set(linhas.map((l) => l.grupo)))
    const todosGrupos = [
      ...GRUPO_ORDEM,
      ...gruposPresentes.filter((g) => !GRUPO_ORDEM.includes(g as any)),
    ]

    return todosGrupos
      .map((g) => ({ grupo: g, itens: linhas.filter((l) => l.grupo === g) }))
      .filter((g) => g.itens.length > 0)
  }, [homologacao])

  return (
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
              {obterRotuloGrupo(grupo)}
            </div>

            {/* As mesmas três colunas do certificado. Os detalhes saíram da
                tabela e viraram balão no `?` ao lado do status: como coluna,
                cobravam 38% da largura em todas as linhas para servir a poucas. */}
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
                  {(() => {
                    const colunas = obterColunasGrupo(grupo)
                    return (
                      <>
                        <th className="py-1.5 pl-4 pr-3 font-semibold whitespace-nowrap">
                          {colunas[0]}
                        </th>
                        <th className="py-1.5 pr-3 font-semibold">{colunas[1]}</th>
                        <th className="py-1.5 pr-4 text-right font-semibold">
                          {colunas[2]}
                        </th>
                      </>
                    )
                  })()}
                </tr>
              </thead>
              <tbody>
                {itens.map((l) => {
                  return (
                    <tr key={l.nome} className="border-t align-top">
                      <td className="py-1.5 pl-4 pr-3 font-medium whitespace-nowrap">{l.nome}</td>
                      <td
                        className="py-1.5 pr-3"
                        style={{ color: 'var(--color-muted-foreground)' }}
                      >
                        {l.acao}
                      </td>
                      <td className="py-1.5 pr-4">
                        {/* O "?" vem antes da pastilha: assim a coluna de
                            status continua terminando sempre no mesmo x,
                            com ou sem detalhes. */}
                        <span className="flex items-center justify-end gap-1.5">
                          {l.detalhes.length > 0 && <DicaJustificativa secoes={l.detalhes} />}
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
