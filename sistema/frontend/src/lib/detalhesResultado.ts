export interface EntradaDetalhesResultado {
  justificativaTexto?: string | null
  justificativa?: { texto?: string | null } | null
  observacao?: string | null
}

export interface SecaoDetalheResultado {
  rotulo: 'Justificativa' | 'Observação da funcionalidade'
  texto: string
}

/**
 * Compõe o conteúdo adicional de uma funcionalidade sem fazer a observação
 * competir com a justificativa. A ordem acompanha a leitura do resultado:
 * primeiro a razão do status, depois a nota registrada sobre a funcionalidade.
 */
export function comporDetalhesResultado(
  resultado: EntradaDetalhesResultado,
): SecaoDetalheResultado[] {
  const secoes: SecaoDetalheResultado[] = []
  const justificativa = resultado.justificativaTexto ?? resultado.justificativa?.texto ?? null

  if (justificativa) {
    secoes.push({ rotulo: 'Justificativa', texto: justificativa })
  }

  if (resultado.observacao) {
    secoes.push({
      rotulo: 'Observação da funcionalidade',
      texto: resultado.observacao,
    })
  }

  return secoes
}
