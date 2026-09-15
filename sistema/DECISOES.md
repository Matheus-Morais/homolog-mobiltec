# Decisões técnicas — Sistema de Homologação Mobiltec

> Toda escolha técnica que não estava na spec, com justificativa em uma linha.
> Mantido atualizado a cada etapa de implementação.

---

## Etapa 1 — Fundação

| # | Decisão | Justificativa |
|---|---|---|
| D01 | PostgreSQL via Docker Compose (porta 5432) | Isolamento do banco; fácil reset em dev |
| D02 | `@updatedAt` do Prisma para `atualizado_em` | Evita trigger manual; Prisma gerencia automaticamente |
| D03 | UUID gerado pelo banco (`gen_random_uuid()`) via Prisma `@default(uuid())` | Portável, sem dependência de sequence |
| D04 | IDs de seed determinísticos via hash numérico simples | Garante idempotência do seed sem unique composto no schema |
| D05 | `itensSugeridos` como `String[]` (array Postgres) | Evita tabela pivot para relação de sugestão; aceitável para volume pequeno |
| D06 | Sugestão de justificativas filtrada em memória (Node) em vez de SQL | Array Postgres não suporta `contains` simples no Prisma; volume é pequeno (< 50 registros) |
| D07 | `pino-pretty` apenas em `NODE_ENV=development` | Logs legíveis em dev, JSON estruturado em produção |
| D08 | Stack Node.js + Fastify + Prisma (sem Docker para Node) | Instalação via winget; Docker falhou por falta de WSL2/Hyper-V; PostgreSQL também via winget |
| D09 | `fastify-plugin` para encapsulamento de JWT e Prisma | Permite decorators disponíveis em toda a instância Fastify |
| D10 | Validação de entrada com Zod (não JSON Schema nativo do Fastify) | TypeScript-first, inferência de tipos, melhor mensagem de erro |
| D11 | `tipo_agente` mantido como `text` livre | Sem enum: fabricantes têm nomes proprietários variados; padronização pode ser feita depois com uma tabela |
| D12 | `ferramenta` e `metodo_inscricao` mantidos como campos separados | Aguardando resposta do usuário à questão A; adotei default: ferramenta = meio de teste auxiliar (ex: ADB), inscricao = método MDM |
| D13 | Upload de foto em `/uploads` local no MVP | Sem S3 no MVP; o caminho é configurável via `UPLOAD_DIR` |
| D14 | Constraint de justificativa obrigatória implementada em código (Zod) e não no banco | Prisma não suporta `CHECK` constraints diretamente; constraint será adicionada via migration SQL raw se necessário |
| D15 | Senha admin padrão: `admin123` | MVP interno; documentado explicitamente para troca imediata em produção |

---

## Etapa 1.1 — Subida do ambiente e correções

| # | Decisão | Justificativa |
|---|---|---|
| D16 | IDs de seed passam a usar UUID v5 real (SHA-1 sobre namespace fixo), substituindo o hash de 32 bits do D04 | Os ids antigos (`00000000-seed-4...`, `seed-bateria-pos-completa`) não eram UUIDs válidos e reprovavam no `z.string().uuid()` das rotas — `POST /homologacoes` com a bateria seedada retornava 400. UUID v5 mantém a idempotência e elimina o risco de colisão do hash de 32 bits |
| D17 | `dotenv` adicionado às dependências | `server.ts` já importava `dotenv/config`, mas o pacote não estava no `package.json`; o backend não subia. O Prisma CLI carrega `.env` sozinho, então só o servidor quebrava |
| D18 | Usuário `homolog` recebeu `CREATEDB` | O Prisma Migrate cria um *shadow database* em cada `migrate dev`; sem a permissão, falha com P3014 |
| D19 | `initdb` executado com `--pwfile` em vez do `--pwprompt` do `setup-postgres.ps1` | `--pwprompt` é interativo e trava em execução automatizada. Senha do superusuário `postgres`: `postgres_admin` |

---

## Etapa 2 — Frontend: base e checklist

| # | Decisão | Justificativa |
|---|---|---|
| D20 | Contrato de erro `{ erro, campos[] }` | Mantém a chave `erro` que as rotas já usavam; `campos` só aparece em erro de validação. Evita ter dois formatos de erro no sistema |
| D21 | Proxy do Vite `/api` → `:3001` em vez de base URL no cliente | Elimina CORS em dev e deixa o build de produção livre para servir front e back na mesma origem |
| D22 | Tokens do DS via `@theme` do Tailwind 4 | Gera utilities (`bg-primary`) *e* mantém `var(--token)` disponível, atendendo à regra do DS §12.1 de nunca hardcodar hex |
| D23 | JWT no `localStorage`, não em cookie httpOnly | MVP interno de origem única; cookie exigiria CSRF token e ajuste de `credentials`. Trocar se o portal externo da Fase 3 sair |
| D24 | Status que exige justificativa **não** dispara o PUT — abre o painel primeiro | O backend responde 422 nesse caso; mandar e falhar deixaria a UI piscando um estado que não foi salvo. A spec §10.4 pede o painel "no momento do clique" de todo jeito |
| D25 | Update otimista no cache do TanStack Query para o autosave | O admin marca dezenas de itens em sequência; esperar o round-trip a cada tecla mataria a premissa de "mais rápido que a planilha" |
| D26 | Cores de status: `NAO_SUPORTADO` em laranja de marca, `FALHA` em vermelho | A spec §5 exige que os dois sejam visualmente distintos — a planilha antiga os confundia num "Não" só |
| D27 | Checklist fora do `<Layout>`, em tela cheia | É operado por teclado e a sidebar só roubaria largura da lista de 48 itens |
| D28 | `data-item` / `data-status` nas linhas do checklist | Locator por texto acentuado é frágil; os atributos dão âncora estável para os roteiros Playwright |
| D29 | Playwright instalado no backend | Serve para verificar a UI agora e é o motor da geração do PDF (spec §8.4) depois — mesma dependência, dois usos |

---

## Etapa 3 — Matriz editável e certificado

| # | Decisão | Justificativa |
|---|---|---|
| D30 | A matriz é **editável inline**, não só leitura como na spec §10.5 | Pedido explícito do usuário: é a planilha Excel que o time já usa. O checklist continua existindo para execução focada de um aparelho; ambos escrevem no mesmo `resultado` |
| D31 | Mantidos os 6 status na matriz, em vez do Sim/Não da planilha | O "Não" da planilha misturava `FALHA`, `NAO_SUPORTADO` e `NAO_APLICAVEL`. A spec §5 proíbe o botão genérico e chama isso de regra central — a cor da célula preserva a ergonomia de grade sem perder o dado |
| D32 | Coluna = modelo, mostrando a homologação **mais recente** | É a leitura natural da planilha ("um PoS por coluna"). Os retestes continuam no banco e aparecem como contagem no cabeçalho — reteste nunca sobrescreve (§11.2) |
| D33 | `POST /matriz/modelo` cria dispositivo + homologação numa transação | Uma coluna sem homologação não significa nada, e falhar no meio deixaria um dispositivo órfão sujando a lista |
| D34 | Certificado **montado a partir dos dados**, não preenchendo o `certificado-editavel.html` | O template tem 3 páginas fixas com os itens divididos na mão; a spec §8.2 exige quebra calculada porque o número de itens muda por bateria. O CSS e as medidas do PPT foram reaproveitados integralmente |
| D35 | Paginação por altura estimada (constantes em polegadas), não medida no browser | Medir exigiria renderizar, medir e re-renderizar. As alturas do CSS são fixas (`line-height: 0.2in`), então a estimativa é exata para o caso normal |
| D36 | Fundo lido de `fundo-certificado.png` em runtime e inlinado como data URI | Evita duplicar 130 KB de base64 no código e mantém uma fonte única do asset. Sem o arquivo, o certificado sai em branco em vez de falhar |
| D37 | Preview entregue como HTML e injetado via `srcDoc` no iframe | O iframe não consegue mandar o header `Authorization`; buscar com o token e injetar evita ter que criar URL assinada |
| D38 | `/uploads` servido sem autenticação | O caminho contém o UUID da homologação, que não é adivinhável. Trocar por URL assinada se o portal externo da Fase 3 sair |
| D39 | Emissão **não** é bloqueada por itens pendentes; devolve aviso | A spec §10.6 pede "avisar se houver pendências", não impedir. Quem decide é o admin |
| D40 | `data-modelo` nos cabeçalhos de coluna da matriz | As colunas são ordenadas por nome, então posição não é âncora estável para os roteiros de verificação |
| D41 | `fotoUrl` aceita URL http(s) **ou** caminho `/uploads/...` | Só `.url()` impedia gravar a foto enviada pelo próprio sistema, que é o caso normal |
| D42 | Foto embutida no certificado como data URI, não referenciada por caminho | O preview vai para um `srcDoc` e o PDF para `page.setContent` — nenhum dos dois tem base URL para resolver caminho relativo. De quebra, o PDF arquivado sobrevive se o arquivo sumir depois |
| D43 | Nome de arquivo novo a cada upload de foto | Trocar a foto não pode ser mascarado por cache do browser, e certificados já emitidos guardam o caminho antigo no snapshot |
| D44 | Checagem de travessia de diretório ao ler a foto | `fotoUrl` vem do banco e é confiável hoje, mas o custo de checar é zero e o estrago de não checar seria ler qualquer arquivo do disco |

---

## Etapa 4 — Certificado completo e UI clara

| # | Decisão | Justificativa |
|---|---|---|
| D45 | **Reversão parcial da spec §8.3**: `NAO_TESTADO` passa a ocupar a linha no certificado, com o status **em branco** | Omitir a linha inteira fazia o certificado de uma homologação recém-aberta perder todas as páginas de matriz e sobrar só a de divergências. O princípio da spec ("o que não foi avaliado não é atestado") continua valendo — a célula vazia não afirma nada — mas o documento passa a seguir sempre a estrutura do modelo base. Pedido explícito do usuário |
| D46 | Campos de ficha não preenchidos saem em branco, não como `—` | Mesma lógica: o modelo base mostra o campo vazio, não um marcador |
| D47 | "Nenhuma divergência técnica foi identificada" só aparece se algo foi avaliado | Com tudo em branco, essa frase seria uma afirmação falsa sobre testes que não aconteceram |
| D48 | **Tema claro fixo** (`color-scheme: light`), removendo o `@media (prefers-color-scheme: dark)` | O usuário roda o SO em modo escuro e a matriz — uma grade densa de 48x7 lida o dia inteiro — ficava ilegível. Se o modo escuro voltar, tem de ser uma escolha dentro da aplicação, não herdada do SO |
| D49 | Token `-fill` por status, separado do `-soft` | A célula da matriz precisa de saturação para ler de relance, como o preenchimento sólido do Excel; áreas maiores (painéis, avisos) continuam no tom suave |
| D50 | Layout em cards com faixa de marca no topo | Alinha a matriz ao Dashboard de Suporte que o usuário usa como referência estética |
| D51 | **KPIs removidos** do topo da matriz | Pedido do usuário: as contagens competiam por atenção com a grade, que é o objeto real da tela. As mesmas contagens continuam no cabeçalho do checklist, por homologação, onde são acionáveis |
| D52 | Badge de status ("Rascunho") removido do cabeçalho de coluna | Toda homologação em edição está em rascunho, então o badge repetia a mesma informação em todas as colunas sem distinguir nada |
| D53 | Novo token `--color-brand-purple-deep` (`#4a1240`) | O `--color-brand-purple` não dava contraste suficiente para texto branco pequeno no rail lateral. Reutilizável — o gradiente do login já usava esse hex hardcoded, violando o DS §12.1; agora consome o token |
| D54 | Rail do grupo centralizado por `absolute inset-0` sobre um `h-0 min-h-full` | Numa célula com `rowspan`, a altura vem das linhas irmãs; sem essa referência o flex não tem o que centralizar |

---

## Etapa 5 — Import da planilha PoS (Fase 0)

| # | Decisão | Justificativa |
|---|---|---|
| D55 | Import em duas partes: [extrair-planilha.py](backend/prisma/dados/extrair-planilha.py) transcreve o `.xlsx` para JSON, [importar-planilha.ts](backend/prisma/importar-planilha.ts) traduz e grava | Separa o que é leitura de arquivo do que é decisão de domínio. O JSON é uma cópia literal da planilha, revisável em diff; toda interpretação fica num único bloco de TS que dá para discutir sem abrir o Excel. Evita também uma dependência npm de leitura de xlsx só para isso — o Python da máquina já tem `openpyxl` |
| D56 | `"Não"` sem regra conhecida vira `NAO_SUPORTADO` com o texto `NOTA_REVISAO`, não `FALHA` nem `NAO_TESTADO` | Escolha do usuário entre as três. `NAO_TESTADO` jogaria fora 81 células de dado real; `FALHA` afirmaria bug do fabricante sem evidência. `NAO_SUPORTADO` com a justificativa dizendo explicitamente que a classificação está pendente preserva o dado, sai honesto no certificado e deixa a fila de revisão a uma query de distância (`justificativa_texto like 'Migrado da planilha%'`) |
| D57 | Campo novo `versao_pos` na homologação (PROD / DEBUG / PROTOTIPO) | A planilha tem essa linha e ela muda o peso do resultado: homologar sobre build de debug não é o mesmo que sobre build de produção. Sem o campo, a matriz não conseguiria substituir a planilha, que é a premissa do D30 |
| D58 | `ferramenta` e `metodoInscricao` importados da mesma coluna "Ferramenta" | A planilha tem uma coluna só, e os valores dela (SunmiTool, ADB, AXIUM Toolkit, Bluetooth) são o que o certificado chama de "Método de Inscrição". Mantém o D12 de pé — os campos continuam separados no schema — sem inventar dado que a planilha não tem |
| D59 | Fabricante canonizado por tabela (`GERTEC`/`Gertec` → `Gertec`, `PAX A960` → `PAX`) | `(fabricante, modelo)` é chave única e vira filtro na lista de dispositivos. Duas grafias do mesmo fabricante criariam dois fabricantes. `PAX A960` na coluna de fabricante é erro de digitação evidente — o modelo já está na coluna do lado |
| D60 | "Requisito de Instalação" é linha **descritiva**: todo valor preenchido vira `OK` com o texto na observação | A linha responde *qual* é o requisito ("APK Assinado"), não aprovado/reprovado. O `"Não"` dela significa "não exige nada" — mapear para `NAO_SUPORTADO` como nos outros itens inverteria o sentido |
| D61 | `homologado` importado da planilha mesmo com a homologação em `RASCUNHO` | A regra §11.5 proíbe **calcular** `homologado` a partir dos status; importar a decisão que o time já tinha registrado não é calcular. O status fica `RASCUNHO` porque nenhuma dessas homologações passou pelo fluxo de revisão do sistema novo |
| D62 | `uso_count` recontado ao fim do import (`count(resultado)` por justificativa) | Era dívida conhecida (o contador inflava a cada `PUT`). Um import de 1.488 resultados estouraria de vez; recontar a partir da verdade custa 4 queries e conserta o histórico junto |
| D63 | Import é idempotente por `(fabricante, modelo)` e pula homologação `APROVADO`/`PUBLICADO` | Rodar de novo depois de o Excel mudar é o caso normal. Reabrir uma homologação aprovada por reimport violaria o §11.4 e apagaria a base de um certificado já emitido |

---

## Etapa 6 — Fontes e assinaturas do certificado

| # | Decisão | Justificativa |
|---|---|---|
| D64 | `fontes` (lista manual) somada às fontes derivadas das justificativas, não substituindo-as | O rodapé "Fontes" já existia, populado automaticamente a partir de `justificativa.fontes` das divergências. O pedido foi um campo para ir *acrescentando* links — remover a derivação existente seria perder informação que já funcionava |
| D65 | Fonte manual com o mesmo rótulo de uma derivada **vence** a derivada | Foi escrita de propósito pelo usuário; a automática é um fallback |
| D66 | Assinatura de cada linha (Responsável/Gerente/Apoio) é texto livre em coluna própria (`assinatura*`), não a seleção de um `Usuario` via `gerenteId`/`apoioId` | Gerente e Apoio Adicional raramente têm conta no sistema — exigir isso pra assinar o certificado bloquearia o caso comum. Texto livre com fallback pro nome do `Usuario` (quando existe) cobre os dois casos |
| D67 | Campo de assinatura mostra o nome do `Usuario` vinculado como *placeholder*, não como valor | Se o usuário não digitar nada, o certificado ainda usa o nome da relação (compatibilidade com o que já funcionava para Responsável, que é sempre preenchido). O placeholder deixa claro que aquele é o valor-padrão, editável |
| D68 | Painel de Fontes/Assinaturas fica na tela do certificado, não na matriz | São campos do rodapé do documento, editados no mesmo lugar onde se confere o resultado (preview ao lado). A matriz já está lotada de colunas; enfiar uma lista de tamanho variável numa célula não caberia |

---

## Etapa 7 — Filtros da matriz e edição inline do certificado

| # | Decisão | Justificativa |
|---|---|---|
| D69 | "Só divergências" agora exclui `NAO_APLICAVEL` | **Era o bug** que o usuário reportou como "meio bugado": o filtro antigo era `status !== OK && status !== NAO_TESTADO`, o que arrastava "Não aplicável" junto. Pela spec §5, divergência é só `FALHA`, `NAO_SUPORTADO` e `COM_RESSALVA` — os três que exigem justificativa e saem na Análise das Divergências |
| D70 | Filtros de fabricante e versão do agente cortam **colunas**; o filtro de itens corta **linhas** | São eixos diferentes da mesma grade. Misturar os dois num filtro só (ex.: "esconder o que não casa") deixaria a matriz com buracos em vez de uma fatia coerente |
| D71 | Filtro de linha usa `some()` sobre as colunas visíveis, não `every()` | Se um único modelo tem a divergência, a linha interessa — o valor da matriz é justamente comparar onde os modelos diferem |
| D72 | Alerta de divergências mostra o total e destaca em vermelho só quando há item **sem justificativa** | Divergência justificada é trabalho concluído, não pendência. O que trava o avanço para `EM_REVISAO` é a falta de justificativa, e é isso que o alerta precisa gritar |
| D73 | Texto livre virou **override** de verdade: `justificativaTexto ?? justificativa?.texto` | A precedência estava invertida (a biblioteca vencia), o que tornaria a edição pelo lápis silenciosamente inócua em item com justificativa da biblioteca. A spec §4.2 já chamava o campo de "override / texto livre". Verificado antes de trocar: zero linhas com os dois campos preenchidos |
| D74 | Divergências agrupadas por **texto**, não por `justificativaId` | Depois da edição inline, dois itens que dividiam a mesma justificativa da biblioteca podem ter textos diferentes. Agrupar por id os juntaria num parágrafo só, mostrando o texto de um e escondendo o do outro |
| D75 | Lápis renderizado dentro do HTML do certificado, comunicando por `postMessage` | O usuário pediu o botão "ao lado de cada texto" — no documento, não numa lista à parte. O preview é um `srcDoc` (mesma origem), então o `postMessage` chega ao React sem gambiarra |
| D76 | Lápis só existe com `?editavel=1` **e** tem `display:none` no `@media print` | Duas barreiras porque o custo de vazar um botão para o PDF do cliente é alto. O PDF usa a rota sem o parâmetro; a regra de print cobre quem imprimir o preview direto do navegador |
| D77 | Editar um parágrafo compartilhado grava em **todos** os itens dele, com aviso no modal | Alternativa seria quebrar o agrupamento e editar item a item, mas aí o usuário teria que repetir o mesmo texto N vezes para manter o parágrafo unido no certificado |

