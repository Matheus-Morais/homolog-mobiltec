import { useEffect, useState } from 'react'
import { useSalvarDadosCertificado } from '@/hooks/useHomologacao'
import { ErroApi } from '@/lib/api'
import { PainelAnaliseDivergencias } from './PainelAnaliseDivergencias'
import type { Fonte, Homologacao } from '@/lib/tipos'

interface Props {
  homologacao: Homologacao
  somenteLeitura: boolean
}

/**
 * Campo de fontes e assinaturas do certificado (spec §8.3).
 *
 * Fontes são uma lista que cresce aos poucos — cada divergência investigada
 * pode render um novo link — por isso o editor é "adicionar", não um campo
 * único. As assinaturas ficam em branco por padrão: gerenteId/apoioId exigem
 * um Usuario cadastrado, que a matriz não tem como criar, então o nome digitado
 * aqui é o caminho normal para esses dois nomes aparecerem no documento.
 */
export function PainelFontesAssinaturas({ homologacao, somenteLeitura }: Props) {
  const salvar = useSalvarDadosCertificado(homologacao.id)
  const [erro, setErro] = useState<string | null>(null)

  const [rotuloNovo, setRotuloNovo] = useState('')
  const [urlNova, setUrlNova] = useState('')

  const [responsavel, setResponsavel] = useState(homologacao.assinaturaResponsavel ?? '')
  const [gerente, setGerente] = useState(homologacao.assinaturaGerente ?? '')
  const [apoio, setApoio] = useState(homologacao.assinaturaApoio ?? '')

  useEffect(() => setResponsavel(homologacao.assinaturaResponsavel ?? ''), [homologacao.assinaturaResponsavel])
  useEffect(() => setGerente(homologacao.assinaturaGerente ?? ''), [homologacao.assinaturaGerente])
  useEffect(() => setApoio(homologacao.assinaturaApoio ?? ''), [homologacao.assinaturaApoio])

  function salvarComErro(dados: Parameters<typeof salvar.mutate>[0]) {
    setErro(null)
    salvar.mutate(dados, {
      onError: (e) => setErro(e instanceof ErroApi ? e.message : 'Não foi possível salvar.'),
    })
  }

  function adicionarFonte(e: React.FormEvent) {
    e.preventDefault()
    const label = rotuloNovo.trim()
    if (!label) return
    const fontes: Fonte[] = [...homologacao.fontes, { label, url: urlNova.trim() }]
    salvarComErro({ fontes })
    setRotuloNovo('')
    setUrlNova('')
  }

  function removerFonte(indice: number) {
    const fontes = homologacao.fontes.filter((_, i) => i !== indice)
    salvarComErro({ fontes })
  }

  function salvarAssinaturaSeMudou(
    campo: 'assinaturaResponsavel' | 'assinaturaGerente' | 'assinaturaApoio',
    valor: string,
  ) {
    const original = homologacao[campo] ?? ''
    if (valor.trim() === original.trim()) return
    salvarComErro({ [campo]: valor.trim() || null })
  }

  return (
    <div className="space-y-6">
      {erro && (
        <div
          role="alert"
          className="px-3 py-2 rounded-md text-xs"
          style={{ background: 'var(--color-destructive-soft)', color: 'var(--color-destructive-fg)' }}
        >
          {erro}
        </div>
      )}

      {/* --- Assinaturas --- */}
      <section>
        <p className="label-caps mb-2">Assinaturas</p>
        <div className="space-y-3">
          <CampoAssinatura
            rotulo="Responsável Técnico"
            valor={responsavel}
            aoMudar={setResponsavel}
            aoSair={() => salvarAssinaturaSeMudou('assinaturaResponsavel', responsavel)}
            somenteLeitura={somenteLeitura}
          />
          <CampoAssinatura
            rotulo="Gerente de Validação"
            valor={gerente}
            aoMudar={setGerente}
            aoSair={() => salvarAssinaturaSeMudou('assinaturaGerente', gerente)}
            somenteLeitura={somenteLeitura}
          />
          <CampoAssinatura
            rotulo="Apoio Adicional"
            valor={apoio}
            aoMudar={setApoio}
            aoSair={() => salvarAssinaturaSeMudou('assinaturaApoio', apoio)}
            somenteLeitura={somenteLeitura}
          />
        </div>
      </section>

      {/* --- Análise das divergências ---
          Entre assinaturas e fontes: é conteúdo da mesma página final do
          documento, e vem antes das fontes como no próprio certificado. */}
      <PainelAnaliseDivergencias homologacaoId={homologacao.id} />

      {/* --- Fontes --- */}
      <section>
        <p className="label-caps mb-2">Fontes</p>
        <p className="text-xs mb-3" style={{ color: 'var(--color-muted-foreground)' }}>
          Referências técnicas citadas no certificado. Some-se às da biblioteca de
          justificativas usadas nas divergências.
        </p>

        {homologacao.fontes.length > 0 && (
          <ul className="space-y-1.5 mb-3">
            {homologacao.fontes.map((f, i) => (
              <li
                key={`${f.label}-${i}`}
                className="flex items-start gap-2 px-2.5 py-2 rounded-md text-xs"
                style={{ background: 'var(--color-muted)' }}
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{f.label}</p>
                  {f.url && (
                    <a
                      href={f.url}
                      target="_blank"
                      rel="noreferrer"
                      className="block truncate underline underline-offset-2"
                      style={{ color: 'var(--color-primary)' }}
                    >
                      {f.url}
                    </a>
                  )}
                </div>
                {!somenteLeitura && (
                  <button
                    type="button"
                    onClick={() => removerFonte(i)}
                    title="Remover"
                    className="shrink-0 leading-none text-sm"
                    style={{ color: 'var(--color-muted-foreground)' }}
                  >
                    ×
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {!somenteLeitura && (
          <form onSubmit={adicionarFonte} className="space-y-2">
            <input
              value={rotuloNovo}
              onChange={(e) => setRotuloNovo(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-md border bg-transparent text-xs"
              style={{ borderColor: 'var(--color-input)' }}
            />
            <input
              value={urlNova}
              onChange={(e) => setUrlNova(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-md border bg-transparent text-xs"
              style={{ borderColor: 'var(--color-input)' }}
            />
            <button
              type="submit"
              disabled={!rotuloNovo.trim() || salvar.isPending}
              className="w-full px-2.5 py-1.5 rounded-md text-xs font-medium border disabled:opacity-50"
              style={{ borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }}
            >
              + Adicionar fonte
            </button>
          </form>
        )}
      </section>
    </div>
  )
}

function CampoAssinatura({
  rotulo,
  valor,
  aoMudar,
  aoSair,
  somenteLeitura,
}: {
  rotulo: string
  valor: string
  aoMudar: (v: string) => void
  aoSair: () => void
  placeholder?: string
  somenteLeitura: boolean
}) {
  return (
    <div>
      <label className="text-xs block mb-1" style={{ color: 'var(--color-muted-foreground)' }}>
        {rotulo}
      </label>
      <input
        value={valor}
        disabled={somenteLeitura}
        onChange={(e) => aoMudar(e.target.value)}
        onBlur={aoSair}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        className="w-full px-2.5 py-1.5 rounded-md border bg-transparent text-sm disabled:opacity-60"
        style={{ borderColor: 'var(--color-input)' }}
      />
    </div>
  )
}
