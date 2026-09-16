import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ErroApi } from '@/lib/api'
import {
  useEditarTipo,
  useItensTeste,
  useRegistrarTipo,
  type TipoDispositivo,
} from '@/hooks/useTipoDispositivo'
import { Icone, ICONES_TIPO, type NomeIcone } from '@/componentes/Icone'
import { FICHA_FIXA, LINHAS_FICHA } from '@/lib/tipos'
import type { ChaveFicha, ItemTeste } from '@/lib/tipos'

/** Item escrito na hora pelo técnico, ainda sem id no banco */
interface ItemNovo {
  /** Chave local só para a lista do formulário */
  chave: string
  grupo: string
  nome: string
  descricaoAcao: string
}

interface BateriaConfig {
  chave: string
  titulo: string
  customizada: boolean
}

const BATERIAS_PADRAO: BateriaConfig[] = [
  { chave: 'TELEMETRIA', titulo: 'Telemetria e Monitoramento', customizada: false },
  { chave: 'COLETA', titulo: 'Coleta de Informações', customizada: false },
  { chave: 'COMANDOS', titulo: 'Comandos Remotos', customizada: false },
  { chave: 'PERFIS', titulo: 'Perfis e Políticas MDM', customizada: false },
]

/**
 * O formulário de um tipo de dispositivo — o mesmo para criar e para editar.
 */