---

## Etapa 8 — Finalizar, logo oficial e certificado só com o justificado

| # | Decisão | Justificativa |
|---|---|---|
| D78 | **Divergência sem justificativa sai em branco no certificado**, igual a um item não testado | Pedido do usuário e coerente com a regra que já valia: o documento só afirma o que foi avaliado. Sem a explicação técnica ao lado, o certificado acusaria o dispositivo sem fundamentar, e a "Análise das Divergências" teria item órfão sem parágrafo. Assim que a justificativa é preenchida, o status reaparece |
| D79 | "Finalizar" encadeia `RASCUNHO → EM_REVISAO → APROVADO` num clique só | O fluxo de dois passos da spec §7.5 faz sentido para o backend (cada transição tem sua validação), mas para quem opera a matriz "finalizar" é uma ação única. As pendências são mostradas **antes**, no modal, em vez de virarem um 422 na cara |
| D80 | Modal de finalizar oferece dois botões — "Homologado" / "Não homologado" — em vez de um só | `homologado` é decisão manual do admin (spec §11.5). Um botão único obrigaria a deduzir a decisão do resultado dos testes, que é exatamente o que a regra proíbe |
| D81 | Filtro de situação usa `ehSomenteLeitura` (APROVADO ou PUBLICADO) como definição de "finalizado" | É a mesma condição que já trava a edição em todo o resto do sistema; criar um conceito paralelo de "finalizado" abriria espaço para os dois divergirem |
| D82 | Primeira opção dos seletores é explícita ("Todos os fabricantes (12)"), não o nome do campo | Com o rótulo do campo como primeira opção, não ficava claro que selecioná-la de volta restaurava a matriz inteira |
| D83 | Logo oficial servida de `public/` como `<img>`, não inlinada no bundle | O SVG tem raster embutido (~323 KB); inliná-lo inflaria o JS. Consequência aceita: a cor é fixa e não herda `currentColor` |
| D84 | Sobre fundo escuro, logo original numa **pastilha branca** em vez de `filter: invert` | O invert achatava o ícone colorido num círculo branco sem desenho — verificado na captura. A pastilha preserva a marca como ela é |

---

## Etapa 9 — Barra compacta e remoção do checklist

| # | Decisão | Justificativa |
|---|---|---|
| D85 | Dropdown próprio (`SeletorFiltro`) no lugar do `<select>` nativo | O nativo exibe o texto da opção selecionada quando fechado, então "Todos os fabricantes" ocuparia a barra no estado padrão. O componente mostra o rótulo curto fechado ("Fabricante") e o texto completo na lista aberta |
| D86 | **Tela de checklist removida** (spec §10.4) | Pedido do usuário: a matriz passou a fazer tudo que o checklist fazia — marcar status, justificar, filtrar — e com visão comparativa entre modelos. Manter as duas seria duas portas para o mesmo dado, com risco de divergirem. Removidos `Checklist.tsx`, `LinhaItem.tsx` e os dois roteiros de verificação; `PainelJustificativa` migrou para `componentes/matriz/` |
| D87 | **Observação migrada para o menu da célula** antes de remover o checklist | Era a única capacidade que a matriz não tinha e o checklist sim. Havia 180 observações no banco que virariam somente-leitura. Perder isso em silêncio seria pior que o ganho da simplificação |
| D88 | Botão **Reabrir** criado junto com o Finalizar | O checklist era a única porta de saída de uma homologação aprovada. Sem ele, "Finalizar" viraria caminho sem volta pela UI — e o próprio modal diz "é preciso reabrir" |
| D89 | `useTransicaoStatus` e `useReabrir` invalidam também a chave `['matriz']` | **Bug encontrado no teste**: a reabertura gravava no banco mas o cabeçalho da coluna continuava mostrando "Reabrir" em vez de "Finalizar", porque só o cache da homologação era invalidado |
| D90 | Atalhos de teclado `1`–`6` (spec §10.4) foram embora com o checklist | A matriz é navegada por clique — a grade é bidimensional e não tem o conceito de "linha atual" que os atalhos exigiam. Se a velocidade de digitação voltar a pesar, o caminho é reintroduzi-los na matriz, não ressuscitar a tela |
| D91 | Menu do `SeletorFiltro` é `position: fixed` com coordenadas da tela | **Bug relatado**: o card do cabeçalho tem `overflow-hidden` e recortava um menu `absolute`. `fixed` escapa de qualquer `overflow` do ancestral |
| D92 | O menu recebe **largura explícita** (`max(largura do botão, 208px)`) | **Segundo bug**: sem `width`, um elemento `fixed` ocupa da posição até a borda da janela, e os itens `w-full` esticavam junto — o menu ia até o fim da tela. 208px é o mínimo para "Todos os fabricantes (12)" caber |
| D93 | As três ações do cabeçalho de coluna numa linha; largura da coluna 180 → 196px | Pedido de compactação. O selo "✓ Homologado" desceu para uma linha própria, já que só aparece em coluna finalizada e não competiria por espaço no caso comum |

---

## Etapa 10 — Rail dos grupos com filtro ligado

| # | Decisão | Justificativa |
|---|---|---|
| D94 | O rail roxo vertical **continua o mesmo** com filtro de itens ligado | Cheguei a trocá-lo por uma faixa horizontal com o nome do grupo; o usuário não gostou e pediu o padrão de antes. A quebra visual não vinha do rail em si, e sim de um bug de layout (D95) |
| D95 | `min-h-full` dentro de `td[rowspan]` **não resolve** — o contêiner do rótulo tinha 0px de altura | Causa raiz do "bug visual": sem altura de referência, o texto girado transbordava a célula e escorria por cima dos grupos vizinhos (visível na captura do usuário). A `td` já é `sticky`, logo é bloco de contenção: o rótulo passou a ser `absolute inset-0`, que preenche a célula de verdade |
| D96 | `RotuloGrupo` mede e escolhe a maior forma que couber: nome completo → forma curta → sigla | Com "Sem justificativa" um grupo pode ficar com uma linha só (~31px) e nem "Coleta" cabe na vertical. Cortar com reticências deixava o rail em branco, sem informação nenhuma; a sigla mantém o grupo identificável e o nome completo fica no `title` |

---

## Etapa 11 — Casca do sistema, categorias e vitrine

| # | Decisão | Justificativa |
|---|---|---|
| D97 | Com filtro de itens ligado, o rail roxo **some** — sobra só o nome do item | Pedido do usuário depois de ver as duas tentativas anteriores. Com uma linha por grupo o rail não tem altura para nada legível; a coluna de itens encosta na borda esquerda (`left: 0`) |
| D98 | `Categoria.ativo` (migração `add_categoria_ativo`) em vez de apagar as categorias sem uso | Smartphone, Tablet e iOS saem do menu mas continuam no banco. Apagar categoria é irreversível e levaria junto qualquer dispositivo futuro ligado a ela |
| D99 | O menu é montado a partir de `GET /categorias`, não de uma lista no código | Cadastrar uma categoria no banco a faz aparecer sozinha. Foi assim que "Impressora Térmica" e "Coletor de Dados" entraram sem tocar no componente |
| D100 | As categorias novas nasceram com **bateria própria**, reaproveitando os 48 itens do catálogo PoS | Sem bateria a categoria abre mas não deixa cadastrar modelo — nasceria morta. Os itens são de agente MDM em Android, valem igual para impressora e coletor |
| D101 | A matriz saiu da rota de tela cheia e passou a viver dentro do menu, em `/matriz/:slug` | O menu precisa estar sempre disponível para trocar de categoria. O espaço perdido volta ao recolher a barra (280 → 64px) |
| D102 | A logo sumiu da barra da matriz e ficou só no menu | Com a barra lateral em tela, a logo aparecia duas vezes. O roteiro `verificar:finalizar` agora exige exatamente isso: 1 no `aside`, 0 no `header` |
| D103 | O catálogo da home lista **só homologação finalizada**; o resto vai para "Em homologação", sem resultado item a item | É a tela que o parceiro verá. Enquanto a revisão não fecha, um "não suportado" ainda pode mudar de classificação — publicar isso como fato seria informação errada com aparência de oficial |
| D104 | "Retestados" é um **filtro na própria matriz**, não uma tela nova | Escolha do usuário entre as três opções apresentadas. Reteste é um recorte dos mesmos dados; uma segunda tela duplicaria a planilha inteira para mudar só o conjunto de colunas |
| D105 | `verificar:catalogo` cria um modelo descartável e o desativa no fim | Nenhum dos 31 modelos reais está finalizado, então o card do catálogo não teria como ser verificado sem inventar dado. O modelo nasce e morre dentro do roteiro, e a falha na limpeza é reportada como erro |

---

## Etapa 12 — Marca, abas de dispositivos e tela de informações

| # | Decisão | Justificativa |
|---|---|---|
| D106 | Dois arquivos de marca, cada um no seu lugar: `logo-mobiltec.png` (lockup) e `marca-mobiltec.svg` (símbolo) | O lockup tem o nome e a assinatura — ilegível abaixo de ~90px. O símbolo é vetorial de verdade e tem 2 KB, então serve ao favicon e ao menu recolhido, onde só há 64px |
| D107 | Recolhido, o **símbolo é o botão de expandir** o menu | Ganha-se o reforço de marca sem gastar altura com um ícone extra; o `aria-label` e o `title` continuam dizendo o que o clique faz |
| D108 | Os arquivos antigos foram apagados, não deixados de lado | `logo-mobiltec.svg` tinha 330 KB de raster embutido. Manter os dois convidaria a usar o errado por engano |
| D109 | A tela de dispositivos ganhou duas abas — **Catálogo** e **Lista** | Pedido do usuário. São públicos diferentes: o catálogo é o que o parceiro vê, a lista é a visão de trabalho para achar um modelo específico |
| D110 | A flag de status ("Rascunho") saiu dos cards de "Em homologação" | Pedido do usuário. O estado interno do documento não diz nada a quem olha de fora; a barra de progresso responde a pergunta real, que é o quanto falta |
| D111 | O card leva a **Exibir informações**, e o certificado se exporta de lá | O certificado é o desfecho, não a porta de entrada: quem abre o card quer ver o resultado antes de baixar um PDF |
| D112 | Os 3 exemplos do catálogo vivem em [exemplos.ts](frontend/src/lib/exemplos.ts), **fora do banco**, com selo "Exemplo" visível | O usuário pediu mocks para ver o formato enquanto nada está finalizado. Num sistema que emite certificado assinado, dado inventado não pode se confundir com dado real: eles não passam por nenhuma consulta, o `homologacaoId` começa com `exemplo-` (não é UUID, a API recusaria), a tela de detalhe abre com aviso e o botão de exportar certificado fica desabilitado |
| D113 | Exemplo aparece só no catálogo — fora da lista de trabalho e de toda contagem | "31 modelos no Cloud4Mobile" tem de ser verdade. Inflar o inventário com mock seria mentir num número que alguém vai repetir |

---

## Etapa 13 — Painel de Homologação

| # | Decisão | Justificativa |
|---|---|---|
| D114 | Primeiro item do menu virou **Painel de Homologação** | Das três opções do usuário ("painel de homologação", "início", "home"), é a que diz o que a tela faz. "Dispositivos" passou a nomear a linha de pílulas dentro dela, sem competir com o item do menu |
| D115 | Cabeçalho em duas linhas: **"Dispositivos" + pílulas** (que dispositivos) e **abas Homologados / Em homologação** (em que ponto eles estão) | São perguntas independentes — filtrar por categoria e filtrar por estágio. Empilhadas, o usuário combina as duas sem que uma esconda a outra |
| D116 | Os mocks fabricados foram **apagados**; o exemplo agora é o **L400 real**, com dados vivos da API | Pedido do usuário ("deixa só o L400 mas puxa os dados atualizados automaticamente"). Some junto o risco de dado inventado: não há mais texto de justificativa fictício em lugar nenhum do código. O selo "Exemplo" continua porque a posição é que é de mentira — a homologação não está finalizada |
| D117 | O card de exemplo **desaparece sozinho** quando existir homologação finalizada | Sem isso ele viraria lixo permanente na tela. A condição é `finalizados.length === 0` |
| D118 | "Exibir informações" abre **popup**, não navega | Pedido do usuário. O resumo é curto e a decisão seguinte costuma ser exportar o certificado — tirar a pessoa da lista para mostrar 6 números custaria mais do que entrega. O item a item continua a uma tela de distância, linkado no pé do popup |
| D119 | A aba de tabela ("Lista de dispositivos") saiu | O usuário substituiu o par de abas por Homologados / Em homologação, e a linha de pílulas passou a ser a "lista de dispositivos". `ListaDispositivos.tsx` foi removido em vez de virar código morto — voltar é recriar o componente, o git guarda |
| D120 | Foto do card posicionada em **absoluto**, não com altura percentual | **Bug medido**: num contêiner centralizado, `h-full`/`max-h-full` não resolvem contra a altura da caixa e a imagem renderizava 300px numa caixa de 150px, vazando por cima do texto. O roteiro passou a medir o transbordo |
| D121 | `FotoDispositivo` prefixa `/api` em caminhos `/uploads/...` | O banco guarda o caminho relativo e quem serve os arquivos é o backend, atrás do proxy do Vite. Sem o prefixo a foto quebrava — e um `<img>` quebrado não aparece em nenhum log |

---

## Etapa 14 — Card, popup sóbrio e menu com botão externo

| # | Decisão | Justificativa |
|---|---|---|
| D122 | Card do catálogo: **nome no topo, foto cavalgando a divisória** | Pedido do usuário. Separa "quem é o aparelho" de "como ele se comporta" sem gastar texto. A foto ficou 40% acima da linha e o bloco de cima ganhou `pb-11`: com o centro exato (50%) ela cobria o nome — medido e travado no roteiro (`tituloAcimaDaFoto`) |
| D123 | O selo "Exemplo" saiu; o card mostra **Homologado em verde**, e a flag "Homologação em andamento" foi removida | Pedido do usuário. O aviso de que se trata de um exemplo continua **fora do card**, no texto acima da grade — que também explica que ele dá lugar aos modelos reais. É a única ressalva que sobrou, e ela sai sozinha quando houver homologação finalizada |
| D124 | Popup: o bloco amarelo virou **uma frase de resumo** | "37 de 48 itens funcionaram sem ressalva, 7 apresentaram divergência justificada e 4 ainda não foram avaliados." Diz o mesmo que o alerta dizia, sem o peso visual de um aviso — e serve para qualquer modelo, não só para o exemplo |
| D125 | Os quatro contadores do popup ficaram **todos com o mesmo fundo** | Quatro cores diferentes deixavam o popup mais colorido que informativo (reclamação do usuário). O rótulo já distingue OK de divergência; a cor não estava carregando informação que o texto não desse |
| D126 | "Abrir certificado" saiu da tela de resultado completo | É a mesma tela que o parceiro vai ver, e ele não edita certificado — só exporta. A edição continua na tela do certificado, alcançável pela matriz |
| D127 | O botão de abrir/fechar o menu saiu de dentro da barra e virou um **botão fixo na borda** | Reclamação do usuário: recolhido, era preciso clicar na logo para abrir, e logo não é botão. Fica sobre o divisor (`left: largura - 8`) em vez de totalmente fora porque, solto no conteúdo, colidiria com o título da página em qualquer altura testada |
| D128 | Sem botão no cabeçalho, a logo ficou **centralizada e maior** (44px) | Era o espaço que o botão ocupava. Recolhido, o símbolo também centraliza. O roteiro exige desvio do centro ≤ 2px e zero botões dentro do cabeçalho |

---

## Etapa 15 — Botão solto, busca na linha das abas e card compacto

| # | Decisão | Justificativa |
|---|---|---|
| D129 | O botão de alternar ficou **solto fora da barra**, com 8px de folga, e o `<main>` ganhou `pl-2` | O usuário não gostou dele colado (D127). A faixa de 8px é o que impede a colisão que motivou o encosto: sem ela o botão cai por cima do título da página, que começa rente à borda do menu. O roteiro agora mede folga, cobertura do `<h1>` e se algo está por cima do botão |
| D130 | Cabeçalho da matriz passou de `px-6` para `px-8` | Uniformiza com o painel e garante folga depois do botão de alternar. Sem isso, o conteúdo da matriz começava exatamente onde o botão termina |
| D131 | A busca saiu do topo e foi para a **linha das abas**, ao lado e fora do grupo | Pedido do usuário. Ganha-se uma linha inteira no cabeçalho e a busca fica junto do que ela filtra. O roteiro exige que ela esteja na mesma linha, à direita e **fora** do `[role=tablist]` |
| D132 | Card compacto: coluna 280 → 252px, foto 88 → 96px, dados mais perto da imagem | Pedido do usuário. A foto subiu para 45% acima da divisória: quanto mais alta, mais ela ocupa o espaço já reservado no bloco do título e menos altura sobra abaixo — é o que permite crescer a imagem e encolher o card ao mesmo tempo |

---

## Etapa 16 — Barra superior, conteúdo centralizado e marca vetorial

| # | Decisão | Justificativa |
|---|---|---|
| D133 | O botão de alternar virou uma **barra superior em card**, com borda e canto arredondado | Terceira tentativa de posicioná-lo (D127 colado, D129 solto). Solto ele continuava apertado entre o menu e o título; numa faixa própria ele tem folga por construção, e a barra ainda carrega a trilha da seção — o padrão da referência que o usuário mandou |
| D134 | A trilha da barra é derivada da rota, casando com os itens do menu | Não há lista paralela de títulos para desatualizar: a mesma estrutura que monta o menu nomeia a seção. `/dispositivos/:id` cai no item raiz, que é de onde a tela é alcançada |
| D135 | O conteúdo do painel foi **centralizado** em `max-w-[76rem]` | Pedido do usuário. Em 1600px, tudo à esquerda deixava ~40% do painel vazio. A matriz ficou de fora: é planilha e precisa de toda a largura |
| D136 | O card mostra **só o modelo** no título, com o fabricante na linha de cima | `nomeComercial` costuma repetir os dois ("Positivo L400" sob "POSITIVO"). O roteiro agora reprova se o título contiver o nome do fabricante |
| D137 | Lockup trocado por `logonomesvg.svg` (515 KB, servido de `public/`) | Pedido do usuário. É maior que o PNG que substituiu (255 KB) — segue fora do bundle por isso. O símbolo de 2 KB continua respondendo por favicon e menu recolhido, que é onde o peso importaria |

---

## Etapa 17 — O painel inteiro como card

| # | Decisão | Justificativa |
|---|---|---|
| D138 | O card arredondado é o **painel inteiro**, não a barra do topo | Correção de leitura: o pedido era o formato da referência, em que a área de conteúdo é uma folha solta. A barra do topo virou o cabeçalho dessa folha, com borda inferior em vez de card próprio |
| D139 | Folga de 8px em volta do painel e **fundo da janela na cor do menu** | É a faixa que faz o card parecer solto. O `aside` perdeu a borda direita: quem separa menu e conteúdo agora é a faixa, não um traço |
| D140 | O nome da seção aparece **só na trilha** da barra | O painel escrevia "Painel de Homologação" duas vezes. As páginas deixaram de ter `<h1>` próprio: o `<h1>` é a trilha, no Layout, e os títulos internos (matriz, ficha do dispositivo) viraram `<h2>` — o que também conserta o dois-`h1`-por-página |
| D141 | O roteiro conta quantas vezes o nome da seção aparece na tela | A duplicata voltaria fácil ao adicionar título numa página nova. A contagem é o que impede |

