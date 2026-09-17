# Regra de certificado por ambiente

## Objetivo

Aplicar uma política de apresentação ao certificado sem alterar a homologação original: o parceiro vê seu apoio adicional no ambiente exclusivo dele; o painel público da Mobiltec emite uma visão padronizada e sem esse dado.

## Requisitos de aceitação

- **RCA-001** — Quando um usuário parceiro autorizado consultar ou baixar um certificado de homologação aprovada/publicada no painel da própria empresa, o sistema SHALL renderizar o nome e a empresa registrados em Apoio adicional quando existirem; quando não existirem, SHALL omitir a linha sem inserir valor vazio ou placeholder.
- **RCA-002** — Quando um usuário consultar ou baixar o mesmo certificado pelo painel público Mobiltec, o sistema SHALL omitir completamente a informação de Apoio adicional do HTML e do PDF, mesmo que ela exista na homologação ou no snapshot.
- **RCA-003** — Quando o certificado for consultado pelo painel público Mobiltec, o sistema SHALL renderizar como Responsável técnico o nome do usuário Admin da Mobiltec que aprovou a homologação e como Gerente de validação o valor fixo `Rafael Cordeiro`.
- **RCA-004** — A regra SHALL ser aplicada tanto ao preview quanto ao download PDF e SHALL produzir o mesmo conjunto de assinaturas nos dois formatos para o mesmo contexto.
- **RCA-005** — A aplicação da política SHALL ser somente de apresentação: não deve atualizar, limpar, substituir ou reemitir o registro original de homologação, seus campos de apoio ou seu snapshot.
- **RCA-006** — Usuários e rotas sem contexto de parceiro próprio não devem obter o apoio adicional por uma rota de certificado público; testes devem provar que o texto não aparece no corpo HTML nem no PDF público.
- **RCA-007** — O certificado do parceiro SHALL continuar opcional: homologação sem apoio adicional permanece válida e seu certificado não exibe a linha.

## Fora de escopo

- Alterar o formulário ou o armazenamento atual do apoio adicional.
- Criar uma nova entidade ou duplicar homologações para cada ambiente.
- Alterar certificados históricos já arquivados; o download contextual deve respeitar a política vigente sem mutar o snapshot.

## Assunções e pontos a confirmar na implementação

- O painel público Mobiltec é identificado pelo contexto de usuário/rota atual que alimenta a vitrine/validação; a implementação deve reutilizar essa autorização, não um parâmetro livre enviado pelo navegador.
- A autoria da aprovação deve ser obtida do histórico de transição/status ou do campo existente que registra o aprovador; se o modelo atual não tiver essa relação, isso será registrado como decisão técnica antes de alterar o schema.
- A empresa do apoio pode estar embutida na string atual de assinatura; a política deve tratá-la como dado privado e nunca inferi-la a partir de outro campo público.
