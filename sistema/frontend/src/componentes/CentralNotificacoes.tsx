import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Icone } from './Icone'
import {
  useNotificacoes,
  useConfirmarNotificacao,
  useMarcarNotificacaoLida,
  useMarcarTodasLidas,
} from '@/hooks/useNotificacoes'
import type { Notificacao } from '@/lib/tipos'

export function CentralNotificacoes() {
  const [aberto, setAberto] = useState(false)
  const refBotao = useRef<HTMLButtonElement>(null)
  const refPainel = useRef<HTMLDivElement>(null)

  const { data, isLoading } = useNotificacoes()
  const confirmar = useConfirmarNotificacao()
  const marcarLida = useMarcarNotificacaoLida()
  const marcarTodasLidas = useMarcarTodasLidas()

  const notificacoes = data?.notificacoes ?? []
  const naoLidas = data?.naoLidas ?? 0
  const pendentesConfirmacao = data?.pendentesConfirmacao ?? 0
  const totalAlerta = pendentesConfirmacao > 0 ? pendentesConfirmacao : naoLidas

  // Fechar ao clicar fora ou teclar Escape
  useEffect(() => {
    if (!aberto) return
    const fechar = (e: MouseEvent) => {
      const alvo = e.target as Node
      if (refBotao.current?.contains(alvo) || refPainel.current?.contains(alvo)) return
      setAberto(false)
    }
    const aoTeclar = (e: KeyboardEvent) => e.key === 'Escape' && setAberto(false)
    document.addEventListener('mousedown', fechar)
    document.addEventListener('keydown', aoTeclar)
    return () => {
      document.removeEventListener('mousedown', fechar)
      document.removeEventListener('keydown', aoTeclar)
    }
  }, [aberto])

  function formatarData(iso: string) {
    try {
      const d = new Date(iso)
      return d.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return ''
    }
  }

  return (
    <div className="relative">
      <button
        ref={refBotao}
        type="button"
        onClick={() => setAberto((v) => !v)}
        title={totalAlerta > 0 ? `${totalAlerta} aviso(s) e atualizações` : 'Notificações'}
        aria-expanded={aberto}
        aria-label="Abrir central de notificações"
        className="relative grid h-8 w-8 place-items-center rounded-lg transition-all duration-150 outline-none hover:bg-black/[0.04] focus:outline-none focus-visible:outline-none"
        style={{ color: 'var(--color-muted-foreground)' }}
      >
        <Icone nome="sino" className="h-[18px] w-[18px]" />
        {totalAlerta > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white shadow-xs"
            style={{
              background: pendentesConfirmacao > 0 ? '#b45309' : 'var(--gradient-brand-purple)',
            }}
          >
            {totalAlerta > 9 ? '9+' : totalAlerta}
          </span>
        )}
      </button>

      {aberto && (
        <div
          ref={refPainel}
          role="dialog"
          aria-label="Notificações"
          className="fixed right-4 top-14 z-50 w-96 max-w-[calc(100vw-2rem)] rounded-2xl border shadow-xl bg-white animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[80vh]"
          style={{
            background: 'var(--color-popover)',
            borderColor: 'var(--color-border)',
            color: 'var(--color-foreground)',
          }}
        >
          {/* Topo do Card de Notificações */}
          <div className="flex items-center justify-between border-b px-4 py-3 shrink-0">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm tracking-tight">Atualizações & Avisos</span>
              {pendentesConfirmacao > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                  {pendentesConfirmacao} aguardando confirmação
                </span>
              )}
            </div>

            {naoLidas > 0 && (
              <button
                type="button"
                onClick={() => marcarTodasLidas.mutate()}
                disabled={marcarTodasLidas.isPending}
                className="text-[11px] font-medium text-[var(--color-primary)] hover:underline cursor-pointer"
              >
                Marcar lidas
              </button>
            )}
          </div>

          {/* Lista de Notificações */}
          <div className="overflow-y-auto flex-1 p-2 divide-y divide-[var(--color-border)]">
            {isLoading ? (
              <div className="py-8 text-center text-xs text-[var(--color-muted-foreground)]">
                Carregando notificações…
              </div>
            ) : notificacoes.length === 0 ? (
              <div className="py-8 text-center text-xs text-[var(--color-muted-foreground)]">
                Nenhuma notificação recente.
              </div>
            ) : (
              notificacoes.map((item) => (
                <ItemNotificacao
                  key={item.id}
                  item={item}
                  aoConfirmar={() => confirmar.mutate(item.id)}
                  confirmando={confirmar.isPending}
                  aoMarcarLida={() => !item.lida && marcarLida.mutate(item.id)}
                  aoNavegar={() => setAberto(false)}
                  formatarData={formatarData}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ItemNotificacao({
  item,
  aoConfirmar,
  confirmando,
  aoMarcarLida,
  aoNavegar,
  formatarData,
}: {
  item: Notificacao
  aoConfirmar: () => void
  confirmando: boolean
  aoMarcarLida: () => void
  aoNavegar: () => void
  formatarData: (d: string) => string
}) {
  const ehRevisao = item.tipo === 'REVISAO'
  const ehAprovado = item.tipo === 'APROVADO'

  return (
    <article
      onClick={aoMarcarLida}
      className={`p-3 rounded-xl transition-colors space-y-2 text-xs ${
        !item.lida ? 'bg-purple-50/40' : 'hover:bg-black/[0.02]'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className="h-2 w-2 rounded-full shrink-0"
            style={{
              background: ehRevisao ? '#d97706' : ehAprovado ? '#16a34a' : 'var(--color-primary)',
            }}
          />
          <h4 className="font-semibold truncate text-[12.5px] text-[var(--color-foreground)]">
            {item.titulo}
          </h4>
        </div>
        <span className="text-[10px] text-[var(--color-muted-foreground)] shrink-0">
          {formatarData(item.criadoEm)}
        </span>
      </div>

      <p
        className="leading-relaxed text-[12px] whitespace-pre-wrap pl-3 border-l-2 font-medium"
        style={{
          color: 'var(--color-foreground)',
          borderColor: 'var(--color-primary)',
        }}
      >
        {item.mensagem}
      </p>

      {/* Ações e Confirmação */}
      <div className="flex items-center justify-between gap-2 pt-1">
        <div>
          {ehRevisao && (
            item.confirmada ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                <span>✓</span>
                <span>Confirmado por {item.confirmadaPor || 'Parceiro'}</span>
              </span>
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  aoConfirmar()
                }}
                disabled={confirmando}
                className="px-2.5 py-1 rounded-md text-[11px] font-semibold text-white transition-all hover:opacity-90 shadow-2xs inline-flex items-center gap-1 cursor-pointer"
                style={{ background: '#b45309' }}
              >
                <span>✓</span>
                <span>Confirmar recebimento</span>
              </button>
            )
          )}
        </div>

        {item.link && (
          <Link
            to={item.link}
            onClick={aoNavegar}
            className="text-[11px] font-semibold text-[var(--color-primary)] hover:underline ml-auto"
          >
            Acessar →
          </Link>
        )}
      </div>
    </article>
  )
}
