import { useState } from 'react'
import { useAbrirReteste } from '@/hooks/useMatriz'
import { ErroApi } from '@/lib/api'
import type { ColunaMatriz } from '@/lib/tipos'

interface Props {
  coluna: ColunaMatriz
  aoFechar: () => void
  aoCriar: () => void
}

/**
 * Abre uma nova homologação para um modelo já cadastrado.
 *
 * Reteste **nunca** sobrescreve (spec §11.2): o histórico por versão de agente
 * é informação de valor. A ficha é copiada da homologação anterior e os
 * resultados nascem todos em "não testado" — a coluna da matriz passa a mostrar
 * a nova, e a antiga vira histórico.
 */
export function ModalReteste({ coluna, aoFechar, aoCriar }: Props) {
  const reteste = useAbrirReteste()
  const [erro, setErro] = useState<string | null>(null)

  const atual = coluna.homologacao
  const [versaoAgente, setVersaoAgente] = useState('')
  const [versaoSo, setVersaoSo] = useState(atual.versaoSo)
  const [dataInicio, setDataInicio] = useState(new Date().toISOString().slice(0, 10))

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    try {
      await reteste.mutateAsync({
        dispositivoId: atual.dispositivoId,
        baseHomologacaoId: atual.id,
        versaoAgente: versaoAgente.trim(),
        versaoSo: versaoSo.trim(),
        dataInicio,
      })
      aoCriar()
    } catch (err) {
      setErro(err instanceof ErroApi ? err.message : 'Não foi possível abrir o reteste.')
    }
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
        aria-label="Abrir reteste"
        onSubmit={enviar}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && aoFechar()}
        className="w-full max-w-md rounded-xl border shadow-xl"
        style={{ background: 'var(--color-popover)' }}
      >
        <div className="p-5 border-b">
          <h2 className="text-lg font-semibold">Abrir reteste</h2>
          <p className="text-sm mt-0.5" style={{ color: 'var(--color-muted-foreground)' }}>
            {atual.dispositivo.nomeComercial} — hoje na versão {atual.versaoAgente}
          </p>
        </div>

        <div className="p-5 space-y-4">
          <p
            className="text-xs px-3 py-2 rounded-md"
            style={{ background: 'var(--color-info-soft)', color: 'var(--color-info-fg)' }}
          >
            A homologação atual vira histórico e continua acessível — nada é sobrescrito. A
            coluna passa a mostrar o reteste, com todos os itens em "não testado".
          </p>

          <div>
            <label className="label-caps block mb-1.5">
              Nova versão do agente <span style={{ color: 'var(--color-destructive)' }}>*</span>
            </label>
            <input
              required
              autoFocus
              value={versaoAgente}
              onChange={(e) => setVersaoAgente(e.target.value)}
              className="w-full px-3 py-2 rounded-md border bg-transparent text-sm"
              style={{ borderColor: 'var(--color-input)' }}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label-caps block mb-1.5">Versão do SO</label>
              <input
                value={versaoSo}
                onChange={(e) => setVersaoSo(e.target.value)}
                className="w-full px-3 py-2 rounded-md border bg-transparent text-sm"
                style={{ borderColor: 'var(--color-input)' }}
              />
            </div>
            <div>
              <label className="label-caps block mb-1.5">Data de início</label>
              <input
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
                className="w-full px-3 py-2 rounded-md border bg-transparent text-sm"
                style={{ borderColor: 'var(--color-input)' }}
              />
            </div>
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
            disabled={reteste.isPending}
            className="px-4 py-2 rounded-md text-sm font-medium text-white disabled:opacity-50"
            style={{ background: 'var(--gradient-brand-purple)' }}
          >
            {reteste.isPending ? 'Abrindo…' : 'Abrir reteste'}
          </button>
        </div>
      </form>
    </div>
  )
}
