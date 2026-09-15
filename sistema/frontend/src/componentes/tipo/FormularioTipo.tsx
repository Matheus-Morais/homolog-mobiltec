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
import { FICHA_FIXA, GRUPO_ORDEM, LINHAS_FICHA, ROTULO_GRUPO } from '@/lib/tipos'
import type { ChaveFicha, GrupoItem, ItemTeste } from '@/lib/tipos'

/** Item escrito na hora pelo técnico, ainda sem id no banco */
interface ItemNovo {
  /** Chave local só para a lista do formulário */
  chave: string
  grupo: GrupoItem
  nome: string
  descricaoAcao: string
}

/**
 * O formulário de um tipo de dispositivo — o mesmo para criar e para editar.
 *
 * A planilha de homologação sempre teve a mesma forma — ficha em cima, quatro
 * tópicos de teste embaixo — mas o conteúdo era fixo no banco: três tipos,
 * todos herdando as mesmas 48 linhas. Aqui o técnico monta o seu: escolhe as
 * linhas da ficha que fazem sentido (impressora não tem IMEI), marca item a
 * item o que vai ser testado em cada tópico e, se faltar alguma coisa, escreve
 * o item e diz a que tópico ele pertence.
 *
 * O que sai daqui é uma categoria com bateria própria. Só os modelos
 * cadastrados neste tipo herdam essa bateria — os outros tipos não são tocados.
 *
 * Criar e editar são os mesmos campos; mantê-los em dois componentes garantiria
 * que um dia divergissem. O que muda é o destino e o que acontece depois.
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

  /** Itens do catálogo agrupados por tópico */
  const porGrupo = useMemo(() => {
    const mapa = new Map<GrupoItem, ItemTeste[]>()
    for (const g of GRUPO_ORDEM) mapa.set(g, [])
    for (const item of catalogo ?? []) mapa.get(item.grupo)?.push(item)
    return mapa
  }, [catalogo])

  // `marcados` nasce nulo porque o catálogo chega depois da primeira pintura;
  // até lá, "todos marcados" é o conjunto inteiro que acabou de carregar.
  const selecionados = marcados ?? new Set((catalogo ?? []).map((i) => i.id))

  const totalItens = selecionados.size + novos.length
  const totalFicha = LINHAS_FICHA.filter(
    (l) => campos.has(l.chave) || FICHA_FIXA.includes(l.chave),
  ).length

  function alternarCampo(chave: ChaveFicha) {
    setCampos((atual) => {
      const proximo = new Set(atual)
      if (proximo.has(chave)) proximo.delete(chave)
      else proximo.add(chave)
      return proximo
    })
  }

  function alternarItem(id: string) {
    const proximo = new Set(selecionados)
    if (proximo.has(id)) proximo.delete(id)
    else proximo.add(id)
    setMarcados(proximo)
  }

  function definirGrupo(grupo: GrupoItem, ligado: boolean) {
    const proximo = new Set(selecionados)
    for (const item of porGrupo.get(grupo) ?? []) {
      if (ligado) proximo.add(item.id)
      else proximo.delete(item.id)
    }
    setMarcados(proximo)
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    const payload = {
      nome: nome.trim(),
      icone,
      camposFicha: LINHAS_FICHA.map((l) => l.chave).filter(
        (c) => campos.has(c) || FICHA_FIXA.includes(c),
      ),
      itensExistentes: [...selecionados],
      itensNovos: novos.map(({ grupo, nome, descricaoAcao }) => ({ grupo, nome, descricaoAcao })),
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

  return (
    <form onSubmit={enviar} className="h-full flex flex-col">
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="mx-auto max-w-5xl space-y-6">
          <header>
            <h2 className="text-lg font-semibold">
              {editando ? `Editar "${tipo.nome}"` : 'Registrar tipo de dispositivo'}
            </h2>
            <p className="mt-1 text-sm" style={{ color: 'var(--color-muted-foreground)' }}>
              {editando ? (
                <>
                  As homologações ainda abertas deste tipo acompanham a bateria: item marcado agora
                  nasce pendente nelas, item desmarcado sai — mas o que já foi avaliado fica.
                  Homologação finalizada não é tocada, e o endereço da planilha (
                  <code>/matriz/{tipo.slug}</code>) não muda com o nome.
                </>
              ) : (
                <>
                  O tipo entra no menu à esquerda com a planilha dele. A forma é sempre a mesma —
                  ficha em cima, os quatro tópicos de teste embaixo —; o que muda é o que você marca
                  aqui, e só os modelos cadastrados neste tipo herdam essa bateria.
                </>
              )}
            </p>
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
            resumo={`${totalFicha} de ${LINHAS_FICHA.length} linhas`}
          >
            <p className="mb-3 text-sm" style={{ color: 'var(--color-muted-foreground)' }}>
              As linhas do topo da planilha, onde fica a ficha da unidade testada. Fabricante,
              modelo, nome comercial e o veredito "Homologado" ficam sempre — são o que identifica a
              coluna e o que ela conclui.
            </p>
            <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {LINHAS_FICHA.map((linha) => {
                const fixo = FICHA_FIXA.includes(linha.chave)
                return (
                  <label
                    key={linha.chave}
                    className="flex cursor-pointer items-center gap-2 py-0.5 text-sm"
                    style={fixo ? { color: 'var(--color-muted-foreground)' } : undefined}
                    title={fixo ? 'Sempre presente' : undefined}
                  >
                    <input
                      type="checkbox"
                      data-ficha={linha.chave}
                      checked={fixo || campos.has(linha.chave)}
                      disabled={fixo}
                      onChange={() => alternarCampo(linha.chave)}
                    />
                    <span className="truncate">{linha.rotulo}</span>
                    {fixo && <span className="text-xs opacity-70">fixo</span>}
                  </label>
                )
              })}
            </div>
          </Secao>

          {/* ---------------- 3. Bateria de testes ---------------- */}
          <Secao
            numero={3}
            titulo="Bateria de testes"
            resumo={`${totalItens} ${totalItens === 1 ? 'item' : 'itens'}`}
          >
            <p className="mb-3 text-sm" style={{ color: 'var(--color-muted-foreground)' }}>
              Os quatro tópicos existem em todo tipo de dispositivo; o que você escolhe é o que cai
              dentro de cada um. Faltando alguma coisa, escreva o item no tópico a que ele pertence.
            </p>

            {isLoading ? (
              <p className="text-sm" style={{ color: 'var(--color-muted-foreground)' }}>
                Carregando itens…
              </p>
            ) : (
              <div className="space-y-3">
                {GRUPO_ORDEM.map((grupo) => (
                  <PainelGrupo
                    key={grupo}
                    grupo={grupo}
                    itens={porGrupo.get(grupo) ?? []}
                    selecionados={selecionados}
                    novos={novos.filter((n) => n.grupo === grupo)}
                    aoAlternar={alternarItem}
                    aoDefinirTodos={(ligado) => definirGrupo(grupo, ligado)}
                    aoAdicionar={(item) => setNovos((v) => [...v, item])}
                    aoRemoverNovo={(chave) =>
                      setNovos((v) => v.filter((n) => n.chave !== chave))
                    }
                  />
                ))}
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
  children,
}: {
  numero: number
  titulo: string
  resumo?: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border p-5" style={{ background: 'var(--color-card)' }}>
      <div className="mb-3 flex items-baseline gap-2">
        <span
          className="text-sm font-semibold"
          style={{ color: 'var(--color-primary)' }}
        >
          {numero}.
        </span>
        <h3 className="text-sm font-semibold">{titulo}</h3>
        {resumo && (
          <span className="ml-auto text-xs" style={{ color: 'var(--color-muted-foreground)' }}>
            {resumo}
          </span>
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
  itens,
  selecionados,
  novos,
  aoAlternar,
  aoDefinirTodos,
  aoAdicionar,
  aoRemoverNovo,
}: {
  grupo: GrupoItem
  itens: ItemTeste[]
  selecionados: Set<string>
  novos: ItemNovo[]
  aoAlternar: (id: string) => void
  aoDefinirTodos: (ligado: boolean) => void
  aoAdicionar: (item: ItemNovo) => void
  aoRemoverNovo: (chave: string) => void
}) {
  const [nome, setNome] = useState('')
  const [acao, setAcao] = useState('')

  const marcados = itens.filter((i) => selecionados.has(i.id)).length
  const total = marcados + novos.length

  function adicionar() {
    const n = nome.trim()
    if (!n) return
    aoAdicionar({
      chave: `${grupo}-${Date.now()}-${novos.length}`,
      grupo,
      nome: n,
      // O certificado imprime a ação realizada em cada item; sem texto, o
      // próprio nome descreve o que foi feito.
      descricaoAcao: acao.trim() || n,
    })
    setNome('')
    setAcao('')
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
        <span className="text-sm font-semibold">{ROTULO_GRUPO[grupo]}</span>
        <span className="text-xs text-white/70">
          {total} de {itens.length + novos.length}
        </span>
        <div className="ml-auto flex gap-1.5">
          <BotaoLeve marca="todos" rotulo="Todos" aoClicar={() => aoDefinirTodos(true)} />
          <BotaoLeve marca="nenhum" rotulo="Nenhum" aoClicar={() => aoDefinirTodos(false)} />
        </div>
      </div>

      {/* Três colunas a partir de lg: são 48 itens ao todo, e em duas o
          formulário virava uma tela e meia de rolagem */}
      <div className="grid gap-x-6 gap-y-1 px-3 py-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {itens.map((item) => (
          <label
            key={item.id}
            className="flex cursor-pointer items-center gap-2 py-0.5 text-sm"
            title={item.descricaoAcao}
          >
            <input
              type="checkbox"
              data-item-catalogo={item.id}
              checked={selecionados.has(item.id)}
              onChange={() => aoAlternar(item.id)}
            />
            <span className="truncate">{item.nome}</span>
          </label>
        ))}

        {novos.map((n) => (
          <div key={n.chave} className="flex items-center gap-2 py-0.5 text-sm">
            <span
              className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase"
              style={{ background: 'var(--gradient-brand-purple)', color: '#fff' }}
            >
              novo
            </span>
            <span className="truncate" title={n.descricaoAcao}>
              {n.nome}
            </span>
            <button
              type="button"
              onClick={() => aoRemoverNovo(n.chave)}
              aria-label={`Remover ${n.nome}`}
              className="ml-auto shrink-0 px-1 text-sm hover:opacity-70"
              style={{ color: 'var(--color-muted-foreground)' }}
            >
              ✕
            </button>
          </div>
        ))}

        {itens.length === 0 && novos.length === 0 && (
          <p className="text-sm" style={{ color: 'var(--color-muted-foreground)' }}>
            Nenhum item no catálogo para este tópico — escreva o primeiro abaixo.
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2 border-t px-3 py-2.5">
        <input
          value={nome}
          data-novo-item
          onChange={(e) => setNome(e.target.value)}
          maxLength={200}
          // Enter dentro de um input submeteria o formulário inteiro; aqui ele
          // só adiciona o item, que é o que a tecla significa neste campo.
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              adicionar()
            }
          }}
          className="min-w-40 flex-1 rounded-md border bg-transparent px-2.5 py-1.5 text-sm"
          style={{ borderColor: 'var(--color-input)' }}
        />
        <input
          value={acao}
          data-nova-acao
          onChange={(e) => setAcao(e.target.value)}
          maxLength={500}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              adicionar()
            }
          }}
          className="min-w-40 flex-1 rounded-md border bg-transparent px-2.5 py-1.5 text-sm"
          style={{ borderColor: 'var(--color-input)' }}
        />
        <button
          type="button"
          data-adicionar-item
          onClick={adicionar}
          disabled={!nome.trim()}
          className="rounded-md border px-3 py-1.5 text-sm font-medium disabled:opacity-45"
          style={{ borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }}
        >
          Adicionar
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
