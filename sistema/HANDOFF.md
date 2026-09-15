# Handoff — Sistema de Homologação Mobiltec

> Registro do ponto de parada, contrato da API para o frontend e backlog priorizado.
> Última atualização: **25/08/2026** — fim da Etapa 6 (fontes e assinaturas editáveis no certificado).

---

## 1. Onde estamos

| Camada | Estado |
|---|---|
| Spec | ✅ completa — [spec-sistema-homologacao.md](../spec-sistema-homologacao.md) |
| Banco (PostgreSQL 16 portátil) | ✅ criado, migration `init` aplicada, seed rodado |
| Backend (Fastify + Prisma) | ✅ 25 rotas, fluxo completo validado por smoke test |
| Erros de validação | ✅ handler global — Zod → 400 `{erro, campos[]}`, Prisma → 409/404/400 |
| Frontend — base | ✅ Vite + React 19 + TS + Tailwind 4 + TanStack Query, tokens do DS, login + guarda de rota |
| Frontend — checklist (§10.4) | ❌ **removido** — a matriz absorveu tudo que ele fazia (D86) |
| Frontend — **matriz editável (§10.5)** | ✅ a "planilha" web: colunas = modelos, células e ficha editáveis inline, cadastro de novo modelo |
| **Certificado (§8)** | ✅ gerado a partir dos dados, com quebra de página calculada; preview vivo, download em PDF e emissão arquivada |
| **Dados (Fase 0)** | ✅ os 31 PoS da planilha importados — 1.488 resultados, todos em `RASCUNHO` |
| Frontend — demais telas | ❌ Dashboard, Dispositivos, Homologações são placeholders |

O que o smoke test cobriu e passou: login → criar dispositivo → criar homologação (48 resultados `NAO_TESTADO`) → bloqueio de `NAO_SUPORTADO` sem justificativa (422) → sugestão de justificativa por item+Android+gerenciamento → `RASCUNHO → EM_REVISAO → APROVADO` → somente-leitura após aprovar (403) → reabertura com log.

**Dado no banco:** os 31 modelos da planilha "Homologação PoS", importados em 25/08/2026. Não há mais dado de teste — os `Morefun MP860` e a homologação `SN-TESTE-001` foram removidos pelo `--limpar`. Distribuição: 1.065 `OK`, 248 `NAO_TESTADO`, 167 `NAO_SUPORTADO`, 8 `COM_RESSALVA`.

**Pendência aberta:** 81 células vieram de um `"Não"` da planilha sem regra conhecida e estão em `NAO_SUPORTADO` com a justificativa dizendo que a classificação ainda precisa de revisão (D56). A fila é uma query:

```sql
select d.nome_comercial, i.grupo, i.nome
from resultado r
  join homologacao h on h.id = r.homologacao_id
  join dispositivo d on d.id = h.dispositivo_id
  join item_teste i on i.id = r.item_id
where r.justificativa_texto like 'Migrado da planilha%'
order by d.nome_comercial, i.grupo, i.ordem;
```

---

## 2. Subir o ambiente

O PostgreSQL é **portátil** (pasta `pgsql/`), não é serviço do Windows: **precisa ser iniciado a cada boot da máquina.**

```powershell
cd "C:\Users\MOBILTEC\Desktop\Homolog Mobiltec\sistema"

# 1. Banco (a cada boot)
.\pgsql\bin\pg_ctl.exe start -D .\pgdata -l .\postgres.log

# 2. Backend — deixe rodando num terminal
cd backend
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH
npm run dev      # → http://localhost:3001

# 3. Frontend — outro terminal
cd ..\frontend
npm run dev      # → http://localhost:5173
```

O front chama o backend por `/api/*`, com proxy do Vite — não há CORS nem base URL em dev.

Para parar o banco: `.\pgsql\bin\pg_ctl.exe stop -D .\pgdata -m fast`