---

## Etapa 18 — Card compacto e fim do seletor de itens

| # | Decisão | Justificativa |
|---|---|---|
| D142 | Saíram os textos explicativos acima das grades do painel | Pedido do usuário. Com isso o card do L400 deixa de ter qualquer ressalva na tela: ele aparece como "Homologado" mesmo com a homologação em 92%. Registrado aqui porque a tela é a do parceiro |
| D143 | Card compactado de 271px para ~246px de altura, sem mexer na foto | Foram os vãos: `pt` do topo, espaçamento entre as linhas de dados (`space-y-1` → `space-y-0.5` com `leading-tight`), margem e altura do botão. A foto e sua posição ficaram intocadas, como o usuário pediu |
| D144 | O respiro interno da foto cai de `p-3` para `p-2` dentro da pastilha | O vão medido entre foto e dados era de 2px — o que se via era o padding interno da imagem. A moldura já separa a foto do fundo, então o respiro extra só afastava os dados |
| D145 | `pt-14` no bloco de dados é piso, não estética | Abaixo disso a foto encosta na primeira linha (medido: `pt-13` dava −2px de vão). Está comentado no código para não ser "otimizado" depois |
| D146 | **Seletor "Itens" removido** da barra da matriz | Pedido do usuário. O recorte de linhas continua existindo, acionado pelo painel de divergências ("N sem justificativa — filtrar para resolver") |
| D147 | Com o recorte ligado, aparece uma **etiqueta roxa removível** na barra | Sem o seletor não haveria como desfazer o filtro — o usuário ficaria preso na visão recortada. O roteiro exige a etiqueta e que limpá-la restaure as 48 linhas |

---

## Etapa 19 — Nome do sistema ao centro e cabeçalho da matriz limpo

| # | Decisão | Justificativa |
|---|---|---|
| D148 | A barra do card ganhou **"Registro de Testes Internos" ao centro**, igual em toda tela | Pedido do usuário. Divide o cabeçalho em dois papéis: a trilha à esquerda diz onde se está, o centro diz que sistema é. Fica numa constante única (`NOME_SISTEMA`), então renomear é uma linha |
| D149 | O centro é posicionado em absoluto, não por `justify-between` | Com a trilha à esquerda de largura variável, o centro do que sobra não é o centro da barra. O roteiro mede o desvio e exige ≤ 2px |
| D150 | A trilha virou texto secundário (`span` esmaecido) e o `<h1>` passou a ser o nome do sistema | Só um `<h1>` por página, e ele nomeia o documento, não a navegação |
| D151 | Cabeçalho da matriz perdeu o card, a faixa de marca e o título — sobraram os **filtros centralizados** | Pedido do usuário. Com o nome na barra do card, o título repetia; a moldura sobrava dentro de um painel que já é card. O painel de divergências manteve moldura própria, porque é conteúdo que aparece e some |
| D152 | Símbolo do menu recolhido de 36px para 28px | Pedido do usuário: sufocava os 64px da barra |
| D153 | Dados do card sobem para `pt-13`, rentes à foto | A foto é estreita e centralizada (96px num card de 252px) e rótulo/valor ficam nas pontas — não há colisão horizontal. O respiro interno da foto caiu para `p-1.5`, fechando o vão que ainda se via |

---

## Etapa 20 — Cabeçalho da matriz em tinta clara

| # | Decisão | Justificativa |
|---|---|---|
| D154 | O nome do registro aparece **só nas telas de planilha** | Pedido do usuário. É o rótulo do documento que a bateria de testes produz; no painel não se registra nada, só se lê o que já foi homologado. A trilha voltou a ser o `<h1>` — é ela que nomeia a página em qualquer tela |
| D155 | Dois tokens novos: `--color-brand-soft` e `--color-brand-soft-border` | Reclamação do usuário de que a faixa dos modelos cansava a vista. São 31 colunas em roxo chapado ocupando o topo inteiro da planilha. A tinta clara mantém a faixa pertencendo à marca sem competir com os dados; ficou como token porque superfície grande de marca vai reaparecer |
| D156 | Ações do cabeçalho: **pastilha branca com traço e texto roxos**; só "Finalizar" em roxo sólido | Sobre fundo claro, o `rgba(255,255,255,.14)` de antes sumia. A hierarquia ficou explícita: navegar é secundário, fechar a homologação é a ação que decide |
| D157 | "Finalizar" recebeu borda da própria cor | **Regressão pega pelo roteiro**: com borda só nos vizinhos, ele ficava 2px mais baixo e a linha desalinhava. A borda invisível iguala as alturas |
| D158 | O roteiro passou a medir a luminância do cabeçalho | "Não voltar ao roxo chapado" é uma decisão de leitura, não de gosto — e some fácil numa refatoração de estilo. A checagem exige fundo claro e nome do modelo em cor escura |
| D159 | Popup: o parágrafo de resumo saiu e o botão secundário ganhou fundo cinza | Pedido do usuário. O secundário era branco sobre card branco: sobrava a borda fina, e o botão praticamente desaparecia |
| D160 | "Exportar certificado" centralizado na altura do card da ficha | Pedido do usuário; o roteiro mede o desvio do centro |

---

## Etapa 21 — Planilha em cinza e card flanqueando a foto

| # | Decisão | Justificativa |
|---|---|---|
| D161 | A tinta clara de marca durou uma etapa: cabeçalho da matriz agora é **cinza neutro** (`--color-muted`) | O usuário achou o roxo claro tão enjoativo quanto o escuro. A marca ficou onde carrega significado — texto do modelo e botão "Finalizar". Os tokens `--color-brand-soft*` foram removidos em vez de ficarem órfãos |
| D162 | Coluna de itens: 260 → **184px** | Medido: o nome mais largo ("Consumo de Dados Móveis") ocupa 139px; com padding de 24 sobravam ~97px de vão morto à direita. Os 76px liberados viraram coluna de modelo visível |
| D163 | As duas primeiras linhas de dados do card **sobem para o lado da foto** | Era o único jeito de aproximá-las sem mexer na foto, como o usuário pediu: a foto tem 96px num card de 252 e fica centralizada, então sobram 78px de cada lado — e "Android 11" / "Agente 12.6.8" cabem nisso. O roteiro passou a medir colisão texto×foto com `Range`, porque o limite depende do comprimento do texto |
| D164 | O título do card só pôde descer 4px | A faixa entre ele e a divisória **é** a foto (43px dos 48 disponíveis). Encurtar mais exigiria diminuir a foto ou tirá-la do centro, os dois vetados |
| D165 | Hover do card: **borda roxa com transição**, sem sombra pesada | Pedido do usuário ("fina, clean e sutil"). O roteiro força hover real do mouse — evento sintético não dispara `:hover` — e exige que a transição inclua `border-color` |

---

## Etapa 22 — Aba de retestados e card no limite

| # | Decisão | Justificativa |
|---|---|---|
| D166 | Hover do card: **só a sombra**, borda parada | Pedido do usuário. A borda mudando de cor a cada passagem do mouse pesava; a sombra dá o mesmo retorno sem introduzir cor. O roteiro agora exige que a borda **não** mude — é fácil alguém "melhorar" isso de volta |
| D167 | Dados do card sobem para `pt-6` — as duas primeiras linhas correm ao lado da foto | Pedido do usuário. `pt-6` é o piso: em `pt-4` a terceira linha ("Gerenciamento / Android Legado", a mais larga) alcançaria a foto na horizontal. Card de 246 → ~206px |
| D168 | Campo de busca dimensionado pelo **próprio placeholder** | Pedido do usuário. O roteiro mede o texto do placeholder com a fonte real e exige sobra ≤ 40px — assim o campo continua justo se o texto mudar, em vez de depender de um `max-w` escolhido a olho |
| D169 | Terceira aba: **Retestados** — modelos com mais de uma homologação | Pedido do usuário. Chamei de "Retestados" e não "Reteste" para casar com o filtro que já existe na matriz: mesmo conceito, mesmo nome. A aba responde outra pergunta ("o que foi revalidado?"), então o modelo aparece nela **além** da sua aba de estágio, não no lugar dela |
| D170 | Na aba Retestados, cada modelo usa o card do seu estágio | Retestado e finalizado é catálogo (com "Exibir informações"); retestado e em teste ainda é andamento (com barra de progresso). Um card único teria de mentir sobre um dos dois |

---

## Etapa 23 — Coluna da esquerda com a mesma anatomia das colunas de modelo

| # | Decisão | Justificativa |
|---|---|---|
| D171 | A célula "Homologação" ganhou **título na altura do nome dos modelos** e uma linha secundária em cinza | Pedido do usuário. Antes o texto ficava centralizado verticalmente numa célula alta, desalinhado de tudo à direita. Agora as duas colunas têm a mesma anatomia — título em cima, linha secundária logo abaixo — e a faixa do topo lê como uma peça só |
| D172 | O resumo sai dos **grupos realmente visíveis**, não de um texto fixo | Filtrar itens muda o que está na tela; uma legenda fixa passaria a descrever uma planilha que não é a que se está vendo. Vem de `grupos` + `ROTULO_GRUPO_CURTO`, que já existiam para o rail |
| D173 | O roteiro mede o **desalinhamento** entre o título da esquerda e o nome do primeiro modelo | Uniformidade é o ponto do pedido, e é exatamente o tipo de coisa que volta a escorregar num ajuste de padding. Exige ≤ 2px |

---

## Etapa 24 — Sem popup intermediário; baixar e compartilhar

| # | Decisão | Justificativa |
|---|---|---|
| D174 | O popup de informações **foi removido**: "Exibir informações" navega direto | Pedido do usuário. Ele era um degrau a mais para chegar ao mesmo lugar. `ModalInformacoes.tsx` foi apagado em vez de virar código morto |
| D175 | O card perdeu a linha "Gerenciamento" | Pedido do usuário. Sobraram Android e Agente — o que distingue um modelo do outro à primeira vista. O resto da ficha está a um clique |
| D176 | "Exportar certificado" virou **"Certificado técnico" com ícone de baixar** | Pedido do usuário: o ícone diz a ação, o rótulo diz o documento. O roteiro verifica rótulo e presença do ícone |
| D177 | Botão cinza de compartilhar à direita, abrindo WhatsApp / e-mail / copiar link | Pedido do usuário |
| D178 | O compartilhamento envia **o link da tela**, não o PDF — e o popup diz isso | Nem `wa.me` nem `mailto:` aceitam anexo por URL. Sem o aviso, dá para supor que o link abre para qualquer um; ele abre o sistema, e quem recebe precisa de acesso. Para mandar o documento, o caminho é baixar e anexar. O roteiro exige que o aviso esteja lá |
| D179 | "Ficha" saiu do resumo da coluna da matriz | Pedido do usuário: sobraram os quatro grupos de teste |

---

## Etapa 25 — Compartilhar o PDF e ficha do modelo

| # | Decisão | Justificativa |
|---|---|---|
| D180 | Rota **pública** `GET /publico/certificados/:id.pdf`, sem autenticação | O usuário definiu que o compartilhamento é do PDF. WhatsApp e `mailto:` não anexam arquivo por URL, então entregar o documento exige um link que abra sozinho. O que protege é o UUID da homologação — mesma premissa já usada em `/uploads/`, onde os certificados emitidos já eram públicos |
| D181 | Registrado como **ampliação de exposição**, não como detalhe | Antes só o certificado **emitido** era acessível sem login; agora o de qualquer homologação é, inclusive de uma em rascunho. O link não expira, não registra quem abriu, e mostra sempre o estado atual — se a homologação mudar, o link passa a mostrar outra coisa. Está na tabela de dívidas do HANDOFF com o caminho de saída (URL assinada) |
| D182 | O popup diz que o link **dispensa login** | Antes avisava o contrário. Quem compartilha precisa saber que está publicando o documento, não mandando um atalho interno |
| D183 | Ficha do modelo: título é só o modelo, ações na mesma linha | Pedido do usuário. "Positivo" aparecia duas vezes — no fabricante e no `nomeComercial`. O roteiro reprova se o título voltar a conter o fabricante |
| D184 | As pastilhas de resultado desceram para a base do card (`mt-auto`) | Pedido do usuário. Ficam alinhadas com a base da foto, e o roteiro exige ≤ 24px da borda inferior |
| D185 | Sobraram "N aprovados" e "N divergências" | "Não testados" e "Em homologação · Rascunho" saíram a pedido do usuário. O selo Homologado/Não homologado continua, mas só quando a homologação está fechada — é o veredito, não o estado interno do documento |

---

## Etapa 26 — Cabeçalho da ficha sem moldura

| # | Decisão | Justificativa |
|---|---|---|
| D186 | O cabeçalho da ficha perdeu o card: sobraram **foto, identificação e a ação**, numa linha | Pedido do usuário. Dentro de um painel que já é card, a moldura era uma caixa dentro de outra. O roteiro sobe do `<h2>` até `[data-painel]` e reprova se encontrar borda no caminho |
| D187 | O nome virou **"FABRICANTE MODELO" no desenho do rótulo pequeno** | Pedido do usuário. O roteiro checa `text-transform: uppercase`, tamanho ≤ 14px e que nenhuma palavra se repita no título |
| D188 | As pastilhas de resultado saíram do cabeçalho | Não foram citadas no que devia ficar, e os mesmos números aparecem logo abaixo, na ficha e no resultado item a item |
| D189 | **O compartilhar e a rota pública foram removidos juntos** | O usuário tirou o botão uma etapa depois de pedi-lo. `GET /publico/certificados/:id.pdf` existia só para ele: manter um endpoint sem autenticação servindo certificado, sem nenhuma tela usando, seria exposição sem contrapartida. `ModalCompartilhar.tsx` foi apagado pelo mesmo motivo. Se o compartilhamento voltar, os dois voltam juntos — está tudo em D180–D182 |

---

## Etapa 27 — Card em três colunas, ficha unificada e enxugadas

| # | Decisão | Justificativa |
|---|---|---|
| D190 | O card do catálogo virou **três colunas de um flex**: identificação, foto, veredito | Pedido do usuário: descer o nome e o selo até a altura da foto. Com a foto absoluta isso era impossível — o limite era o comprimento do texto, e "Não homologado" nunca caberia nos 62px livres ao lado. Como irmãos de flex, nada se sobrepõe: o que não couber trunca |
| D191 | A foto deixou de cavalgar a divisória | Consequência direta de D190. Era um desenho bonito, mas depender de posicionamento absoluto sobre texto centralizado é o que vinha travando cada pedido de aproximação |
| D192 | Coluna do card de 252 → **300px** | Com o selo na faixa, 252 cortava "Homolog…". O roteiro agora reprova nome **ou** selo truncados — um selo cortado não diz nada |
| D193 | A identificação e o botão do certificado entraram **dentro do card "Unidade testada"** | Pedido do usuário. Eram dois blocos descrevendo a mesma coisa. O roteiro exige que o `<h2>` esteja dentro da `<section>` da ficha |
| D194 | Menu lateral de 280 → **224px** | Pedido do usuário. O item mais largo ("Painel de Homologação") ocupa ~150px com ícone e recuo; 280 deixava uma faixa vazia à direita de todos |
| D195 | Filtro "Situação" renomeado para **"Status"** | Pedido do usuário. O roteiro passou a exigir "Todos os status" na lista aberta |
| D196 | Usuário padrão passou a ser **Daniel Neves Lima** | Pedido do usuário. O `update` do upsert também grava o nome: é o responsável técnico que assina o certificado, então trocar quem é a pessoa tem de valer em banco que já existe, não só em base nova |

---

## Etapa 28 — Correção: a foto não devia ter saído do lugar

| # | Decisão | Justificativa |
|---|---|---|
| D197 | **D190/D191 revertidas.** A foto volta a ser absoluta, centralizada e cavalgando a divisória | O pedido era descer o texto, não redesenhar o card. Reestruturar em três colunas de flex resolvia o problema de largura, mas movia a foto — que era justamente o que devia ficar parado |
| D198 | Nome e selo descem por `items-end` no bloco de cima | Encosta os dois na divisória sem tocar na foto. O `pb-3` mantém a folga de que a foto precisa acima da linha |
| D199 | A largura de 300px (D192) **fica** | Foi ela que tornou o pedido possível: com 252 sobravam 62px de cada lado da foto e "Não homologado" não cabia. Com 300 sobram 86px, e o selo compacto passa |
| D200 | O roteiro agora fixa a **posição da foto**, não só a ausência de colisão | Passou a exigir foto centralizada (±2px), cruzando a divisória e com 96px. Sem isso, a próxima mudança de layout move a foto de novo sem ninguém perceber |

---

## Etapa 29 — Base do card sem vão

| # | Decisão | Justificativa |
|---|---|---|
| D201 | Dados e botão sobem para `pt-6`, correndo ao lado da foto | Pedido do usuário. Card de 206 → **176px**, sem tocar na foto. Só é possível porque o card foi para 300px (D192) e porque a linha "Gerenciamento" saiu (D175): as duas que restam nessa altura — "Android 11" e "Agente 12.6.8" — cabem nos 86px livres de cada lado |
| D202 | O roteiro passou a medir a **sobra abaixo do botão** | O pedido foi "tirar espaço vazio na parte inferior", e isso é uma medida, não uma impressão. Exige ≤ 14px; hoje são 9 |

---

## Etapa 30 — Largura e alinhamento do card

| # | Decisão | Justificativa |
|---|---|---|
| D203 | Coluna do card virou **largura fixa** (`repeat(auto-fill, 312px)`), sem `1fr` | Era o `1fr` que causava o vão do centro: com 3 colunas no painel de 1152px, cada card esticava para **373px** — 60px além do que o conteúdo pedia. Fixando em 312, os vãos ao lado da foto caíram de 68/46px para 37/15px |
| D204 | 312px, não menos | Abaixo disso o selo encosta na foto: os dois lados não podem ser iguais porque "Homologado" (77px) é mais largo que "L400" (55px) e a foto é centralizada **no card**. Igualá-los exigiria tirar a foto do centro |
| D205 | Título e selo sobem por `pt-2 pb-7`, sem mexer na altura do bloco | O `pt` menor e o `pb` maior somam o mesmo total — e é a altura desse bloco que fixa onde cai a divisória, e com ela a foto. Foi assim que deu para subir o texto sem mover a imagem |
| D206 | `items-start` alinha o selo com a **primeira** linha do título | Com `items-end` ele acompanhava o modelo; agora acompanha o fabricante. O roteiro mede o alinhamento entre os dois centros (±6px) |

---

## Etapa 31 — Tela de login

