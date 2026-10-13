# Publicação automática no Netlify

O código e as atualizações ficam em `Moosevlr/Moose`, branch `digital-station-upgrades`. O Netlify deve ser conectado diretamente a esse repositório existente. A partir daí, novos commits nessa branch iniciam a instalação, os testes, a compilação e a publicação. Uma falha impede a publicação da nova versão.

## Conexão inicial, uma única vez

1. Abra https://app.netlify.com/start e entre na sua conta Netlify. Se precisar criar uma conta, pode usar a opção de cadastro com GitHub.
2. Escolha importar um projeto existente a partir do GitHub. Autorize o acesso ao repositório `Moosevlr/Moose` e selecione-o.
3. Use `digital-station-upgrades` como branch de produção. Não crie uma cópia do repositório a partir de um template: este chat continuará enviando alterações ao repositório existente.
4. Mantenha o diretório base na raiz do repositório. As configurações de `netlify.toml` são:

   - Comando de build: `npm ci --include=dev --no-audit --no-fund && npm test && npm run build`.
   - Diretório publicado: `dist`.
   - Node.js: `24`.

5. Inicie a publicação e aguarde o primeiro build terminar. O Netlify fornecerá a URL do site, terminada em `.netlify.app`; nenhuma URL foi reservada ou criada por este repositório.
6. Use a URL principal do projeto como endereço permanente. Pode ajustar o nome do site antes de começar a usar seus SAVEs, se o nome escolhido estiver disponível.

A conexão inicial exige autorização da sua conta Netlify/GitHub no navegador. Este ambiente não possui uma sessão Netlify ou token de implantação. Não é preciso entregar tokens a este chat para usar a integração Git do Netlify.

## Trabalho contínuo neste chat

1. Solicite a melhoria neste chat.
2. O Codex altera os arquivos do checkout existente, executa os checks relevantes e envia o commit para `digital-station-upgrades`.
3. O Netlify detecta o commit e executa o comando configurado. A URL principal passa a servir a versão nova depois que a publicação terminar.

Não é necessário transferir ZIPs ou voltar ao chat original do Sites. Esta automatização só começa depois de conectar o repositório ao projeto Netlify. O endereço antigo no Sites continua sendo uma publicação separada.

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

## Transferir o progresso do Sites

O backup é restrito ao navegador e à origem. Para levar progresso do endereço antigo para o novo, baixe o `.dssave` no Digital Station antigo e importe-o na nova URL antes de iniciar o jogo. Nas próximas atualizações, mantenha a URL principal do Netlify; URLs de preview e outros domínios usam armazenamentos separados.
