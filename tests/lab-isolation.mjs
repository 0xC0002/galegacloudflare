import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, readdir } from 'node:fs/promises';
import { testOnlyEnvironment, LAB_PROJECT_ID, LAB_TEST_CLIENT_ID } from '../lib/lab-config.ts';
import { TEST_MERCHANT } from '../lib/ifood-config.ts';
import { snapshot, synchronize, normalizeOrder } from '../lib/ifood.ts';
import { receiptText } from '../lib/receipt.ts';

const require=createRequire(import.meta.url),{Miniflare}=createRequire(require.resolve('wrangler/package.json'))('miniflare');
const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2026-05-15',d1Databases:['DB']});
const DB=await mf.getD1Database('DB');
try {
 for(const file of (await readdir(new URL('../drizzle/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort())for(const sql of (await readFile(new URL('../drizzle/'+file,import.meta.url),'utf8')).split(';').filter(x=>x.trim()))await DB.prepare(sql).run();
 const env=testOnlyEnvironment({DB});
 assert.equal(env.IFOOD_ENVIRONMENT,'TEST');assert.equal(env.IFOOD_PRODUCTION_ENABLED,'false');assert.equal(env.IFOOD_MERCHANT_ID,TEST_MERCHANT);
 assert.equal(env.IFOOD_CLIENT_ID,undefined);assert.equal(env.IFOOD_CLIENT_SECRET,undefined);
 assert.equal(testOnlyEnvironment({IFOOD_CLIENT_ID:LAB_TEST_CLIENT_ID}).IFOOD_CLIENT_ID,LAB_TEST_CLIENT_ID);
 for(const override of [
  {IFOOD_ENVIRONMENT:'PRODUCTION'},
  {IFOOD_ENVIRONMENT:'production'},
  {IFOOD_PRODUCTION_ENABLED:'true'},
  {IFOOD_PRODUCTION_ENABLED:' TRUE '},
  {IFOOD_MERCHANT_ID:'a0c511e3-83b1-4054-855e-6835ac15cda5'},
  {IFOOD_MERCHANT_ID:'2b436d5a-a9ba-4e8c-b8dc-3d812021c126'},
  {IFOOD_ALLOWED_MERCHANT_IDS:TEST_MERCHANT+',a0c511e3-83b1-4054-855e-6835ac15cda5'},
  {IFOOD_CLIENT_ID:'b2beca58-4583-4030-9efa-d8418df7515d'},
 ])assert.throws(()=>testOnlyEnvironment({...env,...override}),/laboratório/);
 let requests=0;
 const current=await synchronize(env,async()=>{requests++;throw new Error('No external request permitted');});
 assert.equal(requests,0);assert.equal(current.configured,false);assert.equal(current.environment,'TEST');assert.deepEqual(current.merchantIds,[TEST_MERCHANT]);
 assert.deepEqual(current.orders,[]);assert.deepEqual(current.disputes,[]);assert.equal(current.pendingEvents,0);assert.equal(current.pendingErrors,0);
 assert.equal((await snapshot(env)).widgetId,null);
 console.log('PASS: fresh schema and empty database; no copied customer/order/chat/token data and zero iFood requests without credentials');

 const stamp=new Date().toISOString(),raw={id:'lab-fixture',displayId:'TESTE',isTest:true,merchant:{id:TEST_MERCHANT},category:'FOOD',createdAt:stamp,customer:{name:'FICTICIO'},items:[{name:'Coxinha',quantity:10}]};
 assert.match(receiptText(normalizeOrder(raw,stamp,env)),/TESTE - NAO ENTREGAR/);
 assert.throws(()=>normalizeOrder({...raw,isTest:false},stamp,env));
 const manifest=JSON.parse(await readFile(new URL('../.openai/hosting.json',import.meta.url),'utf8'));
 assert.equal(manifest.project_id,LAB_PROJECT_ID);assert.equal(manifest.d1,'DB');
 const webmanifest=JSON.parse(await readFile(new URL('../public/manifest.webmanifest',import.meta.url),'utf8'));
 assert.match(webmanifest.name,/TESTE/);assert.match(webmanifest.short_name,/TESTE/);
 const paths=await readdir(new URL('../app/api/',import.meta.url),{recursive:true});
 const routes=paths.filter(p=>p.endsWith('route.ts'));
 for(const path of routes){const source=await readFile(new URL('../app/api/'+path,import.meta.url),'utf8');assert.ok((source.includes('@/lib/lab-env')||source.includes('@/lib/lab-http')),path);assert.ok(!source.includes('from "cloudflare:workers"'),path);}
 assert.match(await readFile(new URL('../db/index.ts',import.meta.url),'utf8'),/@\/lib\/lab-env/);
 console.log('PASS: production stores/app rejected; all API routes and database entry use the test guard; project/PWA/receipt identify the isolated laboratory');
} finally { await mf.dispose(); }