| # | Decisão | Justificativa |
|---|---|---|
| D207 | O rodapé "Documento técnico confidencial · Mobiltec" saiu do painel roxo | Pedido do usuário |
| D208 | Malha quadriculada de 64px sobre o roxo, com máscara que a apaga antes da metade | Pedido do usuário: textura sutil que "vai sumindo". `background-image` de duas linhas de 1px a 7% de branco + `mask-image` que zera em 55% da altura |
| D209 | A mancha **laranja** do canto superior direito foi removida; ficou só a roxa embaixo | Pedido do usuário. Era a primeira coisa que o olho encontrava no lado branco |
| D210 | Botão "Entrar" virou **cor sólida** (`--color-primary`) | Pedido do usuário: o gradiente de três paradas cortava o botão em faixas visíveis e competia com a faixa de marca do topo do cartão |
| D211 | **A logo branca no painel roxo foi revertida**, e o `#550158` junto | Foram pedidos e desfeitos na mesma sessão: o usuário não gostou do resultado e mandou voltar ao roxo anterior. `logo-mobiltec-branca.svg` (1,2 MB) saiu de `public/` e a variante `branca` saiu do componente — asset morto no bundle custa carregamento. O arquivo original segue na raiz do repositório (`logonomeembrancosvg.svg`) |
| D212 | O roteiro **conta as linhas da malha**, numa coluna dentro do padding | Três correções encadeadas: amplitude (max − min) reprovava porque o gradiente do painel varia ao longo da linha; medir na horizontal esbarrava no texto; e "salto máximo" confundia a malha (~10) com o banding do gradiente (~2). O que resolve é contar saltos > 4 numa coluna vertical no padding esquerdo, onde texto nenhum chega: 8 linhas na metade de cima, 0 na de baixo |
| D213 | O "sem mancha laranja" é checado por **CSS, não por pixel** | Tentei medir `R − B` no canto e deu 88 em tela limpa: o antialiasing subpixel do texto produz desvio quente onde não há cor. O que dá para afirmar sem ruído é que nenhum elemento pinta `#f37804` com mais de 6px de altura — ou seja, laranja só nos fios de marca |

---

## Etapa 32 — Login: o layout de tela cheia fica

O usuário pediu para "reduzir o card que preenche a tela toda". Tentei duas
vezes e as duas foram reprovadas; a terceira instrução foi voltar ao layout
original. **O que sobreviveu das três tentativas são só os acabamentos** —
malha, botão e a limpeza do lado branco.

| # | Decisão | Justificativa |
|---|---|---|
| D214 | **Tentativa 1 revertida**: cartão de 928×500 centralizado sobre fundo cinza | "Compactou demais, era só um pouco." Junto voltaram o `p-12` do painel, o título em `text-4xl` e o `max-w-md` |
| D215 | **Tentativa 2 revertida**: cartão de tela quase cheia com moldura roxa de 14px | Também reprovada. A instrução final foi "volta pra esse modo exatamente assim", com print do layout original |
| D216 | O layout final é o **de tela cheia**, sem cartão externo e com a barra de marca no rodapé | É o que o print define. O roteiro passou a exigir que o painel roxo encoste em `left: 0, top: 0` — as duas tentativas teriam sido pegas por essa asserção |
| D217 | O cartão do formulário **manteve** borda, sombra e fio laranja | "Manter o card de login como está" |
| D218 | Botão "Entrar" com gradiente **só de roxos** (`brand-purple → primary → brand-purple-deep`) | Pedido do usuário: gradiente sim, mas roxo. Era a parada laranja que cortava o botão em faixas visíveis — o roteiro reprova se ela voltar |
| D219 | As manchas de cor desfocadas do lado branco continuam fora | A laranja saiu a pedido do usuário ("não gostei"); a roxa saiu junto porque sozinha virava borrão isolado atrás dos campos. O lado branco foi aprovado assim |

---

## Etapa 33 — Menus ancorados e finalização sem trava

| # | Decisão | Justificativa |
|---|---|---|
| D220 | `ancorarMenu()` em `lib/`: tenta abrir abaixo, **vira para cima** se não couber, encosta na borda em último caso | Os menus da matriz são `fixed` para não serem recortados pelos `overflow` da tabela — mas `fixed` também não é recortado pela **janela**: numa célula do fim da tabela o menu nascia metade fora da tela e as últimas opções ficavam inalcançáveis |
| D221 | A posição é corrigida em `useLayoutEffect`, depois de medir o menu | A altura só existe depois que o menu renderiza, e é ela que decide o lado. `useLayoutEffect` roda antes da pintura, então não pisca na posição errada |
| D222 | O mesmo tratamento no `SeletorFiltro` | O filtro de fabricante tem dezenas de opções e `max-h-80`: em janela baixa, cairia no mesmo problema |
| D223 | O roteiro exige que o menu **vire para cima** numa célula perto do rodapé | Só medir "não vaza" não provaria nada — uma célula do meio da tela nunca vazaria. O teste procura a célula a menos de 210px do rodapé e exige que a base do menu fique acima do topo dela |
| D224 | **Pendência deixou de bloquear a finalização** (spec §7.5 relaxada) | Decisão do usuário: "não me bloqueia, deixa eu finalizar quando quiser; apenas o gerente de produto valida e assina, mantém o checklist do que falta". O 422 saiu do backend; o modal manteve o checklist, mas em âmbar e com os dois botões ativos |
| D225 | A transição devolve as **pendências na resposta** em vez de recusar | Quem fechou com item em aberto fica sabendo o que ficou para trás, e o gerente de produto tem o que conferir antes de assinar |
| D226 | O que **não** mudou: gravar uma divergência sem justificativa continua sendo 422 na célula, e a linha sem justificativa continua saindo **em branco** no certificado | O pedido foi sobre o portão de finalização, não sobre a spec §5. As duas defesas que sobraram são as que impedem o documento de afirmar o que ninguém justificou |
| D227 | O teste finaliza **de verdade** uma homologação com pendências e depois reabre | Asserção de UI não provaria que o backend deixou de recusar. Para não deixar rastro, o script reabre a cobaia e apaga o próprio log de reabertura via Prisma |

---

## Etapa 34 — Nome longo no card e foto que usa a caixa

Medido antes de mexer, porque os dois sintomas tinham causas diferentes do
que aparentavam:

| modelo | conteúdo útil no arquivo | ocupava na tela |
|---|---|---|
| Positivo L400 | 91% × 90% | 80% × 77% |
| SUNMI P2_LITE_SE-B | 60% × 90% | 52% × 54% |
| GERTEC GPOS720 | 64% × 82% | 38% × 72% |

| # | Decisão | Justificativa |
|---|---|---|
| D228 | O nome **não estava truncado** — passava por baixo da foto | `scrollWidth === clientWidth` nos três cards. A foto é absoluta, centralizada e sobe 43px acima da divisória; o título ia até o selo, que fica **depois** da foto. Qualquer nome com mais de 92px sumia atrás dela |
| D229 | Título do modelo de 15 → **13px**, e o bloco de cima com `pb-11` | Os dois levantados pelo usuário. O `pb` maior é o que resolve de fato: o título passa a terminar **acima** do topo da foto, e aí pode usar a largura toda sem esbarrar em nada. Card de 176 → **189px** |
| D230 | `lib/recorteFoto`: mede onde está o aparelho e dá zoom até ele encher a caixa | Sem isso, quem decide o tamanho na tela é a margem branca embutida em cada arquivo — daí um aparelho grande e outro pequeno no mesmo card. Depois: 82%, 79% e 44% de largura, e 80%/84%/84% de altura (o GERTEC é estreito porque o aparelho é alto — encher a altura é o certo para ele) |
| D231 | A medição roda no **navegador**, numa cópia de 64×64, com cache por URL | O corte certo seria no upload, recortando o arquivo uma vez — mas exige biblioteca nativa de imagem no servidor (`sharp`), dependência que ninguém pediu. São 4 mil pixels por foto, uma vez por sessão, e se o canvas falhar a foto fica como estava |
| D232 | O roteiro passou a medir **todos** os cards, não só o primeiro | Os dois defeitos dependem do nome e do arquivo de cada modelo: conferindo só o L400, nenhum dos dois teria aparecido |
| D233 | O vazamento da foto deixou de ser medido pelo retângulo do `<img>` | O zoom é `transform: scale`, que aumenta a caixa do elemento mesmo sem nada aparecer fora. O teste agora exige que a pastilha recorte (`overflow: hidden`) e caiba no card |
| D234 | O roteiro parou de fixar "1 card homologado" e "31 em homologação" | Ele nasceu quando nada estava finalizado. Com o usuário finalizando modelos de verdade, número fixo vira falso positivo: o esperado agora vem da API, e a anatomia é conferida no L400 por `data-modelo`, não pelo primeiro card da grade |

---

## Etapa 35 — Certificado sem identificador de unidade

| # | Decisão | Justificativa |
|---|---|---|
| D235 | S/N, IMEI 1 e IMEI 2 saíram da ficha do certificado | Pedido do usuário. O documento atesta o comportamento de um **modelo**, não de uma unidade, e circula fora da Mobiltec — identificador de aparelho ali dentro é dado sensível viajando sem necessidade. A ficha foi de 11 para 8 linhas |
| D236 | O S/N saiu **também do nome do arquivo** do PDF | Era `certificado-{modelo}-{numeroSerie}.pdf`. O nome viaja com o documento e vazaria o identificador do mesmo jeito. Virou `certificado-{fabricante}-{modelo}-agente-{versão}.pdf`, que ainda distingue um do outro |
| D237 | Os campos **continuam no banco e na tela interna** | Servem para rastrear qual unidade foi para a bancada. O que mudou é o que sai no documento |
| D238 | Os itens "IMEI 1", "IMEI 2" e "Número de Série" **ficam na matriz de resultados** | São itens de teste do grupo Coleta: registram se o agente consegue coletar o dado, sem mostrar o conteúdo. Tirá-los seria esconder um resultado de teste, não um dado sensível. Minha primeira asserção reprovava por causa deles — o roteiro agora proíbe o rótulo só dentro de `.ficha`, e exige que os três itens de Coleta continuem na matriz |
| D239 | O roteiro escolhe uma cobaia que **tem** S/N e IMEI preenchidos | Num registro vazio a ausência não provaria nada. Ele confere o valor em todo o documento e o rótulo só na ficha |
| D240 | Os três campos saíram também da **tela** `/dispositivos/:id` | Pedido do usuário na sequência. É a mesma tela que vai virar a visão do parceiro, então vale a regra do certificado. Saíram do objeto `ficha` no componente, não só do JSX — o que a tela não usa, ela não carrega |
| D241 | A ficha passou a ser **foto grande à esquerda, dados ao lado** | Pedido do usuário. Foto de 96×72 → 208×208, numa coluna própria; nome, botão do certificado e os 9 campos restantes ocupam a coluna da direita. Foi a saída dos três identificadores que abriu espaço para isso |
| D242 | A grade dos campos passou de `minmax(190px)` para `minmax(240px)` | Medido: o par mais largo ("Método de inscrição: Não informado") precisa de 213px, e com três colunas nessa faixa sobravam 207 — o valor truncava e o rótulo quebrava em duas linhas. Com 240 a grade fica em duas colunas de 327px. O roteiro agora reprova qualquer campo que trunque ou quebre |
| D243 | A foto ganhou `self-center` em vez de o card inteiro virar `items-center` | Pedido do usuário: a imagem estava alta demais. A coluna de dados é mais alta que a foto; centralizar **só ela** equilibra o card sem descer o nome e o botão junto. Desvio do centro medido: 0px |
| D244 | Nome do modelo desceu (`pt-2 pb-2`) e foi de 11 → 13px | Pedido do usuário. O `pt` aproxima o nome da linha divisória sem tirá-lo do alinhamento com o botão — o roteiro continua exigindo os dois na mesma linha |
| D245 | "Responsável" virou **Início / Conclusão** e, abaixo, **Responsável técnico / Gerente de validação** | Pedido do usuário. São as duas assinaturas do rodapé do certificado, na mesma ordem. A precedência é a mesma de lá (`assinaturaX` digitada vence o `Usuario` vinculado): se as duas telas usassem regras diferentes, uma estaria mentindo |
| D246 | O roteiro fixa a **ordem dos quatro últimos campos** | É a parte do pedido que se perde num refactor sem ninguém notar — os nomes e as datas trocando de lugar não quebram nada visualmente |
| D247 | O resultado na web virou **três colunas com cabeçalho por grupo**, como no certificado | Pedido do usuário. A linha era nome + status com um vão vazio no meio; agora a coluna do meio carrega a ação avaliada, que é o que explica o veredito ao lado |
| D248 | Os rótulos das colunas vieram para `COLUNAS_GRUPO`, no front, espelhando `CABECALHO_GRUPO` do certificado | Cada grupo chama suas colunas de um jeito — em Coleta é "Coleta / Descrição da Coleta / Resultado", não "Item de Teste". Duplicar o mapa em vez de expor um endpoint foi escolha deliberada: são quatro pares de rótulos que só mudam se a spec mudar, e o roteiro compara os quatro conjuntos renderizados |
| D249 | A justificativa virou **a quarta coluna, "Divergências"** | Pedido do usuário na sequência: como parágrafo largo abaixo do nome ela esticava a linha inteira. Numa coluna própria quebra dentro da própria largura, e o resto da linha fica quieto. Segue esmaecida, como ele pediu |
| D250 | O resultado deixou de ser `<div>` em grid e virou **`<table>`** | Cada linha em grid é um contêiner independente: dimensionar as colunas por conteúdo (`auto`) desalinhava uma linha da outra — medido, a mesma coluna dava 215px numa linha e 144px na outra. Um grid único para cabeçalho e corpo exigiria `display: contents`, que apaga a linha como elemento. Tabela resolve as duas coisas, e é o que o dado é |
| D251 | Item e ação em `auto`; divergência em 38%; status fixo | Medido: o maior nome de item pede 165px e a maior ação 260px — frases curtas, que devem caber numa linha. Com frações fixas, "Instalação em background sem intervenção" quebrava em duas à toa. Agora nenhuma das duas quebra em nenhum dos quatro grupos |
| D252 | O roteiro mede a quebra com uma **régua na fonte real** | Constatar que a linha ficou alta não diz se o texto cabia — a régua compara a largura do texto com a largura útil da célula |

---

## Etapa 36 — Justificativa no balão e grupos dois a dois

| # | Decisão | Justificativa |
|---|---|---|
| D253 | **A coluna "Divergências" (D249) durou uma rodada.** A justificativa virou balão num `?` ao lado do status | Ideia do usuário, e ele está certo: justificativa é exceção, não regra — como coluna, cobrava 38% da largura de **todas** as linhas para servir a quatro delas |
| D254 | Os quatro grupos passaram a caber **dois a dois** (`auto-fit, minmax(27rem, 1fr)`) | É o espaço que sobrou. Volta a uma coluna sozinho quando o painel estreita |
| D255 | O balão é `position: fixed`, ancorado por `ancorarMenu` | O card do grupo tem `overflow-hidden` e recortaria um balão posicionado dentro dele — mesmo motivo dos menus da matriz (D220). Ganhou um alinhamento `centro`, porque balão centraliza no gatilho e menu alinha pela esquerda |
| D256 | O `?` é `<button>`, não `<span>` | Abre no foco, não só no hover: quem navega por teclado também alcança a justificativa |
| D257 | Tabelas em 12px, e o **nome do item nunca quebra** (`whitespace-nowrap`) | Em meia largura, 13px fazia 56 células quebrarem em duas linhas. Com 12px caiu para 25, e dando prioridade de largura ao nome — que identifica a linha — quem cede é a ação, que é descrição. Coleta ficou 100% em linha única |
| D258 | Cabeçalho das colunas em **roxo** sobre o mesmo cinza claro | Pedido do usuário. Em cinza ele se confundia com o texto de apoio das células |
| D259 | O roteiro exercita o **hover**: sem balão antes, balão roxo com texto no hover, nenhum balão depois | Um tooltip que não fecha, ou que nasce fora da janela, é o defeito clássico desse padrão. Também exige `?` só onde há justificativa, nome de item sem quebra e nenhuma tabela estourando o card |

---

## Etapa 37 — Acabamento da tela de resultado

| # | Decisão | Justificativa |
|---|---|---|
| D260 | O cabeçalho da ficha (nome + botão) foi para a **largura inteira do card** | Pedido do usuário: descer a foto e centralizá-la. Com a divisória atravessando tudo, o que fica abaixo dela — foto e dados — vira um bloco só, contra o qual a foto pode se centralizar de verdade. Antes ela dividia a coluna com o título, e "centro" queria dizer outra coisa |
| D261 | Foto de 208 → **192px**, e `pt-5` → `pt-3` no card | "Leve diminuída" e "reduzir a altura da borda do topo". Card de 316 → 302px |
| D262 | ~~Os grupos passaram para **colunas de texto** (`columns-2`)~~ — **revertido em D268** | Em grid, os dois cards de uma fileira eram esticados até a altura do maior. Colunas resolviam isso, mas o desenho de duas pilhas não agradou |
| D263 | `leading-snug` e `py-1.5` nas linhas | "Cards extremamente altos" |
| D264 | Cantos dos cards de grupo: `rounded-xl` → `rounded-lg` (10px) | Pedido do usuário |
| D265 | "Não testado" ganhou fundo próprio (`--color-status-nao-testado-flag`), e o cinza do texto escureceu de `#94a3b8` para `#475569` | Pedido do usuário: a flag não dava para enxergar. O fundo é um token separado do `-fill` de propósito — na matriz o branco é o próprio sinal de "ninguém avaliou ainda", e mudá-lo pintaria 1113 células |
| D266 | O `?` é roxo em repouso, e inverte (fundo roxo, `?` branco) no hover | Pedido do usuário. Em cinza, o ícone só se anunciava para quem já tinha achado |
| D267 | **Bug encontrado de quebra:** o `th` dos modelos da matriz não tinha `align-top` | `verificar:matriz` acusou 9px de desalinhamento, e não era efeito desta etapa: o `th` centraliza verticalmente por padrão, então bastou o usuário finalizar um modelo — cuja coluna ganha a linha do veredito e fica mais alta — para o nome de **todas as outras 30** descer 8px. Só apareceu agora porque, até ontem, nenhuma homologação estava fechada |

---

## Etapa 38 — Grupos empilhados, como no certificado

| # | Decisão | Justificativa |
|---|---|---|
| D268 | **D262 revertida**: um grupo abaixo do outro, na largura toda | Pedido do usuário: "semelhante ao PDF nesse aspecto". Lado a lado, com 9, 11, 12 e 16 itens, as duas pilhas nunca fechavam na mesma altura — nenhum arranjo de duas colunas ia ficar limpo com esses números |
| D269 | Coluna do item em **fração fixa (26%)**, ação em `auto` | Na largura toda, `auto` nas duas primeiras abriria um vão entre o texto e a coluna seguinte — a queixa original desta tela. Com o item em fração, a ação ocupa todo o resto e a linha fecha |
| D270 | Fonte de volta a 13px; `py-1.5` e `leading-snug` ficam | Os 12px existiam para caber em meia largura. Na largura toda **nenhuma linha quebra**, então a altura do card é só a soma das linhas: 1847px para os 48 itens, contra ~2200 da primeira versão empilhada |
| D271 | O roteiro passou a exigir os grupos **empilhados** (todos no mesmo x) | Era o inverso da asserção anterior. Um teste que continuasse exigindo duas colunas passaria a reprovar o desenho aprovado |

---

## Etapa 39 — Balão à esquerda e login com "ou"

