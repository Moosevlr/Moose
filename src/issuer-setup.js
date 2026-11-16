import QRCode from 'qrcode/lib/browser.js';
import './issuer-setup.css';

const CODE = /^[A-Za-z0-9_-]{43}$/;
const SHA = /^[a-f0-9]{40}$/i;
const PUBLIC_FIELDS = ['holderName', 'enrollment', 'course', 'issuer', 'issuerTagline', 'validThrough'];
const escape = (value = '') => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);
const civilDate = value => value.split('-').reverse().join('/');
const qrOptions = { type: 'svg', errorCorrectionLevel: 'M', margin: 4, width: 600, color: { dark: '#000000', light: '#ffffff' } };

function decodeFragment(fragment) {
  if (!fragment || fragment.length > 32768 || !/^[A-Za-z0-9_-]+$/.test(fragment)) throw new Error('missing');
  const base64 = fragment.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64 + '='.repeat((4 - base64.length % 4) % 4));
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, character => character.charCodeAt(0))));
}

async function validateSetup(input) {
  if (!input || Array.isArray(input) || typeof input !== 'object' || input.origin !== location.origin ||
      new URL(input.origin).origin !== input.origin || !CODE.test(input.key) || !CODE.test(input.token) || !SHA.test(input.commit)) {
    throw new Error('invalid');
  }
  const record = input.record;
  if (!record || Array.isArray(record) || typeof record !== 'object' || record.schemaVersion !== 1 ||
      record.status !== 'active' || record.issuer !== 'JCB ENGENHARIA' || record.validThrough !== '2027-03-31' ||
      record.timeZone !== 'America/Sao_Paulo' || record.canonicalOrigin !== input.origin ||
      PUBLIC_FIELDS.some(field => typeof record[field] !== 'string' || !record[field].trim() || record[field].length > 2048 || /[\x00-\x1f\x7f]/.test(record[field]))) {
    throw new Error('invalid');
  }
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input.token));
  const expectedHash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  if (record.tokenSha256 !== expectedHash) throw new Error('invalid');
  return input;
}

function reviewFields(record) {
  return `<dl class="issuer-review-fields"><div><dt>Titular</dt><dd>${escape(record.holderName)}</dd></div><div><dt>Matrícula</dt><dd>${escape(record.enrollment)}</dd></div><div><dt>Curso</dt><dd>${escape(record.course)}</dd></div><div><dt>Validade</dt><dd>${escape(civilDate(record.validThrough))}</dd></div></dl>`;
}

function textLines(text, width, maxLines, maxSize = 23) {
  for (let size = maxSize; size >= 10; size -= 1) {
    const limit = Math.floor(width / (size * .56));
    const lines = [];
    let line = '';
    for (const word of text.split(/\s+/)) {
      if (word.length > limit) {
        if (line) { lines.push(line); line = ''; }
        for (let index = 0; index < word.length; index += limit) lines.push(word.slice(index, index + limit));
      } else if (line && `${line} ${word}`.length > limit) { lines.push(line); line = word; }
      else line = line ? `${line} ${word}` : word;
    }
    if (line) lines.push(line);
    if (lines.length <= maxLines) return { size, lines };
  }
  throw new Error('Os dados são longos demais para o cartão. Solicite à instituição um layout adequado.');
}

function svgText(text, x, y, width, maxLines, maxSize = 23) {
  const { size, lines } = textLines(text, width, maxLines, maxSize);
  return `<text x="${x}" y="${y}" font-size="${size}" font-weight="700" fill="#172e43">${lines.map((line, index) => `<tspan x="${x}" dy="${index ? size * 1.18 : 0}">${escape(line)}</tspan>`).join('')}</text>`;
}

