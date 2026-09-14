import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ErroApi } from '@/lib/api'

export interface BlocoAnalise {
  id: string
  titulo: string
  subtitulo: string
  texto: string
}

interface Analise {
  /** true = a seção foi assumida à mão; false = ainda vem das justificativas */
  manual: boolean
  blocos: BlocoAnalise[]
  /**
   * Justificativas escritas na planilha que ainda não passaram por esta seção.
   * Quem decide isso é o servidor: ele guarda o que já foi tratado, para um
   * parágrafo reescrito ou apagado de propósito não voltar como novidade.
   */
  novas: BlocoAnalise[]
  /** Textos que o técnico já decidiu o que fazer com — trazidos ou dispensados */
  vistos: string[]
  /** Quantas justificativas da planilha não estão em bloco nenhum hoje */
  foraDoDocumento: number
  somenteLeitura: boolean
}

const chaveAnalise = (id: string) => ['analise-divergencias', id] as const

/**
 * Editor da "Análise das Divergências".
 *
 * A seção nasce das justificativas dos itens divergentes, e isso cobre o caso
 * comum. Mas o certificado é de um modelo específico e às vezes precisa falar
 * de um tema que nenhuma justificativa cobre — e às vezes o texto que veio por
 * padrão não serve para aquele cliente.
 *
 * Por isso o editor é tudo-ou-nada: ao "personalizar", os blocos automáticos
 * são copiados para cá e a seção passa a sair exatamente daqui. A partir daí
 * dá para editar título, subtítulo e texto de qualquer bloco — inclusive os
 * que vieram por padrão —, apagar os que não servem, reordenar e acrescentar
 * temas próprios. "Voltar ao automático" devolve a seção às justificativas.
 *
 * A alternativa seria remendar bloco a bloco sobre o automático, mas os blocos
 * automáticos não têm identidade estável: eles se agrupam por texto de
 * justificativa, e mudar um status reagrupa tudo — qualquer remendo se perderia
 * sozinho.
 */
