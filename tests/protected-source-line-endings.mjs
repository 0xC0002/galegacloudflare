import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {protectedSourceHash} from '../scripts/protected-source-hash.mjs';

const manifest=JSON.parse(await readFile(new URL('./fixtures/ifood-protected-sha256.json',import.meta.url),'utf8'));
const first='app/api/disputes/[id]/evidence/[index]/route.ts';
const source=await readFile(new URL('../'+first,import.meta.url));
const windows=Buffer.from(source.toString('utf8').replace(/\r\n/g,'\n').replace(/\n/g,'\r\n'));
// Reproduce the exact hash reported from Bruno's Git for Windows checkout.
assert.equal(createHash('sha256').update(windows).digest('hex'),'143c69d68890c2e499775a722b2a499a5e6811abb7e5759954867b63ca982009');
assert.equal(protectedSourceHash(windows),manifest.sha256[first]);
assert.notEqual(protectedSourceHash(Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),source])),manifest.sha256[first]);
assert.notEqual(protectedSourceHash(Buffer.from('a\rb')),protectedSourceHash(Buffer.from('a\nb')));

const root=await mkdtemp(join(tmpdir(),'galega-source-check-'));
try{
 const files=[...Object.keys(manifest.sha256),'wrangler.jsonc','tests/fixtures/ifood-protected-sha256.json','scripts/check-cloudflare.mjs','scripts/protected-source-hash.mjs','lib/lab-http.ts','public/manifest.webmanifest'];
 for(const file of files){const path=join(root,file);await mkdir(dirname(path),{recursive:true});await writeFile(path,await readFile(new URL('../'+file,import.meta.url)));}
 const {checkCloudflareSource}=await import(pathToFileURL(join(root,'scripts/check-cloudflare.mjs')).href);
 await checkCloudflareSource();
 for(const file of files){const path=join(root,file);const text=(await readFile(path,'utf8')).replace(/\r\n/g,'\n');await writeFile(path,text.replace(/\n/g,'\r\n'));}
 await checkCloudflareSource();
 // A real edit must still fail, even when the entire project uses CRLF.
 const path=join(root,first),text=await readFile(path,'utf8');
 await writeFile(path,text.replace('export const dynamic="force-dynamic";','export const dynamic="force-static";'));
 await assert.rejects(()=>checkCloudflareSource(),/Fluxo protegido alterado:/);
}finally{await rm(root,{recursive:true,force:true});}
console.log('PASS: reproduced reported Windows hash; full source validation accepts all 30 approved files with LF or CRLF, and rejects real edits, BOM insertion and lone-CR substitutions; approved hashes unchanged');
