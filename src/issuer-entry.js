import './styles.css';
import './verification.css';
import { mountIssuerSetup } from './issuer-setup.js';

const cleanup = await mountIssuerSetup(document.querySelector('#issuer-app'));
window.addEventListener('pagehide', () => cleanup(), { once: true });
