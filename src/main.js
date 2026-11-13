import './styles.css';
import './verification.css';
import { company } from './company.js';
import { renderHome, renderCourses, renderCourse, renderAbout, renderContact, renderPrivacy, renderNotFound } from './pages.js';

const app = document.querySelector('#app');
const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
let navigationVersion = 0;

function header(pathname) {
  const links = [['/', 'Início'], ['/cursos', 'Cursos online'], ['/institucional', 'A instituição'], ['/validar', 'Validar carteirinha']];
  return `<header class="site-header"><div class="container header-inner"><a class="brand" href="/" aria-label="JCB Engenharia · início"><span class="brand-mark">JCB</span><span class="brand-text"><strong>JCB ENGENHARIA</strong><small>Ensino Técnico</small></span></a><button class="menu-toggle" type="button" aria-expanded="false" aria-controls="site-navigation" aria-label="Abrir menu"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg></button><nav class="main-nav" id="site-navigation" aria-label="Navegação principal">${links.map(([href, label]) => `<a href="${href}"${pathname === href ? ' aria-current="page"' : ''}>${label}</a>`).join('')}<a class="button button--small" href="/contato">Fale com a JCB</a></nav></div></header>`;
}

function footer() {
  return `<footer class="site-footer"><div class="container footer-grid"><div><a class="brand brand--footer" href="/"><span class="brand-mark">JCB</span><span class="brand-text"><strong>JCB ENGENHARIA</strong><small>Ensino Técnico</small></span></a><p>Conhecimento técnico para uma nova perspectiva sobre a infraestrutura.</p><p>${escape(company.city)}–${escape(company.uf)} · Cursos online</p></div><div class="footer-links"><h2>Explore</h2><a href="/cursos">Cursos e capacitações</a><a href="/institucional">A instituição</a><a href="/validar">Validar carteirinha</a></div><div class="footer-links"><h2>Vamos conversar</h2><a href="mailto:${escape(company.email)}">${escape(company.email)}</a><a href="/contato">Formulário de interesse</a><p>CNPJ ${escape(company.cnpj)}</p></div></div><div class="container footer-bottom"><p>© ${new Date().getFullYear()} JCB ENGENHARIA · Ensino Técnico</p><a href="/privacidade">Privacidade</a></div></footer>`;
}

function verifierForm() {
  return `<section class="section"><div class="container verification-container"><p class="eyebrow">CONSULTA INSTITUCIONAL</p><h1>Verifique a<br><span>carteirinha apresentada.</span></h1><p>Escaneie o QR Code da carteirinha ou cole abaixo o código de consulta. A conferência apresenta o registro mantido pela JCB Engenharia e seu prazo de validade.</p><form id="verification-form" class="verification-form"><label for="verification-code">Código ou endereço de consulta</label><input id="verification-code" name="code" type="text" required autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Cole o código ou o link do QR Code"><button class="button" type="submit">Consultar registro</button><p class="form-status" role="status"></p></form><p class="verification-help">Para informações sobre emissão ou correção, <a href="/contato">fale com a instituição</a>.</p></div></section>`;
}

function verificationLoading() {
  return `<section class="section"><div class="container verification-container"><p class="eyebrow">JCB ENGENHARIA · CONSULTA INSTITUCIONAL</p><div id="verification-result" class="verification-result" role="status" aria-live="polite"><span class="status-indicator status-pending"></span><h1>Consultando registro…</h1><p>Aguarde a resposta da instituição.</p></div></div></section>`;
}