### Reimportar a planilha PoS

Quando o Excel mudar. O import é idempotente por `(fabricante, modelo)` e nunca
toca em homologação `APROVADO`/`PUBLICADO`.

```powershell
cd backend
python prisma\dados\extrair-planilha.py "C:\caminho\Homologação PoS.xlsx"   # → prisma/dados/planilha-pos.json
npm run db:importar-planilha                        # simula e imprime o relatório
npm run db:importar-planilha -- --aplicar
npm run db:importar-planilha -- --aplicar --limpar  # + remove da categoria PoS o que não está na planilha
```

`--limpar` **apaga** dispositivos e homologações — inclusive certificados emitidos
deles. Rode a simulação antes. O extrator precisa de `pip install openpyxl`.

### Verificação automatizada da UI

Não há suíte de testes ainda, mas há dois roteiros Playwright que exercitam a tela
mais crítica. Precisam do banco, do backend **e** do front rodando:

```powershell
cd backend
npm run verificar:matriz
npm run verificar:certificado -- <homologacaoId>
npm run verificar:fluxo          # cadastra modelo → marca itens → certificado → emite
npm run verificar:fontes -- <homologacaoId>   # painel de fontes e assinaturas
npm run verificar:filtros                     # filtros da matriz + lápis do certificado
npm run verificar:finalizar                   # logo, filtros "todos", modal de finalizar
npm run verificar:dropdown                    # menu do filtro por cima do card, ações numa linha
npm run verificar:rail                        # rail dos grupos some com filtro de itens
npm run verificar:home                        # menu retrátil, matriz por categoria, home/vitrine
npm run verificar:catalogo                    # card do catálogo (cria e desativa um modelo próprio)
npm run verificar:marca                       # logo/favicon, abas de dispositivos, tela de informações
```

`verificar:dropdown`, `verificar:rail`, `verificar:home` e `verificar:marca` são
**só de leitura** — medem geometria e não gravam nada. O `verificar:catalogo` cria um modelo
`ZZ Teste / ZZ Vitrine <marca>`, leva a APROVADO e desativa no fim (soft delete),
sem tocar em nenhum modelo real; se ele falhar no meio, sobra um dispositivo
ativo `ZZ Teste` para desativar à mão.

> ⚠️ **Os roteiros ESCREVEM no banco.** O `verificar:matriz` agora guarda o
> estado da célula e o restaura no fim (verificado: contagens idênticas antes e
> depois). O `verificar:fluxo` cria e apaga o próprio modelo. Mas o
> `verificar:filtros` e o `verificar:fontes` **ainda alteram dados reais** —
> o primeiro sobrescreve a justificativa de uma divergência, o segundo grava
> fontes e assinaturas.
>
> Já houve drift permanente por isso: uma célula "Desbloquear" foi marcada `OK`
> e a justificativa de um "Apps Bloqueados" foi sobrescrita com texto de teste.
> Ambos revertidos à mão, mas o contador de `NAO_TESTADO` ficou 1 abaixo do que
> o import registrou (247 vs 248) e não foi possível identificar qual célula.
>
> Antes de rodar a suíte, tire um retrato:
>
> ```sql
> select count(*) filter (where status = 'NAO_TESTADO') as nao_testado,
>        count(*) filter (where status = 'OK') as ok,
>        count(*) filter (where status in ('FALHA','NAO_SUPORTADO','COM_RESSALVA')
>                         and justificativa_id is null
>                         and justificativa_texto is null) as sem_justificativa,
>        count(*) filter (where justificativa_texto ~* 'teste|lapis|playwright') as poluidos
> from resultado;
> ```
>
> **Baseline verificado em 25/08/2026:** `247 | 1113 | 79 | 0`.
>
> **A fazer:** aplicar o mesmo padrão de salvar-e-restaurar no `verificar:filtros`
> e no `verificar:fontes`, ou apontar a suíte para um banco separado.

