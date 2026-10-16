// Recovered from the publicly served Digital Station page module.
// Original JSX source was unavailable; behavior is preserved before upgrades.
import * as l from "react";
import BrowserReadiness from "./browser-readiness.jsx";
import GraphicsSettings from "./graphics/GraphicsSettings.jsx";
import { graphicsPreferences } from "./graphics/graphics-preferences.js";
import { applyCoreGraphics } from "./graphics/core-graphics.js";
import { createBackupStore } from "./storage/save-backup.js";
import { DiscImageDevice as be } from "./emulator/disc-image-device.js";
import { MemoryCards as _e } from "./emulator/memory-cards.js";
import { downloadCore } from "./emulator/download-core.js";
import * as q from "react/jsx-runtime";
import { ArrowUpRight as m, Cpu as ee, Disc3 as te, Download as ne, Gamepad2 as re,
  Keyboard as h, Maximize as ie, Monitor as ae, Play as g, Power as oe,
  RotateCcw as _, Save as se, ShieldCheck as v, Upload as y } from "lucide-react";

function b(e, t, n) {
  let r;
  return new Promise((i, a) => {
    ((r = setTimeout(() => a(Error(typeof n == `function` ? n() : n)), t)),
      Promise.resolve().then(e).then(i, a));
  }).finally(() => clearTimeout(r));
}
async function x(e, t, n) {
  if (
    !Number.isSafeInteger(t) ||
    !Number.isSafeInteger(n) ||
    t < 0 ||
    n < 0 ||
    t + n > e.size
  )
    throw Error(
      `A estrutura da ISO aponta para dados fora do arquivo. A imagem pode estar incompleta.`,
    );
  let r = new Uint8Array(await e.slice(t, t + n).arrayBuffer());
  if (r.length !== n)
    throw Error(
      `Não foi possível ler todos os dados da ISO. Confira se o arquivo está disponível.`,
    );
  return r;
}
async function ce(e) {
  let t = 2048,
    n;
  for (let r = 16; r < 32 && (r + 1) * t <= e.size; r++) {
    let i = await x(e, r * t, t);
    if (new TextDecoder().decode(i.subarray(1, 6)) !== `CD001`) break;
    if (i[0] === 1) {
      n = i;
      break;
    }
    if (i[0] === 255) break;
  }
  if (!n || n[156] < 34)
    throw Error(
      `Esta ISO não contém uma estrutura de disco válida. Confira se o arquivo foi extraído por completo.`,
    );
  let r = new DataView(n.buffer, n.byteOffset, n.byteLength);
  if (r.getUint16(128, !0) !== t)
    throw Error(
      `Esta ISO usa um tamanho de setor não suportado. Escolha uma imagem de PS2 com setores de 2048 bytes.`,
    );
  let i = r.getUint32(158, !0) * t,
    a = r.getUint32(166, !0);
  if (!a || a > 512 * 1024)
    throw Error(
      `O diretório principal da ISO é inválido. Confira a integridade do arquivo.`,
    );
  let o = await x(e, i, a),
    s;
  for (let n = 0; n < o.length; ) {
    let r = o[n];
    if (!r) {
      n = Math.floor(n / t + 1) * t;
      continue;
    }
    if (r < 34 || n + r > o.length || o[n + 32] > r - 33)
      throw Error(`O diretório da ISO está incompleto ou danificado.`);
    if (
      new TextDecoder()
        .decode(o.subarray(n + 33, n + 33 + o[n + 32]))
        .replace(/;\d+$/, ``)
        .toUpperCase() === `SYSTEM.CNF` &&
      !(o[n + 25] & 2)
    ) {
      let i = new DataView(o.buffer, o.byteOffset + n, r),
        a = i.getUint32(10, !0);
      if (!a || a > 32768)
        throw Error(`A configuração de inicialização da ISO é inválida.`);
      s = await x(e, i.getUint32(2, !0) * t, a);
      break;
    }
    n += r;
  }
  if (!s)
    throw Error(
      `Esta ISO não contém SYSTEM.CNF. Confirme que você selecionou a versão de PlayStation 2 do jogo.`,
    );
  let c = new TextDecoder().decode(s).replace(/\0/g, ``),
    l = /^\s*BOOT2\s*=\s*cdrom\d*:[\\/]?([^;\r\n]+)/im.exec(c)?.[1].trim();
  if (!l)
    throw Error(
      `Esta ISO não contém a inicialização BOOT2 do PS2. Confirme a plataforma e a integridade do arquivo.`,
    );
  let u = /(?:^|[\\/])([A-Z]{4})_(\d{3})\.(\d{2})(?:$|[;\s])/i.exec(l);
  return {
    platform: `PS2`,
    boot: l,
    serial: u ? `${u[1].toUpperCase()}-${u[2]}${u[3]}` : null,
    video: /^\s*VMODE\s*=\s*(PAL|NTSC)\b/im.exec(c)?.[1].toUpperCase() || null,
  };
}
function S(e) {
  return (
    `
let dsReportedWorkerFault = false;
function dsReportWorkerFault(reason, fallback) {
  if (dsReportedWorkerFault) return;
  dsReportedWorkerFault = true;
  self.postMessage({cmd: 'callHandler', handler: 'onWorkerFault', args: [{
    message: String(reason?.message || (reason == null ? fallback : reason) || 'Falha no processo de execução').slice(0, 2000),
    stack: String(reason?.stack || '').slice(0, 4000), worker: self.name
  }]});
}
self.addEventListener('error', event => {
  dsReportWorkerFault(event.error || event.message, 'Exceção no processo de execução');
  event.preventDefault();
});
self.addEventListener('unhandledrejection', event => {
  dsReportWorkerFault(event.reason, 'Promise rejeitada no processo de execução');
  event.preventDefault();
});
` + e
  );
}
var C = `self.onmessage = event => {
  try {
    const {memory, module} = event.data;
    const valid = memory.buffer instanceof SharedArrayBuffer && module instanceof WebAssembly.Module;
    if (valid) Atomics.store(new Uint8Array(memory.buffer), memory.buffer.byteLength - 1, 73);
    self.postMessage({ready: valid});
  } catch (error) { self.postMessage({ready: false, message: error.message}); }
};`;
async function le(e, t, n = 12e3) {
  if (typeof Worker != `function`)
    throw Error(
      `Este navegador não permite processos de execução. Abra o site em uma nova aba.`,
    );
  let r = URL.createObjectURL(new Blob([C], { type: `text/javascript` })),
    i;
  try {
    await b(
      () =>
        new Promise((n, a) => {
          ((i = new Worker(r, {
            type: `module`,
            name: `digital-station-probe`,
          })),
            (i.onerror = (e) =>
              a(
                Error(
                  e.message ||
                    e.error?.message ||
                    `O navegador bloqueou a inicialização de processos locais. Confira o diagnóstico de política de segurança abaixo.`,
                ),
              )),
            (i.onmessage = (t) => {
              t.data?.ready &&
              Atomics.load(
                new Uint8Array(e.buffer),
                e.buffer.byteLength - 1,
              ) === 73
                ? n()
                : a(
                    Error(
                      t.data?.message ||
                        `O navegador não conseguiu compartilhar a memória do emulador com seus processos.`,
                    ),
                  );
            }),
            (i.onmessageerror = () =>
              a(
                Error(
                  `O navegador não conseguiu transferir o núcleo para o processo de execução.`,
                ),
              )),
            i.postMessage({ memory: e, module: t }));
        }),
      n,
      `O processo de teste não respondeu. Abra o site em uma nova aba e confira o diagnóstico abaixo.`,
    );
  } finally {
    (i?.terminate(),
      URL.revokeObjectURL(r),
      Atomics.store(new Uint8Array(e.buffer), e.buffer.byteLength - 1, 0));
  }
}
async function ue(
  e,
  { record: t = () => {}, onFault: n = () => {}, timeoutMs: r = 12e3 } = {},
) {
  t(`Compilando o núcleo WebAssembly.`);
  let i = await b(
      () => WebAssembly.compile(e),
      45e3,
      `A compilação do núcleo demorou demais.`,
    ),
    a = new WebAssembly.Memory({ initial: 256, maximum: 32768, shared: !0 });
  (t(`Verificando processos locais e memória compartilhada.`),
    await le(a, i, r),
    t(`Comunicação e memória compartilhada confirmadas.`));
  let o = await fetch(`/core/Play.js?worker=20261013`, {
    credentials: `same-origin`,
    signal: AbortSignal.timeout(45e3),
  });
  if (!o.ok)
    throw Error(
      `Não foi possível carregar o código dos processos (HTTP ${o.status}).`,
    );
  let s = o.headers?.get(`content-type`) || ``;
  if (!/javascript|ecmascript/i.test(s))
    throw Error(
      `A resposta do código dos processos não é JavaScript. O acesso ao arquivo pode ter retornado uma página de autenticação.`,
    );
  let c = await o.text();
  if (
    !/export\s+default\s+Play/.test(c) ||
    !/isPthread\s*&&\s*Play\s*\(/.test(c)
  )
    throw Error(
      `O código dos processos não corresponde ao núcleo esperado. Recarregue a página.`,
    );
  let l = URL.createObjectURL(new Blob([S(c)], { type: `text/javascript` }));
  return (
    t(`Código dos processos carregado pela página.`),
    {
      options: {
        wasmMemory: a,
        mainScriptUrlOrBlob: l,
        instantiateWasm(e, t) {
          let n = new WebAssembly.Instance(i, e);
          return (t(n, i), n.exports);
        },
        onWorkerFault: (e) => {
          let t = Error(
            `${e?.worker || `Processo`}: ${e?.message || `falha sem mensagem`}`,
          );
          ((t.workerStack = String(e?.stack || ``).slice(0, 4e3)), n(t));
        },
      },
      dispose() {
        URL.revokeObjectURL(l);
      },
    }
  );
}
var w = (e, t, n, r, i) => ({ id: e, label: t, code: n, key: r, pad: i }),
  T = (e) => ({ type: `button`, index: e }),
  E = (e, t) => ({ type: `axis`, index: e, direction: t }),
  D = [
    w(`cross`, `× Cruz`, `KeyZ`, `KeyZ`, T(0)),
    w(`circle`, `○ Círculo`, `KeyX`, `KeyX`, T(1)),
    w(`square`, `□ Quadrado`, `KeyA`, `KeyA`, T(2)),
    w(`triangle`, `△ Triângulo`, `KeyS`, `KeyS`, T(3)),
    w(`l1`, `L1`, `Key1`, `Digit1`, T(4)),
    w(`r1`, `R1`, `Key8`, `Digit8`, T(5)),
    w(`l2`, `L2`, `Key2`, `Digit2`, T(6)),
    w(`r2`, `R2`, `Key9`, `Digit9`, T(7)),
    w(`select`, `Select`, `Backspace`, `Backspace`, T(8)),
    w(`start`, `Start`, `Enter`, `Enter`, T(9)),
    w(`l3`, `L3 · clique esquerdo`, `Key3`, `Digit3`, T(10)),
    w(`r3`, `R3 · clique direito`, `Key0`, `Digit0`, T(11)),
    w(`up`, `Direcional ↑`, `ArrowUp`, `ArrowUp`, T(12)),
    w(`down`, `Direcional ↓`, `ArrowDown`, `ArrowDown`, T(13)),
    w(`left`, `Direcional ←`, `ArrowLeft`, `ArrowLeft`, T(14)),
    w(`right`, `Direcional →`, `ArrowRight`, `ArrowRight`, T(15)),
    w(`lx-`, `Analógico esquerdo ←`, `KeyF`, `KeyF`, E(0, -1)),
    w(`lx+`, `Analógico esquerdo →`, `KeyH`, `KeyH`, E(0, 1)),
    w(`ly-`, `Analógico esquerdo ↑`, `KeyT`, `KeyT`, E(1, -1)),
    w(`ly+`, `Analógico esquerdo ↓`, `KeyG`, `KeyG`, E(1, 1)),
    w(`rx-`, `Analógico direito ←`, `KeyJ`, `KeyJ`, E(2, -1)),
    w(`rx+`, `Analógico direito →`, `KeyL`, `KeyL`, E(2, 1)),
    w(`ry-`, `Analógico direito ↑`, `KeyI`, `KeyI`, E(3, -1)),
    w(`ry+`, `Analógico direito ↓`, `KeyK`, `KeyK`, E(3, 1)),
  ],
  O = `digital-station-controls-v1`;
function k() {
  return {
    version: 1,
    keys: Object.fromEntries(D.map((e) => [e.id, e.key])),
    pads: Object.fromEntries(D.map((e) => [e.id, { ...e.pad }])),
  };
}
function A(e) {
  return (
    {
      ArrowUp: `↑`,
      ArrowDown: `↓`,
      ArrowLeft: `←`,
      ArrowRight: `→`,
      Backspace: `Backspace`,
      Space: `Espaço`,
      ShiftLeft: `Shift esq.`,
      ShiftRight: `Shift dir.`,
      ControlLeft: `Ctrl esq.`,
      ControlRight: `Ctrl dir.`,
    }[e] ||
    e.replace(/^Key|^Digit/, ``) ||
    `Sem vínculo`
  );
}
function j(e) {
  return e
    ? e.type === `button`
      ? `Botão ${e.index + 1}`
      : `Eixo ${e.index + 1} ${e.direction < 0 ? `−` : `+`}`
    : `Sem vínculo`;
}
var M = (e) =>
  typeof e == `string`
    ? e
    : e
      ? `${e.type}:${e.index}:${e.direction || 0}`
      : ``;
function N(e, t, n, r) {
  let i = structuredClone(e),
    a = i[t][n],
    o = D.find((e) => e.id !== n && M(i[t][e.id]) === M(r));
  return (o && (i[t][o.id] = a), (i[t][n] = r), i);
}
function P(e) {
  let t = k();
  if (e?.version !== 1) return t;
  for (let n of D) {
    let r = e.keys?.[n.id];
    typeof r == `string` &&
      /^[A-Za-z][A-Za-z0-9]{0,30}$/.test(r) &&
      ![`Escape`, `MetaLeft`, `MetaRight`].includes(r) &&
      (t.keys[n.id] = r);
    let i = e.pads?.[n.id];
    i &&
      Number.isInteger(i.index) &&
      i.index >= 0 &&
      i.index < 64 &&
      (i.type === `button` ||
        (i.type === `axis` && [-1, 1].includes(i.direction))) &&
      (t.pads[n.id] = {
        type: i.type,
        index: i.index,
        ...(i.type === `axis` ? { direction: i.direction } : {}),
      });
  }
  for (let e of [`keys`, `pads`])
    if (new Set(D.map((n) => M(t[e][n.id]))).size !== D.length) return k();
  return t;
}
function de(e, t) {
  return D.find((n) => e.keys[n.id] === t)?.code;
}
function fe(e, t, n = 0.3) {
  let r = new Set();
  if (!e?.connected) return r;
  for (let i of D) {
    let a = t.pads[i.id];
    (a.type === `button`
      ? e.buttons[a.index]?.pressed || e.buttons[a.index]?.value > 0.5
      : (e.axes[a.index] || 0) * a.direction > n) && r.add(i.code);
  }
  return r;
}
function pe() {
  try {
    return Array.from(navigator.getGamepads?.() || []).find(
      (e) => e?.connected,
    );
  } catch {
    return;
  }
}
function me({ on: e, releaseAll: t }) {
  let n = (e) => document.getElementById(e),
    r = n(`mapping-status`),
    i = k();
  try {
    i = P(JSON.parse(window.localStorage.getItem(O)));
  } catch {}
  let a = null,
    o = null,
    s = null,
    c = Array.from(
      document.querySelectorAll(`[data-bind-key], [data-bind-pad]`),
    );
  function l() {
    (c.forEach((e) => {
      let t = e.dataset.bindKey ? `keys` : `pads`,
        n = e.dataset.bindKey || e.dataset.bindPad;
      ((e.textContent = t === `keys` ? A(i.keys[n]) : j(i.pads[n])),
        (e.dataset.listening = String(a?.kind === t && a.id === n)));
    }),
      n(`cancel-mapping`) && (n(`cancel-mapping`).hidden = !a));
  }
  function u(e = `Mapeamento cancelado.`) {
    (o !== null && cancelAnimationFrame(o),
      clearTimeout(s),
      (o = null),
      (s = null),
      (a = null),
      l(),
      r && (r.textContent = e));
  }
  function d(e) {
    let { kind: n, id: r } = a;
    ((i = N(i, n, r, e)), t());
    let o = `Configuração salva. Se o vínculo já estava em uso, os dois botões foram trocados.`;
    try {
      window.localStorage.setItem(O, JSON.stringify(i));
    } catch {
      o = `Configuração aplicada nesta sessão. O navegador não permitiu guardar as preferências.`;
    }
    u(o);
  }
  function f() {
    if (((o = null), !a || a.kind !== `pads`)) return;
    let e = pe();
    if (e) {
      let t = e.buttons.findIndex((e) => e?.pressed || e?.value > 0.5),
        n = e.axes.findIndex((e) => Math.abs(e) > 0.6);
      if (t === -1 && n === -1) a.neutral = !0;
      else if (a.neutral) {
        d(
          t === -1
            ? { type: `axis`, index: n, direction: Math.sign(e.axes[n]) }
            : { type: `button`, index: t },
        );
        return;
      }
    }
    o = requestAnimationFrame(f);
  }
  return (
    c.forEach((n) =>
      e(n, `click`, () => {
        (u(``), t());
        let e = n.dataset.bindKey ? `keys` : `pads`;
        ((a = {
          kind: e,
          id: n.dataset.bindKey || n.dataset.bindPad,
          neutral: !1,
        }),
          l(),
          (r.textContent =
            e === `keys`
              ? `Pressione a nova tecla. Esc cancela.`
              : `Solte os botões do controle, depois pressione um botão ou mova um analógico. Esc cancela.`),
          (s = setTimeout(
            () => u(`Tempo encerrado. Clique no vínculo para tentar de novo.`),
            2e4,
          )),
          e === `pads` && (o = requestAnimationFrame(f)));
      }),
    ),
    n(`cancel-mapping`) && e(n(`cancel-mapping`), `click`, () => u()),
    n(`reset-mapping`) &&
      e(n(`reset-mapping`), `click`, () => {
        (t(), (i = k()));
        try {
          window.localStorage.setItem(O, JSON.stringify(i));
        } catch {}
        u(`Controles restaurados ao padrão.`);
      }),
    e(
      document,
      `keydown`,
      (e) => {
        !a ||
          !e.isTrusted ||
          (e.preventDefault(),
          e.stopImmediatePropagation(),
          e.code === `Escape`
            ? u()
            : a.kind === `keys` &&
              !e.repeat &&
              !e.metaKey &&
              ![`MetaLeft`, `MetaRight`].includes(e.code) &&
              d(e.code));
      },
      !0,
    ),
    e(window, `blur`, () => {
      a && u();
    }),
    e(document, `visibilitychange`, () => {
      document.hidden && a && u();
    }),
    l(),
    {
      get profile() {
        return i;
      },
      get capturing() {
        return !!a;
      },
      dispose() {
        u(``);
      },
    }
  );
}
var G = new Set([`iso`, `cso`, `chd`, `isz`, `bin`, `elf`]),
  K = 128 * 1024,
  ve = 16 * 1024 * 1024;
async function ye(e) {
  if (!e || !e.size)
    throw Error(`O arquivo está vazio. Escolha o arquivo do jogo.`);
  let t = e.name.split(`.`).pop().toLowerCase();
  if (!G.has(t))
    throw Error(
      `Formato não suportado. Escolha uma ISO, CSO, CHD, ISZ, BIN ou ELF. Arquivos ZIP e 7Z precisam ser extraídos primeiro.`,
    );
  if (t === `iso`) {
    if (e.size < 17 * 2048)
      throw Error(`Esta ISO está incompleta ou não é uma imagem de disco.`);
    let t = new Uint8Array(await e.slice(16 * 2048, 32776).arrayBuffer());
    if (new TextDecoder().decode(t.subarray(1, 6)) !== `CD001`)
      throw Error(
        `Não reconheci esta imagem ISO. Confira se o arquivo foi extraído e se pertence à versão de PS2.`,
      );
  }
  if (t === `elf`) {
    let t = new Uint8Array(await e.slice(0, 20).arrayBuffer());
    if (
      t.length < 20 ||
      t[0] !== 127 ||
      t[1] !== 69 ||
      t[2] !== 76 ||
      t[3] !== 70 ||
      t[4] !== 1 ||
      t[5] !== 1 ||
      t[18] !== 8 ||
      t[19] !== 0
    )
      throw Error(
        `Este ELF não é um executável MIPS de 32 bits compatível com o PS2.`,
      );
  }
  if (t === `chd` || t === `cso` || t === `isz`) {
    let n = new Uint8Array(await e.slice(0, 8).arrayBuffer()),
      r = new TextDecoder().decode(n);
    if (
      !(t === `chd`
        ? r === `MComprHD`
        : t === `cso`
          ? /^(CISO|ZISO)/.test(r)
          : r.startsWith(`IsZ!`))
    )
      throw Error(
        `O conteúdo do arquivo não corresponde ao formato indicado. Confira o arquivo do jogo.`,
      );
  }
  return t;
}
function xe() {
  return typeof window.Play == `function`
    ? Promise.resolve()
    : new Promise((e, t) => {
        let n = document.createElement(`script`);
        ((n.type = `module`),
          (n.src = `/core/Play-loader.mjs`),
          (n.async = !0));
        let r = setTimeout(
          () =>
            t(
              Error(
                `O carregamento do emulador demorou demais. Atualize a página para tentar novamente.`,
              ),
            ),
          45e3,
        );
        ((n.onload = () => {
          if ((clearTimeout(r), typeof window.Play != `function`)) {
            t(
              Error(
                `O módulo do emulador não carregou corretamente. Atualize esta página para tentar novamente.`,
              ),
            );
            return;
          }
          e();
        }),
          (n.onerror = () => {
            (clearTimeout(r),
              t(
                Error(
                  `Não foi possível carregar o emulador. Confira a conexão e atualize esta página.`,
                ),
              ));
          }),
          document.head.appendChild(n));
      });
}
function Se({
  coreTimeoutMs: e = 6e4,
  bootTimeoutMs: t = 6e4,
  prepareWorkers: n = ue,
  createMemoryCards: r = (e) => new _e(e),
} = {}) {
  let i = (e) => document.getElementById(e),
    a = i(`outputCanvas`),
    o = i(`game-file`),
    s = i(`drop-zone`),
    c = i(`start`),
    l = i(`check-core`),
    u = i(`restart`),
    d = i(`stop`),
    f = i(`runtime-status`),
    p = i(`notice`),
    m = i(`screen-empty`),
    ee = i(`input-status`),
    te = i(`fps`),
    ne = new Set(),
    re = [],
    h = new Map(),
    ie = new Map(),
    ae = new Set(),
    g = null,
    oe = null,
    _ = null,
    se = null,
    v = `idle`,
    y = 0,
    x = !1,
    S = !1,
    C = 0,
    le = 0,
    w = null,
    T = !1,
    E = null,
    D = !1,
    O = `Aguardando arquivo`,
    k = ``,
    A = null,
    j = ``,
    M = !1,
    N = 0,
    P = null,
    he = !1,
    F = null,
    I = i(`save-file`),
    L = i(`load-save`),
    R = i(`download-save`),
    z = i(`save-status`),
    backupStore = createBackupStore(),
    backupRecord = null,
    backupTimer = null,
    backupBusy = false,
    backupRemoving = false,
    backupNeedsWrite = false,
    backupEpoch = 0,
    backupObservation = null,
    backupError = null,
    pendingDownloadVersion = null,
    B = r(() => {
      queueSaveStatus();
      scheduleBackup();
    }),
    V = me({ on: J, releaseAll: Q }),
    H = [],
    U = i(`diagnostic-output`),
    ge = i(`copy-diagnostic`);
  function W() {
    let e = _?.discImageDevice;
    const graphics = graphicsPreferences.getSnapshot().applied;
    return [
      `Digital Station · diagnóstico local`,
      `Núcleo: Play! 0.77-12-g83700b2c`,
      `Etapa: ${O}`,
      `Estado: ${v}`,
      `Navegador: ${navigator.userAgent || `não informado`}`,
      `Isolamento: ${!!window.crossOriginIsolated}`,
      `SharedArrayBuffer: ${typeof SharedArrayBuffer < `u`}`,
      `Gráficos: ${graphics ? `${graphics.resolutionScale}× · ${graphics.bilinearFiltering ? `bilinear forçado` : `filtro do jogo`}` : `a preparar`}`,
      `Política de segurança: ${j || `nenhum bloqueio registrado`}`,
      `Arquivo: ${g?.name || `nenhum`}`,
      `Tamanho: ${g?.size || 0} bytes`,
      `Leituras do disco: ${e?.readCount || 0}`,
      `Última leitura: ${e?.lastRead ? JSON.stringify(e.lastRead) : `nenhuma`}`,
      ``,
      ...H,
    ].join(`
`);
  }
  function G(e) {
    (H.push(`${new Date().toISOString()} · ${String(e).slice(0, 700)}`),
      H.length > 40 && H.shift(),
      U && i(`diagnostic-panel`)?.open && (U.textContent = W()));
  }
  function K(e) {
    ((O = e),
      X(`loading`, e),
      (i(`engine-status`).textContent = e),
      Y(e + `. O arquivo do jogo permanece neste dispositivo.`),
      G(e));
  }
  function ve() {
    (E !== null && clearTimeout(E), (E = null));
  }
  function Se() {
    ((D = !0),
      ve(),
      (v === `starting` || v === `stalled`) &&
        (v === `stalled` && (p.hidden = !0),
        (O = `Emulação ativa`),
        X(`running`, `Emulação ativa`),
        G(`O núcleo produziu quadros.`)));
  }
  function q() {
    !S &&
      x &&
      v !== `error` &&
      !document.hidden &&
      document.hasFocus() &&
      w === null &&
      (w = requestAnimationFrame(Me));
  }
  function Ce() {
    (Q(), w !== null && cancelAnimationFrame(w), (w = null));
  }
  function resumeSessionUi() {
    if (S || !x || v === `error` || document.hidden || !document.hasFocus()) return;
    // Hidden tabs have a different browser scheduling budget. Start a fresh
    // measurement window instead of displaying a background-averaged FPS.
    C = performance.now();
    try { _.clearStats(); } catch { /* Me reports a persistent core error. */ }
    te.textContent = `— FPS`;
    q();
  }
  function J(e, t, n, r) {
    (e.addEventListener(t, n, r),
      re.push(() => e.removeEventListener(t, n, r)));
  }
  function Y(e, t = `info`) {
    ((p.hidden = !1), (p.dataset.kind = t), (p.textContent = e));
  }
  function X(e, t) {
    ((v = e),
      (f.dataset.state = e),
      (f.textContent = t),
      (c.disabled =
        M ||
        !g ||
        [
          `validating`,
          `loading`,
          `starting`,
          `stalled`,
          `running`,
          `error`,
        ].includes(e)),
      (l.disabled =
        M ||
        !!_ ||
        [
          `validating`,
          `loading`,
          `starting`,
          `stalled`,
          `running`,
          `error`,
        ].includes(e)),
      (u.disabled =
        M || !x || e === `starting` || e === `stalled` || e === `error`),
      (d.disabled = M || (!_ && e !== `error`)),
      (s.disabled =
        x || [`validating`, `loading`, `starting`, `error`].includes(e)),
      (i(`choose-screen`).disabled = s.disabled),
      we());
    if (U) U.textContent = W();
    updateBackupControls();
  }
  function queueSaveStatus() {
    if (S || F !== null) return;
    F = requestAnimationFrame(() => {
      F = null;
      we();
      updateBackupControls();
    });
  }
  function updateBackupControls() {
    const busy = M || x || [`validating`, `loading`, `starting`, `error`].includes(v);
    const recover = i(`recover-backup`);
    const remove = i(`delete-backup`);
    const status = i(`backup-status`);
    if (recover) { recover.hidden = !backupRecord; recover.disabled = busy || backupRemoving; }
    if (remove) { remove.hidden = !backupRecord && !backupError; remove.disabled = busy || backupRemoving; }
    if (!status) return;
    status.dataset.state = backupError ? `error` : `ready`;
    status.textContent = backupError
      ? `Backup local indisponível: ${backupError}. Use Baixar SAVE para guardar seu progresso.`
      : backupBusy || backupNeedsWrite
        ? `Preparando backup local após a gravação no cartão…`
        : backupRecord
          ? `Último backup local: ${new Date(backupRecord.updatedAt).toLocaleString(`pt-BR`)}. Disponível neste navegador.`
          : `O backup será guardado neste navegador depois que houver dados no cartão.`;
  }
  function scheduleBackup() {
    if (S) return;
    if (!backupObservation || backupObservation.version !== B.version || backupObservation.staged !== B.staged) {
      backupObservation = { version: B.version, staged: B.staged };
      backupEpoch += 1;
      backupNeedsWrite = true;
    }
    if (backupRemoving) return;
    if (!backupNeedsWrite) return;
    clearTimeout(backupTimer);
    backupTimer = setTimeout(flushBackup, 1200);
    queueSaveStatus();
  }
  async function flushBackup() {
    backupTimer = null;
    if (S || backupRemoving || backupBusy || !backupNeedsWrite) return;
    if (B.writing) { scheduleBackup(); return; }
    const epoch = backupEpoch;
    backupNeedsWrite = false;
    backupBusy = true;
    updateBackupControls();
    try {
      const snapshot = await B.export(g?.name || backupRecord?.game || ``, { allowEmpty: true });
      if (!snapshot) return;
      if (S || backupRemoving || epoch !== backupEpoch) return;
      const record = await backupStore.writeSnapshot({
        blob: snapshot.blob,
        game: (g?.name || backupRecord?.game || ``).slice(0, 200),
        updatedAt: Date.now(),
      });
      if (!S && epoch === backupEpoch) {
        backupRecord = record;
        backupError = null;
        G(`Backup local confirmado no navegador.`);
      }
    } catch (error) {
      if (!S) {
        backupError = error.message || `o navegador recusou o armazenamento`;
        G(`Backup local: ${backupError}`);
      }
    } finally {
      backupBusy = false;
      if (!S) { updateBackupControls(); if (backupNeedsWrite) scheduleBackup(); }
    }
  }
  const initialBackupEpoch = backupEpoch;
  backupStore.readLatest().then(record => {
    if (!S && initialBackupEpoch === backupEpoch) { backupRecord = record; updateBackupControls(); }
  }).catch(error => {
    if (!S) { backupError = error.message; updateBackupControls(); }
  });
  function we() {
    if (!L) return;
    let e = x || [`validating`, `loading`, `starting`, `error`].includes(v);
    if (
      ((L.disabled = M || e),
      i(`clear-save`) &&
        ((i(`clear-save`).disabled = M || e), (i(`clear-save`).hidden = !P)),
      R && (R.disabled = M || (!_ && !P)),
      z && !M)
    ) {
      let e = B.hasChanges
        ? `Cartão alterado. Baixe o SAVE após salvar no jogo.`
        : P
          ? `SAVE carregado. O jogo poderá ler seu progresso.`
          : _
            ? `Cartão pronto. Salve dentro do jogo e baixe o SAVE.`
            : `Carregue seu SAVE antes de iniciar, se já tiver um.`;
      (z.textContent !== e && (z.textContent = e),
        (z.dataset.state = B.hasChanges ? `changed` : `ready`));
    }
  }
  async function Te(e) {
    if (!e || L.disabled) return;
    let t = ++N;
    ((M = !0), X(v, f.textContent), (z.textContent = `Verificando SAVE…`));
    try {
      let n = await b(
        () => B.load(e, () => t === N && !S),
        2e4,
        `A leitura do SAVE demorou demais. Tente um arquivo do disco local.`,
      );
      if (!n || S || t !== N) return;
      ((P = e),
        (pendingDownloadVersion = null),
        (i(`confirm-save-download`).hidden = true),
        (i(`save-title`).textContent = e.name),
        (i(`save-detail`).textContent =
          `${n.files.length} arquivo(s) no cartão · pronto para continuar`),
        G(`SAVE local carregado: ${e.name} · ${n.files.length} arquivo(s).`));
    } catch (e) {
      (N++, Y(e.message, `error`), G(`SAVE: ` + e.message));
    } finally {
      ((M = !1), S || X(v, f.textContent));
    }
  }
  async function Ee() {
    if (!(M || R.disabled)) {
      ((M = !0),
        Q(),
        X(v, f.textContent),
        (z.textContent = `Preparando arquivo de SAVE…`));
      try {
        let e = await B.export(g?.name || ``);
        if (S) return;
        let t = URL.createObjectURL(e.blob),
          n = document.createElement(`a`),
          r = (g?.name || `Digital-Station`)
            .replace(/\.[^.]+$/, ``)
            .replace(/[^\p{L}\p{N}_-]+/gu, `-`)
            .slice(0, 70);
        ((n.href = t),
          (n.download = `${r}-${new Date().toISOString().replace(/[:.]/g, `-`)}.dssave`),
          document.body.appendChild(n),
          n.click(),
          n.remove(),
          setTimeout(() => URL.revokeObjectURL(t), 6e4),
          (pendingDownloadVersion = e.version),
          (i(`confirm-save-download`).hidden = false),
          G(`Download de SAVE iniciado · ${e.fileCount} arquivo(s).`),
          Y(
            `Download do SAVE iniciado. Confirme abaixo depois de verificar que o arquivo foi guardado.`,
            `success`,
          ));
      } catch (e) {
        (Y(e.message, `error`), G(`SAVE: ` + e.message));
      } finally {
        ((M = !1), S || X(v, f.textContent));
      }
    }
  }
  function De(e, t) {
    _ &&
      a.dispatchEvent(
        new KeyboardEvent(t ? `keydown` : `keyup`, {
          code: e,
          key: e.startsWith(`Key`) ? e.slice(3).toLowerCase() : e,
          bubbles: !0,
          cancelable: !0,
          repeat: !1,
        }),
      );
  }
  function Z(e, t, n) {
    if (!x || v === `error`) return;
    let r = h.get(e) || new Set(),
      i = r.size > 0;
    (t ? r.add(n) : r.delete(n),
      r.size ? h.set(e, r) : h.delete(e),
      i !== r.size > 0 && De(e, r.size > 0));
  }
  function Q() {
    for (let e of h.keys()) De(e, !1);
    (h.clear(),
      ie.clear(),
      ae.clear(),
      document
        .querySelectorAll(`[data-code].pressed`)
        .forEach((e) => e.classList.remove(`pressed`)));
  }
  function $(e, t = !0) {
    if (!S) {
      if (
        (console.error(`Digital Station:`, e),
        Q(),
        Y(e.message || String(e), `error`),
        t)
      ) {
        (ve(),
          X(`error`, `Sessão interrompida`),
          (i(`engine-status`).textContent = `Recarregue para tentar`));
        let e = i(`diagnostic-panel`);
        e && (e.open = !0);
      }
      G(`Erro: ${e.message || String(e)}`);
    }
  }
  async function Oe(e) {
    if (!e || s.disabled) return;
    let t = ++y,
      n = v,
      r = f.textContent;
    ((O = `Verificando arquivo`),
      X(`validating`, O),
      G(`Verificando ${e.name}.`));
    try {
      let n = await b(
          () => ye(e),
          15e3,
          `A leitura do arquivo demorou demais. Tente um arquivo salvo no disco local do computador.`,
        ),
        r =
          n === `iso`
            ? await b(
                () => ce(e),
                15e3,
                `A leitura da ISO demorou demais. Tente um arquivo salvo no disco local do computador.`,
              )
            : null;
      if (t !== y || S) return;
      ((g = e),
        (oe = n),
        (O = r ? `ISO de PS2 verificada` : `Arquivo selecionado`),
        (i(`file-title`).textContent = e.name),
        (i(`file-detail`).textContent =
          (e.size / (1024 * 1024)).toLocaleString(`pt-BR`, {
            maximumFractionDigits: 1,
          }) +
          ` MB · ` +
          (r?.serial || `arquivo local`)),
        G(
          `Arquivo selecionado: ${e.name}${r ? ` · PS2 · BOOT2=${r.boot}` : ``}`,
        ),
        (i(`screen-title`).textContent = `Seu jogo está selecionado.`),
        (i(`screen-hint`).textContent =
          `Clique em Iniciar jogo para testar a emulação.`),
        (p.hidden = !0),
        X(_ ? `ready` : `selected`, `Arquivo selecionado`));
    } catch (e) {
      t === y && !S && (X(n, r), $(e, !1));
    }
  }
  async function ke() {
    return (
      _ ||
      se ||
      ((se = (async () => {
        if (!window.crossOriginIsolated || typeof SharedArrayBuffer > `u`)
          throw Error(
            `Abra este site em uma nova aba do navegador para iniciar o emulador. A visualização dentro do ChatGPT pode não permitir a emulação.`,
          );
        let t = document.createElement(`canvas`).getContext(`webgl2`);
        if (!t)
          throw Error(
            `Este navegador não disponibilizou os gráficos necessários. Use Chrome ou Firefox com aceleração de hardware ativada.`,
          );
        (t.getExtension(`WEBGL_lose_context`)?.loseContext(),
          K(`Carregando módulo`),
          await xe(),
          K(`Baixando núcleo`));
        const progress = i(`core-progress`);
        progress.hidden = false;
        let o;
        try {
          o = await downloadCore(`/core/Play.wasm`, {
            signal: AbortSignal.timeout(45e3),
            onProgress(loaded, total) {
              if (total > 0) { progress.max = total; progress.value = Math.min(loaded, total); }
              else progress.removeAttribute(`value`);
              const detail = `Baixando núcleo · ${(loaded / 1024 / 1024).toLocaleString(`pt-BR`, { maximumFractionDigits: 1 })} MB`;
              f.textContent = detail;
              i(`engine-status`).textContent = detail;
            },
          });
        } finally { progress.hidden = true; }
        if (
          (K(`Verificando processos do navegador`),
          (A = await n(o, {
            record: G,
            onFault: (e) => {
              ((k = e.message),
                e.workerStack && G(`Detalhes do processo: ` + e.workerStack),
                $(e));
            },
          })),
          S || v === `error`)
        )
          throw (A.dispose(), Error(k || `A página foi encerrada.`));
        K(`Iniciando núcleo e processos`);
        let s = await b(
          () =>
            window.Play({
              canvas: a,
              wasmBinary: o,
              ...A.options,
              locateFile: (e) => `/core/` + e,
              print: (e) => {
                (console.info(`Play!:`, e),
                  /Play!|failed|error|exception|abort|boot/i.test(e) && G(e),
                  /Failed to start:/i.test(e) &&
                    $(
                      Error(
                        `O emulador não conseguiu iniciar este jogo. Confira o arquivo e a compatibilidade da versão de PS2.`,
                      ),
                    ));
              },
              printErr: (e) => {
                (console.warn(`Play!:`, e),
                  (k = String(e).slice(0, 500)),
                  G(k),
                  /worker sent an error/i.test(e)
                    ? $(
                        Error(
                          `Um processo do núcleo falhou ao carregar ou executar.` +
                            (j ? ` Bloqueio: ` + j : ``) +
                            ` Confira os detalhes no diagnóstico abaixo.`,
                        ),
                      )
                    : /Aborted\(|out of memory|failed to allocate executable memory/i.test(
                        e,
                      ) && $(Error(`Falha no núcleo: ` + k)));
              },
              onAbort: (e) =>
                $(
                  Error(
                    `O núcleo interrompeu a execução` +
                      (e ? `: ` + String(e).slice(0, 300) : `.`) +
                      ` Recarregue para tentar novamente.`,
                  ),
                ),
            }),
          e,
          () =>
            `O núcleo não terminou de iniciar. Etapa: ` +
            O +
            (k
              ? `. Último erro: ` + k
              : `. Os processos de execução podem ter sido bloqueados pelo navegador. Abra o site em uma nova aba e recarregue.`),
        );
        if (S) throw Error(`A página foi encerrada.`);
        if (v === `error`)
          throw Error(k || `A inicialização do núcleo falhou.`);
        ((_ = s),
          K(`Preparando console`),
          _.FS.analyzePath(`/work`).exists || _.FS.mkdir(`/work`),
          (_.discImageDevice = new be(_, () =>
            $(
              Error(
                `A leitura do arquivo do jogo falhou. Confira se ele continua disponível no dispositivo.`,
              ),
            ),
          )),
          B.attach(_));
        const appliedGraphics = applyCoreGraphics(_, graphicsPreferences.getSnapshot().preferences);
        _.ccall(`initVm`, null, [], []);
        if (v === `error`) throw Error(`O núcleo não conseguiu inicializar.`);
        graphicsPreferences.markApplied(appliedGraphics);
        G(`Gráficos preparados: ${appliedGraphics.resolutionScale}× · ${appliedGraphics.bilinearFiltering ? `bilinear forçado` : `filtro do jogo`}.`);
        return (
          (i(`engine-status`).textContent = `Pronto`),
          (O = `Console preparado`),
          G(`Console preparado.`),
          (l.textContent = `Emulador preparado`),
          X(`ready`, g ? `Pronto para iniciar` : `Emulador preparado`),
          Y(
            `Emulador preparado. Selecione o arquivo do jogo e clique em Iniciar jogo.`,
            `success`,
          ),
          _
        );
      })()),
      se)
    );
  }
  async function Ae() {
    if (!(M || !g || v === `loading` || v === `starting` || v === `error`))
      try {
        let e = await ke();
        if (
          (Q(),
          (x = !0),
          (le = performance.now()),
          (D = !1),
          ve(),
          e.clearStats(),
          (C = le),
          X(`starting`, `Iniciando jogo`),
          (O = `Iniciando jogo`),
          G(`Solicitando inicialização de ${g.name}.`),
          (p.hidden = !0),
          oe === `elf`)
        ) {
          let t = new Uint8Array(await g.arrayBuffer());
          (e.FS.writeFile(`/work/game.elf`, t), e.bootElf(`/work/game.elf`));
        } else (e.discImageDevice.setFile(g), e.bootDiscImage(`game.` + oe));
        if (v === `error`) return;
        ((E = setTimeout(() => {
          if (((E = null), S || v !== `starting` || D)) return;
          try {
            if (e.getFrames() > 0) {
              Se();
              return;
            }
          } catch {}
          ((O = `Início do jogo não confirmado`),
            X(`stalled`, `Início não confirmado`),
            Y(
              `O jogo não produziu quadros em ` +
                Math.round(t / 1e3) +
                ` segundos. Copie o diagnóstico abaixo para identificarmos a causa. O núcleo continua executando e a sessão será reconhecida se produzir quadros.`,
            ));
          let n = i(`diagnostic-panel`);
          (n && (n.open = !0),
            G(
              `O núcleo ainda não produziu quadros; verificando possível demora ou travamento.`,
            ));
        }, t)),
          (m.hidden = !0),
          a.focus({ preventScroll: !0 }),
          (i(`focus-hint`).textContent = `Clique na tela para jogar`),
          q());
      } catch (e) {
        $(e);
      }
  }
  (J(o, `change`, () => {
    (Oe(o.files?.[0]), (o.value = ``));
  }),
    I &&
      J(I, `change`, () => {
        (Te(I.files?.[0]), (I.value = ``));
      }),
    L &&
      J(L, `click`, () => {
        L.disabled || I.click();
      }),
    R && J(R, `click`, Ee),
    i(`clear-save`) &&
      J(i(`clear-save`), `click`, () => {
        i(`clear-save`).disabled ||
          (B.clear(),
          (pendingDownloadVersion = null),
          (i(`confirm-save-download`).hidden = true),
          (P = null),
          (i(`save-title`).textContent = `Carregar SAVE · opcional`),
          (i(`save-detail`).textContent = `Arquivo .dssave do Digital Station`),
          we());
      }));
  J(i(`confirm-save-download`), `click`, () => {
    if (pendingDownloadVersion === null) return;
    B.markDownloaded(pendingDownloadVersion);
    pendingDownloadVersion = null;
    i(`confirm-save-download`).hidden = true;
    Y(`Cópia de SAVE confirmada. Novas gravações exigem uma nova cópia.`, `success`);
    we();
  });
  J(i(`recover-backup`), `click`, async () => {
    if (!backupRecord || i(`recover-backup`).disabled) return;
    const file = new File([backupRecord.blob], `Recuperado-Digital-Station.dssave`, { type: `application/json` });
    await Te(file);
    if (P === file) Y(`Progresso recuperado do backup local. Selecione o mesmo jogo para continuar.`, `success`);
  });
  J(i(`delete-backup`), `click`, async () => {
    if (i(`delete-backup`).disabled || (!backupRecord && !backupError) || backupRemoving || !window.confirm(`Excluir o backup deste navegador? Seu cartão da sessão e os arquivos SAVE baixados serão preservados.`)) return;
    backupRemoving = true;
    backupEpoch += 1;
    backupNeedsWrite = false;
    clearTimeout(backupTimer);
    updateBackupControls();
    try {
      await backupStore.deleteLatest();
      backupRecord = null;
      backupError = null;
    } catch (error) { backupError = error.message; }
    finally { backupRemoving = false; updateBackupControls(); if (backupNeedsWrite) scheduleBackup(); }
  });
  let je = () => {
    s.disabled || o.click();
  };
  (J(s, `click`, je),
    J(i(`choose-screen`), `click`, je),
    J(s, `dragover`, (e) => {
      (e.preventDefault(), s.disabled || s.classList.add(`dragging`));
    }),
    J(s, `dragleave`, () => s.classList.remove(`dragging`)),
    J(s, `drop`, (e) => {
      (e.preventDefault(),
        s.classList.remove(`dragging`),
        Oe(e.dataTransfer.files[0]));
    }),
    J(window, `dragover`, (e) => {
      [...(e.dataTransfer?.types || [])].includes(`Files`) &&
        e.preventDefault();
    }),
    J(window, `drop`, (e) => e.preventDefault()),
    J(c, `click`, Ae),
    J(u, `click`, Ae),
    J(l, `click`, async () => {
      try {
        await ke();
      } catch (e) {
        $(e);
      }
    }),
    J(i(`diagnostic-panel`), `toggle`, () => {
      if (i(`diagnostic-panel`).open && U) U.textContent = W();
    }),
    ge &&
      J(ge, `click`, async () => {
        U && (U.textContent = W());
        let e = i(`diagnostic-panel`);
        e && (e.open = !0);
        try {
          if (!navigator.clipboard?.writeText)
            throw Error(`Clipboard unavailable`);
          (await navigator.clipboard.writeText(W()),
            (ge.textContent = `Diagnóstico copiado`));
        } catch {
          ge.textContent = `Selecione e copie o texto abaixo`;
        }
      }),
    J(window, `error`, (e) => {
      [`loading`, `starting`, `stalled`, `running`].includes(v) &&
        /\/core\//.test(e.filename || ``) &&
        $(
          Error(
            `Erro do emulador: ` +
              (e.message ||
                e.error?.message ||
                `falha no processo de execução`),
          ),
        );
    }),
    J(document, `securitypolicyviolation`, (e) => {
      /worker-src|script-src|default-src/.test(e.violatedDirective || ``) &&
        ((j = `${e.violatedDirective}: ${e.blockedURI || `recurso bloqueado`}`),
        G(`Política de segurança bloqueou ` + j));
    }),
    J(a, `webglcontextlost`, (e) => {
      (e.preventDefault(),
        _ &&
          $(
            Error(
              `O navegador perdeu o contexto gráfico. Recarregue a página para iniciar uma nova sessão.`,
            ),
          ));
    }),
    J(d, `click`, () => {
      (B.hasChanges &&
        !window.confirm(
          `O cartão mudou desde o último download. Encerre apenas se já tiver guardado seu SAVE. Encerrar sem baixar?`,
        )) ||
        ((he = !0), Q(), window.location.reload());
    }),
    J(window, `beforeunload`, (e) => {
      B.hasChanges && !he && (e.preventDefault(), (e.returnValue = ``));
    }),
    J(window, `pagehide`, () => { void flushBackup(); }),
    J(a, `click`, () => a.focus({ preventScroll: !0 })),
    J(a, `blur`, Q),
    J(i(`fullscreen`), `click`, async () => {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else if (i(`screen`).requestFullscreen)
          await i(`screen`).requestFullscreen();
        else
          throw Error(`Este navegador não oferece tela cheia para o emulador.`);
        a.focus({ preventScroll: !0 });
      } catch (e) {
        $(e, !1);
      }
    }));
  for (let e of [`keydown`, `keyup`])
    J(
      document,
      e,
      (t) => {
        if (!t.isTrusted || t.target !== a) return;
        let n = ie.get(t.code),
          r = e === `keyup` ? n : de(V.profile, t.code);
        if (
          !r ||
          V.capturing ||
          t.metaKey ||
          (t.ctrlKey && !/^Control/.test(t.code) && e !== `keyup`)
        ) {
          t.stopPropagation();
          return;
        }
        (t.preventDefault(),
          t.stopPropagation(),
          t.repeat ||
            (e === `keydown` ? ie.set(t.code, r) : ie.delete(t.code),
            Z(r, e === `keydown`, `keyboard-` + t.code)));
      },
      !0,
    );
  (J(window, `blur`, Ce),
    J(window, `focus`, resumeSessionUi),
    J(document, `visibilitychange`, () => {
      document.hidden ? Ce() : resumeSessionUi();
    }));
  for (let e of document.querySelectorAll(`[data-code]`)) {
    let t = `touch-` + e.dataset.code;
    J(e, `pointerdown`, (n) => {
      (n.preventDefault(),
        !(!x || v === `error`) &&
          (e.setPointerCapture(n.pointerId),
          e.classList.add(`pressed`),
          a.focus({ preventScroll: !0 }),
          Z(e.dataset.code, !0, t)));
    });
    let n = () => {
      (e.classList.remove(`pressed`), Z(e.dataset.code, !1, t));
    };
    (J(e, `pointerup`, n),
      J(e, `pointercancel`, n),
      J(e, `lostpointercapture`, n),
      J(e, `click`, (n) => {
        n.detail === 0 &&
          (Z(e.dataset.code, !0, t),
          setTimeout(() => Z(e.dataset.code, !1, t), 100));
      }));
  }
  function Me(e) {
    if (((w = null), !S)) {
      if (x && v !== `error` && !document.hidden && document.hasFocus()) {
        let t = pe(),
          n = t && !V.capturing ? fe(t, V.profile) : ne;
        for (let e of ae) n.has(e) || Z(e, !1, `gamepad`);
        for (let e of n) ae.has(e) || Z(e, !0, `gamepad`);
        if (
          ((ae = n),
          !!t !== T &&
            ((T = !!t),
            (ee.textContent = T ? `Controle conectado` : `Teclado / controle`)),
          e - C >= 1e3)
        ) {
          let t = e - C;
          C = e;
          try {
            let e = _.getFrames();
            _.clearStats();
            let n =
              (Math.round((e * 1e4) / t) / 10).toLocaleString(`pt-BR`, {
                maximumFractionDigits: 1,
              }) + ` FPS`;
            (te.textContent !== n && (te.textContent = n),
              e > 0 && (v === `starting` || v === `stalled`) && Se());
          } catch {
            $(
              Error(
                `Não foi possível acompanhar a execução. Encerre a sessão e tente novamente.`,
              ),
            );
          }
        }
      }
      q();
    }
  }
  return () => {
    ((S = !0),
      clearTimeout(backupTimer),
      backupStore.dispose(),
      V.dispose(),
      B.dispose(),
      N++,
      F !== null && cancelAnimationFrame(F),
      A?.dispose(),
      ve(),
      Q(),
      w !== null && cancelAnimationFrame(w),
      re.forEach((e) => e()));
  };
}
function Ce() {
  return (
    (0, l.useEffect)(() => Se(), []),
    (0, q.jsxs)(`main`, {
      className: `app-shell`,
      children: [
        (0, q.jsxs)(`header`, {
          className: `site-header`,
          children: [
            (0, q.jsxs)(`a`, {
              className: `brand`,
              href: `/`,
              "aria-label": `Digital Station, início`,
              children: [
                (0, q.jsx)(`span`, {
                  className: `brand-mark`,
                  children: (0, q.jsx)(re, { size: 23, strokeWidth: 1.8 }),
                }),
                (0, q.jsxs)(`span`, {
                  children: [
                    `digital`,
                    (0, q.jsx)(`span`, {
                      className: `brand-light`,
                      children: `station`,
                    }),
                    (0, q.jsx)(`small`, { children: `PLAYSTATION 2 · WEB` }),
                  ],
                }),
              ],
            }),
            (0, q.jsxs)(`div`, {
              className: `header-tools`,
              children: [
                (0, q.jsxs)(`span`, {
                  className: `experimental`,
                  children: [(0, q.jsx)(`span`, {}), ` Experimental`],
                }),
                (0, q.jsxs)(`a`, {
                  id: `open-tab`,
                  href: `/`,
                  target: `_blank`,
                  rel: `noopener`,
                  children: [`Nova aba `, (0, q.jsx)(m, { size: 15 })],
                }),
              ],
            }),
          ],
        }),
        (0, q.jsxs)(`section`, {
          className: `intro`,
          children: [
            (0, q.jsx)(`p`, {
              className: `eyebrow`,
              children: `SEU PRÓXIMO PLAY COMEÇA AQUI`,
            }),
            (0, q.jsxs)(`h1`, {
              children: [
                `PS2 no seu `,
                (0, q.jsx)(`span`, { children: `navegador.` }),
              ],
            }),
            (0, q.jsx)(`p`, {
              className: `intro-copy`,
              children: `Seu jogo, seus controles. Carregue um arquivo local e teste a emulação.`,
            }),
          ],
        }),
        (0, q.jsx)(BrowserReadiness, {}),
        (0, q.jsx)(`div`, {
          id: `notice`,
          className: `notice`,
          role: `status`,
          "aria-live": `polite`,
          hidden: !0,
        }),
        (0, q.jsxs)(`div`, {
          className: `emulator-layout`,
          children: [
            (0, q.jsxs)(`section`, {
              className: `console-panel`,
              "aria-label": `Tela do emulador`,
              children: [
                (0, q.jsxs)(`div`, {
                  className: `console-top`,
                  children: [
                    (0, q.jsxs)(`span`, {
                      className: `console-label`,
                      children: [(0, q.jsx)(ae, { size: 15 }), ` CONSOLE`],
                    }),
                    (0, q.jsx)(`span`, {
                      id: `runtime-status`,
                      className: `runtime-status`,
                      children: `Aguardando arquivo`,
                    }),
                  ],
                }),
                (0, q.jsxs)(`div`, {
                  className: `screen`,
                  id: `screen`,
                  children: [
                    (0, q.jsx)(`canvas`, {
                      id: `outputCanvas`,
                      width: `640`,
                      height: `480`,
                      tabIndex: 0,
                      "aria-label": `Tela do jogo. Clique para usar os controles do teclado.`,
                    }),
                    (0, q.jsxs)(`div`, {
                      id: `screen-empty`,
                      className: `screen-empty`,
                      children: [
                        (0, q.jsx)(`div`, {
                          className: `empty-icon`,
                          children: (0, q.jsx)(te, {
                            size: 44,
                            strokeWidth: 1.2,
                          }),
                        }),
                        (0, q.jsx)(`p`, {
                          className: `empty-kicker`,
                          children: `NENHUM JOGO CARREGADO`,
                        }),
                        (0, q.jsx)(`h2`, {
                          id: `screen-title`,
                          children: `Dê vida ao seu console.`,
                        }),
                        (0, q.jsx)(`p`, {
                          id: `screen-hint`,
                          children: `Selecione a ISO do seu jogo para começar.`,
                        }),
                        (0, q.jsxs)(`button`, {
                          className: `primary-button`,
                          id: `choose-screen`,
                          type: `button`,
                          children: [
                            (0, q.jsx)(y, { size: 17 }),
                            ` Carregar jogo`,
                          ],
                        }),
                      ],
                    }),
                    (0, q.jsx)(`span`, {
                      className: `screen-corner corner-tl`,
                    }),
                    (0, q.jsx)(`span`, {
                      className: `screen-corner corner-tr`,
                    }),
                    (0, q.jsx)(`span`, {
                      className: `screen-corner corner-bl`,
                    }),
                    (0, q.jsx)(`span`, {
                      className: `screen-corner corner-br`,
                    }),
                  ],
                }),
                (0, q.jsxs)(`div`, {
                  className: `console-bottom`,
                  children: [
                    (0, q.jsx)(`span`, { id: `fps`, children: `— FPS` }),
                    (0, q.jsx)(`span`, {
                      id: `focus-hint`,
                      children: `640 × 480 · 4:3`,
                    }),
                    (0, q.jsx)(`button`, {
                      id: `fullscreen`,
                      className: `icon-button`,
                      type: `button`,
                      "aria-label": `Tela cheia`,
                      children: (0, q.jsx)(ie, { size: 17 }),
                    }),
                  ],
                }),
              ],
            }),
            (0, q.jsxs)(`aside`, {
              className: `session-panel`,
              children: [
                (0, q.jsxs)(`div`, {
                  className: `panel-heading`,
                  children: [
                    (0, q.jsx)(`h2`, { children: `Sua sessão` }),
                    (0, q.jsx)(te, { size: 20 }),
                  ],
                }),
                (0, q.jsxs)(`button`, {
                  id: `drop-zone`,
                  className: `drop-zone`,
                  type: `button`,
                  children: [
                    (0, q.jsx)(`span`, {
                      className: `upload-icon`,
                      children: (0, q.jsx)(y, { size: 24, strokeWidth: 1.6 }),
                    }),
                    (0, q.jsx)(`strong`, {
                      id: `file-title`,
                      children: `Escolha o arquivo do jogo`,
                    }),
                    (0, q.jsx)(`span`, {
                      id: `file-detail`,
                      children: `Clique ou arraste o arquivo aqui`,
                    }),
                    (0, q.jsx)(`small`, {
                      children: `ISO · CSO · CHD · ISZ · BIN · ELF`,
                    }),
                  ],
                }),
                (0, q.jsx)(`input`, {
                  id: `game-file`,
                  type: `file`,
                  accept: `.iso,.cso,.chd,.isz,.bin,.elf`,
                  hidden: !0,
                }),
                (0, q.jsxs)(`div`, {
                  className: `local-note`,
                  children: [
                    (0, q.jsx)(v, { size: 16 }),
                    (0, q.jsx)(`span`, {
                      children: `O arquivo fica no seu dispositivo.`,
                    }),
                  ],
                }),
                (0, q.jsxs)(`div`, {
                  className: `save-section`,
                  "aria-label": `Arquivo de progresso`,
                  children: [
                    (0, q.jsxs)(`div`, {
                      className: `save-heading`,
                      children: [
                        (0, q.jsx)(se, { size: 15 }),
                        (0, q.jsx)(`span`, { children: `SEU PROGRESSO` }),
                      ],
                    }),
                    (0, q.jsxs)(`button`, {
                      id: `load-save`,
                      className: `save-picker`,
                      type: `button`,
                      children: [
                        (0, q.jsx)(y, { size: 18 }),
                        (0, q.jsxs)(`span`, {
                          children: [
                            (0, q.jsx)(`strong`, {
                              id: `save-title`,
                              children: `Carregar SAVE · opcional`,
                            }),
                            (0, q.jsx)(`small`, {
                              id: `save-detail`,
                              children: `Arquivo .dssave do Digital Station`,
                            }),
                          ],
                        }),
                      ],
                    }),
                    (0, q.jsx)(`input`, {
                      id: `save-file`,
                      type: `file`,
                      accept: `.dssave`,
                      hidden: !0,
                    }),
                    (0, q.jsx)(`button`, {
                      id: `clear-save`,
                      className: `text-button`,
                      type: `button`,
                      hidden: !0,
                      children: `Remover SAVE carregado`,
                    }),
                    (0, q.jsxs)(`button`, {
                      id: `download-save`,
                      className: `secondary-button wide`,
                      type: `button`,
                      disabled: !0,
                      children: [(0, q.jsx)(ne, { size: 16 }), ` Baixar SAVE`],
                    }),
                    (0, q.jsx)(`p`, {
                      id: `save-status`,
                      className: `save-status`,
                      role: `status`,
                      "aria-live": `polite`,
                      children: `Carregue seu SAVE antes de iniciar, se já tiver um.`,
                    }),
                    (0, q.jsx)(`button`, {
                      id: `confirm-save-download`, className: `text-button`, type: `button`, hidden: true,
                      children: `Confirmar que guardei o SAVE`,
                    }),
                    (0, q.jsx)(`p`, {
                      id: `backup-status`, className: `backup-status`, role: `status`, "aria-live": `polite`,
                      children: `Verificando backup local…`,
                    }),
                    (0, q.jsxs)(`div`, {
                      className: `backup-actions`, children: [
                        (0, q.jsx)(`button`, { id: `recover-backup`, className: `text-button`, type: `button`, hidden: true, children: `Recuperar último progresso` }),
                        (0, q.jsx)(`button`, { id: `delete-backup`, className: `text-button`, type: `button`, hidden: true, children: `Excluir backup local` }),
                      ],
                    }),
                    (0, q.jsx)(`p`, {
                      className: `save-help`,
                      children: `Salve pelo próprio jogo. Os cartões recebem um backup neste navegador após a gravação; aguarde a confirmação acima. Baixe também o SAVE para usar em outro dispositivo. Limpar os dados do navegador remove o backup. O jogo e o progresso não são enviados ao servidor.`,
                    }),
                  ],
                }),
                (0, q.jsx)(`div`, { className: `session-divider` }),
                (0, q.jsxs)(`dl`, {
                  className: `session-facts`,
                  children: [
                    (0, q.jsxs)(`div`, {
                      children: [
                        (0, q.jsx)(`dt`, { children: `Plataforma` }),
                        (0, q.jsx)(`dd`, { children: `PlayStation 2` }),
                      ],
                    }),
                    (0, q.jsxs)(`div`, {
                      children: [
                        (0, q.jsx)(`dt`, { children: `Emulador` }),
                        (0, q.jsx)(`dd`, {
                          id: `engine-status`,
                          children: `A preparar`,
                        }),
                      ],
                    }),
                    (0, q.jsxs)(`div`, {
                      children: [
                        (0, q.jsx)(`dt`, { children: `Entrada` }),
                        (0, q.jsx)(`dd`, {
                          id: `input-status`,
                          children: `Teclado / controle`,
                        }),
                      ],
                    }),
                  ],
                }),
                (0, q.jsxs)(`button`, {
                  id: `start`,
                  className: `primary-button wide`,
                  type: `button`,
                  disabled: !0,
                  children: [
                    (0, q.jsx)(g, { size: 17, fill: `currentColor` }),
                    ` Iniciar jogo`,
                  ],
                }),
                (0, q.jsxs)(`button`, {
                  id: `check-core`,
                  className: `text-button wide`,
                  type: `button`,
                  children: [
                    (0, q.jsx)(ee, { size: 15 }),
                    ` Verificar emulador sem ISO`,
                  ],
                }),
                (0, q.jsx)(`progress`, {
                  id: `core-progress`, className: `load-progress`, "aria-label": `Download do núcleo`, hidden: true,
                }),
                (0, q.jsxs)(`div`, {
                  className: `session-actions`,
                  children: [
                    (0, q.jsxs)(`button`, {
                      id: `restart`,
                      type: `button`,
                      disabled: !0,
                      children: [(0, q.jsx)(_, { size: 15 }), ` Reiniciar`],
                    }),
                    (0, q.jsxs)(`button`, {
                      id: `stop`,
                      type: `button`,
                      disabled: !0,
                      children: [(0, q.jsx)(oe, { size: 15 }), ` Encerrar`],
                    }),
                  ],
                }),
                (0, q.jsx)(`p`, {
                  className: `session-note`,
                  children: `Melhor experiência em um computador com Chrome ou Firefox. Antes de encerrar, baixe seu SAVE atualizado.`,
                }),
              ],
            }),
          ],
        }),
        (0, q.jsx)(GraphicsSettings, {}),
        (0, q.jsxs)(`details`, {
          className: `controls-panel`,
          open: !0,
          children: [
            (0, q.jsxs)(`summary`, {
              children: [
                (0, q.jsxs)(`span`, {
                  children: [
                    (0, q.jsx)(h, { size: 19 }),
                    ` Controles `,
                    (0, q.jsx)(`small`, { children: `TECLADO E GAMEPAD` }),
                  ],
                }),
                (0, q.jsx)(`span`, {
                  className: `summary-toggle`,
                  children: `⌄`,
                }),
              ],
            }),
            (0, q.jsxs)(`div`, {
              className: `mapping-toolbar`,
              children: [
                (0, q.jsx)(`p`, {
                  children: `Clique no vínculo que deseja alterar e pressione a nova tecla ou botão do controle.`,
                }),
                (0, q.jsxs)(`button`, {
                  id: `reset-mapping`,
                  className: `secondary-button`,
                  type: `button`,
                  children: [(0, q.jsx)(_, { size: 14 }), ` Restaurar padrão`],
                }),
              ],
            }),
            (0, q.jsx)(`div`, {
              className: `mapping-table-wrap`,
              children: (0, q.jsxs)(`table`, {
                className: `mapping-table`,
                children: [
                  (0, q.jsx)(`caption`, {
                    className: `sr-only`,
                    children: `Mapeamento dos botões do PlayStation 2 para teclado e controle conectado`,
                  }),
                  (0, q.jsx)(`thead`, {
                    children: (0, q.jsxs)(`tr`, {
                      children: [
                        (0, q.jsx)(`th`, {
                          scope: `col`,
                          children: `Botão PS2`,
                        }),
                        (0, q.jsx)(`th`, { scope: `col`, children: `Teclado` }),
                        (0, q.jsx)(`th`, {
                          scope: `col`,
                          children: `Controle`,
                        }),
                      ],
                    }),
                  }),
                  (0, q.jsx)(`tbody`, {
                    children: D.map((e) =>
                      (0, q.jsxs)(
                        `tr`,
                        {
                          children: [
                            (0, q.jsx)(`th`, {
                              scope: `row`,
                              children: e.label,
                            }),
                            (0, q.jsx)(`td`, {
                              children: (0, q.jsx)(`button`, {
                                type: `button`,
                                "data-bind-key": e.id,
                                "aria-label": `Alterar tecla de ${e.label}`,
                                children: A(e.key),
                              }),
                            }),
                            (0, q.jsx)(`td`, {
                              children: (0, q.jsx)(`button`, {
                                type: `button`,
                                "data-bind-pad": e.id,
                                "aria-label": `Alterar controle de ${e.label}`,
                                children: j(e.pad),
                              }),
                            }),
                          ],
                        },
                        e.id,
                      ),
                    ),
                  }),
                ],
              }),
            }),
            (0, q.jsxs)(`div`, {
              className: `mapping-feedback`,
              children: [
                (0, q.jsx)(`p`, {
                  id: `mapping-status`,
                  role: `status`,
                  "aria-live": `polite`,
                  children: `Suas preferências de controles ficam guardadas neste navegador.`,
                }),
                (0, q.jsx)(`button`, {
                  id: `cancel-mapping`,
                  className: `secondary-button`,
                  type: `button`,
                  hidden: !0,
                  children: `Cancelar`,
                }),
              ],
            }),
            (0, q.jsx)(`p`, {
              className: `controls-note`,
              children: `Clique na tela do jogo para usar o teclado. No controle USB ou Bluetooth, pressione um botão para detectá-lo. Um vínculo repetido troca os dois botões, sem deixar comandos duplicados.`,
            }),
          ],
        }),
        (0, q.jsxs)(`details`, {
          className: `touch-panel`,
          children: [
            (0, q.jsxs)(`summary`, {
              children: [(0, q.jsx)(re, { size: 19 }), ` Controle na tela`],
            }),
            (0, q.jsxs)(`div`, {
              className: `touch-controls`,
              "aria-label": `Controle virtual`,
              children: [
                (0, q.jsxs)(`div`, {
                  className: `virtual-dpad`,
                  children: [
                    (0, q.jsx)(`button`, {
                      "data-code": `KeyT`,
                      className: `pad-up`,
                      "aria-label": `Analógico para cima`,
                      children: `↑`,
                    }),
                    (0, q.jsx)(`button`, {
                      "data-code": `KeyF`,
                      className: `pad-left`,
                      "aria-label": `Analógico para esquerda`,
                      children: `←`,
                    }),
                    (0, q.jsx)(`button`, {
                      "data-code": `KeyG`,
                      className: `pad-down`,
                      "aria-label": `Analógico para baixo`,
                      children: `↓`,
                    }),
                    (0, q.jsx)(`button`, {
                      "data-code": `KeyH`,
                      className: `pad-right`,
                      "aria-label": `Analógico para direita`,
                      children: `→`,
                    }),
                  ],
                }),
                (0, q.jsxs)(`div`, {
                  className: `virtual-middle`,
                  children: [
                    (0, q.jsx)(`button`, {
                      "data-code": `Enter`,
                      children: `START`,
                    }),
                    (0, q.jsx)(`button`, {
                      "data-code": `Backspace`,
                      children: `SELECT`,
                    }),
                    (0, q.jsxs)(`div`, {
                      children: [
                        (0, q.jsx)(`button`, {
                          "data-code": `Key1`,
                          children: `L1`,
                        }),
                        (0, q.jsx)(`button`, {
                          "data-code": `Key8`,
                          children: `R1`,
                        }),
                      ],
                    }),
                  ],
                }),
                (0, q.jsxs)(`div`, {
                  className: `virtual-dpad`,
                  children: [
                    (0, q.jsx)(`button`, {
                      "data-code": `KeyS`,
                      className: `pad-up green`,
                      "aria-label": `Triângulo`,
                      children: `△`,
                    }),
                    (0, q.jsx)(`button`, {
                      "data-code": `KeyA`,
                      className: `pad-left pink`,
                      "aria-label": `Quadrado`,
                      children: `□`,
                    }),
                    (0, q.jsx)(`button`, {
                      "data-code": `KeyZ`,
                      className: `pad-down blue`,
                      "aria-label": `Cruz`,
                      children: `×`,
                    }),
                    (0, q.jsx)(`button`, {
                      "data-code": `KeyX`,
                      className: `pad-right red`,
                      "aria-label": `Círculo`,
                      children: `○`,
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
        (0, q.jsxs)(`details`, {
          className: `diagnostic-panel controls-panel`,
          id: `diagnostic-panel`,
          children: [
            (0, q.jsxs)(`summary`, {
              children: [
                (0, q.jsxs)(`span`, {
                  children: [
                    (0, q.jsx)(ee, { size: 19 }),
                    ` Diagnóstico da sessão`,
                  ],
                }),
                (0, q.jsx)(`span`, {
                  className: `summary-toggle`,
                  children: `⌄`,
                }),
              ],
            }),
            (0, q.jsxs)(`div`, {
              className: `diagnostic-content`,
              children: [
                (0, q.jsx)(`p`, {
                  children: `Se o jogo não iniciar, copie este diagnóstico e envie na conversa. Ele contém as etapas e os erros, sem o conteúdo da ISO.`,
                }),
                (0, q.jsx)(`button`, {
                  className: `session-diagnostic-button`,
                  id: `copy-diagnostic`,
                  type: `button`,
                  children: `Copiar diagnóstico`,
                }),
                (0, q.jsx)(`pre`, {
                  id: `diagnostic-output`,
                  children: `Aguardando a seleção do jogo.`,
                }),
              ],
            }),
          ],
        }),
        (0, q.jsxs)(`footer`, {
          children: [
            (0, q.jsxs)(`p`, {
              children: [
                `Interface Digital Station · Núcleo `,
                (0, q.jsx)(`a`, {
                  href: `https://purei.org/`,
                  target: `_blank`,
                  rel: `noopener`,
                  children: `Play!`,
                }),
              ],
            }),
            (0, q.jsxs)(`p`, {
              children: [
                `A compatibilidade varia entre jogos. `,
                (0, q.jsx)(`a`, {
                  href: `/core/License.txt`,
                  target: `_blank`,
                  rel: `noopener`,
                  children: `Licença do núcleo`,
                }),
              ],
            }),
          ],
        }),
      ],
    })
  );
}
export { Ce as default };
