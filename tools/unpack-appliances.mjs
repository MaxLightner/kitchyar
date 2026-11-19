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

// This second, checksum-protected bundle contains the user's latest revised
// hood, eleven sink designs, washer and dishwasher, and their new materials.
// It overrides only the files supplied by the user; the original package
// remains in the repository for previous projects and rollback.
const deltaB64 = [1,2,3,4,5,6,7].map(i =>
  readFileSync(resolve(root, 'vendor', `appliance-updates.part${i}.b64`), 'utf8').trim()).join('');
const deltaCompressed = Buffer.from(deltaB64, 'base64');
const deltaSha = createHash('sha256').update(deltaCompressed).digest('hex');
if (deltaSha !== '99ffa709521cb60a903aadc8e5077e8f8469182114cbaa1ec5e0333cde7db4a4')
  throw new Error('Updated appliance bundle failed integrity check.');
const deltaFiles = JSON.parse(brotliDecompressSync(deltaCompressed).toString('utf8'));
for (const [name, content] of Object.entries(deltaFiles)) {
  if (typeof content !== 'string' || !/^src\/(three|hoods)\/[A-Za-z0-9_./-]+\.ts$/.test(name) ||
      name.split('/').includes('..')) throw new Error('Unsafe appliance path: ' + name);
  const target = resolve(root, name);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}
console.log(`Updated ${Object.keys(deltaFiles).length} appliance sources from user ZIP.`);