Screenshots saem em `sistema/.verificacao/`.

### Credenciais

| O quê | Valor |
|---|---|
| Login da aplicação | `admin@mobiltec.com.br` / `admin123` |
| Postgres — superusuário | `postgres` / `postgres_admin` |
| Postgres — app | `homolog` / `homolog_secret` (banco `homologacao`) |

> Todas são de MVP interno. Trocar antes de qualquer uso fora da máquina local.

### Armadilhas já resolvidas (não repetir)

- `setup-postgres.ps1` usa `initdb --pwprompt`, que é **interativo** e trava em automação. Use `--pwfile`.
- O usuário `homolog` precisa de `CREATEDB` — o Prisma Migrate cria um *shadow database* a cada `migrate dev`, e sem isso falha com `P3014`.

---

## 3. Contrato da API para o frontend

Base: `http://localhost:3001` · CORS liberado para `http://localhost:5173` (Vite) via `CORS_ORIGIN`.

### Autenticação

Todas as rotas exigem `Authorization: Bearer <token>`, **exceto** `POST /auth/login` e `GET /health`.

```http
POST /auth/login
{ "email": "admin@mobiltec.com.br", "senha": "admin123" }

→ 200 { "token": "...", "usuario": { id, nome, email, cargo, papel } }
→ 401 { "erro": "Credenciais inválidas" }
```

Token expira em **8h** (`JWT_EXPIRES_IN`). `GET /auth/me` devolve o usuário logado.

### Enums (valores exatos, o front nunca deve inventar outros)

```ts
StatusResultado   = 'OK' | 'FALHA' | 'NAO_SUPORTADO' | 'COM_RESSALVA' | 'NAO_TESTADO' | 'NAO_APLICAVEL'
StatusHomologacao = 'RASCUNHO' | 'EM_REVISAO' | 'APROVADO' | 'PUBLICADO'
TipoGerenciamento = 'ANDROID_LEGADO' | 'ANDROID_ENTERPRISE'
GrupoItem         = 'TELEMETRIA' | 'COLETA' | 'COMANDOS' | 'PERFIS'
PapelUsuario      = 'ADMIN' | 'HOMOLOGADOR' | 'LEITOR'
FormatoCertificado= 'PDF' | 'PPTX'
```

### Rotas

