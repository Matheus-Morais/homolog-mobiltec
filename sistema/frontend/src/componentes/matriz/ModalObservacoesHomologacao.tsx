import { useState, useRef, useMemo } from 'react'
import { META_STATUS, ehSomenteLeitura } from '@/lib/tipos'
import type { ColunaMatriz, ItemTeste, ItemObservacaoGeral, AnexoObservacao } from '@/lib/tipos'
import { useAuth } from '@/contextos/AuthContext'
import { api, ErroApi } from '@/lib/api'
import { Icone } from '@/componentes/Icone'

/**
 * Identifica notas geradas pela importação automática da planilha legada.
 */
const ehNotaDaImportacao = (texto: string) =>
  /planilha de origem|planilha:|na planilha|Planilha:/i.test(texto)

function formatarTamanho(bytes?: number): string {
  if (!bytes || bytes <= 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatarDataHora(iso: string): string {
  try {
    const d = new Date(iso)
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
 * Caderno de Observações da Homologação.
 *
 * Suporta:
 * 1. Observações Gerais estruturadas com Título, Conteúdo, Prints (colar com Ctrl+V) e Anexos (.zip e imagens).
 * 2. Anotações por Funcionalidade (célula a célula).
 * 3. Download de logs/anexos e visualização ampliada de imagens.
 * 4. Bloqueio de edição para parceiro quando em validação ou finalizado.
 */
export function ModalObservacoesHomologacao({
  coluna,
  itens,
  salvando,
  aoSalvar,
  aoFechar,
}: {
  coluna: ColunaMatriz
  itens: ItemTeste[]
  salvando: boolean
  aoSalvar: (texto: string) => void
  aoFechar: () => void
}) {
  const { usuario, ehParceiro } = useAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Status de somente-leitura (ex: em validação, em revisão ou aprovado para parceiro)
  const somenteLeitura = ehSomenteLeitura(coluna.homologacao.status, usuario?.papel)

  // Parse inicial das observações gerais
  const observacoesIniciais = useMemo<ItemObservacaoGeral[]>(() => {
    const cru = coluna.homologacao.observacoes?.trim()
    if (!cru) return []
    if (cru.startsWith('[')) {
      try {
        const parsed = JSON.parse(cru)
        if (Array.isArray(parsed)) return parsed as ItemObservacaoGeral[]
      } catch {
        /* fallback para texto simples */
      }
    }
    // Formato legado: texto plano vira uma observação geral
    return [
      {
        id: 'legado-1',
        titulo: 'Observação Geral',
        texto: cru,
        autorNome: coluna.homologacao.responsavel?.nome ?? 'Técnico',
        criadoEm: coluna.homologacao.criadoEm,
        anexos: [],
      },
    ]
  }, [coluna.homologacao.observacoes, coluna.homologacao.responsavel?.nome, coluna.homologacao.criadoEm])

  const [listaObservacoes, setListaObservacoes] = useState<ItemObservacaoGeral[]>(observacoesIniciais)
  const [novoTitulo, setNovoTitulo] = useState('')
  const [novoTexto, setNovoTexto] = useState('')
  const [anexosPendentes, setAnexosPendentes] = useState<AnexoObservacao[]>([])
  const [fazendoUpload, setFazendoUpload] = useState(false)
  const [erroUpload, setErroUpload] = useState<string | null>(null)
  const [imagemAmpliada, setImagemAmpliada] = useState<{ url: string; nome: string } | null>(null)

  const emailResponsavel = (coluna.homologacao.responsavel as any)?.email || usuario?.email || 'contato@mobiltec.com.br'
  const dataPadrao = coluna.homologacao.atualizadoEm || coluna.homologacao.criadoEm

  // Anotações célula a célula da homologação
  const anotacoes = itens
    .map((item) => ({ item, r: coluna.homologacao.resultadosPorItem[item.id] }))
    .filter(({ r }) => r?.observacao?.trim() && !ehNotaDaImportacao(r.observacao!))
    .map(({ item, r }) => ({
      item: item.nome,
      status: r!.status,
      texto: r!.observacao!.trim(),
      autorEmail: (r as any)?.autorEmail || emailResponsavel,
      atualizadoEm: (r as any)?.atualizadoEm || dataPadrao,
    }))

  async function processarArquivo(arquivo: File) {
    setErroUpload(null)
    const ext = arquivo.name.slice(arquivo.name.lastIndexOf('.')).toLowerCase()

    if (
      arquivo.type.startsWith('video/') ||
      ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.flv', '.wmv'].includes(ext)
    ) {
      setErroUpload('Vídeos não serão permitidos neste momento.')
      return
    }

    const permitido =
      arquivo.type.startsWith('image/') ||
      ['.png', '.jpg', '.jpeg', '.webp', '.zip'].includes(ext) ||
      arquivo.type === 'application/zip' ||
      arquivo.type === 'application/x-zip-compressed'

    if (!permitido) {
      setErroUpload('Formato não suportado. Envie arquivos .zip ou imagens (PNG, JPEG, WebP).')
      return
    }

    setFazendoUpload(true)
    try {
      const formData = new FormData()
      formData.append('arquivo', arquivo)
      const res = await api.postMultipart<AnexoObservacao>('/upload/anexo', formData)
      setAnexosPendentes((prev) => [...prev, res])
    } catch (err) {
      setErroUpload(err instanceof ErroApi ? err.message : 'Falha ao enviar arquivo.')
    } finally {
      setFazendoUpload(false)
    }
  }

  function aoColar(e: React.ClipboardEvent) {
    if (somenteLeitura) return
    const items = e.clipboardData?.items
    if (!items) return

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (file) {
          e.preventDefault()
          processarArquivo(file)
          break
        }
      }
    }
  }

  function removerAnexoPendente(index: number) {
    setAnexosPendentes((prev) => prev.filter((_, i) => i !== index))
  }

  function adicionarObservacao() {
    if (!novoTitulo.trim() || !novoTexto.trim()) return
    const nova: ItemObservacaoGeral = {
      id: crypto.randomUUID ? crypto.randomUUID() : `obs-${Date.now()}`,
      titulo: novoTitulo.trim(),
      texto: novoTexto.trim(),
      autorId: usuario?.id,
      autorNome: usuario?.nome ?? 'Usuário',
      autorPapel: usuario?.papel,
      autorEmail: usuario?.email,
      criadoEm: new Date().toISOString(),
      anexos: anexosPendentes,
    }

    const novaLista = [nova, ...listaObservacoes]
    setListaObservacoes(novaLista)
    setNovoTitulo('')
    setNovoTexto('')
    setAnexosPendentes([])
    setErroUpload(null)

    // Persiste imediatamente no backend
    aoSalvar(JSON.stringify(novaLista))
  }

  function excluirObservacao(id: string) {
    if (somenteLeitura) return
    const novaLista = listaObservacoes.filter((o) => o.id !== id)
    setListaObservacoes(novaLista)
    aoSalvar(JSON.stringify(novaLista))
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15,15,18,.5)' }}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && !imagemAmpliada) aoFechar()
        }}
        className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl border shadow-2xl overflow-hidden"
        style={{ background: 'var(--color-popover)', borderColor: 'var(--color-border)' }}
      >
        {/* Cabeçalho */}
        <div className="border-b p-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Observações da Homologação</h2>
            <p className="mt-0.5 text-sm" style={{ color: 'var(--color-muted-foreground)' }}>
              {coluna.homologacao.dispositivo.nomeComercial} · {coluna.homologacao.dispositivo.fabricante} {coluna.homologacao.dispositivo.modelo}
            </p>
          </div>
          <button
            type="button"
            onClick={aoFechar}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground transition-colors"
            title="Fechar (Esc)"
          >
            <Icone nome="x" className="h-5 w-5" />
          </button>
        </div>

        {/* Corpo rolável */}
        <div className="min-h-0 flex-1 overflow-y-auto p-5 space-y-6">
          {somenteLeitura && (
            <div
              className="rounded-lg p-3 text-xs leading-relaxed flex items-center gap-2"
              style={{ background: 'var(--color-info-soft)', color: 'var(--color-info-fg)' }}
            >
              <Icone nome="relogio" className="h-4 w-4 shrink-0" />
              <span>
                Homologação encaminhada para validação ou concluída. As observações estão em modo de visualização somente-leitura.
              </span>
            </div>
          )}

          {/* Formulário: Nova Observação Geral (apenas se editável) */}
          {!somenteLeitura && (
            <div
              className="rounded-xl border p-4 shadow-xs"
              style={{ background: 'var(--color-card)', borderColor: 'var(--color-border)' }}
              onPaste={aoColar}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="label-caps font-semibold text-xs text-foreground">
                  Nova Observação Geral
                </span>
                <span className="text-[11px] text-muted-foreground">
                  Cole prints com <kbd className="font-mono bg-muted px-1 py-0.5 rounded text-[10px]">Ctrl+V</kbd>
                </span>
              </div>

              <div className="space-y-3">
                <div>
                  <input
                    type="text"
                    value={novoTitulo}
                    onChange={(e) => setNovoTitulo(e.target.value)}
                    placeholder="Título da observação (ex.: Problema na instalação do dispositivo)"
                    className="w-full px-3 py-2 text-sm rounded-md border bg-transparent text-foreground outline-none focus:ring-1 focus:ring-primary"
                    style={{ borderColor: 'var(--color-input)' }}
                  />
                </div>

                <div>
                  <textarea
                    rows={3}
                    value={novoTexto}
                    onChange={(e) => setNovoTexto(e.target.value)}
                    placeholder="Descreva a falha ou comportamento observado... Você pode colar imagens (Ctrl+V) ou anexar arquivos .zip e fotos abaixo."
                    className="w-full resize-y px-3 py-2 text-sm rounded-md border bg-transparent text-foreground leading-relaxed outline-none focus:ring-1 focus:ring-primary"
                    style={{ borderColor: 'var(--color-input)' }}
                  />
                </div>

                {/* Feedback de erro */}
                {erroUpload && (
                  <div
                    className="p-2 rounded-md text-xs font-medium"
                    style={{ background: 'var(--color-destructive-soft)', color: 'var(--color-destructive-fg)' }}
                  >
                    {erroUpload}
                  </div>
                )}

                {/* Lista de anexos pendentes */}
                {anexosPendentes.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {anexosPendentes.map((anexo, idx) => (
                      <div
                        key={anexo.url}
                        className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs bg-muted/60"
                        style={{ borderColor: 'var(--color-border)' }}
                      >
                        {anexo.tipo === 'imagem' ? (
                          <img
                            src={anexo.url}
                            alt={anexo.nome}
                            className="h-7 w-7 rounded object-cover border"
                          />
                        ) : (
                          <span className="font-mono text-base">📦</span>
                        )}
                        <span className="max-w-[160px] truncate font-medium" title={anexo.nome}>
                          {anexo.nome}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {formatarTamanho(anexo.tamanho)}
                        </span>
                        <button
                          type="button"
                          onClick={() => removerAnexoPendente(idx)}
                          className="text-muted-foreground hover:text-destructive transition-colors ml-1"
                          title="Remover anexo"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Barra de Ações do Formulário */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="flex items-center gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept="image/png,image/jpeg,image/webp,.zip,application/zip"
                      className="hidden"
                      onChange={(e) => {
                        const files = e.target.files
                        if (files && files.length > 0) {
                          Array.from(files).forEach(processarArquivo)
                        }
                        e.target.value = ''
                      }}
                    />
                    <button
                      type="button"
                      disabled={fazendoUpload}
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium text-foreground bg-transparent hover:bg-muted transition-colors disabled:opacity-50 cursor-pointer"
                      style={{ borderColor: 'var(--color-input)' }}
                    >
                      <Icone nome="anexo" className="h-3.5 w-3.5" />
                      <span>{fazendoUpload ? 'Enviando…' : 'Anexar .zip ou imagem'}</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    disabled={!novoTitulo.trim() || !novoTexto.trim() || fazendoUpload || salvando}
                    onClick={adicionarObservacao}
                    className="px-4 py-1.5 rounded-md text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-45 shadow-xs cursor-pointer"
                    style={{ background: 'var(--gradient-brand-purple)' }}
                  >
                    {salvando ? 'Salvando…' : 'Adicionar observação'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Lista de Observações Gerais salvas */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <p className="label-caps text-xs font-semibold text-foreground">
                Observações Gerais
                <span className="ml-1.5 font-normal opacity-60">({listaObservacoes.length})</span>
              </p>
            </div>

            {listaObservacoes.length === 0 ? (
              <p className="text-sm rounded-lg border border-dashed p-4 text-center text-muted-foreground">
                Nenhuma observação geral registrada para este dispositivo.
              </p>
            ) : (
              <div className="space-y-3">
                {listaObservacoes.map((obs) => (
                  <div
                    key={obs.id}
                    className="rounded-xl border p-4 space-y-2 shadow-xs transition-shadow hover:shadow-sm"
                    style={{ background: 'var(--color-card)', borderColor: 'var(--color-border)' }}
                  >
                    <div className="flex items-start justify-between gap-3 border-b pb-2">
                      <div>
                        <h4 className="font-semibold text-sm text-foreground">{obs.titulo}</h4>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {obs.autorEmail || obs.autorNome} · {formatarDataHora(obs.criadoEm)}
                        </p>
                      </div>

                      {!somenteLeitura && (!ehParceiro || obs.autorId === usuario?.id) && (
                        <button
                          type="button"
                          onClick={() => excluirObservacao(obs.id)}
                          className="text-xs text-muted-foreground hover:text-destructive transition-colors px-1 py-0.5"
                          title="Excluir esta observação"
                        >
                          Excluir
                        </button>
                      )}
                    </div>

                    <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">
                      {obs.texto}
                    </p>

                    {/* Anexos da observação */}
                    {obs.anexos && obs.anexos.length > 0 && (
                      <div className="pt-2 border-t mt-2">
                        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                          Anexos ({obs.anexos.length})
                        </p>
                        <div className="flex flex-wrap gap-2.5">
                          {obs.anexos.map((anexo) => {
                            const ehImagem = anexo.tipo === 'imagem' || /\.(png|jpe?g|webp)$/i.test(anexo.nome)
                            if (ehImagem) {
                              return (
                                <div
                                  key={anexo.url}
                                  className="group relative flex flex-col items-center rounded-lg border overflow-hidden bg-muted/40 transition-all hover:border-primary cursor-pointer"
                                  style={{ width: '110px' }}
                                  onClick={() => setImagemAmpliada({ url: anexo.url, nome: anexo.nome })}
                                >
                                  <img
                                    src={anexo.url}
                                    alt={anexo.nome}
                                    className="h-20 w-full object-cover"
                                  />
                                  <span className="w-full truncate px-1.5 py-1 text-[10px] text-center font-medium text-foreground bg-popover" title={anexo.nome}>
                                    {anexo.nome}
                                  </span>
                                  <span className="absolute top-1 right-1 bg-black/60 text-white rounded px-1 text-[9px] opacity-0 group-hover:opacity-100 transition-opacity">
                                    Ampliar
                                  </span>
                                </div>
                              )
                            }

                            // Arquivo .zip ou log
                            return (
                              <a
                                key={anexo.url}
                                href={anexo.url}
                                download={anexo.nome}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold text-foreground bg-muted/30 hover:bg-muted transition-colors shadow-2xs"
                                style={{ borderColor: 'var(--color-border)' }}
                                title={`Baixar anexo: ${anexo.nome}`}
                              >
                                <span className="text-base font-mono">📦</span>
                                <div className="min-w-0">
                                  <p className="truncate max-w-[140px] font-medium leading-tight">{anexo.nome}</p>
                                  {anexo.tamanho && (
                                    <p className="text-[10px] text-muted-foreground">{formatarTamanho(anexo.tamanho)}</p>
                                  )}
                                </div>
                                <Icone nome="baixar" className="h-3.5 w-3.5 shrink-0 text-primary" />
                              </a>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Anotações por funcionalidade (matriz de testes) */}
          <div className="pt-2">
            <p className="label-caps mb-2 text-xs font-semibold text-foreground">
              Anotações por funcionalidade
              <span className="ml-1.5 font-normal opacity-60">({anotacoes.length})</span>
            </p>

            {anotacoes.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma nota por item registrada ainda. Notas anotadas diretamente em uma célula de teste aparecem aqui agrupadas por funcionalidade.
              </p>
            ) : (
              <ul data-anotacoes className="space-y-2">
                {anotacoes.map((a) => (
                  <li
                    key={a.item}
                    className="rounded-lg border p-3 text-sm"
                    style={{ background: 'var(--color-muted)' }}
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-semibold text-foreground">{a.item}</span>
                      <span
                        className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap"
                        style={{
                          background: META_STATUS[a.status].corFill,
                          color: META_STATUS[a.status].cor,
                        }}
                      >
                        {META_STATUS[a.status].rotulo}
                      </span>
                    </div>
                    <p className="mt-1 leading-relaxed text-muted-foreground whitespace-pre-wrap">
                      {a.texto}
                    </p>
                    <div className="pt-2 border-t mt-2 text-[11px] text-muted-foreground flex items-center justify-between" style={{ borderColor: 'var(--color-border)' }}>
                      <span>
                        Registrado por: <strong className="font-semibold text-foreground">{a.autorEmail}</strong>
                      </span>
                      <span className="font-medium">{formatarDataHora(a.atualizadoEm)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Rodapé */}
        <div className="flex items-center justify-between gap-3 border-t p-4" style={{ borderColor: 'var(--color-border)' }}>
          <p className="text-xs text-muted-foreground">
            O parceiro e a Mobiltec têm acesso aos anexos e logs registrados.
          </p>
          <button
            type="button"
            onClick={aoFechar}
            className="rounded-md px-4 py-2 text-sm font-medium border bg-transparent hover:bg-muted transition-colors text-foreground"
            style={{ borderColor: 'var(--color-border)' }}
          >
            Fechar
          </button>
        </div>

        {/* Modal de Zoom da Imagem */}
        {imagemAmpliada && (
          <div
            className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs"
            onClick={() => setImagemAmpliada(null)}
          >
            <div
              className="relative max-h-[92vh] max-w-[92vw] overflow-hidden rounded-xl border bg-card p-2 shadow-2xl flex flex-col items-center"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-full flex items-center justify-between pb-2 px-2">
                <span className="text-xs font-semibold truncate text-foreground">{imagemAmpliada.nome}</span>
                <div className="flex items-center gap-2">
                  <a
                    href={imagemAmpliada.url}
                    download={imagemAmpliada.nome}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1 rounded text-muted-foreground hover:text-foreground"
                    title="Baixar imagem"
                  >
                    <Icone nome="baixar" className="h-4 w-4" />
                  </a>
                  <button
                    type="button"
                    onClick={() => setImagemAmpliada(null)}
                    className="p-1 rounded text-muted-foreground hover:text-foreground"
                    title="Fechar"
                  >
                    <Icone nome="x" className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <img
                src={imagemAmpliada.url}
                alt={imagemAmpliada.nome}
                className="max-h-[82vh] max-w-[88vw] object-contain rounded-lg border"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
