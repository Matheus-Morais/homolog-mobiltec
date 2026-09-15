import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ErroApi } from '@/lib/api'
import {
  useEditarTipo,
  useRemoverTipo,
  useTiposDispositivo,
  type ResumoEdicao,
  type TipoDispositivo,
} from '@/hooks/useTipoDispositivo'
import { Icone, iconeDaCategoria } from '@/componentes/Icone'
import { LoadingTela } from '@/componentes/LoadingTela'
import { LINHAS_FICHA } from '@/lib/tipos'
import type { BateriaTeste } from '@/lib/tipos'
import { useBaterias } from '@/hooks/useBateria'
import { ModalBateria } from '@/componentes/tipo/ModalBateria'
/**
 * Editar / remover tipo de dispositivo.
 *
 * A outra metade do registro: aqui o técnico vê o que já existe, corrige a
 * ficha ou a bateria de um tipo, tira de operação o que não se usa mais e apaga
 * o que nasceu por engano.
 *
 * Apagar e desativar não são a mesma coisa, e a diferença não é de gosto: um
 * tipo com modelos cadastrados carrega homologações e certificados emitidos
 * atrás dele. Esse se desativa — some do menu, o histórico continua de pé. Só o
 * tipo vazio pode ser apagado de fato, e o backend é quem cobra isso.
 */
