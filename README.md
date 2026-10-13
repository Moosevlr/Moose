# Digital Station

Versão de desenvolvimento recuperada da publicação de Digital Station e atualizada neste ambiente. A interface original, seus controles e o núcleo Play! foram preservados. O núcleo não foi recompilado ou atualizado.

O código-fonte original do projeto Sites não estava disponível. `src/DigitalStation.jsx` foi recuperado do módulo JavaScript público e adaptado para uma aplicação React/Vite reproduzível. Esta pasta é uma cópia local; alterações nela não modificam automaticamente a publicação no Sites.

## Desenvolvimento

Requer Node.js 22.12 ou superior; este ambiente usa Node.js 24. Use o checkout existente em `/workspace/Moose`. As tarefas de nuvem já são isoladas; não crie worktrees sem solicitação explícita.

```sh
cd /workspace/Moose
npm ci --no-audit --no-fund
npm run dev -- --port 5173 --strictPort
```

O servidor disponibiliza os cabeçalhos de isolamento necessários ao núcleo. Os processos precisam ser iniciados novamente em uma nova tarefa; arquivos instalados e processos em execução são estados diferentes.

Fora deste ambiente, execute os mesmos comandos na pasta em que extrair o pacote, adaptando apenas o diretório inicial.

Para validar e construir:

```sh
npm test
npm run build
npm run preview -- --port 4173 --strictPort
```

## Melhorias

- Backup automático dos cartões no IndexedDB, confirmado somente após a transação completar. Recuperação explícita antes de iniciar o jogo e opção de exclusão do backup.
- O backup guarda somente o SAVE, nunca a ISO. A gravação é adiada enquanto o cartão estiver aberto para escrita. O último backup válido é preservado em erros de quota, validação ou transação.
- Download de SAVE exige confirmação explícita do usuário para retirar o aviso de progresso sem cópia portátil. Iniciar um download não comprova que o arquivo foi guardado.
- Leituras fora do disco, fora da memória ou incompletas produzem erros em vez de reutilizar bytes de uma leitura anterior. Cache e invalidação de leituras antigas continuam ativos.
- Detecção de criação de arquivos vazios e de truncamento nos cartões corrigida. Saves grandes válidos não causam mais estouro de pilha na validação de base64.
- Diagnóstico acompanha o estado atual, incluindo erros que ocorrem após o timeout de início. Requisitos do navegador e progresso de download do núcleo aparecem na interface.
- A ação Nova aba permanece visível em telas pequenas.

O formato `.dssave` v1 e seu checksum SHA-256 continuam compatíveis com a publicação original.

## Backup e privacidade

O backup fica neste navegador e nesta origem. Limpar os dados do navegador remove a cópia. O backup da versão publicada e o de uma execução local são independentes; use `.dssave` para transferir progresso entre origens ou dispositivos.

Uma confirmação de backup significa que aquela captura foi gravada no IndexedDB. Uma interrupção antes da próxima confirmação pode perder as últimas alterações. Continue baixando o SAVE para ter uma cópia portátil. Nenhuma ISO, SAVE ou diagnóstico é enviado a um servidor por estas melhorias.

## Aplicar ao Sites

Importe este projeto na sessão do Sites que oferece edição ou adapte os módulos e a integração de `src/DigitalStation.jsx` à fonte original. Publique os arquivos gerados em `dist/` e mantenha os arquivos `core/` e a licença juntos.

A hospedagem precisa usar HTTPS e enviar:

```text
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Resource-Policy: same-origin
```

`public/_headers` é incluído na distribuição para hosts que suportam esse formato. Em outros hosts, configure os cabeçalhos de resposta pelo mecanismo da plataforma. Sem eles, memória compartilhada e emulação podem não funcionar. O servidor deve servir `core/Play.wasm` como `application/wasm` e os módulos JavaScript com MIME de JavaScript.

A edição e a publicação do projeto original no Sites não foram executadas por este ambiente, que não expõe essa integração.

## Evidências e limitações

Veja `docs/review.md` para a revisão e os resultados de validação. `docs/recovered-assets.json` registra a origem e os hashes dos arquivos do núcleo recuperados sem alteração. A licença de Play! está em `public/core/License.txt`.

Não foram fornecidos jogos. Testes de disco e SAVE usam dados sintéticos; preparar o núcleo sem ISO não comprova a compatibilidade de um jogo. Gamepad físico e desempenho com jogos reais precisam ser avaliados com arquivos e dispositivos do usuário.
