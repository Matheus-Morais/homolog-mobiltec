# Ajustes no fluxo de revisão de dispositivos checks

Profile: standard
Plan: `.specs/features/ajustes-fluxo-revisao-dispositivos/plan.md`

8 checks in 2 slices · 0 one-way doors · 0 open, of which 0 block

## Checks

### S1 - Parceiro corrige a foto durante a revisão · ~5 production files · ~33 KB · ~9k

**C1** - Para PARCEIRO atribuído, a ação de foto aparece em `RASCUNHO` e `EM_REVISAO` e fica ausente em `AGUARDANDO_ANALISE`, `APROVADO`, `PUBLICADO` e `REPROVADO` (REV-01, AC 1, 5)
Proof: `npm --prefix sistema/backend run verificar:revisao -- --filter foto-revisao`

**C2** - `POST /dispositivos/:id/foto` retorna 200 para responsável ou apoio atribuído em `RASCUNHO`/`EM_REVISAO` e 403 para usuário não atribuído ou qualquer estado somente-leitura (REV-01, AC 2, 6, 7)
Proof: `npm --prefix sistema/backend run test:ajustes-revisao -- --filter autorizacao-foto`
Proof: `npm --prefix sistema/backend run verificar:revisao -- --filter foto-revisao`

**C3** - `PATCH /dispositivos/:id` com `fotoUrl` retorna 200 para responsável ou apoio atribuído em `RASCUNHO`/`EM_REVISAO`, persiste o valor, e retorna 403 para usuário não atribuído ou estado somente-leitura (REV-01, AC 3, 6, 7)
Proof: `npm --prefix sistema/backend run test:ajustes-revisao -- --filter autorizacao-foto`
Proof: `npm --prefix sistema/backend run verificar:revisao -- --filter foto-revisao`

**C4** - O upload aceita PNG, JPEG e WebP de até 8 MiB, preserva a foto anterior e retorna 400 sem arquivo, 404 para dispositivo ausente, 413 acima de 8 MiB e 415 para outro MIME (REV-01, AC 2, 8)
Proof: `npm --prefix sistema/backend run verificar:revisao -- --filter foto-revisao`

**C5** - Após upload 200, a nova foto aparece na ficha atual, matriz, vitrine e preview do certificado sem novo login (REV-01, AC 4)
Proof: `npm --prefix sistema/backend run verificar:revisao -- --filter foto-revisao`

### S2 - Admin vê todas as observações por funcionalidade · ~3 production files · ~17 KB · ~5k

**C6** - “Exibir informações” mostra o texto exato de cada `Resultado.observacao` na linha do item correspondente e, quando há justificativa, mostra ambos sob “Justificativa” e “Observação da funcionalidade” (REV-02, AC 9, 10)
Proof: `npm --prefix sistema/backend run test:ajustes-revisao -- --filter detalhes-resultado`
Proof: `npm --prefix sistema/backend run verificar:revisao -- --filter observacoes-admin`

**C7** - O detalhe da funcionalidade cobre as quatro combinações: justificativa+observação, apenas justificativa, apenas observação e nenhuma, sem seção vazia; a página `/dispositivos/:homologacaoId` usa a mesma apresentação do modal (REV-02, AC 11, 12)
Proof: `npm --prefix sistema/backend run test:ajustes-revisao -- --filter detalhes-resultado`
Proof: `npm --prefix sistema/backend run verificar:revisao -- --filter observacoes-admin`

