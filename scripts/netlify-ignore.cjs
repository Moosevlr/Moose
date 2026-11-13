// Never build JCB in the existing PS2 Netlify project, including branch deploys.
// Netlify's ignore command uses exit 0 to skip, and exit 1 to build.
const siteId = process.env.SITE_ID || process.env.NETLIFY_SITE_ID;
const emulatorSite = '05ca3e43-c532-49ad-9275-50efc3dc7068';
process.exit(!siteId || siteId === emulatorSite ? 0 : 1);
