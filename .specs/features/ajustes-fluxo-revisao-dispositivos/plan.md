# Ajustes no fluxo de revisão de dispositivos

Sources:

- conversation - define a edição da foto pelo parceiro durante a revisão e a exibição, ao Admin, das observações por funcionalidade
- `spec-sistema-homologacao.md` §§4.2, 5, 7, 10.3 e 11 - define `Dispositivo.fotoUrl`, `Resultado.observacao`, o fluxo de homologação e as travas de estados finais
- `sistema/DECISOES.md` D41-D43, D87, D322-D326, D393, D398 e D432-D439 - define upload e cache de foto, semântica das observações, limpeza de cobaias e o ciclo Admin ⇄ Parceiro
- `sistema/frontend/src/componentes/homologacao/FichaHomologacao.tsx` - implementação compartilhada da ficha usada pela página de detalhe e pelo modal “Exibir informações”

## Problem

Hoje, uma homologação devolvida pelo Admin para `EM_REVISAO` permite que o parceiro corrija a ficha, os resultados e as observações, mas a foto permanece bloqueada tanto na interface quanto na API. Isso impede que o parceiro conclua todos os ajustes pedidos sem intervenção da Mobiltec.

No modal “Exibir informações” do Admin, as observações por funcionalidade já chegam pela API, porém a apresentação escolhe `justificativa ?? observacao`. Quando uma funcionalidade tem justificativa, a observação do parceiro fica invisível e o Admin analisa um conjunto incompleto de informações. A demanda não fornece métricas de frequência ou impacto além desses comportamentos observados.

Depois desta mudança, o parceiro atribuído poderá substituir a foto enquanto a homologação estiver sob sua custódia, inclusive em `EM_REVISAO`, e o Admin verá a justificativa e a observação de cada funcionalidade sem que uma oculte a outra.

## Out of scope

| Excluded | Why |
| --- | --- |
| Criar foto por homologação ou migrar `Dispositivo.fotoUrl` | A arquitetura vigente trata a foto como identidade do modelo; a demanda pede liberar a substituição no fluxo atual, não criar versionamento de imagem |
| Alterar fotos de certificados já emitidos | O snapshot do certificado é imutável por regra inalienável e pelas D42-D43 |
| Alterar o editor de Observações Gerais ou seus anexos | A D433 já os exibe na ficha; o defeito reportado é nas observações de cada funcionalidade (`Resultado.observacao`) |
| Mudar status, justificativas obrigatórias ou o significado de reteste | A feature preserva a máquina de estados, a separação entre revisão e reteste e as regras centrais dos resultados |
| Permitir edição ao parceiro durante `AGUARDANDO_ANALISE` ou em estados finais | Nesses estados a custódia continua com a Mobiltec ou o registro é somente leitura |

## Assumptions

| Assumption | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Qual homologação autoriza a troca de uma foto que pertence ao dispositivo | O parceiro deve ser `responsavelId` ou `apoioId` de ao menos uma homologação do dispositivo em `RASCUNHO` ou `EM_REVISAO` | Espelha a autorização já aplicada à ficha e aos resultados pela D434 e impede que outro parceiro use uma homologação alheia para trocar a foto | y |
| Efeito da substituição sobre o modelo | Manter `Dispositivo.fotoUrl` como fonte única, com novo arquivo por upload e sem schema novo | D41-D43 já estabelecem esse contrato e preservam certificados emitidos pelo snapshot | y |
| Como mostrar justificativa e observação simultâneas | Um único detalhe acessível na linha da funcionalidade, com seções rotuladas “Justificativa” e “Observação da funcionalidade”; omitir somente a seção sem conteúdo | Mantém a tabela compacta, preserva a associação com a funcionalidade e não atribui autoria que o schema atual não registra | y |
| Proveniência de `Resultado.observacao` | Tratar o campo existente como a observação da respectiva funcionalidade, sem criar metadados de autor | A demanda é de visibilidade; distinguir notas legadas, do Admin e do parceiro exigiria mudança de dados sem evidência de necessidade | y |
| Alcance da correção de observações | Aplicar no componente compartilhado, refletindo no modal do Admin e na página de detalhe | D432 criou a peça compartilhada justamente para impedir divergência entre as duas visualizações | y |
| Perfil `tlc-spec-lean` | `standard` | O usuário elevou explicitamente o perfil após o GATE 1 para exigir recomputação de cobertura e injeção de falhas | y |

**Open questions:** none - all resolved or logged above.

## Criteria

