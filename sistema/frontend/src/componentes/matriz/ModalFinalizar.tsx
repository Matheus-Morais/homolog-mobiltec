import { useState } from 'react'
import { useAuth } from '@/contextos/AuthContext'
import { useTransicaoStatus } from '@/hooks/useHomologacao'
import { ErroApi } from '@/lib/api'
import { exigeJustificativa } from '@/lib/tipos'
import type { ColunaMatriz } from '@/lib/tipos'

/**
 * Finalizar = fechar a homologação (spec §7.5).
 *
 * Para parceiros: envia para AGUARDANDO_ANALISE e permite incluir nome como Apoio.
 * Para Mobiltec: RASCUNHO / AGUARDANDO_ANALISE / EM_REVISAO → APROVADO com veredito manual.
 */
export function ModalFinalizar({
  coluna,
  aoFechar,
  aoFinalizar,
}: {
  coluna: ColunaMatriz
  aoFechar: () => void
  aoFinalizar: () => void
}) {
  const { usuario, ehParceiro } = useAuth()
  const transicao = useTransicaoStatus(coluna.homologacao.id)
  const [erro, setErro] = useState<string | null>(null)
  const [comoApoio, setComoApoio] = useState(
    Boolean(coluna.homologacao.assinaturaApoio?.includes('Parceiro')),
  )

  // Devolver ajustes não é a mesma coisa que submeter pela primeira vez, e o
  // texto do modal precisa dizer qual das duas está acontecendo (D434).
  const ehReenvio = coluna.homologacao.status === 'EM_REVISAO'

  const resultados = coluna.homologacao.resultados
  const naoTestados = resultados.filter((r) => r.status === 'NAO_TESTADO').length
  const semJustificativa = resultados.filter(
    (r) => exigeJustificativa(r.status) && !r.justificativaId && !r.justificativaTexto,
  ).length
  const semAssinatura = !(
    coluna.homologacao.assinaturaResponsavel?.trim() || coluna.homologacao.responsavel?.nome
  )

  const pendencias = [
    naoTestados > 0 && `${naoTestados} item(ns) ainda não testado(s)`,
    !ehParceiro &&
      semJustificativa > 0 &&
      `${semJustificativa} divergência(s) sem justificativa — saem em branco no certificado`,
  ].filter(Boolean) as string[]

  const completa = pendencias.length === 0

  function enviarParaAnalise() {
    setErro(null)
    const assinaturaApoioCalculada = comoApoio
      ? `${usuario?.nome ?? 'Parceiro'} — Parceiro`
      : null
    transicao.mutate(
      {
        novoStatus: 'AGUARDANDO_ANALISE',
        assinaturaApoio: assinaturaApoioCalculada,
      },
      {
        onSuccess: aoFinalizar,
        onError: (e) =>
          setErro(e instanceof ErroApi ? e.message : 'Não foi possível enviar para validação.'),
      },
    )
  }

  function finalizar(homologado: boolean) {
    setErro(null)
    const aprovar = () =>
      transicao.mutate(
        { novoStatus: 'APROVADO', homologado },
        {
          onSuccess: aoFinalizar,
          onError: (e) =>
            setErro(e instanceof ErroApi ? e.message : 'Não foi possível finalizar.'),
        },
      )

    if (coluna.homologacao.status === 'RASCUNHO') {
      transicao.mutate(
        { novoStatus: 'EM_REVISAO' },
        {
          onSuccess: aprovar,
          onError: (e) =>
            setErro(e instanceof ErroApi ? e.message : 'Não foi possível enviar para revisão.'),
        },
      )
    } else {
      aprovar()
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15,15,18,.45)' }}
      onClick={aoFechar}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && aoFechar()}
        className="w-full max-w-lg rounded-xl border shadow-xl"
        style={{ background: 'var(--color-popover)' }}
      >
        <div className="p-5 border-b">
          <h2 className="text-lg font-semibold">
            {ehParceiro
              ? ehReenvio
                ? 'Reenviar para Validação Mobiltec'
                : 'Enviar para Validação Mobiltec'
              : 'Finalizar homologação'}
          </h2>
          <p className="text-sm mt-0.5" style={{ color: 'var(--color-muted-foreground)' }}>
            {coluna.homologacao.dispositivo.nomeComercial} · agente{' '}
            {coluna.homologacao.versaoAgente}
          </p>
        </div>

        <div className="p-5 space-y-4">
          {ehParceiro ? (
            <>
              <div
                className="px-3.5 py-3 rounded-md text-sm leading-relaxed"
                style={{ background: 'var(--color-info-soft)', color: 'var(--color-info-fg)' }}
              >
                {ehReenvio ? (
                  <>
                    Os ajustes serão devolvidos à Mobiltec: a homologação volta para{' '}
                    <strong>Em Validação</strong> e reaparece na fila de análise. A matriz fica
                    somente-leitura até o retorno.
                  </>
                ) : (
                  <>
                    Ao concluir esta etapa, a homologação mudará para <strong>Em Validação</strong>.
                    Um técnico da Mobiltec revisará as notas de observação e emitirá o certificado
                    oficial.
                  </>
                )}
              </div>

              <div
                className="p-3.5 rounded-lg border space-y-2.5"
                style={{ borderColor: 'var(--color-border)', background: 'var(--color-muted)' }}
              >
                <div
                  className="text-xs font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--color-muted-foreground)' }}
                >
                  Identificação do Parceiro
                </div>
                <div className="text-sm font-medium text-foreground">
                  {usuario?.nome || 'Usuário Parceiro'}
                </div>

                <label className="flex items-center gap-2 text-sm cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={comoApoio}
                    onChange={(e) => setComoApoio(e.target.checked)}
                    className="rounded border"
                  />
                  <span>Cadastrar como Apoio do Parceiro</span>
                </label>

                {comoApoio && (
                  <p className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>
                    Será exibido no certificado na seção de Apoio Técnico como:{' '}
                    <strong>{usuario?.nome || 'Parceiro'} — Parceiro</strong>
                  </p>
                )}
              </div>

              {naoTestados > 0 && (
                <div
                  className="px-3 py-2 rounded-md text-xs"
                  style={{ background: 'var(--color-warning-soft)', color: 'var(--color-warning-fg)' }}
                >
                  Atenção: ainda restam {naoTestados} item(ns) não testados nesta bateria.
                </div>
              )}
            </>
          ) : (
            <>
              {completa ? (
                <div
                  className="px-3 py-2.5 rounded-md text-sm"
                  style={{ background: 'var(--color-status-ok-soft)', color: 'var(--color-status-ok)' }}
                >
                  ✓ Todos os {resultados.length} itens avaliados e todas as divergências justificadas.
                </div>
              ) : (
                <div
                  data-pendencias
                  className="px-3 py-2.5 rounded-md text-sm"
                  style={{ background: 'var(--color-warning-soft)', color: 'var(--color-warning-fg)' }}
                >
                  <p className="font-semibold mb-1">Fica pendente:</p>
                  <ul className="list-disc pl-5 space-y-0.5">
                    {pendencias.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                  <p className="mt-1.5 opacity-90">
                    Dá para finalizar assim — a validação e a assinatura são do gerente de produto.
                  </p>
                </div>
              )}

              {semAssinatura && (
                <div
                  className="px-3 py-2.5 rounded-md text-sm"
                  style={{ background: 'var(--color-warning-soft)', color: 'var(--color-warning-fg)' }}
                >
                  O certificado está sem nome na assinatura do Responsável Técnico. Dá para finalizar
                  assim, mas o documento sai com a linha em branco.
                </div>
              )}

              <div
                className="px-3 py-2.5 rounded-md text-sm"
                style={{ background: 'var(--color-muted)', color: 'var(--color-muted-foreground)' }}
              >
                Depois de finalizada, a homologação fica <strong>somente leitura</strong>. Para mexer
                de novo é preciso reabrir, e a reabertura fica registrada em log.
              </div>
            </>
          )}

          {erro && (
            <div
              role="alert"
              className="px-3 py-2.5 rounded-md text-sm"
              style={{
                background: 'var(--color-destructive-soft)',
                color: 'var(--color-destructive-fg)',
              }}
            >
              {erro}
            </div>
          )}
        </div>

        <div className="p-5 border-t flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={aoFechar}
            className="px-4 py-2 rounded-md text-sm"
            style={{ color: 'var(--color-muted-foreground)' }}
          >
            Cancelar
          </button>
          {ehParceiro ? (
            <button
              type="button"
              disabled={transicao.isPending}
              onClick={enviarParaAnalise}
              className="px-4 py-2 rounded-md text-sm font-medium text-white disabled:opacity-50"
              style={{ background: 'var(--gradient-brand-purple)' }}
            >
              {transicao.isPending
                ? 'Enviando…'
                : ehReenvio
                ? 'Reenviar para Validação Mobiltec'
                : 'Enviar para Validação Mobiltec'}
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                disabled={transicao.isPending}
                onClick={() => finalizar(false)}
                title="Fecha a homologação registrando que o dispositivo NÃO foi homologado"
                className="px-4 py-2 rounded-md text-sm font-medium border disabled:opacity-50"
                style={{
                  borderColor: 'var(--color-status-falha)',
                  color: 'var(--color-status-falha)',
                }}
              >
                Não homologado
              </button>
              <button
                type="button"
                disabled={transicao.isPending}
                onClick={() => finalizar(true)}
                className="px-4 py-2 rounded-md text-sm font-medium text-white disabled:opacity-50"
                style={{ background: 'var(--color-status-ok)' }}
              >
                {transicao.isPending ? 'Finalizando…' : 'Homologado'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