| Método | Rota | Query / Body | Observação |
|---|---|---|---|
| `GET` | `/health` | — | sem auth |
| `POST` | `/auth/login` | `{email, senha}` | sem auth |
| `GET` | `/auth/me` | — | |
| `GET` | `/categorias` | `?todas=true` | só as `ativo=true` por padrão — é o que monta o menu |
| `GET` | `/vitrine` | — | catálogo da home: um registro por modelo, com resumo agregado. Não expõe resultado item a item |
| `GET` | `/dispositivos` | `?categoriaId&fabricante&busca&ativo` | `busca` cobre fabricante/modelo/nomeComercial |
| `POST` | `/dispositivos` | `{categoriaId, fabricante, modelo, nomeComercial, fotoUrl?, linkFabricante?}` | `409` se (fabricante, modelo) duplicado |
| `GET` | `/dispositivos/:id` | — | inclui timeline de homologações |
| `PATCH` | `/dispositivos/:id` | campos parciais | |
| `DELETE` | `/dispositivos/:id` | — | soft delete (`ativo=false`), devolve `204` |
| `GET` | `/itens-teste` | `?grupo&ativo` | 48 itens do seed |
| `POST` | `/itens-teste` | `{grupo, nome, descricaoAcao, ordem}` | |
| `PATCH` | `/itens-teste/:id` | `{nome?, descricaoAcao?, ordem?, ativo?}` | **nunca deletar — só `ativo=false`** |
| `GET` | `/baterias` | `?categoriaId` | |
| `GET` | `/baterias/:id` | — | itens ordenados por grupo+ordem |
| `POST` | `/baterias` | `{categoriaId, nome, descricao?, itens:[{itemId, ordem, obrigatorio}]}` | |
| `GET` | `/justificativas` | `?itemId&gerenciamento&androidMin` | **é a rota de sugestão da §10.4** |
| `POST` | `/justificativas` | `{titulo, texto, fontes[], itensSugeridos[], androidMin?, gerenciamento?}` | |
| `PATCH` | `/justificativas/:id` | campos parciais | |
| `GET` | `/usuarios` | — | só `ADMIN`, senão `403` |
| `POST` | `/homologacoes` | ver abaixo | cria N resultados `NAO_TESTADO` de uma vez |
| `GET` | `/homologacoes` | `?dispositivoId&status&responsavelId` | |
| `GET` | `/homologacoes/:id` | — | ficha completa + resultados + certificados |
| `GET` | `/homologacoes/:id/dashboard` | — | contagens por status e por grupo |
| `PUT` | `/homologacoes/:id/resultados/:itemId` | `{status, observacao?, justificativaId?, justificativaTexto?}` | **rota do autosave do checklist** |
| `POST` | `/homologacoes/:id/status` | `{novoStatus, homologado?}` | |
| `POST` | `/homologacoes/:id/reabrir` | `{motivo}` (mín. 10 chars) | `APROVADO → RASCUNHO` + log |
| `PATCH` | `/homologacoes/:id` | campos da ficha + `fontes[]`, `assinatura{Responsavel,Gerente,Apoio}` | edição inline do cabeçalho da matriz e do painel do certificado; `403` se aprovada |
| `GET` | `/matriz` | `?categoriaSlug=pos` | linhas = itens, colunas = modelos (homologação mais recente de cada) |
| `POST` | `/matriz/modelo` | dispositivo + homologação | cria os dois atomicamente; `409` se (fabricante, modelo) duplicado |
| `POST` | `/matriz/reteste` | `{dispositivoId, baseHomologacaoId, versaoAgente, dataInicio}` | copia a ficha da anterior; reteste nunca sobrescreve (§11.2) |
| `POST` | `/dispositivos/:id/foto` | `multipart/form-data` | PNG/JPEG/WebP até 8 MB; `415` para outro formato, `413` se estourar. Grava `fotoUrl` |
| `GET` | `/homologacoes/:id/certificado/preview` | — | HTML vivo, sempre com os dados atuais |
| `GET` | `/homologacoes/:id/certificado/pdf` | — | renderiza em PDF sem gravar nada |
| `POST` | `/homologacoes/:id/certificados` | `{formato:'PDF'}` | **emite**: arquiva PDF + snapshot imutável. `PPTX` → 501 |
| `GET` | `/homologacoes/:id/certificados` | — | histórico de emissões |

#### `POST /homologacoes`

```jsonc
{
  "dispositivoId": "uuid", "bateriaId": "uuid",
  "numeroSerie": "SN-001", "imei1": null, "imei2": null,
  "versaoSo": "Android 11",
  "gerenciamento": "ANDROID_LEGADO",
  "tipoAgente": "Agente PoS", "versaoAgente": "12.6.8",
  "versaoPos": "DEBUG",                 // PROD | DEBUG | PROTOTIPO — opcional
  "ferramenta": null, "metodoInscricao": "ADB / Arquivo",
  "assinaturaAgente": false, "precisaAssinaturaDev": false,
  "dataInicio": "2026-08-24",           // string ISO, convertida para Date no backend
  "responsavelId": null,                // omitido → usa o usuário do token
  "gerenteId": null, "apoioId": null,
  "localEmissao": "São Paulo"
}
```

#### `GET /homologacoes/:id/dashboard`

