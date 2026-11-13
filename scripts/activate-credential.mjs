import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { buildCredentialUrl } from '../src/credential-url.js';

const origin = process.argv[2];
const { token } = JSON.parse(await readFile('private/credential-token.json', 'utf8'));
const record = JSON.parse(await readFile('private/credential.json', 'utf8'));
const { key } = JSON.parse(await readFile('private/issuer-admin-key.json', 'utf8'));
const url = buildCredentialUrl(origin, token);
const hostname = new URL(origin).hostname;
if (!/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?\.netlify\.app$/.test(hostname) || hostname.includes('--') || hostname === 'starlit-khapse-197f07.netlify.app') {
  throw new Error('Use o endereço principal do NOVO projeto JCB no Netlify.');
}
if (createHash('sha256').update(token).digest('hex') !== record.tokenSha256) throw new Error('Código e registro não correspondem.');
const home = await fetch(new URL('/', origin));
if (!home.ok || !(await home.text()).includes('JCB ENGENHARIA')) throw new Error('Confira a publicação da JCB antes de ativar.');
const expected = JSON.parse(await readFile('private/git-publication.json', 'utf8'));
const metadataResponse = await fetch(new URL('/build-info.json', origin), { cache: 'no-store' });
const metadata = await metadataResponse.json();
if (!metadataResponse.ok || metadata.app !== 'JCB ENGENHARIA' || metadata.commit !== expected.commit) {
  throw new Error('A publicação ainda não corresponde à versão enviada para a branch exclusiva da JCB.');
}
record.canonicalOrigin = new URL(origin).origin;
const result = await fetch(new URL('/.netlify/functions/issuer-admin', origin), {
  method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify(record),
});
if (result.status !== 201) throw new Error(`A gravação do registro não foi confirmada (${result.status}).`);
const verification = await fetch(new URL(`/api/verificar/${token}`, origin), { cache: 'no-store' });
const current = await verification.json();
if (!verification.ok || current.status !== 'active' || current.holderName !== record.holderName || current.validThrough !== record.validThrough) {
  throw new Error('A consulta pública ainda não confirmou os dados esperados.');
}
await writeFile('private/credential.json', JSON.stringify(record, null, 2) + '\n', { mode: 0o600 });
await writeFile('private/publication.json', JSON.stringify({ productionUrl: new URL(origin).origin,
  siteName: hostname.split('.')[0], verified: true, verifiedAt: new Date().toISOString(), verificationUrl: url }, null, 2) + '\n', { mode: 0o600 });
console.log('Registro confirmado no novo site. Execute npm run card para criar o QR definitivo.');
