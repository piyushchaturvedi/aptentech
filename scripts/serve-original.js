/**
 * Serves the original 25 HTML files over HTTP.
 *
 * Structural comparison has to run against the original pages *as a browser renders them*,
 * not as they sit on disk: they build most of their sections in JavaScript, so the file on
 * disk is missing exactly the parts most worth comparing. Serving them lets a real browser
 * execute that script, and the resulting DOM is the thing to diff against.
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const DIR = process.env.SOURCE_HTML_DIR || 'D:/Arpit/AptenTech';
const PORT = Number(process.env.ORIGINAL_PORT || 8080);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
};

const OUT = path.resolve(__dirname, '../.parity');
fs.mkdirSync(OUT, { recursive: true });

const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);

  /**
   * Receives a DOM signature captured in the browser and writes it to disk.
   *
   * The comparison needs signatures from two different origins (the original at :8080 and
   * the migrated site at :3000), and a page cannot read across origins. Posting each one
   * here as it is captured gives Node both halves to diff.
   */
  if (req.method === 'POST' && url === '/collect') {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 8e6) req.destroy(); });
    req.on('end', () => {
      try {
        const { name, signature } = JSON.parse(body);
        const safe = String(name).replace(/[^a-z0-9._-]/gi, '_');
        fs.writeFileSync(path.join(OUT, safe + '.json'), JSON.stringify(signature));
        res.writeHead(200, { 'access-control-allow-origin': '*', 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true, name: safe, count: signature.length }));
      } catch (e) {
        res.writeHead(400, { 'access-control-allow-origin': '*' }).end(String(e));
      }
    });
    return;
  }

  // The capture modules, served with CORS so the migrated site at :3000 can import them too.
  if (url === '/sig.js' || url === '/layout.js') {
    res.writeHead(200, {
      'content-type': 'text/javascript; charset=utf-8',
      'access-control-allow-origin': '*',
      'cache-control': 'no-store',
    });
    res.end(fs.readFileSync(path.join(__dirname, url.slice(1))));
    return;
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'POST, GET, OPTIONS',
      'access-control-allow-headers': 'content-type',
    }).end();
    return;
  }

  const name = url === '/' ? '/aptentech-homepage.html' : url;

  // Confine every request to the source directory.
  const target = path.join(DIR, path.normalize(name).replace(/^([/\\])+/, ''));
  if (!target.startsWith(path.resolve(DIR))) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  fs.readFile(target, (err, data) => {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(target)] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`Original HTML served from ${DIR} at http://localhost:${PORT}`);
});
