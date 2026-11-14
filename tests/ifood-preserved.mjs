import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {protectedSourceHash} from '../scripts/protected-source-hash.mjs';
const manifest=JSON.parse(await readFile(new URL('./fixtures/ifood-protected-sha256.json',import.meta.url),'utf8'));
for(const [file,expected] of Object.entries(manifest.sha256)){
 const bytes=await readFile(new URL('../'+file,import.meta.url));
 assert.equal(protectedSourceHash(bytes),expected,`Arquivo protegido iFood alterado: ${file}. Exige autorização específica e nova validação.`);
}
console.log(`PASS: ${Object.keys(manifest.sha256).length} protected iFood/API/receipt/RawBT/auth files match the approved baseline after LF/CRLF normalization; all other byte changes remain blocked`);
