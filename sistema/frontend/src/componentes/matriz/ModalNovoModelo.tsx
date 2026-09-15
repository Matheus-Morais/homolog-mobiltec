import { useState, useEffect, useMemo, useRef } from 'react'
import {
  useCadastrarModelo,
  useSalvarDispositivo,
  useSalvarFicha,
  type PayloadNovoModelo,
} from '@/hooks/useMatriz'
import { ErroApi } from '@/lib/api'
import { ROTULO_GERENCIAMENTO } from '@/lib/tipos'
import type { BateriaTeste, ColunaMatriz, TipoGerenciamento } from '@/lib/tipos'

interface Props {
  categoriaId: string
  categoriaSlug: string
  baterias: BateriaTeste[]
  /** Com coluna, o modal edita a homologação existente; sem ela, cadastra uma nova */
  coluna?: ColunaMatriz
  aoFechar: () => void
  aoCriar: () => void
  aoPedirReteste?: (coluna: ColunaMatriz) => void
  aoPedirRemover?: (coluna: ColunaMatriz) => void
}

const hoje = () => new Date().toISOString().slice(0, 10)

const TIPOS_AGENTE_PADRAO = [
  'Agente de Prod',
  'Agente Dev',
  'Agente QA',
  'Agente POS',
  'Agente Legado',
]

type SistemaOperacional = 'Android' | 'iOS' | 'Microsoft' | 'Linux'

const OPCOES_SO: OpcaoDropdown<SistemaOperacional>[] = [
  { valor: 'Android', rotulo: 'Android' },
  { valor: 'iOS', rotulo: 'iOS' },
  { valor: 'Microsoft', rotulo: 'Microsoft Windows' },
  { valor: 'Linux', rotulo: 'Linux' },
]

function detectarSo(versaoSo?: string | null): SistemaOperacional {
  if (!versaoSo) return 'Android'
  const v = versaoSo.toLowerCase()
  if (v.includes('ios') || v.includes('apple') || v.includes('iphone') || v.includes('ipad')) return 'iOS'
  if (v.includes('windows') || v.includes('microsoft') || v.includes('win')) return 'Microsoft'
  if (v.includes('linux') || v.includes('ubuntu') || v.includes('debian')) return 'Linux'
  return 'Android'
}

function limparPrefixoSo(versaoSo: string, so: SistemaOperacional): string {
  if (!versaoSo) return ''
  switch (so) {
    case 'Android':
      return versaoSo.replace(/^\s*android\s*/i, '').trim()
    case 'iOS':
      return versaoSo.replace(/^\s*ios\s*/i, '').trim()
    case 'Microsoft':
      return versaoSo.replace(/^\s*(microsoft|windows|win)\s*/i, '').trim()
    case 'Linux':
      return versaoSo.replace(/^\s*linux\s*/i, '').trim()
    default:
      return versaoSo.trim()
  }
}

/**
 * O mesmo formulário para cadastrar um modelo e para configurar um já
 * existente.
 */
