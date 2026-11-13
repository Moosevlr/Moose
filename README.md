# JCB ENGENHARIA · Ensino Técnico

Site institucional independente do Digital Station. Dados fornecidos pelo responsável: José Cleber Beckman Cordeiro, Belém–PA, `jbeckmancordeiro@gmail.com`, CNPJ `35.677.653/0001-94`. Não foram inventados telefone, endereço de rua, credenciamento, preços, carga horária ou abertura de turmas.

## Conteúdo e funcionamento

- Home, instituição, catálogo com sete cursos livres online, ementas propostas, contato, privacidade e consulta da carteirinha.
- Cursos: fiscalização de pavimentação, misturas asfálticas, terraplenagem/bases, medições rodoviárias, drenagem/conservação, sinalização/segurança e análise tecnológica de concreto.
- `POST /api/contato`: validação no servidor, consentimento, honeypot, mesma origem, tamanho limitado e armazenamento privado em Netlify Blobs (`jcb-interesses`). Sucesso de registro somente após gravação confirmada. Nenhum e-mail é enviado automaticamente.
- `GET /api/verificar/<token>`: consulta por código opaco de 256 bits, comparação SHA-256 segura, situação controlada pelo emissor e calendário de São Paulo. Registros ficam em Netlify Blobs privado por projeto; dados e token privados não são incorporados ao JavaScript público ou ao Git. A consulta não permite alterar ou listar registros.
- A carteirinha usa o registro confirmado pelo responsável, mantido fora do código público. Não se declara emissão pela UNE ou credenciamento de curso técnico regulamentado.

## Desenvolvimento e testes

Requer Node.js 24. Use este diretório existente, sem worktrees nem alterações no projeto Moose.

```sh
npm ci --cache /workspace/scratch/npm-cache --no-audit --no-fund
npm test
npm run build
npm run dev -- --port 4280 --strictPort
```

O adaptador local atende as APIs. Contatos de teste são gravados em `private/dev-interesses.ndjson`; isso não demonstra gravação no serviço remoto Netlify Blobs. Não são enviados e-mails. O diretório `private/` contém o registro e o código da carteirinha e deve ser preservado entre sessões, fora de Git, ZIPs públicos e `dist/`.

Verificação concluída: 53 testes Node, incluindo leitura independente de QR; 35 checks de navegação/layout/formulário em 1440/390/350 px; consulta HTTP e browser do registro autorizado, token desconhecido 404, ausência do código privado no bundle e seleção local de foto na prévia de impressão. Relatório resumido em `docs/validation.json`.

## Carteirinha

```sh
npm run card -- --draft
```

Cria `private/carteirinha-previa.html`, com dimensões de 85,6 × 54 mm, validade 31/03/2027 e sem campo de emissão. A fotografia original pode ser escolhida localmente no navegador, sem upload. O arquivo é uma prévia e não contém QR definitivo. A imagem ilustrativa editada no chat também está marcada como prévia; não deve ser apresentada como documento final publicado.

O comando sem `--draft` somente funciona depois de existir `private/publication.json` com `siteName`, `productionUrl` real, `verifiedAt` e `verified: true`. A URL deve ser a principal estável, não um permalink temporário. Após conferir a publicação e a API, execute:

```sh
npm run card
```

Os arquivos finais ficam em `private/`: `carteirinha-final.html`, `qr-final.svg`, `qr-final.png` e `verification-url.json`. Nunca publique o arquivo da carteirinha ou sua foto junto com o site institucional. O código do QR abre a consulta do registro, sem expor foto ou documentos pessoais.

## Publicação automática em um NOVO projeto Netlify

Este código deve usar a branch `jcb-engenharia-site` do GitHub `Moosevlr/Moose`, em um projeto Netlify exclusivo da JCB. A branch e o site de produção do emulador permanecem separados. O guard `scripts/netlify-ignore.cjs` ignora builds da JCB caso sejam executados pelo projeto Netlify antigo ou sem identificação de projeto.

A API de contas do Netlify não está acessível neste ambiente. O caminho suportado para a vinculação inicial é a integração GitHub já autorizada pelo usuário:

1. Abrir https://app.netlify.com/start e importar um projeto existente do GitHub.
2. Selecionar `Moosevlr/Moose` e **branch de produção `jcb-engenharia-site`**, criando um novo projeto chamado `jcb-engenharia` ou outro nome disponível.
3. Manter raiz do repositório como base. `netlify.toml` configura Node 24, testes, build, funções e publicação de `dist`.
4. Concluir a criação do novo projeto e obter sua URL principal HTTPS. Não escolher o site do emulador, não editar sua branch de produção e não usar um permalink temporário como endereço da carteirinha.

Não usar o Deploy Button que copia o repositório: a integração deve acompanhar esta branch existente para receber as atualizações. Novos pushes nesta branch atualizam somente o projeto vinculado a ela.

### Registro privado da carteirinha

O site novo inicia com o armazenamento privado vazio. A função `issuer-admin` exige uma chave aleatória de 256 bits para cadastrar ou atualizar registros. Apenas seu digest SHA-256 está no código servidor (`src/server-trust.js`); a chave e os registros ficam em `private/`, fora do Git e dos arquivos públicos. Não existe interface pública de administração nem listagem de alunos. A chave não representa autenticação da conta Netlify e a função não encaminha solicitações à API de contas.

Após o usuário informar a URL principal do NOVO projeto, o responsável pelo desenvolvimento deve executar localmente:

```text
node scripts/activate-credential.mjs https://NOME-REAL-DO-PROJETO.netlify.app
npm run card
```

O primeiro comando publica o registro autorizado no armazenamento privado da JCB e exige confirmação pela consulta pública antes de registrar `verified: true`. Ele recusa o domínio antigo do emulador. O segundo gera a carteirinha e o QR definitivos. Não publicar nem imprimir como final antes de testar a consulta e ler o QR com decodificador independente.

### Desenvolvimento em uma cópia limpa

O build e os testes não exigem arquivos de `private/`. O adaptador de API local lê esses arquivos somente quando é iniciado o servidor de desenvolvimento/preview. A produção consulta os registros no armazenamento privado do novo projeto Netlify. Não criar registros fictícios para fazer uma consulta parecer válida.

Nenhum novo domínio é considerado criado até a confirmação real da plataforma. Persistência de contatos, funções e QR ainda devem ser verificados na hospedagem após a vinculação inicial.
