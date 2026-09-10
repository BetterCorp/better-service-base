// Run from the repo root after building: node plugins/nodejs/config-vault/scripts/preview-config-explorer.mjs
// Uses only synthetic data from the HTTP regression test; mutations are never sent to a real Vault.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import loginRoutes from '../tests/service-config-vault/login-routes.cjs';

(async () => {
  const pluginRoot = fileURLToPath(new URL('..', import.meta.url));
  const pages = new Map();
  const originalFetch = global.fetch;
  global.fetch = async (...args) => {
    const response = await originalFetch(...args);
    const url = new URL(args[0]);
    if (['/deployment', '/application-config', '/auth-blocks'].includes(url.pathname) && !pages.has(url.pathname) && response.status === 200) pages.set(url.pathname, await response.clone().text());
    return response;
  };
  try { await loginRoutes({ pluginRoot }); }
  finally { global.fetch = originalFetch; }
  const assetRoot = path.dirname(fileURLToPath(import.meta.resolve('anyvali')));
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (req.method !== 'GET') { res.writeHead(405).end('Preview only'); return; }
    if (pages.has(url.pathname)) { res.setHeader('Content-Type', 'text/html'); res.end(pages.get(url.pathname)); return; }
    let file;
    if (url.pathname === '/') file = path.join(pluginRoot, 'tests/config-explorer-browser.html');
    else if (url.pathname.startsWith('/assets/anyvali/')) {
      const relative = url.pathname.slice('/assets/anyvali/'.length);
      file = path.resolve(assetRoot, relative);
      if (!file.startsWith(assetRoot + path.sep)) { res.writeHead(404).end(); return; }
    }
    try {
      if (!file) { res.writeHead(404).end(); return; }
      res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : 'text/html');
      res.end(await fs.readFile(file));
    } catch { res.writeHead(404).end(); }
  });
  server.listen(4318, '127.0.0.1', () => console.log('Vault preview and browser checks: http://127.0.0.1:4318'));
})().catch((error) => { console.error(error); process.exitCode = 1; });
