import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {LAB_PROJECT_ID} from '../lib/lab-config.ts';
const manifest=JSON.parse(await readFile(new URL('../public/manifest.webmanifest',import.meta.url),'utf8'));
assert.equal(manifest.display,'standalone');assert.equal(manifest.scope,'/');assert.equal(manifest.start_url,'/');
assert.equal(manifest.prefer_related_applications,false);
assert.deepEqual(manifest.shortcuts.map(s=>s.url),['/?tela=separacao','/?tela=balcao']);
for(const size of [192,512]){
 const icon=manifest.icons.find(i=>i.sizes===`${size}x${size}`);assert.ok(icon);
 assert.equal(icon.type,'image/png');
 const bytes=await readFile(new URL('../public'+icon.src,import.meta.url));
 assert.deepEqual([...bytes.subarray(0,8)],[137,80,78,71,13,10,26,10]);
 assert.equal(bytes.readUInt32BE(16),size);assert.equal(bytes.readUInt32BE(20),size);
 assert.equal(bytes[25],6,'retain transparent RGBA branding');
}
const layout=await readFile(new URL('../app/layout.tsx',import.meta.url),'utf8');
assert.match(layout,/rel="manifest" href="\/manifest.webmanifest" crossOrigin="use-credentials"/,'the private manifest uses the signed-in same-origin session');
const hosting=JSON.parse(await readFile(new URL('../.openai/hosting.json',import.meta.url),'utf8'));
assert.equal(hosting.project_id,LAB_PROJECT_ID);
console.log('PASS: standalone launch, same-origin entry/screens, real 192/512 transparent PNGs, authenticated manifest and isolated laboratory identity');