| # | Decisão | Justificativa |
|---|---|---|
| D272 | O `?` foi para a **esquerda** da pastilha de status | Pedido do usuário. De quebra, a coluna de status passa a terminar sempre no mesmo x, com ou sem justificativa |
| D273 | Bolinha de 16 → **14px**, com o glifo de 9 → 10px | Pedido do usuário: bolinha menor, "?" maior e mais nítido |
| D274 | O balão abre **para a esquerda** (`ancorarMenu` ganhou o alinhamento `fim`) | O `?` fica na borda direita da linha: à direita não há espaço, à esquerda sobra a largura toda da tabela. A vertical continua sendo "abaixo, virando para cima se não couber" |
| D275 | Tela de login perdeu o título "Entrar" e o subtítulo "Acesso restrito…" | Pedido do usuário. O cartão já diz "Homologação de Dispositivos" ao lado da logo, e o botão já diz "Entrar" — eram três textos para a mesma informação |
| D276 | Separador "ou" e botão **Entrar com Microsoft** abaixo | Pedido do usuário. A marca é SVG inline (quatro retângulos) em vez de arquivo em `public/`: é mais requisição do que desenho |
| D277 | **O botão da Microsoft não abre fluxo nenhum — ele diz o que falta** | Não existe app registrado no Entra ID nem rota de callback no backend. Um botão de login que silenciosamente não faz nada é pior do que botão nenhum, então o clique responde "ainda não está configurado". O roteiro clica nele e exige esse aviso: se alguém ligar a SSO e esquecer de tirar o texto, o teste reprova |

---

## Etapa 40 — Marca do produto no painel de login

| # | Decisão | Justificativa |
|---|---|---|
| D278 | O painel roxo passou a abrir com **cloud4mobile** numa pastilha de vidro, seguida de "Painel de Homologação" | Pedido do usuário, com os textos que ele definiu |
| D279 | ~~Pastilha de vidro com o nome em roxo claro~~ — **revertida em D283** | Três tentativas: roxo claro sobre vidro a 55%, depois pílula com vidro a 72% e roxo `#c26fa9`. A medição mostrou o teto: abaixo de 4,5:1 o nome some, e o usuário queria mais escuro que isso |
| D281 | O roteiro **calcula o contraste**, não só confere a cor | Roxo escuro sobre painel roxo é o erro fácil aqui, e passaria por qualquer asserção de "a cor é a esperada". Ele compõe o preto do vidro sobre o roxo do painel e exige ≥ 4,5:1 em cada uma das três partes |
| D282 | O roteiro lê o subtítulo por `innerText` | Com `<br>` no meio, `textContent` cola as palavras vizinhas ("comparativae") e a asserção reprovava um texto que estava certo na tela |
| D283 | **A pastilha saiu.** O nome virou texto puro, tom sobre tom: roxo escuro (`brand-purple-deep`) no mesmo corpo do título, abaixo dele | Pedido do usuário depois de ver as duas versões com vidro. Quem separa a palavra do fundo agora é a sombra — fio branco a 16% embaixo (desenha o contorno) mais sombra difusa preta (dá o afastamento) |
| D284 | O "4" tem degradê **recortado no glifo** (`background-clip: text`) e `drop-shadow`, não `text-shadow` | Com a cor transparente, uma sombra de texto apareceria por dentro do próprio número. `drop-shadow` segue o desenho recortado |
| D285 | O piso de contraste do nome caiu de 4,5:1 para **1,5:1** | Não é afrouxar o critério, é medir outra coisa: tom sobre tom é o efeito pedido. O que o roteiro passou a garantir é que a marca não desapareça (hoje 1,57:1) e que a sombra exista — sem ela, as duas cores são da mesma família e o texto encosta no fundo |
| D286 | A varredura "laranja só nos fios finos" ignora o que está dentro de `[data-produto]` | O "4" pinta laranja de propósito, e é um glifo, não uma superfície. Sem a exceção, a asserção contra manchas reprovava a própria marca |
| D287 | **D283 revertida**: sem sombra, o nome voltou para uma **pastilha clara** com borda de fio | Pedido do usuário: tirar a sombra, borda sutil, escrito de forma nítida, no roxo da logo original. Esses quatro requisitos juntos só fecham sobre superfície clara — sobre o painel roxo, o `#7e2065` e o fundo são a mesma cor. A pastilha é o que devolve o roxo de verdade em vez de uma versão desbotada dele. Roxo a **9,2:1** |
| D288 | O "4" fechou para `color-mix(brand-orange 88%→68%, black)` | O laranja puro sobre branco dá 2,8:1 e o número fica lavado ao lado do roxo. Fechado, chega a 4,3:1 — e é o laranja mais avermelhado da própria logo |
| D289 | O contraste do "4" passou a ser medido **em pixel**, não em CSS | A asserção anterior lia `backgroundImage` procurando `rgb(...)`, mas as paradas são `color-mix` e o estilo computado **não as resolve**: o `match` voltava vazio, o `every` passava por vacuidade e o contraste era calculado contra um preto inventado, dando 21:1. Agora o roteiro varre os pixels do glifo, separa os da família do laranja e calcula a luminância média do que foi realmente pintado |
| D290 | A pastilha virou **vidro fosco a 70%**, com desfoque e borda clara | Pedido do usuário: branco chapado, não; translúcido e desfocado. A 70% o gradiente e a malha do painel atravessam a pastilha e o roxo da marca ainda aparece inteiro (6,85:1). Abaixo disso o roxo começa a encostar no painel — é o equilíbrio inteiro desta peça |
| D291 | A marca subiu para **acima do título** e caiu para 30px | Pedido do usuário. O roteiro trocou "mesmo tamanho do título" por "menor que o título" e "abaixo" por "acima" — as duas asserções anteriores passariam a reprovar o desenho aprovado |
| D292 | O contraste passou a ser medido contra o **fundo pintado**, não contra a cor declarada | Com a pastilha translúcida, o fundo real das letras é a composição dela com o painel — nenhuma cor do CSS descreve isso. O roteiro amostra os pixels dentro da pastilha e usa o extremo oposto ao texto como base |
| D293 | O vidro virou **branco a 14% sobre o próprio roxo**, com borda a 30% | Pedido do usuário: nada de pastilha branca, e sim o fundo do painel clareado e desfocado. É a referência do "Help Center" que ele mandou |
| D294 | ~~Com o vidro escuro, o texto foi para branco~~ — **revertido em D296** | Sobre vidro a 14% o `#7e2065` fica em 2:1 e some; branco dava 9,7:1. O usuário preferiu o roxo, e aí quem cede é o vidro |
| D296 | ~~O vidro parou em 60% de branco~~ — **revertido em D298** | A 60% o roxo do texto ficava em 6,2:1, mas a pastilha lia como branca. O usuário quis o fundo ainda puxando o roxo |
| D297 | Borda de 0,30 → **0,45** de branco | Pedido do usuário: um pouco mais de opacidade, sem deixar de ser fio |
| D298 | **Vidro a 12%, texto branco.** Fim da série de idas e vindas | O pedido do fundo é inegociável ("transparente, ofuscado, ainda puxando o roxo") e ele fixa o resto: com o fundo em luminância 0,097, o `#7e2065` fica em ~2:1 e desaparece. Branco dá 7,1:1 e o laranja clareado 3,3:1. É o mesmo arranjo da referência que o usuário mandou três vezes — lá o texto também é claro, e o laranja aparece só como acento |
| D299 | O roteiro passou a exigir que o fundo **puxe o roxo** | É o pedido literal, e é o que se perde primeiro quando alguém "melhora" o contraste clareando a pastilha. Ele amostra uma tira dentro do padding esquerdo (só vidro, sem letra e sem canto arredondado), exige vermelho e azul ao menos 12 acima do verde, e luminância ≤ 0,35 |
| D300 | Duas correções na própria medição, ambas mascaravam o defeito | (1) Eu tomava o mínimo/máximo da caixa inteira como "fundo", misturando letra e borda — agora é a tira de vidro puro. (2) O filtro de "família do laranja" era `r > g*1.6`, razão que só vale para o laranja puro: com o tom clareado ele descartava o glifo quase inteiro e a média saía de **1 pixel**. Trocado por "quente" (r > g > b, r − b > 40), passou a medir 131 |

---

## Etapa 41 — cloud4mobile como assinatura

A pastilha caiu de vez. O usuário especificou a peça em detalhe, e o resultado
encerra as sete rodadas anteriores: **assinatura do produto, não botão.**

| # | Decisão | Justificativa |
|---|---|---|
| D301 | Cápsula, vidro, contorno e sombra **removidos**. Sobrou o nome | Especificação do usuário: assinatura discreta, nada com aparência clicável. O roteiro reprova a volta de qualquer um dos quatro, e também `cursor: pointer` |
| D302 | 20px, peso 700, acima do título, na mesma margem esquerda | Todos medidos: tamanho dentro de 18–22px, recuos idênticos nos três blocos (48/48/48) e vão de 20px até o título |
| D303 | O `brand-orange` **puro** voltou ao "4" | Sobre o painel roxo direto ele dá 3,18:1 — passa. Era a pastilha de vidro que obrigava a clarear o tom, porque lá o fundo tinha luminância parecida com a do laranja |
| D304 | O bloco subiu 19px por `-translate-y-5` | Pedido do usuário (15–25px). `transform` não altera a divisão da tela, os espaçadores nem o cartão da direita — e o roteiro agora exige que o cartão continue centrado na janela (±2px), que é o "não mover o card da direita" |
| D305 | A amostra de fundo mudou de lugar | Sem cápsula, o que está atrás das letras é o painel. O roteiro amostra a tira de 8px logo acima da marca — painel puro, sem letra — e ainda exige que ela puxe o roxo |

---

## Etapa 42 — Linhas da matriz na ordem especificada

| # | Decisão | Justificativa |
|---|---|---|
| D306 | Ficha reordenada e "Tipo de Agente" → **"Tipo do Agente"** | Lista do usuário. IMEI 1/2 e Número de Série subiram para antes do Tipo do Agente, e a Versão do Agente desceu para depois dele |
| D307 | **`Foto` e `Homologado` ficam**, mesmo fora da lista | `Foto` não é dado: é a única forma de definir a imagem do modelo, que alimenta o catálogo e o certificado. `Homologado` o próprio usuário mandou manter — é ela que passou a ditar o veredito |
| D308 | A flag "✓ Homologado" **saiu do cabeçalho** da coluna | Pedido do usuário: quem responde "homologado ou não" é a linha da ficha. Duas fontes para a mesma pergunta é uma a mais |
| D309 | Telemetria renomeada e reordenada (8 renomes, 7 mudanças de ordem) | Lista do usuário. `alinhar:itens` faz isso no banco e o `seed.ts` acompanha, para base nova nascer igual |
| D310 | **"Histórico de Bateria" e "Sinal de Rede" NÃO foram apagados** — foram para o fim do grupo | Não estão na lista do usuário, mas não estão vazios: 32 OK cada, mais uma falha justificada. Apagar custaria **65 avaliações reais** e é irreversível. Ficam nas posições 11 e 12, separados dos dez que ele listou, aguardando decisão |
| D311 | Grafias mantidas onde a lista tinha lapso: "Última Localização" (com acento), "Limpeza de Dados", "Zero-Touch" | São erros de digitação evidentes num texto longo, não renomeações. "Limpeza da Dados" e "Ultima" quebrariam o português da planilha que vai para o cliente |
| D312 | `verificar:linhas` compara a **lista inteira, posição a posição** | Ordem de linha é o tipo de coisa que ninguém confere a olho em 63 itens. O roteiro também exige zero flags de veredito no cabeçalho e a linha "Homologado" presente |

---

## Etapa 43 — Justificativa opcional e rascunho do técnico

| # | Decisão | Justificativa |
|---|---|---|
| D313 | **Marcar status divergente não exige mais justificativa** | Pedido do usuário. O 422 saiu do `PUT /resultados/:itemId` e o painel deixou de abrir sozinho: durante a homologação interna o técnico marca o que observou na hora, e a explicação vem depois, com o retorno do dev |
| D314 | A justificativa ganhou **porta própria** no menu da célula | Sem o painel automático, ela ficaria inalcançável. É o preço de tornar algo opcional: precisa de um caminho explícito |
| D315 | A regra da spec §5 **fica de pé onde protege o cliente** | No certificado, divergência sem justificativa continua saindo em branco. O que mudou foi o momento de exigir, não o que o documento atesta |
| D316 | Campo novo `Homologacao.observacoes` + migração | É o rascunho do técnico durante o teste: comportamentos observados que ainda não viraram justificativa. Vira a pergunta para o dev; da resposta sai a justificativa formal. Não entra no certificado — o roteiro confere isso gravando um texto e procurando por ele no preview |
| D317 | Cabeçalho da coluna: nome à esquerda, Finalizar/Reabrir na altura dele, **Observação** onde estava o Finalizar | Pedido do usuário. O roteiro mede as três coisas: nome a menos de 14px da borda esquerda, botão de fechar alinhado ao nome (±10px) e à direita da metade do `th` |
| D318 | "Retestados" → **"Revalidados"** na aba do painel e no filtro da matriz | Pedido do usuário. O valor interno da aba continua em minúsculas (`revalidados`) — meu primeiro replace trocou o rótulo e o valor do tipo junto |
| D319 | A marca no título do painel: roxo + laranja, em pastilha de vidro clara | Pedido do usuário. Aqui o fundo é claro, então a marca aparece nas cores dela — ao contrário do login, onde o painel roxo obriga o texto a ser branco. Véu de 7% com desfoque, não bloco de cor: o roteiro reprova alfa acima de 0,2 |

---

## Etapa 44 — Filtro de modelo e caderno de observações

| # | Decisão | Justificativa |
|---|---|---|
| D320 | Filtro de **Modelo** ao lado do de Fabricante | Pedido do usuário |
| D321 | As opções de modelo **acompanham o fabricante escolhido**, e trocar de fabricante limpa o modelo | Com 31 colunas, listar todos os modelos de todas as marcas junto faz do seletor uma lista sem serventia. E "GPOS720" dentro de "Positivo" deixaria a matriz vazia sem explicação |
| D322 | O modal de Observação virou **caderno**: observação geral + anotações por funcionalidade | Pedido do usuário. As duas coisas moram em tabelas diferentes (`homologacao.observacoes` e `resultado.observacao`) mas respondem à mesma pergunta — e antes as notas de item só existiam dentro do menu de cada célula, uma a uma |
| D323 | A lista de anotações é **somente leitura** | Cada nota se edita na célula de onde saiu. Duplicar a edição em dois lugares só criaria conflito de quem escreveu por último — o roteiro reprova se aparecer campo editável ali |
| D324 | Os nomes vêm da lista `itens`, não de `resultado.item` | O payload da matriz traz só `itemId` dentro dos resultados — meu primeiro código quebrou a tela com `Cannot read properties of undefined`. Percorrer `itens` ainda dá de graça a ordem da planilha |
| D325 | O roteiro **cria duas anotações**, confere que aparecem no caderno e as apaga no fim | Sem gravar de verdade, um caderno vazio passaria no teste. As duas células voltam ao estado anterior no `finally`, junto com a observação geral |

---

## Etapa 45 — Menu da coluna e caderno só com o que foi digitado

| # | Decisão | Justificativa |
|---|---|---|
| D326 | O caderno esconde as observações **escritas pela importação** | O usuário só reconheceu como sua a que ele digitou. `resultado.observacao` guarda as duas coisas: as notas do técnico e as que o importador registrou para explicar como traduziu cada célula da planilha antiga. O critério é a assinatura do próprio importador — **toda** nota que ele gera cita a planilha de origem (`prisma/importar-planilha.ts`) |
| D327 | As quatro ações do cabeçalho viraram um **hambúrguer** ao lado do nome | Pedido do usuário. Em 31 colunas, elas custavam duas linhas de altura cada. A faixa caiu de ~84 para **49px**, e o roteiro reprova acima de 60 |
| D328 | Nova ação **Configuração**, primeira do menu; Finalizar/Reabrir, última e destacada | Pedido do usuário. O menu segue a ordem do uso: configurar, consultar, repetir, anotar — e por último a que fecha |
| D329 | Configuração **reusa o formulário de cadastro** em vez de um novo | São os mesmos campos; dois componentes garantiriam que um dia divergissem. O que muda é o destino: cadastrar cria dispositivo + homologação; configurar salva a identidade no dispositivo e o resto na homologação, que é onde cada coisa mora |
| D330 | A bateria fica **travada** na configuração | Trocá-la numa homologação em andamento significaria recriar as linhas e perder o que já foi avaliado. Para mudar de bateria o caminho é um reteste |
| D331 | `SeletorFiltro` ganhou `data-filtro` | Cinco roteiros endereçavam os filtros por posição, e o de Modelo entrou no meio. Por texto também não serve: o rótulo do botão vira o valor escolhido assim que se filtra algo |
| D332 | Seis roteiros ajustados ao novo cabeçalho | `matriz`, `dropdown`, `finalizar`, `ciclo`, `catalogo` e `observacoes` procuravam botões que agora estão no menu, ou `<li>` num resultado que virou tabela. Nenhum deles falhou por defeito do sistema — todos por descreverem a tela anterior |

---

## Etapa 46 — Menu de seções e nomes centralizados

| # | Decisão | Justificativa |
|---|---|---|
| D333 | O subtítulo da coluna da esquerda saiu; entrou um **menu de seções** | Pedido do usuário. A pergunta que o subtítulo respondia — "o que esta planilha lista" — passou a ser respondida pelo menu, que além de dizer também recorta |
| D334 | Seis seções numeradas: Registro, Monitoramento, Informações, Comandos, Perfil, Todos | Nomes e ordem do usuário. "Registro" é a ficha (de Foto a Modelo); as outras quatro são os grupos de itens |
| D335 | O recorte é **só de linhas** | Pedido explícito. O roteiro confere as 31 colunas em cada uma das seis seções: se alguma mexer nas colunas, reprova |
| D336 | O hambúrguer fica **roxo quando há seção escolhida** | Sem isso, uma planilha recortada parece uma planilha vazia — e o menu está fechado na maior parte do tempo |
| D337 | Nome do modelo **centralizado**, com o menu fora do fluxo | Pedido do usuário. Com `justify-between` o nome ficava centrado no espaço que sobrava do botão, não na coluna: `absolute` no menu e `px-7` no nome resolvem, e o desvio medido é 0px nas quatro primeiras colunas |
| D338 | Na coluna da esquerda, `items-start` em vez de `items-center` | Centralizado contra o hambúrguer (24px), o título descia 3px e saía da altura dos nomes de modelo — que é justamente a uniformidade que D171/D173 defendem |
| D339 | Três roteiros ajustados, um deles por armadilha nova | `matriz` lia um subtítulo que não existe mais; `finalizar` e `ciclo` pegavam "o primeiro `[data-menu-coluna]` do thead", que agora é o menu de seções e não tem Finalizar. Passaram a endereçar por `th[data-modelo]` |

---

## Etapa 47 — Faixa do cabeçalho: altura única e fio de divisão

