# Verificação independente

## Veredito

PARTIAL — a implementação, os builds e o verificador oficial passaram; o roteiro Playwright foi iniciado com Chromium funcional, mas ficou bloqueado porque o PostgreSQL portátil não está disponível neste ambiente.

## Evidências por requisito

- RCA-001/RCA-007: `sistema/backend/src/routes/certificados.ts` projeta o objeto original para `PARCEIRO`; `sistema/backend/src/services/certificado.ts` só renderiza Apoio Adicional quando há valor.
- RCA-002: `sistema/backend/src/routes/certificados.ts` zera `assinaturaApoio` e não reutiliza arquivo arquivado para usuários Mobiltec.
- RCA-003: `sistema/backend/src/routes/certificados.ts` usa o usuário do histórico `APROVADO` e fixa `Rafael Cordeiro`.
- RCA-004: preview, PDF e emissão chamam a mesma projeção contextual.
- RCA-005: a projeção é shallow copy; não há `update`/`create` para alterar homologação ou snapshot durante consulta.
- RCA-006: parceiros são restringidos por responsável ou empresa antes de preview/download.

## Gates

- Backend build: PASS.
- Frontend build: PASS.
- `git diff --check`: PASS.
- Playwright: BLOCKED — Chromium ausente.
- `npm run agent verify`: PASS após o launcher Node 24 aplicar fallback para `os.userInfo()`.
- `verificar:certificado`: BLOCKED — aplicação não iniciou sem PostgreSQL (`P1001 localhost:5432`).

## Sensor

Não executado por ausência de runner isolado e navegador disponível. Revisão manual confirmou que remover a condição `request.user.papel === 'PARCEIRO'` do arquivo arquivado reintroduziria o risco de vazamento no PDF público.
