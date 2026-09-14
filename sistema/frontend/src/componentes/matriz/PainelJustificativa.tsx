import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '@/contextos/AuthContext'
import { useJustificativasSugeridas, useSalvarNaBiblioteca } from '@/hooks/useHomologacao'
import { Icone } from '@/componentes/Icone'
import { META_STATUS } from '@/lib/tipos'
import type { StatusResultado, TipoGerenciamento } from '@/lib/tipos'

export interface EscolhaJustificativa {
  justificativaId: string | null
  justificativaTexto: string | null
}

function formatarDataHora(iso: string | Date): string {
  try {
    const d = typeof iso === 'string' ? new Date(iso) : iso
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

/**
 * O painel recebe o item solto em vez de um `Resultado` inteiro porque a matriz
 * carrega os resultados sem a relação `item` — ela já tem o catálogo à parte.
 */
interface Props {
  itemId: string
  itemNome: string
  justificativaIdAtual: string | null
  justificativaTextoAtual: string | null
  autorEmailAtual?: string | null
  atualizadoEmAtual?: string | null
  statusPretendido: StatusResultado
  gerenciamento: TipoGerenciamento
  androidMin: number | null
  /** Textos livres já usados nesta homologação — base para sugerir salvar na biblioteca */
  textosLivresUsados: string[]
  aoConfirmar: (escolha: EscolhaJustificativa) => Promise<void> | void
  aoCancelar: () => void
}

/**
 * Painel de justificativa (spec §10.4).
 *
 * Abre no momento em que o admin marca FALHA / NAO_SUPORTADO / COM_RESSALVA —
 * esses status exigem justificativa e o backend recusa o PUT sem ela (422).
 * Por isso o status só é salvo quando a justificativa é escolhida aqui.
 */
export function PainelJustificativa({
  itemId,
  itemNome,
  justificativaIdAtual,
  justificativaTextoAtual,
  autorEmailAtual,
  atualizadoEmAtual,
  statusPretendido,
  gerenciamento,
  androidMin,
  textosLivresUsados,
  aoConfirmar,
  aoCancelar,
}: Props) {
  const meta = META_STATUS[statusPretendido]
  const { usuario } = useAuth()
  const { data: sugeridas, isLoading } = useJustificativasSugeridas(
    itemId,
    gerenciamento,
    androidMin,
  )
  const salvarNaBiblioteca = useSalvarNaBiblioteca()

  const [selecionada, setSelecionada] = useState<string | null>(justificativaIdAtual)
  const [textoLivre, setTextoLivre] = useState(justificativaTextoAtual ?? '')
  const [modoTextoLivre, setModoTextoLivre] = useState(justificativaTextoAtual !== null)
  const [tituloBiblioteca, setTituloBiblioteca] = useState('')
  const [mostrarSalvar, setMostrarSalvar] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [avisoSucesso, setAvisoSucesso] = useState(false)
  const [registroInfo, setRegistroInfo] = useState<{ email: string | null; dataHora: string | null }>({
    email: autorEmailAtual ?? null,
    dataHora: atualizadoEmAtual ?? null,
  })

  const refDialogo = useRef<HTMLDivElement>(null)

  useEffect(() => {
    refDialogo.current?.focus()
  }, [])

  // "Se o texto livre já tiver sido escrito antes, sugerir salvar na biblioteca" (spec §10.4)
  const textoJaUsado = useMemo(() => {
    const t = textoLivre.trim()
    if (t.length < 20) return false
    return textosLivresUsados.filter((u) => u.trim() === t).length >= 1
  }, [textoLivre, textosLivresUsados])

  const podeConfirmar = modoTextoLivre ? textoLivre.trim().length > 0 : selecionada !== null

  async function confirmar() {
    if (!podeConfirmar || salvando) return
    setSalvando(true)
    setAvisoSucesso(false)
    try {
      const escolha = modoTextoLivre
        ? { justificativaId: null, justificativaTexto: textoLivre.trim() }
        : { justificativaId: selecionada, justificativaTexto: null }
      await aoConfirmar(escolha)
      setAvisoSucesso(true)
      setRegistroInfo({
        email: usuario?.email ?? registroInfo.email,
        dataHora: new Date().toISOString(),
      })
    } finally {
      setSalvando(false)
    }
  }

  async function salvarTextoNaBiblioteca() {
    const titulo = tituloBiblioteca.trim()
    if (!titulo || salvando) return
    setSalvando(true)
    try {
      const nova = await salvarNaBiblioteca.mutateAsync({
        titulo,
        texto: textoLivre.trim(),
        itensSugeridos: [itemId],
        androidMin,
        gerenciamento,
      })
      // Passa a usar a justificativa recém-criada, em vez do texto solto.
      await aoConfirmar({ justificativaId: nova.id, justificativaTexto: null })
      setAvisoSucesso(true)
      setRegistroInfo({
        email: usuario?.email ?? registroInfo.email,
        dataHora: new Date().toISOString(),
      })
      setMostrarSalvar(false)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6"
      style={{ background: 'rgba(15,15,18,.45)' }}
    >
      <div
        ref={refDialogo}
        role="dialog"
        aria-modal="true"
        aria-label={`Justificativa para ${itemNome}`}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation()
            aoCancelar()
          }
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            confirmar()
          }
        }}
        className="w-full sm:max-w-2xl max-h-[88vh] flex flex-col rounded-t-xl sm:rounded-xl border shadow-xl"
        style={{ background: 'var(--color-popover)' }}
      >
        {/* Cabeçalho */}
        <div className="p-5 border-b shrink-0 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span
                className="px-2 py-0.5 rounded-full text-xs font-semibold"
                style={{ background: meta.corSoft, color: meta.cor }}
              >
                {meta.rotulo}
              </span>
              <span className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>
                sai no certificado como {meta.noCertificado}
              </span>
            </div>
            <h2 className="mt-2 text-lg font-semibold">{itemNome}</h2>
            <p className="text-sm" style={{ color: 'var(--color-muted-foreground)' }}>
              {meta.descricao}
            </p>
          </div>
          <button
            type="button"
            onClick={aoCancelar}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            title="Fechar"
          >
            <Icone nome="x" className="h-5 w-5" />
          </button>
        </div>

        {/* Corpo */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {!modoTextoLivre && (
            <>
              <p className="label-caps">Justificativas sugeridas</p>

              {isLoading && (
                <p className="text-sm" style={{ color: 'var(--color-muted-foreground)' }}>
                  Carregando…
                </p>
              )}

              {!isLoading && sugeridas?.length === 0 && (
                <p className="text-sm" style={{ color: 'var(--color-muted-foreground)' }}>
                  Nenhuma justificativa da biblioteca se aplica a este item nesta versão de Android
                  e modelo de gerenciamento. Escreva um texto livre abaixo.
                </p>
              )}

              <div className="space-y-2">
                {sugeridas?.map((j) => (
                  <label
                    key={j.id}
                    className="flex gap-3 p-3 rounded-lg border cursor-pointer transition-colors"
                    style={{
                      borderColor:
                        selecionada === j.id ? 'var(--color-primary)' : 'var(--color-border)',
                      background:
                        selecionada === j.id ? 'var(--color-muted)' : 'transparent',
                    }}
                  >
                    <input
                      type="radio"
                      name="justificativa"
                      className="mt-1 shrink-0"
                      checked={selecionada === j.id}
                      onChange={() => {
                        setSelecionada(j.id)
                        if (avisoSucesso) setAvisoSucesso(false)
                      }}
                    />
                    <div className="min-w-0">
                      <p className="font-medium text-sm">{j.titulo}</p>
                      <p
                        className="mt-1 text-sm leading-relaxed"
                        style={{ color: 'var(--color-muted-foreground)' }}
                      >
                        {j.texto}
                      </p>
                      {j.usoCount > 0 && (
                        <p className="mt-1.5 text-xs" style={{ color: 'var(--color-muted-foreground)' }}>
                          usada {j.usoCount}×
                        </p>
                      )}
                    </div>
                  </label>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setModoTextoLivre(true)}
                className="text-sm font-medium underline underline-offset-2"
                style={{ color: 'var(--color-primary)' }}
              >
                Escrever um texto livre
              </button>
            </>
          )}

          {modoTextoLivre && (
            <>
              <div className="flex items-center justify-between">
                <p className="label-caps">Texto livre</p>
                <button
                  type="button"
                  onClick={() => setModoTextoLivre(false)}
                  className="text-sm underline underline-offset-2"
                  style={{ color: 'var(--color-primary)' }}
                >
                  Ver sugestões da biblioteca
                </button>
              </div>

              <textarea
                autoFocus
                rows={6}
                value={textoLivre}
                onChange={(e) => {
                  setTextoLivre(e.target.value)
                  if (avisoSucesso) setAvisoSucesso(false)
                }}
                placeholder="Explique tecnicamente por que o item não ficou OK. Este texto sai no certificado."
                className="w-full p-3 rounded-md border bg-transparent text-sm leading-relaxed resize-y"
                style={{ borderColor: 'var(--color-input)' }}
              />

              {textoJaUsado && !mostrarSalvar && (
                <div
                  className="p-3 rounded-lg text-sm flex items-start justify-between gap-3"
                  style={{ background: 'var(--color-info-soft)', color: 'var(--color-info-fg)' }}
                >
                  <span>Você já usou este mesmo texto em outro item. Salvar na biblioteca?</span>
                  <button
                    type="button"
                    onClick={() => setMostrarSalvar(true)}
                    className="shrink-0 font-medium underline underline-offset-2"
                  >
                    Salvar
                  </button>
                </div>
              )}

              {mostrarSalvar && (
                <div className="p-3 rounded-lg border space-y-2">
                  <label className="label-caps block">Título na biblioteca</label>
                  <input
                    autoFocus
                    value={tituloBiblioteca}
                    onChange={(e) => setTituloBiblioteca(e.target.value)}
                    placeholder="ex.: Device Admin depreciado — comandos de tela"
                    className="w-full px-3 py-2 rounded-md border bg-transparent text-sm"
                    style={{ borderColor: 'var(--color-input)' }}
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={!tituloBiblioteca.trim() || salvarNaBiblioteca.isPending}
                      onClick={salvarTextoNaBiblioteca}
                      className="px-3 py-1.5 rounded-md text-sm font-medium text-white disabled:opacity-50"
                      style={{ background: 'var(--gradient-brand-purple)' }}
                    >
                      {salvarNaBiblioteca.isPending ? 'Salvando…' : 'Salvar e aplicar'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setMostrarSalvar(false)}
                      className="px-3 py-1.5 rounded-md text-sm"
                      style={{ color: 'var(--color-muted-foreground)' }}
                    >
                      Agora não
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Aviso visual de justificativa registrada */}
          {avisoSucesso && (
            <div
              role="status"
              className="p-3 rounded-lg text-xs font-semibold flex items-center justify-between gap-2 border transition-all animate-in fade-in"
              style={{
                background: 'var(--color-success-soft, rgba(22, 163, 74, 0.1))',
                color: 'var(--color-success, #16a34a)',
                borderColor: 'rgba(22, 163, 74, 0.25)',
              }}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold">✓</span>
                <span>Justificativa registrada</span>
              </div>
              <span className="text-[10.5px] font-medium opacity-80">salva no banco</span>
            </div>
          )}
        </div>

        {/* Registro sutil de autoria (e-mail e horário) */}
        {(registroInfo.email || registroInfo.dataHora) && (
          <div
            className="px-5 py-2.5 text-[11px] flex items-center justify-between border-t border-dashed shrink-0"
            style={{
              background: 'var(--color-muted)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-muted-foreground)',
            }}
          >
            <span>
              Última atualização: <strong className="font-semibold text-foreground">{registroInfo.email || 'responsável'}</strong>
            </span>
            {registroInfo.dataHora && (
              <span>{formatarDataHora(registroInfo.dataHora)}</span>
            )}
          </div>
        )}

        {/* Rodapé */}
        <div className="p-5 border-t flex items-center justify-between gap-3 shrink-0">
          <p className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>
            <kbd className="font-mono">Esc</kbd> cancela ·{' '}
            <kbd className="font-mono">Ctrl+Enter</kbd> confirma
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={aoCancelar}
              className="px-4 py-2 rounded-md text-sm cursor-pointer hover:opacity-80 transition-opacity"
              style={{ color: 'var(--color-muted-foreground)' }}
            >
              {avisoSucesso ? 'Fechar' : 'Cancelar'}
            </button>
            <button
              type="button"
              onClick={confirmar}
              disabled={!podeConfirmar || salvando}
              className="px-4 py-2 rounded-md text-sm font-medium text-white disabled:opacity-50 cursor-pointer"
              style={{ background: 'var(--gradient-brand-purple)' }}
            >
              {salvando ? 'Salvando…' : avisoSucesso ? 'Salvar alterações' : `Aplicar ${meta.rotulo}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
