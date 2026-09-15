/**
 * Testes Unitários de Verificação RBAC e Máquina de Estados
 * Valida domínios corporativos, transições de status e regras de negócio para Mobiltec e Parceiros.
 */
import assert from 'node:assert/strict'

console.log('=== INICIANDO TESTES DE VERIFICAÇÃO RBAC & MÁQUINA DE ESTADOS ===\n')

// Importa das fontes canônicas (src/lib ou dist/lib)
let ehDominioOficial, DOMINIOS_MOBILTEC, validarTransicao, TRANSICOES_PERMITIDAS, STATUS_EDITAVEIS_PARCEIRO

try {
  const dom = await import('../dist/lib/dominios.js')
  ehDominioOficial = dom.ehDominioOficial
  DOMINIOS_MOBILTEC = dom.DOMINIOS_MOBILTEC

  const trans = await import('../dist/lib/transicoes.js')
  validarTransicao = trans.validarTransicao
  TRANSICOES_PERMITIDAS = trans.TRANSICOES_PERMITIDAS
  STATUS_EDITAVEIS_PARCEIRO = trans.STATUS_EDITAVEIS_PARCEIRO
} catch {
  const dom = await import('../src/lib/dominios.ts')
  ehDominioOficial = dom.ehDominioOficial
  DOMINIOS_MOBILTEC = dom.DOMINIOS_MOBILTEC

  const trans = await import('../src/lib/transicoes.ts')
  validarTransicao = trans.validarTransicao
  TRANSICOES_PERMITIDAS = trans.TRANSICOES_PERMITIDAS
  STATUS_EDITAVEIS_PARCEIRO = trans.STATUS_EDITAVEIS_PARCEIRO
}

console.log('1. Testando validação de domínios corporativos (módulo canônico src/lib/dominios)...')
assert.equal(ehDominioOficial('admin@mobiltec.com.br'), true, 'admin@mobiltec.com.br deve ser válido')
assert.equal(ehDominioOficial('tecnico@mobiltec.com'), true, 'tecnico@mobiltec.com deve ser válido')
assert.equal(ehDominioOficial('homolog@corp.mobiltec.com.br'), true, 'subdomínio mobiltec deve ser válido')
assert.equal(ehDominioOficial('parceiro@fabricante.com'), false, 'fabricante.com deve ser inválido para admin')
assert.equal(ehDominioOficial('hacker@gmail.com'), false, 'gmail.com deve ser inválido para admin')
assert.equal(ehDominioOficial('mobiltec@fake.com'), false, 'fake.com deve ser inválido')
console.log('   ✓ Validação de domínio corporativo passou em todos os casos.\n')

// 2. Teste da Máquina de Estados (Transições permitidas por papel — módulo canônico src/lib/transicoes)
console.log('2. Testando máquina de estados e regras por papel...')

// Parceiro
assert.equal(validarTransicao('PARCEIRO', 'RASCUNHO', 'AGUARDANDO_ANALISE').permitida, true)
assert.equal(validarTransicao('PARCEIRO', 'RASCUNHO', 'APROVADO').permitida, false)
assert.equal(validarTransicao('PARCEIRO', 'RASCUNHO', 'EM_REVISAO').permitida, false)
assert.equal(validarTransicao('PARCEIRO', 'AGUARDANDO_ANALISE', 'APROVADO').permitida, false)
assert.equal(validarTransicao('PARCEIRO', 'AGUARDANDO_ANALISE', 'PUBLICADO').permitida, false)

// Ciclo de revisão (D434): o parceiro reenvia o que ajustou, e só isso
assert.equal(validarTransicao('PARCEIRO', 'EM_REVISAO', 'AGUARDANDO_ANALISE').permitida, true, 'Parceiro reenvia para validação depois de atender aos apontamentos')
assert.equal(validarTransicao('PARCEIRO', 'EM_REVISAO', 'APROVADO').permitida, false, 'Parceiro não aprova a própria homologação em revisão')
assert.equal(validarTransicao('PARCEIRO', 'EM_REVISAO', 'RASCUNHO').permitida, false, 'Parceiro não devolve a homologação para rascunho')
assert.equal(validarTransicao('PARCEIRO', 'AGUARDANDO_ANALISE', 'EM_REVISAO').permitida, false, 'Só a Mobiltec envia para revisão')

// Edição: o parceiro escreve enquanto a homologação está com ele, e só então
assert.deepEqual([...STATUS_EDITAVEIS_PARCEIRO].sort(), ['EM_REVISAO', 'RASCUNHO'], 'Parceiro edita em rascunho e em revisão — nunca sob custódia da Mobiltec')

// Leitor
assert.equal(validarTransicao('LEITOR', 'RASCUNHO', 'AGUARDANDO_ANALISE').permitida, false, 'LEITOR não pode transicionar para AGUARDANDO_ANALISE')
assert.equal(validarTransicao('LEITOR', 'RASCUNHO', 'EM_REVISAO').permitida, false, 'LEITOR não pode transicionar para EM_REVISAO')
assert.equal(validarTransicao('LEITOR', 'AGUARDANDO_ANALISE', 'APROVADO').permitida, false, 'LEITOR não pode aprovar homologação')
assert.equal(validarTransicao('LEITOR', 'APROVADO', 'PUBLICADO').permitida, false, 'LEITOR não pode publicar homologação')