| # | Decisão | Justificativa |
|---|---|---|
| D340 | Os textos do cabeçalho se centralizam contra uma **caixa da altura do hambúrguer** (24px), nas duas colunas | Pedido do usuário: nome do modelo na mesma altura de "Homologação". Centralizar a célula inteira não serviria — a coluna que traz "Nª homologação" ficaria com o nome deslocado das outras. Medido: 0px de desvio nos cinco primeiros nomes e 0px contra o próprio botão |
| D341 | Fio de **2px em `brand-purple-deep`** fechando a faixa | Pedido do usuário: separar o cabeçalho fixo do que rola abaixo. Entrou no `ESTILO_CABECALHO`, que já era compartilhado pelas duas colunas da faixa — o roteiro exige que os 32 `th` tenham a mesma borda, senão a linha sai emendada |
| D342 | O nome do modelo ganhou `data-nome-modelo` | Três roteiros o alcançavam por `div div div`. A caixa de centralização acrescentou um nível e todos passariam a medir o wrapper, não o texto — o de centralização daria "centralizado" sempre, por medir uma caixa que ocupa a coluna inteira |

---

## Etapa 48 — Faixa com o degradê do botão

| # | Decisão | Justificativa |
|---|---|---|
| D343 | **Bug corrigido:** o fio da faixa sumia ao rolar | A tabela é `border-collapse`, e nesse modelo a borda pertence à tabela, não à célula: o cabeçalho `sticky` seguia colado no topo e a borda ficava para trás. Trocado por `box-shadow: inset`, que é pintado pelo próprio `th`. O roteiro rola 900px e mede em pixel — asserção de CSS não pegaria isso |
| D344 | ~~Degradê metálico cinza~~ — **substituído pelo degradê do botão "Entrar"** | Duas rodadas: o cinza claro foi achado chamativo demais, e na sequência o usuário pediu a faixa idêntica ao botão do login, com texto branco |
| D345 | **A regra "faixa clara, nunca roxo chapado" foi revogada pelo usuário** | Ela existia porque 31 colunas de tinta forte cansavam a leitura (era o motivo original de a faixa ser cinza). O usuário pediu o roxo de volta; o que sustenta a legibilidade agora é o texto branco, e é isso que o roteiro passou a medir — 9,2:1 contra a parada mais clara do degradê |
| D346 | O degradê é **dimensionado à tabela inteira e deslocado por coluna** | O degradê do botão é horizontal: se cada `th` pintasse o seu, a faixa viraria 32 degradês em sequência. Com `background-size` na largura da tabela e `background-position` no x da coluna, o que se vê é um degradê só, contínuo. O roteiro confere que a escala é única nas 32 células e que as posições crescem em sequência |
| D347 | Fio branco a 32% separando as colunas | Pedido do usuário: sem ele os modelos ficavam colados. Também `inset`, pela mesma razão do D343 |

---

## Etapa 49 — Rail, fio da base e o menu ilegível

| # | Decisão | Justificativa |
|---|---|---|
| D348 | **Bug corrigido:** as opções do menu ficavam brancas sobre fundo branco | O menu é filho do `th` da faixa, que define `color: #fff` — as opções herdavam e só apareciam no destaque do hover. O painel passou a declarar `color` próprio. O roteiro mede o contraste de cada opção contra o fundo do menu: 19:1 hoje |
| D349 | Fio branco a 70% fechando a **base** da faixa, também `inset` | Pedido do usuário, no lugar do fio roxo. Sobrevive ao scroll pela mesma razão do D343, e o roteiro confere as duas sombras — a da direita e a de baixo — nas 32 células |
| D350 | O rail vertical ganhou o **roxo da ponta esquerda da faixa**, chapado, e o texto no corpo da faixa (13px, branco) | Duas rodadas: pedi o degradê inteiro e o usuário reprovou — degradê é da faixa do topo, não do rail. Chapado em `brand-purple` a cor continua a mesma, porque é exatamente o valor do degradê em x=0, logo acima |
| D351 | O nome do modelo é centrado no **espaço livre**, não na coluna | "Centrado na coluna" e "nome inteiro" não cabem juntos: o hambúrguer ocupa um lado, e reservar os dois (`px-7`) tirava 56px — "GERTEC GPOS700X" saía cortado. Com `pr-7`, o maior nome da planilha ("SUNMI P2mini-B-8766") pede 140px e tem 140 |
| D352 | O roteiro passou a exigir **nenhum nome cortado**, nos 31 | Antes media só os quatro primeiros, e nenhum deles truncava. Cortar o nome do modelo é pior que descentralizar — é a asserção que importa aqui |
| D295 | A marca é **posicionada por `calc(50% - 194px)`**, alinhada à logo do cartão | Pedido do usuário. Os dois blocos são centrados na mesma janela e o cartão tem altura fixa (498px), então a distância da logo até o centro é constante — medida em 194px a 760, 800, 900, 1000 e 1200px de altura. O roteiro exige ±6px desse alinhamento |

---

## Etapa 50 — "Não testado" escrito e o registro de tipos de dispositivo

| # | Decisão | Justificativa |
|---|---|---|
| D353 | A célula "Não testado" passou a ser **cinza `#cbd5e1` com o rótulo escrito**, e o traço "—" saiu | Pedido do usuário: mais escura que "Não aplicável" (`#e2e8f0`) e com o texto. O traço não distinguia "pendente" de "linha que não vale para este modelo", e o branco de antes se confundia com célula vazia. Revoga o D265: o token `--color-status-nao-testado-flag` e a função `fundoDaFlag()` existiam só para manter a matriz branca, e essa razão acabou — o `-fill` agora serve os dois lugares |
| D354 | O texto do "Não testado" escureceu de `#475569` para `#334155` | O fundo ficou mais escuro; a 7:1 o rótulo continua legível sobre ele (medido no roteiro) |
| D355 | **Novo:** registro de tipo de dispositivo — `Categoria` + `BateriaTeste` criadas pelo técnico | Os três tipos eram semente do banco e herdavam as mesmas 48 linhas. O técnico agora descreve o tipo, escolhe as linhas da ficha, monta a bateria item a item e pode escrever itens novos alocando-os a um tópico. Entra no menu lateral sozinho, como já acontecia com categoria cadastrada à mão |
| D356 | A escolha de linhas da ficha mora em `Categoria.camposFicha` (`String[]`), **não** na homologação | É propriedade do tipo, não da unidade testada: impressora não tem IMEI seja qual for a peça na bancada. Vazio = a ficha inteira, que é o estado das três categorias anteriores — nenhuma migração de dados foi necessária |
| D357 | Quatro linhas são **fixas** na ficha: `homologado`, `nomeComercial`, `fabricante`, `modelo` | As três de identidade distinguem uma coluna da outra; sem elas a planilha vira uma grade de modelos anônimos. E `homologado` é quem dá o veredito da coluna desde que a flag saiu do cabeçalho (D-etapa anterior). A regra vive em `FICHA_FIXA`/`linhasDaFicha()`, usada pela tela de registro e pela matriz — para as duas não divergirem |
| D358 | `GET /matriz` passou a tirar as linhas das **baterias da categoria**, não do catálogo inteiro | Antes devolvia todo `ItemTeste` ativo, o que só funcionava porque as três categorias usavam as mesmas 48. Um tipo registrado escolhe a própria bateria e a planilha dele não pode exibir item que ele não pediu. Item já usado por homologação antiga continua entrando, ativo ou não (spec §11.1) |
| D359 | O menu de seções esconde tópico **sem linha** naquele tipo | Um tipo pode zerar Perfis inteiro; oferecer a seção abriria uma planilha vazia sem caminho de volta. Trocar de tipo também zera a seção em foco — o tópico escolhido pode não existir no destino |
| D360 | O item escrito no registro entra no **catálogo global** de `ItemTeste`, não numa lista privada do tipo | Item de teste é vocabulário compartilhado: o certificado, as justificativas sugeridas e os resultados todos apontam para ele. O que é privado do tipo é a bateria — quem decide se o item aparece ou não |
| D361 | O roteiro do registro **apaga o que criou**, inclusive quando falha no meio | Ele cadastra tipo, bateria, item e modelo de verdade. Sem a limpeza no `finally`, cada execução deixaria um tipo a mais no menu do usuário |
| D362 | **Bug de roteiro corrigido:** o pixel do "Não testado" era amostrado fora da janela | `getImageData` devolve zeros fora da tela, e `rgb(0,0,0)` passava por "não está branco" — asserção vazia. Agora o roteiro rola a célula para o centro, exige que ela esteja inteira na janela e compara o pixel com o valor declarado (desvio ≤ 6) |
| D363 | `verificar:observacoes` deixou de exigir **exatamente 2** anotações | Ele conta contra o banco agora. A coluna tinha uma nota escrita de verdade pelo usuário ("Sinal de Rede"), e a conta fixa transformava uma nota legítima em falha. O que importava — a importação não vazar para o caderno — já era verificado separadamente |
| D364 | `verificar:livre` abria "Finalizar" por `thead button:has-text(...)`, que não existe mais | A ação mora no hambúrguer da coluna desde a etapa 48, e o roteiro estava cego desde então. Além disso, ele clicava na primeira coluna — que ele mesmo acabara de aprovar, e por isso oferecia "Reabrir". Agora escolhe outra coluna em rascunho, pelo nome |

---

## Etapa 51 — Submenu do registro, editar/remover e as cores do formulário

| # | Decisão | Justificativa |
|---|---|---|
| D365 | "Registro de dispositivo" deixou de ser tela e virou **grupo** no menu, com "Registrar dispositivo" e "Editar / remover dispositivo" | Pedido do usuário, no molde do menu "Ambiente" do Cloud4Mobile. Aberto, o grupo se desdobra no lugar, recuado e com fio à esquerda; recolhido (64px) não há onde desdobrar, então as opções saem num painel ao lado, ancorado pelo `ancorarMenu` — o mesmo que vira os menus da matriz quando não cabem |
| D366 | A faixa dos cards de tópico do formulário ficou **roxa da marca**, com título e "Todos/Nenhum" em branco | Pedido do usuário. É a mesma tinta do cabeçalho da planilha: tópico aqui e coluna lá são o mesmo eixo, e o cinza de antes não separava um card do outro numa pilha de quatro |
| D367 | `accent-color: var(--color-primary)` em todo checkbox e radio, com 15px de lado | Pedido do usuário: o marcado saía no azul do sistema. `accent-color` pinta o controle **nativo** — desenhar uma caixa falsa custaria o comportamento de teclado e de leitor de tela por causa de cor. Vale em todos os modais de uma vez |
| D368 | Editar um tipo **não muda o slug**, mesmo renomeando | O slug está em `/matriz/<slug>` e em links já salvos pelo time. Renomear é rotulagem, não mudança de endereço |
| D369 | Editar a bateria **reconcilia as homologações abertas**: item que entra nasce pendente, item que sai é removido — mas o que já foi avaliado **fica** | Apagar resultado de teste por causa de uma edição de catálogo destruiria trabalho de bancada. O que sobrevive volta na resposta em `preservados`, e a matriz continua exibindo esse item porque já inclui item usado por resultado. Homologação APROVADA/PUBLICADA não é tocada (spec §11.4) |
| D370 | Apagar tipo só quando **não há modelo cadastrado**; com modelos, o caminho é desativar | Apagar levaria junto homologações e certificados emitidos. O backend recusa com 409 e a tela trava o botão — as duas pontas, porque travar só na tela não é regra |
| D371 | Um formulário só (`FormularioTipo`) para criar e editar | São os mesmos campos; dois componentes garantiriam que um dia divergissem. Mesma decisão do `ModalNovoModelo` (D-etapa 46) |
| D372 | **Bug de roteiro corrigido:** três roteiros endereçavam o painel de divergências por `button[aria-expanded]:not([aria-haspopup])` **primeiro da página** | O botão do grupo no menu lateral também é um `aria-expanded`, e passou a ser o primeiro — os roteiros clicavam no menu. O botão ganhou `data-painel-divergencias`; seletor posicional volta a quebrar na próxima mudança de layout |
| D373 | O roteiro do registro cobre também o **menu recolhido**, a preservação de resultado e o 409 do apagar | Eram os três caminhos escritos e nunca executados. O da preservação em especial: é onde um erro apagaria dado de homologação sem ninguém ver |

---

## Etapa 52 — "Modelo PoS" fora da ficha, barra do topo no login e exibir senha

| # | Decisão | Justificativa |
|---|---|---|
| D374 | A linha **"Modelo PoS"** (`nomeComercial`) saiu de `LINHAS_FICHA` e de `FICHA_FIXA` | Pedido do usuário. Ela nasce de fabricante + modelo, que já são duas linhas da mesma ficha, e ainda é o título da própria coluna — a mesma resposta três vezes na tela. O campo continua no dispositivo e se edita pela Configuração da coluna; nada foi apagado do banco. A ficha caiu de 15 para 14 linhas |
| D375 | Barra de marca no **topo** do login: a de baixo **espelhada** — `orange 0% → primary 55% → purple-deep 100%` | Pedido do usuário: laranja onde o fundo é roxo, roxo onde o fundo é branco. Duas tentativas antes desta: a parada em 41.7% deixava o meio do painel num marrom de transição (`rgb(184,76,52)`), e o patamar de laranja até 30% que a corrigiu ficou chapado demais — o usuário pediu "mais sutil, igual o de baixo". Refletir a barra inferior resolve as duas coisas e faz das duas a mesma peça. O roteiro compara as paradas das duas e exige que uma seja a outra invertida. Fio do cartão inalterado |
| D376 | O painel roxo passou a encostar na **barra**, não no topo da janela | Consequência da D375. O roteiro do login exigia `top === 0`; agora exige que não sobre fundo entre a barra e o painel, que é a invariante real |
| D377 | "Exibir senha" é um **marcador abaixo do campo**, não um olho dentro dele | Numa senha digitada errada o que se quer é ver o que está escrito enquanto se corrige, com o estado à vista. O marcador já herda o roxo do D367 |
| D378 | **Bug de roteiro corrigido:** `verificar:registro` tinha 48, 39, 40, 49 e 9 gravados no código | O usuário registrou o tipo "Totem" e escreveu o item "TESTE RAFAEL" pela tela enquanto a etapa 51 era construída — o catálogo foi para 49 e o roteiro quebrou sozinho na primeira vez que alguém usou a funcionalidade que ele testa. As contagens agora saem do catálogo vivo, e "PoS não foi tocado" é medido contra o que PoS tinha antes do roteiro rodar, não contra um número |
| D379 | O item escrito num tipo **não entra na bateria dos outros** | Confirmado em produção pelo caso do usuário: "TESTE RAFAEL" está só em "Totem — Padrão", e PoS seguiu com 48 linhas. É a D358 funcionando — a matriz tira as linhas da bateria da categoria, não do catálogo |

---

## Etapa 53 — "Editei o tipo e a planilha não mudou"

| # | Decisão | Justificativa |
|---|---|---|
| D380 | **Diagnóstico, não bug:** a edição do PoS salvou (bateria 48 → 44), mas as quatro linhas continuaram na planilha | Reiniciar, Bloquear, Desbloquear e Limpeza de Dados têm 121 resultados gravados nas 31 colunas — nenhum deles pendente numa homologação aberta. A D369 preserva resultado avaliado e a D358 faz a matriz exibir todo item com resultado: as duas juntas mantêm a linha de pé. O comportamento estava certo; o que faltava era alguém dizer isso |
| D381 | `PATCH /tipos-dispositivo/:id` passou a devolver **`aindaNaPlanilha`**: os itens tirados da bateria que a planilha continua desenhando | `preservados` só olhava homologação aberta, e a linha também sobrevive por resultado em homologação fechada — que a reconciliação nem toca. Para responder "por que a linha não sumiu?" a conta certa é "tem resultado em alguma coluna deste tipo", independente do status |
| D382 | A tela de manutenção **conta o que a edição fez** ao voltar, em vez de voltar calada | Era a causa direta da confusão: uma edição que não mexe na planilha ficava indistinguível de uma que não salvou. O aviso diz quantos itens entraram e saíram e, quando é o caso, nomeia as linhas que ficam por terem histórico |
| D383 | **Bug de roteiro corrigido:** `verificar:registro` exigia `camposFicha` vazio no PoS | Escrito quando o PoS nunca tinha passado pela tela de edição. O usuário editou, o campo deixou de ser vazio e o roteiro acusou "PoS ganhou recorte de ficha sem pedir". A invariante é "não mexeu no tipo alheio" — agora medida contra o estado do PoS no começo da execução, como já era feito com a contagem de itens (D378). Mesmo erro, segunda vez: expectativa fixa sobre dado que a aplicação deixa o usuário mudar |

---

## Etapa 54 — A bateria manda na planilha, e a análise passa a ser editável

| # | Decisão | Justificativa |
|---|---|---|
| D384 | **Revoga a D358/D369 na parte visual:** `GET /matriz` devolve só os itens da bateria da categoria. Item com resultado deixou de entrar por conta própria | O usuário pediu duas vezes: desmarcar um item tem de tirar a linha na hora. Manter na tela todo item com resultado era proteção bem-intencionada que tornou a planilha impossível de limpar — no PoS, os 121 resultados dos quatro comandos garantiam que nenhuma edição tivesse efeito. Nada é destruído: o resultado fica no banco e a linha volta inteira ao remarcar o item, o que o roteiro prova |
| D385 | Os `resultados` da matriz também são filtrados pela bateria | Sem isso, um resultado de item fora da bateria contaria no medidor de divergências e no checklist de finalizar **sem ter linha onde ser resolvido** — uma pendência impossível de fechar |
| D386 | O certificado segue a bateria **enquanto a homologação está aberta**; aprovada, sai tudo que tem resultado | Tela e documento não podem contar coisas diferentes. Mas homologação aprovada é registro: o que foi atestado não muda porque alguém editou o tipo depois. Certificado emitido é arquivo em disco com snapshot próprio e não passa por aqui |
| D387 | `preservados` mudou de sentido: agora é "itens tirados que tinham avaliação guardada", contando **todas** as colunas | Antes era "resultado protegido nas homologações abertas". Homologação fechada nem passa pela reconciliação e o resultado dela também sobrevive — a lista precisava dizer o que ficou guardado, não o que a transação protegeu |
| D388 | **`aindaNaPlanilha` foi removido no mesmo dia em que nasceu** | Ele respondia "por que a linha não sumiu?" — pergunta que a D384 eliminou. Um campo que descreve um comportamento revogado é pior que campo nenhum: o aviso na tela continuaria afirmando que a linha ficou |
| D389 | `Homologacao.analiseDivergencias` (Json, nulo = automático): a "Análise das Divergências" pode ser assumida pelo técnico | Pedido do usuário: liberdade para acrescentar temas específicos de cada certificado e modelo, e para editar ou apagar até os blocos que vieram por padrão. Nulo mantém o comportamento de sempre; array faz o documento sair exatamente do que está gravado |
| D390 | O editor é **tudo-ou-nada** ("Personalizar" copia o automático), e não remendo bloco a bloco | Os blocos automáticos não têm identidade estável: agrupam por texto de justificativa, e mudar um status reagrupa tudo — qualquer remendo por chave se perderia sozinho. Copiar e assumir é previsível, e "Voltar ao automático" desfaz |
| D391 | Editar a análise obedece à mesma trava de aprovada (403) | Mesma regra do resto do certificado (spec §11.4). O painel diz para reabrir, em vez de deixar o técnico digitar e o salvamento falhar |
| D392 | **Bug de roteiro corrigido (terceira vez):** `verificar:secoes` e `verificar:linhas` tinham as contagens da bateria gravadas no código | "Comandos tem 16" deixou de ser constante quando a bateria virou editável. `secoes` agora deriva da API; `linhas` passou a verificar **subsequência** — a especificação do usuário manda na ordem e na grafia, ausência é configuração. É o mesmo erro da D378 e da D383: expectativa fixa sobre dado que a aplicação deixa o usuário mudar |

