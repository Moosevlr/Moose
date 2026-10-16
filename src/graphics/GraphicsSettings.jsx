import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { MonitorCog, ScanLine } from 'lucide-react';
import { graphicsPreferences } from './graphics-preferences.js';
import { analyzeDevice, recommendGraphics } from './device-analysis.js';

const number = (value) => value === null ? 'Não informado' : value.toLocaleString('pt-BR');
const filterLabel = (enabled) => enabled ? 'bilinear forçado' : 'filtro do jogo';

export default function GraphicsSettings() {
  const { preferences, applied, storageError } = useSyncExternalStore(
    graphicsPreferences.subscribe, graphicsPreferences.getSnapshot,
  );
  const [analysis, setAnalysis] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState(false);
  const analysisRequest = useRef(0);
  const recommendation = analysis ? recommendGraphics(analysis) : null;
  const pending = applied && (applied.resolutionScale !== preferences.resolutionScale ||
    applied.bilinearFiltering !== preferences.bilinearFiltering);

  useEffect(() => {
    const app = document.querySelector('.app-shell');
    if (!app) return;
    // Presentation changes never resize the WebGL drawing buffer or remount
    // the emulator. Native resolution/filter changes are applied before initVm.
    app.dataset.graphicsSize = preferences.displaySize;
    app.dataset.graphicsScaling = preferences.scaling;
    app.dataset.graphicsFps = String(preferences.showFps);
  }, [preferences.displaySize, preferences.scaling, preferences.showFps]);

  useEffect(() => () => { analysisRequest.current += 1; }, []);

  async function inspectDevice() {
    const request = ++analysisRequest.current;
    setAnalyzing(true);
    setAnalysisError(false);
    // Let the busy state paint before a small, disposable WebGL capability
    // probe. This is not a stress test and does not inspect the game's canvas.
    await new Promise(resolve => setTimeout(resolve, 0));
    if (request !== analysisRequest.current) return;
    try {
      const result = analyzeDevice();
      if (request === analysisRequest.current) setAnalysis(result);
    } catch {
      if (request === analysisRequest.current) setAnalysisError(true);
    } finally {
      if (request === analysisRequest.current) setAnalyzing(false);
    }
  }

  function discardAnalysis() {
    analysisRequest.current += 1;
    setAnalysis(null);
    setAnalyzing(false);
    setAnalysisError(false);
  }

  function applyRecommendation() {
    if (!recommendation) return;
    graphicsPreferences.update({
      resolutionScale: 1,
      bilinearFiltering: false,
      displaySize: recommendation.profile === 'economy' ? 'compact' : 'fit',
    });
  }

  return <details className="graphics-panel controls-panel" id="graphics-settings" open>
    <summary>
      <span><MonitorCog size={19} aria-hidden="true" /> Gráficos e desempenho</span>
      <span className="summary-toggle" aria-hidden="true">⌄</span>
    </summary>
    <div className="graphics-content">
      <p className="graphics-intro">Comece em resolução nativa para priorizar fluidez. Aumente um ajuste de cada vez e observe a imagem e o áudio no seu jogo.</p>

      <fieldset className="graphics-fieldset">
        <legend>Renderização do jogo</legend>
        <div className="graphics-fields">
          <label htmlFor="graphics-resolution">Resolução interna
            <select id="graphics-resolution" value={preferences.resolutionScale}
              aria-describedby="graphics-resolution-help graphics-core-status"
              onChange={event => graphicsPreferences.update({ resolutionScale: Number(event.target.value) })}>
              <option value="1">Nativa · 1× (recomendado)</option>
              <option value="2">Maior resolução interna · 2×</option>
            </select>
            <small id="graphics-resolution-help">1× favorece a fluidez. 2× renderiza cerca de quatro vezes mais pixels internos e exige mais da GPU.</small>
          </label>
          <label htmlFor="graphics-filter">Filtragem de texturas
            <select id="graphics-filter" value={String(preferences.bilinearFiltering)}
              aria-describedby="graphics-filter-help graphics-core-status"
              onChange={event => graphicsPreferences.update({ bilinearFiltering: event.target.value === 'true' })}>
              <option value="false">Padrão do jogo (recomendado)</option>
              <option value="true">Suavização bilinear forçada</option>
            </select>
            <small id="graphics-filter-help">O padrão respeita os filtros previstos pelo jogo. A opção bilinear força a suavização das texturas.</small>
          </label>
        </div>
        <div className="graphics-runtime" data-pending={!!pending}>
          <p id="graphics-core-status" role="status">
            {applied
              ? <>Nesta sessão: {applied.resolutionScale}× · {filterLabel(applied.bilinearFiltering)}.
                {pending
                  ? storageError ? ' Os novos ajustes são temporários nesta aba e ainda não foram aplicados ao núcleo.'
                    : ' Os ajustes de renderização escolhidos serão usados após recarregar a página. Guarde seu SAVE antes de recarregar.'
                  : ' Novos ajustes de renderização precisam de uma nova sessão.'}</>
              : 'Resolução e filtragem serão aplicadas ao preparar o emulador, inclusive em “Verificar emulador sem ISO”.'}
          </p>
          {pending && <button type="button" id="graphics-reload" className="secondary-button"
            disabled={!!storageError} onClick={() => window.location.reload()}>Recarregar para aplicar</button>}
          {pending && storageError && <p>A recarga descarta ajustes temporários. Permita o armazenamento local para mantê-los entre sessões.</p>}
        </div>
      </fieldset>

      <fieldset className="graphics-fieldset">
        <legend>Exibição · pode mudar durante a sessão</legend>
        <div className="graphics-fields">
          <label htmlFor="graphics-size">Tamanho na página
            <select id="graphics-size" value={preferences.displaySize}
              onChange={event => graphicsPreferences.update({ displaySize: event.target.value })}>
              <option value="fit">Adaptar à área disponível</option>
              <option value="compact">Compacto · até 640 px</option>
            </select>
            <small>Muda o tamanho de exibição. A resolução interna é escolhida acima.</small>
          </label>
          <label htmlFor="graphics-scaling">Ampliação da imagem
            <select id="graphics-scaling" value={preferences.scaling}
              onChange={event => graphicsPreferences.update({ scaling: event.target.value })}>
              <option value="smooth">Suave</option>
              <option value="pixelated">Pixels definidos</option>
            </select>
            <small>Escolha a aparência ao ampliar a tela. O filtro de texturas do jogo é um ajuste separado.</small>
          </label>
        </div>
        <label className="graphics-checkbox" htmlFor="graphics-fps">
          <input id="graphics-fps" type="checkbox" checked={preferences.showFps}
            onChange={event => graphicsPreferences.update({ showFps: event.target.checked })} />
          Mostrar contador de FPS
        </label>
      </fieldset>

      <section className="device-analysis" aria-labelledby="device-analysis-title">
        <h3 id="device-analysis-title"><ScanLine size={18} aria-hidden="true" /> Não sabe quais ajustes escolher?</h3>
        <p id="device-analysis-consent">Ao clicar, você autoriza uma consulta aos recursos que o navegador informa. A análise fica só nesta aba, sem envio ao servidor, e pode ser descartada.</p>
        <div className="graphics-actions">
          <button type="button" id="analyze-device" className="secondary-button" disabled={analyzing}
            aria-describedby="device-analysis-consent" onClick={inspectDevice}>
            {analyzing ? 'Analisando…' : analysis ? 'Analisar novamente' : 'Analisar meu dispositivo'}
          </button>
          {(analysis || analyzing) && <button type="button" id="forget-device-analysis" className="text-button"
            onClick={discardAnalysis}>Descartar análise</button>}
        </div>
        <p role="status" className="graphics-analysis-status">
          {analyzing ? 'Consultando os recursos disponíveis nesta aba…' : analysisError
            ? 'Não foi possível concluir a análise. Você pode continuar com os ajustes manuais.'
            : analysis ? 'Análise concluída. As sugestões são um ponto de partida; teste o jogo para confirmar.' : ''}
        </p>
        {analysis && <div id="device-analysis-result">
          <dl className="device-specs">
            <div><dt>Processadores lógicos disponíveis</dt><dd>{number(analysis.logicalProcessors)}</dd></div>
            <div><dt>Memória aproximada informada</dt><dd>{analysis.deviceMemoryGB === null ? 'Não informada' : `${number(analysis.deviceMemoryGB)} GB`}</dd></div>
            <div><dt>Gráficos do navegador</dt><dd>{analysis.webgl2 ? 'WebGL2 disponível' : 'WebGL2 indisponível'}</dd></div>
          </dl>
          <p className="device-analysis-limits">O navegador pode limitar ou omitir essas informações. Elas não identificam o modelo completo do computador, a memória de vídeo ou a taxa de FPS que um jogo terá.</p>
          <details className="device-technical-details">
            <summary>Ver outros recursos informados</summary>
            <dl className="device-specs">
              <div><dt>Área da aba</dt><dd>{analysis.viewport.width && analysis.viewport.height ? `${analysis.viewport.width} × ${analysis.viewport.height} px CSS` : 'Não informada'}</dd></div>
              <div><dt>Escala da tela</dt><dd>{number(analysis.devicePixelRatio)}×</dd></div>
              <div><dt>Tamanho máximo de textura</dt><dd>{analysis.maxTextureSize === null ? 'Não informado' : `${number(analysis.maxTextureSize)} px`}</dd></div>
              <div><dt>Memória compartilhada</dt><dd>{analysis.sharedMemory ? 'Disponível' : 'Indisponível'}</dd></div>
            </dl>
          </details>
          <div className="graphics-recommendation" id="graphics-recommendation">
            <h4>Sugestão inicial: nativa · 1×</h4>
            <ul>{recommendation.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>
            <p>Filtro do jogo e {recommendation.profile === 'economy' ? 'exibição compacta' : 'exibição adaptada à área disponível'}. A sugestão só muda seus ajustes quando você aplicar.</p>
            {recommendation.warnings.length > 0 && <ul className="graphics-warnings">
              {recommendation.warnings.map(warning => <li key={warning}>{warning}</li>)}
            </ul>}
            <button type="button" className="secondary-button" id="apply-graphics-recommendation" onClick={applyRecommendation}>Aplicar sugestão</button>
          </div>
        </div>}
      </section>
      <div className="graphics-footer">
        <p>{storageError ? 'Seus ajustes são temporários nesta aba.' : 'Apenas suas escolhas de gráficos ficam guardadas neste navegador.'} A compatibilidade e a fluidez variam por jogo e dispositivo.</p>
        <button type="button" id="reset-graphics" className="text-button" onClick={() => graphicsPreferences.reset()}>Restaurar ajustes</button>
      </div>
      {storageError && <p className="graphics-storage-error" role="status">{storageError}</p>}
    </div>
  </details>;
}
