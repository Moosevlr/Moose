# Publicação automática no Netlify

O código e as atualizações ficam em `Moosevlr/Moose`, branch `digital-station-upgrades`. O usuário conectou o site existente a esse repositório pelo Netlify. Com essa branch de produção, novos commits iniciam a instalação, os testes, a compilação e a publicação. Uma falha impede a publicação da nova versão.

## Endereço principal

Use https://starlit-khapse-197f07.netlify.app/ como endereço permanente. A página e os arquivos do emulador responderam com 200 e os arquivos publicados foram comparados com a compilação local. Os cabeçalhos COOP/COEP/CORP e o MIME de WebAssembly foram confirmados nas respostas reais.

URLs com um identificador antes de `--starlit-khapse-197f07.netlify.app` pertencem a um deploy específico. Use a URL principal para acompanhar novas versões e manter o mesmo armazenamento local de SAVE.

## Configuração do site existente

1. Abra https://app.netlify.com/ e selecione o site existente `starlit-khapse-197f07`.
2. Confira a conexão Git desse site com `Moosevlr/Moose`. Se precisar refazer a conexão, autorize esse repositório nas configurações de implantação do próprio site.
3. Use `digital-station-upgrades` como branch de produção. Este chat continuará enviando alterações ao repositório existente.
4. Mantenha o diretório base na raiz do repositório. As configurações de `netlify.toml` são:

   - Comando de build: `npm ci --include=dev --no-audit --no-fund && npm test && npm run build`.
   - Diretório publicado: `dist`.
   - Node.js: `24`.

5. Mantenha a publicação automática por Git ativa. Depois de um novo commit nessa branch, confira a execução do build e o commit em `/build-info.json` na URL principal.
6. Preserve o site e a URL principal para manter o armazenamento local de SAVE na mesma origem.

A conexão Git exige autorização da sua conta Netlify/GitHub no navegador e já foi feita pelo usuário. Este ambiente não possui uma sessão Netlify ou token de implantação. Não é preciso entregar tokens a este chat para usar a integração Git do Netlify.

## Trabalho contínuo neste chat

1. Solicite a melhoria neste chat.
2. O Codex altera os arquivos do checkout existente, executa os checks relevantes e envia o commit para `digital-station-upgrades`.
3. O Netlify detecta o commit e executa o comando configurado. A URL principal passa a servir a versão nova depois que a publicação terminar.

Não é necessário transferir ZIPs ou voltar ao chat original do Sites. Esta automatização só começa depois de conectar o repositório ao projeto Netlify. O endereço antigo no Sites continua sendo uma publicação separada.

Cada build produz `/build-info.json` com a versão da aplicação e o commit usado na compilação. O Netlify fornece `COMMIT_REF`; builds locais consultam o HEAD do Git. Esse arquivo público não contém credenciais ou arquivos do usuário e permite comparar a versão publicada com a branch, mesmo quando não há status de deploy no GitHub. Uma versão sem informação Git usa `commit: null` e não deve ser descrita como publicação verificada de um commit.

## Requisitos do emulador

- Publique na raiz de uma URL HTTPS, não em um subdiretório. O núcleo é carregado em `/core/`.
- `public/_headers` é copiado para `dist/_headers` e é a única definição dos cabeçalhos de resposta. Ele mantém COOP/COEP/CORP para memória compartilhada e os tipos MIME necessários para WebAssembly e módulos JavaScript.
- Os arquivos do núcleo usam revalidação de cache para manter JavaScript e WebAssembly atualizados em publicações futuras.
- Não foi adicionado fallback genérico de SPA: a aplicação usa somente `/`, e um arquivo do núcleo ausente deve continuar respondendo com erro.
- Não adicione uma política CSP restritiva sem verificar as necessidades de workers `blob:`, WebAssembly e geração de funções das bindings do núcleo.

## Verificação do primeiro site publicado

Depois que houver uma URL real, confirme:

1. A página, `/core/Play.wasm`, `/core/Play.js`, `/core/Play-loader.mjs` e `/core/License.txt` respondem corretamente.
2. Os cabeçalhos de isolamento estão presentes e `Play.wasm` tem MIME `application/wasm`.
3. Em uma aba normal, a verificação do emulador sem ISO chega a `ready` e o diagnóstico mostra `Console preparado`.
4. Um SAVE sintético pode ser importado, guardado como backup, recuperado após reload e exportado sem alterar os bytes.

Os checks locais comprovam a preparação do código. Eles não comprovam a criação de uma conta, conexão Git, execução de um build remoto ou publicação no Netlify. Registre o resultado remoto quando essas etapas forem concluídas.

Em 13/10/2026, a URL principal passou em 10 verificações desktop e 10 mobile. O núcleo real chegou a `ready` sem ISO; um SAVE sintético manteve os dados em importação, exportação, backup, reload e recuperação. Não houve erro de página ou falha de requisição dos recursos da aplicação. Sete arquivos publicados foram comparados byte a byte com a distribuição local. O resumo está em `docs/netlify-validation.json`.

O Chromium deste ambiente não reconheceu a autoridade do certificado HTTPS do proxy. Os testes funcionais usaram os bytes e cabeçalhos públicos obtidos por `curl` com TLS verificado, entregues ao navegador na origem original. Nenhuma verificação TLS foi desativada. Isso comprova o funcionamento com os arquivos publicados, mas não o transporte HTTPS nativo do Chromium deste ambiente. Não foram testados ROMs ou gamepads físicos.

## Transferir o progresso do Sites

O backup é restrito ao navegador e à origem. Para levar progresso do endereço antigo para o novo, baixe o `.dssave` no Digital Station antigo e importe-o na nova URL antes de iniciar o jogo. Nas próximas atualizações, mantenha a URL principal do Netlify; URLs de preview e outros domínios usam armazenamentos separados.