---

## Etapa 55 — A justificativa da planilha voltando ao certificado em tempo real

| # | Decisão | Justificativa |
|---|---|---|
| D393 | **Bug corrigido:** `useSalvarCelula` não invalidava o cache do certificado | A prévia é HTML gerado no servidor a partir dos mesmos resultados. Salvar uma justificativa na matriz atualizava a planilha e deixava o documento servindo a versão anterior por 30s (`staleTime`), com `refetchOnWindowFocus` desligado — parecia que a justificativa não tinha salvado. Também faltava em `useSalvarFicha`/`useSalvarDispositivo` (a ficha é a "Descrição do dispositivo") e nas transições de status, que congelam e descongelam o documento |
| D394 | Com a seção manual, justificativa nova **não entra sozinha, mas é anunciada** | O usuário lembrou a regra antiga: justificar na funcionalidade põe o parágrafo no certificado. Assumir a seção rompe isso por definição. Em vez de deixar o texto sumir calado, o painel lista o que ficou de fora e oferece "Trazer para a análise" |
| D395 | O servidor guarda os textos **já tratados** (`vistos`), e é ele quem decide o que é novo | Primeira versão comparava, no cliente, os automáticos contra os blocos gravados — e um parágrafo **reescrito ou apagado de propósito** voltava como novidade a cada visita, desfazendo a decisão do técnico. Salvar passou a significar "olhei a seção como ela está agora": toda justificativa existente naquele momento conta como tratada. O que vier depois é que é novo |
| D396 | O campo `analiseDivergencias` virou `{ blocos, vistos }`; array puro continua sendo aceito | Era array no primeiro dia. Ler as duas formas custa três linhas e evita migração de dado |
| D397 | **Bug de roteiro corrigido:** `verificar:fluxo` estava cego há várias etapas | Clicava em `text=Cadastrar novo modelo`, que é o TÍTULO do modal e não o botão ("+ Novo modelo"), e abria o certificado por um `<a>` que virou opção do hambúrguer. Ficava no timeout sem testar nada. É o quarto roteiro com seletor obsoleto nesta leva — o padrão é sempre o mesmo: endereçar por texto de UI ou por posição |
| D398 | `verificar:fluxo` passou a **apagar as cobaias que cria** | Ele cadastra modelo e emite certificado de verdade; cada execução deixava mais uma coluna "Morefun MP860-<número>" na planilha do usuário. Duas ficaram para trás hoje e foram removidas. O filtro é o padrão exato do nome gerado, para não encostar no "Morefun MF960", que é modelo real |
| D399 | `verificar:linhas` passou a **listar, e não cobrar**, item acrescentado pelo técnico | O usuário criou "Configuração de Políticas (Pos/Android)" pela tela de registro. Escrever item é funcionalidade: o que a especificação manda é a ordem relativa e a grafia das linhas que ela nomeia; presença de item novo e ausência de item desmarcado são configuração |

---

## Etapa 56 — `vistos` engolia justificativa em silêncio

| # | Decisão | Justificativa |
|---|---|---|
| D400 | **Revoga a D395:** `vistos` deixou de ser recalculado no servidor a cada gravação e passa a mudar só por gesto explícito | O defeito apareceu no dado do usuário: no "Positivo Octa 400", **duas** justificativas ("Configuração de Políticas (Pos/Android)" e "Configuração de Launcher") estavam marcadas como tratadas sem estar em bloco nenhum. Salvar a análise por qualquer motivo marcava como tratada toda justificativa existente naquele instante — inclusive as escritas na planilha entre duas edições, que assim nunca eram oferecidas nem entravam no documento. Era o mesmo "sumir calado" que a D394 tentava impedir |
| D401 | Os três gestos que mexem em `vistos`: **Personalizar** (assume os automáticos do momento), **Trazer para a análise** e **Dispensar** | São as três formas de decidir sobre um parágrafo. Salvar não é decisão sobre justificativa, é gravação do texto — não pode carregar efeito colateral |
| D402 | "Dispensar" entrou junto com o conserto | Sem ele, a única saída para uma justificativa que não deve entrar era apagar o bloco depois de trazê-lo. Recusar é uma decisão legítima e precisa de porta própria |
| D403 | **Não corrigi o dado do usuário automaticamente** — pus um botão "Reconferir justificativas da planilha (N fora do documento)" | Um texto em `vistos` sem bloco pode ser justificativa engolida pelo defeito **ou** parágrafo apagado de propósito. O dado atual não distingue os dois, e adivinhar apagaria uma decisão dele. O botão devolve à lista tudo que não está no documento, e aparece com a contagem (`foraDoDocumento`) para não ser preciso desconfiar sozinho |
| D404 | **Bug corrigido no mesmo passe:** o `vistos` local não acompanhava o que era gravado | Depois de "Personalizar", o `useEffect` não readotava o estado do servidor (o rascunho já não era nulo), e a gravação seguinte devolvia a lista vazia do primeiro carregamento — desfazendo o que o Personalizar tinha registrado. O `onSuccess` passou a sincronizar com o que foi enviado. Foi o roteiro que pegou: a asserção de "bloco apagado de propósito não volta" quebrou assim que a primeira correção entrou |
| D405 | O roteiro agora salva **por outro motivo** no meio, de propósito, antes de trazer a justificativa | É a reprodução exata do defeito do usuário. Sem esse passo, a suíte passava com o bug em pé — o roteiro só exercitava o caminho feliz de trazer logo em seguida |

---

## Etapa 57 — Atalho no Desktop que liga e desliga o sistema

| # | Decisão | Justificativa |
|---|---|---|
| D406 | Atalho **"Homologacao Mobiltec"** no Desktop → `.cmd` → `Iniciar.ps1`. Sobe banco, backend e interface, publica na rede e mostra o link já copiado | Pedido do usuário: um clique, sem depender de rodar script à mão nem de pedir aqui. A janela do console é a aplicação — enquanto aberta, o sistema está online |
| D407 | O desligamento é feito por um **vigia externo**, não pelo próprio script | Fechar a janela no X encerra o processo sem rodar limpeza nenhuma. O `finally` do PowerShell só cobre Ctrl+C e fim de laço. O vigia roda escondido e **em console próprio** — compartilhando o console do Iniciar, morreria junto e não teria a quem enterrar |
| D408 | **Job Object com `KILL_ON_JOB_CLOSE` foi descartado, por medição** | Era o mecanismo natural e foi a primeira tentativa. Nesta máquina o filho fica registrado no job (`IsProcessInJob` = `True`, `SetInformationJobObject` = `True`) e **ainda assim sobrevive** à morte do pai: o PowerShell já roda dentro de um job e o aninhamento não propaga o encerramento. Trocado por um mecanismo que eu consegui provar |
| D409 | O vigia derruba a **árvore** (`taskkill /T`), não só o dono da porta | `npm run dev` vira npm.cmd → cmd.exe → node. Matar só quem escuta a porta deixa o supervisor do tsx de pé, e ele religa o filho — o servidor ressuscitaria sozinho. O dono da porta continua sendo derrubado depois, como rede de segurança |
| D410 | Regra de firewall **"Homologação Mobiltec (porta 8080)"**, criada uma vez com elevação | Antes o acesso pela rede dependia das permissões genéricas que o Windows criou para o `node.exe` — essas somem quando o Node é atualizado ou reinstalado noutro caminho. A regra é do sistema, pela porta, e sobrevive a isso |
| D411 | A regra vale em **todos os perfis**, mas restrita a **`LocalSubnet`** | Medido: a Wi-Fi "Mobiltec 2" está classificada como **Pública**, então regra só para "Privada" não pegaria e o link não abriria para ninguém. Como o perfil é Público e um notebook entra em rede de hotel, liberar para qualquer origem exporia o sistema fora da empresa — `LocalSubnet` mantém o alcance em quem está na mesma rede |
| D412 | Trava de instância única por mutex nomeado | Duas janelas brigariam pelas mesmas portas, e a segunda mataria os servidores da primeira ao liberá-las |
| D413 | O IP do link sai da **interface da rota padrão** | A máquina também tem adaptador do VirtualBox (192.168.56.1). Um link com ele não abre em ninguém, e nada no sistema avisaria |
| D414 | Os roteiros de verificação passaram de `localhost:5173` para `localhost:8080` | O `vite.config.ts` já estava em `port: 8080, host: '0.0.0.0'`; a suíte inteira apontava para a porta antiga e quebraria no primeiro uso do atalho. 22 arquivos. O default de `CORS_ORIGIN` no backend acompanhou — inerte na prática, porque o navegador só fala com o Vite, que faz o proxy de `/api` do lado do servidor |

### Três armadilhas do PowerShell 5.1 que custaram depuração

| # | Sintoma | Causa |
|---|---|---|
| D415 | Acentos viraram lixo no painel | `.ps1` **sem BOM** é lido como ANSI. Os dois scripts são gravados em UTF-8 **com BOM** |
| D416 | `pg_ctl: modo de operação "Mobiltec\sistema\pgdata" é desconhecido` | `Start-Process` junta os argumentos com espaço e **não cita nada**. A pasta é "Homolog Mobiltec"; o caminho chegava partido ao meio. `Executar` passou a citar todo argumento com espaço |
| D417 | O script travava na primeira linha, sem erro | `& pg_ctl \| ...`: o postgres **herda a saída padrão** de quem o criou e mantém o cano aberto para sempre — o `pg_ctl` termina, o pipeline não. Todo executável nativo passa por `Start-Process` com redirecionamento para arquivo |
| D418 | O vigia vigiava a porta **80803001** | `-Portas "8080,3001"` para um parâmetro `[int[]]`: o PowerShell leu a vírgula como separador de milhar e converteu para um único inteiro. Trocado por dois parâmetros escalares |
| D419 | O vigia registrava "banco parado" com o postgres vivo | `Start-Process -Wait` sem redirecionamento nem checagem: o `pg_ctl` falhava em silêncio. Agora o registro compara com a porta 5432 antes de afirmar |

---

## Etapa 58 — Ajustes na Homologação de Dispositivos (Parceiro, Anexos e Reteste)

| # | Decisão | Justificativa |
|---|---|---|
| D420 | Suporte a upload de `.zip` e imagens (`.png`, `.jpg`, `.jpeg`, `.webp`) nas observações com bloqueio estrito de vídeos | Pedido do usuário (Item 1): parceiro e equipe técnica podem anexar logs e capturas de tela. Vídeos são estritamente rejeitados na API e na interface com mensagem amigável ("Vídeos não serão permitidos neste momento"). Rota `/upload/anexo` com limite de 50 MB e armazenamento em pasta local `uploads/anexos` e fallback Supabase |
| D421 | Observações Gerais estruturadas com Título, Conteúdo, Anexos e Paste (Ctrl+V) de prints da área de transferência | Pedido do usuário (Item 2): em vez de campo único de texto desestruturado, funciona como menu de anotações com título, autor, data e prévia/zoom de imagens e download de logs. Armazenado como JSON retrocompatível em `homologacao.observacoes` |
| D422 | Perfil Parceiro não visualiza o botão "Sem Justificativa" | Pedido do usuário (Item 3): parceiros não necessitam e não devem ter acesso a esse botão de ação rápida/justificativa em massa. Ocultado em `Matriz.tsx` |
| D423 | Parceiro tem acesso à "Configuração" e "Solicitar Reteste" | Pedido do usuário (Item 4): parceiro pode alterar dados do aparelho em homologação e solicitar reteste reutilizando o mesmo modelo sem precisar recadastrar tudo do zero |
| D424 | Nome de Apoio do Parceiro obtido automaticamente do cadastro (`usuario.nome`) com checkbox `[ ] Cadastrar como Apoio do Parceiro` | Pedido do usuário (Item 5): evita que o parceiro digite qualquer nome. Se marcado, padroniza como `{usuario.nome} — Parceiro`. Validado tanto no frontend quanto na API |
| D425 | Homologação enviada para validação entra no status "Em Validação" (`AGUARDANDO_ANALISE`) e "Em Revisão" (`EM_REVISAO`), e bloqueia edição indevida pelo parceiro | Pedido do usuário (Itens 6, 7 e 8): mapeado visualmente na planilha (`CelulaFicha.tsx`), nos filtros e nas telas de validação. Parceiro mantém permissão de leitura das observações e download de logs, mas não pode alterar dados enquanto sob custódia da Mobiltec |
| D426 | Correção do erro de servidor (500) ao baixar certificado em "Exibir Informações" | Pedido do usuário (Item 10): `dataExtenso` em `services/certificado.ts` recebia string em `dataFim` e disparava `RangeError: Invalid time value` no `Intl.DateTimeFormat`. Corrigido para converter com segurança para `new Date(d)` e tratar falhas de headless Chromium retornando 503 com alternativa de visualização e impressão direta no navegador |

---

## Etapa 59 — Atualização de Segurança dos Pacotes Críticos do Fastify (D427)

| # | Decisão | Justificativa |
|---|---|---|
| D427 | Atualização de segurança do ecossistema Fastify 5 e JWT | Atualização coordenada de `fastify` (5.12.3), `@fastify/jwt` (10.2.2), `@fastify/static` (10.1.3), `@fastify/cors` (11.3.0), `@fastify/multipart` (10.1.1) e `fastify-plugin` (6.0.0) para sanar vulnerabilidades críticas de bypass de autenticação JWT e path traversal (GHSA-gmvf-9v4p-v8jc, GHSA-8pvw-jcv7-9cmj, GHSA-jx2c-rxcm-jvmq), com preservação de 100% dos tipos e roteiros de verificação mecânica |
| D428 | Blindagem de RBAC para perfil LEITOR e restrição de rotas sensíveis de catálogo, dispositivos e vitrine | Garante que usuários com perfil LEITOR não possam criar ou alterar homologações, itens de catálogo ou transicionar status, restringe operações estruturais (DELETE/POST dispositivos, tipos e baterias) a ADMIN/HOMOLOGADOR, reabertura a ADMIN, e isola homologações em andamento na vitrine por empresa de parceiro |

---

## Etapa 60 — Simplificação e Compactação Visual dos Cards de Parceiros (D429)

| # | Decisão | Justificativa |
|---|---|---|
| D429 | Simplificação e compactação visual dos cards de parceiros na tela de gestão | Remove campos secundários da visualização em lista (nome do contato e chips de homologações permitidas) e padroniza os cards em layout horizontal compacto contendo estritamente Empresa, badge de status, e-mail e botões diretos de ação ("Editar" e "Inativar/Reativar"). Preserva todos os dados e permissões acessíveis e editáveis no modal |

---

## Etapa 61 — Sincronização Dinâmica do Certificado e Rastreamento de Autoria (D430)

| # | Decisão | Justificativa |
|---|---|---|
| D430 | Sobreposição direta de justificativas no certificado, rodapé flexível sem quebras e rastreamento de autoria por e-mail e horário | Elimina banner manual de confirmação de justificativas no certificado; sobrepõe alterações diretamente nos blocos técnicos durante a homologação; implementa rodapé elástico em flexbox (`.pagina-final`, `.interna-final`, `.rodape-final`) para impedir colisões em certificados com muitas divergências; e adiciona `autorEmail` no modelo `Resultado` e `ItemObservacaoGeral` para exibir registro sutil de quem comentou e horário abaixo dos cards |

---

## Etapa 62 — Remoção de Homologações em Planilha e Gestão de Dispositivos Finalizados (D431)

| # | Decisão | Justificativa |
|---|---|---|
| D431 | Remoção de homologações com RBAC em planilha e painel consultivo de dispositivos finalizados com reabertura e exclusão sincronizada | Adiciona `DELETE /homologacoes/:id` com regras estritas de permissão: ADMIN/HOMOLOGADOR podem remover qualquer homologação de suas planilhas; membros de empresas parceiras visualizam itens de sua equipe mas apenas o criador/responsável (`responsavelId === usuario.id`) pode remover da planilha; exclusão atômica de dependentes e do dispositivo quando não houver outros testes vinculados. Reestrutura o menu lateral para "Configurar Homologação" (com subitens de registro e edição de tipos) e adiciona para Administrador o botão "Configurar dispositivos" com acesso ao painel consultivo unificado de dispositivos finalizados (`/configurar-dispositivos`), permitindo reabrir com justificativa ou excluir permanentemente da base refletindo dinamicamente nos painéis Mobiltec e Parceiro |

---

## Etapa 63 — Restauração Resiliente do Fundo do Certificado e Layout A4 Dinâmico (D432)

| # | Decisão | Justificativa |
|---|---|---|
| D432 | Restauração resiliente da imagem de fundo oficial do certificado e layout A4 com paginação dinâmica de divergências | Corrige a resolução do asset de fundo (`fundo-certificado.png`) através de busca multi-caminho e fallback incondicional Data URI (`fundoBase64.ts`), eliminando a falha silenciosa que gerava certificados com fundo branco. Padroniza todas as páginas na proporção A4 exata (210mm x 297mm) com `background-size: 100% 100%` sem distorção. Implementa paginação dinâmica de divergências (`paginarDivergencias`), distribuindo justificativas extensas entre páginas A4 com cabeçalho de continuação e flexbox elástico (`.interna-final`, `.conteudo-final`, `.rodape-final`), assegurando que o rodapé com assinaturas acompanhe o volume de texto sem nunca sobrepor nem estourar a folha |

---

## Etapa 64 — Autoria por E-mail e Horário & Confirmação em Tela da Justificativa (D433)

| # | Decisão | Justificativa |
|---|---|---|
| D433 | Autoria estrita por e-mail e horário em observações e confirmação in-place no painel de justificativa | Elimina duplicação de informações nos cards de observação geral (removendo rodapé redundante e mantendo apenas uma indicação logo abaixo do título); padroniza a identificação autoral para exibir exclusivamente o e-mail da conta do responsável e o horário (sem nomes pessoais ou papéis); ajusta `GET /matriz/:categoriaSlug` para selecionar `autorEmail` e `atualizadoEm`; e no painel de justificativa (`PainelJustificativa.tsx`), impede o fechamento abrupto ao clicar em "Aplicar", mantendo o usuário na mesma tela com aviso visual explícito ("Justificativa registrada com sucesso") e exibindo a última atualização com e-mail e horário no card. |

---

## Etapa 65 — Autoria por E-mail em Anotações e Fechamento Estrito de Popups pelo Botão X (D434)

| # | Decisão | Justificativa |
|---|---|---|
| D434 | Autoria com e-mail e horário nas anotações e eliminação de fechamento acidental por clique no backdrop | Padroniza o rodapé das anotações por funcionalidade para exibir estritamente `Registrado por: [e-mail]` e a data/hora ao lado direito, com fallback garantido para o e-mail e data da homologação/responsável da conta (eliminando a palavra "técnico"); e remove os manipuladores de clique no backdrop (`onClick={aoFechar}` e `onClick={aoCancelar}`) em `ModalObservacoesHomologacao.tsx`, `ModalObservacao.tsx` e `PainelJustificativa.tsx`, garantindo que arrastar o mouse para selecionar ou copiar texto nunca feche o modal acidentalmente, fechando estritamente através do botão de fechar (X). |

---

## Etapa 66 — Campo de Busca Digitável Integrado aos Seletores de Filtro (D435)

