'use strict';
// Loads the pure classic-script engines into a sandbox without a DOM.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const APP_ROOT = path.join(__dirname, '..', '..');

function loadEngines(files) {
  const sandbox = { console: console, Intl: Intl, Date: Date, Math: Math, JSON: JSON };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  files.forEach(function (rel) {
    const src = fs.readFileSync(path.join(APP_ROOT, rel), 'utf8');
    vm.runInContext(src, sandbox, { filename: rel });
  });
  return sandbox.FETROS;
}

module.exports = { loadEngines: loadEngines, APP_ROOT: APP_ROOT };
