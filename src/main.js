import './styles.css';
import './verification.css';
import { company } from './company.js';
import { renderHome, renderCourses, renderCourse, renderAbout, renderContact, renderPrivacy, renderNotFound, submitInterestSubmission } from './pages.js';
import { validateContact } from './contact-validation.js';
import { normalizeEnrollment, parseVerificationInput } from './verification-input.js';

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
  return `<section class="section"><div class="container verification-container"><p class="eyebrow">CONSULTA INSTITUCIONAL</p><h1>Verifique a<br><span>carteirinha apresentada.</span></h1><p>Digite a matrícula impressa na carteirinha ou cole o código ou endereço do QR Code. As duas formas consultam o mesmo registro da JCB Engenharia e seu prazo de validade.</p><form id="verification-form" class="verification-form"><label for="verification-code">Matrícula, código ou link do QR Code</label><input id="verification-code" name="code" type="text" required autocomplete="off" autocapitalize="off" spellcheck="false" aria-describedby="verification-input-help" placeholder="Digite a matrícula da carteirinha"><p id="verification-input-help" class="verification-help">A matrícula aparece no campo “Matrícula” do cartão. Maiúsculas e minúsculas são aceitas.</p><button class="button" type="submit">Consultar registro</button><p class="form-status" role="status"></p></form><p class="verification-help">Para informações sobre emissão ou correção, <a href="/contato">fale com a instituição</a>.</p></div></section>`;
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
  result.innerHTML = `<span class="status-pill status-${status}">${status === 'active' ? 'DENTRO DA VALIDADE' : 'CONSULTA INSTITUCIONAL'}</span><h1>${title}</h1><p>${description}</p>${fields.length ? `<dl class="credential-fields">${fields.map(([label, value]) => `<div><dt>${label}</dt><dd>${escape(value)}</dd></div>`).join('')}</dl><p class="verification-help">Confira estes dados com a carteirinha apresentada. A consulta corresponde ao registro da própria instituição.</p>` : ''}<div class="button-row"><a class="button" href="/validar">Nova consulta</a><a class="text-link" href="/contato">Falar com a instituição</a></div>`;
}

async function loadVerification(input, version) {
  if (!input) { renderVerification({ status: 'invalid' }); return; }
  const query = new URLSearchParams({ [input.kind === 'enrollment' ? 'matricula' : 'token']: input.value });
  try {
    const response = await fetch(`/.netlify/functions/verify?${query}`, { cache: 'no-store', referrerPolicy: 'no-referrer', headers: { Accept: 'application/json' } });
    const data = await response.json();
    if (version !== navigationVersion) return;
    if (response.status === 404) renderVerification({ status: 'invalid' });
    else renderVerification(data, !response.ok);
  } catch { if (version === navigationVersion) renderVerification(null, true); }
}

function thankYou() {
  return `<section class="section"><div class="container verification-container"><span class="status-pill status-active">SOLICITAÇÃO ENVIADA</span><h1>Obrigado pela<br>sua mensagem.</h1><p>Sua solicitação foi enviada para atendimento pela JCB Engenharia. O envio não confirma matrícula ou reserva de vaga.</p><div class="button-row"><a class="button" href="/cursos">Conhecer os cursos</a><a class="text-link" href="/">Voltar ao início</a></div></div></section>`;
}

function render() {
  const version = ++navigationVersion;
  const path = location.pathname.replace(/\/$/, '') || '/';
  let content, title;
  const token = path.startsWith('/validar/') ? path.slice('/validar/'.length) : null;
  const enrollments = new URLSearchParams(location.search).getAll('matricula');
  const enrollmentQuery = path === '/validar' && enrollments.length > 0;
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
  else if (path === '/validar' && !enrollmentQuery) { content = verifierForm(); title = 'Validar carteirinha'; }
  else if (token !== null || enrollmentQuery) { content = verificationLoading(); title = 'Consulta institucional'; }
  else if (path === '/obrigado') { content = thankYou(); title = 'Solicitação enviada'; }
  else { content = renderNotFound(company); title = 'Página não encontrada'; }
  document.title = `${title} · JCB ENGENHARIA`;
  let robots = document.querySelector('meta[name="robots"]');
  if (!robots) { robots = document.createElement('meta'); robots.name = 'robots'; document.head.appendChild(robots); }
  robots.content = path.startsWith('/validar') || path === '/obrigado' ? 'noindex, nofollow, noarchive' : 'index, follow';
  app.innerHTML = `${header(path)}<main id="conteudo" tabindex="-1">${content}</main>${footer()}`;
  if (path === '/contato') {
    const selected = new URLSearchParams(location.search).get('curso');
    const select = document.querySelector('#interest-form [name="course"]');
    if (select && company.courses.some(course => course.slug === selected)) select.value = selected;
  }
  if (token !== null) void loadVerification(/^[A-Za-z0-9_-]{43}$/.test(token) ? { kind: 'token', value: token } : null, version);
  else if (enrollmentQuery) {
    const enrollment = enrollments.length === 1 ? normalizeEnrollment(enrollments[0]) : null;
    void loadVerification(enrollment ? { kind: 'enrollment', value: enrollment } : null, version);
  }
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

function markInterestFieldErrors(form, status, fields) {
  const messages = [];
  let firstInvalid = null;
  for (const key of ['name', 'email', 'phone', 'course', 'message', 'consent']) {
    if (typeof fields?.[key] !== 'string') continue;
    messages.push(fields[key]);
    const field = form.elements.namedItem(key);
    if (field instanceof HTMLElement) {
      field.setAttribute('aria-invalid', 'true');
      field.setAttribute('aria-describedby', status.id);
      firstInvalid ||= field;
    }
  }
  status.textContent = messages.join(' ') || 'Confira os campos do formulário.';
  return firstInvalid;
}

document.addEventListener('submit', async event => {
  const form = event.target;
  if (form.id === 'verification-form') {
    event.preventDefault();
    const input = parseVerificationInput(form.elements.code.value, location.origin);
    if (!input) { form.querySelector('.form-status').textContent = 'Confira a matrícula impressa no cartão ou cole o código ou link do QR Code deste site.'; return; }
    navigate(input.kind === 'enrollment' ? `/validar?matricula=${encodeURIComponent(input.value)}` : `/validar/${input.value}`);
    return;
  }
  if (form.id !== 'interest-form') return;
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
  const validation = validateContact(payload);
  if (!validation.ok) {
    markInterestFieldErrors(form, status, validation.fields)?.focus();
    return;
  }
  if (validation.honeypot) {
    status.textContent = 'Não foi possível enviar o formulário.';
    return;
  }
  button.disabled = true;
  status.textContent = 'Enviando sua mensagem…';
  try {
    await submitInterestSubmission(validation.data);
    if (form.isConnected) navigate('/obrigado');
  } catch (error) {
    if (form.isConnected) {
      if (error.status === 422 && error.fields) firstInvalid = markInterestFieldErrors(form, status, error.fields);
      else status.textContent = error.message || 'O atendimento está temporariamente indisponível.';
      status.textContent += ` Você também pode escrever para ${company.email}.`;
      button.disabled = false;
      firstInvalid?.focus();
    }
  }
});

window.addEventListener('popstate', render);
render();
