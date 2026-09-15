import { useState, useEffect, useMemo } from 'react'
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

/**
 * O mesmo formulário para cadastrar um modelo e para configurar um já
 * existente.
 *
 * São os mesmos campos, e mantê-los em dois componentes garantiria que um dia
 * eles divergissem. O que muda entre os dois modos é só o destino: cadastrar
 * cria dispositivo + homologação numa tacada; configurar salva os dados de
 * identidade no dispositivo e o resto na homologação, que é onde cada coisa
 * mora.
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
    versaoSo: h?.versaoSo ?? '',
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

    try {
      if (editando) {
        // Identidade mora no dispositivo; o resto, na homologação
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
          versaoSo: f.versaoSo.trim() || 'Android',
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
          versaoSo: f.versaoSo.trim() || 'Android',
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
          setErro(`${err.message}: ${err.campos.map(c => `${c.campo} (${c.mensagem})`).join(', ')}`)
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
              <Campo rotulo="Número de série" obrigatorio valor={f.numeroSerie} aoMudar={set('numeroSerie')} />
              <Campo rotulo="IMEI 1" valor={f.imei1} aoMudar={set('imei1')} />
              <Campo rotulo="IMEI 2" valor={f.imei2} aoMudar={set('imei2')} />
            </div>
          </section>

          <section>
            <p className="label-caps mb-2">Agente e plataforma</p>
            <div className="grid sm:grid-cols-3 gap-3">
              <Campo rotulo="Versão do SO" obrigatorio valor={f.versaoSo} aoMudar={set('versaoSo')} />
              <div>
                <label className="label-caps block mb-1.5">Gerenciamento</label>
                <select
                  value={f.gerenciamento}
                  onChange={(e) => set('gerenciamento')(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border bg-transparent text-sm"
                  style={{ borderColor: 'var(--color-input)' }}
                >
                  {(Object.keys(ROTULO_GERENCIAMENTO) as TipoGerenciamento[]).map((g) => (
                    <option key={g} value={g}>
                      {ROTULO_GERENCIAMENTO[g]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="label-caps block">
                    Tipo de agente <span style={{ color: 'var(--color-destructive)' }}>*</span>
                  </label>
                  {!cadastrandoAgente ? (
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
                  ) : (
                    <button
                      type="button"
                      onClick={() => setCadastrandoAgente(false)}
                      className="text-[11px] hover:underline cursor-pointer"
                      style={{ color: 'var(--color-muted-foreground)' }}
                    >
                      Voltar
                    </button>
                  )}
                </div>

                {!cadastrandoAgente ? (
                  <select
                    value={f.tipoAgente}
                    onChange={(e) => set('tipoAgente')(e.target.value)}
                    className="w-full px-3 py-2 rounded-md border bg-transparent text-sm cursor-pointer"
                    style={{ borderColor: 'var(--color-input)' }}
                  >
                    {tiposAgenteDisponiveis.map((ta: string) => (
                      <option key={ta} value={ta}>
                        {ta}
                      </option>
                    ))}
                  </select>
                ) : (
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
                <label className="label-caps block mb-1.5">Bateria de testes</label>
                <select
                  value={f.bateriaId || baterias[0]?.id || ''}
                  onChange={(e) => set('bateriaId')(e.target.value)}
                  // Trocar a bateria de uma homologação em andamento significaria
                  // recriar as linhas e perder o que já foi avaliado. Para mudar
                  // de bateria o caminho é um reteste.
                  disabled={editando}
                  title={editando ? 'A bateria é definida no cadastro e não muda depois' : undefined}
                  className="w-full px-3 py-2 rounded-md border bg-transparent text-sm disabled:opacity-60"
                  style={{ borderColor: 'var(--color-input)' }}
                >
                  {baterias.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.nome} ({b._count?.itens ?? b.itens?.length ?? '?'} itens)
                    </option>
                  ))}
                </select>
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
              className="px-4 py-2 rounded-md text-sm font-medium text-white disabled:opacity-50"
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