function renderVerification(data, error = false) {
  const states = {
    active: ['Registro válido', 'O registro foi confirmado pela instituição e está dentro do prazo de validade.'],
    expired: ['Validade encerrada', 'O prazo desta carteirinha terminou. Solicite orientação à instituição.'],
    revoked: ['Registro revogado', 'Esta carteirinha foi desativada pela instituição.'],
    pending: ['Confirmação pendente', 'O registro aguarda confirmação da instituição.'],
    invalid: ['Registro não encontrado', 'Confira o QR Code da carteirinha ou entre em contato com a instituição.'],
    unavailable: ['Consulta indisponível', 'Não foi possível consultar o registro agora. Tente novamente ou fale com a instituição.'],
  };
  const status = error ? 'unavailable' : Object.hasOwn(states, data?.status) ? data.status : 'invalid';
  const [title, description] = states[status];
  const result = document.querySelector('#verification-result');
  if (!result) return;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(data?.validThrough || '') ? data.validThrough.split('-').reverse().join('/') : '';
  const fields = data?.holderName ? [['Titular', data.holderName], ['Matrícula', data.enrollment], ['Curso', data.course], ['Instituição', `${data.issuer} · ${data.issuerTagline}`], ['Validade', date]] : [];
  result.className = `verification-result verification-result--${status}`;
  result.innerHTML = `<span class="status-pill status-${status}">${status === 'active' ? 'DENTRO DA VALIDADE' : 'CONSULTA INSTITUCIONAL'}</span><h1>${title}</h1><p>${description}</p>${fields.length ? `<dl class="credential-fields">${fields.map(([label, value]) => `<div><dt>${label}</dt><dd>${escape(value)}</dd></div>`).join('')}</dl><p class="verification-help">Confira estes dados com a carteirinha apresentada. A consulta corresponde ao registro da própria instituição.</p>` : ''}<div class="button-row"><a class="button" href="/contato">Falar com a instituição</a><a class="text-link" href="/">Conhecer a JCB</a></div>`;
}

async function loadVerification(token, version) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) { renderVerification({ status: 'invalid' }); return; }
  try {
    const response = await fetch(`/api/verificar/${encodeURIComponent(token)}`, { cache: 'no-store', referrerPolicy: 'no-referrer', headers: { Accept: 'application/json' } });
    const data = await response.json();
    if (version !== navigationVersion) return;
    if (response.status === 404) renderVerification({ status: 'invalid' });
    else renderVerification(data, !response.ok);
  } catch { if (version === navigationVersion) renderVerification(null, true); }
}

function thankYou() {
  return `<section class="section"><div class="container verification-container"><span class="status-pill status-active">INTERESSE REGISTRADO</span><h1>Obrigado pela<br>sua mensagem.</h1><p>Seu interesse foi registrado para atendimento pela JCB Engenharia. O envio não confirma matrícula ou reserva de vaga.</p><div class="button-row"><a class="button" href="/cursos">Conhecer os cursos</a><a class="text-link" href="/">Voltar ao início</a></div></div></section>`;
}

function render() {
  const version = ++navigationVersion;
  const path = location.pathname.replace(/\/$/, '') || '/';
  let content, title;
  const token = path.startsWith('/validar/') ? path.slice('/validar/'.length) : null;
  if (path === '/') { content = renderHome(company); title = 'Cursos online para fiscalização e pavimentação'; }
  else if (path === '/cursos') { content = renderCourses(company); title = 'Cursos online'; }
  else if (path.startsWith('/cursos/')) {
    let slug;
    try { slug = decodeURIComponent(path.slice('/cursos/'.length)); } catch { slug = ''; }
    content = renderCourse(company, slug);
    title = company.courses.find(course => course.slug === slug)?.title || 'Curso não encontrado';
  }
  else if (path === '/institucional') { content = renderAbout(company); title = 'A instituição'; }
  else if (path === '/contato') { content = renderContact(company); title = 'Contato'; }
  else if (path === '/privacidade') { content = renderPrivacy(company); title = 'Privacidade'; }
  else if (path === '/validar') { content = verifierForm(); title = 'Validar carteirinha'; }
  else if (token !== null) { content = verificationLoading(); title = 'Consulta institucional'; }
  else if (path === '/obrigado') { content = thankYou(); title = 'Interesse registrado'; }
  else { content = renderNotFound(company); title = 'Página não encontrada'; }
  document.title = `${title} · JCB ENGENHARIA`;
  let robots = document.querySelector('meta[name="robots"]');
  if (!robots) { robots = document.createElement('meta'); robots.name = 'robots'; document.head.appendChild(robots); }
  robots.content = path.startsWith('/validar') || path === '/obrigado' ? 'noindex, nofollow, noarchive' : 'index, follow';
  app.innerHTML = `${header(path)}<main id="conteudo" tabindex="-1">${content}</main>${footer()}`;
  if (path === '/contato') {
    const selected = new URLSearchParams(location.search).get('curso');
    const select = document.querySelector('[name="course"]');
    if (select && company.courses.some(course => course.slug === selected)) select.value = selected;
  }
  if (token !== null) void loadVerification(token, version);
}

