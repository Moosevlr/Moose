# Gráficos e análise opcional do dispositivo · versão 1.3

O painel **Gráficos e desempenho**, abaixo da sessão, oferece resolução interna 1×/2×, filtragem de texturas do jogo ou bilinear forçada, exibição adaptada/compacta, ampliação suave/com pixels definidos e visibilidade do contador de FPS. Os controles têm rótulos, recomendações e layout para computador e celular.

## Ajustes do núcleo

A resolução interna e o filtro são preferências reais do Play! original, aplicadas antes de `initVm`. A configuração inicial usa:

```xml
<Config>
  <Preference Name="renderer.opengl.resfactor" Type="integer" Value="1"/>
  <Preference Name="renderer.opengl.forcebilineartextures" Type="boolean" Value="false"/>
  <Preference Name="ps2.limitframerate" Type="boolean" Value="true"/>
</Config>
```

O arquivo fica em `/home/web_user/.local/share/Play Data Files/config.xml`, no filesystem virtual do módulo. O adapter não sobrescreve uma configuração diferente já existente. O núcleo e sua licença permanecem byte a byte iguais aos arquivos recuperados.

As fontes oficiais [AppConfig.cpp](https://github.com/jpd002/Play-/blob/83700b2c/Source/app_shared/AppConfig.cpp), [DefaultAppConfig.h](https://github.com/jpd002/Play-/blob/83700b2c/Source/app_shared/DefaultAppConfig.h) e [Framework Config.cpp](https://github.com/jpd002/Play--Framework/blob/587f278917acc0026bf5fc34b39f995fc26bd015/src/Config.cpp) estabelecem caminho, formato e leitura na construção do singleton. O uso das preferências está em [GSH_OpenGL.cpp](https://github.com/jpd002/Play-/blob/83700b2c/Source/gs/GSH_OpenGL/GSH_OpenGL.cpp).

Uma prova no núcleo real confirmou os registros nativos com resolução 2, bilinear habilitado e limitador habilitado quando o adapter foi chamado antes de `initVm`. Escrever o arquivo após a preparação não muda as preferências já carregadas. Por isso, o painel distingue a configuração em uso dos ajustes escolhidos para uma nova sessão. O botão de recarga é explícito e preserva o aviso existente de SAVE sem cópia portátil; não há recarga automática.

1× é o ponto de partida recomendado. 2× aumenta cada dimensão dos buffers internos, aproximadamente quatro vezes os pixels. A apresentação final deste build continua em 640×480; não é um seletor de saída HD. Bilinear desligado respeita os filtros do jogo; não impõe nearest a todas as texturas. O limitador nativo permanece habilitado para acompanhar a taxa original do jogo.

As opções de apresentação funcionam durante a sessão por CSS. Elas não recriam o canvas, alteram seus atributos de tamanho ou reiniciam a VM. Esconder o FPS não interrompe a leitura dos contadores, que também identifica o início do jogo.

## Consulta local, mediante clique

**Analisar meu dispositivo** é uma autorização dentro do próprio site para consultar APIs do navegador. Não existe uma permissão web que entregue uma ficha completa do computador ou celular. O painel mostra os dados disponíveis, informa suas limitações e deixa os ajustes manuais acessíveis.

São consultados processadores lógicos disponíveis, memória aproximada quando exposta, WebGL2 e limites gráficos, área da aba, escala da tela e recursos necessários à execução. A análise usa um canvas descartável, libera seu contexto e nunca consulta ou destrói o contexto do jogo. Não solicita identificadores detalhados de GPU, Client Hints de alta entropia, arquivos, sensores ou credenciais.

O resultado fica apenas no estado da aba. **Descartar análise** o remove; reload também o remove. Nenhum resultado é persistido ou transmitido. Somente os seis campos de preferências gráficas são guardados na chave `digital-station-graphics-v1`. Resetar os gráficos remove apenas essa chave; os controles e os backups de SAVE ficam preservados. Quando o armazenamento é bloqueado, o painel continua funcionando na sessão e informa que as escolhas são temporárias.

As sugestões sempre começam em 1× e filtro do jogo. Uma indicação aproximada de poucos recursos sugere também exibição compacta. Dados ausentes não são tratados como máquina fraca; toque e tamanho da tela não determinam potência. A análise não mede a velocidade da GPU, não estima FPS e não ativa 2× automaticamente. **Aplicar sugestão** é uma ação separada da análise.

## Validação

- 65 testes de Node passaram, incluindo preferências, armazenamento bloqueado, normalização, adapter nativo, detecção parcial e recomendações.
- 17 verificações do painel passaram em desktop, viewport mobile e cenário com armazenamento/dados do dispositivo bloqueados. Cobriram consentimento, ausência de requests de análise, persistência, descarte, reset isolado, identidade e dimensões do canvas, configuração 2×/bilinear antes da preparação e aviso de mudança pendente.
- 20 verificações funcionais do build passaram, incluindo núcleo real sem ISO, importação/exportação de SAVE, backup, reload, recuperação e integridade de bytes/checksum.
- Capturas de desktop e mobile foram inspecionadas visualmente, sem overflow horizontal.

O resumo está em `docs/graphics-validation.json`. As estimativas de CPU/RAM usadas nos testes do painel são fixtures para verificar recomendações; não são inventário de aparelhos reais. Não foram testadas ROMs, qualidade visual de títulos específicos, FPS em gameplay ou hardware físico de baixo desempenho.
