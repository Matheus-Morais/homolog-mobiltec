# Ajustes no fluxo de revisão de dispositivos verification

**Verdict**: PASS
**Profile**: standard
**Diff range**: 747a7fa..HEAD
**Round**: 1 - full
**Verifier**: independent sub-agent (author != verifier)

## Checks

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | Ação de foto visível em RASCUNHO/EM_REVISAO e ausente nos 4 estados somente-leitura | `npm --prefix sistema/backend run verificar:revisao -- --filter foto-revisao` exit 0 | `sistema/backend/scripts/verificar-revisao-parceiro.mjs:696` - `checar(`${status}: ação de foto ${editavel ? 'visível' : 'ausente'}`, editavel ? quantidade === 1 : quantidade === 0)` | PASS |
| C2 | `POST /dispositivos/:id/foto` retorna 200 para responsável/apoio em RASCUNHO/EM_REVISAO e 403 para não atribuído ou estados somente-leitura | `npm --prefix sistema/backend run test:ajustes-revisao -- --filter autorizacao-foto` exit 0 · `npm --prefix sistema/backend run verificar:revisao -- --filter foto-revisao` exit 0 | `sistema/backend/scripts/test-ajustes-revisao.mjs:63` - `assert.equal(obtido, esperado)` · `sistema/backend/scripts/verificar-revisao-parceiro.mjs:721` - `checar(`POST ${status} × ${vinculo} = ${esperado}`, upload.status === esperado)` | PASS |
| C3 | `PATCH /dispositivos/:id` com `fotoUrl` persiste em RASCUNHO/EM_REVISAO para responsável/apoio e retorna 403 para outros | `npm --prefix sistema/backend run test:ajustes-revisao -- --filter autorizacao-foto` exit 0 · `npm --prefix sistema/backend run verificar:revisao -- --filter foto-revisao` exit 0 | `sistema/backend/scripts/test-ajustes-revisao.mjs:73` - `assert.equal(parceiroPodeAlterarFoto(...), true)` · `sistema/backend/scripts/verificar-revisao-parceiro.mjs:732` - `checar(`PATCH ${status} × ${vinculo} = ${esperado}`, patch.status === esperado)` · `sistema/backend/scripts/verificar-revisao-parceiro.mjs:742` - `checar(`PATCH persiste ${status} × ${vinculo}`, persistida?.fotoUrl === novaUrl)` | PASS |
| C4 | Upload aceita PNG, JPEG, WebP até 8 MiB, retorna 400 sem arquivo, 404 id ausente, 413 acima de 8 MiB, 415 outro MIME e preserva anterior | `npm --prefix sistema/backend run verificar:revisao -- --filter foto-revisao` exit 0 | `sistema/backend/scripts/verificar-revisao-parceiro.mjs:765` - `checar('PATCH inválido = 400', patchInvalido.status === 400)` · `sistema/backend/scripts/verificar-revisao-parceiro.mjs:781` - `checar('POST sem arquivo = 400', semArquivo.status === 400)` · `sistema/backend/scripts/verificar-revisao-parceiro.mjs:798` - `checar('POST outro MIME = 415', mimeInvalido.status === 415)` · `sistema/backend/scripts/verificar-revisao-parceiro.mjs:811` - `checar('POST PNG de 8 MiB = 200', limiteAceito.status === 200)` · `sistema/backend/scripts/verificar-revisao-parceiro.mjs:819` - `checar('POST PNG de 8 MiB + 1 byte = 413', acimaLimite.status === 413)` | PASS |
| C5 | Foto atualizada reflete em ficha, matriz, vitrine e preview do certificado sem novo login | `npm --prefix sistema/backend run verificar:revisao -- --filter foto-revisao` exit 0 | `sistema/backend/scripts/verificar-revisao-parceiro.mjs:884` - `checar('Ficha atual mostra a foto nova', (await p.locator(`img[src="${srcEsperado}"]`).count()) > 0)` · `sistema/backend/scripts/verificar-revisao-parceiro.mjs:888` - `checar('Matriz mostra a foto nova', (await p.locator(`img[src="${srcEsperado}"]`).count()) > 0)` · `sistema/backend/scripts/verificar-revisao-parceiro.mjs:893` - `checar('Vitrine mostra a foto nova', (await cardVitrine.locator(`img[src="${srcEsperado}"]`).count()) > 0)` · `sistema/backend/scripts/verificar-revisao-parceiro.mjs:904` - `checar('Preview do certificado mostra exatamente a foto nova', Boolean(estiloFoto?.includes('data:image/png') && estiloFoto.includes(prefixoBase64)))` | PASS |
| C6 | “Exibir informações” expõe observação de cada funcionalidade e ambas seções rotuladas quando há justificativa | `npm --prefix sistema/backend run test:ajustes-revisao -- --filter detalhes-resultado` exit 0 · `npm --prefix sistema/backend run verificar:revisao -- --filter observacoes-admin` exit 0 | `sistema/backend/scripts/test-ajustes-revisao.mjs:137` - `assert.deepEqual(comporDetalhesResultado(caso.entrada), caso.esperado)` · `sistema/backend/scripts/verificar-revisao-parceiro.mjs:933` - `checar(`${origem}: labels e textos exatos de "${caso.item.nome}"`, JSON.stringify(secoes) === JSON.stringify(caso.secoes))` | PASS |
| C7 | Cobre as 4 combinações de justificativa/observação sem seção vazia; mesma apresentação na página de detalhe | `npm --prefix sistema/backend run test:ajustes-revisao -- --filter detalhes-resultado` exit 0 · `npm --prefix sistema/backend run verificar:revisao -- --filter observacoes-admin` exit 0 | `sistema/backend/scripts/test-ajustes-revisao.mjs:144` - `console.log(`✓ detalhes do resultado: ${casos.length} combinações`)` · `sistema/backend/scripts/verificar-revisao-parceiro.mjs:917` - `checar(`${origem}: caso sem detalhe não cria seção`, (await gatilho.count()) === 0)` · `sistema/backend/scripts/verificar-revisao-parceiro.mjs:933` - `checar(`${origem}: labels e textos exatos de "${caso.item.nome}"`, JSON.stringify(secoes) === JSON.stringify(caso.secoes))` | PASS |
| C8 | Modal Admin mantém “Carregando informações…”, exibe erro da API e fecha com Escape | `npm --prefix sistema/backend run verificar:revisao -- --filter estados-modal` exit 0 | `sistema/backend/scripts/verificar-revisao-parceiro.mjs:990` - `checar('Modal mostra “Carregando informações…” durante a requisição', await modalLoading.getByText('Carregando informações…').isVisible())` · `sistema/backend/scripts/verificar-revisao-parceiro.mjs:1017` - `checar('Modal mostra a mensagem exata da API', await modalErro.getByText(mensagemErro).isVisible())` · `sistema/backend/scripts/verificar-revisao-parceiro.mjs:1031` - `checar('Escape fecha o modal', (await p.getByRole('dialog').count()) === 0)` | PASS |