function cardSvg(record, qrSvg, photo = '') {
  const qr = qrSvg.replace(/<\?xml[^>]*>/g, '').replace('<svg ', '<svg x="620" y="155" width="205" height="205" ')
    .replace(/width="600"/g, '').replace(/height="600"/g, '');
  const label = (text, x, y) => `<text x="${x}" y="${y}" font-size="15" letter-spacing="1" font-weight="700" fill="#52718a">${text}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="85.6mm" height="54mm" viewBox="0 0 856 540" role="img" aria-label="Carteirinha institucional de ${escape(record.holderName)}" font-family="Arial, sans-serif">
    <defs><clipPath id="issuer-photo-clip"><rect x="31" y="156" width="178" height="258" rx="6"/></clipPath></defs>
    <rect width="856" height="540" rx="18" fill="#f6f8fb"/><path d="M0 0h856v112H0Z" fill="#102c42"/><path d="M0 112h856v8H0Z" fill="#c4a06b"/>
    <text x="30" y="48" fill="#fff" font-size="38" font-weight="800" letter-spacing=".6">JCB ENGENHARIA</text><text x="31" y="82" fill="#ddc397" font-size="22" letter-spacing="1.4">Ensino Técnico</text>
    <text x="825" y="48" text-anchor="end" fill="#e6edf2" font-size="17" font-weight="700"><tspan x="825">IDENTIFICAÇÃO</tspan><tspan x="825" dy="23">ESTUDANTIL</tspan></text>
    <rect x="30" y="155" width="180" height="260" rx="7" fill="#fff" stroke="#9bafbe" stroke-width="2"/>
    ${photo ? `<image x="31" y="156" width="178" height="258" preserveAspectRatio="xMidYMid meet" clip-path="url(#issuer-photo-clip)" href="${escape(photo)}"/>` : '<text x="120" y="275" text-anchor="middle" fill="#788b9a" font-size="18"><tspan x="120">FOTO AINDA NÃO</tspan><tspan x="120" dy="27">ADICIONADA</tspan></text>'}
    ${label('NOME DO(A) ESTUDANTE', 240, 165)}${svgText(record.holderName, 240, 194, 350, 3)}
    ${label('CURSO', 240, 287)}${svgText(record.course, 240, 316, 350, 3)}
    <rect x="618" y="153" width="209" height="209" rx="4" fill="#fff" stroke="#d5dfe6" stroke-width="2"/>${qr}
    <text x="722" y="384" text-anchor="middle" font-size="14" fill="#52718a" font-weight="700">VALIDAÇÃO ONLINE</text>
    ${label('MATRÍCULA', 240, 428)}${svgText(record.enrollment, 240, 457, 350, 1, 24)}${label('VALIDADE', 650, 428)}${svgText(civilDate(record.validThrough), 650, 457, 175, 1, 25)}
    <path d="M0 480h856v60H0Z" fill="#102c42"/><text x="30" y="516" fill="#d3e0e9" font-size="18">Identificação institucional · JCB ENGENHARIA</text>
  </svg>`;
}

function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Não foi possível ler a foto original.'));
    reader.readAsDataURL(file);
  });
}

async function decodeImage(source) {
  const image = new Image();
  image.decoding = 'async';
  image.src = source;
  try { await image.decode(); } catch { throw new Error('Não foi possível abrir esta imagem. Use uma foto JPEG, PNG ou WebP válida.'); }
  return image;
}

