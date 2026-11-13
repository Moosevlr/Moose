/** Build only a canonical, secure URL; QR codes never contain student data. */
export function buildCredentialUrl(origin, token) {
  let url;
  try { url = new URL(origin); } catch { throw new Error('Informe a URL principal publicada.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('Use somente a origem HTTPS principal, sem caminho ou credenciais.');
  }
  if (!/^[A-Za-z0-9_-]{43}$/.test(token || '')) throw new Error('Código de consulta inválido.');
  return `${url.origin}/validar/${token}`;
}