### S1: Parceiro corrige a foto durante a revisão (P1)

**Acceptance Criteria**

1. WHILE an assigned partner's homologation is in `EM_REVISAO`, the system SHALL show the “Alterar foto” or “Enviar foto” action on `/dispositivos/:homologacaoId`.
2. WHILE an assigned partner's homologation is in `RASCUNHO` or `EM_REVISAO`, WHEN the partner uploads one PNG, JPEG or WebP file of at most 8 MB THEN the system SHALL return HTTP 200 and replace `Dispositivo.fotoUrl` with the newly stored unique path.
3. WHILE an assigned partner's homologation is in `RASCUNHO` or `EM_REVISAO`, WHEN the partner sends a valid `fotoUrl` to `PATCH /dispositivos/:id` THEN the system SHALL return HTTP 200 and persist that value.
4. WHEN the photo mutation succeeds THEN the system SHALL refresh the photo shown by the current homologation, matrix, showcase and certificate queries without requiring a new login.
5. WHILE a partner's homologation is in `AGUARDANDO_ANALISE`, `APROVADO`, `PUBLICADO` or `REPROVADO`, the system SHALL hide the photo-edit action from that partner.
6. WHILE a partner's homologation is in `AGUARDANDO_ANALISE`, `APROVADO`, `PUBLICADO` or `REPROVADO`, WHEN the partner calls `POST /dispositivos/:id/foto` or sends `fotoUrl` to `PATCH /dispositivos/:id` THEN the system SHALL return HTTP 403.
7. IF a partner is not the `responsavelId` or `apoioId` of an editable homologation for the device THEN the system SHALL return HTTP 403 for both photo mutation routes, even when another partner has a `RASCUNHO` or `EM_REVISAO` homologation for that device.
8. IF an uploaded file exceeds 8 MB or is not PNG, JPEG or WebP THEN the system SHALL preserve the current photo and return HTTP 413 or HTTP 415 respectively.

**Independent test:** place a disposable homologation in `EM_REVISAO`, authenticate as its assigned partner, replace the photo through the detail screen, verify the new image and API response, then move it to `AGUARDANDO_ANALISE` and prove the same UI action is absent and the direct API request returns 403.

### S2: Admin vê todas as observações por funcionalidade (P1)

**Acceptance Criteria**

9. WHEN an Admin opens “Exibir informações” for a homologation containing `Resultado.observacao` THEN the system SHALL expose the exact observation text from every populated result in the row of its respective functionality.
10. WHEN one result contains both `justificativaTexto` or `justificativa.texto` and `observacao` THEN the system SHALL expose both values under the distinct labels “Justificativa” and “Observação da funcionalidade”.
11. WHEN a result contains only a justification or only an observation THEN the system SHALL expose the populated value under its corresponding label without rendering an empty section for the absent value.
12. WHEN the same shared result card is opened from `/dispositivos/:homologacaoId` THEN the system SHALL present the same per-functionality observations shown in the Admin modal.
13. WHILE the Admin information modal is loading, fails to load, or is closed with Escape, the system SHALL preserve the existing loading message, API error message, and close behavior respectively.

**Independent test:** create a disposable homologation with observations on two different functionalities, including one result that also has a justification; open “Exibir informações” as Admin and prove that both observations remain associated with their item names and that the mixed result exposes both labeled texts.

## Traceability

| ID | Slice | Criteria | Status |
| --- | --- | --- | --- |
| REV-01 | S1 | 1, 2, 3, 4, 5, 6, 7, 8 | Pending |
| REV-02 | S2 | 9, 10, 11, 12, 13 | Pending |

## Observable

Every item of every surface this feature exposes. `n/a` needs its reason.

