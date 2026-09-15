import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contextos/AuthContext'
import { ErroApi } from '@/lib/api'
import { LogoMobiltec } from '@/componentes/LogoMobiltec'

export function Login() {
  const { entrar, autenticado } = useAuth()
  const navegar = useNavigate()
  const localizacao = useLocation()

  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [exibirSenha, setExibirSenha] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const destino = (localizacao.state as { de?: string } | null)?.de ?? '/'

  if (autenticado) return <Navigate to={destino} replace />

  /**
   * O botão existe, o login não.
   *
   * Entrar com a conta Microsoft exige um app registrado no Entra ID e uma
   * rota de callback no backend — nada disso está feito. Em vez de abrir um
   * fluxo que não volta, o botão diz o que falta: um botão de login que
   * silenciosamente não faz nada é pior do que botão nenhum.
   */
  function entrarComMicrosoft() {
    setErro(
      'O login com conta Microsoft ainda não está configurado. Use e-mail e senha por enquanto.',
    )
  }

  async function aoEnviar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    setEnviando(true)
    try {
      await entrar(email, senha)
      navegar(destino, { replace: true })
    } catch (err) {
      setErro(
        err instanceof ErroApi
          ? err.message
          : 'Não foi possível conectar ao servidor. Verifique se o backend está rodando.',
      )
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Barra superior de marca: a de baixo espelhada.
          A de baixo é `purple-deep 0% → primary 45% → orange 100%`; refletir
          troca as pontas e leva a parada do meio para 55%. Sai laranja do lado
          do painel roxo e roxo do lado branco, com a mesma transição longa —
          uma tentativa anterior segurava o laranja num patamar até 30% e a
          barra ficava chapada demais. As duas agora são a mesma peça. */}
      <div
        data-barra-topo
        style={{
          height: 4,
          background:
            'linear-gradient(90deg, var(--color-brand-orange) 0%,' +
            ' var(--color-primary) 55%, var(--color-brand-purple-deep) 100%)',
        }}
      />

      <div className="flex-1 grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* Painel de marca */}
        <div
          className="hidden lg:flex flex-col justify-between p-12 text-white relative overflow-hidden"
          style={{
            background:
              'linear-gradient(150deg, var(--color-brand-purple) 0%, var(--color-primary) 55%, var(--color-brand-purple-deep) 100%)',
          }}
        >
          {/* Malha quadriculada: entra forte no topo e desaparece antes da
              metade, então serve de textura sem virar padrão de fundo. */}
          <div
            aria-hidden
            data-textura
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage:
                'linear-gradient(to right, rgba(255,255,255,.07) 1px, transparent 1px),' +
                'linear-gradient(to bottom, rgba(255,255,255,.07) 1px, transparent 1px)',
              backgroundSize: '64px 64px',
              WebkitMaskImage:
                'linear-gradient(to bottom, #000 0%, rgba(0,0,0,.4) 32%, transparent 55%)',
              maskImage:
                'linear-gradient(to bottom, #000 0%, rgba(0,0,0,.4) 32%, transparent 55%)',
            }}
          />

          {/* Slot vazio: a chamada continua centrada pelo `justify-between` */}
          <div />

          {/* `-translate-y-5` sobe o bloco ~19px sem tocar em mais nada: a
              divisão da tela, o cartão da direita e os espaçadores do
              `justify-between` continuam onde estavam. */}
          <div className="max-w-md relative z-10 -translate-y-5">
            {/* Assinatura do produto: só o nome, sem cápsula, sem contorno e
                sem sombra — nada que sugira botão. Sobre o painel roxo o
                branco fica em 9:1 e o laranja da marca em 3:1, então aqui o
                `brand-orange` puro serve, diferente do que acontecia sobre a
                pastilha de vidro. */}
            <p data-produto className="mb-5 text-xl font-bold tracking-tight text-white">
              cloud
              <span style={{ color: 'var(--color-brand-orange)' }}>4</span>
              mobile
            </p>

            <h1 className="text-4xl font-bold leading-tight">Painel de Homologação</h1>

            <p className="mt-4 text-lg opacity-80 leading-relaxed">
              Resultados de testes, matriz comparativa
              <br />e certificado técnico em um só lugar.
            </p>
          </div>

          {/* Espaçador do tamanho do rodapé que saiu: mantém a chamada na
              mesma altura de antes. */}
          <div className="h-4" />

          {/* Brilho suave, para o roxo chapado não ficar seco */}
          <div
            aria-hidden
            className="absolute -bottom-32 -left-24 w-96 h-96 rounded-full"
            style={{ background: 'rgba(255,255,255,.07)', filter: 'blur(60px)' }}
          />
        </div>

        {/* Formulário */}
        <div className="relative flex items-center justify-center p-6 overflow-hidden">
          {/* Sem manchas de cor no fundo: o que dá profundidade agora são o
              painel roxo ao lado e a sombra do cartão do formulário. */}

          <form
            onSubmit={aoEnviar}
            className="relative w-full max-w-[26rem] rounded-xl border overflow-hidden shadow-lg"
            style={{ background: 'var(--color-card)' }}
          >
            {/* Fio de marca do cartão do formulário */}
            <div
              style={{
                height: 4,
                background:
                  'linear-gradient(90deg, var(--color-brand-orange) 0%, var(--color-primary) 60%, var(--color-brand-purple-deep) 100%)',
              }}
            />

            <div className="p-8">
              <div className="flex items-center gap-3 pb-6 mb-6 border-b">
                <LogoMobiltec className="h-10 w-auto" />
                <div className="h-8 w-px" style={{ background: 'var(--color-border)' }} />
                <p className="text-xs leading-tight" style={{ color: 'var(--color-muted-foreground)' }}>
                  Homologação
                  <br />
                  de Dispositivos
                </p>
              </div>

              {/* Sem título nem subtítulo: o cartão já diz "Homologação de
                  Dispositivos" ao lado da logo, e o botão diz "Entrar". */}
              <div className="space-y-4">
                <div>
                  <label htmlFor="email" className="label-caps block mb-1.5">
                    E-mail
                  </label>
                  <input
                    id="email"
                    type="email"
                    required
                    autoFocus
                    autoComplete="username"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-md border text-sm transition-colors"
                    style={{ borderColor: 'var(--color-input)', background: 'var(--color-muted)' }}
                  />
                </div>

                <div>
                  <label htmlFor="senha" className="label-caps block mb-1.5">
                    Senha
                  </label>
                  <input
                    id="senha"
                    type={exibirSenha ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-md border text-sm transition-colors"
                    style={{ borderColor: 'var(--color-input)', background: 'var(--color-muted)' }}
                  />

                  {/* Marcador, e não um olho dentro do campo: numa senha
                      digitada errada o que se quer é ver o que está escrito
                      enquanto se corrige, com o estado à vista. */}
                  <label className="mt-2 flex w-fit cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      data-exibir-senha
                      checked={exibirSenha}
                      onChange={(e) => setExibirSenha(e.target.checked)}
                    />
                    <span style={{ color: 'var(--color-muted-foreground)' }}>Exibir senha</span>
                  </label>
                </div>
              </div>

              {erro && (
                <div
                  role="alert"
                  className="mt-4 px-3 py-2.5 rounded-md text-sm"
                  style={{
                    background: 'var(--color-destructive-soft)',
                    color: 'var(--color-destructive-fg)',
                  }}
                >
                  {erro}
                </div>
              )}

              <button
                type="submit"
                disabled={enviando}
                // Gradiente, mas só dentro do roxo: era a parada laranja que
                // cortava o botão em faixas visíveis.
                className="mt-6 w-full py-2.5 rounded-md font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                style={{
                  background:
                    'linear-gradient(90deg, var(--color-brand-purple) 0%, var(--color-primary) 45%, var(--color-brand-purple-deep) 100%)',
                }}
              >
                {enviando ? 'Entrando…' : 'Entrar'}
              </button>

              {/* Separador "ou" */}
              <div className="mt-5 flex items-center gap-3" aria-hidden>
                <div className="h-px flex-1" style={{ background: 'var(--color-border)' }} />
                <span className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>
                  ou
                </span>
                <div className="h-px flex-1" style={{ background: 'var(--color-border)' }} />
              </div>

              <button
                type="button"
                onClick={entrarComMicrosoft}
                className="mt-4 flex w-full items-center justify-center gap-2.5 rounded-md border py-2.5 text-sm font-medium transition-colors hover:opacity-90"
                style={{ background: 'var(--color-card)' }}
              >
                <LogoMicrosoft />
                Entrar com Microsoft
              </button>

              <p
                className="mt-6 text-center text-xs"
                style={{ color: 'var(--color-muted-foreground)' }}
              >
                © Mobiltec
              </p>
            </div>
          </form>
        </div>
      </div>

      {/* Barra inferior de marca */}
      <div
        data-barra-base
        style={{
          height: 4,
          background:
            'linear-gradient(90deg, var(--color-brand-purple-deep) 0%, var(--color-primary) 45%, var(--color-brand-orange) 100%)',
        }}
      />
    </div>
  )
}

/**
 * Marca da Microsoft: quatro quadrados nas cores oficiais.
 *
 * Inline, e não arquivo em `public/`: são 4 retângulos, e um SVG externo só
 * para isso seria mais requisição do que desenho.
 */
function LogoMicrosoft() {
  return (
    <svg viewBox="0 0 23 23" className="h-4 w-4 shrink-0" aria-hidden focusable="false">
      <rect x="1" y="1" width="10" height="10" fill="#f25022" />
      <rect x="12" y="1" width="10" height="10" fill="#7fba00" />
      <rect x="1" y="12" width="10" height="10" fill="#00a4ef" />
      <rect x="12" y="12" width="10" height="10" fill="#ffb900" />
    </svg>
  )
}