export function FormularioTipo({ tipo }: { tipo?: TipoDispositivo }) {
  const navegar = useNavigate()
  const { data: catalogo, isLoading } = useItensTeste()
  const registrar = useRegistrarTipo()
  const editar = useEditarTipo()
  const editando = !!tipo

  const [nome, setNome] = useState(tipo?.nome ?? '')
  const [icone, setIcone] = useState<NomeIcone>((tipo?.icone as NomeIcone) ?? 'credit-card')
  const [erro, setErro] = useState<string | null>(null)

  // Gestão de títulos amigáveis das baterias (padrões e novas)
  const [bateriasTitulos, setBateriasTitulos] = useState<Record<string, string>>(() => {
    const mapa: Record<string, string> = {
      TELEMETRIA: 'Telemetria e Monitoramento',
      COLETA: 'Coleta de Informações',
      COMANDOS: 'Comandos Remotos',
      PERFIS: 'Perfis e Políticas MDM',
    }
    if (tipo?.gruposTitulos) {
      Object.assign(mapa, tipo.gruposTitulos)
    }
    return mapa
  })

  // Baterias adicionadas dinamicamente
  const [bateriasExtras, setBateriasExtras] = useState<BateriaConfig[]>(() => {
    if (!tipo) return []
    const chavesPadrao = new Set(['REGISTRO', 'TELEMETRIA', 'COLETA', 'COMANDOS', 'PERFIS'])
    const extras: BateriaConfig[] = []
    const chavesSalvas = new Set([
      ...(tipo.gruposOrdem ?? []).filter((c) => !chavesPadrao.has(c)),
      ...Object.keys(tipo.gruposTitulos ?? {}).filter((c) => !chavesPadrao.has(c)),
    ])
    for (const k of chavesSalvas) {
      extras.push({
        chave: k,
        titulo: tipo.gruposTitulos?.[k] ?? k,
        customizada: true,
      })
    }
    return extras
  })

  // Ordenação dos blocos: Registro e cada Bateria de testes
  const [ordemBlocos, setOrdemBlocos] = useState<string[]>(() => {
    const padraoInicial = ['REGISTRO', 'TELEMETRIA', 'COLETA', 'COMANDOS', 'PERFIS']
    if (!tipo?.gruposOrdem || tipo.gruposOrdem.length === 0) {
      return padraoInicial
    }
    const lista = [...tipo.gruposOrdem]
    if (!lista.includes('REGISTRO')) {
      lista.unshift('REGISTRO')
    }
    for (const b of ['TELEMETRIA', 'COLETA', 'COMANDOS', 'PERFIS']) {
      if (!lista.includes(b)) lista.push(b)
    }
    return lista
  })

  // Sincroniza grupos extras ao carregar itens do catálogo
  const todasBaterias = useMemo(() => {
    const conhecidas = new Set<string>()
    const lista: BateriaConfig[] = []

    for (const b of BATERIAS_PADRAO) {
      conhecidas.add(b.chave)
      lista.push({ ...b, titulo: bateriasTitulos[b.chave] ?? b.titulo })
    }

    for (const b of bateriasExtras) {
      if (!conhecidas.has(b.chave)) {
        conhecidas.add(b.chave)
        lista.push({ ...b, titulo: bateriasTitulos[b.chave] ?? b.titulo })
      }
    }

    for (const it of catalogo ?? []) {
      if (it.grupo && !conhecidas.has(it.grupo)) {
        conhecidas.add(it.grupo)
        lista.push({
          chave: it.grupo,
          titulo: bateriasTitulos[it.grupo] ?? it.grupo,
          customizada: true,
        })
      }
    }

    return lista
  }, [bateriasTitulos, bateriasExtras, catalogo])

  // Formulário rápido para adicionar nova bateria
  const [criandoNovaBateria, setCriandoNovaBateria] = useState(false)
  const [tituloNovaBateria, setTituloNovaBateria] = useState('')

  function salvarNovaBateria() {
    const t = tituloNovaBateria.trim()
    if (!t) return
    const chave = `bateria_${Date.now()}`
    setBateriasTitulos((prev) => ({ ...prev, [chave]: t }))
    setBateriasExtras((prev) => [...prev, { chave, titulo: t, customizada: true }])
    setOrdemBlocos((prev) => [...prev, chave])
    setTituloNovaBateria('')
    setCriandoNovaBateria(false)
  }

  function cancelarNovaBateria() {
    setTituloNovaBateria('')
    setCriandoNovaBateria(false)
  }

  function removerBateria(chave: string) {
    setBateriasExtras((prev) => prev.filter((b) => b.chave !== chave))
    setOrdemBlocos((prev) => prev.filter((k) => k !== chave))
    setNovos((prev) => prev.filter((n) => n.grupo !== chave))
    setMarcados((atual) => {
      const proximo = new Set(atual ?? (catalogo ?? []).map((i) => i.id))
      for (const item of porGrupo.get(chave) ?? []) {
        proximo.delete(item.id)
      }
      return proximo
    })
  }

  function moverOrdem(chave: string, novaPosicao: number) {
    setOrdemBlocos((prev) => {
      const atualIdx = prev.indexOf(chave)
      if (atualIdx === -1) return prev
      const proximo = [...prev]
      proximo.splice(atualIdx, 1)
      const pos = Math.max(0, Math.min(novaPosicao - 1, proximo.length))
      proximo.splice(pos, 0, chave)
      return proximo
    })
  }

  function subirOrdem(chave: string) {
    setOrdemBlocos((prev) => {
      const idx = prev.indexOf(chave)
      if (idx <= 0) return prev
      const proximo = [...prev]
      const temp = proximo[idx - 1]
      proximo[idx - 1] = proximo[idx]
      proximo[idx] = temp
      return proximo
    })
  }

  function descerOrdem(chave: string) {
    setOrdemBlocos((prev) => {
      const idx = prev.indexOf(chave)
      if (idx === -1 || idx >= prev.length - 1) return prev
      const proximo = [...prev]
      const temp = proximo[idx + 1]
      proximo[idx + 1] = proximo[idx]
      proximo[idx] = temp
      return proximo
    })
  }

  // Criando, tudo marcado: os tipos que existem usam a ficha inteira e as 48
  // linhas de teste, então o caminho curto é partir desse padrão e tirar o que
  // não se aplica. Editando, vale o que está gravado — e ficha vazia num tipo
  // antigo significa "a ficha inteira" (ver `linhasDaFicha`).
  const [campos, setCampos] = useState<Set<string>>(() =>
    tipo && tipo.camposFicha.length > 0
      ? new Set<string>(tipo.camposFicha)
      : new Set<string>(LINHAS_FICHA.map((l) => l.chave)),
  )
  const [marcados, setMarcados] = useState<Set<string> | null>(
    tipo ? new Set(tipo.itens) : null,
  )
  const [novos, setNovos] = useState<ItemNovo[]>([])

  // Gestão de linhas da ficha/registro (incluindo criação e edição)
  const [linhasRegistroCustom, setLinhasRegistroCustom] = useState<
    Array<{ chave: string; rotulo: string }>
  >(() => {
    if (!tipo) return []
    const chavesPadrao = new Set<string>(LINHAS_FICHA.map((l) => l.chave))
    return (tipo.camposFicha ?? [])
      .filter((c) => !chavesPadrao.has(c))
      .map((c) => ({ chave: c, rotulo: c }))
  })
  const [rotulosEditadosRegistro, setRotulosEditadosRegistro] = useState<Record<string, string>>({})
  const [registroEditandoChave, setRegistroEditandoChave] = useState<string | null>(null)
  const [novoNomeRegistro, setNovoNomeRegistro] = useState('')

  const todasLinhasRegistro = useMemo(() => {
    const base = LINHAS_FICHA.map((l) => ({
      chave: l.chave,
      rotulo: rotulosEditadosRegistro[l.chave] ?? l.rotulo,
      fixo: FICHA_FIXA.includes(l.chave),
      customizado: false,
    }))
    const extras = linhasRegistroCustom.map((c) => ({
      chave: c.chave,
      rotulo: rotulosEditadosRegistro[c.chave] ?? c.rotulo,
      fixo: false,
      customizado: true,
    }))
    return [...base, ...extras]
  }, [rotulosEditadosRegistro, linhasRegistroCustom])

  // Itens do catálogo editados (nome e/ou ação descritiva)
  const [itensCatalogoEditados, setItensCatalogoEditados] = useState<
    Map<string, { nome: string; descricaoAcao: string }>
  >(new Map())

  /** Itens do catálogo agrupados por tópico/bateria */
  const porGrupo = useMemo(() => {
    const mapa = new Map<string, ItemTeste[]>()
    for (const b of todasBaterias) mapa.set(b.chave, [])
    for (const item of catalogo ?? []) {
      if (!mapa.has(item.grupo)) mapa.set(item.grupo, [])
      mapa.get(item.grupo)?.push(item)
    }
    return mapa
  }, [catalogo, todasBaterias])

  // `marcados` nasce nulo porque o catálogo chega depois da primeira pintura;
  // até lá, "todos marcados" é o conjunto inteiro que acabou de carregar.
  const selecionados = marcados ?? new Set((catalogo ?? []).map((i) => i.id))

  const totalItens = selecionados.size + novos.length
  const totalFicha = todasLinhasRegistro.filter(
    (l) => campos.has(l.chave) || l.fixo,
  ).length

  const flagadosRegistro = useMemo(() => {
    return todasLinhasRegistro.filter((l) => !l.fixo && campos.has(l.chave)).length
  }, [todasLinhasRegistro, campos])

  function alternarCampo(chave: string) {
    setCampos((atual) => {
      const proximo = new Set(atual)
      if (proximo.has(chave)) proximo.delete(chave)
      else proximo.add(chave)
      return proximo
    })
  }

  function salvarItemRegistro() {
    const n = novoNomeRegistro.trim()
    if (!n) return
    if (registroEditandoChave) {
      setRotulosEditadosRegistro((prev) => ({ ...prev, [registroEditandoChave]: n }))
      setRegistroEditandoChave(null)
      setNovoNomeRegistro('')
    } else {
      const chave = `reg_${Date.now()}`
      setLinhasRegistroCustom((prev) => [...prev, { chave, rotulo: n }])
      setCampos((prev) => new Set([...prev, chave]))
      setNovoNomeRegistro('')
    }
  }

  function cancelarEdicaoRegistro() {
    setRegistroEditandoChave(null)
    setNovoNomeRegistro('')
  }

  function excluirFlagadosRegistro() {
    setCampos((atual) => {
      const proximo = new Set(atual)
      for (const l of todasLinhasRegistro) {
        if (!l.fixo) proximo.delete(l.chave)
      }
      return proximo
    })
    setLinhasRegistroCustom((prev) => prev.filter((c) => !campos.has(c.chave)))
  }

  function alternarItem(id: string) {
    const proximo = new Set(selecionados)
    if (proximo.has(id)) proximo.delete(id)
    else proximo.add(id)
    setMarcados(proximo)
  }

  function definirGrupo(grupo: string, ligado: boolean) {
    const proximo = new Set(selecionados)
    for (const item of porGrupo.get(grupo) ?? []) {
      if (ligado) proximo.add(item.id)
      else proximo.delete(item.id)
    }
    setMarcados(proximo)
  }

  function salvarEdicaoItemTeste(
    idOuChave: string,
    ehNovo: boolean,
    novoNome: string,
    novaAcao: string,
  ) {
    if (ehNovo) {
      setNovos((atual) =>
        atual.map((n) =>
          n.chave === idOuChave
            ? { ...n, nome: novoNome, descricaoAcao: novaAcao || novoNome }
            : n,
        ),
      )
    } else {
      setItensCatalogoEditados((atual) => {
        const proximo = new Map(atual)
        proximo.set(idOuChave, { nome: novoNome, descricaoAcao: novaAcao || novoNome })
        return proximo
      })
    }
  }

  function excluirFlagadosGrupo(grupo: string) {
    setMarcados((atual) => {
      const proximo = new Set(atual ?? (catalogo ?? []).map((i) => i.id))
      for (const item of porGrupo.get(grupo) ?? []) {
        proximo.delete(item.id)
      }
      return proximo
    })
    setNovos((atual) => atual.filter((n) => n.grupo !== grupo))
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)

    const itensExistentesFinais: string[] = []
    const itensEditadosFinais: Array<{ id: string; nome: string; descricaoAcao: string }> = []

    for (const id of selecionados) {
      itensExistentesFinais.push(id)
      const editado = itensCatalogoEditados.get(id)
      if (editado) {
        itensEditadosFinais.push({
          id,
          nome: editado.nome,
          descricaoAcao: editado.descricaoAcao,
        })
      }
    }

    const payload = {
      nome: nome.trim(),
      icone,
      camposFicha: todasLinhasRegistro
        .map((l) => l.chave)
        .filter((c) => campos.has(c) || FICHA_FIXA.includes(c as ChaveFicha)),
      gruposOrdem: ordemBlocos,
      gruposTitulos: bateriasTitulos,
      itensExistentes: itensExistentesFinais,
      itensNovos: novos.map(({ grupo, nome, descricaoAcao }) => ({ grupo, nome, descricaoAcao })),
      itensEditados: itensEditadosFinais,
    }

    try {
      if (editando) {
        const resumo = await editar.mutateAsync({ id: tipo.id, ...payload })
        // Volta para a lista levando o que a edição fez. Sem isso a tela some
        // calada, e uma edição que não mexeu na planilha (porque o item tem
        // histórico) fica indistinguível de uma que não salvou.
        navegar('/registro/tipos', { state: { resumo, nome: payload.nome } })
      } else {
        const criado = await registrar.mutateAsync(payload)
        // A planilha do tipo recém-criado é o próximo passo natural: é lá que
        // o primeiro modelo dele vai ser cadastrado.
        navegar(`/matriz/${criado.categoria.slug}`)
      }
    } catch (err) {
      setErro(
        err instanceof ErroApi
          ? err.message
          : `Não foi possível ${editando ? 'salvar o tipo' : 'registrar o tipo de dispositivo'}.`,
      )
    }
  }

  const salvando = registrar.isPending || editar.isPending
  const podeEnviar = nome.trim().length >= 2 && totalItens > 0 && !salvando

  const totalOrdens = ordemBlocos.length

  const bateriasOrdenadas = useMemo(() => {
    return [...todasBaterias].sort((a, b) => {
      const idxA = ordemBlocos.indexOf(a.chave)
      const idxB = ordemBlocos.indexOf(b.chave)
      return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB)
    })
  }, [todasBaterias, ordemBlocos])

  return (
    <form onSubmit={enviar} className="h-full flex flex-col">
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="mx-auto max-w-5xl space-y-6">
          <header>
            <h2 className="text-lg font-semibold">
              {editando ? `Editar "${tipo.nome}"` : 'Registrar tipo de dispositivo'}
            </h2>
          </header>

          {/* ---------------- 1. Identidade do tipo ---------------- */}
          <Secao numero={1} titulo="Tipo de dispositivo">
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
              <div>
                <label className="label-caps mb-1.5 block" htmlFor="nome-tipo">
                  Nome do tipo <span style={{ color: 'var(--color-destructive)' }}>*</span>
                </label>
                <input
                  id="nome-tipo"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  maxLength={60}
                  className="w-full rounded-md border bg-transparent px-3 py-2 text-sm"
                  style={{ borderColor: 'var(--color-input)' }}
                />
                <p className="mt-1.5 text-xs" style={{ color: 'var(--color-muted-foreground)' }}>
                  É o rótulo no menu e o título da planilha.
                </p>
              </div>

              <div>
                <span className="label-caps mb-1.5 block">Ícone</span>
                <div className="flex flex-wrap gap-1.5">
                  {ICONES_TIPO.map((op) => {
                    const ativo = icone === op.nome
                    return (
                      <button
                        key={op.nome}
                        type="button"
                        onClick={() => setIcone(op.nome)}
                        title={op.rotulo}
                        aria-pressed={ativo}
                        aria-label={op.rotulo}
                        className="grid h-9 w-9 place-items-center rounded-md border transition-colors"
                        style={{
                          borderColor: ativo ? 'var(--color-primary)' : 'var(--color-border)',
                          background: ativo ? 'var(--color-primary)' : 'transparent',
                          color: ativo ? '#fff' : 'var(--color-muted-foreground)',
                        }}
                      >
                        <Icone nome={op.nome} className="h-[18px] w-[18px]" />
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          </Secao>

          {/* ---------------- 2. Linhas da ficha ---------------- */}
          <Secao
            numero={2}
            titulo="Itens do registro"
            resumo={`${totalFicha} de ${todasLinhasRegistro.length} linhas`}
            ordem={ordemBlocos.indexOf('REGISTRO') + 1}
            totalOrdens={totalOrdens}
            aoMudarOrdem={(nova) => moverOrdem('REGISTRO', nova)}
            aoSubir={() => subirOrdem('REGISTRO')}
            aoDescer={() => descerOrdem('REGISTRO')}
          >
            <p className="mb-3 text-sm" style={{ color: 'var(--color-muted-foreground)' }}>
              As linhas do topo da planilha, onde fica a ficha da unidade testada. Fabricante,
              modelo, nome comercial e o veredito "Homologado" ficam sempre — são o que identifica a
              coluna e o que ela conclui.
            </p>
            <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {todasLinhasRegistro.map((linha) => {
                const fixo = linha.fixo
                const marcada = fixo || campos.has(linha.chave)
                return (
                  <div
                    key={linha.chave}
                    className="flex items-center justify-between gap-1.5 py-0.5 text-sm"
                    style={fixo ? { color: 'var(--color-muted-foreground)' } : undefined}
                  >
                    <label
                      className="flex cursor-pointer items-center gap-2 min-w-0 flex-1"
                      title={fixo ? 'Sempre presente' : undefined}
                    >
                      <input
                        type="checkbox"
                        data-ficha={linha.chave}
                        checked={marcada}
                        disabled={fixo}
                        onChange={() => alternarCampo(linha.chave)}
                      />
                      <span className="truncate">{linha.rotulo}</span>
                      {fixo && <span className="text-xs opacity-70">fixo</span>}
                      {linha.customizado && (
                        <span
                          className="rounded px-1.5 py-0.2 text-[9px] font-semibold uppercase"
                          style={{ background: 'var(--gradient-brand-purple)', color: '#fff' }}
                        >
                          novo
                        </span>
                      )}
                    </label>
                    {!fixo && (
                      <button
                        type="button"
                        onClick={() => {
                          setRegistroEditandoChave(linha.chave)
                          setNovoNomeRegistro(linha.rotulo)
                        }}
                        title={`Editar "${linha.rotulo}"`}
                        className="opacity-40 hover:opacity-100 p-0.5 rounded transition-opacity"
                        style={{ color: 'var(--color-muted-foreground)' }}
                      >
                        <Icone nome="lapis" className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Rodapé do registro: cadastrar, editar e lixeira reativa */}
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
              <input
                value={novoNomeRegistro}
                onChange={(e) => setNovoNomeRegistro(e.target.value)}
                placeholder={
                  registroEditandoChave
                    ? 'Editar nome do item de registro…'
                    : 'Cadastrar novo item de registro…'
                }
                maxLength={60}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    salvarItemRegistro()
                  }
                }}
                className="min-w-36 flex-1 rounded-md border bg-transparent px-2.5 py-1 text-xs"
                style={{ borderColor: 'var(--color-input)' }}
              />
              {registroEditandoChave && (
                <button
                  type="button"
                  onClick={cancelarEdicaoRegistro}
                  className="rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-black/5"
                  style={{
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-muted-foreground)',
                  }}
                >
                  Cancelar
                </button>
              )}
              <button
                type="button"
                onClick={salvarItemRegistro}
                disabled={!novoNomeRegistro.trim()}
                className="rounded-md border px-3 py-1 text-xs font-semibold disabled:opacity-45 transition-all"
                style={{ borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }}
              >
                {registroEditandoChave ? 'Salvar' : 'Adicionar'}
              </button>
              <button
                type="button"
                disabled={flagadosRegistro === 0}
                onClick={excluirFlagadosRegistro}
                title={
                  flagadosRegistro > 0
                    ? `Excluir ${flagadosRegistro} item(ns) de registro flagado(s)`
                    : 'Flag uma ou mais opções para excluir'
                }
                className={`rounded-md border p-1.5 flex items-center justify-center transition-all ${
                  flagadosRegistro > 0
                    ? 'border-red-300 text-red-600 bg-red-50 hover:bg-red-100 hover:border-red-400 cursor-pointer shadow-xs active:scale-95'
                    : 'border-gray-200 text-gray-400 bg-gray-50/50 opacity-40 cursor-not-allowed'
                }`}
                style={
                  flagadosRegistro > 0
                    ? {
                        borderColor: 'rgba(239, 68, 68, 0.4)',
                        color: '#dc2626',
                        background: 'rgba(254, 242, 242, 0.8)',
                      }
                    : undefined
                  }
              >
                <Icone nome="lixeira" className="h-4 w-4" />
              </button>
            </div>
          </Secao>

          {/* ---------------- 3. Bateria de testes ---------------- */}
          <Secao
            numero={3}
            titulo="Bateria de testes"
            resumo={`${totalItens} ${totalItens === 1 ? 'item' : 'itens'}`}
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm" style={{ color: 'var(--color-muted-foreground)' }}>
                Selecione os itens a serem testados em cada bateria e defina a ordem de apresentação.
              </p>
              <button
                type="button"
                onClick={() => setCriandoNovaBateria(true)}
                className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold text-white shadow-xs transition-all hover:opacity-90 active:scale-95 cursor-pointer"
                style={{ background: 'var(--gradient-brand-purple)' }}
              >
                <span>+</span>
                <span>Nova bateria</span>
              </button>
            </div>

            {criandoNovaBateria && (
              <div
                className="mb-4 rounded-lg border p-4 space-y-3"
                style={{ background: 'var(--color-muted)', borderColor: 'var(--color-primary)' }}
              >
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--color-primary)' }}>
                    Cadastrar Nova Bateria de Testes
                  </h4>
                  <button
                    type="button"
                    onClick={cancelarNovaBateria}
                    className="text-xs hover:opacity-75 cursor-pointer"
                    style={{ color: 'var(--color-muted-foreground)' }}
                  >
                    ✕ Fechar
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    value={tituloNovaBateria}
                    onChange={(e) => setTituloNovaBateria(e.target.value)}
                    placeholder="Título da bateria (ex: Testes de Rede, Comunicação, etc.)…"
                    maxLength={60}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        salvarNovaBateria()
                      }
                    }}
                    className="min-w-64 flex-1 rounded-md border bg-transparent px-3 py-1.5 text-sm"
                    style={{ borderColor: 'var(--color-input)' }}
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={salvarNovaBateria}
                    disabled={!tituloNovaBateria.trim()}
                    className="rounded-md px-3.5 py-1.5 text-xs font-semibold text-white disabled:opacity-40 transition-all cursor-pointer"
                    style={{ background: 'var(--gradient-brand-purple)' }}
                  >
                    Adicionar bateria
                  </button>
                  <button
                    type="button"
                    onClick={cancelarNovaBateria}
                    className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-black/5 transition-colors cursor-pointer"
                    style={{ borderColor: 'var(--color-border)', color: 'var(--color-muted-foreground)' }}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {isLoading ? (
              <p className="text-sm" style={{ color: 'var(--color-muted-foreground)' }}>
                Carregando itens…
              </p>
            ) : (
              <div className="space-y-3">
                {bateriasOrdenadas.map((bateria) => {
                  const ordemAtual = ordemBlocos.indexOf(bateria.chave) + 1
                  return (
                    <PainelGrupo
                      key={bateria.chave}
                      grupo={bateria.chave}
                      titulo={bateria.titulo}
                      ordem={ordemAtual > 0 ? ordemAtual : totalOrdens}
                      totalOrdens={totalOrdens}
                      customizada={bateria.customizada}
                      itens={porGrupo.get(bateria.chave) ?? []}
                      selecionados={selecionados}
                      novos={novos.filter((n) => n.grupo === bateria.chave)}
                      itensEditados={itensCatalogoEditados}
                      aoAlternar={alternarItem}
                      aoDefinirTodos={(ligado) => definirGrupo(bateria.chave, ligado)}
                      aoAdicionar={(item) => setNovos((v) => [...v, item])}
                      aoSalvarEdicao={salvarEdicaoItemTeste}
                      aoRemoverNovo={(chave) =>
                        setNovos((v) => v.filter((n) => n.chave !== chave))
                      }
                      aoExcluirFlagados={() => excluirFlagadosGrupo(bateria.chave)}
                      aoMudarOrdem={(nova) => moverOrdem(bateria.chave, nova)}
                      aoSubir={() => subirOrdem(bateria.chave)}
                      aoDescer={() => descerOrdem(bateria.chave)}
                      aoRemoverBateria={() => removerBateria(bateria.chave)}
                    />
                  )
                })}
              </div>
            )}
          </Secao>

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
        </div>
      </div>

      {/* Barra de ação fixa: o formulário é longo e o botão não pode depender
          de rolar até o fim para reaparecer. */}
      <div
        className="shrink-0 border-t px-8 py-3"
        style={{ background: 'var(--color-sidebar)' }}
      >
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <p className="text-sm" style={{ color: 'var(--color-muted-foreground)' }}>
            {totalFicha} {totalFicha === 1 ? 'linha' : 'linhas'} na ficha ·{' '}
            <span style={{ color: totalItens === 0 ? 'var(--color-destructive-fg)' : undefined }}>
              {totalItens} {totalItens === 1 ? 'item' : 'itens'} de teste
            </span>
            {novos.length > 0 && ` (${novos.length} ${novos.length === 1 ? 'novo' : 'novos'})`}
          </p>
          <div className="flex items-center gap-2">
            {editando && (
              <button
                type="button"
                onClick={() => navegar('/registro/tipos')}
                className="rounded-md px-4 py-2 text-sm"
                style={{ color: 'var(--color-muted-foreground)' }}
              >
                Cancelar
              </button>
            )}
            <button
              type="submit"
              disabled={!podeEnviar}
              title={
                totalItens === 0
                  ? 'Marque ao menos um item de teste'
                  : nome.trim().length < 2
                    ? 'Dê um nome ao tipo'
                    : undefined
              }
              className="rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: 'var(--gradient-brand-purple)' }}
            >
              {salvando
                ? editando
                  ? 'Salvando…'
                  : 'Registrando…'
                : editando
                  ? 'Salvar alterações'
                  : 'Registrar tipo'}
            </button>
          </div>
        </div>
      </div>
    </form>
  )
}

// ============================================================

function Secao({
  numero,
  titulo,
  resumo,
  ordem,
  totalOrdens,
  aoMudarOrdem,
  aoSubir,
  aoDescer,
  children,
}: {
  numero: number
  titulo: string
  resumo?: string
  ordem?: number
  totalOrdens?: number
  aoMudarOrdem?: (n: number) => void
  aoSubir?: () => void
  aoDescer?: () => void
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border p-5" style={{ background: 'var(--color-card)' }}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <span
            className="text-sm font-semibold"
            style={{ color: 'var(--color-primary)' }}
          >
            {numero}.
          </span>
          <h3 className="text-sm font-semibold">{titulo}</h3>
          {resumo && (
            <span className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>
              {resumo}
            </span>
          )}
        </div>
        {ordem !== undefined && totalOrdens !== undefined && aoMudarOrdem && (
          <div
            className="flex items-center gap-1.5 rounded border px-2 py-0.5 text-xs font-semibold"
            style={{
              background: 'var(--color-muted)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-foreground)',
            }}
          >
            <span style={{ color: 'var(--color-muted-foreground)' }}>Ordem:</span>
            <select
              value={ordem}
              onChange={(e) => aoMudarOrdem(Number(e.target.value))}
              className="rounded border bg-transparent px-1 py-0.5 text-xs font-bold cursor-pointer"
              style={{ borderColor: 'var(--color-border)' }}
            >
              {Array.from({ length: totalOrdens }, (_, i) => i + 1).map((num) => (
                <option key={num} value={num}>
                  {num}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={ordem === 1}
              onClick={aoSubir}
              title="Mover para cima"
              className="hover:opacity-75 disabled:opacity-30 px-0.5 cursor-pointer"
            >
              ▲
            </button>
            <button
              type="button"
              disabled={ordem === totalOrdens}
              onClick={aoDescer}
              title="Mover para baixo"
              className="hover:opacity-75 disabled:opacity-30 px-0.5 cursor-pointer"
            >
              ▼
            </button>
          </div>
        )}
      </div>
      {children}
    </section>
  )
}

/**
 * Um tópico da bateria: os itens do catálogo, os que o técnico escreveu e o
 * campo para escrever mais um.
 */
function PainelGrupo({
  grupo,
  titulo,
  ordem,
  totalOrdens,
  customizada,
  itens,
  selecionados,
  novos,
  itensEditados,
  aoAlternar,
  aoDefinirTodos,
  aoAdicionar,
  aoSalvarEdicao,
  aoRemoverNovo,
  aoExcluirFlagados,
  aoMudarOrdem,
  aoSubir,
  aoDescer,
  aoRemoverBateria,
}: {
  grupo: string
  titulo: string
  ordem: number
  totalOrdens: number
  customizada?: boolean
  itens: ItemTeste[]
  selecionados: Set<string>
  novos: ItemNovo[]
  itensEditados: Map<string, { nome: string; descricaoAcao: string }>
  aoAlternar: (id: string) => void
  aoDefinirTodos: (ligado: boolean) => void
  aoAdicionar: (item: ItemNovo) => void
  aoSalvarEdicao: (idOuChave: string, ehNovo: boolean, nome: string, acao: string) => void
  aoRemoverNovo: (chave: string) => void
  aoExcluirFlagados: () => void
  aoMudarOrdem: (n: number) => void
  aoSubir: () => void
  aoDescer: () => void
  aoRemoverBateria?: () => void
}) {
  const [nome, setNome] = useState('')
  const [acao, setAcao] = useState('')
  const [itemEditando, setItemEditando] = useState<{ id: string; ehNovo: boolean } | null>(null)

  const marcados = itens.filter((i) => selecionados.has(i.id)).length
  const total = marcados + novos.length
  const temFlagados = marcados + novos.length > 0

  function submeter() {
    const n = nome.trim()
    if (!n) return
    const a = acao.trim() || n

    if (itemEditando) {
      aoSalvarEdicao(itemEditando.id, itemEditando.ehNovo, n, a)
      cancelarEdicao()
      return
    }

    aoAdicionar({
      chave: `${grupo}-${Date.now()}-${novos.length}`,
      grupo,
      nome: n,
      descricaoAcao: a,
    })
    setNome('')
    setAcao('')
  }

  function cancelarEdicao() {
    setItemEditando(null)
    setNome('')
    setAcao('')
  }

  function iniciarEdicao(id: string, ehNovo: boolean, nomeAtual: string, acaoAtual: string) {
    setItemEditando({ id, ehNovo })
    setNome(nomeAtual)
    setAcao(acaoAtual)
  }

  return (
    <div className="rounded-lg border" data-grupo-registro={grupo}>
      {/* Faixa roxa, como o cabeçalho da planilha: o tópico aqui e a coluna
          lá são o mesmo eixo, e o cinza de antes não separava um card do
          outro numa pilha de quatro. */}
      <div
        className="flex flex-wrap items-center gap-2 rounded-t-lg border-b px-3 py-2"
        style={{ background: 'var(--gradient-brand-purple)', color: '#fff' }}
      >
        <div className="flex items-center gap-1.5 rounded bg-white/20 px-2 py-0.5 text-xs font-semibold text-white">
          <span className="opacity-90">Ordem:</span>
          <select
            value={ordem}
            onChange={(e) => aoMudarOrdem(Number(e.target.value))}
            className="rounded border border-white/40 bg-transparent px-1 py-0.5 text-xs font-bold text-white cursor-pointer outline-none"
          >
            {Array.from({ length: totalOrdens }, (_, i) => i + 1).map((num) => (
              <option key={num} value={num} className="text-black">
                {num}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={ordem === 1}
            onClick={aoSubir}
            title="Mover para cima"
            className="hover:opacity-75 disabled:opacity-30 px-0.5 cursor-pointer"
          >
            ▲
          </button>
          <button
            type="button"
            disabled={ordem === totalOrdens}
            onClick={aoDescer}
            title="Mover para baixo"
            className="hover:opacity-75 disabled:opacity-30 px-0.5 cursor-pointer"
          >
            ▼
          </button>
        </div>

        <span className="text-sm font-semibold">{titulo}</span>
        <span className="text-xs text-white/70">
          {total} de {itens.length + novos.length}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <BotaoLeve marca="todos" rotulo="Todos" aoClicar={() => aoDefinirTodos(true)} />
          <BotaoLeve marca="nenhum" rotulo="Nenhum" aoClicar={() => aoDefinirTodos(false)} />
          {customizada && aoRemoverBateria && (
            <button
              type="button"
              onClick={aoRemoverBateria}
              title={`Remover bateria "${titulo}"`}
              className="rounded border px-2 py-0.5 text-xs text-white bg-red-500/30 hover:bg-red-500/50 transition-colors"
              style={{ borderColor: 'rgba(255,255,255,.38)' }}
            >
              Excluir bateria
            </button>
          )}
        </div>
      </div>

      {/* Três colunas a partir de lg: são 48 itens ao todo, e em duas o
          formulário virava uma tela e meia de rolagem */}
      <div className="grid gap-x-6 gap-y-1 px-3 py-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {itens.map((item) => {
          const editado = itensEditados.get(item.id)
          const nomeExibido = editado?.nome ?? item.nome
          const acaoExibida = editado?.descricaoAcao ?? item.descricaoAcao
          const marcado = selecionados.has(item.id)

          return (
            <div
              key={item.id}
              className="flex items-center justify-between gap-1.5 py-0.5 text-sm"
            >
              <label
                className="flex cursor-pointer items-center gap-2 min-w-0 flex-1"
                title={acaoExibida}
              >
                <input
                  type="checkbox"
                  data-item-catalogo={item.id}
                  checked={marcado}
                  onChange={() => aoAlternar(item.id)}
                />
                <span className="truncate">{nomeExibido}</span>
              </label>
              <button
                type="button"
                onClick={() => iniciarEdicao(item.id, false, nomeExibido, acaoExibida)}
                title={`Editar "${nomeExibido}"`}
                className="opacity-40 hover:opacity-100 p-0.5 rounded transition-opacity"
                style={{ color: 'var(--color-muted-foreground)' }}
              >
                <Icone nome="lapis" className="h-3 w-3" />
              </button>
            </div>
          )
        })}

        {novos.map((n) => (
          <div key={n.chave} className="flex items-center justify-between gap-1.5 py-0.5 text-sm">
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <span
                className="rounded px-1.5 py-0.2 text-[9px] font-semibold uppercase shrink-0"
                style={{ background: 'var(--gradient-brand-purple)', color: '#fff' }}
              >
                novo
              </span>
              <span className="truncate" title={n.descricaoAcao}>
                {n.nome}
              </span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => iniciarEdicao(n.chave, true, n.nome, n.descricaoAcao)}
                title={`Editar "${n.nome}"`}
                className="opacity-40 hover:opacity-100 p-0.5 rounded transition-opacity"
                style={{ color: 'var(--color-muted-foreground)' }}
              >
                <Icone nome="lapis" className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() => aoRemoverNovo(n.chave)}
                aria-label={`Remover ${n.nome}`}
                className="px-1 text-sm hover:opacity-70"
                style={{ color: 'var(--color-muted-foreground)' }}
              >
                ✕
              </button>
            </div>
          </div>
        ))}

        {itens.length === 0 && novos.length === 0 && (
          <p className="text-sm" style={{ color: 'var(--color-muted-foreground)' }}>
            Nenhum item no catálogo para este tópico — escreva o primeiro abaixo.
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t px-3 py-2.5">
        <input
          value={nome}
          data-novo-item
          onChange={(e) => setNome(e.target.value)}
          placeholder={itemEditando ? 'Editar nome da funcionalidade…' : 'Nome da funcionalidade…'}
          maxLength={200}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              submeter()
            }
          }}
          className="min-w-32 flex-1 rounded-md border bg-transparent px-2.5 py-1 text-xs"
          style={{ borderColor: 'var(--color-input)' }}
        />
        <input
          value={acao}
          data-nova-acao
          onChange={(e) => setAcao(e.target.value)}
          placeholder="Ação esperada no teste (opcional)…"
          maxLength={500}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              submeter()
            }
          }}
          className="min-w-32 flex-1 rounded-md border bg-transparent px-2.5 py-1 text-xs"
          style={{ borderColor: 'var(--color-input)' }}
        />
        {itemEditando && (
          <button
            type="button"
            onClick={cancelarEdicao}
            className="rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-black/5 transition-colors"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-muted-foreground)' }}
          >
            Cancelar
          </button>
        )}
        <button
          type="button"
          data-adicionar-item
          onClick={submeter}
          disabled={!nome.trim()}
          className="rounded-md border px-3 py-1 text-xs font-semibold disabled:opacity-45 transition-all"
          style={{ borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }}
        >
          {itemEditando ? 'Salvar' : 'Adicionar'}
        </button>
        <button
          type="button"
          disabled={!temFlagados}
          onClick={aoExcluirFlagados}
          title={
            temFlagados
              ? `Excluir ${marcados + novos.length} funcionalidade(s) flagada(s) deste modelo`
              : 'Flag uma ou mais funcionalidades para excluir'
          }
          className={`rounded-md border p-1.5 flex items-center justify-center transition-all ${
            temFlagados
              ? 'border-red-300 text-red-600 bg-red-50 hover:bg-red-100 hover:border-red-400 cursor-pointer shadow-xs active:scale-95'
              : 'border-gray-200 text-gray-400 bg-gray-50/50 opacity-40 cursor-not-allowed'
          }`}
          style={
            temFlagados
              ? {
                  borderColor: 'rgba(239, 68, 68, 0.4)',
                  color: '#dc2626',
                  background: 'rgba(254, 242, 242, 0.8)',
                }
              : undefined
          }
        >
          <Icone nome="lixeira" className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

function BotaoLeve({
  marca,
  rotulo,
  aoClicar,
}: {
  marca: string
  rotulo: string
  aoClicar: () => void
}) {
  return (
    <button
      type="button"
      data-marcar={marca}
      onClick={aoClicar}
      // Vive sobre a faixa roxa: traço branco e fundo translúcido, como o
      // hambúrguer do cabeçalho da planilha
      className="rounded border px-2 py-0.5 text-xs text-white transition-opacity hover:opacity-80"
      style={{ background: 'rgba(255,255,255,.14)', borderColor: 'rgba(255,255,255,.38)' }}
    >
      {rotulo}
    </button>
  )
}
