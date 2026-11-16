import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes, createHash } from 'node:crypto';
import { selectIssuerRecord } from '../src/issuer-record.js';
import { buildCredentialUrl } from '../src/credential-url.js';

const makeLink = process.argv.includes('--link');
if (makeLink) {
  const data = JSON.parse(await readFile('private/issuer-setup-data.json', 'utf8'));
  const publication = JSON.parse(await readFile('private/git-publication.json', 'utf8'));
  const payload = { origin: data.origin, key: data.key, record: data.record, token: data.token, commit: publication.commit };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const url = `${data.origin}/preparar-carteirinha/#${encoded}`;
  await writeFile('private/issuer-setup-link.json', JSON.stringify({ url, expiresAt: data.expiresAt,
    publicVerificationUrl: buildCredentialUrl(data.origin, data.token) }, null, 2) + '\n', { mode: 0o600 });
  console.log('Link privado de cadastro inicial preparado; nenhum dado ou chave publicado.');
} else {
  const origin = new URL(process.argv[2]).origin;
  const { token } = JSON.parse(await readFile('private/credential-token.json', 'utf8'));
  buildCredentialUrl(origin, token);
  if (origin !== 'https://jcb-engenharia.netlify.app') throw new Error('Use o novo endereço confirmado pelo responsável.');
  const record = selectIssuerRecord({ ...JSON.parse(await readFile('private/credential.json', 'utf8')), canonicalOrigin: origin });
  if (createHash('sha256').update(token).digest('hex') !== record.tokenSha256) throw new Error('Código e registro não correspondem.');
  const key = randomBytes(32).toString('base64url');
  const keyHash = createHash('sha256').update(key).digest('hex');
  const recordHash = createHash('sha256').update(JSON.stringify(record)).digest('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await writeFile('src/setup-trust.js', `// Digests for the approved initial record; no person data or bearer key.\nexport const SETUP_KEY_SHA256 = '${keyHash}';\nexport const SETUP_RECORD_SHA256 = '${recordHash}';\nexport const SETUP_EXPIRES_AT = '${expiresAt}';\n`);
  await writeFile('private/issuer-setup-data.json', JSON.stringify({ origin, key, record, token, expiresAt }, null, 2) + '\n', { mode: 0o600 });
  console.log('Cadastro inicial limitado ao registro aprovado, com expiração e sem permissão para alterar registros existentes.');
}
