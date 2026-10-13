# Revisão do Digital Station

Fonte: https://digital-station.moose-zx.chatgpt.site/

## Revisão da versão publicada

O acesso passou por dois bloqueios diagnosticados: domínio ausente da lista de rede (403 do proxy) e acesso exigindo login (401 do Sites). Após as alterações de acesso, o site e seus arquivos públicos responderam com 200.

O bootstrap de Play! foi concluído sem ISO: WebAssembly, workers, memória compartilhada e preparação do console. A validação inicial executou 9 verificações desktop e 8 mobile; todas passaram. Incluiu rejeição de arquivos inválidos, troca de vínculos de controle, persistência de preferências e layout.

O Chromium deste ambiente não reconhece o certificado do proxy no banco NSS externo ao workspace. Na validação publicada, as respostas foram obtidas por curl com TLS verificado e entregues ao navegador por interceptação Playwright. Isso valida a lógica da aplicação com seus bytes reais, mas não confirma o transporte HTTPS nativo do Chromium. Nenhuma verificação TLS foi desativada.

## Problemas corrigidos

1. Leituras que excediam o fim do disco eram concluídas parcialmente, deixando bytes antigos no heap. Reprodução com Blob sintético confirmou o problema; limites do arquivo e da memória passaram a ser verificados.
2. Cartões só permaneciam na memória até exportação manual. Foi adicionado backup local validado e atômico, com recuperação explícita.
3. O watcher verificava flags removidas por `FS.open`; criação de arquivo vazio não marcava o cartão como alterado. O novo watcher observa `mknod` e os argumentos originais, evitando duplicação de eventos aninhados.
4. Uma expressão de validação de base64 estourava a pilha em SAVE válido grande. A validação equivalente agora suporta os limites originais.
5. O diagnóstico mantinha `loading` quando o console já estava `ready`; a atualização passou a ocorrer após a transição. O estado `stalled` também recebe erros do núcleo.
6. O início de um download era tratado como confirmação de SAVE guardado. Agora o usuário confirma a cópia explicitamente, preservando avisos até então.

## Validação automatizada

`npm test`: 28 testes executados e aprovados, sem falhas ou skips. Cobrem leituras EOF/limites/cache/memória crescente, alterações de cartão, rollback, corrupção, SAVE grande, download WebAssembly, backup/reabertura e falhas de quota/transação.

`npm run build`: aprovado. Os avisos de diretiva `use client` de lucide-react são referentes ao uso em uma aplicação somente cliente e não impedem a compilação.

Testes de navegador na cópia local: 10 verificações desktop e 10 mobile passaram. Na distribuição compilada, 8 verificações passaram; a limpeza de um backup corrompido também foi validada. Nenhum erro de página ou falha de requisição ocorreu. Erros de arquivo inválido foram provocados intencionalmente e receberam a mensagem esperada.

O núcleo real foi preparado sem ISO nas três variantes. Um SAVE sintético válido manteve bytes idênticos em importação/exportação e após reload, recuperação do IndexedDB e anexação ao núcleo. Exclusão de backup exigiu confirmação, preservou o SAVE ativo e continuou excluída após outra recarga. A confirmação de download apareceu somente após o download e exigiu clique explícito.

A instalação foi repetida com `npm ci` e a distribuição foi recompilada. Os servidores de desenvolvimento e produção foram reiniciados; a preparação real do núcleo e o diagnóstico `ready` passaram novamente em ambos. Essas verificações locais usaram navegação HTTP nativa para loopback, sem desativar TLS ou usar autenticação.

O resumo está em `docs/validation.json`; as capturas desktop e mobile estão nesta pasta. O núcleo e a licença foram comparados byte a byte com os arquivos publicados.

## Limites

Nenhuma ISO comercial, progresso real de jogo, gamepad físico ou compatibilidade de títulos foi testada. A validação não equivale a garantir que todos os jogos PS2 funcionem. O núcleo Play! original foi mantido byte a byte. A versão original no Sites continua separada desta cópia local.
