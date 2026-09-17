import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useHomologacao } from '@/hooks/useHomologacao'
import { Icone } from '@/componentes/Icone'
import { ErroApi } from '@/lib/api'
import { FichaUnidadeTestada, ResultadoHomologacao } from './FichaHomologacao'
import { BlocoObservacoesParceiro } from './BlocoObservacoesParceiro'
import { AvisoRevisao } from './AvisoRevisao'

/**
 * A ficha de informações aberta sobre a tela de Validar Certificado (D432).
 *
 * É a mesma ficha de `/dispositivos/:id`, em modal: o Admin confere um
 * dispositivo, fecha e continua validando o próximo, sem perder a fila, a
 * busca e a aba em que estava.
 */
export function ModalInformacoesHomologacao({
  homologacaoId,
  aoFechar,
}: {
  homologacaoId: string
  aoFechar: () => void
}) {
  const { data: homologacao, isLoading, isError, error } = useHomologacao(homologacaoId)

  // Esc fecha: o modal cobre a tela inteira e o Admin percorre a fila pelo
  // teclado tanto quanto pelo mouse.
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') aoFechar()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [aoFechar])

  const titulo = homologacao?.dispositivo
    ? `${homologacao.dispositivo.fabricante} ${homologacao.dispositivo.modelo}`
    : 'Informações da homologação'

  // O último envio para revisão, quando é isso que a homologação está
  // esperando. Fora de EM_REVISAO o apontamento já foi atendido e some.
  const revisao =
    homologacao?.status === 'EM_REVISAO'
      ? homologacao.historicoStatus?.find((h) => h.statusNovo === 'EM_REVISAO')
      : undefined

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15,15,18,.5)' }}
      onClick={aoFechar}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-5xl max-h-[88vh] flex flex-col rounded-xl border shadow-xl"
        style={{ background: 'var(--color-popover)', borderColor: 'var(--color-border)' }}
      >
        <div className="p-5 border-b flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <h3 className="text-base font-bold truncate" style={{ color: 'var(--color-foreground)' }}>
              {titulo}
            </h3>
            {homologacao?.dispositivo && (
              <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted-foreground)' }}>
                {homologacao.dispositivo.nomeComercial}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Link
              to={`/homologacoes/${homologacaoId}/certificado`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-muted"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-foreground)' }}
            >
              <Icone nome="certificado" className="h-3.5 w-3.5" />
              Certificado
            </Link>
            <button
              type="button"
              onClick={aoFechar}
              aria-label="Fechar informações"
              className="p-1.5 rounded text-muted-foreground hover:text-foreground cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="p-5 overflow-y-auto flex-1">
          {isLoading ? (
            <p className="py-10 text-center text-sm" style={{ color: 'var(--color-muted-foreground)' }}>
              Carregando informações…
            </p>
          ) : isError || !homologacao ? (
            <p className="py-10 text-center text-sm" style={{ color: 'var(--color-destructive)' }}>
              {error instanceof ErroApi
                ? error.message
                : 'Não foi possível carregar as informações desta homologação.'}
            </p>
          ) : (
            <>
              {revisao && (
                <div className="mb-5">
                  <AvisoRevisao
                    motivo={revisao.motivo}
                    solicitadoEm={revisao.criadoEm}
                    solicitadoPor={revisao.usuario?.nome}
                  />
                </div>
              )}
              <FichaUnidadeTestada homologacao={homologacao} />
              <ResultadoHomologacao homologacao={homologacao} />
              <BlocoObservacoesParceiro observacoes={homologacao.observacoes} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