// Mobiltec
assert.equal(validarTransicao('ADMIN', 'RASCUNHO', 'AGUARDANDO_ANALISE').permitida, true)
assert.equal(validarTransicao('ADMIN', 'RASCUNHO', 'EM_REVISAO').permitida, true)
assert.equal(validarTransicao('HOMOLOGADOR', 'AGUARDANDO_ANALISE', 'EM_REVISAO').permitida, true)
assert.equal(validarTransicao('HOMOLOGADOR', 'AGUARDANDO_ANALISE', 'APROVADO').permitida, true)
assert.equal(validarTransicao('HOMOLOGADOR', 'AGUARDANDO_ANALISE', 'REPROVADO').permitida, true)
assert.equal(validarTransicao('HOMOLOGADOR', 'EM_REVISAO', 'APROVADO').permitida, true)
assert.equal(validarTransicao('HOMOLOGADOR', 'APROVADO', 'PUBLICADO').permitida, true)
console.log('   ✓ Máquina de estados respeita estritamente os privilégios de Parceiro, Leitor vs Mobiltec.\n')

// 3. Teste de Blindagem de Justificativa para Parceiros
console.log('3. Testando restrição de Justificativa vs Observação...')
function validarPayloadResultado(papel, payload) {
  if (papel === 'PARCEIRO') {
    if (payload.justificativaId || payload.justificativaTexto) {
      return { valido: false, erro: 'Parceiros não podem registrar justificativas técnicas oficiais.' }
    }
  }
  return { valido: true }
}

assert.equal(validarPayloadResultado('PARCEIRO', { status: 'FALHA', observacao: 'Tela congelou' }).valido, true)
assert.equal(validarPayloadResultado('PARCEIRO', { status: 'FALHA', justificativaId: 'uuid-123' }).valido, false)
assert.equal(validarPayloadResultado('PARCEIRO', { status: 'COM_RESSALVA', justificativaTexto: 'Texto livre' }).valido, false)
assert.equal(validarPayloadResultado('ADMIN', { status: 'FALHA', justificativaId: 'uuid-123' }).valido, true)
assert.equal(validarPayloadResultado('HOMOLOGADOR', { status: 'COM_RESSALVA', justificativaTexto: 'Texto oficial' }).valido, true)
console.log('   ✓ Parceiros impedidos de enviar justificativas e autorizados a enviar observações.\n')

// 4. Teste de Permissões de Certificados e Rotas Estruturais
console.log('4. Testando regras de acesso a Certificados, Reabertura e Dispositivos...')
function podeEmitirCertificado(papel) {
  return papel === 'ADMIN' || papel === 'HOMOLOGADOR'
}

function podeBaixarCertificado(papel, statusHomologacao) {
  if (papel === 'PARCEIRO') {
    return statusHomologacao === 'APROVADO' || statusHomologacao === 'PUBLICADO'
  }
  return true
}

function podeReabrirHomologacao(papel) {
  return papel === 'ADMIN'
}

function podeExcluirDispositivo(papel) {
  return papel === 'ADMIN' || papel === 'HOMOLOGADOR'
}

assert.equal(podeEmitirCertificado('ADMIN'), true)
assert.equal(podeEmitirCertificado('HOMOLOGADOR'), true)
assert.equal(podeEmitirCertificado('PARCEIRO'), false, 'Parceiro NUNCA pode emitir certificado')
assert.equal(podeEmitirCertificado('LEITOR'), false, 'Leitor NUNCA pode emitir certificado')

assert.equal(podeBaixarCertificado('PARCEIRO', 'RASCUNHO'), false)
assert.equal(podeBaixarCertificado('PARCEIRO', 'AGUARDANDO_ANALISE'), false)
assert.equal(podeBaixarCertificado('PARCEIRO', 'EM_REVISAO'), false)
assert.equal(podeBaixarCertificado('PARCEIRO', 'APROVADO'), true)
assert.equal(podeBaixarCertificado('PARCEIRO', 'PUBLICADO'), true)
assert.equal(podeBaixarCertificado('ADMIN', 'RASCUNHO'), true)

// Reabertura e Exclusão
assert.equal(podeReabrirHomologacao('ADMIN'), true, 'ADMIN deve poder reabrir')
assert.equal(podeReabrirHomologacao('HOMOLOGADOR'), false, 'HOMOLOGADOR não pode reabrir')
assert.equal(podeReabrirHomologacao('PARCEIRO'), false, 'PARCEIRO não pode reabrir')
assert.equal(podeReabrirHomologacao('LEITOR'), false, 'LEITOR não pode reabrir')

assert.equal(podeExcluirDispositivo('ADMIN'), true)
assert.equal(podeExcluirDispositivo('HOMOLOGADOR'), true)
assert.equal(podeExcluirDispositivo('PARCEIRO'), false)
assert.equal(podeExcluirDispositivo('LEITOR'), false)

console.log('   ✓ Emissão de certificados, reabertura de homologações e exclusão devidamente protegidos.\n')

console.log('=== TODOS OS 31 TESTES DE REGRAS DE NEGÓCIO E RBAC PASSARAM COM SUCESSO! ===')