/** The router should call the returned cleanup function when leaving this page. */
export async function mountIssuerSetup(mainElement) {
  let fragment = location.hash.slice(1);
  let captureRemoved = true;
  try {
    // The dedicated page captures and strips the fragment before any module
    // loads. Consume its non-enumerable value without invoking a getter.
    const captured = Object.getOwnPropertyDescriptor(window, '__JCB_SETUP_FRAGMENT');
    if (captured) {
      if (typeof captured.value === 'string') fragment = captured.value.replace(/^#/, '');
      captureRemoved = delete window.__JCB_SETUP_FRAGMENT;
    }
  } catch { captureRemoved = false; }
  let removed = false;
  try { history.replaceState(history.state, '', location.pathname + location.search); removed = !location.hash && captureRemoved; } catch { /* Never continue with the capability in the visible URL. */ }
  const host = document.createElement('section');
  host.className = 'section issuer-setup';
  host.innerHTML = '<div class="container issuer-setup-container"><p class="eyebrow">ÁREA RESERVADA AO RESPONSÁVEL</p><h1>Preparar carteirinha</h1><p class="issuer-intro">Confirme os dados aprovados pela instituição antes de ativar o registro e preparar o cartão.</p><div class="issuer-workspace" role="status"><p>Conferindo o acesso de preparação…</p></div></div>';
  mainElement.replaceChildren(host);
  const workspace = host.querySelector('.issuer-workspace');
  const lifetime = new AbortController();
  const objectUrls = new Set();
  let disposed = false;
  let setupKey = null;
  let photo = '';
  let photoVersion = 0;
  const alive = () => !disposed && host.isConnected;
  function cleanup() {
    if (disposed) return;
    disposed = true;
    setupKey = null;
    photo = '';
    photoVersion += 1;
    lifetime.abort();
    for (const url of objectUrls) URL.revokeObjectURL(url);
    objectUrls.clear();
  }
  window.addEventListener('pagehide', cleanup, { once: true, signal: lifetime.signal });

  async function request(url, options = {}) {
    if (!alive()) throw new Error('A página de preparação foi encerrada.');
    const controller = new AbortController();
    const abort = () => controller.abort();
    lifetime.signal.addEventListener('abort', abort, { once: true });
    const timeout = setTimeout(abort, 20_000);
    try {
      return await fetch(url, { cache: 'no-store', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', ...options, signal: controller.signal });
    } finally { clearTimeout(timeout); lifetime.signal.removeEventListener('abort', abort); }
  }

  function safeInfo(text) {
    if (!alive()) return;
    workspace.innerHTML = `<div class="issuer-safe-info"><h2>Acesso de preparação indisponível</h2><p>${escape(text)}</p><p>Esta área precisa de um acesso reservado, gerado pela instituição para um registro específico. Nenhuma ativação foi enviada.</p><a class="text-link" href="/contato">Falar com a instituição</a></div>`;
  }

  let setup;
  try {
    if (!removed) throw new Error('invalid');
    setup = await validateSetup(decodeFragment(fragment));
    setupKey = setup.key;
    delete setup.key;
  } catch {
    safeInfo('Use o acesso completo de preparação recebido da instituição, no endereço autorizado.');
    return cleanup;
  } finally { fragment = ''; }
  if (!alive()) { cleanup(); return cleanup; }
  const record = setup.record;
  workspace.innerHTML = `<div class="issuer-review"><h2>Confira os dados do titular</h2>${reviewFields(record)}<p class="issuer-boundary">A ativação confirma um registro da própria instituição. Este cartão não representa autenticação governamental nem reconhecimento de curso por órgão público.</p><p class="issuer-build-status" role="status">Conferindo a versão publicada neste endereço…</p><button class="button" type="button" id="issuer-activate" disabled>Confirmar dados e ativar</button><p id="issuer-feedback" class="issuer-feedback" role="status" aria-live="polite"></p></div><div class="issuer-output" hidden></div>`;
  const button = workspace.querySelector('#issuer-activate');
  const feedback = workspace.querySelector('#issuer-feedback');
  try {
    const response = await request('/build-info.json', { headers: { Accept: 'application/json' } });
    const metadata = await response.json();
    if (!response.ok || metadata.app !== 'JCB ENGENHARIA' || metadata.commit !== setup.commit) throw new Error('build');
    if (alive()) {
      workspace.querySelector('.issuer-build-status').textContent = 'Versão publicada conferida. A ativação só acontece após sua confirmação.';
      button.disabled = false;
    }
  } catch {
    setupKey = null;
    if (alive()) workspace.querySelector('.issuer-build-status').textContent = 'A versão publicada não pôde ser confirmada. Nenhuma ativação foi enviada. Aguarde a publicação correta e solicite um novo acesso de preparação.';
    return cleanup;
  }

  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    objectUrls.add(url);
    const link = document.createElement('a');
    link.href = url; link.download = filename; link.rel = 'noopener';
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => { URL.revokeObjectURL(url); objectUrls.delete(url); }, 10_000);
  }

  async function showCard() {
    const url = new URL(`/validar/${setup.token}`, setup.origin).href;
    const qrSvg = await QRCode.toString(url, qrOptions);
    if (!alive()) return;
    const output = workspace.querySelector('.issuer-output');
    output.hidden = false;
    output.innerHTML = `<div class="issuer-success"><span class="status-pill status-active">REGISTRO ATIVO CONFIRMADO</span><h2>Registro confirmado. Prepare o cartão.</h2><p>A consulta institucional confirmou os dados e a validade de ${escape(civilDate(record.validThrough))}.</p><a class="text-link issuer-verification-link" href="${escape(url)}" target="_blank" rel="noopener noreferrer">Abrir a consulta do QR Code ↗</a></div><p class="issuer-photo-state" role="status">Foto ainda não adicionada. A prévia contém um campo de foto em branco.</p><div class="issuer-card-viewport"><div class="issuer-card" id="issuer-print-card"></div></div><div class="issuer-card-tools"><div class="issuer-photo-tools"><label for="issuer-original-photo">Adicionar a foto original do titular</label><input type="file" id="issuer-original-photo" accept="image/jpeg,image/png,image/webp"><p>A foto fica somente nesta aba. Ela é exibida inteira, sem alteração de aparência e sem upload. Use JPEG, PNG ou WebP com até 10 MB.</p><button type="button" class="text-link" id="issuer-remove-photo" hidden>Remover foto</button></div><p class="issuer-photo-feedback" role="status"></p><div class="issuer-downloads"><button class="button" type="button" id="issuer-print">Imprimir / salvar PDF</button><button class="button button--outline" type="button" id="issuer-card-svg">Baixar cartão SVG</button><button class="button button--outline" type="button" id="issuer-card-png">Baixar cartão PNG</button></div><div class="issuer-qr-downloads"><span>Somente o QR Code:</span><button class="text-link" type="button" id="issuer-qr-svg">Baixar SVG</button><button class="text-link" type="button" id="issuer-qr-png">Baixar PNG</button></div><p class="issuer-print-help">Formato do cartão: 85,6 × 54 mm. Na impressão, use tamanho real e desative cabeçalhos e rodapés do navegador. A validade consta no cartão; não há campo de emissão.</p><p class="issuer-download-feedback" role="status" aria-live="polite"></p></div>`;
    const card = output.querySelector('.issuer-card');
    const refresh = () => { card.innerHTML = cardSvg(record, qrSvg, photo); };
    refresh();
    function on(selector, type, action) { output.querySelector(selector).addEventListener(type, action, { signal: lifetime.signal }); }
    on('#issuer-print', 'click', () => window.print());
    on('#issuer-qr-svg', 'click', () => download(new Blob([qrSvg], { type: 'image/svg+xml;charset=utf-8' }), 'jcb-qr-consulta.svg'));
    on('#issuer-qr-png', 'click', async () => {
      try {
        const data = await QRCode.toDataURL(url, qrOptions);
        const binary = atob(data.slice(data.indexOf(',') + 1));
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
        if (alive()) download(new Blob([bytes], { type: 'image/png' }), 'jcb-qr-consulta.png');
      } catch { output.querySelector('.issuer-download-feedback').textContent = 'Não foi possível gerar o PNG do QR. O SVG continua disponível.'; }
    });
    on('#issuer-card-svg', 'click', () => download(new Blob([cardSvg(record, qrSvg, photo)], { type: 'image/svg+xml;charset=utf-8' }), 'jcb-carteirinha.svg'));
    on('#issuer-card-png', 'click', async event => {
      const control = event.currentTarget;
      control.disabled = true;
      const source = URL.createObjectURL(new Blob([cardSvg(record, qrSvg, photo)], { type: 'image/svg+xml;charset=utf-8' }));
      objectUrls.add(source);
      try {
        const image = await decodeImage(source);
        if (!alive()) return;
        const canvas = document.createElement('canvas');
        canvas.width = 1712; canvas.height = 1080;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('canvas');
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        if (!blob) throw new Error('canvas');
        if (alive()) download(blob, 'jcb-carteirinha.png');
      } catch {
        if (alive()) output.querySelector('.issuer-download-feedback').textContent = 'Não foi possível gerar o cartão PNG neste navegador. Use o SVG ou a impressão em PDF.';
      } finally { URL.revokeObjectURL(source); objectUrls.delete(source); control.disabled = false; }
    });
    on('#issuer-original-photo', 'change', async event => {
      const file = event.currentTarget.files?.[0];
      const status = output.querySelector('.issuer-photo-feedback');
      const version = ++photoVersion;
      status.textContent = '';
      if (!file) return;
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) {
        status.textContent = 'Selecione uma foto JPEG, PNG ou WebP válida com até 10 MB.';
        return;
      }
      const source = URL.createObjectURL(file);
      objectUrls.add(source);
      try {
        const image = await decodeImage(source);
        if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth > 12000 || image.naturalHeight > 12000) throw new Error('Use uma foto com dimensões de até 12.000 pixels por lado.');
        const data = await readFile(file);
        if (!alive() || version !== photoVersion) return;
        photo = data;
        refresh();
        output.querySelector('.issuer-photo-state').textContent = 'Foto original adicionada à prévia nesta aba. Confira os dados e a foto antes de imprimir.';
        output.querySelector('#issuer-remove-photo').hidden = false;
        status.textContent = 'Foto original adicionada somente à prévia e aos arquivos que você baixar. Nenhuma imagem foi enviada.';
      } catch (error) { if (alive() && version === photoVersion) status.textContent = error.message; }
      finally { URL.revokeObjectURL(source); objectUrls.delete(source); }
    });
    on('#issuer-remove-photo', 'click', () => {
      photoVersion += 1; photo = ''; refresh();
      output.querySelector('.issuer-photo-state').textContent = 'Foto ainda não adicionada. A prévia contém um campo de foto em branco.';
      output.querySelector('#issuer-original-photo').value = '';
      output.querySelector('#issuer-remove-photo').hidden = true;
      output.querySelector('.issuer-photo-feedback').textContent = 'Foto removida desta aba.';
    });
  }

  let acknowledged = false;
  let busy = false;
  button.addEventListener('click', async () => {
    if (busy || !alive()) return;
    busy = true; button.disabled = true;
    feedback.textContent = acknowledged ? 'Conferindo a consulta institucional…' : 'Enviando sua confirmação à instituição…';
    try {
      if (!acknowledged) {
        const response = await request('/.netlify/functions/issuer-admin', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${setupKey}` }, body: JSON.stringify(record),
        });
        if (![201, 409].includes(response.status)) throw new Error('A instituição não confirmou a ativação. Nenhum cartão foi liberado nesta tela. Solicite orientação ao responsável.');
        acknowledged = true;
        setupKey = null;
      }
      // Call the same-origin function directly: Functions v2 can preserve the
      // original alias URL instead of the rewritten token query string.
      const response = await request(`/.netlify/functions/verify?token=${encodeURIComponent(setup.token)}`, { headers: { Accept: 'application/json' } });
      if (!response.ok) {
        const diagnostic = response.headers.get('X-JCB-Verification');
        const diagnostics = {
          'code-rejected': 'CONSULTA-ENDEREÇO',
          'not-found': 'REGISTRO-NÃO-LOCALIZADO',
          'storage-unavailable': 'CONSULTA-INDISPONÍVEL',
          'record-unavailable': 'REGISTRO-INDISPONÍVEL',
        };
        const code = Object.hasOwn(diagnostics, diagnostic) ? diagnostics[diagnostic] : response.status === 404 ? 'REGISTRO-NÃO-LOCALIZADO' : response.status === 503 ? 'CONSULTA-INDISPONÍVEL' : 'CONSULTA-RECUSADA';
        throw new Error(`A consulta ainda não confirmou o registro (HTTP ${response.status}; ${code}). Nenhum cartão foi liberado. Use “Conferir ativação novamente” para repetir somente a consulta.`);
      }
      let verified;
      try { verified = await response.json(); } catch {
        throw new Error(`A consulta ainda não confirmou o registro: resposta inválida (HTTP ${response.status}; RESPOSTA-INVÁLIDA). Nenhum cartão foi liberado.`);
      }
      if (!verified || verified.status !== 'active') {
        const states = { pending: 'CONFIRMAÇÃO-PENDENTE', expired: 'VALIDADE-ENCERRADA', revoked: 'REGISTRO-REVOGADO', invalid: 'REGISTRO-INVÁLIDO' };
        const state = typeof verified?.status === 'string' && Object.hasOwn(states, verified.status) ? states[verified.status] : 'ESTADO-NÃO-CONFIRMADO';
        throw new Error(`A consulta ainda não confirmou um registro ativo (HTTP ${response.status}; ${state}). Nenhum cartão foi liberado.`);
      }
      if (PUBLIC_FIELDS.some(field => verified[field] !== record[field])) {
        throw new Error(`A consulta ainda não confirmou os mesmos dados aprovados (HTTP ${response.status}; DADOS-DIVERGENTES). Nenhum cartão foi liberado. Fale com a instituição.`);
      }
      await showCard();
      if (alive()) { feedback.textContent = 'Dados e registro ativo conferidos pela consulta institucional.'; button.hidden = true; }
    } catch (error) {
      if (alive()) {
        feedback.textContent = error.name === 'AbortError' ? 'A resposta demorou demais. Confira a conexão e tente novamente.' : error.message || 'Não foi possível confirmar a ativação. Tente novamente.';
        button.textContent = acknowledged ? 'Conferir ativação novamente' : 'Confirmar dados e ativar';
      }
    } finally { busy = false; if (alive()) button.disabled = false; }
  }, { signal: lifetime.signal });
  return cleanup;
}
