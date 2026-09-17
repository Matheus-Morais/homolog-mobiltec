import { useState, useMemo } from 'react'
import { useItensTeste } from '@/hooks/useTipoDispositivo'
import { useCriarBateria, useEditarBateria } from '@/hooks/useBateria'
import { GRUPO_ORDEM, ROTULO_GRUPO } from '@/lib/tipos'
import type { BateriaTeste, ItemTeste } from '@/lib/tipos'

interface ModalBateriaProps {
  categoriaId: string
  bateria?: BateriaTeste
  aoFechar: () => void
  aoSalvar?: () => void
}

export function ModalBateria({ categoriaId, bateria, aoFechar, aoSalvar }: ModalBateriaProps) {
  const { data: itensCatalogo } = useItensTeste()
  const criarBateria = useCriarBateria()
  const editarBateria = useEditarBateria()

  const [nome, setNome] = useState(bateria?.nome ?? '')
  const [descricao, setDescricao] = useState(bateria?.descricao ?? '')
  
  const [itensSelecionados, setItensSelecionados] = useState<Record<string, number>>(() => {
    if (!bateria?.itens) return {}
    const map: Record<string, number> = {}
    bateria.itens.forEach((i) => {
      map[i.itemId] = i.ordem
    })
    return map
  })

  const porGrupo = useMemo(() => {
    const mapa = new Map<string, ItemTeste[]>()
    for (const g of GRUPO_ORDEM) mapa.set(g, [])
    for (const item of itensCatalogo ?? []) {
      mapa.get(item.grupo)?.push(item)
    }
    return mapa
  }, [itensCatalogo])

  const alternarItem = (id: string) => {
    setItensSelecionados((prev) => {
      const next = { ...prev }
      if (next[id] !== undefined) {
        delete next[id]
      } else {
        const valoresOrdem = Object.values(next)
        const maxOrdem = valoresOrdem.length > 0 ? Math.max(...valoresOrdem) : 0
        next[id] = maxOrdem + 1
      }
      return next
    })
  }

  const mudarOrdem = (id: string, ordem: number) => {
    setItensSelecionados((prev) => ({ ...prev, [id]: Math.max(1, ordem) }))
  }

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nome.trim()) return

    const itensPayload = Object.entries(itensSelecionados).map(([itemId, ordem]) => ({
      itemId,
      ordem,
      obrigatorio: true,
    }))

    try {
      if (bateria) {
        await editarBateria.mutateAsync({
          id: bateria.id,
          nome: nome.trim(),
          descricao: descricao.trim() || null,
          itens: itensPayload,
        })
      } else {
        await criarBateria.mutateAsync({
          categoriaId,
          nome: nome.trim(),
          descricao: descricao.trim() || null,
          itens: itensPayload,
        })
      }
      
      aoSalvar?.()
      aoFechar()
    } catch (error) {
      console.error(error)
    }
  }

  const editando = !!bateria
  const totalSelecionados = Object.keys(itensSelecionados).length
  const salvando = criarBateria.isPending || editarBateria.isPending

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
        className="flex w-full max-w-2xl flex-col max-h-[90vh] rounded-xl border shadow-xl"
        style={{ background: 'var(--color-popover)' }}
      >
        <header className="px-6 py-4 border-b shrink-0">
          <h2 className="text-lg font-semibold">
            {editando ? 'Editar bateria' : 'Nova bateria de testes'}
          </h2>
        </header>

        <form onSubmit={salvar} className="flex flex-col min-h-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
            <div>
              <label className="label-caps mb-1.5 block">Nome da bateria *</label>
              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex: Padrão V1"
                required
                className="w-full rounded-md border bg-transparent px-3 py-2 text-sm"
                style={{ borderColor: 'var(--color-input)' }}
              />
            </div>
            <div>
              <label className="label-caps mb-1.5 block">Descrição</label>
              <textarea
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                rows={2}
                className="w-full rounded-md border bg-transparent px-3 py-2 text-sm"
                style={{ borderColor: 'var(--color-input)' }}
              />
            </div>

            <div className="space-y-4">
              <label className="label-caps block">Itens da Bateria</label>
              {GRUPO_ORDEM.map((grupo) => {
                const itensDoGrupo = porGrupo.get(grupo) ?? []
                if (itensDoGrupo.length === 0) return null
                
                return (
                  <div key={grupo} className="rounded-lg border overflow-hidden">
                    <div
                      className="px-3 py-2 text-sm font-semibold"
                      style={{ background: 'var(--gradient-brand-purple)', color: '#fff' }}
                    >
                      {ROTULO_GRUPO[grupo]}
                    </div>
                    <div className="p-2 space-y-1">
                      {itensDoGrupo.map((item) => {
                        const selecionado = itensSelecionados[item.id] !== undefined
                        return (
                          <label key={item.id} className="flex items-center gap-3 py-1.5 px-2 rounded cursor-pointer hover:bg-[var(--color-muted)]">
                            <input
                              type="checkbox"
                              checked={selecionado}
                              onChange={() => alternarItem(item.id)}
                            />
                            <span className="flex-1 text-sm select-none">{item.nome}</span>
                            {selecionado && (
                              <input
                                type="number"
                                min={1}
                                value={itensSelecionados[item.id]}
                                onChange={(e) => mudarOrdem(item.id, parseInt(e.target.value, 10) || 1)}
                                onClick={(e) => e.stopPropagation()}
                                className="w-16 rounded border px-2 py-1 text-xs"
                                style={{ borderColor: 'var(--color-input)' }}
                              />
                            )}
                          </label>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <footer
            className="shrink-0 border-t px-6 py-4 flex items-center justify-between"
            style={{ background: 'var(--color-sidebar)' }}
          >
            <span className="text-sm" style={{ color: 'var(--color-muted-foreground)' }}>
              {totalSelecionados} {totalSelecionados === 1 ? 'item selecionado' : 'itens selecionados'}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={aoFechar}
                className="rounded-md px-4 py-2 text-sm font-medium transition-colors hover:opacity-70"
                style={{ color: 'var(--color-muted-foreground)' }}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={!nome.trim() || totalSelecionados === 0 || salvando}
                className="rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 transition-colors"
                style={{ background: 'var(--gradient-brand-purple)' }}
              >
                {salvando ? 'Salvando...' : editando ? 'Salvar' : 'Criar bateria'}
              </button>
            </div>
          </footer>
        </form>
      </div>
    </div>
  )
}
