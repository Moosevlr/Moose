// Play! exports its factory as an ES module. This bridge loads that factory
// in the main browser window; the original Play.js remains the pthread entry.
import createPlay from './Play.js';

if (typeof createPlay !== 'function') {
  throw new TypeError('The Play! module did not export its initialization function.');
}

window.Play = createPlay;
