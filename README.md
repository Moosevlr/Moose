# JCB ENGENHARIA · Ensino Técnico

Site institucional independente do Digital Station. Informações fornecidas pelo responsável: José Cleber Beckman Cordeiro, Belém–PA, `jbeckmancordeiro@gmail.com`, CNPJ `35.677.653/0001-94`. O catálogo reúne sete propostas de cursos livres online; turmas, datas, carga horária e valores são confirmados pela instituição. Não se declara credenciamento de curso técnico regulamentado ou emissão pela UNE.

## Hospedagem e estado atual

O usuário informou o site **https://jcb-engenharia.netlify.app/**. A vinculação inicial não precisa ser repetida. As atualizações deste projeto seguem a branch exclusiva `jcb-engenharia-site` do repositório `Moosevlr/Moose`, mantendo a produção do emulador separada. `netlify.toml` define Node 24, testes, build, Functions e publicação de `dist/`.

O executor encontrou bloqueios de DNS/CONNECT 403 ao acessar a produção. Por isso, a resposta HTTP da hospedagem, o commit implantado, a persistência real do registro, uma submissão hospedada e a entrega de e-mail continuam **sem confirmação remota por este executor**. A URL informada pelo usuário não equivale a uma nova verificação HTTP.

## Contato: Netlify Forms

O formulário atual usa **Netlify Forms**, com `POST /`, dados `application/x-www-form-urlencoded`, `form-name=interesse` e um formulário estático de detecção no HTML de build. O consentimento e as validações permanecem no fluxo de envio.

As notificações por e-mail dependem das configurações existentes no painel Netlify Forms e do provedor. A entrega na caixa de entrada não foi comprovada. Um teste local ou uma resposta HTTP, isoladamente, não comprova entrega de e-mail.

`POST /api/contato` permanece como API legada, com validação e armazenamento privado em Blobs (`jcb-interesses`), mas **não é utilizado pela interface atual**. Seus testes não comprovam funcionamento das notificações do Netlify Forms. O Vite local também não reproduz o serviço hospedado de Forms.

## Registros e validação da carteirinha

`GET /.netlify/functions/verify?token=<token>` consulta o armazenamento privado Netlify Blobs `jcb-credentials`, por projeto. A chave de consulta é o SHA-256 de um código opaco de 256 bits. A leitura forte evita usar um estado anterior após uma revogação; o token é conferido com comparação segura antes da resposta pública. Visitantes não podem cadastrar, atualizar ou listar registros.

A situação usa o relógio do servidor e o calendário `America/Sao_Paulo`: `active`, `expired`, `revoked`, `pending` ou `invalid`. A data final é inclusiva. Para validade até 31/03/2027, a expiração começa em 01/04/2027 às 00h em São Paulo, correspondente a 03h UTC. Revogação prevalece sobre expiração; pendência não se transforma em confirmação pela passagem do tempo.

O código público contém somente digests e metadados de confiança. Registro do aluno, foto, código de consulta, chave mestre e capability privada ficam fora do Git, de `dist/` e dos arquivos públicos. O backend não usa um registro incorporado ao bundle para fazer uma consulta parecer válida.

## Ativação reservada ao responsável

A API `issuer-admin` mantém a autenticação pela chave mestre privada para operações autorizadas. A ativação assistida usa uma capability separada, limitada ao **snapshot exato autorizado**, com janela configurada de sete dias. `src/setup-trust.js` contém somente os digests e o prazo; não contém a chave em texto puro.

O bootstrap reservado remove o fragmento antes de carregar o módulo externo com SRI e CSP estrita. A capability não fornece poderes de administração geral. O servidor confere o fingerprint completo, a expiração antes de ler o corpo e novamente antes de iniciar a gravação, inclusive após inicialização lenta do storage.

A criação usa `onlyIfNew: true`: um registro existente, inclusive revogado, produz conflito `409` e não é sobrescrito pela capability. Após o conflito, o fluxo consulta o registro existente. **Uma resposta `201` ou `409` não libera a carteirinha sozinha:** é necessário um GET posterior com `active` e correspondência integral dos dados públicos autorizados. Estados pendente, expirado, revogado, divergente ou indisponível não liberam um documento final como válido.

