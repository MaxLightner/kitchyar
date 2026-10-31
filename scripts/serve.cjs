const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../apps/preview');
const port = Number(process.env.PORT || 4173);
const types = {'.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8'};
http.createServer((req, res) => {
  const pathname = decodeURIComponent((req.url || '/').split('?')[0]);
  const filename = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!filename.startsWith(root + path.sep) || !types[path.extname(filename)]) {res.writeHead(404);res.end('Not found');return;}
  fs.readFile(filename, (err, data) => {
    if (err) {res.writeHead(404);res.end('Not found');return;}
    res.writeHead(200, {'content-type': types[path.extname(filename)], 'cache-control':'no-store'});res.end(data);
  });
}).listen(port, '127.0.0.1', () => console.log(`Kitchyar preview: http://127.0.0.1:${port}`));
