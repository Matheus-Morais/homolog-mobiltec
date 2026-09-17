/**
 * O apontamento que a Mobiltec deixou ao enviar a homologação para revisão.
 *
 * Existe porque o motivo era gravado em `HistoricoStatus` e nunca lido (D435):
 * o dispositivo voltava para a bancada do parceiro sem dizer o que ajustar.
 * Aparece em três lugares, sempre com o mesmo texto — matriz, ficha de
 * informações e painel do parceiro.
 */
export function AvisoRevisao({
  motivo,
  solicitadoEm,
  solicitadoPor,
  comoAgir = false,
}: {
  motivo: string | null
  solicitadoEm?: string | null
  solicitadoPor?: string | null
  /**
   * Acrescenta a instrução de o que fazer em seguida. Só para quem pode agir
   * — o parceiro na matriz. Para o Admin o aviso é informação, não tarefa.
   */
  comoAgir?: boolean
}) {
  return (
    <div
      className="rounded-lg border px-4 py-3 text-xs"
      style={{
        background: 'var(--color-warning-soft)',
        borderColor: 'var(--color-brand-orange)',
        color: 'var(--color-warning-fg)',
      }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-bold uppercase tracking-wider text-[11px]">
          ⚠ Em revisão — ajustes solicitados pela Mobiltec
        </p>
        {(solicitadoEm || solicitadoPor) && (
          <p className="opacity-80">
            {solicitadoPor}
            {solicitadoPor && solicitadoEm && ' · '}
            {solicitadoEm && formatarDataHora(solicitadoEm)}
          </p>
        )}
      </div>

      <p className="mt-1.5 leading-relaxed whitespace-pre-wrap font-medium">
        {motivo?.trim() || 'Nenhum apontamento foi registrado nesta solicitação.'}
      </p>

      {comoAgir && (
        <p className="mt-2 opacity-80">
          Faça as correções necessárias e use <strong>Enviar para Validação</strong> no menu da
          coluna para devolver o dispositivo à análise da Mobiltec.
        </p>
      )}
    </div>
  )
}

function formatarDataHora(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