export function GerenciarTipos() {
  const navegar = useNavigate()
  const localizacao = useLocation()
  const { data: tipos, isLoading } = useTiposDispositivo()
  const { data: todasBaterias } = useBaterias()
  const editar = useEditarTipo()
  const remover = useRemoverTipo()

  const [erro, setErro] = useState<string | null>(null)
  const [confirmando, setConfirmando] = useState<TipoDispositivo | null>(null)
  const [modalBateria, setModalBateria] = useState<{ categoriaId: string; bateria?: BateriaTeste } | null>(null)

  /** O que a última edição fez, entregue pelo formulário ao voltar para cá */
  const recado = localizacao.state as { resumo?: ResumoEdicao; nome?: string } | null
  const [resumoAberto, setResumoAberto] = useState(true)

  async function alternarAtivo(tipo: TipoDispositivo) {
    setErro(null)
    try {
      await editar.mutateAsync({ id: tipo.id, ativo: !tipo.ativo })
    } catch (err) {
      setErro(err instanceof ErroApi ? err.message : 'Não foi possível mudar a situação do tipo.')
    }
  }

  async function apagar(tipo: TipoDispositivo) {
    setErro(null)
    try {
      await remover.mutateAsync(tipo.id)
      setConfirmando(null)
    } catch (err) {
      setConfirmando(null)
      setErro(err instanceof ErroApi ? err.message : 'Não foi possível apagar o tipo.')
    }
  }

  if (isLoading) {
    return <LoadingTela mensagem="Carregando tipos de dispositivo…" />
  }

  return (
    <div className="h-full overflow-y-auto px-8 py-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Editar / remover dispositivo</h2>
            <p className="mt-1 text-sm" style={{ color: 'var(--color-muted-foreground)' }}>
              Os tipos que existem hoje, com a ficha e a bateria de cada um. Tipo com modelo
              cadastrado se desativa — apagar levaria junto as homologações e os certificados
              emitidos.
            </p>
          </div>
          <Link
            to="/registro"
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg border text-xs font-semibold transition-all hover:opacity-80 active:scale-95 shadow-xs"
            style={{
              background: 'var(--color-muted)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-primary)',
            }}
          >
            <span className="text-sm font-bold leading-none">+</span>
            <span>Registrar dispositivo</span>
          </Link>
        </header>

        {erro && (
          <div
            role="alert"
            className="rounded-md px-3 py-2.5 text-sm"
            style={{
              background: 'var(--color-destructive-soft)',
              color: 'var(--color-destructive-fg)',
            }}
          >
            {erro}
          </div>
        )}

        {recado?.resumo && resumoAberto && (
          <ResumoDaEdicao
            nome={recado.nome ?? 'tipo'}
            resumo={recado.resumo}
            aoFechar={() => setResumoAberto(false)}
          />
        )}

        <div className="space-y-2">
          {(tipos ?? []).map((tipo) => {
            // Ficha vazia é herança das categorias anteriores ao registro e
            // significa "a ficha inteira" — mostrar "0 linhas" seria mentira.
            const linhas = tipo.camposFicha.length || LINHAS_FICHA.length
            return (
              <div
                key={tipo.id}
                data-tipo={tipo.slug}
                className="flex flex-col gap-3 rounded-lg border px-4 py-3"
                style={{
                  background: 'var(--color-card)',
                  opacity: tipo.ativo ? 1 : 0.62,
                }}
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-md"
                    style={{ background: 'var(--gradient-brand-purple)', color: '#fff' }}
                  >
                    <Icone nome={iconeDaCategoria(tipo.icone)} className="h-[18px] w-[18px]" />
                  </span>

                  <div className="min-w-40 flex-1">
                    <p className="flex items-center gap-2 text-sm font-semibold">
                      {tipo.nome}
                      {!tipo.ativo && (
                        <span
                          className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase"
                          style={{
                            background: 'var(--color-muted)',
                            color: 'var(--color-muted-foreground)',
                          }}
                        >
                          fora de operação
                        </span>
                      )}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>
                      {tipo.dispositivos} {tipo.dispositivos === 1 ? 'modelo' : 'modelos'} ·{' '}
                      {linhas} {linhas === 1 ? 'linha' : 'linhas'} na ficha ·{' '}
                      <code>/matriz/{tipo.slug}</code>
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <Acao rotulo="Planilha" aoClicar={() => navegar(`/matriz/${tipo.slug}`)} />
                    <Acao rotulo="Editar" aoClicar={() => navegar(`/registro/tipos/${tipo.id}`)} />
                    <Acao
                      rotulo={tipo.ativo ? 'Desativar' : 'Reativar'}
                      aoClicar={() => alternarAtivo(tipo)}
                    />
                    <Acao
                      rotulo="Apagar"
                      perigo
                      desabilitado={tipo.dispositivos > 0}
                      titulo={
                        tipo.dispositivos > 0
                          ? `"${tipo.nome}" tem ${tipo.dispositivos} modelo(s) — desative em vez de apagar`
                          : 'Apagar este tipo, que não tem modelo nenhum'
                      }
                      aoClicar={() => setConfirmando(tipo)}
                    />
                  </div>
                </div>

                <div className="border-t pt-3 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <h4 className="label-caps">Baterias de Teste</h4>
                    <button
                      type="button"
                      onClick={() => setModalBateria({ categoriaId: tipo.id })}
                      className="text-xs font-semibold hover:underline"
                      style={{ color: 'var(--color-primary)' }}
                    >
                      + Nova bateria
                    </button>
                  </div>
                  
                  <div className="grid gap-2 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                    {(todasBaterias?.filter(b => b.categoriaId === tipo.id) ?? []).map(bateria => {
                      const qtdItens = bateria._count?.itens ?? bateria.itens?.length ?? 0
                      return (
                        <div
                          key={bateria.id}
                          className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                          style={{
                            background: 'var(--color-sidebar)',
                            borderColor: 'var(--color-border)',
                            opacity: bateria.ativo ? 1 : 0.6
                          }}
                        >
                          <div>
                            <p className="font-semibold">{bateria.nome}</p>
                            <p className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>
                              {qtdItens} {qtdItens === 1 ? 'item' : 'itens'}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setModalBateria({ categoriaId: tipo.id, bateria })}
                            className="text-xs font-medium hover:underline"
                            style={{ color: 'var(--color-muted-foreground)' }}
                          >
                            Editar
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {confirmando && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(15,15,18,.45)' }}
          onClick={() => setConfirmando(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-xl border p-5 shadow-xl"
            style={{ background: 'var(--color-popover)' }}
          >
            <h3 className="text-base font-semibold">Apagar "{confirmando.nome}"?</h3>
            <p className="mt-2 text-sm" style={{ color: 'var(--color-muted-foreground)' }}>
              O tipo e a bateria dele saem do banco. Os itens de teste ficam — eles são catálogo
              compartilhado com os outros tipos. Não há como desfazer.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmando(null)}
                className="rounded-md px-4 py-2 text-sm"
                style={{ color: 'var(--color-muted-foreground)' }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => apagar(confirmando)}
                disabled={remover.isPending}
                className="rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: 'var(--color-destructive)' }}
              >
                {remover.isPending ? 'Apagando…' : 'Apagar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modalBateria && (
        <ModalBateria
          categoriaId={modalBateria.categoriaId}
          bateria={modalBateria.bateria}
          aoFechar={() => setModalBateria(null)}
        />
      )}
    </div>
  )
}

/**
 * O que a edição fez, dito na volta.
 *
 * Existe por causa de um caso concreto: a tela voltava calada, e não dava para
 * distinguir uma edição que salvou de uma que não salvou. O aviso também é
 * onde se diz que resultado de item retirado não foi jogado fora.
 */
function ResumoDaEdicao({
  nome,
  resumo,
  aoFechar,
}: {
  nome: string
  resumo: ResumoEdicao
  aoFechar: () => void
}) {
  const { adicionados, removidos, preservados } = resumo
  const mudou = adicionados > 0 || removidos > 0

  return (
    <div
      role="status"
      className="rounded-lg border px-4 py-3 text-sm"
      style={{ background: 'var(--color-sidebar)', borderColor: 'var(--color-primary)' }}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <p className="font-semibold">"{nome}" salvo.</p>

          <p className="mt-1" style={{ color: 'var(--color-muted-foreground)' }}>
            {mudou ? (
              <>
                {adicionados > 0 &&
                  `${adicionados} ${adicionados === 1 ? 'item entrou' : 'itens entraram'} na bateria`}
                {adicionados > 0 && removidos > 0 && ' · '}
                {removidos > 0 &&
                  `${removidos} ${removidos === 1 ? 'item saiu' : 'itens saíram'} da bateria`}
                .
              </>
            ) : (
              'A bateria e a ficha ficaram como estavam.'
            )}
          </p>

          {preservados.length > 0 && (
            <div
              className="mt-2 rounded-md px-3 py-2"
              style={{ background: 'var(--color-card)' }}
            >
              <p className="font-medium">
                {preservados.length === 1
                  ? 'Uma linha saiu com avaliação registrada'
                  : `${preservados.length} linhas saíram com avaliação registrada`}
                :
              </p>
              <p className="mt-0.5" style={{ color: 'var(--color-muted-foreground)' }}>
                {preservados.join(', ')} — o que já estava preenchido ficou guardado e volta
                inteiro se você remarcar o item. Nada foi apagado.
              </p>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={aoFechar}
          aria-label="Fechar aviso"
          className="shrink-0 px-1 hover:opacity-70"
          style={{ color: 'var(--color-muted-foreground)' }}
        >
          ✕
        </button>
      </div>
    </div>
  )
}

function Acao({
  rotulo,
  aoClicar,
  perigo,
  desabilitado,
  titulo,
}: {
  rotulo: string
  aoClicar: () => void
  perigo?: boolean
  desabilitado?: boolean
  titulo?: string
}) {
  return (
    <button
      type="button"
      onClick={aoClicar}
      disabled={desabilitado}
      title={titulo}
      data-acao={rotulo}
      className="rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors hover:opacity-70 disabled:opacity-40"
      style={{
        color: perigo ? 'var(--color-destructive-fg)' : 'var(--color-muted-foreground)',
        borderColor: perigo ? 'var(--color-destructive-soft)' : 'var(--color-border)',
      }}
    >
      {rotulo}
    </button>
  )
}
