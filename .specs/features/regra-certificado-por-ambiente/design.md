# Design

## Decisão de arquitetura

Adicionar ao gerador uma política de apresentação explícita, derivada no backend a partir do usuário autenticado e da rota/contexto autorizado. O objeto carregado do banco permanece intacto; antes de chamar `gerarCertificadoHtml`, a rota cria uma projeção de certificado com assinaturas públicas ou do parceiro.

## Fluxo

```text
request autenticado
  -> resolve contexto autorizado (parceiro próprio | painel Mobiltec)
  -> carrega homologação e aprovador
  -> projeta assinaturas sem mutar Prisma/snapshot
  -> gerarCertificadoHtml(projeção)
  -> preview HTML ou PDF
```

O mesmo resolvedor deve ser usado por preview e PDF. O endpoint não aceitará `ambiente` vindo de query/body como fonte de autorização.

## Componentes afetados

- `sistema/backend/src/routes/certificados.ts`: resolução do contexto e projeção antes de preview/PDF; proteger acesso ao apoio.
- `sistema/backend/src/services/certificado.ts`: aceitar o modo/projeção e renderizar zero ou três assinaturas conforme a política.
- `sistema/backend/src/routes/vitrine.ts` ou rota de validação: garantir que links do painel público carreguem contexto Mobiltec autorizado.
- `sistema/frontend/src/...`: somente se for necessário distinguir links/rotas do painel público e painel parceiro; sem duplicar regra de segurança.
- `sistema/backend/scripts/`: teste Playwright/API cobrindo preview, PDF e ausência de vazamento.

## Dados

Prioridade é reutilizar o histórico existente de aprovação. Só criar campo de aprovador se a pesquisa confirmar que não há autoria persistida; nesse caso, registrar decisão adicional e alteração Prisma/migração antes do código.
