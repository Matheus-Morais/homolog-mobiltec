import { useState } from 'react'
import { useReabrir } from '@/hooks/useHomologacao'
import { ErroApi } from '@/lib/api'
import type { ColunaMatriz } from '@/lib/tipos'

/**
 * Reabre uma homologação finalizada (spec §11.4).
 *
 * O motivo é obrigatório (mín. 10 caracteres) e vira registro em
 * `log_reabertura` — mexer num resultado já atestado precisa deixar rastro.
 * Sem esta tela, "Finalizar" seria porta sem volta pela UI.
 */
export function ModalReabrir({
  coluna,
  homologacao,
  aoFechar,
  aoReabrir,
}: {
  coluna?: ColunaMatriz
  homologacao?: {
    id: string
    dispositivo: { nomeComercial: string }
    versaoAgente: string
    _count?: { certificados?: number }
  }
  aoFechar: () => void
  aoReabrir: () => void
}) {
  const h = coluna?.homologacao || homologacao
  const reabrir = useReabrir(h?.id)
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  if (!h) return null

  const curto = motivo.trim().length < 10

  function enviar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    reabrir.mutate(motivo.trim(), {
      onSuccess: aoReabrir,
      onError: (err) =>
        setErro(err instanceof ErroApi ? err.message : 'Não foi possível reabrir.'),
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15,15,18,.45)' }}
      onClick={aoFechar}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-label="Reabrir homologação"
        onSubmit={enviar}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && aoFechar()}
        className="w-full max-w-lg rounded-xl border shadow-xl"
        style={{ background: 'var(--color-popover)' }}
      >
        <div className="p-5 border-b">
          <h2 className="text-lg font-semibold">Reabrir homologação</h2>
          <p className="text-sm mt-0.5" style={{ color: 'var(--color-muted-foreground)' }}>
            {h.dispositivo.nomeComercial} · agente {h.versaoAgente}
          </p>
        </div>

        <div className="p-5 space-y-4">
          <div
            className="px-3 py-2.5 rounded-md text-sm"
            style={{ background: 'var(--color-warning-soft)', color: 'var(--color-warning-fg)' }}
          >
            Volta para rascunho e libera a edição. A reabertura fica registrada em log, com
            autor e motivo.
            {h._count?.certificados
              ? ` Já existem ${h._count.certificados} certificado(s) emitido(s) desta homologação — eles continuam válidos como estão.`
              : ''}
          </div>

          <div>
            <label className="label-caps block mb-1.5">
              Motivo <span style={{ color: 'var(--color-destructive)' }}>*</span>
            </label>
            <textarea
              autoFocus
              rows={3}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              className="w-full p-3 rounded-md border bg-transparent text-sm resize-y"
              style={{ borderColor: 'var(--color-input)' }}
            />
            <p className="mt-1 text-xs" style={{ color: 'var(--color-muted-foreground)' }}>
              Mínimo de 10 caracteres.
            </p>
          </div>

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

        <div className="p-5 border-t flex justify-end gap-2">
          <button
            type="button"
            onClick={aoFechar}
            className="px-4 py-2 rounded-md text-sm"
            style={{ color: 'var(--color-muted-foreground)' }}
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={curto || reabrir.isPending}
            className="px-4 py-2 rounded-md text-sm font-medium text-white disabled:opacity-50"
            style={{ background: 'var(--gradient-brand-purple)' }}
          >
            {reabrir.isPending ? 'Reabrindo…' : 'Reabrir'}
          </button>
        </div>
      </form>
    </div>
  )
}
