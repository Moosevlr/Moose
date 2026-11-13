const escape = (value = '') => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);

const coursesOf = company => Array.isArray(company?.courses) ? company.courses : [];
const courseUrl = course => `/cursos/${encodeURIComponent(course.slug)}`;
const arrow = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
const icons = {
  structure: '<path d="m4 8 8-4 8 4v9l-8 4-8-4V8Z"/><path d="m4 8 8 4 8-4M12 12v9M8 6l8 4v9"/>',
  plan: '<path d="M5 3h11l3 3v15H5V3Z"/><path d="M15 3v4h4M8 11h8M8 15h3v3H8v-3ZM14 15h2M14 18h2"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5 5-2Z"/>',
  layers: '<path d="m3 7 9-4 9 4-9 4-9-4ZM3 12l9 4 9-4M3 17l9 4 9-4"/>',
  message: '<path d="M20 11a8 8 0 0 1-8 8H7l-4 3V11a9 9 0 0 1 17 0Z"/><path d="M8 10h8M8 14h5"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">${icons[name] || icons.structure}</svg>`;

function breadcrumb(label) {
  return `<nav class="breadcrumb container" aria-label="Caminho de navegação"><a href="/">Início</a><span aria-hidden="true">/</span><span aria-current="page">${escape(label)}</span></nav>`;
}

function pageHero(eyebrow, title, description, dark = false) {
  return `<section class="page-hero${dark ? ' page-hero--dark' : ''}"><div class="container"><p class="eyebrow">${eyebrow}</p><h1>${title}</h1><p class="page-lead">${description}</p></div></section>`;
}

function courseCard(course, index = 0) {
  return `<article class="course-card">
    <a class="course-card-art course-card-art--${index % 3}" href="${courseUrl(course)}" aria-label="Conhecer ${escape(course.title)}">
      <span class="course-art-grid" aria-hidden="true"></span>${icon(['structure', 'plan', 'layers'][index % 3])}
      <span class="course-art-label" aria-hidden="true">CONHECIMENTO EM CONSTRUÇÃO</span>
    </a>
    <div class="course-card-content"><p class="eyebrow">${escape(course.category || 'Formação e capacitação')}</p>
      <h3><a href="${courseUrl(course)}">${escape(course.title)}</a></h3>
      <p>${escape(course.summary)}</p>
      <div class="course-card-bottom"><span class="course-format">${escape(course.format || 'Sob consulta')}</span><a class="text-link" href="${courseUrl(course)}">Conhecer o curso ${arrow}</a></div>
    </div>
  </article>`;
}

function blueprint() {
  return `<div class="hero-visual"><div class="drawing-caption"><span class="drawing-dot"></span> PERSPECTIVA PARA IR ALÉM</div>
    <svg class="building-drawing" viewBox="0 0 600 540" role="img" aria-label="Ilustração de uma estrutura em perspectiva sobre uma malha de desenho técnico.">
      <defs><pattern id="draft-grid" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M32 0H0v32" fill="none" stroke="#afc3cc" stroke-opacity=".12" stroke-width=".7"/></pattern><linearGradient id="draft-face" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#27475a" stop-opacity=".75"/><stop offset="1" stop-color="#163548" stop-opacity=".15"/></linearGradient></defs>
      <rect width="600" height="540" fill="url(#draft-grid)"/>
      <g fill="none" stroke="#9fbdcb" stroke-width="1" opacity=".22"><path d="M0 450 310 275l290 167M0 385 310 210l290 167M0 320 310 145l290 167M0 255 310 80l290 167M60 540V70M156 540V40M252 540V20M348 540V20M444 540V40M540 540V70"/></g>
      <g stroke-linejoin="round"><path d="m122 208 206-116 156 88v233L278 527l-156-88Z" fill="url(#draft-face)" stroke="#658595" stroke-width="1.4"/>
        <g fill="#17394b" fill-opacity=".8" stroke="#ccaa77" stroke-width="1.8"><path d="m112 211 216-122 166 94-216 123-166-95Z"/><path d="m112 287 216-122 166 94-216 123-166-95Z"/><path d="m112 363 216-122 166 94-216 123-166-95Z"/><path d="m112 439 216-122 166 94-216 123-166-95Z"/></g>
        <g fill="none" stroke="#b7c9d1" stroke-width="3"><path d="M123 215v223M200 259v223M278 303v224M346 264v224M416 224v223M484 185v224M328 98v221"/></g>
        <g fill="none" stroke="#8daebd" stroke-width="1" opacity=".6"><path d="m123 291 155 88 206-117M123 367l155 88 206-117M205 162l156 90M273 123l156 90M205 238l156 90M273 199l156 90M205 314l156 90M273 275l156 90"/></g>
      </g>
      <g fill="none" stroke="#ccaa77" stroke-width="1.1"><path d="M86 209v232M79 209h14M79 441h14M96 211l-20-8M96 442l-20-8M119 468l157 89M117 459v17M275 548v17M301 541l206-117M297 534l8 15M503 417l8 15" opacity=".8"/><circle cx="328" cy="89" r="9"/><path d="M328 73v32M312 89h32"/></g>
      <g fill="#d4b382"><circle cx="86" cy="324" r="3"/><circle cx="196" cy="512" r="3"/></g>
    </svg><div class="drawing-note"><span>Fundamentos sólidos.</span><strong>Novas possibilidades.</strong></div><span class="drawing-corner drawing-corner--tl" aria-hidden="true"></span><span class="drawing-corner drawing-corner--br" aria-hidden="true"></span></div>`;
}

function contactCta() {
  return `<section class="section contact-cta"><div class="container contact-cta-inner"><div><p class="eyebrow">O PRÓXIMO PASSO É SEU</p><h2>Construa sua próxima<br>etapa profissional.</h2><p>Conte à nossa equipe o que você deseja aprender.</p></div><a class="button button--gold" href="/contato">Conversar sobre os cursos ${arrow}</a></div></section>`;
}

export function renderHome(company) {
  const courses = coursesOf(company);
  return `<section class="hero"><div class="container hero-grid"><div class="hero-copy"><p class="eyebrow">${escape(company.name)} <span aria-hidden="true">/</span> ${escape(company.tagline)}</p><h1>Conhecimento técnico.<br><span>Visão de obra.</span></h1><p class="hero-lead">Cursos livres online voltados à fiscalização, à pavimentação e às obras de infraestrutura. Conheça os programas propostos e desenvolva sua perspectiva técnica.</p><div class="button-row"><a class="button button--gold" href="/cursos">Explore os cursos ${arrow}</a><a class="button button--outline-light" href="/institucional">Conheça a instituição</a></div><div class="hero-signature"><span class="signature-line"></span><p>O conhecimento transforma<br><strong>a forma de construir.</strong></p></div></div>${blueprint()}</div></section>
    <section class="value-strip" aria-label="Nossa proposta de ensino"><div class="container value-grid"><div>${icon('structure')}<div><h2>Base técnica</h2><p>Fundamentos para decisões mais conscientes.</p></div></div><div>${icon('plan')}<div><h2>Aplicação prática</h2><p>Temas conectados aos desafios das obras.</p></div></div><div>${icon('compass')}<div><h2>Desenvolvimento</h2><p>Aprendizado para ampliar suas possibilidades.</p></div></div></div></section>
    <section class="section section--courses"><div class="container"><div class="section-heading"><div><p class="eyebrow">APRENDA. COMPREENDA. APLIQUE.</p><h2>Conhecimento que<br>acompanha sua evolução.</h2></div><div class="section-heading-side"><p>Conheça os programas propostos de cursos livres online. Próximas turmas, datas e condições sob consulta.</p><a class="text-link" href="/cursos">Todos os cursos ${arrow}</a></div></div><div class="course-grid">${courses.slice(0, 3).map(courseCard).join('') || '<p class="empty-state">Converse com nossa equipe para conhecer a programação de cursos.</p>'}</div></div></section>
    <section class="section method-section"><div class="container method-layout"><div class="method-intro"><p class="eyebrow">DA BASE À APLICAÇÃO</p><h2>Aprender faz sentido<br>quando se conecta<br><em>à realidade.</em></h2><p>Uma proposta de capacitação online que valoriza a compreensão dos materiais, a fiscalização das obras e o raciocínio por trás de cada escolha técnica.</p><a class="text-link" href="/institucional">Nossa proposta de ensino ${arrow}</a></div><div class="method-grid">${[
      ['01', 'Fundamentar', 'Compreender os conceitos que sustentam o trabalho técnico.'],
      ['02', 'Interpretar', 'Relacionar informações, requisitos e condições de cada situação.'],
      ['03', 'Planejar', 'Organizar etapas, recursos e critérios antes de executar.'],
      ['04', 'Aplicar', 'Conectar o conteúdo estudado aos desafios da prática profissional.'],
    ].map(([number, title, description]) => `<article class="method-item"><span class="method-number">${number}</span><h3>${title}</h3><p>${description}</p></article>`).join('')}</div></div></section>
    <section class="section institutional-preview"><div class="container institutional-grid"><div class="institutional-emblem" aria-hidden="true"><span>JCB</span><strong>ENGENHARIA</strong><i></i><small>ENSINO TÉCNICO</small></div><div><p class="eyebrow">PROPÓSITO QUE NOS ORIENTA</p><h2>Engenharia na essência.<br>Educação no caminho.</h2><p>A ${escape(company.name)} aproxima o conhecimento técnico das pessoas que desejam desenvolver sua atuação em infraestrutura. Nossa proposta reúne cursos livres online sobre fiscalização, pavimentação e outros temas da engenharia.</p><a class="button button--outline" href="/institucional">Conheça a ${escape(company.name)} ${arrow}</a></div></div></section>${contactCta()}`;
}

export function renderCourses(company) {
  const courses = coursesOf(company);
  return `${breadcrumb('Cursos')}${pageHero('CURSOS LIVRES ONLINE', 'Seu próximo aprendizado<br>começa <span>aqui.</span>', 'Programas propostos de capacitação técnica online, com foco em fiscalização, pavimentação e infraestrutura. Consulte a equipe sobre próximas turmas e condições.')}
    <section class="section courses-catalog"><div class="container"><div class="catalog-heading"><p>Programas propostos · capacitação técnica online.</p><span class="catalog-note">Próximas turmas e condições sob consulta</span></div><div class="course-grid">${courses.map(courseCard).join('') || '<div class="empty-state"><h2>Vamos conversar sobre seu objetivo?</h2><p>Nossa equipe pode apresentar a programação de cursos.</p><a class="button" href="/contato">Solicitar informações</a></div>'}</div></div></section>
    <section class="section section--soft"><div class="container support-layout"><div><p class="eyebrow">ESCOLHA COM CLAREZA</p><h2>Uma boa escolha<br>começa com uma conversa.</h2></div><div><p>Converse sobre a proposta do curso antes de se inscrever. Datas, carga horária, valores e disponibilidade de turmas serão informados pela equipe.</p><a class="text-link" href="/contato">Falar com a equipe ${arrow}</a></div></div></section>`;
}

export function renderCourse(company, slug) {
  const course = coursesOf(company).find(item => item.slug === slug);
  if (!course) return renderNotFound(company);
  const modules = Array.isArray(course.modules) ? course.modules : [];
  return `${breadcrumb(course.title)}${pageHero(escape(course.category || 'CONHECIMENTO APLICADO'), escape(course.title), escape(course.summary), true)}
    <section class="section"><div class="container course-detail-layout"><div class="course-detail-main"><p class="eyebrow">UMA BASE PARA AVANÇAR</p><h2>Conteúdo proposto.</h2><p class="section-intro">Uma visão dos temas propostos para este curso livre online. Consulte a equipe para confirmar o programa, as próximas turmas, a carga horária e as condições de participação.</p><ol class="module-list">${modules.map((module, index) => `<li><span class="module-index">${String(index + 1).padStart(2, '0')}</span><div><h3>${escape(module)}</h3></div>${icon('check')}</li>`).join('') || '<li><div><p>Solicite à equipe a proposta de conteúdo desta formação.</p></div></li>'}</ol><div class="course-context"><span class="icon-tile">${icon('compass')}</span><div><h3>Conhecimento com contexto.</h3><p>O objetivo é ampliar sua compreensão dos temas e apoiar o desenvolvimento do seu raciocínio técnico. A aplicação profissional deve considerar os requisitos e as responsabilidades de cada atividade.</p></div></div></div><aside class="course-inquiry" aria-label="Informações sobre o curso"><span class="icon-tile">${icon('plan')}</span><h2>Vamos falar sobre<br>sua formação?</h2><dl><div><dt>Área</dt><dd>${escape(course.category || 'Capacitação técnica')}</dd></div><div><dt>Formato</dt><dd>${escape(course.format || 'Sob consulta')}</dd></div></dl><p>Consulte próximas turmas, datas, carga horária, valores e requisitos de participação.</p><a class="button button--gold" href="/contato?curso=${encodeURIComponent(course.slug)}">Tenho interesse ${arrow}</a><a class="text-link" href="/cursos">Explorar outros cursos</a></aside></div></section>${contactCta()}`;
}

export function renderAbout(company) {
  const place = [company.city, company.uf].filter(Boolean).map(escape).join(' · ');
  return `${breadcrumb('Institucional')}${pageHero('NOSSA ESSÊNCIA', 'O conhecimento é a base.<br>O desenvolvimento, <span>o caminho.</span>', `Conheça a proposta da ${escape(company.name)} e nossa conexão com o ensino técnico aplicado à engenharia.`)}
    <section class="section"><div class="container about-layout"><div class="about-statement"><span class="statement-line" aria-hidden="true"></span><p>Aprender para<br>compreender.<br><strong>Compreender<br>para construir.</strong></p></div><div class="prose"><p class="eyebrow">${escape(company.name)}</p><h2>Ensino com perspectiva<br>de aplicação.</h2><p>A ${escape(company.name)} é uma iniciativa dedicada à capacitação técnica por meio de cursos livres online. Nossa proposta conecta os fundamentos da engenharia à fiscalização, à pavimentação e ao acompanhamento de obras de infraestrutura.</p><p>Valorizamos a clareza dos conceitos, a organização do pensamento e uma base de conhecimento que acompanhe o desenvolvimento profissional. Os cursos apresentados são programas propostos; consulte a equipe para confirmar a abertura de turmas e suas condições.</p>${place ? `<p class="institution-location">${place}</p>` : ''}${company.ownerName ? `<div class="coordination-note"><span>Coordenação institucional</span><strong>${escape(company.ownerName)}</strong></div>` : ''}</div></div></section>
    <section class="section section--soft"><div class="container"><div class="section-heading"><div><p class="eyebrow">O QUE ORIENTA NOSSO TRABALHO</p><h2>Princípios para<br>um aprendizado consistente.</h2></div></div><div class="principle-grid"><article>${icon('layers')}<h3>Fundamentos</h3><p>O entendimento dos conceitos é o ponto de partida para desenvolver o raciocínio técnico.</p></article><article>${icon('plan')}<h3>Clareza</h3><p>Uma apresentação organizada aproxima o conteúdo de quem deseja aprender e evoluir.</p></article><article>${icon('compass')}<h3>Contexto</h3><p>A relação entre o estudo e os desafios da área dá sentido ao percurso de aprendizagem.</p></article></div></div></section>${contactCta()}`;
}

export function renderContact(company) {
  const phone = company.whatsapp ? String(company.whatsapp).replace(/\D/g, '') : '';
  const location = [company.city, company.uf].filter(Boolean).map(escape).join(' · ');
  const contactDetails = [
    phone ? `<div><span>WhatsApp</span><a href="https://wa.me/${phone}" target="_blank" rel="noopener noreferrer">${escape(company.whatsapp)} ${arrow}</a></div>` : '',
    company.email ? `<div><span>E-mail</span><a href="mailto:${escape(company.email)}">${escape(company.email)}</a></div>` : '',
    location ? `<div><span>Localização</span><p>${location}</p></div>` : '',
    company.cnpj ? `<div><span>CNPJ</span><p>${escape(company.cnpj)}</p></div>` : '',
  ].join('');
  return `${breadcrumb('Contato')}${pageHero('VAMOS CONVERSAR', 'Seu desenvolvimento<br>merece <span>um próximo passo.</span>', 'Conte o que você busca. Nossa equipe poderá orientar você sobre os cursos, o conteúdo e as condições de participação.')}
    <section class="section"><div class="container contact-layout"><div class="contact-copy"><span class="icon-tile">${icon('message')}</span><h2>Comece com<br>uma conversa.</h2><p>Preencha o formulário e deixe sua dúvida ou seu interesse. Use um contato pelo qual possamos retornar.</p>${contactDetails ? `<div class="contact-details">${contactDetails}</div>` : '<p class="contact-form-note">O formulário ao lado é o canal para solicitar informações à instituição.</p>'}<div class="contact-privacy-note">${icon('check')}<p>Seus dados serão usados para atender sua solicitação. <a href="/privacidade">Conheça o aviso de privacidade.</a></p></div></div>
    <form class="interest-form" name="interesse" method="POST" action="/api/contato"><div class="honeypot" aria-hidden="true"><label>Não preencha este campo<input name="website" tabindex="-1" autocomplete="off"></label></div><div class="form-heading"><p class="eyebrow">FALE COM A ${escape(company.name)}</p><h2>Qual é seu objetivo?</h2></div><div class="form-grid"><div class="field field--full"><label for="interest-name">Nome completo <span aria-hidden="true">*</span></label><input id="interest-name" name="name" autocomplete="name" required minlength="2" maxlength="120" placeholder="Como podemos chamar você?"></div><div class="field"><label for="interest-email">E-mail <span aria-hidden="true">*</span></label><input id="interest-email" name="email" type="email" autocomplete="email" required maxlength="254" placeholder="voce@exemplo.com"></div><div class="field"><label for="interest-phone">Telefone <span class="field-optional">opcional</span></label><input id="interest-phone" name="phone" type="tel" autocomplete="tel" maxlength="32" placeholder="DDD e número"></div><div class="field field--full"><label for="interest-course">Interesse <span aria-hidden="true">*</span></label><select id="interest-course" name="course" required><option value="">Selecione uma opção</option>${coursesOf(company).map(course => `<option value="${escape(course.slug)}">${escape(course.title)}</option>`).join('')}<option value="informacoes-gerais">Informações gerais</option></select></div><div class="field field--full"><label for="interest-message">Mensagem <span aria-hidden="true">*</span></label><textarea id="interest-message" name="message" rows="5" required minlength="10" maxlength="4000" placeholder="Conte um pouco sobre o que você procura."></textarea></div></div><label class="consent-field"><input name="consent" type="checkbox" value="true" required><span>Li o <a href="/privacidade">aviso de privacidade</a> e autorizo o uso dos meus dados para receber retorno sobre esta solicitação.</span></label><button class="button" type="submit">Enviar meu interesse ${arrow}</button><p class="form-required">* Campos obrigatórios. Não inclua documentos pessoais ou dados sensíveis na mensagem.</p><p class="form-status" role="status" aria-live="polite"></p></form></div></section>`;
}

export function renderPrivacy(company) {
  return `${breadcrumb('Privacidade')}${pageHero('TRANSPARÊNCIA NO CONTATO', 'Seus dados.<br><span>Nosso cuidado.</span>', 'Entenda quais informações são solicitadas neste site e para que elas são utilizadas.')}
    <section class="section"><div class="container privacy-layout"><aside class="privacy-sidebar"><p class="eyebrow">AVISO DE PRIVACIDADE</p><p>Este aviso se aplica aos formulários e aos serviços de consulta disponibilizados neste site.</p><a class="text-link" href="/contato">Falar com a instituição ${arrow}</a></aside><div class="prose privacy-prose"><h2>Informações que você fornece</h2><p>Ao preencher o formulário de interesse da ${escape(company.name)}, você informa nome, e-mail, interesse em cursos e mensagem. O telefone é opcional. Evite enviar documentos pessoais ou informações sensíveis pelo formulário.</p><h2>Finalidade do contato</h2><p>Essas informações são usadas para compreender e responder sua solicitação, apresentar informações sobre a formação de interesse e dar continuidade ao atendimento solicitado. O envio do formulário inclui sua autorização para esse retorno.</p><h2>Credenciais e verificação</h2><p>Credenciais com QR Code podem direcionar a uma página de consulta de identificação e validade. As informações exibidas nessa consulta servem para conferir a credencial apresentada. Compartilhe o documento apenas quando necessário.</p><h2>Operação do site</h2><p>A hospedagem e o processamento dos formulários podem envolver serviços técnicos contratados para manter o site e encaminhar as solicitações. Os dados devem ser utilizados de acordo com a finalidade do atendimento e com a legislação aplicável.</p><h2>Seus direitos</h2><p>Você pode solicitar informações sobre o uso de seus dados, pedir a correção de informações e solicitar a exclusão de dados ou a revogação da autorização, respeitadas as hipóteses legais de conservação. Para isso, entre em contato com a instituição e informe que o assunto é privacidade.</p><h2>Como solicitar atendimento</h2><p>Use a <a href="/contato">página de contato</a>${company.email ? ` ou o e-mail <a href="mailto:${escape(company.email)}">${escape(company.email)}</a>` : ''} para encaminhar sua solicitação. Forneça somente as informações necessárias para localizar e compreender o atendimento.</p><div class="privacy-callout"><strong>Um cuidado importante</strong><p>Não informe senhas, dados bancários ou cópias de documentos no campo de mensagem do site.</p></div></div></div></section>`;
}

export function renderNotFound() {
  return `<section class="section not-found"><div class="container"><p class="eyebrow">CAMINHO NÃO ENCONTRADO</p><span class="not-found-code" aria-hidden="true">404</span><h1>Vamos voltar<br>ao ponto de partida?</h1><p>Esta página não está disponível. Você pode conhecer os cursos ou continuar pela página inicial.</p><div class="button-row"><a class="button" href="/">Página inicial ${arrow}</a><a class="button button--outline" href="/cursos">Conhecer os cursos</a></div></div></section>`;
}