```jsonc
{
  "contagem": { "total": 48, "ok": 47, "falha": 0, "naoSuportado": 1,
                "comRessalva": 0, "naoTestado": 0, "naoAplicavel": 0 },
  "porGrupo": { "TELEMETRIA": { ...mesmas chaves... }, "COLETA": {...} },
  "percentualConcluido": 100,
  "podeAvancarParaRevisao": true
}
```

---

## 4. Regras que o frontend precisa respeitar

Estas não são detalhe de implementação — são o motivo do sistema existir.

1. **Justificativa obrigatória.** `FALHA`, `NAO_SUPORTADO` e `COM_RESSALVA` exigem `justificativaId` **ou** `justificativaTexto`. Sem isso o `PUT` devolve `422` com `{erro, campo:"justificativa"}`. A UI deve abrir o painel de justificativa **no momento do clique**, não depois.
2. **Nunca oferecer um botão genérico "Não"** (spec §5). `FALHA` (bug a reportar ao fabricante) e `NAO_SUPORTADO` (limitação conhecida da plataforma) são coisas diferentes, e a planilha antiga confundia as duas — separar isso é metade do valor do sistema.
3. **Sugestão de justificativa** vem de `GET /justificativas?itemId=X&gerenciamento=Y&androidMin=N`, usando os dados da própria homologação. Ordenada por `usoCount` desc.
4. **Autosave**, sem botão "salvar" — um `PUT` por mudança de status/observação.
5. **Atalhos de teclado** `1`–`6` para status, `↑`/`↓` navegar, `Enter` abre observação (spec §10.4).
6. **`APROVADO` e `PUBLICADO` são somente-leitura** — o backend devolve `403` em qualquer edição de resultado. A UI deve refletir isso, com botão "Reabrir".
7. **Transições válidas** — a fonte canônica é `src/lib/transicoes.ts`; qualquer outra combinação dá `422` com a lista permitida no corpo.

   | Papel | De → Para |
   |---|---|
   | Mobiltec (ADMIN/HOMOLOGADOR) | `RASCUNHO → {EM_REVISAO, AGUARDANDO_ANALISE}` · `AGUARDANDO_ANALISE → {EM_REVISAO, APROVADO, REPROVADO, RASCUNHO}` · `EM_REVISAO → {APROVADO, REPROVADO, RASCUNHO, AGUARDANDO_ANALISE}` · `APROVADO → {PUBLICADO, RASCUNHO}` · `REPROVADO → RASCUNHO` |
   | PARCEIRO | `RASCUNHO → AGUARDANDO_ANALISE` (primeira submissão) · `EM_REVISAO → AGUARDANDO_ANALISE` (reenvio após ajustes, D434) |
   | LEITOR | nenhuma |

7a. **Ciclo de revisão (D434–D436).** `AGUARDANDO_ANALISE → EM_REVISAO` devolve a custódia ao parceiro: ele volta a escrever em ficha, resultados e observações (`STATUS_EDITAVEIS_PARCEIRO = [RASCUNHO, EM_REVISAO]`), e reenvia. Essa transição exige `motivo` com no mínimo 10 caracteres — `422 { erro, campo: "motivo" }` sem ele. O motivo sai em `GET /homologacoes/:id` (`historicoStatus`), em `GET /matriz` e no painel do parceiro (`revisaoPendente`). Sob `AGUARDANDO_ANALISE` o parceiro volta a receber `403` em qualquer escrita.
8. **`homologado` é decisão manual do admin**, obrigatória ao aprovar — nunca calcular a partir dos status (spec §11.5).
9. **`NAO_TESTADO` ocupa a linha no certificado, mas com o status em branco.** O documento sempre sai com a estrutura completa do modelo base; a célula vazia é que garante que nada seja atestado. Ele não entra nas divergências (não há o que justificar). Ver D45 — é uma reversão parcial e deliberada da spec §8.3.
10. **Divergência sem justificativa também sai em branco** (D78). `FALHA`/`NAO_SUPORTADO`/`COM_RESSALVA` só exibem o status no certificado depois que a justificativa existe — antes disso o documento não afirma nada sobre o item.

