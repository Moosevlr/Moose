import { useEffect, useState } from 'react';

export default function BrowserReadiness() {
  const [checks, setChecks] = useState(null);
  useEffect(() => {
    let graphics = false;
    try {
      const context = document.createElement('canvas').getContext('webgl2');
      graphics = !!context;
      context?.getExtension('WEBGL_lose_context')?.loseContext();
    } catch { /* The emulator will show the same graphics requirement. */ }
    setChecks([
      { label: 'Execução do emulador', ok: typeof WebAssembly === 'object' && typeof Worker === 'function' },
      { label: 'Memória compartilhada', ok: window.crossOriginIsolated && typeof SharedArrayBuffer !== 'undefined' },
      { label: 'Gráficos WebGL2', ok: graphics },
    ]);
  }, []);
  const ready = checks?.every(check => check.ok);
  return <details className="browser-readiness" open={checks ? !ready : false}>
    <summary>Seu navegador <span>{checks ? ready ? 'Recursos disponíveis' : 'Verifique os requisitos' : 'Verificando…'}</span></summary>
    <ul>{checks?.map(check => <li key={check.label} data-ready={check.ok}>
      <span>{check.label}</span><strong>{check.ok ? 'Disponível' : 'Indisponível'}</strong>
    </li>)}</ul>
    {checks && !ready && <p>Abra o site em uma nova aba e use Chrome ou Firefox atualizado, com aceleração de hardware. Se a memória continuar indisponível, a configuração de hospedagem precisa permitir o emulador.</p>}
    <p>Essas verificações confirmam recursos do navegador. A compatibilidade depende do jogo; use “Verificar emulador sem ISO” para testar o núcleo.</p>
  </details>;
}