export function PainelAnaliseDivergencias({ homologacaoId }: { homologacaoId: string }) {
  const qc = useQueryClient()
  const [erro, setErro] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: chaveAnalise(homologacaoId),
    queryFn: () => api.get<Analise>(`/homologacoes/${homologacaoId}/certificado/analise`),
  })

  const salvar = useMutation({
    mutationFn: ({ blocos, vistos }: { blocos: BlocoAnalise[] | null; vistos?: string[] }) =>
      api.put<{ manual: boolean }>(`/homologacoes/${homologacaoId}/certificado/analise`, {
        blocos,
        vistos,
      }),
    onSuccess: (_resposta, enviado) => {
      // Acompanha o que acabou de ser gravado. Sem isto o estado local
      // continuava com o `vistos` do primeiro carregamento — e o salvamento
      // seguinte devolvia essa lista velha, desfazendo o "Personalizar".
      if (enviado.vistos) setVistos(enviado.vistos)
      qc.invalidateQueries({ queryKey: chaveAnalise(homologacaoId) })
      // O documento ao lado é HTML gerado no servidor: precisa ser refeito
      qc.invalidateQueries({ queryKey: ['certificado'] })
    },
    onError: (e) => setErro(e instanceof ErroApi ? e.message : 'Não foi possível salvar a análise.'),
  })

  /** Rascunho local: digitar não pode disparar uma gravação por tecla */
  const [rascunho, setRascunho] = useState<BlocoAnalise[] | null>(null)
  /**
   * As justificativas já decididas, em rascunho.
   *
   * Vive aqui, e não no servidor, porque só gesto do técnico a altera:
   * assumir a seção, trazer uma justificativa ou dispensá-la. Salvar apenas
   * persiste — recalcular no salvamento era o que engolia justificativa
   * escrita entre duas edições.
   */
  const [vistos, setVistos] = useState<string[] | null>(null)

  // Só adota o que veio do servidor enquanto não há edição em curso, senão
  // uma revalidação apagaria o que está sendo escrito.
  useEffect(() => {
    if (data && rascunho === null) {
      setRascunho(data.blocos)
      setVistos(data.vistos)
    }
  }, [data, rascunho])

  if (isLoading || !data || rascunho === null) {
    return (
      <section>
        <p className="label-caps mb-2">Análise das divergências</p>
        <p className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>
          Carregando…
        </p>
      </section>
    )
  }

  const travado = data.somenteLeitura
  const sujo =
    JSON.stringify(rascunho) !== JSON.stringify(data.blocos) ||
    JSON.stringify(vistos) !== JSON.stringify(data.vistos)

  /**
   * Justificativas escritas na matriz depois que a seção virou manual.
   *
   * Enquanto a análise é automática, justificar um item na planilha já coloca
   * o parágrafo no documento — é assim desde sempre. Assumida a seção, isso
   * para: o documento passa a ser o que está gravado aqui. Em vez de deixar o
   * texto sumir em silêncio, o painel mostra o que ficou de fora.
   *
   * O que já está no rascunho sai da lista: trazida a justificativa, o aviso
   * some antes mesmo de salvar.


  /**
   * Devolve à lista tudo que hoje não está em bloco nenhum.
   *
   * Serve para conferir a seção contra a planilha depois de muita edição — e
   * para recuperar justificativa que a versão anterior deste painel marcou
   * como tratada sem nunca ter posto no documento.
   */
  function reconferir() {
    // Só o que está escrito no documento continua "decidido"; o resto volta
    // a ser oferecido. Mesmo `v!` dos outros manipuladores: a tela só chega
    // aqui depois da guarda de carregamento.
    setVistos(rascunho!.map((b) => b.texto))
  }

  function mexer(indice: number, campo: keyof BlocoAnalise, valor: string) {
    setRascunho((v) => v!.map((b, i) => (i === indice ? { ...b, [campo]: valor } : b)))
  }

  function remover(indice: number) {
    setRascunho((v) => v!.filter((_, i) => i !== indice))
  }

  function mover(indice: number, direcao: -1 | 1) {
    setRascunho((v) => {
      const destino = indice + direcao
      if (!v || destino < 0 || destino >= v.length) return v
      const copia = [...v]
      ;[copia[indice], copia[destino]] = [copia[destino], copia[indice]]
      return copia
    })
  }

  function acrescentar() {
    setRascunho((v) => [
      ...v!,
      { id: `manual-${Date.now()}`, titulo: '', subtitulo: '', texto: '' },
    ])
  }

  return (
    <section>
      <p className="label-caps mb-2">Análise das divergências</p>

      {erro && (
        <div
          role="alert"
          className="mb-3 rounded-md px-3 py-2 text-xs"
          style={{
            background: 'var(--color-destructive-soft)',
            color: 'var(--color-destructive-fg)',
          }}
        >
          {erro}
        </div>
      )}

      <p className="mb-3 text-xs" style={{ color: 'var(--color-muted-foreground)' }}>
        {data.manual
          ? 'Escrita à mão: sai no certificado exatamente o que estiver abaixo.'
          : 'Montada a partir das justificativas dos itens divergentes. Personalize para editar, apagar ou acrescentar blocos.'}
      </p>

      {travado ? (
        <p className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>
          Homologação aprovada é somente leitura — reabra para editar a análise.
        </p>
      ) : !data.manual ? (
        <button
          type="button"
          data-personalizar-analise
          // Assumir a seção como ela está: os automáticos viram blocos, e
          // ficam registrados como decididos
          onClick={() =>
            salvar.mutate({ blocos: rascunho, vistos: rascunho.map((b) => b.texto) })
          }
          disabled={salvar.isPending}
          className="w-full rounded-md border px-2.5 py-1.5 text-xs font-medium disabled:opacity-50"
          style={{ borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }}
        >
          {salvar.isPending ? 'Preparando…' : 'Personalizar esta seção'}
        </button>
      ) : (
        <>
          <div className="space-y-2" data-blocos-analise>
            {rascunho.map((b, i) => (
              <div
                key={b.id}
                data-bloco-analise
                className="rounded-md border p-2.5"
                style={{ background: 'var(--color-muted)' }}
              >
                <div className="mb-1.5 flex items-center gap-1">
                  <span
                    className="flex-1 text-[10px] font-semibold uppercase tracking-wider"
                    style={{ color: 'var(--color-muted-foreground)' }}
                  >
                    Bloco {i + 1}
                  </span>
                  <BotaoIcone rotulo="Subir" simbolo="↑" aoClicar={() => mover(i, -1)} desabilitado={i === 0} />
                  <BotaoIcone
                    rotulo="Descer"
                    simbolo="↓"
                    aoClicar={() => mover(i, 1)}
                    desabilitado={i === rascunho.length - 1}
                  />
                  <BotaoIcone rotulo="Remover bloco" simbolo="×" aoClicar={() => remover(i)} perigo />
                </div>

                <input
                  value={b.titulo}
                  data-campo="titulo"
                  onChange={(e) => mexer(i, 'titulo', e.target.value)}
                  placeholder="Título (ex.: Comandos Remotos)"
                  className="mb-1.5 w-full rounded border bg-transparent px-2 py-1 text-xs font-semibold"
                  style={{ borderColor: 'var(--color-input)' }}
                />
                <input
                  value={b.subtitulo}
                  data-campo="subtitulo"
                  onChange={(e) => mexer(i, 'subtitulo', e.target.value)}
                  placeholder="Subtítulo (ex.: Wipe - Acesso Remoto)"
                  className="mb-1.5 w-full rounded border bg-transparent px-2 py-1 text-xs"
                  style={{ borderColor: 'var(--color-input)' }}
                />
                <textarea
                  value={b.texto}
                  data-campo="texto"
                  onChange={(e) => mexer(i, 'texto', e.target.value)}
                  rows={4}
                  placeholder="Texto do parágrafo"
                  className="w-full resize-y rounded border bg-transparent px-2 py-1 text-xs leading-relaxed"
                  style={{ borderColor: 'var(--color-input)' }}
                />
              </div>
            ))}

            {rascunho.length === 0 && (
              <p className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>
                A seção está vazia — o certificado sai sem análise de divergências.
              </p>
            )}
          </div>

          <button
            type="button"
            data-novo-bloco
            onClick={acrescentar}
            className="mt-2 w-full rounded-md border px-2.5 py-1.5 text-xs font-medium"
            style={{ borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }}
          >
            + Novo bloco
          </button>

          {/* Conferência contra a planilha: útil depois de muita edição, e é
              o caminho de volta para justificativa que a versão anterior
              deste painel marcou como tratada sem pôr no documento. */}
          {data.foraDoDocumento > 0 && (
            <button
              type="button"
              data-reconferir
              onClick={reconferir}
              className="mt-3 w-full rounded-md border px-2.5 py-1.5 text-xs"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-muted-foreground)' }}
            >
              Reconferir justificativas da planilha ({data.foraDoDocumento} fora do documento)
            </button>
          )}

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              data-salvar-analise
              onClick={() => salvar.mutate({ blocos: rascunho, vistos: vistos ?? [] })}
              disabled={!sujo || salvar.isPending}
              className="flex-1 rounded-md px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-45"
              style={{ background: 'var(--gradient-brand-purple)' }}
            >
              {salvar.isPending ? 'Salvando…' : sujo ? 'Salvar análise' : 'Salvo'}
            </button>
            {sujo && (
              <button
                type="button"
                onClick={() => {
                  setRascunho(data.blocos)
                  setVistos(data.vistos)
                }}
                className="rounded-md px-2.5 py-1.5 text-xs"
                style={{ color: 'var(--color-muted-foreground)' }}
              >
                Descartar
              </button>
            )}
          </div>

          <button
            type="button"
            data-voltar-automatico
            onClick={() => {
              if (
                !confirm(
                  'Voltar ao automático descarta os blocos escritos aqui e devolve a seção às justificativas. Continuar?',
                )
              )
                return
              setRascunho(null)
              setVistos(null)
              salvar.mutate({ blocos: null })
            }}
            className="mt-2 w-full text-center text-xs underline underline-offset-2"
            style={{ color: 'var(--color-muted-foreground)' }}
          >
            Voltar ao automático
          </button>
        </>
      )}
    </section>
  )
}

function BotaoIcone({
  rotulo,
  simbolo,
  aoClicar,
  desabilitado,
  perigo,
}: {
  rotulo: string
  simbolo: string
  aoClicar: () => void
  desabilitado?: boolean
  perigo?: boolean
}) {
  return (
    <button
      type="button"
      onClick={aoClicar}
      disabled={desabilitado}
      title={rotulo}
      aria-label={rotulo}
      data-acao-bloco={rotulo}
      className="grid h-5 w-5 place-items-center rounded text-xs leading-none disabled:opacity-30"
      style={{ color: perigo ? 'var(--color-destructive-fg)' : 'var(--color-muted-foreground)' }}
    >
      {simbolo}
    </button>
  )
}