---

## 5. Backlog priorizado

### Concluído

- [x] **Error handler global** — [error-handler.ts](backend/src/middlewares/error-handler.ts). Zod → `400 {erro, campos[]}`; Prisma P2002 → 409, P2025 → 404, P2003 → 400; 5xx só para o que é realmente inesperado
- [x] Scaffold do front: Vite 8 + React 19 + TS + Tailwind 4 + TanStack Query 5 + React Router 7, tokens do DS em [index.css](frontend/src/index.css)
- [x] Login + guarda de rota + persistência do JWT (com deslogar automático no 401)
- [x] ~~Tela 10.4 — Checklist de execução~~ — **removida** (D86); a matriz absorveu status, justificativa, observação e filtros
- [x] **Finalizar / Reabrir na matriz** — cabeçalho de cada coluna: `Certificado · Reteste · Finalizar`, virando `Certificado · Reteste · ✓ Homologado · Reabrir` depois de fechada
- [x] **Observação no menu da célula** — nota interna, herdada do checklist (D87)
- [x] **Tela 10.5 — Matriz editável** ("a planilha web"): colunas = modelos, células e ficha editáveis inline, filtro "só divergências", cadastro de novo modelo
- [x] **Certificado (§8)**: gerador em [certificado.ts](backend/src/services/certificado.ts) com quebra de página calculada e divergências agrupadas por justificativa compartilhada; preview vivo + PDF + emissão arquivada com snapshot
- [x] `@fastify/static` registrado — os PDFs emitidos são baixáveis em `/uploads/certificados/`
- [x] **Upload da foto do dispositivo** — `POST /dispositivos/:id/foto` (PNG/JPEG/WebP, até 8 MB), com miniatura clicável na primeira linha da matriz. A foto é embutida como data URI no certificado
- [x] **Reteste pela matriz** — botão no cabeçalho de cada coluna; copia a ficha, nasce com tudo em "não testado", e a homologação anterior vira histórico sem ser sobrescrita
- [x] **Painel de Fontes e Assinaturas na tela do certificado** — lista de links que soma às fontes derivadas das justificativas ([PainelFontesAssinaturas.tsx](frontend/src/componentes/certificado/PainelFontesAssinaturas.tsx)), e 3 campos de texto livre para as assinaturas (Responsável Técnico, Gerente de Validação, Apoio Adicional), com fallback pro nome do `Usuario` vinculado quando vazio
- [x] **Filtros da matriz** — fabricante e versão do agente (cortam colunas); "Faltam homologar" / "Só divergências" / "Sem justificativa" (cortam linhas); e um alerta com a contagem de divergências que fica vermelho quando há item sem justificar, com atalho para filtrar e resolver
- [x] **Edição inline do certificado** — lápis ao lado de cada justificativa de divergência e de cada assinatura no preview; grava `justificativaTexto` como override (spec §4.2). Os botões nunca saem no PDF (D76)

- [x] **Casca nova do sistema** — menu lateral retrátil (lembra o estado em `localStorage`), montado a partir das categorias ativas; a matriz passou a viver dentro dele, em `/matriz/:slug`
- [x] **Painel de Homologação** ([Home.tsx](frontend/src/paginas/Home.tsx)) — linha de pílulas por categoria ("Dispositivos: Todos · Terminal PoS · …") e duas abas: **Homologados** e **Em homologação**. É o formato do portal do parceiro, hoje atrás do login
- [x] **Popup de informações** ([ModalInformacoes.tsx](frontend/src/componentes/vitrine/ModalInformacoes.tsx)) — resumo agregado (OK / divergências / N.A. / não testados + progresso) e **Exportar certificado**, com link para o resultado completo
- [x] **Tela de informações** ([DetalheDispositivo.tsx](frontend/src/paginas/DetalheDispositivo.tsx)) em `/dispositivos/:id` — ficha da unidade testada, resultado item a item por grupo e o botão **Exportar certificado**
- [x] **Marca nova** — `logo-mobiltec.png` (lockup, no login e no menu aberto) e `marca-mobiltec.svg` (só o símbolo, 2 KB, no menu recolhido e no favicon). Os arquivos antigos (`logo-mobiltec.svg` de 330 KB, `favicon.svg`, `icons.svg`) foram removidos
- [x] **Filtro "Retestados"** na matriz — recorta as colunas com mais de uma homologação no histórico