## Coverage

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| estados da homologação para edição de foto pelo parceiro (6) | `prisma/schema.prisma` enum `StatusHomologacao` | `RASCUNHO` C1/C2/C3 · `EM_REVISAO` C1/C2/C3 · `AGUARDANDO_ANALISE` C1/C2/C3 · `APROVADO` C1/C2/C3 · `PUBLICADO` C1/C2/C3 · `REPROVADO` C1/C2/C3 | - |
| vínculo do parceiro (3) | `prisma/schema.prisma` model `Homologacao` | `responsavelId` C2/C3 · `apoioId` C2/C3 · não atribuído C2/C3 | - |
| `POST /dispositivos/:id/foto` statuses (6) | `sistema/backend/src/routes/dispositivos.ts` | 200 C2/C4 · 400 C4 · 403 C2 · 404 C4 · 413 C4 · 415 C4 | - |
| `PATCH /dispositivos/:id` com `fotoUrl` statuses (4) | `sistema/backend/src/routes/dispositivos.ts` | 200 C3 · 400 C3 · 403 C3 · 404 C3 | - |
| formatos aceitos (3) | `sistema/backend/src/routes/dispositivos.ts` `TIPOS_IMAGEM` | PNG C4 · JPEG C4 · WebP C4 | - |
| limite do arquivo (2 edges) | `sistema/backend/src/routes/dispositivos.ts` limits | 8 MiB C4 · 8 MiB + 1 byte C4 | - |
| consumidores atualizados (4) | UI da aplicação | ficha C5 · matriz C5 · vitrine C5 · certificado C5 | - |
| conteúdo do detalhe da funcionalidade (4) | `sistema/frontend/src/lib/detalhesResultado.ts` | justificativa+observação C6/C7 · só justificativa C7 · só observação C6/C7 · nenhum C7 | - |
| estados do modal Admin (3) | `sistema/backend/scripts/verificar-revisao-parceiro.mjs` | loading C8 · erro C8 · Escape C8 | - |

## Test policy rows

| Row | Files it classifies | Required proof | Expectation met |
| --- | --- | --- | --- |
| Authorization decision reached across HTTP | `sistema/backend/src/routes/dispositivos.ts` · `sistema/backend/src/lib/autorizacao-foto.ts` | one table-driven proof at its own layer and one boundary proof | yes |
| Result-detail composition reached through React | `sistema/frontend/src/lib/detalhesResultado.ts` · `sistema/frontend/src/componentes/homologacao/FichaHomologacao.tsx` | one table-driven proof over the pure content mapping and one rendered boundary proof | yes |
| UI visibility and query invalidation | `sistema/frontend/src/paginas/DetalheDispositivo.tsx` · `sistema/frontend/src/componentes/homologacao/FichaHomologacao.tsx` | one browser-boundary proof | yes |
| Existing modal state instrumentation | `sistema/frontend/src/paginas/ValidarCertificados.tsx` | one browser-boundary proof | yes |

## Faults injected

| Mutation | Location | Killed |
| --- | --- | --- |
| restringe autorização apenas a `RASCUNHO` omitindo `EM_REVISAO` | `sistema/backend/src/lib/autorizacao-foto.ts:15` | yes |
| altera rótulo da observação de 'Observação da funcionalidade' para 'Observação' | `sistema/frontend/src/lib/detalhesResultado.ts:29` | yes |
| remove verificação de `apoioId` mantendo apenas `responsavelId` | `sistema/backend/src/lib/autorizacao-foto.ts:16` | yes |
| omite bloco de justificativa em `comporDetalhesResultado` | `sistema/frontend/src/lib/detalhesResultado.ts:24` | yes |

## Gate

`npm run agent verify` + proofs (test:ajustes-revisao + verificar:revisao) - 34 passed, 0 failed
