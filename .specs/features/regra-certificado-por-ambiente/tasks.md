# Tarefas

1. **[x] Contrato e resolução de contexto**
   - Mapear a rota/painel que representa Mobiltec e a autorização do parceiro próprio.
   - Implementar uma função backend que derive o modo de certificado e o aprovador sem aceitar override do cliente.
   - Tests: testes de rota/API para parceiro próprio, Mobiltec e acesso cruzado.
   - Gate: `npm run build --prefix sistema/backend`.

2. **[x] Projeção e renderização do certificado**
   - Aplicar a projeção de assinaturas em preview e PDF.
   - Parceiro: apoio original opcional; Mobiltec: Admin aprovador + Rafael Cordeiro + sem apoio.
   - Tests: HTML e PDF não contêm o apoio no modo público; parceiro contém quando informado e omite quando ausente.
   - Gate: `npm run build --prefix sistema/backend` e roteiro de certificado.

3. **[x] Integração da UI e regressão de segurança**
   - Ajustar links/contexto dos painéis, se necessário, sem mover a decisão de segurança para o frontend.
   - Verificar que não há alteração do registro/snapshot.
   - Tests: Playwright pertinente, incluindo download e preview nos dois ambientes; limpeza das cobaias.
   - Gate: `npm run agent verify certificado` e `npm run agent review`.

## Evidências

- Backend: `npm run build --prefix sistema/backend` — passou.
- Frontend: `npm run build --prefix sistema/frontend` — passou.
- Gate completo: `npm run agent verify` — passou após o launcher Node 24 ser corrigido.
- Integridade: `git diff --check` — passou.
- Playwright: Chromium instalado em cache temporário, mas `verificar:certificado` ficou bloqueado pelo PostgreSQL local ausente (`P1001 localhost:5432`).