export function ModalNovoModelo({
  categoriaId,
  categoriaSlug,
  baterias,
  coluna,
  aoFechar,
  aoCriar,
  aoPedirReteste,
  aoPedirRemover,
}: Props) {
  const cadastrar = useCadastrarModelo()
  const salvarFicha = useSalvarFicha(categoriaSlug)
  const salvarDispositivo = useSalvarDispositivo(categoriaSlug)
  const [erro, setErro] = useState<string | null>(null)

  const editando = !!coluna
  const h = coluna?.homologacao

  const soDetectado = useMemo(() => detectarSo(h?.versaoSo), [h?.versaoSo])
  const [so, setSo] = useState<SistemaOperacional>(soDetectado)

  const [tiposAgenteExtras, setTiposAgenteExtras] = useState<string[]>([])
  const [cadastrandoAgente, setCadastrandoAgente] = useState(false)
  const [novoAgenteNome, setNovoAgenteNome] = useState('')

  const [f, setF] = useState({
    fabricante: h?.dispositivo.fabricante ?? '',
    modelo: h?.dispositivo.modelo ?? '',
    nomeComercial: h?.dispositivo.nomeComercial ?? '',
    bateriaId: h?.bateriaId ?? baterias[0]?.id ?? '',
    numeroSerie: h?.numeroSerie ?? '',
    imei1: h?.imei1 ?? '',
    imei2: h?.imei2 ?? '',
    versaoSo: h?.versaoSo ? limparPrefixoSo(h.versaoSo, soDetectado) : '',
    gerenciamento: (h?.gerenciamento ?? 'ANDROID_LEGADO') as TipoGerenciamento,
    tipoAgente: h?.tipoAgente ?? 'Agente POS',
    versaoAgente: h?.versaoAgente ?? '',
    ferramenta: h?.ferramenta ?? '',
    metodoInscricao: h?.metodoInscricao ?? 'ADB / Arquivo',
    assinaturaAgente: h?.assinaturaAgente ?? false,
    precisaAssinaturaDev: h?.precisaAssinaturaDev ?? false,
    dataInicio: h?.dataInicio?.slice(0, 10) ?? hoje(),
  })

  const tiposAgenteDisponiveis = useMemo(() => {
    const lista = [...TIPOS_AGENTE_PADRAO]
    if (h?.tipoAgente && !lista.some((t: string) => t.toLowerCase() === h.tipoAgente.toLowerCase())) {
      lista.push(h.tipoAgente)
    }
    for (const extra of tiposAgenteExtras) {
      if (!lista.some((t: string) => t.toLowerCase() === extra.toLowerCase())) {
        lista.push(extra)
      }
    }
    return lista
  }, [h, tiposAgenteExtras])

  function salvarNovoAgente() {
    const nomeLimpo = novoAgenteNome.trim()
    if (!nomeLimpo) return
    if (!tiposAgenteDisponiveis.some((t: string) => t.toLowerCase() === nomeLimpo.toLowerCase())) {
      setTiposAgenteExtras((prev) => [...prev, nomeLimpo])
    }
    setF((v) => ({ ...v, tipoAgente: nomeLimpo }))
    setCadastrandoAgente(false)
    setNovoAgenteNome('')
  }

  const ehAgentePosOuLegado = useMemo(() => {
    const t = f.tipoAgente.trim().toLowerCase()
    return (
      t === 'agente pos' ||
      t === 'agente legado' ||
      t === 'agente legaldo' ||
      t.includes('pos') ||
      t.includes('legado') ||
      t.includes('legaldo')
    )
  }, [f.tipoAgente])

  const rotuloVersaoSo = useMemo(() => {
    switch (so) {
      case 'Android':
        return 'Versão do Android'
      case 'iOS':
        return 'Versão do iOS'
      case 'Microsoft':
        return 'Versão do Windows'
      case 'Linux':
        return 'Versão do Linux'
      default:
        return 'Versão do SO'
    }
  }, [so])

  // Sincroniza a bateria selecionada assim que a lista de baterias estiver carregada
  useEffect(() => {
    if (!f.bateriaId && baterias && baterias.length > 0) {
      setF((v) => ({ ...v, bateriaId: baterias[0].id }))
    }
  }, [baterias, f.bateriaId])

  const set = (chave: keyof typeof f) => (valor: unknown) => setF((v) => ({ ...v, [chave]: valor }))
  const salvando = cadastrar.isPending || salvarFicha.isPending || salvarDispositivo.isPending

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    const fabricante = f.fabricante.trim() || 'Fabricante'
    const modelo = f.modelo.trim() || 'Modelo'
    const nomeComercial = f.nomeComercial.trim() || `${fabricante} ${modelo}`.trim() || 'Dispositivo'
    const bateriaId = f.bateriaId || baterias[0]?.id || ''

    // Formatação elegante da versão com prefixo apropriado quando não-Android
    let versaoSoGravada = f.versaoSo.trim()
    if (!versaoSoGravada) {
      versaoSoGravada = so === 'Microsoft' ? 'Windows' : so
    } else {
      if (so === 'iOS' && !versaoSoGravada.toLowerCase().includes('ios')) {
        versaoSoGravada = `iOS ${versaoSoGravada}`
      } else if (so === 'Microsoft' && !versaoSoGravada.toLowerCase().includes('win') && !versaoSoGravada.toLowerCase().includes('micro')) {
        versaoSoGravada = `Windows ${versaoSoGravada}`
      } else if (so === 'Linux' && !versaoSoGravada.toLowerCase().includes('linux')) {
        versaoSoGravada = `Linux ${versaoSoGravada}`
      }
    }

    try {
      if (editando) {
        await salvarDispositivo.mutateAsync({
          dispositivoId: h!.dispositivoId,
          fabricante,
          modelo,
          nomeComercial,
        })
        await salvarFicha.mutateAsync({
          homologacaoId: h!.id,
          numeroSerie: f.numeroSerie.trim() || 'Sem informação',
          imei1: f.imei1.trim() || null,
          imei2: f.imei2.trim() || null,
          versaoSo: versaoSoGravada,
          gerenciamento: f.gerenciamento,
          tipoAgente: f.tipoAgente.trim() || 'Agente PoS',
          versaoAgente: f.versaoAgente.trim() || 'Não informada',
          ferramenta: f.ferramenta.trim() || null,
          metodoInscricao: f.metodoInscricao.trim() || 'Não informado',
          assinaturaAgente: f.assinaturaAgente,
          precisaAssinaturaDev: f.precisaAssinaturaDev,
          dataInicio: f.dataInicio || hoje(),
        })
      } else {
        const payload: PayloadNovoModelo = {
          categoriaId,
          ...f,
          bateriaId,
          fabricante,
          modelo,
          nomeComercial,
          numeroSerie: f.numeroSerie.trim() || 'Sem informação',
          versaoSo: versaoSoGravada,
          tipoAgente: f.tipoAgente.trim() || 'Agente PoS',
          versaoAgente: f.versaoAgente.trim() || 'Não informada',
          metodoInscricao: f.metodoInscricao.trim() || 'Não informado',
          imei1: f.imei1.trim() || null,
          imei2: f.imei2.trim() || null,
          ferramenta: f.ferramenta.trim() || null,
          dataInicio: f.dataInicio || hoje(),
        }
        await cadastrar.mutateAsync(payload)
      }
      aoCriar()
    } catch (err) {
      if (err instanceof ErroApi) {
        if (err.campos && err.campos.length > 0) {
          setErro(`${err.message}: ${err.campos.map((c) => `${c.campo} (${c.mensagem})`).join(', ')}`)
        } else {
          setErro(err.message)
        }
      } else {
        setErro(`Não foi possível ${editando ? 'salvar as alterações' : 'cadastrar o modelo'}.`)
      }
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15,15,18,.45)' }}
      onClick={aoFechar}
    >
      <form
        onSubmit={enviar}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-xl border shadow-xl"
        style={{ background: 'var(--color-popover)' }}
      >
        <div className="p-5 border-b shrink-0">
          <h2 className="text-lg font-semibold">
            {editando ? 'Configuração do modelo' : 'Cadastrar novo modelo'}
          </h2>
          <p className="text-sm mt-0.5" style={{ color: 'var(--color-muted-foreground)' }}>
            {editando
              ? `${h!.dispositivo.nomeComercial} — os mesmos campos da ficha, num lugar só.`
              : 'Cria a coluna na matriz e abre a homologação com todos os itens da bateria em "não testado".'}
          </p>
        </div>

        <div className="p-5 overflow-y-auto flex-1 space-y-5">
          <section>
            <p className="label-caps mb-2">Identidade do modelo</p>
            <div className="grid sm:grid-cols-3 gap-3">
              <Campo rotulo="Fabricante" obrigatorio valor={f.fabricante} aoMudar={set('fabricante')} />
              <Campo rotulo="Modelo" obrigatorio valor={f.modelo} aoMudar={set('modelo')} />
              <Campo
                rotulo="Nome comercial"
                valor={f.nomeComercial}
                aoMudar={set('nomeComercial')}
              />
            </div>
          </section>

          <section>
            <p className="label-caps mb-2">Unidade testada</p>
            <div className="grid sm:grid-cols-3 gap-3">
              <Campo rotulo="Número de série" valor={f.numeroSerie} aoMudar={set('numeroSerie')} />
              <Campo rotulo="IMEI 1" valor={f.imei1} aoMudar={set('imei1')} />
              <Campo rotulo="IMEI 2" valor={f.imei2} aoMudar={set('imei2')} />
            </div>
          </section>

          <section>
            <p className="label-caps mb-2">Agente e plataforma</p>
            <div className="grid sm:grid-cols-3 gap-3">
              <SeletorDropdown<SistemaOperacional>
                rotulo="Sistema Operacional"
                obrigatorio
                valor={so}
                aoMudar={(novoSo) => setSo(novoSo)}
                opcoes={OPCOES_SO}
              />

              <Campo
                rotulo={rotuloVersaoSo}
                obrigatorio
                valor={f.versaoSo}
                aoMudar={set('versaoSo')}
              />

              {so === 'Android' && (
                <SeletorDropdown<TipoGerenciamento>
                  rotulo="Gerenciamento"
                  valor={f.gerenciamento}
                  aoMudar={(v) => set('gerenciamento')(v)}
                  opcoes={(Object.keys(ROTULO_GERENCIAMENTO) as TipoGerenciamento[]).map((g) => ({
                    valor: g,
                    rotulo: ROTULO_GERENCIAMENTO[g],
                  }))}
                />
              )}

              <div className={so !== 'Android' ? 'sm:col-span-1' : ''}>
                {!cadastrandoAgente ? (
                  <SeletorDropdown<string>
                    rotulo="Tipo de agente"
                    obrigatorio
                    valor={f.tipoAgente}
                    aoMudar={(v) => set('tipoAgente')(v)}
                    opcoes={tiposAgenteDisponiveis.map((ta) => ({
                      valor: ta,
                      rotulo: ta,
                    }))}
                    acaoExtra={
                      <button
                        type="button"
                        onClick={() => {
                          setCadastrandoAgente(true)
                          setNovoAgenteNome('')
                        }}
                        className="text-[11px] font-semibold hover:underline cursor-pointer flex items-center gap-0.5"
                        style={{ color: 'var(--color-primary)' }}
                      >
                        + Novo agente
                      </button>
                    }
                  />
                ) : (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="label-caps block">
                        Tipo de agente <span style={{ color: 'var(--color-destructive)' }}>*</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => setCadastrandoAgente(false)}
                        className="text-[11px] hover:underline cursor-pointer"
                        style={{ color: 'var(--color-muted-foreground)' }}
                      >
                        Voltar
                      </button>
                    </div>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        autoFocus
                        value={novoAgenteNome}
                        onChange={(e) => setNovoAgenteNome(e.target.value)}
                        placeholder="Nome do novo tipo de agente…"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            salvarNovoAgente()
                          }
                        }}
                        className="flex-1 px-2.5 py-1.5 text-xs rounded-md border bg-transparent"
                        style={{ borderColor: 'var(--color-input)' }}
                      />
                      <button
                        type="button"
                        onClick={salvarNovoAgente}
                        disabled={!novoAgenteNome.trim()}
                        className="px-3 py-1.5 rounded-md text-xs font-semibold text-white transition-opacity disabled:opacity-50 cursor-pointer"
                        style={{ background: 'var(--gradient-brand-purple)' }}
                      >
                        Salvar
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <Campo rotulo="Versão do agente" obrigatorio valor={f.versaoAgente} aoMudar={set('versaoAgente')} />
              <Campo rotulo="Método de inscrição" obrigatorio valor={f.metodoInscricao} aoMudar={set('metodoInscricao')} />
              <Campo rotulo="Ferramenta" valor={f.ferramenta} aoMudar={set('ferramenta')} />

              {ehAgentePosOuLegado && (
                <div
                  className="sm:col-span-3 p-3 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all"
                  style={{
                    borderColor: 'var(--color-brand-purple-border, rgba(110, 34, 107, 0.2))',
                    background: 'var(--color-brand-purple-soft, rgba(251, 244, 250, 0.8))',
                  }}
                >
                  <div>
                    <span
                      className="block text-xs font-bold"
                      style={{ color: 'var(--color-brand-purple-fg, #6e226b)' }}
                    >
                      O agente precisa de assinatura do fabricante? <span style={{ color: 'var(--color-destructive)' }}>*</span>
                    </span>
                    <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-muted-foreground)' }}>
                      Requisito para dispositivos PoS e versões legadas que operam com binários assinados.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        set('assinaturaAgente')(true)
                        set('precisaAssinaturaDev')(true)
                      }}
                      className={`px-3.5 py-1 rounded-md text-xs font-semibold border transition-all cursor-pointer ${
                        f.assinaturaAgente
                          ? 'text-white shadow-xs'
                          : 'bg-white/80 hover:bg-white text-neutral-600'
                      }`}
                      style={{
                        background: f.assinaturaAgente ? 'var(--gradient-brand-purple)' : undefined,
                        borderColor: f.assinaturaAgente ? 'var(--color-primary)' : 'var(--color-border)',
                      }}
                    >
                      Sim
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        set('assinaturaAgente')(false)
                        set('precisaAssinaturaDev')(false)
                      }}
                      className={`px-3.5 py-1 rounded-md text-xs font-semibold border transition-all cursor-pointer ${
                        !f.assinaturaAgente
                          ? 'text-white shadow-xs'
                          : 'bg-white/80 hover:bg-white text-neutral-600'
                      }`}
                      style={{
                        background: !f.assinaturaAgente ? 'var(--gradient-brand-purple)' : undefined,
                        borderColor: !f.assinaturaAgente ? 'var(--color-primary)' : 'var(--color-border)',
                      }}
                    >
                      Não
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section>
            <p className="label-caps mb-2">Bateria e datas</p>
            <div className="grid sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <SeletorDropdown<string>
                  rotulo="Bateria de testes"
                  desabilitado={editando}
                  dica={editando ? 'A bateria é definida no cadastro e não muda depois' : undefined}
                  valor={f.bateriaId || baterias[0]?.id || ''}
                  aoMudar={(v) => set('bateriaId')(v)}
                  opcoes={baterias.map((b) => ({
                    valor: b.id,
                    rotulo: b.nome,
                    descricao: `${b._count?.itens ?? b.itens?.length ?? '?'} itens`,
                  }))}
                />
              </div>
              <div>
                <label className="label-caps block mb-1.5">Data de início</label>
                <input
                  type="date"
                  value={f.dataInicio}
                  onChange={(e) => set('dataInicio')(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border bg-transparent text-sm"
                  style={{ borderColor: 'var(--color-input)' }}
                />
              </div>
            </div>
          </section>

          {erro && (
            <div
              role="alert"
              className="px-3 py-2.5 rounded-md text-sm"
              style={{ background: 'var(--color-destructive-soft)', color: 'var(--color-destructive-fg)' }}
            >
              {erro}
            </div>
          )}
        </div>

        <div className="p-5 border-t flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2">
            {editando && aoPedirReteste && coluna && (
              <button
                type="button"
                onClick={() => aoPedirReteste(coluna)}
                className="px-3 py-2 rounded-md text-sm font-medium border transition-colors hover:bg-neutral-500/10"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-foreground)' }}
              >
                Solicitar Reteste
              </button>
            )}
            {editando && aoPedirRemover && coluna && (
              <button
                type="button"
                onClick={() => aoPedirRemover(coluna)}
                className="px-3 py-2 rounded-md text-sm font-medium border transition-colors hover:bg-red-500/10"
                style={{ borderColor: 'var(--color-destructive)', color: 'var(--color-destructive)' }}
              >
                Remover da planilha
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={aoFechar} className="px-4 py-2 rounded-md text-sm" style={{ color: 'var(--color-muted-foreground)' }}>
              Cancelar
            </button>
            <button
              type="submit"
              disabled={salvando}
              className="px-4 py-2 rounded-md text-sm font-medium text-white disabled:opacity-50 cursor-pointer"
              style={{ background: 'var(--gradient-brand-purple)' }}
            >
              {salvando
                ? editando
                  ? 'Salvando…'
                  : 'Cadastrando…'
                : editando
                  ? 'Salvar alterações'
                  : 'Cadastrar modelo'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

function Campo({
  rotulo,
  valor,
  aoMudar,
  obrigatorio,
}: {
  rotulo: string
  valor: string
  aoMudar: (v: string) => void
  placeholder?: string
  obrigatorio?: boolean
}) {
  return (
    <div>
      <label className="label-caps block mb-1.5">
        {rotulo}
        {obrigatorio && <span style={{ color: 'var(--color-destructive)' }}> *</span>}
      </label>
      <input
        required={obrigatorio}
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        className="w-full px-3 py-2 rounded-md border bg-transparent text-sm"
        style={{ borderColor: 'var(--color-input)' }}
      />
    </div>
  )
}

interface OpcaoDropdown<T extends string = string> {
  valor: T
  rotulo: string
  descricao?: string
}

function SeletorDropdown<T extends string = string>({
  rotulo,
  obrigatorio,
  valor,
  opcoes,
  aoMudar,
  desabilitado,
  dica,
  acaoExtra,
}: {
  rotulo?: string
  obrigatorio?: boolean
  valor: T
  opcoes: OpcaoDropdown<T>[]
  aoMudar: (v: T) => void
  desabilitado?: boolean
  dica?: string
  acaoExtra?: React.ReactNode
}) {
  const [aberto, setAberto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function tratarCliqueFora(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setAberto(false)
      }
    }
    function tratarEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setAberto(false)
    }
    if (aberto) {
      document.addEventListener('mousedown', tratarCliqueFora)
      document.addEventListener('keydown', tratarEsc)
    }
    return () => {
      document.removeEventListener('mousedown', tratarCliqueFora)
      document.removeEventListener('keydown', tratarEsc)
    }
  }, [aberto])

  const opcaoSelecionada = opcoes.find((o) => o.valor === valor)

  return (
    <div className="relative" ref={ref}>
      {rotulo && (
        <div className="flex items-center justify-between mb-1.5">
          <label className="label-caps block">
            {rotulo} {obrigatorio && <span style={{ color: 'var(--color-destructive)' }}>*</span>}
          </label>
          {acaoExtra}
        </div>
      )}
      <button
        type="button"
        disabled={desabilitado}
        title={dica}
        onClick={() => !desabilitado && setAberto((v) => !v)}
        className={`w-full px-3 py-2 rounded-md border text-sm text-left flex items-center justify-between transition-all cursor-pointer ${
          desabilitado ? 'opacity-60 cursor-not-allowed' : 'hover:border-[var(--color-primary)]'
        } ${aberto ? 'ring-2 ring-[var(--color-primary)]/20 border-[var(--color-primary)]' : ''}`}
        style={{
          borderColor: aberto ? 'var(--color-primary)' : 'var(--color-input)',
          background: 'var(--color-popover)',
          color: 'var(--color-foreground)',
        }}
      >
        <span className="truncate">{opcaoSelecionada?.rotulo || valor || 'Selecione…'}</span>
        <svg
          className={`h-4 w-4 ml-2 shrink-0 transition-transform duration-200 text-[var(--color-muted-foreground)] ${
            aberto ? 'rotate-180 text-[var(--color-primary)]' : ''
          }`}
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path d="M6 8l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {aberto && (
        <div
          className="absolute z-50 mt-1.5 w-full rounded-xl border shadow-xl py-1 max-h-60 overflow-y-auto backdrop-blur-md transition-all"
          style={{
            background: 'var(--color-popover)',
            borderColor: 'var(--color-border)',
            boxShadow: '0 12px 30px -4px rgba(0, 0, 0, 0.15), 0 6px 12px -2px rgba(0, 0, 0, 0.08)',
          }}
        >
          {opcoes.map((op) => {
            const ativa = op.valor === valor
            return (
              <button
                key={op.valor}
                type="button"
                onClick={() => {
                  aoMudar(op.valor)
                  setAberto(false)
                }}
                className={`w-full px-3.5 py-2 text-xs font-medium text-left flex items-center justify-between transition-colors cursor-pointer ${
                  ativa
                    ? 'bg-purple-50 text-[var(--color-primary)] font-semibold dark:bg-purple-950/50'
                    : 'text-[var(--color-foreground)] hover:bg-neutral-500/10'
                }`}
              >
                <div className="flex flex-col min-w-0 pr-2">
                  <span className="truncate">{op.rotulo}</span>
                  {op.descricao && (
                    <span className="text-[10px] text-[var(--color-muted-foreground)] truncate">
                      {op.descricao}
                    </span>
                  )}
                </div>
                {ativa && (
                  <svg
                    className="h-4 w-4 shrink-0 text-[var(--color-primary)]"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
