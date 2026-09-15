import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Iniciando limpeza de textos pré-prontos automáticos...')

  // 1. Limpar justificativas automáticas ("Migrado da planilha...")
  const resJustificativas = await prisma.resultado.updateMany({
    where: {
      justificativaTexto: {
        contains: 'Migrado da planilha de homologação PoS, onde a célula dizia apenas "Não"',
      },
    },
    data: {
      justificativaTexto: null,
    },
  })
  console.log(`Justificativas automáticas removidas: ${resJustificativas.count}`)

  // 2. Buscar todas as observações existentes para filtrar estritamente as automáticas
  const resultadosComObs = await prisma.resultado.findMany({
    where: {
      observacao: { not: null },
    },
    select: {
      id: true,
      observacao: true,
    },
  })

  const padraoAutomatico = /planilha de origem|planilha:|na planilha|Planilha:/i
  const idsLimparObs = resultadosComObs
    .filter((r) => r.observacao && padraoAutomatico.test(r.observacao))
    .map((r) => r.id)

  let obsRemovidas = 0
  if (idsLimparObs.length > 0) {
    const resObs = await prisma.resultado.updateMany({
      where: {
        id: { in: idsLimparObs },
      },
      data: {
        observacao: null,
      },
    })
    obsRemovidas = resObs.count
  }
  console.log(`Observações automáticas removidas: ${obsRemovidas}`)

  console.log('Limpeza concluída com sucesso.')
}

main()
  .catch((err) => {
    console.error('Erro ao executar limpeza:', err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
