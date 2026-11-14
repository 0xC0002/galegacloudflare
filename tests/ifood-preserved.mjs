import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const manifest=JSON.parse(await readFile(new URL('./fixtures/ifood-protected-sha256.json',import.meta.url),'utf8'));
for(const [file,expected] of Object.entries(manifest.sha256)){
 const bytes=await readFile(new URL('../'+file,import.meta.url));
 assert.equal(createHash('sha256').update(bytes).digest('hex'),expected,`Arquivo protegido iFood alterado: ${file}. Exige autorização específica e nova validação.`);
}
console.log(`PASS: ${Object.keys(manifest.sha256).length} protected iFood/API/receipt/RawBT/auth files are byte-identical to the approved laboratory baseline; Casa-only changes cannot silently replace them`);