**C8** - O modal mantém “Carregando informações…”, mostra a mensagem da API em falha e fecha com Escape (REV-02, AC 13)
Proof: `npm --prefix sistema/backend run verificar:revisao -- --filter estados-modal`

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| estados da homologação para edição de foto pelo parceiro (6) | `RASCUNHO` C1/C2/C3 · `EM_REVISAO` C1/C2/C3 · `AGUARDANDO_ANALISE` C1/C2/C3 · `APROVADO` C1/C2/C3 · `PUBLICADO` C1/C2/C3 · `REPROVADO` C1/C2/C3 | - |
| vínculo do parceiro (3) | `responsavelId` C2/C3 · `apoioId` C2/C3 · não atribuído C2/C3 | - |
| `POST /dispositivos/:id/foto` statuses (6) | 200 C2/C4 · 400 C4 · 403 C2 · 404 C4 · 413 C4 · 415 C4 | - |
| `PATCH /dispositivos/:id` com `fotoUrl` statuses (4) | 200 C3 · 400 C3 · 403 C3 · 404 C3 | - |
| formatos aceitos (3) | PNG C4 · JPEG C4 · WebP C4 | - |
| limite do arquivo (2 edges) | 8 MiB C4 · 8 MiB + 1 byte C4 | - |
| consumidores atualizados (4) | ficha C5 · matriz C5 · vitrine C5 · certificado C5 | - |
| conteúdo do detalhe da funcionalidade (4) | justificativa+observação C6/C7 · só justificativa C7 · só observação C6/C7 · nenhum C7 | - |
| estados do modal Admin (3) | loading C8 · erro C8 · Escape C8 | - |

- Claims naming a status code, route or response shape: C2, C3, C4 - each has a proof crossing the HTTP boundary.
- C1, C5, C6, C7 and C8 are settled at the rendered UI boundary; C2, C3, C6 and C7 also have own-layer decision proofs.

## Test policy

| Code | Required proofs | Coverage expectation |
| --- | --- | --- |
| Authorization decision reached across HTTP | one table-driven proof at its own layer and one boundary proof | all 6 statuses × all 3 assignment cases; both mutation routes assert exact HTTP codes |
| Result-detail composition reached through React | one table-driven proof over the pure content mapping and one rendered boundary proof | all 4 justification/observation combinations; exact labels and exact texts |
| UI visibility and query invalidation | one browser-boundary proof | both editable statuses, all 4 read-only statuses and all 4 visible consumers |
| Existing modal state instrumentation | one browser-boundary proof | loading, API error and Escape each asserted independently |

Evidence:

- `sistema/backend/src/routes/dispositivos.ts`: two role/status/assignment guards decide 200 versus 403 for two routes; this is decision code.
- `sistema/frontend/src/paginas/DetalheDispositivo.tsx`: one role/status predicate decides whether the photo action exists; this is decision code reached through the screen.
- `sistema/frontend/src/componentes/homologacao/FichaHomologacao.tsx`: one precedence branch currently selects `justificativa ?? observacao`; the four input combinations decide visible content.
- `sistema/backend/scripts/test-rbac-rules.mjs`: closest repository analogue for table-driven role/status decisions at their own layer.
- `sistema/backend/scripts/verificar-revisao-parceiro.mjs`: existing boundary precedent for the complete Admin ⇄ Parceiro cycle and disposable-data cleanup.

Cost: two table-driven filters in one narrow Node script plus three filters in the existing Playwright revision script. Without these rows, the authorization and content-composition tables would be proven by only one happy path each.

## Swept

- validation: C3, C4
- failure modes: C4, C8
- idempotency: n/a - each accepted photo replacement intentionally creates a new unique path; retry deduplication is not part of the existing upload contract
- authorization: C1, C2, C3
- concurrency: n/a - the existing model-level photo field uses last successful write and the feature introduces no ordered multi-write workflow
- data lifecycle: C4 - rejected uploads preserve the prior URL; the verification script removes its disposable database rows and uploaded files in `finally`
- dependency failure: n/a - no new external dependency is introduced; storage failure behavior remains the existing API error path
- state transitions: C1, C2, C3
- observability: n/a - no new logging or telemetry requirement was requested for these synchronous corrections

## Handoff

Intended split, with arithmetic, before production code:

- S1 backend authorization and S2 frontend rendering plus their existing consumers total ~50 KB / 4 = ~13k tokens; one coordinated batch fits the 150k budget. Per project rules, writing is split by ownership: backend routes/helper, frontend components/page, and Playwright/Node proofs are isolated among the three specialists.