### Fase 1 — MVP (spec §14)

- [x] ~~Tela 10.1 — Dashboard~~ — substituída pela **Home/vitrine**: o pedido virou "a tela que o parceiro vê", não um painel de KPIs internos
- [ ] Tela 10.2 — Lista de dispositivos (filtros + busca) — hoje a Home cobre parte disso; falta a visão operacional com edição
- [ ] Tela 10.3 — Ficha do dispositivo (identidade + timeline de homologações)
- [x] **Botão "Finalizar" na matriz** — encadeia `RASCUNHO → EM_REVISAO → APROVADO`, listando as pendências antes; dois botões para a decisão manual de `homologado` ([ModalFinalizar.tsx](frontend/src/componentes/matriz/ModalFinalizar.tsx))
- [x] **Logo oficial** em `frontend/public/logo-mobiltec.svg`

### Fase 0 — pendência de domínio

- [x] **Migrar os 31 PoS da planilha antiga** — feito em 25/08/2026 pelo [importar-planilha.ts](backend/prisma/importar-planilha.ts)
- [ ] **Revisar as 81 células de `"Não"` ambíguo** (query na §1). O import aplicou as justificativas conhecidas onde a regra era clara — Device Admin (64), SSID Android 9+ (10), políticas de senha (12), apps bloqueados (8) — mas a desambiguação do resto entre `FALHA`, `NAO_SUPORTADO` e `NAO_APLICAVEL` continua exigindo conhecimento humano do domínio, item a item, na matriz
- [ ] **Preencher a data de início por modelo.** A planilha não tem essa coluna e o import gravou 25/08/2026 em todas as 31 — o certificado mostra esse campo

### Fase 2+ — fora do MVP

- [ ] Matriz comparativa (§10.5), anexos por resultado, diff entre homologações, export PPTX (`python-pptx`), portal externo do parceiro

---

## 6. Dívidas técnicas conhecidas

| Item | Detalhe |
|---|---|
| `src/services/` | pasta vazia — decidir se fica ou sai |
| Papéis não são aplicados | só `GET /usuarios` checa `ADMIN`; `LEITOR` hoje pode escrever em tudo |
| `uso_count` da justificativa | ainda incrementa a cada `PUT`, mesmo reeditando o mesmo resultado. O import recontou a partir da verdade (D62), então os números estão certos hoje — mas voltam a inflar com o uso |
| Logo Mobiltec | [LogoMobiltec.tsx](frontend/src/componentes/LogoMobiltec.tsx) usa os arquivos de `public/`; o lockup tem raster embutido e pesa ~515 KB |
| Front sem tratamento de offline | se o backend cair, o checklist mostra o erro do autosave mas não enfileira as mudanças |
| Prisma 5.22 | há major 7.x disponível; migrar só depois do MVP |
| `npm audit` | 7 vulnerabilidades (1 moderada, 4 altas, 2 críticas) — revisar antes de sair da máquina local |
| Senhas default | `admin123`, `homolog_secret`, `postgres_admin` e o `JWT_SECRET` de exemplo, todos versionados |

---

## 7. Histórico de decisões

Toda escolha técnica fora da spec está em [DECISOES.md](DECISOES.md) — D01 a D185. As últimas etapas (D97 em diante) são de UI: casca do sistema, painel de homologação e ajustes de leitura da matriz.
