const http = require('http');
const fs = require('fs');
const path = require('path');

const DIST = path.join(__dirname, 'dist');

const MIME = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.wasm': 'application/wasm',
};

const server = http.createServer((req, res) => {
  const urlPath = req.url.split('?')[0];
  const filePath = path.join(DIST, urlPath);
  const ext = path.extname(filePath);

  // Serve static asset if it has a known extension and exists
  if (ext && MIME[ext]) {
    fs.readFile(filePath, (err, content) => {
      if (!err) {
        res.writeHead(200, { 'Content-Type': MIME[ext], 'Cache-Control': 'no-cache' });
        res.end(content);
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });
    return;
  }

  // SPA fallback: serve index.html for all routes
  fs.readFile(path.join(DIST, 'index.html'), (err, content) => {
    if (err) { res.writeHead(500); res.end('Server error'); return; }
    res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-cache' });
    res.end(content);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