| Surface | Decision | Landing |
| --- | --- | --- |
| screen `/dispositivos/:homologacaoId` | photo action in editable state | AC 1 |
| screen `/dispositivos/:homologacaoId` | photo action in read-only state | AC 5 |
| screen `/dispositivos/:homologacaoId` | upload validation and failure | AC 8 |
| screen `/dispositivos/:homologacaoId` | loading and API error | existing - `DetalheDispositivo` keeps `LoadingTela` and its current error block |
| screen `/dispositivos/:homologacaoId` | empty result state | n/a - homologation creation always materializes one result per battery item |
| screen `/dispositivos/:homologacaoId` | unauthorised state | existing - authenticated routing and the existing API error handling remain unchanged |
| screen `/dispositivos/:homologacaoId` | density and ordering | AC 12 |
| screen `/dispositivos/:homologacaoId` | destructive action confirms | n/a - replacing a model photo is the existing upload action and does not delete stored records |
| screen Admin “Exibir informações” | loading state | AC 13 |
| screen Admin “Exibir informações” | error state | AC 13 |
| screen Admin “Exibir informações” | unauthorised state | existing - the validation page remains protected by the current role-aware route |
| screen Admin “Exibir informações” | empty observations | AC 11 |
| screen Admin “Exibir informações” | density and ordering | AC 9, AC 10 |
| screen Admin “Exibir informações” | destructive action confirms | n/a - the modal is read-only |
| API `POST /dispositivos/:id/foto` | success response | AC 2 |
| API `POST /dispositivos/:id/foto` | error shape and codes | AC 6, AC 7, AC 8 |
| API `POST /dispositivos/:id/foto` | caller authorization | AC 6, AC 7 |
| API `POST /dispositivos/:id/foto` | versioning | n/a - internal same-origin endpoint with no versioned public consumers |
| API `POST /dispositivos/:id/foto` | rate limit | existing - no route-specific throttling exists and this feature does not introduce one |
| API `PATCH /dispositivos/:id` with `fotoUrl` | success response | AC 3 |
| API `PATCH /dispositivos/:id` with `fotoUrl` | error shape and codes | AC 6, AC 7 |
| API `PATCH /dispositivos/:id` with `fotoUrl` | caller authorization | AC 6, AC 7 |
| API `PATCH /dispositivos/:id` with `fotoUrl` | versioning | n/a - internal same-origin endpoint with no versioned public consumers |
| API `PATCH /dispositivos/:id` with `fotoUrl` | rate limit | existing - no route-specific throttling exists and this feature does not introduce one |

## Flow

The change reuses the existing custody rule from D434, the current photo upload/storage path, the existing query invalidation, and the shared homologation card from D432. It does not add a parallel endpoint, image field, or Admin-only rendering path.

1. partner action -> `DetalheDispositivo` (exists) - derives photo editability from the selected homologation and opens `ModalUploadFoto`
2. selected image -> `useUploadFotoDispositivo` (exists) - sends multipart data to `POST /dispositivos/:id/foto`
3. upload request -> `dispositivoRoutes` (exists) - validates role, assignment, editable status, MIME and size, then calls `salvarFotoDispositivo`
4. stored unique image -> `dispositivoRoutes` (exists) - persists `Dispositivo.fotoUrl`; existing TanStack Query invalidations refresh homologation, matrix, showcase, device and certificate consumers
5. Admin action -> `ModalInformacoesHomologacao` (exists) - loads `GET /homologacoes/:id` with results, observations and justifications
6. homologation data -> `ResultadoHomologacao` (exists) - renders each functionality and exposes justification and partner observation as independent labeled content on the same row

## Relations

None - no stored-data shape change; the feature continues using `Dispositivo.fotoUrl` and `Resultado.observacao`.

## Surface

| Route | In | Out | Status |
| --- | --- | --- | --- |
| `POST /dispositivos/:id/foto` | multipart field `arquivo` | updated device with `fotoUrl` · `{ erro }` | `200`, `400`, `403`, `404`, `413`, `415` |
| `PATCH /dispositivos/:id` when `fotoUrl` is present | partial device payload with `fotoUrl` | updated device · `{ erro }` | `200`, `400`, `403`, `404` |

## Landing

None - no new schema, dependency, public contract, backfill or architectural pattern is introduced; D438 and D439 extend existing project rules without creating an irreversible storage shape.

## Impact

| Front | What changes |
| --- | --- |
| domain | existing term: “custódia do parceiro” covered ficha, results and observations in D434; it now also governs mutations of `Dispositivo.fotoUrl` while the assigned homologation is `RASCUNHO` or `EM_REVISAO` |
| domain | existing terms: “justificativa” explains a divergent status and “observação do parceiro” records a note about one functionality; the shared card stops treating them as alternatives |
| authorization | both existing photo mutation routes use the partner's assignment plus editable homologation status; historical approved homologations no longer block a legitimate current revision by themselves |
| interface | the shared result card exposes two labeled values when a result contains both, so the Admin modal and detail page stay consistent |
| stored data | no migration or backfill; existing `Resultado.observacao` values become visible and a successful upload writes a new unique image path to the existing device record |
| verification data | the revision Playwright scenario must create isolated observations and image data, restore any reused permissions, and delete all disposable device, homologation, result, history and upload records in `finally` per D398 |
