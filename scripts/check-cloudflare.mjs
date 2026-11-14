import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
export const readCloudflareConfig=async()=>JSON.parse(await readFile(new URL('../wrangler.jsonc',import.meta.url),'utf8'));
export function validateCloudflareTarget(c,{remote=false}={}){
 assert.match(c.name,/^galega-casa-cloudflare-teste(?:-[a-f0-9]{6})?$/,'Use somente a cópia Cloudflare de teste.');
 assert.equal(c.main,'worker/cloudflare.ts');assert.equal(c.vars?.IFOOD_ENVIRONMENT,'TEST');assert.equal(c.vars?.IFOOD_PRODUCTION_ENABLED,'false');assert.equal(c.vars?.GALEGA_DEPLOYMENT,'CLOUDFLARE_TEST');
 for(const k of ['IFOOD_CLIENT_ID','IFOOD_CLIENT_SECRET','WHATSAPP_TEST_TO','WHATSAPP_CONFIG_KEY','AUTH_SECRET','SETUP_TOKEN'])assert.ok(!(k in (c.vars||{})),`Não grave ${k} na configuração pública.`);
 assert.equal(c.d1_databases?.length,1);assert.equal(c.d1_databases[0].binding,'DB');assert.equal(c.d1_databases[0].database_name,c.name);assert.equal(c.d1_databases[0].migrations_dir,'drizzle');
 assert.match(c.d1_databases[0].database_id,/^[a-f0-9-]{36}$/i);
 if(remote)assert.notEqual(c.d1_databases[0].database_id,'00000000-0000-4000-8000-000000000000','Crie o banco separado antes da publicação.');
 assert.ok(!c.routes&&!c.route&&!c.triggers,'O teste não pode trocar domínio nem habilitar outro receptor automaticamente.');assert.equal(c.workers_dev,true);
 return c;
}
export async function checkCloudflareSource(){
 const c=validateCloudflareTarget(await readCloudflareConfig());
 await assert.rejects(access(new URL('../.openai/hosting.json',import.meta.url)),'A cópia externa não deve apontar para um Site do ChatGPT.');
 const base=JSON.parse(await readFile(new URL('../tests/fixtures/ifood-protected-sha256.json',import.meta.url),'utf8'));
 for(const [file,sha] of Object.entries(base.sha256))assert.equal(createHash('sha256').update(await readFile(new URL('../'+file,import.meta.url))).digest('hex'),sha,`Fluxo protegido alterado: ${file}`);
 const bridge=await readFile(new URL('../lib/lab-http.ts',import.meta.url),'utf8');assert.ok(!bridge.includes('preview-owner')&&!bridge.includes('import.meta.env.DEV'),'A cópia independente não aceita identidade de desenvolvimento.');
 const manifest=JSON.parse(await readFile(new URL('../public/manifest.webmanifest',import.meta.url),'utf8'));assert.equal(manifest.id,'/galega-cloudflare-teste');
 return c;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){await checkCloudflareSource();console.log('PASS: isolated Cloudflare configuration, TEST-only empty-copy deployment, independent PWA, no ChatGPT Site binding/development identity and 30 unchanged protected files');}
