// Restore the exact TypeScript appliance models supplied with Kitchyar.
// The five text chunks form a Brotli-compressed JSON file-map. Using a compact
// source archive avoids checking in dozens of generated model files separately.
// Only src/three and src/hoods are restored. No network access is required.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { brotliDecompressSync } from 'node:zlib';
import { createHash } from 'node:crypto';
const root = resolve(import.meta.dirname, '..');
const text = [1,2,3,4,5].map(i =>
  readFileSync(resolve(root, 'vendor', `appliance-sources.part${i}.b64`), 'utf8').trim()).join('');
const compressed = Buffer.from(text, 'base64');
const digest = createHash('sha256').update(compressed).digest('hex');
const expected = '72b0e9e4f76a6e7ca2dfe4e9c81fdfa3e2b704f292e3043889bc424f8309de32';
if (digest !== expected) throw new Error('Appliance bundle checksum mismatch; refusing to build.');
const files = JSON.parse(brotliDecompressSync(compressed).toString('utf8'));
for (const [name, content] of Object.entries(files)) {
  if (typeof content !== 'string' || !/^src\/(three|hoods)\/[A-Za-z0-9_./-]+\.ts$/.test(name) ||
      name.split('/').includes('..')) throw new Error('Unsafe appliance source path: ' + name);
  const target = resolve(root, name);
  mkdirSync(dirname(target), { recursive:true });
  writeFileSync(target, content);
}
console.log(`Restored ${Object.keys(files).length} original appliance source files.`);