| # | Decisão | Justificativa |
|---|---|---|
| D435 | Busca digitável em tempo real nos dropdowns de filtro da matriz | Integra campo de pesquisa fixo no topo (`sticky top-0`) com foco automático em `SeletorFiltro.tsx`, permitindo ao usuário filtrar fabricantes, modelos, versões e status digitando diretamente pelo teclado (com filtragem em tempo real, normalização case/acento, atalho Enter para seleção rápida do primeiro resultado e botão de limpeza ✕), dispensando a rolagem manual exaustiva em listas longas sem quebrar a interação tradicional por clique. |

---

## Etapa 67 — Estilização em Tom Roxo de Marca para Alerta de Diálogo de Impressão (D436)

| # | Decisão | Justificativa |
|---|---|---|
| D436 | Alerta de diálogo de impressão do certificado em roxo suave de marca | Substitui a tonalidade vermelha/destrutiva (que sugeria incorretamente falha/erro ao usuário) por um banner estilizado nos tokens roxos oficiais da Mobiltec (`--color-brand-purple-soft: #fbf4fa`, `--color-brand-purple-fg: #6e226b`, `--color-brand-purple-border: #f0d5eb`) acompanhado do ícone animado de impressora em `DetalheDispositivo.tsx` e `Certificado.tsx`, preservando a estilização destrutiva exclusivamente para falhas reais de API/geração. |

---

## Etapa 68 — Visibilidade Unificada no Painel Principal e Seletor Fixo com Criação Dinâmica de Parceiros (D437)

| # | Decisão | Justificativa |
|---|---|---|
| D437 | Visibilidade unificada no Painel Geral Mobiltec e seletor estrito com criação rápida de parceiros | Ajusta `GET /vitrine` para que o painel principal (`/`) forneça visão geral das homologações em andamento no ambiente Mobiltec para todos os usuários (incluindo parceiros), preservando os painéis exclusivos de cada parceiro (`/paineis/meu-painel`) para acompanhamento restrito de sua própria empresa; remove a duplicação do botão "Mobiltec" no menu lateral para usuários internos; e em `GerenciarParceiros.tsx`, substitui o campo livre por seletor com nomes fixos pré-registrados (`Mobiltec`, `TNS` e existentes) acompanhado de botão de criação inline `+ Criar Novo Parceiro`, garantindo vinculação estrita de cada usuário ao ambiente da sua empresa. |

---

## Etapa 69 — Remoção de Greyout em Campos Editáveis e Limpeza de Textos Pré-Prontos de Migração (D438)

| # | Decisão | Justificativa |
|---|---|---|
| D438 | Remoção de placeholders em campos digitáveis e limpeza definitiva de textos pré-prontos automáticos originados da planilha | Remove todos os atributos `placeholder` de inputs e textareas da interface (modais de observação, justificativa, reabertura, novo modelo, criação de parceiro, buscas e assinaturas do certificado), garantindo caixas 100% em branco sem qualquer texto fantasma/greyout pré-escrito que possa simular preenchimento; executa limpeza idempotente no banco via `limpar-textos-automaticos.mjs`, zerando exclusivamente as 75 justificativas genéricas de migração (*"Migrado da planilha..."*) e as 143 observações automáticas geradas pela importação legado (*"Marcado como Testar..."*, *"Item do catálogo sem linha..."*, *"Planilha: ..."*), mantendo estritamente preservadas as 62 observações e 14 justificativas técnicas reais lançadas por usuários humanos; e atualiza `importar-planilha.ts` para que futuras reimportações não reinjetem esses textos sintéticos. |

---

## Etapa 70 — Flexibilização Total e Resiliência no Cadastro de Dispositivos e Homologações (D439)

| D439 | Flexibilização e resiliência no cadastro de modelos e dispositivos | Elimina restrições rígidas e limitadores de dados inválidos no cadastro de dispositivos, adotando valores padrão e preenchimento tolerante para permitir homologações ágeis mesmo com informações parciais. |

---

## Etapa 71 — Gestão Dinâmica de Itens de Registro, Edição e Lixeira Reativa em Configurar Homologação (D440)

| # | Decisão | Justificativa |
|---|---|---|
| D440 | Card de registro com criação e edição dinâmica de itens e lixeira reativa nos tópicos da bateria de testes | No Card "2. Itens do registro" de `FormularioTipo.tsx`, implementa o mesmo padrão interativo dos tópicos de teste: rodapé para cadastrar novos itens de registro/ficha com input de texto e botão Adicionar/Salvar, além de suporte a edição do rótulo de qualquer linha não-fixa via ícone de lápis; e em todos os cards (Itens de Registro e nos 4 tópicos da Bateria de Testes), compacta os campos de digitação e adiciona ao lado do botão Adicionar um botão com ícone de lixeira reativa (`lixeira`): o ícone permanece em cinza/greyout (`opacity-40 cursor-not-allowed`) enquanto 0 funcionalidades/itens estiverem flagados, e transita imediatamente para vermelho vivo ativo (`border-red-300 text-red-600 bg-red-50 hover:bg-red-100`) ao flagar 1 ou mais itens, permitindo excluir em lote as funcionalidades e itens selecionados do modelo/tipo de dispositivo sendo configurado; além de permitir edição inline/rodapé de qualquer funcionalidade já existente ou nova. |

---

## Etapa 72 — Flag de Acesso Administrador para Parceiro Mobiltec (D441)

| # | Decisão | Justificativa |
|---|---|---|
| D441 | Flag "Dar acesso de Administrador" para parceiros vinculados à empresa Mobiltec | Ao registrar ou editar parceiro em `GerenciarParceiros.tsx`, quando a empresa selecionada for Mobiltec (`empresa.trim().toLowerCase() === 'mobiltec'`), exibe container destacado com checkbox "Dar acesso de Administrador"; quando marcada, envia `isAdmin: true`, atribuindo no backend (`parceiros.ts`) papel `papel: 'ADMIN'` e cargo `cargo: 'Administrador'`, liberando todas as permissões de administração do sistema; se desmarcada ou para outras empresas parceiras, mantém `papel: 'PARCEIRO'` e cargo `'Parceiro Homologador'`; atualiza `GET /parceiros` para listar também parceiros internos/admin que possuam empresa preenchida; e renderiza badge visual "Admin" nos cards de gerenciamento de parceiros. |

---

## Etapa 73 — Seletor de Tipo de Agente, Assinatura de Fabricante e Correção de Cadastro de Dispositivo (D442)

| # | Decisão | Justificativa |
|---|---|---|
| D442 | Seletor de Tipo de Agente, flag contextual Sim/Não de assinatura de fabricante e correção do erro 500 no cadastro | No modal de cadastro e edição de modelos (`ModalNovoModelo.tsx`), substitui o campo de texto livre de Tipo de Agente por um seletor selecionável com opções padrão ('Agente de Prod', 'Agente Dev', 'Agente QA', 'Agente POS', 'Agente Legado') acompanhado do botão '+ Novo agente' com formulário inline para adição dinâmica; remove os checkboxes genéricos 'Assinatura do agente' e 'Precisa assinatura DEV' e adiciona container contextual exibido exclusivamente para 'Agente POS' e 'Agente Legado' com a pergunta 'O agente precisa de assinatura do fabricante: Sim ou Não', sincronizando as flags correspondentes; e no backend (`matriz.ts` e `dispositivos.ts`), desestrutura explicitamente os campos de entidade e envolve as queries de criação em tratamento robusto de erros, evitando vazamento de propriedades no Prisma `homologacoes.create` que causava erro interno 500. |

---

## Etapa 74 — Exclusão da Mobiltec da Lista de Parceiros e Abrangência de Dispositivos por Ambiente no Painel (D443)

| # | Decisão | Justificativa |
|---|---|---|
| D443 | Remoção da Mobiltec no submenu Parceiros e consolidação dos dispositivos de categorias permitidas no Painel do Parceiro | No menu lateral (`Layout.tsx`), filtra a empresa Mobiltec da lista desdobrável de parceiros para admins (`empresasParceirasUnicas`), mantendo o link principal 'Mobiltec' unicamente no topo de 'Painel'; e no backend (`parceiros.ts`), ajusta `montarDadosPainel` para consolidar as `categoriasPermitidas` de todos os usuários da empresa parceira (e explicitamente 'pos' para TNS), expandindo a query `dispositivo.findMany` para incluir todos os dispositivos das categorias permitidas além daqueles explicitamente associados por empresa ou responsabilidade, garantindo que ao clicar em qualquer parceiro (ex: TNS com seus 32 dispositivos) o administrador visualize o ambiente completo e coerente de testes daquela organização. |

---

## Etapa 75 — Modal de Informações em Abas com Tabela Compacta e Gestão Estruturada de Parceiros com Busca (D444)

| # | Decisão | Justificativa |
|---|---|---|
| D444 | Modal de Informações com abas em botões horizontais, tabela compacta de testes/observações e tabela de parceiros com filtro em tempo real | Em `ModalInformacoesHomologacao.tsx`, substitui os blocos verticais grandes e o card fixo de observações por uma barra de botões/abas dispostos lado a lado ('Todos', 'Telemetria', 'Coleta', 'Comandos', 'Perfis' e 'Observações'); ao selecionar uma categoria de teste, renderiza uma tabela compacta e limpa contendo Nome do Teste e Status (com justificativa técnica discreta quando houver); ao clicar em 'Observações', alterna exclusivamente para a visualização de observações com mensagem amigável quando vazia ('O parceiro não registrou nenhuma observação até o momento'); e em `GerenciarParceiros.tsx`, substitui o grid de cards por uma tabela administrativa estruturada e compacta acompanhada de input de busca e filtro em tempo real por empresa ou colaborador. |

---

## Etapa 76 — Seletor de SO, Dropdowns com Design System, Badges Premium e Placeholders de Busca (D445)

| # | Decisão | Justificativa |
|---|---|---|
| D445 | Seletor de Sistema Operacional, rótulo dinâmico da versão, dropdowns customizados com Design System, desobrigação do número de série, badges premium e placeholders nas buscas | Em `ModalNovoModelo.tsx`: adiciona seletor de Sistema Operacional ('Android', 'iOS', 'Microsoft', 'Linux'), ajustando o rótulo da versão dinamicamente ('Versão do Android', 'Versão do iOS', 'Versão do Windows', 'Versão do Linux') e exibindo os cadastros específicos de Android ('Gerenciamento') unicamente quando o SO for Android; substitui os elementos `<select>` nativos do navegador por um componente customizado `SeletorDropdown` alinhado ao Design System (com popover flutuante, bordas sutis, hover roxo de marca e checkmark ativo); remove a obrigatoriedade do campo 'Número de série', permitindo submissão transparente sem exigência; em `ConfigurarDispositivos.tsx`, atualiza o badge do cabeçalho e da coluna de status para uma flag pill clean e premium com dot indicador esmeralda (`bg-emerald-500`), e estiliza o badge 'Mobiltec' na coluna Ambiente/Parceiro com o gradiente oficial roxo (`var(--gradient-brand-purple)`); e nas barras de pesquisa de `Home.tsx`, `PainelParceiro.tsx` e `ConfigurarDispositivos.tsx`, restaura o placeholder informativo ('Pesquise o modelo, versão, fabricante, etc...') com expansão de largura para acomodação limpa do texto. |

---

## Etapa 77 — Remoção do Campo de Categorias Permitidas, Lupa Roxa e Badge com Nome da Empresa (D446)

| # | Decisão | Justificativa |
|---|---|---|
| D446 | Remoção do campo e coluna de Categorias Permitidas no registro de parceiro, lupa de busca roxa e badge do parceiro exibindo unicamente o nome da empresa | Em `GerenciarParceiros.tsx`, remove a coluna 'Categorias Permitidas' da tabela administrativa e a seção correspondente do modal de cadastro/edição de parceiros, liberando o escopo completo de categorias por padrão sem necessidade de seleção manual; altera a cor do ícone de lupa na barra de pesquisa para a cor primária da marca (`var(--color-primary)`); e no cabeçalho superior (`Layout.tsx`), altera o badge de perfil do usuário logado no ambiente do parceiro para renderizar unicamente o nome da sua empresa (ex: `Teste` ou `TNS`), eliminando o prefixo redundante `Parceiro (...)`. |

---

## Etapa 78 — Preservação de Ordem e Status ao Renomear Funcionalidade na Bateria de Testes (D447)

| # | Decisão | Justificativa |
|---|---|---|
| D447 | Atualização in-place de nome e descrição de funcionalidades em Configurar Homologação sem alteração de ordem nem reinício de status | Em `FormularioTipo.tsx`, mantém o ID dos itens editados do catálogo na lista `itensExistentesFinais` e despacha os dados renomeados via `itensEditados` (em vez de tratá-los como `itensNovosConvertidos`), evitando que o backend remova o item da bateria e o recrie com novo ID ao final da lista; e em `tipos-dispositivo.ts` (`PATCH` e `POST /tipos-dispositivo`), adiciona suporte ao array `itensEditados` para atualizar `itemTeste.nome` e `itemTeste.descricaoAcao` diretamente no banco sem modificar a tabela pivot `bateriaItem` nem recriar os registros da tabela `resultado` das homologações abertas, garantindo que o status avaliado e a ordem na planilha de testes permaneçam 100% preservados. |

---

## Etapa 79 — Redesign Compacto em Validação de Certificados, Contraste de Notificações e Simplificação de Card (D448)

| # | Decisão | Justificativa |
|---|---|---|
| D448 | Redesign compacto horizontal dos cards de métricas em Validação de Certificados, contraste alto nas notificações e simplificação do card de homologação | Em `CentralNotificacoes.tsx`: restaura contraste pleno no texto descritivo das notificações (`color: var(--color-foreground)`, removendo opacidade esmaecida) para leitura nítida e confortável com borda esquerda roxa de destaque; em `ValidarCertificados.tsx`: compacta os cards superiores de métricas (*Aguardando Validação*, *Aprovados & Emitidos*, *Parceiros Cadastrados*) em layout horizontal com altura reduzida (`py-2.5 px-3.5`), ícones menores e o contador numérico posicionado ao lado do título; e simplifica o card de modelo enviado para validação, removendo o emoji de prédio (`🏢`) da tag do parceiro, eliminando a barra e os contadores de progresso de testes (`0 OK 1 div 47 pend`), e promovendo a data de envio (`· Envio: dd/mm/aaaa`) para a linha superior de tags, unificando a altura do card em um design limpo e fluido. |

---

## Etapa 80 — Alertas Reativos de Menu por Perfil e Redesign Compacto do Card em Revisão (D449)

| # | Decisão | Justificativa |
|---|---|---|
| D449 | Dispensa de alerta de validação ao visualizar no menu, exibição e saída do alerta de revisão no menu do parceiro após confirmação, e redesign compacto do card em revisão | Em `Layout.tsx`: implementa persistência de IDs visualizados (`homolog.validacao-vistos`) para o Admin, exibindo badges em *Parceiros* e *Validar certificado* apenas para novas pendências e dispensando-os ao clicar/visitar a página; e para o Parceiro, exibe badge de alerta âmbar em *Painel* e no subitem da sua empresa (`/paineis/meu-painel`) enquanto houver revisões pendentes de confirmação (`pendentesConfirmacao`), removendo os badges do menu em tempo real no momento em que o recebimento for confirmado. Em `PainelParceiro.tsx`: quando o dispositivo estiver em revisão (`EM_REVISAO`), substitui a foto do coletor e as especificações técnicas (Android/Agente/Progresso) por um container clean com o texto da revisão da Mobiltec sem o cabeçalho/ícone `⚠️`, provê controle de 'Ler mais / Ler menos' para textos extensos, exibe status/botão de confirmação e mantém o rodapé alinhado por `mt-auto`, unificando a altura dos cards e eliminando deformações na grade. |

---

## Etapa 81 — Isolamento Estrito do Painel do Parceiro e Eliminação de Vazamento de Dispositivos (D450)

| # | Decisão | Justificativa |
|---|---|---|
| D450 | Isolamento estrito do painel do parceiro para exibir unicamente dispositivos e homologações da própria empresa | Em `parceiros.ts` (`montarDadosPainel`): remove a cláusula aberta por categoria (`listaCategorias`) que provocava o vazamento de dispositivos da Mobiltec e de terceiros em teste para o painel do parceiro; restringe a consulta e o `include` de homologações aos modelos cadastrados pela empresa do parceiro (`dispositivo.empresa` ou `fabricante`) ou que possuam homologações atribuídas ao parceiro ou a usuários da sua empresa; assegura que o painel do parceiro liste apenas os modelos do seu ambiente e que os modelos e homologações em andamento da Mobiltec sejam acessados exclusivamente através da vitrine geral em *Painel > Mobiltec*. |

---

## Etapa 82 — Liberação de Edição e Reenvio para Validação de Homologações em Revisão (D451)

| # | Decisão | Justificativa |
|---|---|---|
| D451 | Desbloqueio da edição de testes e habilitação de reenvio para validação pela Mobiltec quando a homologação estiver com status EM_REVISAO | Em `transicoes.ts` (`validarTransicao`): autoriza o papel `PARCEIRO` a transicionar de `EM_REVISAO` para `AGUARDANDO_ANALISE` (além da transição padrão de `RASCUNHO`), garantindo que o parceiro possa submeter novamente após corrigir os apontamentos; em `homologacoes.ts` (`PUT /homologacoes/:id/resultados/:itemId`): autoriza o parceiro a atualizar status e observações de itens de teste quando a homologação estiver em `EM_REVISAO`, com validação de titularidade da mesma empresa; em `tipos.ts` (`ehSomenteLeitura`): atualiza a regra para que o parceiro só tenha visualização somente-leitura enquanto a homologação estiver sob custódia da Mobiltec (`AGUARDANDO_ANALISE`) ou em estados finais concluídos (`APROVADO`, `PUBLICADO`, `REPROVADO`), liberando total interatividade de edição em `EM_REVISAO`; e em `ModalFinalizar.tsx` e `Matriz.tsx`: ajusta os botões e títulos de ação dinamicamente para 'Reenviar para Validação Mobiltec' quando o status for `EM_REVISAO`. |

---

## Etapa 83 — Redesign Premium do Aviso de Revisão e Eliminação de Cards Desarmoniosos (D452)

| # | Decisão | Justificativa |
|---|---|---|
| D452 | Aviso estilizado de revisão com identificação do técnico emitente, eliminação de caixas escuras/verdes e alinhamento visual com o Design System | Em `parceiros.ts` (`montarDadosPainel`): inclui `historicoStatus` com o último registro de transição para `EM_REVISAO` e o usuário responsável, expondo o objeto `revisaoInfo` contendo o nome real do técnico da Mobiltec que solicitou a revisão (`tecnicoNome`), a mensagem exata (`mensagem`) e a data/hora do envio (`criadoEm`); em `tipos.ts`: declara a interface `RevisaoInfo` e a associa a `DispositivoPainelParceiro`; em `PainelParceiro.tsx`: elimina os blocos amarronzados e a pílula verde sobre fundo cinza escuro, substituindo-os por um card de aviso premium integrado ao Design System (cabeçalho com avatar roxo em gradiente da marca, nome do técnico e indicador temporal sutil, caixa de mensagem nítida sobre `var(--color-card)`, linha de ciência/confirmação discreta com dot esmeralda sutil, e botão de confirmação com gradiente roxo oficial); e remove o link redundante 'Ajustar itens na bateria' do corpo, unificando a ação contextual no botão de rodapé 'Ajustar testes na bateria →'. |






