Até essa prova remota, a primeira ativação e a emissão final permanecem sem confirmação. Não divulgar o link reservado, a capability ou a chave mestre. Não existe consulta pública de listas de alunos.

## Desenvolvimento e validação local

Requer Node.js 24. Use este diretório existente, sem worktrees nem alterações no projeto Moose.

```sh
npm ci --include=dev --no-audit --no-fund
npm test
npm run build
npm run dev -- --port 4280 --strictPort
```

Em execução cloud, pode-se acrescentar `--cache /workspace/scratch/npm-cache` à instalação. Build e testes funcionam sem `private/`; o adaptador local lê um eventual registro privado somente ao iniciar desenvolvimento/preview. Dados sintéticos dos testes não são registros reais da instituição.

Estado verificado em 16/11/2026:

- **72/72 testes Node aprovados**, incluindo QR decodificado independentemente, corte de validade, leitura forte, múltiplos IDs independentes, revogação, impedimento de escrita por visitante, setup condicional e expiração após storage lento.
- Exportação limpa sem `private/`: **72/72 testes e build aprovados**. A inspeção dos 40 arquivos exportados não encontrou os valores reais do QR/token, das chaves, do hash do token ou da matrícula.
- QA local do emissor: **21/21 verificações aprovadas** para CSP/SRI, remoção do fragmento, rejeição de divergências, fluxo desktop `201` e mobile `409`, QR e impressão. Essas respostas de teste não comprovam gravação no Blobs de produção.
- QA atual de navegação, layout e formulário: **21 rotas e 26 interações aprovadas**, em 1440/350/390 px. Foram interceptados nove POSTs com respostas 503/422/200, sem mensagem real enviada; zero erros de página, falhas de requests ou recursos externos. Blueprint de Forms, pré-seleção do curso, bloqueio do honeypot e prevenção de envio duplicado foram conferidos. As contagens antigas não são reutilizadas.
- E-mail e persistência hospedada: **pendentes de confirmação remota**.

Escopos e evidências estão em `docs/validation.json`.

## Carteirinha privada e impressão

Na cópia do responsável com os arquivos privados necessários:

```sh
npm run card -- --draft
```

A prévia tem 85,6 × 54 mm, validade 31/03/2027 e não possui QR definitivo. A fotografia original é selecionada localmente, com aparência preservada e sem upload. A QA local confirmou preservação dos bytes da foto e PDF de uma página no tamanho da carteirinha.

O comando final `npm run card` exige `private/publication.json` com publicação real verificada. O documento e o QR definitivos só devem ser liberados após a consulta real corresponder ao registro autorizado. Use a URL principal estável da JCB, não um permalink temporário.

Os arquivos privados de impressão e QR ficam em `private/`. Não publique a carteirinha, a fotografia ou o pacote reservado junto com o site institucional. O QR aponta para a consulta por código opaco, sem PII na URL.

## Correção da consulta em Functions v2 — 16/11/2026

O runtime pode preservar a URL original de uma regra de redirecionamento. A versão anterior lia o código somente na query, e a URL amigável `/api/verificar/<token>` retornava 404 antes de consultar o banco quando não havia query injetada. A reprodução local confirmou esse caso; o formato exato recebido pela hospedagem ainda não foi observado pelo executor.

A função agora aceita o código tanto no caminho original quanto na query da função, rejeitando códigos repetidos, malformados ou conflitantes antes de consultar o armazenamento. A interface pública e a página reservada usam a função direta na mesma origem. O adaptador local preserva a URL original, sem fabricar a query. Foram acrescentadas regressões dos formatos de URL e uma conferência do resultado no navegador em 390 e 1440 px.

A página reservada informa o HTTP e um diagnóstico limitado em caso de falha; não mostra corpo da resposta, dados privados, chave ou código de consulta. A liberação do cartão continua exigindo um registro ativo e a correspondência de todos os campos aprovados.