function navigate(href) {
  history.pushState(null, '', href);
  render();
  window.scrollTo({ top: 0, behavior: 'instant' });
  document.querySelector('#conteudo')?.focus({ preventScroll: true });
}

document.addEventListener('click', event => {
  const toggle = event.target.closest('.menu-toggle');
  if (toggle) {
    const expanded = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.setAttribute('aria-label', expanded ? 'Fechar menu' : 'Abrir menu');
    document.querySelector('.site-header').classList.toggle('menu-open', expanded);
    document.querySelector('.main-nav').classList.toggle('is-open', expanded);
    return;
  }
  const anchor = event.target.closest('a[href]');
  if (!anchor || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0 || anchor.target || anchor.hasAttribute('download')) return;
  const url = new URL(anchor.href, location.origin);
  if (url.origin !== location.origin || !/^https?:$/.test(url.protocol) || url.hash) return;
  event.preventDefault();
  navigate(url.pathname + url.search);
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    const toggle = document.querySelector('.menu-toggle');
    if (toggle?.getAttribute('aria-expanded') === 'true') toggle.click();
  }
});

document.addEventListener('submit', async event => {
  const form = event.target;
  if (form.id === 'verification-form') {
    event.preventDefault();
    let token = form.elements.code.value.trim();
    try {
      if (token.startsWith('http')) {
        const url = new URL(token);
        token = url.origin === location.origin && /^\/validar\/[A-Za-z0-9_-]{43}\/?$/.test(url.pathname) ? url.pathname.split('/')[2] : '';
      }
    } catch { token = ''; }
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) { form.querySelector('.form-status').textContent = 'Confira o código ou use o link de consulta do QR Code.'; return; }
    navigate(`/validar/${token}`);
    return;
  }
  if (form.getAttribute('name') !== 'interesse') return;
  event.preventDefault();
  if (!form.reportValidity()) return;
  const status = form.querySelector('.form-status');
  const button = form.querySelector('button[type="submit"]');
  status.id = 'interest-form-status';
  let firstInvalid = null;
  for (const field of form.querySelectorAll('[aria-invalid="true"]')) {
    field.removeAttribute('aria-invalid');
    if (field.getAttribute('aria-describedby') === status.id) field.removeAttribute('aria-describedby');
  }
  const payload = Object.fromEntries(new FormData(form));
  payload.consent = form.elements.consent.checked;
  button.disabled = true;
  status.textContent = 'Registrando sua mensagem…';
  try {
    const response = await fetch('/api/contato', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const result = await response.json();
    if (response.status === 422 && result.fields && typeof result.fields === 'object') {
      const messages = [];
      for (const key of ['name', 'email', 'phone', 'course', 'message', 'consent']) {
        if (typeof result.fields[key] !== 'string') continue;
        messages.push(result.fields[key]);
        const field = form.elements.namedItem(key);
        if (field instanceof HTMLElement) {
          field.setAttribute('aria-invalid', 'true');
          field.setAttribute('aria-describedby', status.id);
          firstInvalid ||= field;
        }
      }
      throw new Error(messages.join(' ') || 'Confira os campos do formulário.');
    }
    if (response.status !== 201 || result.ok !== true) throw new Error(result.error || 'Não foi possível registrar sua mensagem.');
    if (form.isConnected) navigate('/obrigado');
  } catch (error) {
    if (form.isConnected) {
      status.textContent = `${error.message || 'O atendimento está temporariamente indisponível.'} Você também pode escrever para ${company.email}.`;
      button.disabled = false;
      firstInvalid?.focus();
    }
  }
});

window.addEventListener('popstate', render);
render();
