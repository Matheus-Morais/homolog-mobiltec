import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useHomologacao } from '@/hooks/useHomologacao'
import { api, ErroApi } from '@/lib/api'
import { useAuth } from '@/contextos/AuthContext'
import { imprimirCertificadoHtml } from '@/lib/imprimir'
import { ModalUploadFoto } from '@/componentes/dispositivo/ModalUploadFoto'
import {
  FichaUnidadeTestada,
  ResultadoHomologacao,
} from '@/componentes/homologacao/FichaHomologacao'
import { BlocoObservacoesParceiro } from '@/componentes/homologacao/BlocoObservacoesParceiro'
import { AvisoRevisao } from '@/componentes/homologacao/AvisoRevisao'
import { Icone } from '@/componentes/Icone'
import { LoadingTela } from '@/componentes/LoadingTela'

/**
 * Informações da homologação de um modelo.
 *
 * É o "exibir informações" do catálogo: a ficha da unidade testada, o
 * resultado item a item, as observações do parceiro e o botão de exportar o
 * certificado. Só leitura — quem edita é a matriz.
 *
 * A ficha propriamente dita mora em `FichaHomologacao` (D432): a tela de
 * Validar Certificado abre a mesma coisa num modal, e duas cópias do mesmo
 * documento divergiriam na primeira mudança.
 */
export function DetalheDispositivo() {
  const { id = '' } = useParams<{ id: string }>()
  const consulta = useHomologacao(id)
  const { ehMobiltec, ehParceiro } = useAuth()

  const [baixando, setBaixando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [modalFotoAberto, setModalFotoAberto] = useState(false)

  const homologacao = consulta.data

  const podeEditarFoto =
    ehMobiltec || (ehParceiro && homologacao?.status === 'RASCUNHO' && !homologacao?.homologado)

  // O apontamento em aberto, quando a homologação está esperando ajuste. É o
  // que diz ao parceiro o que a Mobiltec pediu (D435).
  const revisao =
    homologacao?.status === 'EM_REVISAO'
      ? homologacao.historicoStatus?.find((h) => h.statusNovo === 'EM_REVISAO')
      : undefined

  async function exportarCertificado() {
    setBaixando(true)
    setAviso(null)
    try {
      const blob = await api.getBlob(`/homologacoes/${id}/certificado/pdf`)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `certificado-${homologacao?.dispositivo?.modelo ?? id}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e: any) {
      // Fallback: se a geração no servidor estiver indisponível (serverless / sem Playwright),
      // buscamos o preview HTML e abrimos o diálogo nativo do navegador para Salvar como PDF
      try {
        setAviso('Abrindo diálogo de impressão (Salvar como PDF)...')
        const html = await api.getTexto(`/homologacoes/${id}/certificado/preview`)
        imprimirCertificadoHtml(html)
      } catch {
        setAviso(e instanceof ErroApi ? e.message : 'Não foi possível gerar o PDF.')
      }
    } finally {
      setBaixando(false)
    }
  }

  if (consulta.isLoading) {
    return <LoadingTela mensagem="Carregando detalhes do dispositivo…" />
  }

  if (!homologacao) {
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

  const fabricante = homologacao.dispositivo?.fabricante ?? '—'
  const modelo = homologacao.dispositivo?.modelo ?? '—'

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
            className="mt-3 rounded-lg px-4 py-3 text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-2"
            style={{
              background: 'var(--color-destructive-soft)',
              color: 'var(--color-destructive-fg)',
            }}
          >
            <span>{aviso}</span>
            <Link
              to={`/homologacoes/${id}/certificado`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-semibold underline underline-offset-2 shrink-0"
              style={{ color: 'var(--color-primary)' }}
            >
              Abrir Certificado no navegador →
            </Link>
          </div>
        )}

        {revisao && (
          <div className="mt-3">
            <AvisoRevisao
              motivo={revisao.motivo}
              solicitadoEm={revisao.criadoEm}
              solicitadoPor={revisao.usuario?.nome}
              comoAgir={ehParceiro}
            />
          </div>
        )}

        {/* Ficha da unidade testada — a identificação do modelo e a ação
            moram no topo dela, e não num bloco solto acima: é a mesma coisa
            sendo descrita, não duas. */}
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
              {fabricante} {modelo}
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

          <div className="mt-4">
            <FichaUnidadeTestada
              homologacao={homologacao}
              aoEditarFoto={podeEditarFoto ? () => setModalFotoAberto(true) : undefined}
            />
          </div>
        </section>

        <ResultadoHomologacao homologacao={homologacao} />

        <BlocoObservacoesParceiro observacoes={homologacao.observacoes} />
      </div>

      {modalFotoAberto && homologacao.dispositivo?.id && (
        <ModalUploadFoto
          aberto={modalFotoAberto}
          aoFechar={() => setModalFotoAberto(false)}
          dispositivoId={homologacao.dispositivo.id}
          homologacaoId={id}
          nomeDispositivo={`${fabricante} ${modelo}`}
          fotoAtualUrl={homologacao.dispositivo.fotoUrl ?? null}
        />
      )}
    </div>
  )
}
