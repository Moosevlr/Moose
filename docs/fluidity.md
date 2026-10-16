# Fluidez do Digital Station

O objetivo desta atualização é reduzir pausas que atrapalham a apresentação e a alimentação de áudio durante o jogo. A taxa numérica de FPS continua sendo a contagem real do núcleo, sem arredondamento para uma meta fixa.

## Sincronismo disponível

O núcleo publicado é Play! `0.77-12-g83700b2c`. As fontes públicas desse commit mostram que o limitador nativo já inicia habilitado e acompanha a taxa CRT do jogo. A resolução interna padrão é 1× e a apresentação da interface é 640×480. Esses padrões foram preservados.

- [Bindings de ui_js/Main.cpp](https://github.com/jpd002/Play-/blob/83700b2c/Source/ui_js/Main.cpp): `bootElf`, `bootDiscImage`, `getFrames` e `clearStats`.
- [PS2VM.cpp](https://github.com/jpd002/Play-/blob/83700b2c/Source/PS2VM.cpp): `ps2.limitframerate`, `ReloadFrameRateLimit`, `GetCrtFrameRate` e execução na `EmuThread`.
- [FrameLimiter.cpp](https://github.com/jpd002/Play-/blob/83700b2c/Source/FrameLimiter.cpp): limite nativo por VBlank, com média de quatro tempos.
- [GSH_OpenGL.cpp](https://github.com/jpd002/Play-/blob/83700b2c/Source/gs/GSH_OpenGL/GSH_OpenGL.cpp): resolução interna padrão.

Não há bindings para ajustar o limite, frameskip, resolução ou pausa da VM neste build. O `requestAnimationFrame` da interface consulta os controles e atualiza o indicador de FPS; ele não governa a emulação. As funções genéricas `pauseMainLoop` e `resumeMainLoop` do Emscripten também não são uma API de pausa da VM. Limitar esses callbacks pela interface não implementaria um limite seguro de 30 FPS para o jogo.

Na versão 1.3 foi validada uma alternativa para resolução e filtragem: um arquivo de preferências no filesystem virtual antes de `initVm`. Esses ajustes agora estão no painel; consulte `docs/graphics.md`. O sincronismo nativo permanece habilitado.

## Trabalho retirado da thread principal

Antes, cada backup capturava o cartão duas vezes e fazia base64, serialização JSON, checksum, parsing e decodificação na thread principal. Essas operações podiam ocupar a thread que também atende WebGL, Web Audio e controles, mesmo com o núcleo em outro processo.

A versão 1.2 usa um Worker dedicado e reutilizado para codificar, verificar e decodificar SAVE. O backup captura os arquivos uma vez; a verificação para o armazenamento devolve somente a confirmação, sem reconstruir um cartão na interface. A cópia capturada é independente dos dados ativos. O formato `.dssave` v1, os limites e o SHA-256 continuam compatíveis.

Atualizações visuais de SAVE são agrupadas em um callback por quadro do navegador. Fechar arquivos somente para leitura deixa de solicitar atualizações de backup. O diagnóstico fechado recebe seu texto atualizado ao ser aberto ou copiado, em vez de reconstruir o relatório em cada linha de log. Ao voltar para a aba, a janela do contador de FPS é reiniciada para que o tempo em segundo plano não contamine a próxima leitura.

A confirmação de backup continua dependendo do commit da transação IndexedDB. Falhas de validação ou armazenamento preservam o backup anterior, e a confirmação de download continua explícita. Em navegadores sem Worker disponível, o codec mantém o caminho compatível na thread principal; a redução de pausas depende da execução do Worker.

## Resultados medidos

Em 16/10/2026, os 40 testes de Node e as 20 verificações funcionais do build compilado passaram. Desktop e viewport mobile prepararam o núcleo real sem ISO, importaram e exportaram SAVE, confirmaram o backup, recuperaram o cartão após reload e preservaram os bytes ao anexá-lo ao núcleo. O Worker real executou `encode`, `decode` e `validate`, sem erros inesperados.

O benchmark comparou a versão anterior (`3d26142`) com os módulos novos, usando o filesystem real do núcleo ocioso e um arquivo sintético por cartão. Foram três repetições por tamanho em Chromium 154, com os mesmos cabeçalhos de isolamento. Não havia outro teste de navegador concorrente durante as janelas medidas. O cenário anterior incluiu a captura preliminar duplicada que o backup executava.

| SAVE sintético | Maior intervalo de RAF antes, por repetição | Maior intervalo de RAF depois | Tempo total do backup antes | Tempo total depois |
| --- | --- | --- | --- | --- |
| 8 MiB | 600–667 ms | 16,7 ms | 988–1.047 ms | 176–181 ms |
| 16 MiB | 1.233–1.267 ms | 16,7 ms | 1.932–1.956 ms | 329–369 ms |

A versão anterior produziu duas tarefas longas por backup. Nenhuma tarefa longa foi registrada nas seis repetições da versão nova. Os controles sem backup das duas versões também ficaram em 16,7 ms de maior intervalo. Um readback do IndexedDB de 16 MiB preservou SHA-256 e formato v1, com os buffers ativos do filesystem intactos. Os caminhos sem Worker e com falha ao criar o Worker também passaram no roundtrip e na validação.

Os dados completos, hashes dos módulos medidos, avisos do harness e verificações funcionais estão em `docs/fluidity-validation.json`. O harness registrou um favicon ausente e um aviso de driver WebGL; não ocorreram erros de página durante o benchmark. A aplicação compilada não apresentou falhas de requisição ou erros inesperados nas verificações funcionais.

## Limites da verificação

Medições de `requestAnimationFrame` e tarefas longas descrevem a disponibilidade da thread da interface. `getFrames` conta eventos GS e não fornece os instantes de apresentação dos quadros do jogo. As duas medições não são intercambiáveis.

Os testes usam cartões sintéticos e inicialização real do núcleo sem ISO. Não foram fornecidos jogos, progresso real de jogo ou gamepad físico. A estabilidade durante gameplay ainda depende do título, do dispositivo e da compatibilidade do núcleo; esta atualização não estabelece uma taxa fixa garantida para todos os jogos.
